//! Normalized, size-bounded views of asmr.one API responses. Remote media URLs
//! never reach the renderer: tracks carry file ids, and the URLs stay in
//! [`AsmrMedia`] on the native side.

use crate::{error, AsmrResult};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const MAX_TITLE: usize = 500;
const MAX_NAME: usize = 120;
const MAX_TAGS: usize = 80;
const MAX_VOICE_ACTORS: usize = 50;
const MAX_EDITIONS: usize = 16;
const MAX_PAGE_WORKS: usize = 100;
const MAX_INDEX: usize = 20_000;
const MAX_TRACK_NODES: usize = 5_000;
const MAX_TRACK_DEPTH: usize = 12;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrCircle {
    pub id: u64,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrVoiceActor {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrTag {
    pub id: u64,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrEdition {
    pub code: String,
    pub lang: String,
    pub label: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrWork {
    pub id: u64,
    pub code: String,
    pub title: String,
    pub circle: Option<AsmrCircle>,
    pub voice_actors: Vec<AsmrVoiceActor>,
    pub tags: Vec<AsmrTag>,
    pub release: Option<String>,
    pub added: Option<String>,
    pub downloads: u64,
    pub rating: Option<f64>,
    pub rating_count: u64,
    pub review_count: u64,
    pub price: Option<u64>,
    pub duration_seconds: Option<u64>,
    pub has_subtitle: bool,
    pub editions: Vec<AsmrEdition>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrPage {
    pub works: Vec<AsmrWork>,
    pub page: u64,
    pub page_size: u64,
    pub total: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrIndexEntry {
    pub id: String,
    pub name: String,
    pub count: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AsmrFileKind {
    Audio,
    Video,
    Text,
    Image,
    Other,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AsmrTrack {
    #[serde(rename_all = "camelCase")]
    Folder {
        title: String,
        children: Vec<AsmrTrack>,
    },
    #[serde(rename_all = "camelCase")]
    File {
        /// The site's file id within this work; `None` when it has no usable
        /// media address, so the file can be listed but not opened.
        file_id: Option<u64>,
        kind: AsmrFileKind,
        title: String,
        size: Option<u64>,
        duration_seconds: Option<f64>,
    },
}

/// Hosts that serve media files. Stream addresses must use one of these or a
/// pinned API host.
pub const ASMR_MEDIA_HOST_SUFFIXES: &[&str] = &[".kiko-play-niptan.one"];

/// Where one file of a work is streamed from. Native only: never serialized.
#[derive(Clone, Debug, PartialEq)]
pub struct AsmrMedia {
    pub work_id: u64,
    pub file_id: u64,
    pub kind: AsmrFileKind,
    pub title: String,
    pub url: Url,
}

impl AsmrMedia {
    /// Lowercase file extension of the title, if any.
    pub fn extension(&self) -> Option<String> {
        extension(&self.title)
    }
}

pub(crate) fn extension(title: &str) -> Option<String> {
    let (_, extension) = title.rsplit_once('.')?;
    (!extension.is_empty() && extension.len() <= 8 && extension.is_ascii())
        .then(|| extension.to_ascii_lowercase())
}

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "m4v", "webm", "mkv", "mov"];

/// Accepts only HTTPS addresses on the media hosts or the pinned API hosts,
/// on the default port and without credentials.
pub(crate) fn allowed_media_url(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default();
    url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && (crate::ASMR_API_HOSTS.contains(&host)
            || ASMR_MEDIA_HOST_SUFFIXES
                .iter()
                .any(|suffix| host.len() > suffix.len() && host.ends_with(suffix)))
}

fn media_url(value: &Value) -> Option<Url> {
    let url = Url::parse(value.as_str()?).ok()?;
    allowed_media_url(&url).then_some(url)
}

/// Removes control characters and caps length by characters.
pub(crate) fn clean_text(value: &str, limit: usize) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .take(limit)
        .collect::<String>()
        .trim()
        .to_owned()
}

fn text(value: &Value, limit: usize) -> Option<String> {
    value
        .as_str()
        .map(|value| clean_text(value, limit))
        .filter(|value| !value.is_empty())
}

fn count(value: &Value) -> u64 {
    value
        .as_u64()
        .or_else(|| value.as_f64().filter(|v| *v >= 0.0).map(|v| v as u64))
        .unwrap_or(0)
}

fn date(value: &Value) -> Option<String> {
    let value = value.as_str()?.get(..10)?;
    let bytes = value.as_bytes();
    let shaped = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());
    shaped.then(|| value.to_owned())
}

/// DLsite-style work codes such as `RJ01683351`.
pub fn is_work_code(value: &str) -> bool {
    let bytes = value.as_bytes();
    (8..=10).contains(&bytes.len())
        && bytes[..2].iter().all(u8::is_ascii_uppercase)
        && bytes[2..].iter().all(u8::is_ascii_digit)
}

pub(crate) fn code_for(id: u64) -> String {
    if id >= 1_000_000 {
        format!("RJ{id:08}")
    } else {
        format!("RJ{id:06}")
    }
}

/// Accepts a numeric id, a work code such as `RJ01683351`, or an asmr.one work
/// link, and returns the numeric id the API uses.
pub fn parse_work_input(input: &str) -> Option<u64> {
    let input = input.trim();
    let candidate = input
        .rsplit('/')
        .find(|segment| !segment.is_empty())
        .unwrap_or(input)
        .split(['?', '#'])
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let digits = candidate
        .strip_prefix("RJ")
        .or_else(|| candidate.strip_prefix("VJ"))
        .or_else(|| candidate.strip_prefix("BJ"))
        .unwrap_or(&candidate);
    if digits.is_empty() || digits.len() > 10 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok().filter(|id| *id > 0)
}

fn tag(value: &Value) -> Option<AsmrTag> {
    let id = value["id"].as_u64()?;
    let name = text(&value["i18n"]["zh-cn"]["name"], MAX_NAME)
        .or_else(|| text(&value["name"], MAX_NAME))?;
    Some(AsmrTag { id, name })
}

fn voice_actor(value: &Value) -> Option<AsmrVoiceActor> {
    let id = value["id"].as_str()?;
    let shaped = !id.is_empty()
        && id.len() <= 64
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    shaped.then_some(())?;
    Some(AsmrVoiceActor {
        id: id.to_owned(),
        name: text(&value["name"], MAX_NAME)?,
    })
}

fn edition(value: &Value) -> Option<AsmrEdition> {
    let code = value["workno"].as_str().filter(|code| is_work_code(code))?;
    Some(AsmrEdition {
        code: code.to_owned(),
        lang: text(&value["lang"], 16)?,
        label: text(&value["label"], 32).unwrap_or_default(),
    })
}

pub(crate) fn work(value: &Value) -> AsmrResult<AsmrWork> {
    let id = value["id"]
        .as_u64()
        .filter(|id| *id > 0)
        .ok_or(error("ASMR_RESPONSE_INVALID"))?;
    let title = text(&value["title"], MAX_TITLE).ok_or(error("ASMR_RESPONSE_INVALID"))?;
    let code = value["source_id"]
        .as_str()
        .filter(|code| is_work_code(code))
        .map(str::to_owned)
        .unwrap_or_else(|| code_for(id));
    let circle = value["circle"]["id"]
        .as_u64()
        .or_else(|| value["circle_id"].as_u64())
        .and_then(|id| {
            let name = text(&value["circle"]["name"], MAX_NAME)
                .or_else(|| text(&value["name"], MAX_NAME))?;
            Some(AsmrCircle { id, name })
        });
    let list = |key: &str| value[key].as_array().map(Vec::as_slice).unwrap_or(&[]);
    let rating_count = count(&value["rate_count"]);
    let rating = value["rate_average_2dp"]
        .as_f64()
        .filter(|rating| rating.is_finite() && (0.0..=5.0).contains(rating) && rating_count > 0);
    Ok(AsmrWork {
        id,
        code,
        title,
        circle,
        voice_actors: list("vas")
            .iter()
            .filter_map(voice_actor)
            .take(MAX_VOICE_ACTORS)
            .collect(),
        tags: list("tags").iter().filter_map(tag).take(MAX_TAGS).collect(),
        release: date(&value["release"]),
        added: date(&value["create_date"]),
        downloads: count(&value["dl_count"]),
        rating,
        rating_count,
        review_count: count(&value["review_count"]),
        price: value["price"].as_u64(),
        duration_seconds: value["duration"].as_u64().filter(|seconds| *seconds > 0),
        has_subtitle: value["has_subtitle"].as_bool().unwrap_or(false),
        editions: list("language_editions")
            .iter()
            .filter_map(edition)
            .take(MAX_EDITIONS)
            .collect(),
    })
}

pub(crate) fn page(value: &Value) -> AsmrResult<AsmrPage> {
    let works = value["works"]
        .as_array()
        .ok_or(error("ASMR_RESPONSE_INVALID"))?;
    if works.len() > MAX_PAGE_WORKS {
        return Err(error("ASMR_RESPONSE_INVALID"));
    }
    let pagination = &value["pagination"];
    Ok(AsmrPage {
        // One malformed record must not hide a whole page of valid works.
        works: works
            .iter()
            .filter_map(|work| self::work(work).ok())
            .collect(),
        page: pagination["currentPage"].as_u64().unwrap_or(1).max(1),
        page_size: pagination["pageSize"]
            .as_u64()
            .unwrap_or(works.len() as u64),
        total: count(&pagination["totalCount"]),
    })
}

pub(crate) fn index(value: &Value) -> AsmrResult<Vec<AsmrIndexEntry>> {
    let entries = value.as_array().ok_or(error("ASMR_RESPONSE_INVALID"))?;
    if entries.len() > MAX_INDEX {
        return Err(error("ASMR_RESPONSE_INVALID"));
    }
    Ok(entries
        .iter()
        .filter_map(|entry| {
            let id = match &entry["id"] {
                Value::Number(number) => number.as_u64()?.to_string(),
                Value::String(id)
                    if !id.is_empty()
                        && id.len() <= 64
                        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') =>
                {
                    id.clone()
                }
                _ => return None,
            };
            let name = text(&entry["i18n"]["zh-cn"]["name"], MAX_NAME)
                .or_else(|| text(&entry["name"], MAX_NAME))?;
            Some(AsmrIndexEntry {
                id,
                name,
                count: count(&entry["count"]),
            })
        })
        .collect())
}

struct TrackWalk<'a> {
    work_id: u64,
    budget: usize,
    media: &'a mut Vec<AsmrMedia>,
}

/// `"<work>/<file>"`, accepted only for the work being read.
fn file_id(value: &Value, work_id: u64) -> Option<u64> {
    let (work, file) = value["hash"].as_str()?.split_once('/')?;
    if file.is_empty() || file.len() > 20 || !file.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let file = file.parse::<u64>().ok()?;
    (work.parse::<u64>().ok()? == work_id && file > 0).then_some(file)
}

fn track(value: &Value, depth: usize, walk: &mut TrackWalk<'_>) -> AsmrResult<Option<AsmrTrack>> {
    if depth > MAX_TRACK_DEPTH || walk.budget == 0 {
        return Err(error("ASMR_RESPONSE_INVALID"));
    }
    walk.budget -= 1;
    let Some(title) = text(&value["title"], MAX_TITLE) else {
        return Ok(None);
    };
    let mut kind = match value["type"].as_str() {
        Some("folder") => {
            let mut children = Vec::new();
            for child in value["children"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or(&[])
            {
                if let Some(child) = track(child, depth + 1, walk)? {
                    children.push(child);
                }
            }
            return Ok(Some(AsmrTrack::Folder { title, children }));
        }
        Some("audio") => AsmrFileKind::Audio,
        Some("text") => AsmrFileKind::Text,
        Some("image") => AsmrFileKind::Image,
        _ => AsmrFileKind::Other,
    };
    // The site lists video files as audio or other.
    if matches!(kind, AsmrFileKind::Audio | AsmrFileKind::Other)
        && extension(&title).is_some_and(|ext| VIDEO_EXTENSIONS.contains(&ext.as_str()))
    {
        kind = AsmrFileKind::Video;
    }
    // Original quality first; the API's own stream path redirects to it.
    let url = media_url(&value["mediaStreamUrl"]).or_else(|| media_url(&value["mediaDownloadUrl"]));
    let file_id = file_id(value, walk.work_id).filter(|_| url.is_some());
    if let (Some(file_id), Some(url)) = (file_id, url) {
        walk.media.push(AsmrMedia {
            work_id: walk.work_id,
            file_id,
            kind,
            title: title.clone(),
            url,
        });
    }
    Ok(Some(AsmrTrack::File {
        file_id,
        kind,
        title,
        size: value["size"].as_u64(),
        duration_seconds: value["duration"]
            .as_f64()
            .filter(|seconds| seconds.is_finite() && *seconds > 0.0),
    }))
}

pub(crate) fn tracks(value: &Value, work_id: u64) -> AsmrResult<(Vec<AsmrTrack>, Vec<AsmrMedia>)> {
    let nodes = value.as_array().ok_or(error("ASMR_RESPONSE_INVALID"))?;
    let mut media = Vec::new();
    let mut walk = TrackWalk {
        work_id,
        budget: MAX_TRACK_NODES,
        media: &mut media,
    };
    let mut tracks = Vec::new();
    for node in nodes {
        if let Some(node) = track(node, 0, &mut walk)? {
            tracks.push(node);
        }
    }
    // A file id is the key for streaming, so a repeated one is dropped.
    let mut seen = std::collections::HashSet::new();
    media.retain(|entry| seen.insert(entry.file_id));
    Ok((tracks, media))
}
