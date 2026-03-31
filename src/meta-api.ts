import { config } from "./config.js";

interface MetaInitiateCallResponse {
  messaging_product: string;
  calls: { id: string }[];
}

export async function initiateCall(
  to: string,
  sdpOffer: string,
): Promise<string> {
  const url = `${config.meta.apiUrl}/${config.meta.phoneNumberId}/calls`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.meta.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      action: "connect",
      session: {
        sdp_type: "offer",
        sdp: sdpOffer,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body}`);
  }

  const data = (await res.json()) as MetaInitiateCallResponse;
  const metaCallId = data.calls?.[0]?.id;

  if (!metaCallId) {
    throw new Error("Meta API did not return a call ID");
  }

  return metaCallId;
}

export async function terminateCall(metaCallId: string): Promise<void> {
  const url = `${config.meta.apiUrl}/${config.meta.phoneNumberId}/calls`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.meta.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      call_id: metaCallId,
      action: "terminate",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta terminate API ${res.status}: ${body}`);
  }

  console.log(`[meta] Call ${metaCallId} terminated`);
}
