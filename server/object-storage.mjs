import { createReadStream } from "node:fs";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client;

export function objectStorageEnabled() {
  return Boolean(process.env.S3_BUCKET);
}

function getClient() {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true"
    });
  }
  return client;
}

export async function uploadObject(key, filePath, contentType) {
  if (!objectStorageEnabled()) return null;
  await getClient().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: createReadStream(filePath),
    ContentType: contentType,
    ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION || undefined
  }));
  return key;
}

export async function getObject(key) {
  if (!objectStorageEnabled()) return null;
  return getClient().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
}
