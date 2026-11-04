//! Account and catalog operations only. No task authority, chapter/media routes,
//! filesystem writes, automatic pagination, retries, or production-state access.
mod content;
mod cover;
mod language;
mod protocol;
mod ranking;
mod recent;
mod thumbnail;
mod types;

pub use content::{
    inherit_content_tags, is_ai_tag, is_bl_tag, is_blocked_tag, is_jm_english_category,
    is_jm_female_tag, retained_content_tags,
};
pub use language::{
    inherit_language_tags, language_tag_kind, retained_language_tags, LanguageTagKind,
};
pub use protocol::parse_work_id;
pub use types::*;

use protocol::{error, JM_API_HOSTS, JM_HOST, PICA_HOST, PICA_KEY, PICA_NONCE};
use reqwest::{header::HeaderValue, Client, Method, Url};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex as AsyncMutex;
use workbench_credentials::{CredentialKind, StoredCredential};

#[derive(Clone, Copy, PartialEq, Eq)]
enum SearchKind {
    Keyword,
    Author,
    Tag,
    Category,
}

const MAX_RESPONSE: usize = 8 * 1024 * 1024;
// A pinned hostname can lapse while the app is running, so a passed probe only
// lasts this long before credentials require a new one.
const JM_HOST_VERIFICATION_TTL: Duration = Duration::from_secs(15 * 60);
const MAX_KNOWN_WORKS: usize = 20_000;
const MAX_COVER_DESCRIPTORS: usize = 8192;
const MAX_COVER_DESCRIPTOR_BYTES: usize = 4 * 1024 * 1024;

/// An opaque session. Secrets and remote cover URLs are never serialized.
pub struct SourceSession {
    source: Source,
    credential: StoredCredential,
    operation: AsyncMutex<()>,
    covers: Mutex<CoverCache>,
}

struct CoverCache {
    known: HashMap<String, bool>,
    known_order: VecDeque<String>,
    urls: HashMap<String, CoverDescriptor>,
    url_order: BTreeMap<u64, String>,
    url_bytes: usize,
    maximum_url_bytes: usize,
    clock: u64,
}

struct CoverDescriptor {
    url: String,
    bytes: usize,
    used_at: u64,
}

impl Default for CoverCache {
    fn default() -> Self {
        Self {
            known: HashMap::new(),
            known_order: VecDeque::new(),
            urls: HashMap::new(),
            url_order: BTreeMap::new(),
            url_bytes: 0,
            maximum_url_bytes: MAX_COVER_DESCRIPTOR_BYTES,
            clock: 0,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum CoverLookup {
    Unknown,
    Missing,
    Evicted,
    Ready(String),
}

impl CoverCache {
    fn remove_url(&mut self, id: &str) {
        if let Some(entry) = self.urls.remove(id) {
            self.url_bytes -= entry.bytes;
            self.url_order.remove(&entry.used_at);
        }
    }

    fn tick(&mut self) -> u64 {
        if self.clock == u64::MAX {
            self.urls.clear();
            self.url_order.clear();
            self.url_bytes = 0;
            self.clock = 0;
        }
        self.clock += 1;
        self.clock
    }

    fn remember(&mut self, work_id: String, url: Option<String>) {
        if !self.known.contains_key(&work_id) {
            if self.known.len() >= MAX_KNOWN_WORKS {
                if let Some(oldest) = self.known_order.pop_front() {
                    self.known.remove(&oldest);
                    self.remove_url(&oldest);
                }
            }
            self.known_order.push_back(work_id.clone());
        }
        self.known.insert(work_id.clone(), url.is_some());
        self.remove_url(&work_id);
        if let Some(url) = url {
            // URL/key strings and entry bookkeeping, separately from image Blobs.
            let bytes = url.len() + work_id.len() * 2 + 128;
            if bytes > self.maximum_url_bytes {
                return;
            }
            let used_at = self.tick();
            while self.urls.len() >= MAX_COVER_DESCRIPTORS
                || self.url_bytes + bytes > self.maximum_url_bytes
            {
                let Some((_, oldest)) = self.url_order.pop_first() else {
                    break;
                };
                self.remove_url(&oldest);
            }
            self.url_bytes += bytes;
            self.url_order.insert(used_at, work_id.clone());
            self.urls.insert(
                work_id,
                CoverDescriptor {
                    url,
                    bytes,
                    used_at,
                },
            );
        }
    }

    fn lookup(&mut self, work_id: &str) -> CoverLookup {
        let used_at = self.tick();
        match self.known.get(work_id) {
            None => CoverLookup::Unknown,
            Some(false) => CoverLookup::Missing,
            Some(true) => match self.urls.get_mut(work_id) {
                Some(entry) => {
                    self.url_order.remove(&entry.used_at);
                    entry.used_at = used_at;
                    self.url_order.insert(used_at, work_id.to_owned());
                    CoverLookup::Ready(entry.url.clone())
                }
                None => CoverLookup::Evicted,
            },
        }
    }
}

impl SourceSession {
    pub fn source(&self) -> Source {
        self.source
    }

    /// Native session metadata only; this grants no favorite/follow authority.
    pub fn has_cover_metadata(&self, work_id: &str) -> bool {
        self.covers
            .lock()
            .is_ok_and(|cache| match cache.known.get(work_id) {
                Some(false) => true,
                Some(true) => cache.urls.contains_key(work_id),
                None => false,
            })
    }

    /// Native-only transfer to an explicitly confirmed desktop worker. This
    /// secret has no renderer/serialization path and grants no task authority.
    pub fn pica_download_credential(&self) -> Option<StoredCredential> {
        (self.source == Source::Pica).then(|| self.credential.clone())
    }

    fn remember_covers(
        &self,
        works: impl IntoIterator<Item = (String, Option<String>)>,
    ) -> SourceResult<()> {
        let mut cache = self
            .covers
            .lock()
            .map_err(|_| error("SOURCE_SESSION_FAILED"))?;
        for (work_id, url) in works {
            cache.remember(work_id, url);
        }
        Ok(())
    }
}

pub struct LoginResult {
    pub session: SourceSession,
    pub account: SourceAccount,
    pub credential: StoredCredential,
}

/// One logical source request; the failover loop may send it to several hosts.
#[derive(Clone, Copy)]
struct RequestSpec<'a> {
    source: Source,
    session: Option<&'a SourceSession>,
    method: &'a Method,
    route: &'a str,
    payload: Option<&'a Value>,
    login: bool,
}

/// One physical call seen by a test instead of the network.
#[cfg(test)]
#[derive(Clone, Debug, PartialEq, Eq)]
struct HostCall {
    host: String,
    route: String,
    carries_credentials: bool,
}

/// Replaces only the physical host calls, so the real failover and probe logic runs.
#[cfg(test)]
struct HostScript {
    respond: Box<dyn Fn(&str, &str) -> SourceResult<Value> + Send + Sync>,
    calls: Mutex<Vec<HostCall>>,
}

#[cfg(test)]
impl HostScript {
    fn call(&self, host: &str, route: &str, carries_credentials: bool) -> SourceResult<Value> {
        self.calls.lock().unwrap().push(HostCall {
            host: host.to_owned(),
            route: route.to_owned(),
            carries_credentials,
        });
        (self.respond)(host, route)
    }
}

pub struct WorkbenchSources {
    api: Client,
    covers: Client,
    // Last JM hostname that answered. Only a performance hint: the pinned
    // `JM_API_HOSTS` set stays the trust boundary.
    jm_host: Mutex<Option<String>>,
    // The one JM hostname currently allowed to receive a password or session
    // cookie, and when its anonymous probe passed.
    jm_verified: Mutex<Option<(String, Instant)>>,
    jm_verification_ttl: Duration,
    #[cfg(test)]
    host_script: Option<HostScript>,
    #[cfg(test)]
    script: Option<Mutex<std::collections::VecDeque<SourceResult<Value>>>>,
    #[cfg(test)]
    recorded: Mutex<Vec<(Source, Method, String)>>,
    #[cfg(test)]
    cover_script: Option<Mutex<VecDeque<SourceResult<cover::CoverResponse>>>>,
    #[cfg(test)]
    cover_recorded: Mutex<Vec<Url>>,
}

impl WorkbenchSources {
    pub fn new() -> SourceResult<Self> {
        fn client() -> SourceResult<Client> {
            Client::builder()
                .timeout(Duration::from_secs(30))
                .https_only(true)
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| error("SOURCE_CLIENT_FAILED"))
        }
        // Neither client enables a cookie jar. Account credentials are attached
        // only to the fixed API request; the cover client has none.
        Ok(Self {
            api: client()?,
            covers: client()?,
            jm_host: Mutex::new(None),
            jm_verified: Mutex::new(None),
            jm_verification_ttl: JM_HOST_VERIFICATION_TTL,
            #[cfg(test)]
            host_script: None,
            #[cfg(test)]
            script: None,
            #[cfg(test)]
            recorded: Mutex::new(vec![]),
            #[cfg(test)]
            cover_script: None,
            #[cfg(test)]
            cover_recorded: Mutex::new(vec![]),
        })
    }

    pub async fn login(
        &self,
        source: Source,
        username: &str,
        password: &str,
    ) -> SourceResult<LoginResult> {
        if username.trim().is_empty()
            || password.is_empty()
            || username.len() > 2048
            || password.len() > 4096
            || username.chars().any(char::is_control)
            || password.chars().any(char::is_control)
        {
            return Err(error("LOGIN_INPUT_INVALID"));
        }
        let (route, payload) = match source {
            Source::Jm => ("/login", json!({"username":username,"password":password})),
            Source::Pica => (
                "auth/sign-in",
                json!({"email":username,"password":password}),
            ),
        };
        let data = self
            .request(source, None, Method::POST, route, Some(payload), true)
            .await?;
        let secret = protocol::required_text(
            &data[match source {
                Source::Jm => "s",
                Source::Pica => "token",
            }],
        )?;
        let kind = expected_kind(source);
        validate_secret(source, &secret)?;
        let credential = StoredCredential::new(username, kind, secret)
            .map_err(|_| error("SOURCE_CREDENTIAL_INVALID"))?;
        let session = new_session(source, credential.clone());
        // A login response is insufficient to publish a connected account.
        let account = self.profile(&session).await?;
        Ok(LoginResult {
            session,
            account,
            credential,
        })
    }

    pub async fn restore(
        &self,
        source: Source,
        credential: &StoredCredential,
    ) -> SourceResult<LoginResult> {
        if credential.kind() != expected_kind(source) {
            return Err(error("SOURCE_CREDENTIAL_INVALID"));
        }
        validate_secret(source, credential.secret())?;
        let session = new_session(source, credential.clone());
        let account = self.profile(&session).await?;
        Ok(LoginResult {
            session,
            account,
            credential: credential.clone(),
        })
    }

    pub async fn profile(&self, session: &SourceSession) -> SourceResult<SourceAccount> {
        let _operation = session.operation.lock().await;
        let (method, route) = match session.source {
            Source::Jm => (Method::POST, "/login"),
            Source::Pica => (Method::GET, "users/profile"),
        };
        let data = self
            .request(session.source, Some(session), method, route, None, false)
            .await?;
        protocol::account(session.source, &data)
    }

    pub async fn favorites(
        &self,
        session: &SourceSession,
        request: FavoritePageRequest,
    ) -> SourceResult<SourcePage> {
        protocol::validate_page(request.page)?;
        let route = match session.source {
            Source::Jm => {
                if request.reverse {
                    return Err(error("SOURCE_REVERSE_UNSUPPORTED"));
                }
                let folder = request.folder_id.as_deref().unwrap_or("0");
                protocol::validate_folder(folder)?;
                format!("/favorite?page={}&o=mr&folder_id={folder}", request.page)
            }
            Source::Pica => {
                if request.folder_id.is_some() {
                    return Err(error("SOURCE_FOLDER_UNSUPPORTED"));
                }
                let order = if request.reverse { "da" } else { "dd" };
                format!("users/favourite?s={order}&page={}", request.page)
            }
        };
        let _operation = session.operation.lock().await;
        let data = self
            .request(
                session.source,
                Some(session),
                Method::GET,
                &route,
                None,
                false,
            )
            .await?;
        let (page, covers) = protocol::page(session.source, &data, request.page, true)?;
        session.remember_covers(covers)?;
        Ok(page)
    }

    pub async fn search(
        &self,
        session: &SourceSession,
        keyword: &str,
        page: u64,
    ) -> SourceResult<SourcePage> {
        self.search_kind(session, keyword, page, SearchKind::Keyword)
            .await
    }

    /// JM's dedicated author field; Pica retains its keyword route. Neither
    /// route proves authorship: callers must check the returned credit fields.
    pub async fn author(
        &self,
        session: &SourceSession,
        author: &str,
        page: u64,
    ) -> SourceResult<SourcePage> {
        self.search_kind(session, author, page, SearchKind::Author)
            .await
    }

    /// Native tag browsing, one requested page; never a keyword approximation.
    pub async fn tag(
        &self,
        session: &SourceSession,
        tag: &str,
        page: u64,
    ) -> SourceResult<SourcePage> {
        self.search_kind(session, tag, page, SearchKind::Tag).await
    }

    pub async fn category(
        &self,
        session: &SourceSession,
        category: &str,
        page: u64,
    ) -> SourceResult<SourcePage> {
        if session.source != Source::Pica {
            return Err(error("SOURCE_CATEGORY_UNSUPPORTED"));
        }
        self.search_kind(session, category, page, SearchKind::Category)
            .await
    }

    async fn search_kind(
        &self,
        session: &SourceSession,
        keyword: &str,
        page: u64,
        kind: SearchKind,
    ) -> SourceResult<SourcePage> {
        protocol::validate_page(page)?;
        if keyword.trim().is_empty()
            || keyword.len() > 1024
            || keyword.chars().any(char::is_control)
        {
            return Err(error("SOURCE_QUERY_INVALID"));
        }
        let _operation = session.operation.lock().await;
        let (method, route, payload) = match session.source {
            Source::Jm => {
                let mut url = Url::parse(&format!("https://{JM_HOST}/search"))
                    .map_err(|_| error("SOURCE_CLIENT_FAILED"))?;
                url.query_pairs_mut()
                    // Existing JM Python pin 9fddb049: jm_client_interface.py
                    // search_author uses main_tag=2; search_tag uses 3.
                    .append_pair(
                        "main_tag",
                        match kind {
                            SearchKind::Author => "2",
                            SearchKind::Tag => "3",
                            SearchKind::Keyword | SearchKind::Category => "0",
                        },
                    )
                    .append_pair("search_query", keyword)
                    .append_pair("page", &page.to_string())
                    .append_pair("o", "mr");
                (
                    Method::GET,
                    format!("/search?{}", url.query().unwrap_or_default()),
                    None,
                )
            }
            Source::Pica if matches!(kind, SearchKind::Tag | SearchKind::Category) => {
                // Existing PicaComic-go pin: Comics(block, tag, sort, page).
                let mut url = Url::parse(&format!("https://{PICA_HOST}/comics"))
                    .map_err(|_| error("SOURCE_CLIENT_FAILED"))?;
                url.query_pairs_mut()
                    .append_pair(
                        if kind == SearchKind::Category {
                            "c"
                        } else {
                            "t"
                        },
                        keyword,
                    )
                    .append_pair("s", "dd")
                    .append_pair("page", &page.to_string());
                (
                    Method::GET,
                    format!("comics?{}", url.query().unwrap_or_default()),
                    None,
                )
            }
            Source::Pica => (
                Method::POST,
                format!("comics/advanced-search?page={page}"),
                Some(json!({"keyword":keyword,"sort":"dd","categories":[]})),
            ),
        };
        let data = self
            .request(
                session.source,
                Some(session),
                method,
                &route,
                payload,
                false,
            )
            .await?;
        if session.source == Source::Jm && !data["redirect_aid"].is_null() {
            if kind != SearchKind::Keyword {
                return Err(error("SOURCE_RESPONSE_INVALID"));
            }
            if page != 1 {
                return Err(error("SOURCE_PAGINATION_INVALID"));
            }
            let id = protocol::required_text(&data["redirect_aid"])?;
            let work = self.detail_inner(session, &id).await?;
            return Ok(SourcePage {
                page,
                total: Some(1),
                pages: Some(1),
                has_more: Some(false),
                folders: vec![],
                items: vec![work],
                issues: vec![],
                jm_search_boundary: None,
            });
        }
        let (page, covers) = protocol::search_page(session.source, &data, page)?;
        session.remember_covers(covers)?;
        Ok(page)
    }

    pub async fn detail(
        &self,
        session: &SourceSession,
        id_or_link: &str,
    ) -> SourceResult<SourceWork> {
        let _operation = session.operation.lock().await;
        self.detail_inner(session, id_or_link).await
    }

    async fn detail_inner(
        &self,
        session: &SourceSession,
        id_or_link: &str,
    ) -> SourceResult<SourceWork> {
        let id = parse_work_id(session.source, id_or_link)?;
        let route = match session.source {
            Source::Jm => format!("/album?id={id}"),
            Source::Pica => format!("comics/{id}"),
        };
        let data = self
            .request(
                session.source,
                Some(session),
                Method::GET,
                &route,
                None,
                false,
            )
            .await?;
        let record = match session.source {
            Source::Jm => &data,
            Source::Pica => &data["comic"],
        };
        let (work, cover) = protocol::work(session.source, record, false)?;
        if work.work_id != id {
            return Err(error("SOURCE_RESPONSE_ID_MISMATCH"));
        }
        session.remember_covers([(id, cover)])?;
        Ok(work)
    }

    pub async fn set_favorite(
        &self,
        session: &SourceSession,
        work_id: &str,
        desired: bool,
    ) -> SourceResult<FavoriteUpdate> {
        let _operation = session.operation.lock().await;
        let id = parse_work_id(session.source, work_id)?;
        let before = self
            .detail_inner(session, &id)
            .await?
            .favorite
            .ok_or(error("FAVORITE_STATE_UNKNOWN"))?;
        if before == desired {
            return Ok(FavoriteUpdate {
                work_id: id,
                favorite: desired,
                changed: false,
                verified: true,
            });
        }
        let (route, payload) = match session.source {
            Source::Jm => ("/favorite".to_owned(), Some(json!({"aid":id}))),
            Source::Pica => (format!("comics/{id}/favourite"), None),
        };
        // A toggle is not idempotent. Never retry it, even after a timeout.
        let response = self
            .request(
                session.source,
                Some(session),
                Method::POST,
                &route,
                payload,
                false,
            )
            .await;
        if response
            .as_ref()
            .is_err_and(|e| e.code == "SESSION_EXPIRED")
        {
            return Err(error("SESSION_EXPIRED"));
        }
        let reported = response
            .as_ref()
            .ok()
            .and_then(|data| toggle_result(session.source, data));
        // Also attempt one read-only reconciliation after an ambiguous response.
        let after = self.detail_inner(session, &id).await;
        if after.as_ref().is_err_and(|e| e.code == "SESSION_EXPIRED") {
            return Err(error("SESSION_EXPIRED"));
        }
        match after.ok().and_then(|work| work.favorite) {
            Some(state) if state == desired && (response.is_err() || reported == Some(desired)) => {
                Ok(FavoriteUpdate {
                    work_id: id,
                    favorite: desired,
                    changed: true,
                    verified: true,
                })
            }
            _ => Err(error("FAVORITE_OUTCOME_UNKNOWN")),
        }
    }

    /// Only previously validated metadata in this session can name a cover.
    pub async fn thumbnail(
        &self,
        session: &SourceSession,
        work_id: &str,
    ) -> SourceResult<Option<String>> {
        let id = parse_work_id(session.source, work_id)?;
        tokio::time::timeout(Duration::from_secs(30), self.thumbnail_inner(session, &id))
            .await
            .map_err(|_| error("SOURCE_TIMEOUT"))?
    }

    async fn request(
        &self,
        source: Source,
        session: Option<&SourceSession>,
        method: Method,
        route: &str,
        payload: Option<Value>,
        login: bool,
    ) -> SourceResult<Value> {
        #[cfg(test)]
        if let Some(script) = &self.script {
            self.recorded
                .lock()
                .unwrap()
                .push((source, method, route.to_owned()));
            return script
                .lock()
                .unwrap()
                .pop_front()
                .expect("unexpected extra request");
        }
        self.check_requests_allowed()?;
        let spec = RequestSpec {
            source,
            session,
            method: &method,
            route,
            payload: payload.as_ref(),
            login,
        };
        // JM rotates API hostnames. Sign-in, profile validation and reads may
        // move to the next pinned host; a favorite toggle is never replayed.
        let candidates = self.candidate_hosts(source, &method, route, login);
        let mut last = None;
        for (index, host) in candidates.iter().enumerate() {
            match self.attempt_on_host(host, spec).await {
                Ok(value) => {
                    self.remember_jm_host(source, host);
                    return Ok(value);
                }
                Err(problem) => {
                    let failover = host_failover_error(problem.code);
                    if failover {
                        self.forget_verified_jm_host(host);
                    }
                    let retry = failover && index + 1 < candidates.len();
                    last = Some(problem);
                    if !retry {
                        break;
                    }
                }
            }
        }
        Err(last.unwrap_or_else(|| error("SOURCE_REQUEST_FAILED")))
    }

    fn check_requests_allowed(&self) -> SourceResult<()> {
        #[cfg(test)]
        if self.host_script.is_some() {
            return Ok(());
        }
        check_live_environment()
    }

    /// Every JM request carries a password or session cookie, so the host must
    /// first prove it serves the JM API. A failover that reacted to the real
    /// request would already have handed those credentials to a parked domain.
    async fn attempt_on_host(&self, host: &str, spec: RequestSpec<'_>) -> SourceResult<Value> {
        if spec.source == Source::Jm {
            self.require_verified_jm_host(host).await?;
        }
        #[cfg(test)]
        if let Some(script) = &self.host_script {
            let carries_credentials = spec.session.is_some() || spec.payload.is_some();
            return script.call(host, spec.route, carries_credentials);
        }
        self.request_on_host(host, spec).await
    }

    async fn require_verified_jm_host(&self, host: &str) -> SourceResult<()> {
        if self.jm_host_is_verified(host) {
            return Ok(());
        }
        self.probe_jm_host(host).await?;
        if let Ok(mut verified) = self.jm_verified.lock() {
            *verified = Some((host.to_owned(), Instant::now()));
        }
        Ok(())
    }

    fn jm_host_is_verified(&self, host: &str) -> bool {
        let Ok(verified) = self.jm_verified.lock() else {
            return false;
        };
        matches!(
            &*verified,
            Some((name, at)) if name == host && at.elapsed() < self.jm_verification_ttl
        )
    }

    fn forget_verified_jm_host(&self, host: &str) {
        if let Ok(mut verified) = self.jm_verified.lock() {
            if verified.as_ref().is_some_and(|(name, _)| name == host) {
                *verified = None;
            }
        }
    }

    /// Anonymous by construction: no session, cookie or form body can reach it.
    /// This rejects parked or lapsed hostnames. It is not authentication, because
    /// the response key is public; TLS and the pinned list remain the boundary.
    async fn probe_jm_host(&self, host: &str) -> SourceResult<()> {
        #[cfg(test)]
        if let Some(script) = &self.host_script {
            return script
                .call(host, protocol::JM_PROBE_ROUTE, false)
                .map(|_| ());
        }
        let timestamp = unix_timestamp()?;
        let url = format!("https://{host}{}", protocol::JM_PROBE_ROUTE);
        let response = with_jm_headers(self.api.get(url), timestamp)
            .send()
            .await
            .map_err(transport_error)?;
        let status = response.status();
        if status.is_redirection() {
            return Err(error("SOURCE_REDIRECT_REFUSED"));
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err(error("SOURCE_ACCESS_DENIED"));
        }
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(error("SOURCE_RATE_LIMITED"));
        }
        let bytes = bounded_bytes(response, MAX_RESPONSE).await?;
        protocol::validate_jm_probe(timestamp, &bytes)
    }

    /// Ordered candidate hosts for one logical request. Only idempotent routes
    /// may walk the whole pinned list; everything else stays on the host that
    /// last answered.
    fn candidate_hosts(
        &self,
        source: Source,
        method: &Method,
        route: &str,
        login: bool,
    ) -> Vec<String> {
        if source == Source::Pica {
            return vec![PICA_HOST.to_owned()];
        }
        let preferred = self
            .jm_host
            .lock()
            .ok()
            .and_then(|host| host.clone())
            .unwrap_or_else(|| JM_HOST.to_owned());
        if !(*method == Method::GET || login || route == "/login") {
            return vec![preferred];
        }
        let mut hosts: Vec<String> = JM_API_HOSTS.iter().map(|host| (*host).to_owned()).collect();
        if let Some(position) = hosts.iter().position(|host| *host == preferred) {
            hosts.swap(0, position);
        }
        hosts
    }

    fn remember_jm_host(&self, source: Source, host: &str) {
        if source == Source::Jm {
            if let Ok(mut preferred) = self.jm_host.lock() {
                *preferred = Some(host.to_owned());
            }
        }
    }

    async fn request_on_host(&self, host: &str, spec: RequestSpec<'_>) -> SourceResult<Value> {
        let RequestSpec {
            source,
            session,
            method,
            route,
            payload,
            login,
        } = spec;
        let timestamp = unix_timestamp()?;
        let separator = if route.starts_with('/') { "" } else { "/" };
        let mut request = self
            .api
            .request(method.clone(), format!("https://{host}{separator}{route}"));
        match source {
            Source::Jm => {
                request = with_jm_headers(request, timestamp);
                if let Some(session) = session {
                    request = request.header(
                        "cookie",
                        sensitive_header(&format!("AVS={}", session.credential.secret()))?,
                    );
                }
                if let Some(payload) = payload {
                    request = request.form(payload);
                }
            }
            Source::Pica => {
                request = request
                    .header("api-key", PICA_KEY)
                    .header("accept", "application/vnd.picacomic.com.v1+json")
                    .header("app-channel", "2")
                    .header("time", timestamp.to_string())
                    .header("nonce", PICA_NONCE)
                    .header("app-version", "2.2.1.2.3.3")
                    .header("app-uuid", "defaultUuid")
                    .header("app-platform", "android")
                    .header("app-build-version", "44")
                    .header("content-type", "application/json; charset=UTF-8")
                    .header("user-agent", "okhttp/3.8.1")
                    .header("image-quality", "original")
                    .header(
                        "signature",
                        protocol::pica_signature(route, method.as_str(), timestamp)?,
                    );
                if let Some(session) = session {
                    request = request.header(
                        "authorization",
                        sensitive_header(session.credential.secret())?,
                    );
                }
                if let Some(payload) = payload {
                    request = request.json(payload);
                }
            }
        }
        let response = request.send().await.map_err(transport_error)?;
        let status = response.status();
        if status.is_redirection() {
            return Err(error("SOURCE_REDIRECT_REFUSED"));
        }
        if login && matches!(status.as_u16(), 400 | 401) {
            return Err(error("LOGIN_REJECTED"));
        }
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(error("SESSION_EXPIRED"));
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err(error("SOURCE_ACCESS_DENIED"));
        }
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(error("SOURCE_RATE_LIMITED"));
        }
        if !status.is_success() {
            return Err(error("SOURCE_REQUEST_FAILED"));
        }
        let bytes = bounded_bytes(response, MAX_RESPONSE).await?;
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| error("SOURCE_RESPONSE_INVALID"))?;
        let code = protocol::count(&value["code"])?;
        if code == Some(401) {
            return Err(error(if login {
                "LOGIN_REJECTED"
            } else {
                "SESSION_EXPIRED"
            }));
        }
        if code != Some(200) {
            return Err(error("SOURCE_API_REJECTED"));
        }
        match source {
            Source::Jm => protocol::decode_jm(
                timestamp,
                value["data"]
                    .as_str()
                    .ok_or(error("SOURCE_RESPONSE_INVALID"))?,
            ),
            Source::Pica => value
                .get("data")
                .filter(|value| value.is_object())
                .cloned()
                .ok_or(error("SOURCE_RESPONSE_INVALID")),
        }
    }
}

fn unix_timestamp() -> SourceResult<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .map_err(|_| error("SOURCE_CLOCK_INVALID"))
}

fn with_jm_headers(request: reqwest::RequestBuilder, timestamp: u64) -> reqwest::RequestBuilder {
    request
        .header(
            "token",
            format!("{:x}", md5::compute(format!("{timestamp}18comicAPP"))),
        )
        .header("tokenparam", format!("{timestamp},2.0.13"))
        .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
}

/// Failures that mean "this pinned host is not serving the JM API" rather than
/// "the account or request was rejected". A parked domain answers 200 HTML
/// (`SOURCE_RESPONSE_INVALID`) or 405 (`SOURCE_REQUEST_FAILED`); a retired one
/// fails to connect or redirects. Access and rate-limit refusals stay terminal
/// because every JM hostname fronts the same backend.
fn host_failover_error(code: &str) -> bool {
    matches!(
        code,
        "SOURCE_TIMEOUT"
            | "SOURCE_CONNECTION_FAILED"
            | "SOURCE_REQUEST_FAILED"
            | "SOURCE_RESPONSE_INVALID"
            | "SOURCE_REDIRECT_REFUSED"
    )
}

fn new_session(source: Source, credential: StoredCredential) -> SourceSession {
    SourceSession {
        source,
        credential,
        operation: AsyncMutex::new(()),
        covers: Mutex::new(CoverCache::default()),
    }
}

fn expected_kind(source: Source) -> CredentialKind {
    match source {
        Source::Jm => CredentialKind::SessionCookie,
        Source::Pica => CredentialKind::SessionToken,
    }
}

fn validate_secret(source: Source, secret: &str) -> SourceResult<()> {
    if secret.is_empty() {
        return Err(error("AUTH_REQUIRED"));
    }
    sensitive_header(secret)?;
    if source == Source::Jm
        && !secret
            .bytes()
            .all(|byte| byte.is_ascii_graphic() && !b";,\"\\".contains(&byte))
    {
        return Err(error("SOURCE_CREDENTIAL_INVALID"));
    }
    Ok(())
}

fn sensitive_header(value: &str) -> SourceResult<HeaderValue> {
    let mut header =
        HeaderValue::from_str(value).map_err(|_| error("SOURCE_CREDENTIAL_INVALID"))?;
    header.set_sensitive(true);
    Ok(header)
}

fn toggle_result(source: Source, value: &Value) -> Option<bool> {
    match source {
        Source::Jm => match value["type"].as_str()? {
            "add" => Some(true),
            "remove" => Some(false),
            _ => None,
        },
        Source::Pica => match value["action"].as_str()? {
            "favourite" => Some(true),
            "un_favourite" => Some(false),
            _ => None,
        },
    }
}

fn check_live_environment() -> SourceResult<()> {
    if cfg!(test) || std::env::var("GITHUB_ACTIONS").is_ok_and(|value| value == "true") {
        Err(error("SOURCE_LIVE_REQUESTS_DISABLED"))
    } else {
        Ok(())
    }
}

fn transport_error(error_value: reqwest::Error) -> SourceError {
    error(if error_value.is_timeout() {
        "SOURCE_TIMEOUT"
    } else if error_value.is_connect() {
        "SOURCE_CONNECTION_FAILED"
    } else {
        "SOURCE_REQUEST_FAILED"
    })
}

async fn bounded_bytes(mut response: reqwest::Response, limit: usize) -> SourceResult<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(error("SOURCE_RESPONSE_TOO_LARGE"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
        if bytes
            .len()
            .checked_add(chunk.len())
            .is_none_or(|length| length > limit)
        {
            return Err(error("SOURCE_RESPONSE_TOO_LARGE"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests;
