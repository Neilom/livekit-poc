import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { config } from "./config.js";

const httpUrl = config.livekit.url
  .replace("ws://", "http://")
  .replace("wss://", "https://");

const roomService = new RoomServiceClient(
  httpUrl,
  config.livekit.apiKey,
  config.livekit.apiSecret,
);

export async function createRoom(name: string): Promise<void> {
  await roomService.createRoom({ name, emptyTimeout: 300 });
}

export async function deleteRoom(name: string): Promise<void> {
  try {
    await roomService.deleteRoom(name);
  } catch {
    // room may already be gone
  }
}

export async function generateToken(
  roomName: string,
  participantIdentity: string,
): Promise<string> {
  const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: participantIdentity,
    ttl: "1h",
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  return await token.toJwt();
}
