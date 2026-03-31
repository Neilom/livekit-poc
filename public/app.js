/* global LivekitClient */

const $ = (sel) => document.querySelector(sel);

const ui = {
  btnStart: $("#btnStart"),
  btnMute: $("#btnMute"),
  btnTerminate: $("#btnTerminate"),
  btnAnswer: $("#btnAnswer"),
  inputTo: $("#inputTo"),
  sdpOffer: $("#sdpOffer"),
  sdpAnswer: $("#sdpAnswer"),
  log: $("#log"),
  dotLivekit: $("#dotLivekit"),
  dotMeta: $("#dotMeta"),
  dotCall: $("#dotCall"),
  dotMic: $("#dotMic"),
  statusLivekit: $("#statusLivekit"),
  statusMeta: $("#statusMeta"),
  statusCall: $("#statusCall"),
  statusMic: $("#statusMic"),
};

let callId = null;
let room = null;
let localTrackPub = null;
let muted = false;

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML = `<span class="ts">[${ts}]</span> ${msg}`;
  ui.log.appendChild(line);
  ui.log.scrollTop = ui.log.scrollHeight;
}

function setDot(dot, color) {
  dot.className = "dot " + color;
}

function setStatus(el, dot, text, color) {
  el.textContent = text;
  setDot(dot, color);
}

function setCallControls(started) {
  ui.btnStart.disabled = started;
  ui.btnMute.disabled = !started;
  ui.btnTerminate.disabled = !started;
  ui.btnAnswer.disabled = !started;
}

async function fetchJSON(url, opts) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ----- Start Call -----
ui.btnStart.addEventListener("click", async () => {
  try {
    const to = ui.inputTo.value.trim();
    if (!to) {
      log("Enter a WhatsApp phone number first");
      return;
    }

    ui.btnStart.disabled = true;
    log(`Starting call to ${to}...`);

    const data = await fetchJSON("/call/start", {
      method: "POST",
      body: JSON.stringify({ to }),
    });
    callId = data.callId;
    ui.sdpOffer.value = data.sdpOffer;

    setStatus(ui.statusCall, ui.dotCall, "waiting_answer", "yellow");
    setStatus(ui.statusMeta, ui.dotMeta, "offer sent to Meta", "yellow");
    log(`Call created: ${callId}`);
    log(`Meta call ID: ${data.metaCallId}`);
    log(`Room: ${data.roomName}`);

    setCallControls(true);

    // Connect browser to LiveKit room
    const cfg = await fetchJSON("/config");
    room = new LivekitClient.Room();

    room.on(LivekitClient.RoomEvent.Connected, () => {
      setStatus(ui.statusLivekit, ui.dotLivekit, "connected", "green");
      log("LiveKit connected");
    });

    room.on(LivekitClient.RoomEvent.Disconnected, () => {
      setStatus(ui.statusLivekit, ui.dotLivekit, "disconnected", "red");
      log("LiveKit disconnected");
    });

    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (track.kind === "audio") {
        const el = track.attach();
        el.id = "remote-audio";
        document.body.appendChild(el);
        log(`Subscribed to audio from ${participant.identity}`);
      }
    });

    await room.connect(cfg.livekitUrl, data.token);

    // Publish mic
    const localTrack = await LivekitClient.createLocalAudioTrack();
    localTrackPub = await room.localParticipant.publishTrack(localTrack);
    setStatus(ui.statusMic, ui.dotMic, "on", "green");
    log("Mic published");
  } catch (err) {
    log(`Error: ${err.message}`);
    ui.btnStart.disabled = false;
  }
});

// ----- Apply SDP Answer -----
ui.btnAnswer.addEventListener("click", async () => {
  const sdpAnswer = ui.sdpAnswer.value.trim();
  if (!sdpAnswer) {
    log("Paste the SDP answer first");
    return;
  }
  try {
    ui.btnAnswer.disabled = true;
    log("Applying SDP answer...");

    await fetchJSON(`/call/${callId}/answer`, {
      method: "POST",
      body: JSON.stringify({ sdpAnswer }),
    });

    setStatus(ui.statusMeta, ui.dotMeta, "connected", "green");
    setStatus(ui.statusCall, ui.dotCall, "active", "green");
    log("SDP answer applied — bridge active!");
  } catch (err) {
    log(`Error: ${err.message}`);
    ui.btnAnswer.disabled = false;
  }
});

// ----- Mute / Unmute -----
ui.btnMute.addEventListener("click", () => {
  if (!localTrackPub) return;
  muted = !muted;

  if (muted) {
    localTrackPub.mute();
    setStatus(ui.statusMic, ui.dotMic, "muted", "yellow");
    ui.btnMute.textContent = "Unmute";
  } else {
    localTrackPub.unmute();
    setStatus(ui.statusMic, ui.dotMic, "on", "green");
    ui.btnMute.textContent = "Mute";
  }
  log(muted ? "Mic muted" : "Mic unmuted");
});

// ----- Terminate -----
ui.btnTerminate.addEventListener("click", async () => {
  try {
    log("Terminating call...");
    await fetchJSON(`/call/${callId}/terminate`, { method: "POST" });
    log("Call terminated");
  } catch (err) {
    log(`Terminate error: ${err.message}`);
  }

  // Cleanup
  const remoteAudio = document.getElementById("remote-audio");
  if (remoteAudio) remoteAudio.remove();

  if (room) {
    await room.disconnect();
    room = null;
  }

  callId = null;
  localTrackPub = null;
  muted = false;

  setStatus(ui.statusLivekit, ui.dotLivekit, "disconnected", "");
  setStatus(ui.statusMeta, ui.dotMeta, "idle", "");
  setStatus(ui.statusCall, ui.dotCall, "none", "");
  setStatus(ui.statusMic, ui.dotMic, "off", "");

  ui.sdpOffer.value = "";
  ui.sdpAnswer.value = "";
  ui.btnMute.textContent = "Mute";
  setCallControls(false);
});
