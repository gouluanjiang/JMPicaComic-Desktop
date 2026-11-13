//! ASMR catalog and account commands for the main window, and the media
//! protocol that streams audio and video for online playback. Covers return
//! as `data:` URLs and media is addressed by work and file id, so no remote
//! URL or path reaches the renderer. Signing in keeps the session token in
//! the operating system's credential store; the renderer only ever learns
//! the account name.

use crate::require_main;
use asmr_source::{
    AsmrByteRange, AsmrCoverSize, AsmrError, AsmrIndexEntry, AsmrIndexKind, AsmrListQuery,
    AsmrMedia, AsmrMediaChunk, AsmrPage, AsmrPlaylistPage, AsmrProgress, AsmrRelation, AsmrSource,
    AsmrWorkDetail,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{
    http::{header, Method, Request, Response, StatusCode},
    Manager, Runtime, State, UriSchemeContext, UriSchemeResponder, WebviewWindow,
};
use zeroize::Zeroizing;

/// Circle and voice-actor lists are about half a megabyte each.
const INDEX_TTL: Duration = Duration::from_secs(30 * 60);
const POPULAR_PAGE_SIZE: u64 = 48;
/// Stream addresses carry a date, so they are read again after this long or
/// when the media host refuses one.
const MEDIA_TTL: Duration = Duration::from_secs(60 * 60);
const MEDIA_WORKS: usize = 32;

/// Media URLs are `http://asmrmedia.localhost/<work>-<file>` on Windows and
/// `asmrmedia://localhost/<work>-<file>` elsewhere.
pub(crate) const MEDIA_SCHEME: &str = "asmrmedia";

const PLAYLIST_PAGE_SIZE: u64 = 48;
const MAX_SESSION_BYTES: usize = 2400;

/// Where the session survives a restart: the Windows credential store. Tests
/// and other platforms keep it for the run only and never touch the real one.
#[derive(Default)]
struct SessionStore {
    #[cfg(any(test, not(windows)))]
    memory: Mutex<Option<Vec<u8>>>,
}

#[cfg(all(windows, not(test)))]
impl SessionStore {
    fn load(&self) -> Option<Zeroizing<Vec<u8>>> {
        workbench_credentials::WindowsAsmrSession::new()
            .load()
            .ok()
            .flatten()
    }

    fn save(&self, blob: &[u8]) -> bool {
        workbench_credentials::WindowsAsmrSession::new()
            .save(blob)
            .is_ok()
    }

    fn delete(&self) {
        let _ = workbench_credentials::WindowsAsmrSession::new().delete();
    }
}

#[cfg(any(test, not(windows)))]
impl SessionStore {
    fn load(&self) -> Option<Zeroizing<Vec<u8>>> {
        self.memory.lock().ok()?.clone().map(Zeroizing::new)
    }

    fn save(&self, blob: &[u8]) -> bool {
        self.memory
            .lock()
            .map(|mut memory| *memory = Some(blob.to_vec()))
            .is_ok()
    }

    fn delete(&self) {
        if let Ok(mut memory) = self.memory.lock() {
            *memory = None;
        }
    }
}

/// `{"version":1,"name":...,"token":...}`.
pub(crate) fn encode_session(name: &str, token: &str) -> Option<Zeroizing<Vec<u8>>> {
    let bytes = Zeroizing::new(
        serde_json::to_vec(&serde_json::json!({"version": 1, "name": name, "token": token}))
            .ok()?,
    );
    (bytes.len() <= MAX_SESSION_BYTES).then_some(bytes)
}

pub(crate) fn decode_session(bytes: &[u8]) -> Option<(String, Zeroizing<String>)> {
    let value: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    if value["version"].as_u64() != Some(1) {
        return None;
    }
    let name = value["name"].as_str()?;
    let token = value["token"].as_str()?;
    let named =
        !name.is_empty() && name.chars().count() <= 64 && !name.chars().any(char::is_control);
    (named && asmr_source::is_token(token))
        .then(|| (name.to_owned(), Zeroizing::new(token.to_owned())))
}

type Indexes = HashMap<AsmrIndexKind, (Instant, Arc<Vec<AsmrIndexEntry>>)>;
type MediaFiles = HashMap<u64, AsmrMedia>;

#[derive(Default)]
pub(crate) struct DesktopAsmr {
    source: Mutex<Option<Arc<AsmrSource>>>,
    indexes: Mutex<Indexes>,
    media: Mutex<HashMap<u64, (Instant, Arc<MediaFiles>)>>,
    store: SessionStore,
    /// The signed-in account's name. The token lives in the source.
    account: Mutex<Option<String>>,
}

impl DesktopAsmr {
    fn source(&self) -> Result<Arc<AsmrSource>, AsmrError> {
        let mut source = self.source.lock().map_err(|_| unavailable())?;
        if let Some(source) = source.as_ref() {
            return Ok(Arc::clone(source));
        }
        let created = Arc::new(AsmrSource::new()?);
        // A stored session is picked up once, without asking the site.
        if let Some(blob) = self.store.load() {
            match decode_session(&blob) {
                Some((name, token)) if created.set_token(Some(token.to_string())).is_ok() => {
                    if let Ok(mut account) = self.account.lock() {
                        *account = Some(name);
                    }
                }
                _ => self.store.delete(),
            }
        }
        *source = Some(Arc::clone(&created));
        Ok(created)
    }

    fn summary(&self, remembered: bool) -> Result<AsmrAccount, AsmrError> {
        let name = self.account.lock().map_err(|_| unavailable())?.clone();
        Ok(AsmrAccount {
            signed_in: name.is_some(),
            name,
            remembered,
        })
    }

    fn sign_out(&self) -> Result<(), AsmrError> {
        self.store.delete();
        self.source()?.set_token(None)?;
        *self.account.lock().map_err(|_| unavailable())? = None;
        Ok(())
    }

    /// A token the site no longer accepts is forgotten, so the next request
    /// goes out signed out and the listener is asked to sign in again.
    fn settle<T>(&self, result: Result<T, AsmrError>) -> Result<T, AsmrError> {
        if matches!(&result, Err(error) if error.code == "ASMR_LOGIN_EXPIRED") {
            let _ = self.sign_out();
        }
        result
    }

    /// Keeps the stream addresses of the most recently read works.
    fn remember(&self, work_id: u64, media: &[AsmrMedia]) {
        let Ok(mut cache) = self.media.lock() else {
            return;
        };
        if cache.len() >= MEDIA_WORKS && !cache.contains_key(&work_id) {
            let oldest = cache
                .iter()
                .min_by_key(|(_, (read, _))| *read)
                .map(|(id, _)| *id);
            if let Some(oldest) = oldest {
                cache.remove(&oldest);
            }
        }
        let files = media
            .iter()
            .map(|entry| (entry.file_id, entry.clone()))
            .collect();
        cache.insert(work_id, (Instant::now(), Arc::new(files)));
    }

    async fn media_file(
        &self,
        work_id: u64,
        file_id: u64,
        refresh: bool,
    ) -> Result<AsmrMedia, AsmrError> {
        if !refresh {
            let cached = self
                .media
                .lock()
                .map_err(|_| unavailable())?
                .get(&work_id)
                .filter(|(read, _)| read.elapsed() < MEDIA_TTL)
                .map(|(_, files)| Arc::clone(files));
            if let Some(files) = cached {
                return files.get(&file_id).cloned().ok_or(not_found());
            }
        }
        let detail = self.source()?.work(work_id).await?;
        self.remember(work_id, &detail.media);
        detail
            .media
            .into_iter()
            .find(|entry| entry.file_id == file_id)
            .ok_or(not_found())
    }

    /// Runs a media read, and once more with fresh addresses when the host
    /// refuses or no longer has the dated address.
    async fn with_media<T, F, Fut>(
        &self,
        work_id: u64,
        file_id: u64,
        read: F,
    ) -> Result<T, AsmrError>
    where
        F: Fn(Arc<AsmrSource>, AsmrMedia) -> Fut,
        Fut: std::future::Future<Output = Result<T, AsmrError>>,
    {
        if work_id == 0 || file_id == 0 {
            return Err(AsmrError {
                code: "ASMR_INVALID_INPUT",
            });
        }
        let source = self.source()?;
        let media = self.media_file(work_id, file_id, false).await?;
        match read(Arc::clone(&source), media).await {
            Err(error) if matches!(error.code, "ASMR_REFUSED" | "ASMR_NOT_FOUND") => {
                let media = self.media_file(work_id, file_id, true).await?;
                read(source, media).await
            }
            other => other,
        }
    }
}

fn not_found() -> AsmrError {
    AsmrError {
        code: "ASMR_NOT_FOUND",
    }
}

fn signed_out() -> AsmrError {
    AsmrError {
        code: "ASMR_SIGNED_OUT",
    }
}

fn unavailable() -> AsmrError {
    AsmrError {
        code: "ASMR_UNAVAILABLE",
    }
}

fn main_window<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), AsmrError> {
    require_main(window.label()).map_err(|_| AsmrError { code: "FORBIDDEN" })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AsmrAccount {
    signed_in: bool,
    name: Option<String>,
    /// False when the session could not be stored and lasts for this run only.
    remembered: bool,
}

#[tauri::command]
pub(crate) async fn asmr_account<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
) -> Result<AsmrAccount, AsmrError> {
    main_window(&window)?;
    state.source()?;
    state.summary(true)
}

#[tauri::command]
pub(crate) async fn asmr_login<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    name: String,
    password: String,
) -> Result<AsmrAccount, AsmrError> {
    main_window(&window)?;
    let password = Zeroizing::new(password);
    let source = state.source()?;
    let session = source.login(&name, &password).await?;
    let token = Zeroizing::new(session.token);
    let remembered =
        encode_session(&session.name, &token).is_some_and(|blob| state.store.save(&blob));
    source.set_token(Some(token.to_string()))?;
    *state.account.lock().map_err(|_| unavailable())? = Some(session.name);
    state.summary(remembered)
}

#[tauri::command]
pub(crate) async fn asmr_logout<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
) -> Result<AsmrAccount, AsmrError> {
    main_window(&window)?;
    state.sign_out()?;
    state.summary(true)
}

/// Works the listener marked or rated, optionally one mark only.
#[tauri::command]
pub(crate) async fn asmr_reviews<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    progress: Option<AsmrProgress>,
    ascending: bool,
    page: u64,
) -> Result<AsmrPage, AsmrError> {
    main_window(&window)?;
    let source = state.source()?;
    if !source.signed_in() {
        return Err(signed_out());
    }
    state.settle(source.reviews(progress, ascending, page).await)
}

#[tauri::command]
pub(crate) async fn asmr_playlists<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    page: u64,
) -> Result<AsmrPlaylistPage, AsmrError> {
    main_window(&window)?;
    let source = state.source()?;
    if !source.signed_in() {
        return Err(signed_out());
    }
    state.settle(source.playlists(page).await)
}

#[tauri::command]
pub(crate) async fn asmr_playlist_works<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    id: String,
    page: u64,
) -> Result<AsmrPage, AsmrError> {
    main_window(&window)?;
    let source = state.source()?;
    if !source.signed_in() {
        return Err(signed_out());
    }
    state.settle(source.playlist_works(&id, page, PLAYLIST_PAGE_SIZE).await)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AsmrCover {
    id: u64,
    data_url: Option<String>,
}

#[tauri::command]
pub(crate) async fn asmr_works<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    query: AsmrListQuery,
) -> Result<AsmrPage, AsmrError> {
    main_window(&window)?;
    state.settle(state.source()?.works(query).await)
}

#[tauri::command]
pub(crate) async fn asmr_popular<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    page: u64,
    subtitle_only: bool,
) -> Result<AsmrPage, AsmrError> {
    main_window(&window)?;
    state.settle(
        state
            .source()?
            .popular(page, POPULAR_PAGE_SIZE, subtitle_only)
            .await,
    )
}

#[tauri::command]
pub(crate) async fn asmr_search<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    keyword: String,
    query: AsmrListQuery,
) -> Result<AsmrPage, AsmrError> {
    main_window(&window)?;
    state.settle(state.source()?.search(&keyword, query).await)
}

#[tauri::command]
pub(crate) async fn asmr_related<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    relation: AsmrRelation,
    id: String,
    query: AsmrListQuery,
) -> Result<AsmrPage, AsmrError> {
    main_window(&window)?;
    state.settle(state.source()?.related(relation, &id, query).await)
}

#[tauri::command]
pub(crate) async fn asmr_index<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    kind: AsmrIndexKind,
) -> Result<Vec<AsmrIndexEntry>, AsmrError> {
    main_window(&window)?;
    let cached = state
        .indexes
        .lock()
        .map_err(|_| unavailable())?
        .get(&kind)
        .filter(|(fetched, _)| fetched.elapsed() < INDEX_TTL)
        .map(|(_, entries)| Arc::clone(entries));
    if let Some(entries) = cached {
        return Ok(entries.as_ref().clone());
    }
    let entries = Arc::new(state.source()?.index(kind).await?);
    state
        .indexes
        .lock()
        .map_err(|_| unavailable())?
        .insert(kind, (Instant::now(), Arc::clone(&entries)));
    Ok(entries.as_ref().clone())
}

#[tauri::command]
pub(crate) async fn asmr_work<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    id: u64,
) -> Result<AsmrWorkDetail, AsmrError> {
    main_window(&window)?;
    let detail = state.settle(state.source()?.work(id).await)?;
    state.remember(id, &detail.media);
    Ok(detail)
}

/// A subtitle file of a work as text.
#[tauri::command]
pub(crate) async fn asmr_subtitle<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    work_id: u64,
    file_id: u64,
) -> Result<String, AsmrError> {
    main_window(&window)?;
    state
        .with_media(work_id, file_id, |source, media| async move {
            source.subtitle(&media).await
        })
        .await
}

/// `/<work>-<file>` with decimal ids.
pub(crate) fn media_path(path: &str) -> Option<(u64, u64)> {
    let (work, file) = path.strip_prefix('/')?.split_once('-')?;
    let id = |value: &str| {
        let digits =
            !value.is_empty() && value.len() <= 19 && value.bytes().all(|b| b.is_ascii_digit());
        if !digits {
            return None;
        }
        value.parse::<u64>().ok().filter(|id| *id > 0)
    };
    Some((id(work)?, id(file)?))
}

fn status_only(status: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    response
}

pub(crate) fn media_response(result: Result<AsmrMediaChunk, AsmrError>) -> Response<Vec<u8>> {
    let chunk = match result {
        Ok(chunk) => chunk,
        Err(error) => {
            return status_only(match error.code {
                "ASMR_INVALID_INPUT" => StatusCode::BAD_REQUEST,
                "ASMR_NOT_FOUND" => StatusCode::NOT_FOUND,
                "ASMR_REFUSED" | "FORBIDDEN" => StatusCode::FORBIDDEN,
                "ASMR_RANGE_INVALID" | "ASMR_RANGE_UNSUPPORTED" => {
                    StatusCode::RANGE_NOT_SATISFIABLE
                }
                "ASMR_RATE_LIMITED" => StatusCode::TOO_MANY_REQUESTS,
                _ => StatusCode::BAD_GATEWAY,
            })
        }
    };
    let total = chunk
        .total
        .map_or_else(|| "*".to_owned(), |total| total.to_string());
    Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header(header::CONTENT_TYPE, chunk.content_type)
        .header(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{total}", chunk.start, chunk.end),
        )
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-store")
        .body(chunk.bytes)
        .unwrap_or_else(|_| status_only(StatusCode::INTERNAL_SERVER_ERROR))
}

/// Serves pieces of audio and video files to the main window only. Each
/// request fetches at most one chunk; the media element asks for the rest.
pub(crate) fn media_protocol<R: Runtime>(
    context: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    if require_main(context.webview_label()).is_err() || request.method() != Method::GET {
        return responder.respond(status_only(StatusCode::FORBIDDEN));
    }
    let Some((work_id, file_id)) = media_path(request.uri().path()) else {
        return responder.respond(status_only(StatusCode::NOT_FOUND));
    };
    let range = match request
        .headers()
        .get(header::RANGE)
        .map(|value| value.to_str())
    {
        None => AsmrByteRange::parse(None),
        Some(Ok(value)) => AsmrByteRange::parse(Some(value)),
        Some(Err(_)) => Err(AsmrError {
            code: "ASMR_RANGE_INVALID",
        }),
    };
    let Ok(range) = range else {
        return responder.respond(status_only(StatusCode::RANGE_NOT_SATISFIABLE));
    };
    let state = Arc::clone(context.app_handle().state::<Arc<DesktopAsmr>>().inner());
    tauri::async_runtime::spawn(async move {
        let result = state
            .with_media(work_id, file_id, |source, media| async move {
                source.media(&media, range).await
            })
            .await;
        responder.respond(media_response(result));
    });
}

#[tauri::command]
pub(crate) async fn asmr_cover<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    id: u64,
    size: AsmrCoverSize,
) -> Result<AsmrCover, AsmrError> {
    main_window(&window)?;
    let data_url = state.source()?.cover(id, size).await?;
    Ok(AsmrCover { id, data_url })
}
