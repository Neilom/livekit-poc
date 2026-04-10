import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from "livekit-server-sdk";
import { config } from "./config.js";

const httpUrl = config.livekit.url
  .replace("ws://", "http://")
  .replace("wss://", "https://");

const egressClient = new EgressClient(
  httpUrl,
  config.livekit.apiKey,
  config.livekit.apiSecret,
);

function isS3Configured(): boolean {
  return !!config.s3.bucket;
}

export async function startRecording(roomName: string, callId: string): Promise<string | null> {
  if (!isS3Configured()) {
    console.warn("[egress] S3 bucket not configured, skipping recording");
    return null;
  }

  const s3 = new S3Upload({
    region: config.s3.region,
    bucket: config.s3.bucket,
  });

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.OGG,
    filepath: `recordings/${callId}/{room_name}-{time}.ogg`,
    output: { case: "s3", value: s3 },
  });

  const info = await egressClient.startRoomCompositeEgress(roomName, output, {
    audioOnly: true,
  });

  console.log(`[egress] Recording started: ${info.egressId}`);
  return info.egressId;
}

export async function stopRecording(egressId: string): Promise<void> {
  try {
    await egressClient.stopEgress(egressId);
    console.log(`[egress] Recording stopped: ${egressId}`);
  } catch (err: any) {
    console.warn(`[egress] Stop recording failed: ${err.message}`);
  }
}
