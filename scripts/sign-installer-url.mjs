import { Storage } from "@google-cloud/storage";

const [, , objectKey, expiresDays = "7"] = process.argv;
if (!objectKey) {
  console.error("usage: node sign-installer-url.mjs <objectKey> [expiresDays]");
  process.exit(1);
}

const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const filename = objectKey.split("/").pop();

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: "http://127.0.0.1:1106/token",
    type: "external_account",
    credential_source: {
      url: "http://127.0.0.1:1106/credential",
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const [url] = await storage.bucket(bucketId).file(objectKey).getSignedUrl({
  version: "v4",
  action: "read",
  expires: Date.now() + Number(expiresDays) * 24 * 60 * 60 * 1000,
  responseDisposition: `attachment; filename="${filename}"`,
});
console.log(url);
