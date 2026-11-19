//! Module `store`: see contracts/ipc.md §4.
pub mod usage;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    Default,
    AcceptEdits,
    Plan,
    Auto,
    /// No confirmation at all: opt-in only, never the default (docs/adr/0002).
    #[serde(rename = "bypassPermissions")]
    Bypass,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionEntry {
    pub key: String,
    pub claude_session_id: Option<String>,
    pub cwd: String,
    pub title: String,
    pub model: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub cost_usd: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub claude_path: Option<String>,
    pub default_model: Option<String>,
    pub default_permission_mode: PermissionMode,
    pub recent_cwds: Vec<String>,
    #[serde(default = "default_vault_path")]
    pub vault_path: Option<String>,
    #[serde(default = "default_vault_project")]
    pub vault_project: String,
}

fn default_vault_path() -> Option<String> {
    std::env::var("ATELIER_VAULT")
        .ok()
        .filter(|v| !v.is_empty())
}

fn default_vault_project() -> String {
    "01 - Projets/Atelier".into()
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            claude_path: None,
            default_model: None,
            default_permission_mode: PermissionMode::Default,
            recent_cwds: Vec::new(),
            vault_path: default_vault_path(),
            vault_project: default_vault_project(),
        }
    }
}

pub struct Store {
    base: PathBuf,
}

fn invalid(msg: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, msg)
}

fn bad_data(e: serde_json::Error) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, e)
}

/// Write to a temp file in the same folder, flushed to disk, then rename over the target.
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let mut f = fs::File::create(&tmp)?;
    f.write_all(bytes)?;
    f.sync_all()?;
    fs::rename(&tmp, path)
}

/// Reads a JSON file; absent → `T::default()`. Unreadable JSON is moved to `<file>.bak` and
/// the default is returned, with a warning on stderr, so one bad file does not block the app.
fn read_or_default<T: serde::de::DeserializeOwned + Default>(path: &Path) -> io::Result<T> {
    let data = match fs::read(path) {
        Ok(d) => d,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(T::default()),
        Err(e) => return Err(e),
    };
    match serde_json::from_slice(&data) {
        Ok(v) => Ok(v),
        Err(e) => {
            let mut bak = path.as_os_str().to_owned();
            bak.push(".bak");
            eprintln!(
                "[store] {} illisible ({e}) : déplacé vers {}, valeurs par défaut",
                path.display(),
                Path::new(&bak).display()
            );
            fs::rename(path, &bak)?;
            Ok(T::default())
        }
    }
}

impl Store {
    pub fn open(base: PathBuf) -> io::Result<Store> {
        fs::create_dir_all(base.join("sessions"))?;
        Ok(Store { base })
    }

    fn log_path(&self, key: &str) -> io::Result<PathBuf> {
        let ok = (1..=64).contains(&key.len())
            && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
        if !ok {
            return Err(invalid("clé de session invalide"));
        }
        Ok(self.base.join("sessions").join(format!("{key}.ndjson")))
    }

    pub fn append_event(&self, key: &str, event: &serde_json::Value) -> io::Result<()> {
        let mut line = serde_json::to_vec(event).map_err(bad_data)?;
        line.push(b'\n');
        let mut f = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.log_path(key)?)?;
        f.write_all(&line)
    }

    pub fn read_events(&self, key: &str) -> io::Result<Vec<serde_json::Value>> {
        let path = self.log_path(key)?;
        let data = match fs::read(&path) {
            Ok(d) => d,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e),
        };
        // Bytes, not str: a crash may leave invalid UTF-8 in one line.
        Ok(data
            .split(|&b| b == b'\n')
            .filter_map(|l| serde_json::from_slice(l).ok())
            .collect())
    }

    pub fn upsert_session(&self, entry: &SessionEntry) -> io::Result<()> {
        self.log_path(&entry.key)?; // validates the key
        let mut all = self.list_sessions()?;
        match all.iter_mut().find(|e| e.key == entry.key) {
            Some(e) => *e = entry.clone(),
            None => all.push(entry.clone()),
        }
        write_atomic(
            &self.base.join("sessions.json"),
            &serde_json::to_vec_pretty(&all).map_err(bad_data)?,
        )
    }

    pub fn list_sessions(&self) -> io::Result<Vec<SessionEntry>> {
        let mut all: Vec<SessionEntry> = read_or_default(&self.base.join("sessions.json"))?;
        all.sort_by_key(|e| std::cmp::Reverse(e.updated_at));
        Ok(all)
    }

    pub fn load_settings(&self) -> io::Result<Settings> {
        read_or_default(&self.base.join("settings.json"))
    }

    pub fn save_settings(&self, s: &Settings) -> io::Result<()> {
        write_atomic(
            &self.base.join("settings.json"),
            &serde_json::to_vec_pretty(s).map_err(bad_data)?,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store(name: &str) -> Store {
        let d = std::env::temp_dir().join(format!("atelier-store-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        Store::open(d).unwrap()
    }

    fn entry(key: &str, updated_at: u64) -> SessionEntry {
        SessionEntry {
            key: key.into(),
            claude_session_id: None,
            cwd: "/tmp".into(),
            title: "t".into(),
            model: None,
            created_at: 1,
            updated_at,
            cost_usd: 0.5,
        }
    }

    #[test]
    fn permission_modes_serialize_like_the_bridge_expects() {
        let name = |m| serde_json::to_string(&m).unwrap();
        assert_eq!(name(PermissionMode::AcceptEdits), "\"acceptEdits\"");
        assert_eq!(name(PermissionMode::Auto), "\"auto\"");
        assert_eq!(name(PermissionMode::Bypass), "\"bypassPermissions\"");
        let back: PermissionMode = serde_json::from_str("\"auto\"").unwrap();
        assert_eq!(back, PermissionMode::Auto);
    }

    #[test]
    fn settings_roundtrip_and_defaults() {
        let s = store("settings");
        assert_eq!(s.load_settings().unwrap(), Settings::default());
        let v = Settings {
            claude_path: Some("/x/claude".into()),
            default_model: Some("m".into()),
            default_permission_mode: PermissionMode::AcceptEdits,
            recent_cwds: vec!["/a".into()],
            vault_path: Some("/v".into()),
            vault_project: "P".into(),
        };
        s.save_settings(&v).unwrap();
        assert_eq!(s.load_settings().unwrap(), v);
        let json = fs::read_to_string(s.base.join("settings.json")).unwrap();
        assert!(json.contains("\"defaultPermissionMode\": \"acceptEdits\""));
    }

    #[test]
    fn old_settings_without_vault_fields() {
        let s = store("oldsettings");
        fs::write(
            s.base.join("settings.json"),
            // instagramMode: removed setting (v2.5), still ignored when an old file has it.
        br#"{"claudePath":null,"defaultModel":null,"defaultPermissionMode":"default","recentCwds":["/a"],"instagramMode":"window"}"#,
        )
        .unwrap();
        let v = s.load_settings().unwrap();
        assert_eq!(v.recent_cwds, ["/a"]);
        assert_eq!(v.vault_project, "01 - Projets/Atelier");
        assert_eq!(v.vault_path, default_vault_path());
    }

    #[test]
    fn upsert_and_sort() {
        let s = store("sessions");
        s.upsert_session(&entry("a", 10)).unwrap();
        s.upsert_session(&entry("b", 20)).unwrap();
        s.upsert_session(&entry("a", 30)).unwrap();
        let l = s.list_sessions().unwrap();
        let keys: Vec<_> = l.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(keys, ["a", "b"]);
        assert_eq!(l[0].updated_at, 30);
    }

    #[test]
    fn events_skip_corrupt_line() {
        let s = store("events");
        assert!(s.read_events("k-1").unwrap().is_empty());
        s.append_event("k-1", &serde_json::json!({"n": 1})).unwrap();
        let p = s.log_path("k-1").unwrap();
        let mut f = OpenOptions::new().append(true).open(p).unwrap();
        f.write_all(b"{\"n\": 2, trunc\n").unwrap();
        s.append_event("k-1", &serde_json::json!({"n": 3})).unwrap();
        let ev = s.read_events("k-1").unwrap();
        assert_eq!(
            ev,
            vec![serde_json::json!({"n": 1}), serde_json::json!({"n": 3})]
        );
    }

    #[test]
    fn unreadable_files_backed_up_and_defaulted() {
        let s = store("corrupt");
        fs::write(s.base.join("settings.json"), b"{not json").unwrap();
        fs::write(s.base.join("sessions.json"), b"[{\"key\": 1}]").unwrap();
        assert_eq!(s.load_settings().unwrap(), Settings::default());
        assert!(s.list_sessions().unwrap().is_empty());
        assert_eq!(
            fs::read(s.base.join("settings.json.bak")).unwrap(),
            b"{not json"
        );
        assert!(s.base.join("sessions.json.bak").exists());
        assert!(!s.base.join("settings.json").exists());
        // and the store works again
        s.upsert_session(&entry("a", 1)).unwrap();
        assert_eq!(s.list_sessions().unwrap().len(), 1);
    }

    #[test]
    fn invalid_keys_rejected() {
        let s = store("keys");
        for k in ["../x", "", "a/b", &"a".repeat(65)] {
            let e = s.append_event(k, &serde_json::json!(1)).unwrap_err();
            assert_eq!(e.kind(), io::ErrorKind::InvalidInput, "{k}");
            assert!(s.read_events(k).is_err());
        }
        assert!(s.upsert_session(&entry("../x", 1)).is_err());
    }
}
