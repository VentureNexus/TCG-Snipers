import { Storage } from "@google-cloud/storage";

const [, , objectKey] = process.argv;
if (!objectKey) {
  console.error("usage: node make-installer-public.mjs <objectKey>");
  process.exit(1);
}

const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;

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

const file = storage.bucket(bucketId).file(objectKey);

try {
  await file.makePublic();
  console.log("makePublic OK");
} catch (e) {
  console.log("makePublic failed:", e.message);
  console.log("trying bucket-level IAM grant for allUsers:objectViewer on the prefix...");
  try {
    const bucket = storage.bucket(bucketId);
    const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
    policy.bindings.push({
      role: "roles/storage.objectViewer",
      members: ["allUsers"],
      condition: {
        title: "public-installers-only",
        expression: `resource.name.startsWith("projects/_/buckets/${bucketId}/objects/public/installers/")`,
      },
    });
    policy.version = 3;
    await bucket.iam.setPolicy(policy);
    console.log("IAM bind OK");
  } catch (e2) {
    console.log("IAM bind failed:", e2.message);
  }
}

console.log(`Public URL (if successful): https://storage.googleapis.com/${bucketId}/${objectKey}`);
