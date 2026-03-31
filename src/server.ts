import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";

import { config } from "./config.js";
import { createRoom, deleteRoom, generateToken } from "./livekit-manager.js";
import { createBridge } from "./call-bridge.js";
import { initiateCall, terminateCall } from "./meta-api.js";
import { startRecording, stopRecording } from "./egress-manager.js";
import type {
  CallSession,
  StartCallResponse,
  AnswerCallResponse,
  TerminateCallResponse,
  CallStatusResponse,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.resolve(__dirname, "..", "public")));

// In-memory call sessions
const sessions = new Map<string, CallSession>();

// ---------- POST /call/start ----------
app.post("/call/start", async (req, res) => {
  try {
    const { to } = req.body as { to?: string };
    if (!to) {
      res.status(400).json({ error: "\"to\" (WhatsApp phone number) is required" });
      return;
    }

    const callId = uuid();
    const roomName = `call-${callId}`;

    await createRoom(roomName);

    const browserToken = await generateToken(roomName, "browser-agent");
    const { sdpOffer, handle } = await createBridge(roomName);

    console.log(`Initiating Meta call to ${to}...`);
    const metaCallId = await initiateCall(to, sdpOffer);
    console.log(`Meta call initiated: ${metaCallId}`);

    const session: CallSession = {
      callId,
      roomName,
      browserToken,
      sdpOffer,
      status: "waiting_answer",
      createdAt: new Date(),
      bridge: handle,
      metaCallId,
      to,
    };
    sessions.set(callId, session);

    const response: StartCallResponse = {
      callId,
      roomName,
      token: browserToken,
      sdpOffer,
      metaCallId,
    };

    res.json(response);
  } catch (err: any) {
    console.error("POST /call/start error:", err);
    res.status(500).json({ error: err.message ?? "Internal error" });
  }
});

// ---------- POST /call/:callId/answer ----------
app.post("/call/:callId/answer", async (req, res) => {
  try {
    const session = sessions.get(req.params.callId);
    if (!session) {
      res.status(404).json({ error: "Call not found" });
      return;
    }

    const { sdpAnswer } = req.body as { sdpAnswer?: string };
    if (!sdpAnswer) {
      res.status(400).json({ error: "sdpAnswer is required" });
      return;
    }

    await session.bridge!.applyAnswer(sdpAnswer);
    session.status = "active";

    // Start recording after call is connected
    try {
      const egressId = await startRecording(session.roomName, session.callId);
      if (egressId) session.egressId = egressId;
    } catch (e: any) {
      console.warn("Failed to start recording:", e.message);
    }

    const response: AnswerCallResponse = { status: "connected" };
    res.json(response);
  } catch (err: any) {
    console.error("POST /call/:callId/answer error:", err);
    res.status(500).json({ error: err.message ?? "Internal error" });
  }
});

// ---------- POST /call/:callId/terminate ----------
app.post("/call/:callId/terminate", async (req, res) => {
  try {
    const session = sessions.get(req.params.callId);
    if (!session) {
      res.status(404).json({ error: "Call not found" });
      return;
    }

    if (session.egressId) {
      try {
        await stopRecording(session.egressId);
      } catch (e: any) {
        console.warn("Stop recording failed:", e.message);
      }
    }

    if (session.metaCallId) {
      try {
        await terminateCall(session.metaCallId);
      } catch (e: any) {
        console.warn("Meta terminate failed:", e.message);
      }
    }

    await session.bridge!.terminate();
    session.status = "terminated";

    try {
      await deleteRoom(session.roomName);
    } catch { /* best effort */ }

    sessions.delete(req.params.callId);

    const response: TerminateCallResponse = { status: "terminated" };
    res.json(response);
  } catch (err: any) {
    console.error("POST /call/:callId/terminate error:", err);
    res.status(500).json({ error: err.message ?? "Internal error" });
  }
});

// ---------- GET /call/:callId/status ----------
app.get("/call/:callId/status", (req, res) => {
  const session = sessions.get(req.params.callId);
  if (!session) {
    res.status(404).json({ error: "Call not found" });
    return;
  }

  const bridgeStatus = session.bridge?.getStatus() ?? session.status;

  const response: CallStatusResponse = {
    callId: session.callId,
    status: bridgeStatus,
    roomName: session.roomName,
    createdAt: session.createdAt.toISOString(),
  };
  res.json(response);
});

// ---------- GET /config (for test page) ----------
app.get("/config", (_req, res) => {
  res.json({ livekitUrl: config.livekit.publicUrl });
});

// ---------- Start ----------
app.listen(config.port, () => {
  console.log(`voice-calling-service listening on http://localhost:${config.port}`);
  console.log(`LiveKit server: ${config.livekit.url}`);
  console.log(`Test page: http://localhost:${config.port}/`);
});
