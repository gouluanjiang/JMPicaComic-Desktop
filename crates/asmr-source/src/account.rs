//! The signed-in listener's side of asmr.one: signing in, the works they
//! marked or rated, and their playlists, including changing them. The token
//! stays native; nothing here returns it to a renderer.

use crate::{error, types, ApiRequest, AsmrPage, AsmrProgress, AsmrResult, AsmrSource};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MAX_ACCOUNT_NAME: usize = 64;
const MAX_PASSWORD: usize = 256;
/// The site's tokens are a few hundred bytes.
const MAX_TOKEN: usize = 2048;
const MAX_PLAYLISTS: usize = 100;
const MAX_PLAYLIST_PAGE_SIZE: u64 = 48;
const MAX_PAGE: u64 = 100_000;
const REVIEW_PAGE_SIZE: u64 = 20;
const MAX_PLAYLIST_NAME: usize = 120;
const MAX_PLAYLIST_DESCRIPTION: usize = 500;
/// The site stores the interface language a list was created in.
const PLAYLIST_LOCALE: &str = "zh-CN";

/// Who can see a playlist.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AsmrPrivacy {
    Private,
    Unlisted,
    Public,
}

impl AsmrPrivacy {
    fn number(self) -> u8 {
        match self {
            Self::Private => 0,
            Self::Unlisted => 1,
            Self::Public => 2,
        }
    }

    /// Anything unrecognised is treated as private, the narrowest setting.
    fn parse(value: &Value) -> Self {
        match value.as_u64() {
            Some(1) => Self::Unlisted,
            Some(2) => Self::Public,
            _ => Self::Private,
        }
    }
}

/// A fresh session. `token` never leaves native code.
#[derive(Clone, PartialEq, Eq)]
pub struct AsmrSession {
    pub name: String,
    pub token: String,
}

impl std::fmt::Debug for AsmrSession {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("AsmrSession { [REDACTED] }")
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrPlaylist {
    pub id: String,
    pub name: String,
    pub description: String,
    pub works: u64,
    /// The work whose cover represents the list, if any.
    pub cover_work: Option<u64>,
    pub updated: Option<String>,
    pub privacy: AsmrPrivacy,
    /// Whether the work that was asked about is in this list.
    pub contains: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsmrPlaylistPage {
    pub playlists: Vec<AsmrPlaylist>,
    pub page: u64,
    pub page_size: u64,
    pub total: u64,
}

/// Tokens go into a request header, so only printable ASCII is accepted.
pub fn is_token(value: &str) -> bool {
    !value.is_empty() && value.len() <= MAX_TOKEN && value.bytes().all(|b| b.is_ascii_graphic())
}

fn is_playlist_id(value: &str) -> bool {
    value.len() == 36 && value.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}

fn playlist(value: &Value) -> Option<AsmrPlaylist> {
    let id = value["id"].as_str().filter(|id| is_playlist_id(id))?;
    Some(AsmrPlaylist {
        id: id.to_owned(),
        // The site's default list has a reserved name instead of a title.
        name: types::text(&value["name"], 120)?,
        description: types::text(&value["description"], 500).unwrap_or_default(),
        works: types::count(&value["works_count"]),
        cover_work: value["latestWorkID"].as_u64().filter(|id| *id > 0),
        updated: types::date(&value["updated_at"]),
        privacy: AsmrPrivacy::parse(&value["privacy"]),
        contains: value["exist"].as_bool(),
    })
}

fn playlist_page(value: &Value, page: u64) -> AsmrResult<AsmrPlaylistPage> {
    let playlists = value["playlists"]
        .as_array()
        .ok_or(error("ASMR_RESPONSE_INVALID"))?;
    if playlists.len() > MAX_PLAYLISTS {
        return Err(error("ASMR_RESPONSE_INVALID"));
    }
    let pagination = &value["pagination"];
    Ok(AsmrPlaylistPage {
        playlists: playlists.iter().filter_map(playlist).collect(),
        page: pagination["page"].as_u64().unwrap_or(page).max(1),
        page_size: pagination["pageSize"].as_u64().unwrap_or(20),
        total: types::count(&pagination["totalCount"]),
    })
}

/// A playlist's name and description as the listener typed them.
fn playlist_text(name: &str, description: &str) -> AsmrResult<(String, String)> {
    let name = types::clean_text(name, MAX_PLAYLIST_NAME + 1);
    let description = description.trim();
    let valid = !name.is_empty()
        && name.chars().count() <= MAX_PLAYLIST_NAME
        // The site reserves this prefix for its own lists.
        && !name.starts_with("__SYS_PLAYLIST_")
        && description.chars().count() <= MAX_PLAYLIST_DESCRIPTION
        && !description
            .chars()
            .any(|character| character.is_control() && character != '\n');
    if valid {
        Ok((name, description.to_owned()))
    } else {
        Err(error("ASMR_INVALID_INPUT"))
    }
}

impl AsmrSource {
    /// Uses this token for API requests from now on; `None` signs out.
    pub fn set_token(&self, token: Option<String>) -> AsmrResult<()> {
        if token.as_deref().is_some_and(|token| !is_token(token)) {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        *self
            .token
            .write()
            .map_err(|_| error("ASMR_CLIENT_FAILED"))? = token;
        Ok(())
    }

    pub fn signed_in(&self) -> bool {
        self.token.read().is_ok_and(|token| token.is_some())
    }

    /// Signs in and returns the session. The token is not installed here, so
    /// the caller can store it first.
    pub async fn login(&self, name: &str, password: &str) -> AsmrResult<AsmrSession> {
        let name = name.trim();
        let valid = !name.is_empty()
            && name.chars().count() <= MAX_ACCOUNT_NAME
            && !name.chars().any(char::is_control)
            && !password.is_empty()
            && password.chars().count() <= MAX_PASSWORD
            && !password.chars().any(char::is_control);
        if !valid {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut request = ApiRequest::get(&["auth", "me"]);
        request.method = Method::POST;
        request.body = Some(json!({ "name": name, "password": password }));
        request.anonymous = true;
        let (status, bytes) = self.fetch(&request, 64 * 1024).await?;
        match status {
            200..=299 => {}
            400 | 401 | 403 | 404 => return Err(error("ASMR_LOGIN_FAILED")),
            429 => return Err(error("ASMR_RATE_LIMITED")),
            _ => return Err(error("ASMR_REQUEST_FAILED")),
        }
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| error("ASMR_RESPONSE_INVALID"))?;
        let token = value["token"]
            .as_str()
            .filter(|token| is_token(token))
            .ok_or(error("ASMR_LOGIN_FAILED"))?;
        Ok(AsmrSession {
            name: types::text(&value["user"]["name"], MAX_ACCOUNT_NAME)
                .unwrap_or_else(|| name.to_owned()),
            token: token.to_owned(),
        })
    }

    /// The account name the installed token belongs to.
    pub async fn account(&self) -> AsmrResult<String> {
        let value = self.json(ApiRequest::get(&["auth", "me"])).await?;
        if value["user"]["loggedIn"].as_bool() != Some(true) {
            return Err(error("ASMR_LOGIN_EXPIRED"));
        }
        types::text(&value["user"]["name"], MAX_ACCOUNT_NAME).ok_or(error("ASMR_RESPONSE_INVALID"))
    }

    /// Works the listener marked or rated, most recently changed first unless
    /// `ascending`. `progress` narrows the list to one mark.
    pub async fn reviews(
        &self,
        progress: Option<AsmrProgress>,
        ascending: bool,
        page: u64,
    ) -> AsmrResult<AsmrPage> {
        if !(1..=MAX_PAGE).contains(&page) {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut request = ApiRequest::get(&["review"]);
        request.extra_query = vec![
            ("order", "updated_at".to_owned()),
            ("sort", if ascending { "asc" } else { "desc" }.to_owned()),
            ("page", page.to_string()),
        ];
        if let Some(progress) = progress {
            request
                .extra_query
                .push(("filter", progress.parameter().to_owned()));
        }
        let mut result = types::page(&self.json(request).await?)?;
        if result.page_size == 0 {
            result.page_size = REVIEW_PAGE_SIZE;
        }
        Ok(result)
    }

    pub async fn playlists(&self, page: u64) -> AsmrResult<AsmrPlaylistPage> {
        if !(1..=MAX_PAGE).contains(&page) {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut request = ApiRequest::get(&["playlist", "get-playlists"]);
        request.extra_query = vec![
            ("page", page.to_string()),
            ("pageSize", "20".to_owned()),
            ("filterBy", "all".to_owned()),
        ];
        playlist_page(&self.json(request).await?, page)
    }

    pub async fn playlist_works(
        &self,
        id: &str,
        page: u64,
        page_size: u64,
    ) -> AsmrResult<AsmrPage> {
        if !is_playlist_id(id)
            || !(1..=MAX_PAGE).contains(&page)
            || !(1..=MAX_PLAYLIST_PAGE_SIZE).contains(&page_size)
        {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut request = ApiRequest::get(&["playlist", "get-playlist-works"]);
        request.extra_query = vec![
            ("id", id.to_owned()),
            ("page", page.to_string()),
            ("pageSize", page_size.to_string()),
        ];
        types::page(&self.json(request).await?)
    }

    /// Sends a change to the account. Refused locally without a session.
    async fn change(&self, mut request: ApiRequest, method: Method) -> AsmrResult<()> {
        if !self.signed_in() {
            return Err(error("ASMR_SIGNED_OUT"));
        }
        request.method = method;
        self.answer(request).await.map(|_| ())
    }

    async fn post(&self, action: &str, body: Value) -> AsmrResult<()> {
        let mut request = ApiRequest::get(&["playlist", action]);
        request.body = Some(body);
        self.change(request, Method::POST).await
    }

    /// Sets the listener's mark, rating, or both on a work. A field left out
    /// is not sent, so the site keeps what it has.
    pub async fn set_review(
        &self,
        work: u64,
        rating: Option<u8>,
        progress: Option<AsmrProgress>,
    ) -> AsmrResult<()> {
        let valid = work > 0
            && (rating.is_some() || progress.is_some())
            && rating.is_none_or(|rating| (1..=5).contains(&rating));
        if !valid {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut body = json!({ "work_id": work });
        if let Some(rating) = rating {
            body["rating"] = json!(rating);
        }
        if let Some(progress) = progress {
            body["progress"] = json!(progress.parameter());
        }
        let mut request = ApiRequest::get(&["review"]);
        request.body = Some(body);
        self.change(request, Method::PUT).await
    }

    /// Removes the listener's mark and rating from a work.
    pub async fn delete_review(&self, work: u64) -> AsmrResult<()> {
        if work == 0 {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut request = ApiRequest::get(&["review"]);
        request.extra_query = vec![("work_id", work.to_string())];
        self.change(request, Method::DELETE).await
    }

    /// The listener's own playlists, each saying whether it holds the work.
    pub async fn work_playlists(&self, work: u64, page: u64) -> AsmrResult<AsmrPlaylistPage> {
        if work == 0 || !(1..=MAX_PAGE).contains(&page) {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let mut request = ApiRequest::get(&["playlist", "get-work-exist-status-in-my-playlists"]);
        request.extra_query = vec![
            ("workID", work.to_string()),
            ("page", page.to_string()),
            ("version", "2".to_owned()),
        ];
        playlist_page(&self.json(request).await?, page)
    }

    /// Adds one work to a playlist, or removes it.
    pub async fn playlist_change(&self, id: &str, work: u64, add: bool) -> AsmrResult<()> {
        if !is_playlist_id(id) || work == 0 {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let action = if add {
            "add-works-to-playlist"
        } else {
            "remove-works-from-playlist"
        };
        self.post(action, json!({ "id": id, "works": [work] }))
            .await
    }

    pub async fn playlist_create(
        &self,
        name: &str,
        description: &str,
        privacy: AsmrPrivacy,
    ) -> AsmrResult<()> {
        let (name, description) = playlist_text(name, description)?;
        self.post(
            "create-playlist",
            json!({
                "name": name,
                "privacy": privacy.number(),
                "locale": PLAYLIST_LOCALE,
                "description": description,
                "works": [],
            }),
        )
        .await
    }

    pub async fn playlist_edit(
        &self,
        id: &str,
        name: &str,
        description: &str,
        privacy: AsmrPrivacy,
    ) -> AsmrResult<()> {
        if !is_playlist_id(id) {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        let (name, description) = playlist_text(name, description)?;
        self.post(
            "edit-playlist-metadata",
            json!({
                "id": id,
                "data": {
                    "name": name,
                    "privacy": privacy.number(),
                    "description": description,
                },
            }),
        )
        .await
    }

    pub async fn playlist_delete(&self, id: &str) -> AsmrResult<()> {
        if !is_playlist_id(id) {
            return Err(error("ASMR_INVALID_INPUT"));
        }
        self.post("delete-playlist", json!({ "id": id })).await
    }
}
