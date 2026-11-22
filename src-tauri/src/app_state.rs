use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

fn err<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

fn state_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(err)?;
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir)
}

fn read_valid_json(path: &Path) -> Option<serde_json::Value> {
    let raw = fs::read_to_string(path).ok()?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw).ok()?;
    if parsed.is_object() {
        Some(parsed)
    } else {
        None
    }
}

#[tauri::command]
pub fn app_data_location(app: tauri::AppHandle) -> Result<String, String> {
    Ok(state_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn app_state_load(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = state_dir(&app)?;
    let primary = dir.join("rocketbox-state.json");
    let backup = dir.join("rocketbox-state.bak.json");

    if let Some(parsed) = read_valid_json(&primary) {
        return Ok(parsed);
    }
    if let Some(recovered) = read_valid_json(&backup) {
        return Ok(recovered);
    }
    Ok(serde_json::json!({ "version": 1, "entries": {} }))
}

#[tauri::command]
pub fn app_state_save(
    app: tauri::AppHandle,
    entries: serde_json::Map<String, serde_json::Value>,
) -> Result<String, String> {
    let dir = state_dir(&app)?;
    let primary = dir.join("rocketbox-state.json");
    let backup = dir.join("rocketbox-state.bak.json");

    if read_valid_json(&primary).is_some() {
        let _ = fs::copy(&primary, &backup);
    }

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let payload = serde_json::json!({
        "version": 1,
        "updatedAt": now_ms,
        "entries": entries
    });
    let serialized = serde_json::to_vec_pretty(&payload).map_err(err)?;

    let temp = dir.join(format!("rocketbox-state.tmp.{}.json", std::process::id()));
    {
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&temp)
            .map_err(err)?;
        file.write_all(&serialized).map_err(err)?;
        file.sync_all().map_err(err)?;
    }

    if let Err(rename_err) = fs::rename(&temp, &primary) {
        let _ = fs::remove_file(&temp);
        return Err(err(rename_err));
    }

    Ok(primary.to_string_lossy().into_owned())
}
