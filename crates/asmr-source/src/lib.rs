//! Read-only asmr.one catalog client: listings, search, circles, voice actors,
//! tags, work details, file trees, covers, and bounded pieces of media files
//! for online playback. With a session token it also reads and changes the
//! listener's marks, ratings and playlists. No downloads or filesystem access.

mod account;
mod types;

pub use account::{is_token, AsmrPlaylist, AsmrPlaylistPage, AsmrPrivacy, AsmrSession};
pub use types::{
    is_work_code, parse_work_input, AsmrCircle, AsmrEdition, AsmrFileKind, AsmrIndexEntry,
    AsmrMedia, AsmrPage, AsmrProgress, AsmrTag, AsmrTrack, AsmrVoiceActor, AsmrWork,
    ASMR_MEDIA_HOST_SUFFIXES,
};

use base64::Engine as _;
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};

/// Pinned API hosts, tried in order from the last one that answered. Covers
/// are served by the same hosts.
pub const ASMR_API_HOSTS: &[&str] = &["api.asmr-200.com", "api.asmr-300.com", "api.asmr.one"];

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RESPONSE: usize = 8 * 1024 * 1024;
const MAX_COVER: usize = 4 * 1024 * 1024;
const MAX_PAGE: u64 = 100_000;
const MAX_PAGE_SIZE: u64 = 48;
const MAX_KEYWORD: usize = 100;
/// Largest piece of a media file fetched per request. The webview asks again
/// for the rest, so memory stays bounded however long the file is.
pub const MEDIA_CHUNK: u64 = 2 * 1024 * 1024;
const MEDIA_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_TEXT: usize = 2 * 1024 * 1024;
const SUBTITLE_EXTENSIONS: &[&str] = &["vtt", "lrc", "srt"];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct AsmrError {
    pub code: &'static str,
}

pub type AsmrResult<T> = Result<T, AsmrError>;

pub(crate) const fn error(code: &'static str) -> AsmrError {
    AsmrError { code }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AsmrOrder {
    Added,
    Release,
    Downloads,
    Rating,
    Reviews,
    Price,
    Random,
}

impl AsmrOrder {
    fn parameter(self) -> &'static str {
        match self {
            Self::Added => "create_date",
            Self::Release => "release",
            Self::Downloads => "dl_count",
            Self::Rating => "rate_average_2dp",
            Self::Reviews => "review_count",
            Self::Price => "price",
            Self::Random => "random",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AsmrListQuery {
    pub order: AsmrOrder,
    pub ascending: bool,
    pub page: u64,
    pub page_size: u64,
    pub subtitle_only: bool,
}

impl AsmrListQuery {
    fn validate(&self) -> AsmrResult<()> {
        if (1..=MAX_PAGE).contains(&self.page) && (1..=MAX_PAGE_SIZE).contains(&self.page_size) {
            Ok(())
        } else {
            Err(error("ASMR_INVALID_INPUT"))
        }
    }

    fn apply(&self, url: &mut Url) {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("order", self.order.parameter());
        if self.order != AsmrOrder::Random {
            pairs.append_pair("sort", if self.ascending { "asc" } else { "desc" });
        }
        pairs.append_pair("page", &self.page.to_string());
        pairs.append_pair("pageSize", &self.page_size.to_string());
        pairs.append_pair("subtitle", if self.subtitle_only { "1" } else { "0" });
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AsmrRelation {
    Circle,
    VoiceActor,
    Tag,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum AsmrIndexKind {
    Circles,
    Tags,
    VoiceActors,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AsmrCoverSize {
    Thumbnail,
    Main,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrWorkDetail {
    pub work: AsmrWork,
    pub tracks: Vec<AsmrTrack>,
    /// Stream addresses by file id. Kept native.
    #[serde(skip)]
    pub media: Vec<AsmrMedia>,
}

/// One requested byte range, `bytes=start-` or `bytes=start-end`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AsmrByteRange {
    pub start: u64,
    pub end: Option<u64>,
}

impl AsmrByteRange {
    /// A missing header means the whole file from the start. Suffix and
    /// multiple ranges are refused; media elements never send them.
    pub fn parse(header: Option<&str>) -> AsmrResult<Self> {
        let Some(header) = header else {
            return Ok(Self {
                start: 0,
                end: None,
            });
        };
        let invalid = error("ASMR_RANGE_INVALID");
        let spec = header.trim().strip_prefix("bytes=").ok_or(invalid)?;
        if spec.contains(',') {
            return Err(invalid);
        }
        let (start, end) = spec.split_once('-').ok_or(invalid)?;
        let start = range_number(start).ok_or(invalid)?;
        let end = match end.trim() {
            "" => None,
            end => Some(
                range_number(end)
                    .filter(|end| *end >= start)
                    .ok_or(invalid)?,
            ),
        };
        Ok(Self { start, end })
    }

    /// The last byte fetched for this request, at most one chunk past start.
    pub fn capped_end(&self) -> u64 {
        let cap = self.start.saturating_add(MEDIA_CHUNK - 1);
        self.end.map_or(cap, |end| end.min(cap))
    }
}

fn range_number(value: &str) -> Option<u64> {
    let value = value.trim();
    let digits =
        !value.is_empty() && value.len() <= 19 && value.bytes().all(|b| b.is_ascii_digit());
    if !digits {
        return None;
    }
    value.parse().ok()
}

/// A piece of a media file and where it sits in the whole.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AsmrMediaChunk {
    pub start: u64,
    pub end: u64,
    pub total: Option<u64>,
    pub content_type: &'static str,
    pub bytes: Vec<u8>,
}

/// Content types by extension. Anything else is served as opaque bytes and
/// the media element decides whether it can play it.
pub fn media_type(extension: Option<&str>) -> &'static str {
    match extension.unwrap_or_default() {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "mp4" | "m4v" | "mov" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        _ => "application/octet-stream",
    }
}

/// `bytes <start>-<end>/<total or *>`.
pub fn parse_content_range(header: &str) -> Option<(u64, u64, Option<u64>)> {
    let (range, total) = header.trim().strip_prefix("bytes ")?.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    let start = range_number(start)?;
    let end = range_number(end).filter(|end| *end >= start)?;
    let total = match total.trim() {
        "*" => None,
        total => Some(range_number(total).filter(|total| *total > end)?),
    };
    Some((start, end, total))
}

/// Subtitle text in UTF-8 or UTF-16 with a byte-order mark; anything else is
/// read as UTF-8 with invalid bytes replaced.
pub fn decode_text(bytes: &[u8]) -> String {
    fn utf16(bytes: &[u8], little: bool) -> String {
        let units = bytes.as_chunks::<2>().0.iter().map(|pair| {
            if little {
                u16::from_le_bytes(*pair)
            } else {
                u16::from_be_bytes(*pair)
            }
        });
        char::decode_utf16(units)
            .map(|unit| unit.unwrap_or(char::REPLACEMENT_CHARACTER))
            .collect()
    }
    if let Some(rest) = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]) {
        String::from_utf8_lossy(rest).into_owned()
    } else if let Some(rest) = bytes.strip_prefix(&[0xff, 0xfe]) {
        utf16(rest, true)
    } else if let Some(rest) = bytes.strip_prefix(&[0xfe, 0xff]) {
        utf16(rest, false)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

fn media_status(status: u16) -> AsmrResult<()> {
    match status {
        200..=299 => Ok(()),
        404 | 410 => Err(error("ASMR_NOT_FOUND")),
        401 | 403 => Err(error("ASMR_REFUSED")),
        416 => Err(error("ASMR_RANGE_INVALID")),
        429 => Err(error("ASMR_RATE_LIMITED")),
        _ => Err(error("ASMR_REQUEST_FAILED")),
    }
}

/// One request against a path below `/api/`.
#[derive(Clone, Debug, PartialEq)]
struct ApiRequest {
    method: Method,
    segments: Vec<String>,
    query: Option<AsmrListQuery>,
    extra_query: Vec<(&'static str, String)>,
    body: Option<Value>,
    /// Sent without the session token, as signing in must be.
    anonymous: bool,
}

impl ApiRequest {
    fn get(segments: &[&str]) -> Self {
        Self {
            method: Method::GET,
            segments: segments
                .iter()
                .map(|segment| (*segment).to_owned())
                .collect(),
            query: None,
            extra_query: Vec::new(),
            body: None,
            anonymous: false,
        }
    }

    fn url(&self, host: &str) -> AsmrResult<Url> {
        let mut url =
            Url::parse(&format!("https://{host}/api/")).map_err(|_| error("ASMR_CLIENT_FAILED"))?;
        {
            let mut path = url
                .path_segments_mut()
                .map_err(|_| error("ASMR_CLIENT_FAILED"))?;
            path.pop_if_empty();
            for segment in &self.segments {
                path.push(segment);
            }
        }
        if let Some(query) = &self.query {
            query.apply(&mut url);
        }
        if !self.extra_query.is_empty() {
            let mut pairs = url.query_pairs_mut();
            for (key, value) in &self.extra_query {
                pairs.append_pair(key, value);
            }
        }
        Ok(url)
    }
}

/// A transport outcome before JSON decoding: status and body, or a closed code.
type Reply = Result<(u16, Vec<u8>), &'static str>;

pub struct AsmrSource {
    client: Client,
    preferred: AtomicUsize,
    /// The listener's session token. Sent to the pinned API hosts only.
    token: std::sync::RwLock<Option<String>>,
    #[cfg(test)]
    script: Option<std::sync::Mutex<std::collections::VecDeque<Reply>>>,
    #[cfg(test)]
    recorded: std::sync::Mutex<Vec<(Method, String, Option<Value>)>>,
}

impl AsmrSource {
    pub fn new() -> AsmrResult<Self> {
        // No cookie jar and no redirects: every request goes to a pinned host.
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| error("ASMR_CLIENT_FAILED"))?;
        Ok(Self {
            client,
            preferred: AtomicUsize::new(0),
            token: std::sync::RwLock::new(None),
            #[cfg(test)]
            script: None,
            #[cfg(test)]
            recorded: std::sync::Mutex::new(Vec::new()),
        })
    }

    #[cfg(test)]
    fn scripted(replies: Vec<Reply>) -> Self {
        let mut source = Self::new().expect("client");
        source.script = Some(std::sync::Mutex::new(replies.into()));
        source
    }

    #[cfg(test)]
    fn recorded(&self) -> Vec<(Method, String, Option<Value>)> {
        self.recorded.lock().unwrap().clone()
    }

    async fn transport(&self, url: Url, request: &ApiRequest, limit: usize) -> Reply {
        #[cfg(test)]
        if let Some(script) = &self.script {
            self.recorded.lock().unwrap().push((
                request.method.clone(),
                url.to_string(),
                request.body.clone(),
            ));
            return script
                .lock()
                .unwrap()
                .pop_front()
                .expect("unexpected request");
        }
        let mut builder = self
            .client
            .request(request.method.clone(), url)
            .header(reqwest::header::ACCEPT, "application/json, image/*");
        if !request.anonymous {
            // Every URL here is on a pinned host; media hosts never see it.
            let token = self.token.read().map_err(|_| "ASMR_CLIENT_FAILED")?.clone();
            if let Some(token) = token {
                builder = builder.bearer_auth(token);
            }
        }
        if let Some(body) = &request.body {
            builder = builder.json(body);
        }
        let mut response = builder.send().await.map_err(|_| "ASMR_NETWORK")?;
        let status = response.status().as_u16();
        if response
            .content_length()
            .is_some_and(|length| length > limit as u64)
        {
            return Err("ASMR_RESPONSE_TOO_LARGE");
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "ASMR_NETWORK")? {
            if bytes.len() + chunk.len() > limit {
                return Err("ASMR_RESPONSE_TOO_LARGE");
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok((status, bytes))
    }

    /// Walks the pinned hosts for network failures and server errors only.
    /// Client errors are answers, so they never move to another host.
    async fn fetch(&self, request: &ApiRequest, limit: usize) -> AsmrResult<(u16, Vec<u8>)> {
        let start = self.preferred.load(Ordering::Relaxed) % ASMR_API_HOSTS.len();
        let mut last = error("ASMR_NETWORK");
        for offset in 0..ASMR_API_HOSTS.len() {
            let index = (start + offset) % ASMR_API_HOSTS.len();
            let url = request.url(ASMR_API_HOSTS[index])?;
            match self.transport(url, request, limit).await {
                Ok((status, _)) if status >= 500 => last = error("ASMR_UNAVAILABLE"),
                Ok(reply) => {
                    self.preferred.store(index, Ordering::Relaxed);
                    return Ok(reply);
                }
                Err("ASMR_RESPONSE_TOO_LARGE") => return Err(error("ASMR_RESPONSE_TOO_LARGE")),
                Err(_) => last = error("ASMR_NETWORK"),
            }
        }
        Err(last)
    }

    /// The body of a successful answer.
    async fn answer(&self, request: ApiRequest) -> AsmrResult<Vec<u8>> {
        let (status, bytes) = self.fetch(&request, MAX_RESPONSE).await?;
        match status {
            200..=299 => Ok(bytes),
            404 => Err(error("ASMR_NOT_FOUND")),
            429 => Err(error("ASMR_RATE_LIMITED")),
            // With a token, 401 means the site no longer accepts it.
            401 if self.signed_in() => Err(error("ASMR_LOGIN_EXPIRED")),
            401 | 403 => Err(error("ASMR_REFUSED")),
            _ => Err(error("ASMR_REQUEST_FAILED")),
        }
    }

    async fn json(&self, request: ApiRequest) -> AsmrResult<Value> {
        serde_json::from_slice(&self.answer(request).await?)
            .map_err(|_| error("ASMR_RESPONSE_INVALID"))
    }

    /// The whole catalog in the requested order.
    pub async fn works(&self, query: AsmrListQuery) -> AsmrResult<AsmrPage> {
        query.validate()?;
        let mut request = ApiRequest::get(&["works"]);
        request.query = Some(query);
        types::page(&self.json(request).await?)
    }

    /// The site's popular list. It is a recommendation endpoint and only
    /// accepts POST.
    pub async fn popular(
        &self,
        page: u64,
        page_size: u64,
        subtitle_only: bool,
    ) -> AsmrResult<AsmrPage> {
        if !(1..=MAX_PAGE).contains(&page) || !(1..=MAX_PAGE_SIZE).contains(&page_size) {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut request = ApiRequest::get(&["recommender", "popular"]);
        request.method = Method::POST;
        request.body = Some(json!({
            "page": page,
            "pageSize": page_size,
            "subtitle": if subtitle_only { 1 } else { 0 },
            "localSubtitledWorks": [],
            "withPlaylistStatus": [],
        }));
        types::page(&self.json(request).await?)
    }

    pub async fn search(&self, keyword: &str, query: AsmrListQuery) -> AsmrResult<AsmrPage> {
        query.validate()?;
        let keyword = types::clean_text(keyword, MAX_KEYWORD + 1);
        if keyword.is_empty() || keyword.chars().count() > MAX_KEYWORD {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        // A work code is looked up exactly instead of as free text.
        let keyword = match parse_work_input(&keyword) {
            Some(id) if keyword.to_ascii_uppercase().starts_with("RJ") => types::code_for(id),
            _ => keyword,
        };
        let mut request = ApiRequest::get(&["search", keyword.as_str()]);
        request.query = Some(query);
        types::page(&self.json(request).await?)
    }

    pub async fn related(
        &self,
        relation: AsmrRelation,
        id: &str,
        query: AsmrListQuery,
    ) -> AsmrResult<AsmrPage> {
        query.validate()?;
        let valid = match relation {
            AsmrRelation::Circle | AsmrRelation::Tag => {
                !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit())
            }
            AsmrRelation::VoiceActor => {
                !id.is_empty()
                    && id.len() <= 64
                    && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            }
        };
        if !valid {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let collection = match relation {
            AsmrRelation::Circle => "circles",
            AsmrRelation::VoiceActor => "vas",
            AsmrRelation::Tag => "tags",
        };
        let mut request = ApiRequest::get(&[collection, id, "works"]);
        request.query = Some(query);
        types::page(&self.json(request).await?)
    }

    pub async fn index(&self, kind: AsmrIndexKind) -> AsmrResult<Vec<AsmrIndexEntry>> {
        let collection = match kind {
            AsmrIndexKind::Circles => "circles",
            AsmrIndexKind::Tags => "tags",
            AsmrIndexKind::VoiceActors => "vas",
        };
        // The site lists these collections with a trailing slash.
        let request = ApiRequest::get(&[collection, ""]);
        types::index(&self.json(request).await?)
    }

    pub async fn work(&self, id: u64) -> AsmrResult<AsmrWorkDetail> {
        if id == 0 {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let id = id.to_string();
        // Only the signed-in endpoint carries the listener's mark and rating.
        let endpoint = if self.signed_in() { "work" } else { "workInfo" };
        let work = types::work(&self.json(ApiRequest::get(&[endpoint, &id])).await?)?;
        let mut tracks = ApiRequest::get(&["tracks", &id]);
        tracks.extra_query.push(("v", "2".to_owned()));
        let (tracks, media) = types::tracks(&self.json(tracks).await?, work.id)?;
        Ok(AsmrWorkDetail {
            work,
            tracks,
            media,
        })
    }

    /// Sends one GET to a media address and follows at most one redirect,
    /// and only to another allowed media address.
    async fn media_request(
        &self,
        url: &Url,
        range: Option<(u64, u64)>,
    ) -> AsmrResult<reqwest::Response> {
        use reqwest::header::{ACCEPT, LOCATION, RANGE};
        let mut url = url.clone();
        for _ in 0..2 {
            if !types::allowed_media_url(&url) {
                return Err(error("ASMR_REFUSED"));
            }
            let mut builder = self
                .client
                .get(url.clone())
                .timeout(MEDIA_TIMEOUT)
                .header(ACCEPT, "*/*");
            if let Some((start, end)) = range {
                builder = builder.header(RANGE, format!("bytes={start}-{end}"));
            }
            let response = builder.send().await.map_err(|_| error("ASMR_NETWORK"))?;
            if !response.status().is_redirection() {
                return Ok(response);
            }
            url = response
                .headers()
                .get(LOCATION)
                .and_then(|location| location.to_str().ok())
                .and_then(|location| url.join(location).ok())
                .ok_or(error("ASMR_REQUEST_FAILED"))?;
        }
        Err(error("ASMR_REQUEST_FAILED"))
    }

    /// At most [`MEDIA_CHUNK`] bytes of an audio or video file, starting at
    /// the requested offset.
    pub async fn media(
        &self,
        media: &AsmrMedia,
        range: AsmrByteRange,
    ) -> AsmrResult<AsmrMediaChunk> {
        if !matches!(media.kind, AsmrFileKind::Audio | AsmrFileKind::Video) {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let end = range.capped_end();
        let mut response = self
            .media_request(&media.url, Some((range.start, end)))
            .await?;
        let status = response.status().as_u16();
        media_status(status)?;
        let total = if status == 206 {
            let (start, last, total) = response
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|value| value.to_str().ok())
                .and_then(parse_content_range)
                .ok_or(error("ASMR_RESPONSE_INVALID"))?;
            if start != range.start || last > end {
                return Err(error("ASMR_RESPONSE_INVALID"));
            }
            total
        } else if range.start == 0 {
            // The whole file came back; keep only the first chunk of it.
            response.content_length()
        } else {
            return Err(error("ASMR_RANGE_UNSUPPORTED"));
        };
        let limit =
            usize::try_from(end - range.start + 1).map_err(|_| error("ASMR_RANGE_INVALID"))?;
        let mut bytes = Vec::with_capacity(limit.min(256 * 1024));
        while bytes.len() < limit {
            let Some(chunk) = response.chunk().await.map_err(|_| error("ASMR_NETWORK"))? else {
                break;
            };
            let room = limit - bytes.len();
            bytes.extend_from_slice(&chunk[..chunk.len().min(room)]);
        }
        if bytes.is_empty() {
            return Err(error("ASMR_RESPONSE_INVALID"));
        }
        Ok(AsmrMediaChunk {
            start: range.start,
            end: range.start + bytes.len() as u64 - 1,
            total,
            content_type: media_type(media.extension().as_deref()),
            bytes,
        })
    }

    /// A subtitle file (VTT, LRC or SRT) as text.
    pub async fn subtitle(&self, media: &AsmrMedia) -> AsmrResult<String> {
        let subtitle = media
            .extension()
            .is_some_and(|extension| SUBTITLE_EXTENSIONS.contains(&extension.as_str()));
        if media.kind != AsmrFileKind::Text || !subtitle {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut response = self.media_request(&media.url, None).await?;
        media_status(response.status().as_u16())?;
        if response
            .content_length()
            .is_some_and(|length| length > MAX_TEXT as u64)
        {
            return Err(error("ASMR_RESPONSE_TOO_LARGE"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| error("ASMR_NETWORK"))? {
            if bytes.len() + chunk.len() > MAX_TEXT {
                return Err(error("ASMR_RESPONSE_TOO_LARGE"));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(decode_text(&bytes))
    }

    /// A cover as a `data:` URL, or `None` when the site has none.
    pub async fn cover(&self, id: u64, size: AsmrCoverSize) -> AsmrResult<Option<String>> {
        if id == 0 {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut request = ApiRequest::get(&["cover", &format!("{id}.jpg")]);
        request.extra_query.push((
            "type",
            match size {
                AsmrCoverSize::Thumbnail => "240x240",
                AsmrCoverSize::Main => "main",
            }
            .to_owned(),
        ));
        let (status, bytes) = self.fetch(&request, MAX_COVER).await?;
        match status {
            200 => {}
            404 => return Ok(None),
            429 => return Err(error("ASMR_RATE_LIMITED")),
            _ => return Err(error("ASMR_REQUEST_FAILED")),
        }
        let mime = image_type(&bytes).ok_or(error("ASMR_RESPONSE_INVALID"))?;
        Ok(Some(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        )))
    }
}

fn image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

#[cfg(test)]
mod tests;
