# In-app updater: release steps

The desktop app checks
`https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/latest/download/latest.json`
at startup (unless the user turned that off) and from "设置 → 网络与诊断 → 软件更新".
It installs only after the user confirms a specific version.

## What the app enforces

- The installer's minisign signature must verify against the public key in
  `apps/local-workbench/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
- The signature's trusted comment, which the signature covers, must name a file
  ending in `_<announced version>_x64-setup.exe`. A manifest cannot pair a new
  version number with an older signed installer.
- The version must be newer than the running one (the plugin's default comparison).
- Installing is refused while a download is running or queued. Once the final
  check passes, the queue stays locked until the process exits.
- Only `workbench_update_check` and `workbench_update_install` are granted to the
  main window. The plugin's own commands, which accept renderer-chosen endpoints,
  are not.
- In GitHub Actions, checks return `UPDATE_DISABLED_IN_CI` without network access.
- On Windows, installing starts the NSIS installer in passive mode with `/UPDATE`
  and exits the app. The installer reopens the app when it finishes.

## Signing key

- Private key: `%USERPROFILE%\.jmpicacomic-release\updater.key`. It was generated
  on 2026-11-06 without a password. It never goes into the repository, CI secrets
  or logs.
- Public key: `updater.key.pub` in the same folder. Its contents are the `pubkey`
  in `tauri.conf.json`.
- **Back up the private key offline.** If it is lost, installed copies can never
  accept another in-app update. Users would have to install one release manually,
  and that release would carry a new public key.
- If the key leaks, publish a release with a new public key, ask users to install
  it manually, and stop signing with the old key.

## Per-release steps

These are added to the existing flow (release CI, artifact verification, draft,
user approval, publish):

1. Download and verify the candidate artifact as before. Use its
   `MangaMonitor Dev_<version>_x64-setup.exe`.
2. Sign that file outside the repository:

   ```
   pnpm --dir apps/local-workbench exec tauri signer sign -f "%USERPROFILE%\.jmpicacomic-release\updater.key" -p "" "<release dir>\MangaMonitor.Dev_<version>_x64-setup.exe"
   ```

   This writes `<installer>.sig` next to it. Signing does not change the
   installer bytes, so its SHA-256 stays the one CI recorded.
3. Write the manifest. Notes come from the release notes file:

   ```
   node scripts/write-update-manifest.mjs --version <version> --installer "<release dir>\MangaMonitor.Dev_<version>_x64-setup.exe" --signature "<release dir>\MangaMonitor.Dev_<version>_x64-setup.exe.sig" --notes docs/RELEASE_NOTES_<version>.md --out "<release dir>\latest.json"
   ```

   The script refuses a version, file name or signature the app would reject.
4. Upload `latest.json` and the installer under the exact name used in step 3, and
   add `latest.json` to `SHA256SUMS.txt`. The `.sig` file is optional: its contents
   are already in `latest.json`.
5. After publishing, check that `releases/latest/download/latest.json` resolves to
   the new manifest.

## First release with the updater

A version installed before the updater existed cannot update itself. Users
install the first updater release manually. Real update testing needs that
release installed plus a later release published with `latest.json`. Until then,
a check finds no newer version, or reports that no update information was found.
