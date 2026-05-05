import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { copyFile } from "node:fs/promises";

const __require = createRequire(import.meta.url);
globalThis.require = __require;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "dist");

const sharedExternals = [
  "*.node",
  "electron",
  "sharp",
  "better-sqlite3",
  "sqlite3",
  "canvas",
  "bcrypt",
  "argon2",
  "fsevents",
  "re2",
  "farmhash",
  "xxhash-addon",
  "bufferutil",
  "utf-8-validate",
  "ssh2",
  "cpu-features",
  "dtrace-provider",
  "isolated-vm",
  "lightningcss",
  "pg-native",
  "oracledb",
  "mongodb-client-encryption",
  "nodemailer",
  "handlebars",
  "knex",
  "typeorm",
  "protobufjs",
  "onnxruntime-node",
  "@tensorflow/*",
  "@prisma/client",
  "@mikro-orm/*",
  "@grpc/*",
  "@swc/*",
  "@aws-sdk/*",
  "@azure/*",
  "@opentelemetry/*",
  "@google-cloud/*",
  "@google/*",
  "googleapis",
  "firebase-admin",
  "@parcel/watcher",
  "@sentry/profiling-node",
  "@tree-sitter/*",
  "aws-sdk",
  "classic-level",
  "dd-trace",
  "ffi-napi",
  "grpc",
  "hiredis",
  "kerberos",
  "leveldown",
  "miniflare",
  "mysql2",
  "newrelic",
  "odbc",
  "piscina",
  "realm",
  "ref-napi",
  "rocksdb",
  "sass-embedded",
  "sequelize",
  "serialport",
  "snappy",
  "tinypool",
  "usb",
  "workerd",
  "wrangler",
  "zeromq",
  "zeromq-prebuilt",
  "playwright",
  "puppeteer",
  "puppeteer-core",
];

// ── Bake Google OAuth credentials into the main-process bundle ────────────────
// In the packaged app there are no Replit environment variables, so we inject
// the credentials at build time via esbuild's `define`. The Google OAuth
// desktop client ID and secret are not truly secret for a distributed desktop
// app — they are visible in any OAuth flow and Google explicitly supports this
// model for installed applications (RFC 8252).
//
// CI: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET as repository
// secrets and expose them to the "electron:compile" step via `env:`.
const googleOAuthDefines = {
  "process.env.GOOGLE_OAUTH_CLIENT_ID": JSON.stringify(
    process.env.GOOGLE_OAUTH_CLIENT_ID ?? ""
  ),
  "process.env.GOOGLE_OAUTH_CLIENT_SECRET": JSON.stringify(
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? ""
  ),
};

const missingGoogleSecrets = [];
if (process.env.GOOGLE_OAUTH_CLIENT_ID) {
  console.log("✓ GOOGLE_OAUTH_CLIENT_ID will be baked into the bundle");
} else {
  missingGoogleSecrets.push("GOOGLE_OAUTH_CLIENT_ID");
}
if (process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
  console.log("✓ GOOGLE_OAUTH_CLIENT_SECRET will be baked into the bundle");
} else {
  missingGoogleSecrets.push("GOOGLE_OAUTH_CLIENT_SECRET");
}
if (missingGoogleSecrets.length > 0) {
  for (const name of missingGoogleSecrets) {
    console.error(
      `✗ ${name} is not set — packaged app will not support Google sign-in`
    );
  }
  console.error(
    "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET before building a " +
    "release. In CI, add them under Settings → Secrets → Actions in the GitHub repo."
  );
  process.exit(1);
}

// ── Bake Discord OAuth credentials into the main-process bundle ───────────────
// Same rationale as Google: desktop OAuth client credentials are not truly
// secret for distributed apps — Discord explicitly supports this model.
// CI: set DISCORD_OAUTH_CLIENT_ID and DISCORD_OAUTH_CLIENT_SECRET as repository
// secrets and expose them to the "electron:compile" step via `env:`.
const discordOAuthDefines = {
  "process.env.DISCORD_OAUTH_CLIENT_ID": JSON.stringify(
    process.env.DISCORD_OAUTH_CLIENT_ID ?? ""
  ),
  "process.env.DISCORD_OAUTH_CLIENT_SECRET": JSON.stringify(
    process.env.DISCORD_OAUTH_CLIENT_SECRET ?? ""
  ),
};

if (process.env.DISCORD_OAUTH_CLIENT_ID) {
  console.log("✓ DISCORD_OAUTH_CLIENT_ID will be baked into the bundle");
} else {
  console.warn(
    "⚠ DISCORD_OAUTH_CLIENT_ID is not set — packaged app will not support Discord notifications"
  );
}
if (process.env.DISCORD_OAUTH_CLIENT_SECRET) {
  console.log("✓ DISCORD_OAUTH_CLIENT_SECRET will be baked into the bundle");
} else {
  console.warn(
    "⚠ DISCORD_OAUTH_CLIENT_SECRET is not set — packaged app will not support Discord notifications"
  );
}

// ── Main process build (ESM with code-splitting for lazy imports) ─────────────
await build({
  entryPoints: [
    path.join(__dirname, "main.ts"),
  ],
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: sharedExternals,
  outdir: outDir,
  sourcemap: true,
  treeShaking: true,
  define: { ...googleOAuthDefines, ...discordOAuthDefines },
  plugins: [],
  banner: {
    js: [
      "import { createRequire as __crReq } from 'node:module';",
      "import __nodePath from 'node:path';",
      "import __nodeUrl from 'node:url';",
      "if (typeof globalThis.require === 'undefined') {",
      "  globalThis.require = __crReq(import.meta.url);",
      "}",
      "globalThis.__filename = __nodeUrl.fileURLToPath(import.meta.url);",
      "globalThis.__dirname = __nodePath.dirname(globalThis.__filename);",
    ].join("\n"),
  },
});

// ── Preload build (CommonJS, no splitting) ────────────────────────────────────
// Electron loads preload scripts using its own module system.  With
// "type":"module" in package.json every .js file is ESM, but Electron's
// preload loader has historically required CommonJS OR an explicit .mjs/.cjs
// extension.  Building as CJS and writing to preload.cjs sidesteps the issue
// entirely: .cjs is always CommonJS regardless of the package "type" field,
// and contextBridge.exposeInMainWorld works identically in CJS preloads.
await build({
  entryPoints: [
    path.join(__dirname, "preload.ts"),
  ],
  bundle: true,
  splitting: false,
  format: "cjs",
  platform: "node",
  target: "node22",
  external: sharedExternals,
  outfile: path.join(outDir, "preload.cjs"),
  sourcemap: true,
  treeShaking: true,
  plugins: [],
});

await copyPgliteAssets(outDir);
console.log("✓ Electron main process compiled");

async function copyPgliteAssets(destDir) {
  // PGlite resolves its WASM at runtime via:
  //   new URL("./postgres.wasm", import.meta.url)
  // After esbuild bundling, import.meta.url points to the chunk file in destDir,
  // so the WASM assets must be co-located there — esbuild can't auto-detect the
  // new URL() pattern inside PGlite's pre-built chunks.
  // electron/build.mjs is one level deeper than api-server/build.mjs so we
  // need three levels up to reach the workspace root, then into lib/db.
  const libDbReq = createRequire(
    path.resolve(__dirname, "../../../lib/db/src/index.ts"),
  );
  const pgliteMain = libDbReq.resolve("@electric-sql/pglite");
  const pgliteDist = path.dirname(pgliteMain);

  await Promise.all([
    copyFile(
      path.join(pgliteDist, "postgres.wasm"),
      path.join(destDir, "postgres.wasm"),
    ),
    copyFile(
      path.join(pgliteDist, "postgres.data"),
      path.join(destDir, "postgres.data"),
    ),
  ]);
  console.log("✓ PGlite WASM assets copied to electron/dist/");
}
