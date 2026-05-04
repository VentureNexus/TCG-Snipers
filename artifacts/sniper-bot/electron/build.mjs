import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { copyFile } from "node:fs/promises";

const __require = createRequire(import.meta.url);
globalThis.require = __require;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "dist");

await build({
  entryPoints: [
    path.join(__dirname, "main.ts"),
    path.join(__dirname, "preload.ts"),
  ],
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  // Mirror the api-server's externals list so the same packages that can't be
  // bundled there are also excluded here. Packages already in sniper-bot's
  // production node_modules (electron-updater, etc.) are fine to leave external.
  external: [
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
  ],
  outdir: outDir,
  sourcemap: true,
  treeShaking: true,
  // esbuild-plugin-pino is intentionally omitted: the packaged Electron app
  // always runs in production mode (NODE_ENV=production) so pino never spins
  // up pino-pretty worker threads — synchronous stdout logging is used instead.
  // If pino-pretty workers are ever needed (electron:dev), add the plugin back
  // after installing pino as a dev dependency in this package.
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
