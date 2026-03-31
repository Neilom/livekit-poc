import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env["PORT"] ?? "3000", 10),

  livekit: {
    url: required("LIVEKIT_URL"),
    apiKey: required("LIVEKIT_API_KEY"),
    apiSecret: required("LIVEKIT_API_SECRET"),
    publicUrl: process.env["LIVEKIT_PUBLIC_URL"] ?? process.env["LIVEKIT_URL"]!,
  },

  meta: {
    accessToken: required("META_ACCESS_TOKEN"),
    phoneNumberId: required("META_PHONE_NUMBER_ID"),
    apiUrl: process.env["META_API_URL"] ?? "https://graph.facebook.com/v22.0",
  },

  s3: {
    accessKey: process.env["S3_ACCESS_KEY"] ?? "",
    secret: process.env["S3_SECRET"] ?? "",
    region: process.env["S3_REGION"] ?? "us-east-1",
    bucket: process.env["S3_BUCKET"] ?? "",
  },
} as const;
