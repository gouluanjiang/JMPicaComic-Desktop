//! The one definition of pinned JM hostnames, plus process-local host health.
//!
//! Health is diagnostic only and never grants trust: nothing here can add a
//! hostname. It records hostnames and closed error codes, never routes, queries,
//! account data or titles, so it is safe to show and to write to the local log.
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

// JM rotates its mobile API hostnames. Reviewed by hand on 2026-11-01 against
// JM's domain announcement, which is encrypted with a fixed key rather than
// signed, so it must never expand this list automatically. Every host is
// exact-match pinned: no wildcard, port, path or HTTP variant is accepted.
pub const JM_DEFAULT_API_HOST: &str = "www.cdnhjk.net";
pub const JM_API_HOSTS: &[&str] = &[
    "www.cdnhjk.net",
    "www.cdnutc.cc",
    "www.cdngwc.net",
    "www.cdngwc.cc",
    "www.cdngwc.club",
    "www.cdnhth.net",
    "www.cdnbea.net",
];
/// Parked or dead hosts that must never re-enter the pinned set.
pub const JM_RETIRED_API_HOSTS: &[&str] = &[
    "www.cdnhth.cc",
    "www.cdnzack.cc",
    "www.cdn-mspjmapiproxy.xyz",
];
/// A single host on purpose: media URLs are bound into download plans, manifests
/// and proofs, so serving a page from another host is a download-gate decision.
pub const JM_IMAGE_HOST: &str = "cdn-msp2.jmapiproxy2.cc";
pub const JM_COVER_HOSTS: &[&str] = &[
    "cdn-msp.jmapiproxy1.cc",
    "cdn-msp.jmapiproxy2.cc",
    "cdn-msp3.18comic.vip",
];

const MAX_TRACKED_HOSTS: usize = 32;
const MAX_CODE_BYTES: usize = 48;
const MAX_LOG_BYTES: u64 = 256 * 1024;

static PREFERRED_JM_API_HOST: Mutex<Option<&'static str>> = Mutex::new(None);
static HEALTH: Mutex<Health> = Mutex::new(Health {
    hosts: BTreeMap::new(),
    log_path: None,
});

/// Only a pinned hostname can become the preference. This is an ordering hint for
/// this process; the pinned set stays the trust boundary.
pub fn remember_jm_api_host(host: &str) {
    let Some(pinned) = JM_API_HOSTS.iter().find(|pinned| **pinned == host) else {
        return;
    };
    if let Ok(mut preferred) = PREFERRED_JM_API_HOST.lock() {
        *preferred = Some(*pinned);
    }
}

pub fn preferred_jm_api_host() -> &'static str {
    PREFERRED_JM_API_HOST
        .lock()
        .ok()
        .and_then(|preferred| *preferred)
        .unwrap_or(JM_DEFAULT_API_HOST)
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HostHealth {
    pub last_success_ms: Option<u64>,
    pub last_failure_ms: Option<u64>,
    pub last_failure_code: Option<String>,
    pub consecutive_failures: u64,
}

struct Health {
    hosts: BTreeMap<String, HostHealth>,
    log_path: Option<PathBuf>,
}

/// Enables the bounded local log of health transitions. Call once at startup.
pub fn set_health_log(path: PathBuf) {
    if let Ok(mut health) = HEALTH.lock() {
        health.log_path = Some(path);
    }
}

/// `Err` carries a closed error code; anything else is reduced to `OTHER`.
pub fn record_host_result(host: &str, result: Result<(), &str>) {
    let at = now_ms();
    let Ok(mut health) = HEALTH.lock() else {
        return;
    };
    let code = result.err().map(closed_code);
    let Some(changed) = apply_result(&mut health.hosts, host, code.as_deref(), at) else {
        return;
    };
    let log_path = changed.then(|| health.log_path.clone()).flatten();
    drop(health);
    if let Some(path) = log_path {
        append_log(&path, &log_line(at, host, code.as_deref()));
    }
}

pub fn host_health() -> BTreeMap<String, HostHealth> {
    HEALTH
        .lock()
        .map(|health| health.hosts.clone())
        .unwrap_or_default()
}

/// Returns whether the host's state changed, or `None` for a rejected hostname.
fn apply_result(
    hosts: &mut BTreeMap<String, HostHealth>,
    host: &str,
    code: Option<&str>,
    at: u64,
) -> Option<bool> {
    if !valid_host(host) || (hosts.len() >= MAX_TRACKED_HOSTS && !hosts.contains_key(host)) {
        return None;
    }
    let is_new = !hosts.contains_key(host);
    let entry = hosts.entry(host.to_owned()).or_default();
    let changed = match code {
        Some(code) => {
            let changed =
                entry.consecutive_failures == 0 || entry.last_failure_code.as_deref() != Some(code);
            entry.last_failure_ms = Some(at);
            entry.last_failure_code = Some(code.to_owned());
            entry.consecutive_failures = entry.consecutive_failures.saturating_add(1);
            changed
        }
        None => {
            let changed = entry.consecutive_failures != 0;
            entry.last_success_ms = Some(at);
            entry.consecutive_failures = 0;
            changed
        }
    };
    Some(is_new || changed)
}

fn valid_host(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= 253
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
}

fn closed_code(code: &str) -> String {
    if !code.is_empty()
        && code.len() <= MAX_CODE_BYTES
        && code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
    {
        code.to_owned()
    } else {
        "OTHER".to_owned()
    }
}

fn log_line(at: u64, host: &str, code: Option<&str>) -> String {
    format!("{at}\t{host}\t{}\n", code.unwrap_or("OK"))
}

/// Best effort: a diagnostic log must never change the outcome of a request.
fn append_log(path: &Path, line: &str) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if fs::metadata(path).is_ok_and(|metadata| metadata.len() >= MAX_LOG_BYTES) {
        let _ = fs::rename(path, path.with_extension("log.1"));
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pins_are_unique_exact_hostnames_and_retired_hosts_stay_out() {
        assert!(JM_API_HOSTS.contains(&JM_DEFAULT_API_HOST));
        assert_eq!(JM_API_HOSTS[0], JM_DEFAULT_API_HOST);
        for host in JM_API_HOSTS {
            assert!(valid_host(host), "{host}");
            assert_eq!(
                JM_API_HOSTS.iter().filter(|other| *other == host).count(),
                1
            );
            assert!(!JM_RETIRED_API_HOSTS.contains(host), "{host}");
        }
    }

    // The frontend and this manual workflow cannot import a Rust constant. The UI
    // workflow also skips Rust-only changes, so the guard lives in this crate.
    #[test]
    fn other_copies_of_the_api_host_list_match_the_pins() {
        for (name, text) in [
            (
                "download-input.ts",
                include_str!("../../../apps/local-workbench/src/download-input.ts"),
            ),
            (
                "phase1a.yml",
                include_str!("../../../.github/workflows/phase1a.yml"),
            ),
        ] {
            for host in JM_API_HOSTS {
                assert!(text.contains(host), "{name} is missing {host}");
            }
            for host in JM_RETIRED_API_HOSTS {
                assert!(!text.contains(host), "{name} still names {host}");
            }
        }
    }

    #[test]
    fn only_pinned_hosts_can_become_the_preference() {
        assert_eq!(preferred_jm_api_host(), JM_DEFAULT_API_HOST);
        remember_jm_api_host("www.cdnhth.cc");
        remember_jm_api_host("example.invalid");
        assert_eq!(preferred_jm_api_host(), JM_DEFAULT_API_HOST);
        remember_jm_api_host(JM_API_HOSTS[2]);
        assert_eq!(preferred_jm_api_host(), JM_API_HOSTS[2]);
        remember_jm_api_host(JM_DEFAULT_API_HOST);
    }

    #[test]
    fn health_counts_failures_and_reports_only_state_changes() {
        let mut hosts = BTreeMap::new();
        let host = "a.example";
        assert_eq!(apply_result(&mut hosts, host, None, 1), Some(true));
        assert_eq!(apply_result(&mut hosts, host, None, 2), Some(false));
        assert_eq!(apply_result(&mut hosts, host, Some("X"), 3), Some(true));
        assert_eq!(apply_result(&mut hosts, host, Some("X"), 4), Some(false));
        assert_eq!(apply_result(&mut hosts, host, Some("Y"), 5), Some(true));
        assert_eq!(
            hosts[host],
            HostHealth {
                last_success_ms: Some(2),
                last_failure_ms: Some(5),
                last_failure_code: Some("Y".into()),
                consecutive_failures: 3,
            }
        );
        assert_eq!(apply_result(&mut hosts, host, None, 6), Some(true));
        assert_eq!(hosts[host].consecutive_failures, 0);
    }

    #[test]
    fn health_rejects_unsafe_hosts_and_stays_bounded() {
        let mut hosts = BTreeMap::new();
        for host in ["", "a/b", "a b", "user:pass@a.example", "a.example?q=x"] {
            assert_eq!(apply_result(&mut hosts, host, None, 1), None, "{host}");
        }
        for index in 0..MAX_TRACKED_HOSTS {
            let host = format!("h{index}.example");
            assert_eq!(apply_result(&mut hosts, &host, None, 1), Some(true));
        }
        assert_eq!(apply_result(&mut hosts, "new.example", None, 1), None);
        assert_eq!(hosts.len(), MAX_TRACKED_HOSTS);
        assert_eq!(apply_result(&mut hosts, "h0.example", None, 2), Some(false));
    }

    #[test]
    fn only_closed_codes_reach_health_or_the_log() {
        assert_eq!(closed_code("HTTP_405"), "HTTP_405");
        let too_long = "A".repeat(49);
        for code in ["", "search_query=secret", "C:\\Users\\x", too_long.as_str()] {
            assert_eq!(closed_code(code), "OTHER", "{code}");
        }
        assert_eq!(log_line(5, "a.example", None), "5\ta.example\tOK\n");
        assert_eq!(
            log_line(5, "a.example", Some("HTTP_405")),
            "5\ta.example\tHTTP_405\n"
        );
    }

    #[test]
    fn the_log_rotates_once_and_stays_bounded() {
        let directory = std::env::temp_dir().join(format!(
            "source-network-log-{}-{}",
            std::process::id(),
            now_ms()
        ));
        let path = directory.join("source-health.log");
        append_log(&path, "first\n");
        assert_eq!(fs::read_to_string(&path).unwrap(), "first\n");
        fs::write(&path, vec![b'x'; MAX_LOG_BYTES as usize]).unwrap();
        append_log(&path, "second\n");
        assert_eq!(fs::read_to_string(&path).unwrap(), "second\n");
        assert_eq!(
            fs::metadata(path.with_extension("log.1")).unwrap().len(),
            MAX_LOG_BYTES
        );
        fs::remove_dir_all(&directory).unwrap();
    }
}
