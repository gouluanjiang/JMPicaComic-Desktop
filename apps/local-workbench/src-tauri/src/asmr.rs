//! Read-only ASMR catalog commands for the main window. Covers return as
//! `data:` URLs; no remote URL, path or account material reaches the renderer.

use crate::require_main;
use asmr_source::{
    AsmrCoverSize, AsmrError, AsmrIndexEntry, AsmrIndexKind, AsmrListQuery, AsmrPage, AsmrRelation,
    AsmrSource, AsmrWorkDetail,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{Runtime, State, WebviewWindow};

/// Circle and voice-actor lists are about half a megabyte each.
const INDEX_TTL: Duration = Duration::from_secs(30 * 60);
const POPULAR_PAGE_SIZE: u64 = 48;

type Indexes = HashMap<AsmrIndexKind, (Instant, Arc<Vec<AsmrIndexEntry>>)>;

#[derive(Default)]
pub(crate) struct DesktopAsmr {
    source: Mutex<Option<Arc<AsmrSource>>>,
    indexes: Mutex<Indexes>,
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
    state.source()?.work(id).await
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
