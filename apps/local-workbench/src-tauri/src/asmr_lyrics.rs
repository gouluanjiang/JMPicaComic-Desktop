//! The desktop subtitle window: a small transparent, always-on-top window that
//! shows the current ASMR subtitle line anywhere on the desktop, like desktop
//! lyrics in music players. It only receives text from the main window; it can
//! read the latest line, move itself and close itself, nothing else.

use crate::trusted_navigation;
use asmr_source::AsmrError;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    Window, WindowEvent,
};

pub(crate) const LYRICS_LABEL: &str = "asmr-lyrics";
const LINE_EVENT: &str = "asmr-lyrics-line";
const PLACEMENT_EVENT: &str = "asmr-lyrics-placement";
const CLOSED_EVENT: &str = "asmr-lyrics-closed";
const MAX_TEXT: usize = 1000;
const MAX_TITLE: usize = 500;
const DEFAULT_WIDTH: f64 = 760.0;
const DEFAULT_HEIGHT: f64 = 120.0;
const MIN_WIDTH: f64 = 240.0;
const MIN_HEIGHT: f64 = 56.0;
const MAX_SIDE: f64 = 8000.0;
/// At least this much of a saved window must be on a screen to reuse it.
const VISIBLE_PART: f64 = 40.0;

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LyricsLine {
    text: String,
    title: String,
}

#[derive(Default)]
pub(crate) struct DesktopLyrics {
    line: Mutex<LyricsLine>,
}

/// Logical pixels on the virtual desktop.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LyricsPlacement {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A logical rectangle, used for monitor work areas.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Area {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

fn forbidden() -> AsmrError {
    AsmrError { code: "FORBIDDEN" }
}

fn unavailable() -> AsmrError {
    AsmrError {
        code: "ASMR_LYRICS_UNAVAILABLE",
    }
}

/// Keeps line breaks, drops other control characters, caps the length.
pub(crate) fn clean(value: &str, limit: usize) -> String {
    value
        .chars()
        .filter(|character| *character == '\n' || !character.is_control())
        .take(limit)
        .collect()
}

/// A saved placement is reused only when it has a sane size and enough of it
/// is on one of the current screens; otherwise the window could be lost.
pub(crate) fn fits(placement: &LyricsPlacement, areas: &[Area]) -> bool {
    let LyricsPlacement {
        x,
        y,
        width,
        height,
    } = *placement;
    let finite = [x, y, width, height].iter().all(|value| value.is_finite());
    let sized =
        (MIN_WIDTH..=MAX_SIDE).contains(&width) && (MIN_HEIGHT..=MAX_SIDE).contains(&height);
    finite
        && sized
        && areas.iter().any(|area| {
            let overlap_x = (x + width).min(area.x + area.width) - x.max(area.x);
            let overlap_y = (y + height).min(area.y + area.height) - y.max(area.y);
            overlap_x >= VISIBLE_PART && overlap_y >= VISIBLE_PART.min(height)
        })
}

/// Centered near the bottom of a work area.
pub(crate) fn default_placement(area: Area) -> LyricsPlacement {
    let width = DEFAULT_WIDTH.min(area.width.max(MIN_WIDTH));
    LyricsPlacement {
        x: area.x + (area.width - width) / 2.0,
        y: area.y + area.height - DEFAULT_HEIGHT - 80.0,
        width,
        height: DEFAULT_HEIGHT,
    }
}

fn work_areas<R: Runtime>(app: &AppHandle<R>) -> Vec<Area> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let work = monitor.work_area();
            Area {
                x: f64::from(work.position.x) / scale,
                y: f64::from(work.position.y) / scale,
                width: f64::from(work.size.width) / scale,
                height: f64::from(work.size.height) / scale,
            }
        })
        .collect()
}

fn main_area<R: Runtime>(window: &WebviewWindow<R>) -> Option<Area> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    Some(Area {
        x: f64::from(work.position.x) / scale,
        y: f64::from(work.position.y) / scale,
        width: f64::from(work.size.width) / scale,
        height: f64::from(work.size.height) / scale,
    })
}

/// Opens the window, or shows it again, without taking focus from the main
/// window. Window creation must not run on the main thread, hence async.
#[tauri::command]
pub(crate) async fn asmr_lyrics_open<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    placement: Option<LyricsPlacement>,
) -> Result<(), AsmrError> {
    if window.label() != "main" {
        return Err(forbidden());
    }
    if let Some(existing) = app.get_webview_window(LYRICS_LABEL) {
        return existing.show().map_err(|_| unavailable());
    }
    let areas = work_areas(&app);
    let placement = placement
        .filter(|placement| fits(placement, &areas))
        .or_else(|| main_area(&window).map(default_placement))
        .ok_or(unavailable())?;
    WebviewWindowBuilder::new(
        &app,
        LYRICS_LABEL,
        WebviewUrl::App("index.html#asmr-lyrics".into()),
    )
    .title("ASMR 桌面字幕")
    .inner_size(placement.width, placement.height)
    .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
    .position(placement.x, placement.y)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .resizable(true)
    .disable_drag_drop_handler()
    .on_navigation(|url| trusted_navigation(url, cfg!(dev)))
    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
    .on_download(|_, _| false)
    .build()
    .map(|_| ())
    .map_err(|_| unavailable())
}

/// Hides the window while the current file has no subtitles.
#[tauri::command]
pub(crate) fn asmr_lyrics_hide<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> Result<(), AsmrError> {
    if window.label() != "main" {
        return Err(forbidden());
    }
    match app.get_webview_window(LYRICS_LABEL) {
        Some(lyrics) => lyrics.hide().map_err(|_| unavailable()),
        None => Ok(()),
    }
}

/// Closes the window, from the main window or from the window itself.
#[tauri::command]
pub(crate) fn asmr_lyrics_close<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> Result<(), AsmrError> {
    if window.label() != "main" && window.label() != LYRICS_LABEL {
        return Err(forbidden());
    }
    match app.get_webview_window(LYRICS_LABEL) {
        Some(lyrics) => lyrics.destroy().map_err(|_| unavailable()),
        None => Ok(()),
    }
}

/// The main window sends the line to show; the window gets it at once.
#[tauri::command]
pub(crate) fn asmr_lyrics_line<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopLyrics>>,
    text: String,
    title: String,
) -> Result<(), AsmrError> {
    if window.label() != "main" {
        return Err(forbidden());
    }
    let line = LyricsLine {
        text: clean(&text, MAX_TEXT),
        title: clean(&title, MAX_TITLE),
    };
    *state.line.lock().map_err(|_| unavailable())? = line.clone();
    if app.get_webview_window(LYRICS_LABEL).is_some() {
        app.emit_to(LYRICS_LABEL, LINE_EVENT, line)
            .map_err(|_| unavailable())?;
    }
    Ok(())
}

/// The latest line, read by the window when it first loads.
#[tauri::command]
pub(crate) fn asmr_lyrics_current<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, Arc<DesktopLyrics>>,
) -> Result<LyricsLine, AsmrError> {
    if window.label() != LYRICS_LABEL {
        return Err(forbidden());
    }
    Ok(state.line.lock().map_err(|_| unavailable())?.clone())
}

fn placement_of<R: Runtime>(window: &Window<R>) -> Option<LyricsPlacement> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    Some(LyricsPlacement {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

/// Tells the main window where the subtitle window now is, so it reopens
/// there, and when it was closed.
pub(crate) fn window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let app = window.app_handle();
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            if let Some(placement) = placement_of(window) {
                let _ = app.emit_to("main", PLACEMENT_EVENT, placement);
            }
        }
        WindowEvent::Destroyed => {
            let _ = app.emit_to("main", CLOSED_EVENT, ());
        }
        _ => {}
    }
}
