use mpris::{DBusError, PlaybackStatus, Player, PlayerFinder};

use super::*;

fn all() -> Result<Vec<Player>, String> {
    let finder =
        PlayerFinder::new().map_err(|_| "Bus D-Bus de session indisponible.".to_string())?;
    finder
        .find_all()
        .map_err(|_| "Aucun lecteur de musique n'est ouvert.".to_string())
}

fn find(id: &str) -> Result<Player, String> {
    all()?
        .into_iter()
        .find(|p| p.bus_name() == id)
        .ok_or_else(|| "Ce lecteur n'est plus disponible.".to_string())
}

fn gone(_: DBusError) -> String {
    "Le lecteur ne répond plus.".into()
}

fn read(p: &Player) -> Raw {
    let meta = p.get_metadata().ok();
    let status = match p.get_playback_status() {
        Ok(PlaybackStatus::Playing) => "playing",
        Ok(PlaybackStatus::Paused) => "paused",
        _ => "stopped",
    };
    Raw {
        player: p.bus_name().to_string(),
        name: p.identity().to_string(),
        status,
        title: meta.as_ref().and_then(|m| m.title().map(String::from)),
        artists: meta.as_ref().and_then(|m| {
            m.artists()
                .map(|a| a.into_iter().map(String::from).collect())
        }),
        album: meta.as_ref().and_then(|m| m.album_name().map(String::from)),
        length_us: meta.as_ref().and_then(|m| m.length_in_microseconds()),
        position_us: p.get_position_in_microseconds().ok(),
        volume: p.get_volume().ok(),
        can_go_next: p.can_go_next().unwrap_or(false),
        can_go_previous: p.can_go_previous().unwrap_or(false),
        can_control: p.can_control().unwrap_or(false),
    }
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|_| "Erreur interne du module musique.".to_string())?
}

#[tauri::command]
pub async fn music_players() -> Result<Vec<PlayerInfo>, String> {
    blocking(|| {
        // No bus or no player: an empty list, not an error.
        Ok(all()
            .unwrap_or_default()
            .iter()
            .map(|p| PlayerInfo {
                id: p.bus_name().into(),
                name: p.identity().into(),
            })
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn music_status(player: Option<String>) -> Result<Option<NowPlaying>, String> {
    blocking(move || {
        let p = match player {
            Some(id) => find(&id).ok(),
            None => {
                let mut list = all().unwrap_or_default();
                let playing: Vec<bool> = list
                    .iter()
                    .map(|p| matches!(p.get_playback_status(), Ok(PlaybackStatus::Playing)))
                    .collect();
                pick(&playing).map(|i| list.swap_remove(i))
            }
        };
        Ok(p.map(|p| to_now_playing(read(&p))))
    })
    .await
}

#[tauri::command]
pub async fn music_control(player: String, action: String) -> Result<(), String> {
    let action = parse_action(&action)?;
    blocking(move || {
        let p = find(&player)?;
        match action {
            Action::PlayPause => p.play_pause(),
            Action::Next => p.next(),
            Action::Previous => p.previous(),
            Action::Stop => p.stop(),
        }
        .map_err(gone)
    })
    .await
}

#[tauri::command]
pub async fn music_set_volume(player: String, volume: f64) -> Result<(), String> {
    let volume = check_volume(volume)?;
    blocking(move || find(&player)?.set_volume(volume).map_err(gone)).await
}
