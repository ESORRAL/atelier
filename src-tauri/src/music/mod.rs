//! MPRIS remote control. Pure logic (choice, conversion, validation) lives here and is tested
//! without D-Bus; `commands.rs` does the blocking calls.

pub mod catalog;
pub mod commands;

use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
pub struct PlayerInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub player: String,
    pub name: String,
    pub status: &'static str,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub length_ms: Option<u64>,
    pub position_ms: Option<u64>,
    pub volume: Option<f64>,
    pub can_go_next: bool,
    pub can_go_previous: bool,
    pub can_control: bool,
}

/// Raw values read from a player, before conversion.
#[derive(Default)]
pub struct Raw {
    pub player: String,
    pub name: String,
    pub status: &'static str,
    pub title: Option<String>,
    pub artists: Option<Vec<String>>,
    pub album: Option<String>,
    pub length_us: Option<u64>,
    pub position_us: Option<u64>,
    pub volume: Option<f64>,
    pub can_go_next: bool,
    pub can_go_previous: bool,
    pub can_control: bool,
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Action {
    PlayPause,
    Next,
    Previous,
    Stop,
}

pub fn parse_action(s: &str) -> Result<Action, String> {
    match s {
        "play_pause" => Ok(Action::PlayPause),
        "next" => Ok(Action::Next),
        "previous" => Ok(Action::Previous),
        "stop" => Ok(Action::Stop),
        _ => Err(format!("Action inconnue : « {s} ».")),
    }
}

pub fn check_volume(v: f64) -> Result<f64, String> {
    if (0.0..=1.0).contains(&v) {
        Ok(v)
    } else {
        Err("Le volume doit être compris entre 0 et 1.".into())
    }
}

/// Index of the player to use: the first one playing, else the first one.
pub fn pick(playing: &[bool]) -> Option<usize> {
    playing
        .iter()
        .position(|p| *p)
        .or(if playing.is_empty() { None } else { Some(0) })
}

fn non_empty(s: Option<String>) -> Option<String> {
    s.filter(|s| !s.is_empty())
}

pub fn to_now_playing(r: Raw) -> NowPlaying {
    let artist = r.artists.map(|a| a.join(", "));
    NowPlaying {
        player: r.player,
        name: r.name,
        status: r.status,
        title: non_empty(r.title),
        artist: non_empty(artist),
        album: non_empty(r.album),
        length_ms: r.length_us.map(|u| u / 1000),
        position_ms: r.position_us.map(|u| u / 1000),
        volume: r.volume,
        can_go_next: r.can_go_next,
        can_go_previous: r.can_go_previous,
        can_control: r.can_control,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_prefers_playing_then_first() {
        assert_eq!(pick(&[]), None);
        assert_eq!(pick(&[false, false]), Some(0));
        assert_eq!(pick(&[false, true, true]), Some(1));
    }

    #[test]
    fn conversion_maps_missing_to_none_and_ms() {
        let n = to_now_playing(Raw {
            status: "playing",
            artists: Some(vec!["A".into(), "B".into()]),
            title: Some(String::new()),
            length_us: Some(2_500_000),
            ..Raw::default()
        });
        assert_eq!(n.artist.as_deref(), Some("A, B"));
        assert_eq!(n.title, None);
        assert_eq!(n.album, None);
        assert_eq!(n.length_ms, Some(2500));
        assert_eq!(n.position_ms, None);
        let json = serde_json::to_value(&n).unwrap();
        assert!(json.get("lengthMs").is_some() && json.get("canGoNext").is_some());
    }

    #[test]
    fn validation() {
        assert!(check_volume(0.0).is_ok() && check_volume(1.0).is_ok());
        assert!(check_volume(1.1).is_err() && check_volume(-0.1).is_err());
        assert!(check_volume(f64::NAN).is_err());
        assert_eq!(parse_action("next"), Ok(Action::Next));
        assert!(parse_action("rewind").is_err());
    }
}
