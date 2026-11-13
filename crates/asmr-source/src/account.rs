//! The signed-in listener's side of asmr.one: signing in, the works they
//! marked or rated, and their playlists. Read-only apart from the sign-in
//! request itself. The token stays native; nothing here returns it to a
//! renderer.

use crate::{error, types, ApiRequest, AsmrPage, AsmrProgress, AsmrResult, AsmrSource};
use reqwest::Method;
use serde::Serialize;
use serde_json::{json, Value};

const MAX_ACCOUNT_NAME: usize = 64;
const MAX_PASSWORD: usize = 256;
/// The site's tokens are a few hundred bytes.
const MAX_TOKEN: usize = 2048;
const MAX_PLAYLISTS: usize = 100;
const MAX_PLAYLIST_PAGE_SIZE: u64 = 48;
const MAX_PAGE: u64 = 100_000;
const REVIEW_PAGE_SIZE: u64 = 20;

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
    })
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
        let value = self.json(request).await?;
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
}
