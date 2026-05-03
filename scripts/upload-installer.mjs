import { Storage } from "@google-cloud/storage";
import fs from "node:fs";

const [, , filePath, destName] = process.argv;
if (!filePath || !destName) {
  console.error("usage: node upload-installer.mjs <localPath> <destName>");
  process.exit(1);
}

const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const publicSearch = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
if (!bucketId || !publicSearch) {
  console.error("Missing DEFAULT_OBJECT_STORAGE_BUCKET_ID / PUBLIC_OBJECT_SEARCH_PATHS");
  process.exit(1);
}

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

const bucket = storage.bucket(bucketId);
const publicPath = publicSearch.split(",")[0].trim();
const keyPrefix = publicPath.replace(`/${bucketId}/`, "").replace(/^\//, "");
const objectKey = `${keyPrefix}/installers/${destName}`;

const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
console.log(`Uploading ${filePath} (${sizeMB} MB) → gs://${bucketId}/${objectKey}`);

await bucket.upload(filePath, {
  destination: objectKey,
  metadata: {
    contentType: "application/octet-stream",
    cacheControl: "public, max-age=300",
  },
  resumable: true,
});

const [meta] = await bucket.file(objectKey).getMetadata();
console.log("Uploaded ✓");
console.log("  size:", meta.size);
console.log("  generation:", meta.generation);
console.log("  publicSearchKey:", `installers/${destName}`);
console.log("");
console.log("Set INSTALLER_URL_LINUX to:");
console.log(`  https://www.tcgsnipers.com/license/storage/public-objects/installers/${destName}`);
