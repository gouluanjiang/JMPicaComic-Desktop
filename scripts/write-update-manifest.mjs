// Writes the `latest.json` the in-app updater reads from the latest GitHub release.
//
// Usage, after signing the verified installer outside the repository:
//   node scripts/write-update-manifest.mjs --version 1.2.0 \
//     --installer "MangaMonitor.Dev_1.2.0_x64-setup.exe" \
//     --signature "MangaMonitor.Dev_1.2.0_x64-setup.exe.sig" \
//     --notes docs/RELEASE_NOTES_1.2.0.md --out latest.json
//
// The app accepts an update only when the signed file name carries the
// announced version, so this refuses to write a manifest that would fail there.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_BASE =
  "https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download";
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const NOTES_LIMIT = 8000;

function fail(message) {
  throw new Error(message);
}

export function signedFileName(signature) {
  let text;
  try {
    text = Buffer.from(signature.trim(), "base64").toString("utf8");
  } catch {
    fail("Signature is not base64.");
  }
  const comment = text
    .split(/\r?\n/)
    .find((line) => line.startsWith("trusted comment: "));
  const file = comment
    ?.slice("trusted comment: ".length)
    .split("\t")
    .find((field) => field.startsWith("file:"));
  return file
    ? file.slice("file:".length)
    : fail("Signature has no signed file name.");
}

export function buildUpdateManifest({
  version,
  assetName,
  signature,
  notes,
  publishedAt = new Date(),
}) {
  if (!semver.test(version)) fail(`Invalid version: ${version}`);
  const suffix = `_${version}_x64-setup.exe`;
  if (!assetName.endsWith(suffix) || /[\\/]/.test(assetName))
    fail(`Installer asset must be a file name ending in ${suffix}.`);
  if (!signedFileName(signature).endsWith(suffix))
    fail(`Signature was not made for a ${suffix} installer.`);
  const platform = {
    signature: signature.trim(),
    url: `${RELEASE_BASE}/v${version}/${encodeURIComponent(assetName)}`,
  };
  return {
    version,
    notes: notes.trim().slice(0, NOTES_LIMIT),
    pub_date: publishedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms: {
      "windows-x86_64-nsis": platform,
      "windows-x86_64": platform,
    },
  };
}

function argument(args, name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1]
    ? args[index + 1]
    : fail(`Missing --${name}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const manifest = buildUpdateManifest({
    version: argument(args, "version"),
    assetName: path.basename(argument(args, "installer")),
    signature: readFileSync(argument(args, "signature"), "utf8"),
    notes: readFileSync(argument(args, "notes"), "utf8"),
  });
  writeFileSync(
    argument(args, "out"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(`Wrote update manifest for ${manifest.version}.`);
}
