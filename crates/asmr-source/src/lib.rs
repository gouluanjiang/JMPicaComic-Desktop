//! Read-only asmr.one catalog client: listings, search, circles, voice actors,
//! tags, work details, file trees and covers. No accounts, playback URLs,
//! downloads or filesystem access.

mod types;

pub use types::{
    is_work_code, parse_work_input, AsmrCircle, AsmrEdition, AsmrFileKind, AsmrIndexEntry,
    AsmrPage, AsmrTag, AsmrTrack, AsmrVoiceActor, AsmrWork,
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
}

/// One request against a path below `/api/`.
#[derive(Clone, Debug, PartialEq)]
struct ApiRequest {
    method: Method,
    segments: Vec<String>,
    query: Option<AsmrListQuery>,
    extra_query: Vec<(&'static str, String)>,
    body: Option<Value>,
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

    async fn json(&self, request: ApiRequest) -> AsmrResult<Value> {
        let (status, bytes) = self.fetch(&request, MAX_RESPONSE).await?;
        match status {
            200..=299 => {}
            404 => return Err(error("ASMR_NOT_FOUND")),
            429 => return Err(error("ASMR_RATE_LIMITED")),
            401 | 403 => return Err(error("ASMR_REFUSED")),
            _ => return Err(error("ASMR_REQUEST_FAILED")),
        }
        serde_json::from_slice(&bytes).map_err(|_| error("ASMR_RESPONSE_INVALID"))
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
        let work = types::work(&self.json(ApiRequest::get(&["workInfo", &id])).await?)?;
        let mut tracks = ApiRequest::get(&["tracks", &id]);
        tracks.extra_query.push(("v", "2".to_owned()));
        let tracks = types::tracks(&self.json(tracks).await?)?;
        Ok(AsmrWorkDetail { work, tracks })
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
