export type CallStatus = "creating" | "waiting_answer" | "connecting" | "active" | "terminated" | "error";

export interface CallSession {
  callId: string;
  roomName: string;
  browserToken: string;
  sdpOffer: string;
  status: CallStatus;
  createdAt: Date;
  bridge: CallBridgeHandle | null;
  metaCallId?: string;
  to?: string;
  egressId?: string;
}

export interface CallBridgeHandle {
  applyAnswer(sdpAnswer: string): Promise<void>;
  terminate(): Promise<void>;
  getStatus(): CallStatus;
}

export interface StartCallResponse {
  callId: string;
  roomName: string;
  token: string;
  sdpOffer: string;
  metaCallId: string;
}

export interface AnswerCallResponse {
  status: "connected";
}

export interface TerminateCallResponse {
  status: "terminated";
}

export interface CallStatusResponse {
  callId: string;
  status: CallStatus;
  roomName: string;
  createdAt: string;
}
