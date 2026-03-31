import {
  Room,
  AudioSource,
  AudioStream,
  AudioFrame,
  LocalAudioTrack,
  RemoteAudioTrack,
  TrackPublishOptions,
} from "@livekit/rtc-node";
import {
  RTCPeerConnection,
  MediaStreamTrack as WeriftTrack,
  RTCRtpCodecParameters,
  RtpPacket,
  RtpHeader,
} from "werift";
import Opus from "@discordjs/opus";
const { OpusEncoder } = Opus;

import { config } from "./config.js";
import { generateToken } from "./livekit-manager.js";
import type { CallBridgeHandle, CallStatus } from "./types.js";

const SAMPLE_RATE = 48_000;
const CHANNELS = 1;
const FRAME_SIZE_MS = 20;

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 10_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      console.warn("[bridge] ICE gathering timed out, proceeding with partial candidates");
      resolve();
    }, timeoutMs);

    pc.iceGatheringStateChange.subscribe((state) => {
      console.log(`[bridge] ICE gathering state: ${state}`);
      if (state === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/**
 * Normalize SDP that may come with literal "\r\n" escape sequences
 * (from JSON webhook payloads) into actual CRLF line endings.
 */
function normalizeSdp(sdp: string): string {
  // Replace literal \r\n (two chars) with actual CRLF
  let normalized = sdp.replace(/\\r\\n/g, "\r\n");
  // Ensure lines end with CRLF (some SDPs use just \n)
  normalized = normalized.replace(/\r?\n/g, "\r\n");
  // Ensure trailing CRLF
  if (!normalized.endsWith("\r\n")) {
    normalized += "\r\n";
  }
  return normalized;
}

export async function createBridge(roomName: string): Promise<{
  sdpOffer: string;
  handle: CallBridgeHandle;
}> {
  const bridgeToken = await generateToken(roomName, "bridge-agent");

  // --- LiveKit side ---
  const room = new Room();
  const audioSource = new AudioSource(SAMPLE_RATE, CHANNELS);
  const localTrack = LocalAudioTrack.createAudioTrack("bridge-audio", audioSource);

  await room.connect(config.livekit.url, bridgeToken, { autoSubscribe: true, dynacast: false });
  await room.localParticipant!.publishTrack(localTrack, new TrackPublishOptions());
  console.log("[bridge] Connected to LiveKit room as bridge-agent");

  // --- Opus codec for PCM <-> Opus conversion ---
  const opusDecoder = new OpusEncoder(SAMPLE_RATE, CHANNELS);
  const opusEncoder = new OpusEncoder(SAMPLE_RATE, CHANNELS);

  // --- Werift (Meta) side ---
  const pc = new RTCPeerConnection({
    codecs: {
      audio: [
        new RTCRtpCodecParameters({
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
          payloadType: 111,
        }),
      ],
    },
  });

  // State change logging
  pc.connectionStateChange.subscribe((state) => {
    console.log(`[bridge] WebRTC connection state: ${state}`);
  });
  pc.iceConnectionStateChange.subscribe((state) => {
    console.log(`[bridge] ICE connection state: ${state}`);
  });
  pc.signalingStateChange.subscribe((state) => {
    console.log(`[bridge] Signaling state: ${state}`);
  });

  const metaSendTrack = new WeriftTrack({ kind: "audio" });
  const transceiver = pc.addTransceiver(metaSendTrack, { direction: "sendrecv" });

  // Meta -> LiveKit: receive RTP from Meta, decode Opus to PCM, push to LiveKit AudioSource
  let metaPacketsReceived = 0;
  transceiver.onTrack.subscribe((track) => {
    console.log("[bridge] Meta track received (inbound audio)");
    track.onReceiveRtp.subscribe((rtpPacket) => {
      try {
        metaPacketsReceived++;
        const pcmBuf = opusDecoder.decode(Buffer.from(rtpPacket.payload));
        const samplesPerChannel = pcmBuf.length / 2 / CHANNELS;
        if (metaPacketsReceived === 1) {
          console.log(`[bridge] Meta->LK first decode: ${samplesPerChannel} samples, ${pcmBuf.length} bytes`);
        }
        if (metaPacketsReceived % 500 === 1) {
          console.log(`[bridge] Meta->LK: ${metaPacketsReceived} RTP packets received`);
        }
        const pcmInt16 = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, pcmBuf.length / 2);
        const frame = new AudioFrame(pcmInt16, SAMPLE_RATE, CHANNELS, samplesPerChannel);
        audioSource.captureFrame(frame);
      } catch (err) {
        console.error("[bridge] Meta->LK decode error:", err);
      }
    });
  });

  // LiveKit -> Meta: subscribe to browser-agent audio, encode PCM to Opus, send RTP to Meta
  let rtpSeqNum = Math.floor(Math.random() * 0xffff);
  let rtpTimestamp = Math.floor(Math.random() * 0xffffffff);
  const ssrc = transceiver.sender.ssrc;
  let lkPacketsSent = 0;

  room.on("trackSubscribed", (track, _pub, participant) => {
    if (participant.identity !== "browser-agent") return;
    if (!(track instanceof RemoteAudioTrack)) return;

    console.log("[bridge] Subscribed to browser-agent audio track");
    const stream = new AudioStream(track, {
      sampleRate: SAMPLE_RATE,
      numChannels: CHANNELS,
      frameSizeMs: FRAME_SIZE_MS,
    });
    const reader = stream.getReader();

    let firstFrame = true;

    (async () => {
      while (true) {
        const { value: frame, done } = await reader.read();
        if (done) break;

        if (firstFrame) {
          console.log(`[bridge] LK->Meta first frame: ${frame.samplesPerChannel} samples/ch, ${frame.sampleRate}Hz, ${frame.channels}ch`);
          firstFrame = false;
        }

        try {
          const pcmBuf = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
          const opusBuf = opusEncoder.encode(pcmBuf);

          const header = new RtpHeader({
            payloadType: 111,
            sequenceNumber: rtpSeqNum++ & 0xffff,
            timestamp: rtpTimestamp & 0xffffffff,
            ssrc,
            marker: false,
          });
          rtpTimestamp += frame.samplesPerChannel;

          const pkt = new RtpPacket(header, opusBuf);
          metaSendTrack.writeRtp(pkt);

          lkPacketsSent++;
          if (lkPacketsSent % 500 === 1) {
            console.log(`[bridge] LK->Meta: ${lkPacketsSent} RTP packets sent`);
          }
        } catch (err) {
          console.error("[bridge] LK->Meta encode error:", err);
        }
      }
    })();
  });

  // Generate SDP offer and wait for ICE gathering
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.log("[bridge] Waiting for ICE gathering to complete...");
  await waitForIceGathering(pc);

  // Use the local description AFTER ICE gathering (contains candidates)
  const finalSdp = pc.localDescription!.sdp;
  console.log(`[bridge] SDP offer ready (${finalSdp.length} chars)`);

  let status: CallStatus = "waiting_answer";

  const handle: CallBridgeHandle = {
    async applyAnswer(sdpAnswer: string) {
      status = "connecting";
      const normalized = normalizeSdp(sdpAnswer);
      console.log("[bridge] Applying SDP answer...");
      console.log(`[bridge] SDP answer first 200 chars: ${normalized.substring(0, 200)}`);
      await pc.setRemoteDescription({ type: "answer", sdp: normalized });
      console.log("[bridge] SDP answer applied, waiting for ICE/DTLS...");
      status = "active";
    },

    async terminate() {
      status = "terminated";
      try {
        await pc.close();
      } catch { /* ignore */ }
      try {
        await localTrack.close();
      } catch { /* ignore */ }
      try {
        await audioSource.close();
      } catch { /* ignore */ }
      try {
        await room.disconnect();
      } catch { /* ignore */ }
      console.log("[bridge] Terminated");
    },

    getStatus() {
      return status;
    },
  };

  return { sdpOffer: finalSdp, handle };
}
