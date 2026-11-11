//! Read-only ASMR catalog commands for the main window, and the media
//! protocol that streams audio and video for online playback. Covers return
//! as `data:` URLs and media is addressed by work and file id, so no remote
//! URL, path or account material reaches the renderer.

use crate::require_main;
use asmr_source::{
    AsmrByteRange, AsmrCoverSize, AsmrError, AsmrIndexEntry, AsmrIndexKind, AsmrListQuery,
    AsmrMedia, AsmrMediaChunk, AsmrPage, AsmrRelation, AsmrSource, AsmrWorkDetail,
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

type Indexes = HashMap<AsmrIndexKind, (Instant, Arc<Vec<AsmrIndexEntry>>)>;
type MediaFiles = HashMap<u64, AsmrMedia>;

#[derive(Default)]
pub(crate) struct DesktopAsmr {
    source: Mutex<Option<Arc<AsmrSource>>>,
    indexes: Mutex<Indexes>,
    media: Mutex<HashMap<u64, (Instant, Arc<MediaFiles>)>>,
}

impl DesktopAsmr {
    fn source(&self) -> Result<Arc<AsmrSource>, AsmrError> {
        let mut source = self.source.lock().map_err(|_| unavailable())?;
        if let Some(source) = source.as_ref() {
            return Ok(Arc::clone(source));
        }
        let created = Arc::new(AsmrSource::new()?);
        *source = Some(Arc::clone(&created));
        Ok(created)
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
    state.source()?.works(query).await
}

#[tauri::command]
pub(crate) async fn asmr_popular<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    page: u64,
    subtitle_only: bool,
) -> Result<AsmrPage, AsmrError> {
    main_window(&window)?;
    state
        .source()?
        .popular(page, POPULAR_PAGE_SIZE, subtitle_only)
        .await
}

#[tauri::command]
pub(crate) async fn asmr_search<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopAsmr>>,
    keyword: String,
    query: AsmrListQuery,
) -> Result<AsmrPage, AsmrError> {
    main_window(&window)?;
    state.source()?.search(&keyword, query).await
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
    state.source()?.related(relation, &id, query).await
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
    let detail = state.source()?.work(id).await?;
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
