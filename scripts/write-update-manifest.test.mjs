import test from "node:test";
import assert from "node:assert/strict";
import {
  RELEASE_BASE,
  buildUpdateManifest,
  signedFileName,
} from "./write-update-manifest.mjs";

const signature = (file) =>
  Buffer.from(
    `untrusted comment: signature from tauri secret key\nRUQ=\ntrusted comment: timestamp:1793950922\tfile:${file}\nwsy=\n`,
  ).toString("base64");

test("the manifest points both Windows keys at the signed release installer", () => {
  const manifest = buildUpdateManifest({
    version: "1.2.0",
    assetName: "MangaMonitor.Dev_1.2.0_x64-setup.exe",
    signature: signature("MangaMonitor Dev_1.2.0_x64-setup.exe") + "\n",
    notes: "\n# 1.2.0\n\n- 内置更新器\n",
    publishedAt: new Date("2026-11-20T04:05:06.789Z"),
  });
  const platform = {
    signature: signature("MangaMonitor Dev_1.2.0_x64-setup.exe"),
    url: `${RELEASE_BASE}/v1.2.0/MangaMonitor.Dev_1.2.0_x64-setup.exe`,
  };
  assert.deepEqual(manifest, {
    version: "1.2.0",
    notes: "# 1.2.0\n\n- 内置更新器",
    pub_date: "2026-11-20T04:05:06Z",
    platforms: { "windows-x86_64-nsis": platform, "windows-x86_64": platform },
  });
});

test("manifests the app would reject are never written", () => {
  const base = {
    version: "1.2.0",
    assetName: "MangaMonitor.Dev_1.2.0_x64-setup.exe",
    signature: signature("MangaMonitor Dev_1.2.0_x64-setup.exe"),
    notes: "",
  };
  for (const change of [
    { version: "v1.2.0" },
    { version: "1.2" },
    { assetName: "MangaMonitor.Dev_1.1.0_x64-setup.exe" },
    { assetName: "../MangaMonitor.Dev_1.2.0_x64-setup.exe" },
    { signature: signature("MangaMonitor Dev_1.1.0_x64-setup.exe") },
    {
      signature: Buffer.from("trusted comment: timestamp:1").toString("base64"),
    },
  ])
    assert.throws(() => buildUpdateManifest({ ...base, ...change }));
  assert.equal(
    signedFileName(signature("a_1.2.0_x64-setup.exe")),
    "a_1.2.0_x64-setup.exe",
  );
});
