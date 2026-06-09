import { S3Client } from "@aws-sdk/client-s3";

const s3ClientConfig: any = {
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
};

// If using Supabase Storage S3-compatible API or Cloudflare R2, we need an endpoint override
if (process.env.AWS_S3_ENDPOINT) {
  s3ClientConfig.endpoint = process.env.AWS_S3_ENDPOINT;
  // Path-style routing is required for Supabase and some other custom S3 endpoints
  s3ClientConfig.forcePathStyle = true;
}

export const s3 = new S3Client(s3ClientConfig);
export const bucketName = process.env.AWS_S3_BUCKET_NAME || "";
// Force hot-reload after region update to ap-southeast-1

