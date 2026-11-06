//! In-app updates from the signed GitHub release manifest.
//!
//! Checking only reads the manifest. Installing needs an explicit request for
//! the exact version the user saw, a verified signature whose signed file name
//! carries that version, and an idle download queue. On Windows a successful
//! install starts the NSIS installer and exits this process.

use crate::{downloads::DesktopDownloads, require_main};
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Runtime, State, WebviewWindow};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};
use workbench_storage::StoreError;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const NOTES_LIMIT: usize = 8_000;

#[derive(Default)]
pub(crate) struct DesktopUpdater {
    pending: Mutex<Option<Update>>,
    installing: Arc<AtomicBool>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateCheck {
    available: bool,
    current_version: String,
    version: Option<String>,
    notes: Option<String>,
    /// Unix seconds of the manifest's publication date.
    published_at: Option<i64>,
}

fn error(code: &'static str) -> StoreError {
    StoreError { code }
}

fn check_error(error: &UpdaterError) -> StoreError {
    match error {
        UpdaterError::ReleaseNotFound
        | UpdaterError::TargetNotFound(_)
        | UpdaterError::TargetsNotFound(_)
        | UpdaterError::Serialization(_)
        | UpdaterError::Semver(_) => self::error("UPDATE_UNAVAILABLE"),
        UpdaterError::Reqwest(_) | UpdaterError::Network(_) | UpdaterError::Http(_) => {
            self::error("UPDATE_NETWORK")
        }
        _ => self::error("UPDATE_CHECK_FAILED"),
    }
}

fn download_error(error: &UpdaterError) -> StoreError {
    match error {
        UpdaterError::Minisign(_)
        | UpdaterError::Base64(_)
        | UpdaterError::SignatureUtf8(_)
        | UpdaterError::SignedVersionMismatch { .. }
        | UpdaterError::MissingSignedVersion => self::error("UPDATE_SIGNATURE_INVALID"),
        _ => self::error("UPDATE_DOWNLOAD_FAILED"),
    }
}

fn truncate_notes(notes: String) -> String {
    match notes.char_indices().nth(NOTES_LIMIT) {
        Some((end, _)) => notes[..end].to_string(),
        None => notes,
    }
}

/// Minisign's global signature covers the trusted comment, so after the plugin
/// has verified a download this comment is authentic. The Tauri CLI records the
/// signed file name there; release installers are named `..._<version>_x64-setup.exe`.
/// Requiring it stops an altered manifest from pairing a new version number
/// with an older, genuinely signed installer.
pub(crate) fn signed_for_version(signature: &str, version: &str) -> bool {
    use base64::Engine as _;
    let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(signature.trim()) else {
        return false;
    };
    let Ok(text) = std::str::from_utf8(&decoded) else {
        return false;
    };
    let expected = format!("_{version}_x64-setup.exe");
    text.lines()
        .filter_map(|line| line.strip_prefix("trusted comment: "))
        .flat_map(|comment| comment.split('\t'))
        .filter_map(|field| field.strip_prefix("file:"))
        .any(|file| file.ends_with(&expected))
}

/// CI runs the packaged app for smoke tests; those must not contact GitHub.
/// Installing needs a version from a check, so this also keeps CI from installing.
fn network_allowed() -> Result<(), StoreError> {
    if std::env::var("GITHUB_ACTIONS").is_ok_and(|value| value.eq_ignore_ascii_case("true")) {
        Err(error("UPDATE_DISABLED_IN_CI"))
    } else {
        Ok(())
    }
}

/// Clears the in-progress flag on every exit path except a successful
/// Windows install, which never returns.
struct InstallFlag(Arc<AtomicBool>);

impl Drop for InstallFlag {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub(crate) async fn workbench_update_check<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopUpdater>>,
) -> Result<UpdateCheck, StoreError> {
    require_main(window.label())?;
    network_allowed()?;
    let updater = app
        .updater_builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| error("UPDATE_UNAVAILABLE"))?;
    let result = updater.check().await.map_err(|error| check_error(&error))?;
    let mut pending = state
        .pending
        .lock()
        .map_err(|_| error("UPDATE_UNAVAILABLE"))?;
    Ok(match result {
        None => {
            *pending = None;
            UpdateCheck {
                available: false,
                current_version: env!("CARGO_PKG_VERSION").to_string(),
                version: None,
                notes: None,
                published_at: None,
            }
        }
        Some(update) => {
            let check = UpdateCheck {
                available: true,
                current_version: update.current_version.clone(),
                version: Some(update.version.clone()),
                notes: update.body.clone().map(truncate_notes),
                published_at: update.date.map(|date| date.unix_timestamp()),
            };
            *pending = Some(update);
            check
        }
    })
}

#[tauri::command]
pub(crate) async fn workbench_update_install<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopUpdater>>,
    downloads: State<'_, Arc<DesktopDownloads>>,
    version: String,
) -> Result<(), StoreError> {
    require_main(window.label())?;
    if state.installing.swap(true, Ordering::AcqRel) {
        return Err(error("UPDATE_IN_PROGRESS"));
    }
    let _flag = InstallFlag(Arc::clone(&state.installing));
    let update = state
        .pending
        .lock()
        .map_err(|_| error("UPDATE_UNAVAILABLE"))?
        .clone()
        .filter(|update| update.version == version)
        .ok_or_else(|| error("UPDATE_STALE"))?;
    // Fail early when the queue is busy, then hold exclusivity from the final
    // check until the process exits so no download can start in between.
    drop(
        downloads
            .try_update_guard()
            .map_err(|_| error("UPDATE_DOWNLOADS_ACTIVE"))?,
    );
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|error| download_error(&error))?;
    if !signed_for_version(&update.signature, &update.version) {
        return Err(error("UPDATE_SIGNATURE_INVALID"));
    }
    let guard = downloads
        .try_update_guard()
        .map_err(|_| error("UPDATE_DOWNLOADS_ACTIVE"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        update.install(bytes)
    })
    .await
    .map_err(|_| error("UPDATE_INSTALL_FAILED"))?
    .map_err(|_| error("UPDATE_INSTALL_FAILED"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signature(comment: &str) -> String {
        use base64::Engine as _;
        base64::engine::general_purpose::STANDARD.encode(format!(
            "untrusted comment: signature from tauri secret key\nRUQ=\ntrusted comment: {comment}\nwsy=\n"
        ))
    }

    #[test]
    fn signed_file_name_must_carry_the_announced_version() {
        let signed = signature("timestamp:1793950922\tfile:MangaMonitor Dev_1.2.0_x64-setup.exe");
        assert!(signed_for_version(&signed, "1.2.0"));
        assert!(!signed_for_version(&signed, "1.2.1"));
        assert!(!signed_for_version(&signed, "1.2"));
        let renamed = signature("timestamp:1\tfile:MangaMonitor.Dev_1.2.0_x64-setup.exe");
        assert!(signed_for_version(&renamed, "1.2.0"));
    }

    #[test]
    fn signatures_without_a_matching_signed_file_are_rejected() {
        assert!(!signed_for_version("not base64", "1.2.0"));
        assert!(!signed_for_version(&signature("timestamp:1"), "1.2.0"));
        // An untrusted comment is not covered by the signature.
        use base64::Engine as _;
        let untrusted = base64::engine::general_purpose::STANDARD
            .encode("untrusted comment: file:x_1.2.0_x64-setup.exe\nRUQ=\n");
        assert!(!signed_for_version(&untrusted, "1.2.0"));
        let other = signature("timestamp:1\tfile:MangaMonitor Dev_1.1.0_x64-setup.exe");
        assert!(!signed_for_version(&other, "1.2.0"));
    }

    #[test]
    fn long_notes_are_cut_on_a_character_boundary() {
        let notes = "新".repeat(NOTES_LIMIT + 5);
        assert_eq!(truncate_notes(notes).chars().count(), NOTES_LIMIT);
        assert_eq!(truncate_notes("短".into()), "短");
    }
}
