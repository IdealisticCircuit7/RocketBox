use std::{collections::HashMap, sync::{LazyLock, Mutex}, time::Duration};
use tauri::ipc::Channel;
use std::process::{Child, Command, Stdio};
static LOCAL_SERVICE: Mutex<Option<Child>> = Mutex::new(None);

/// Fixed operation for the installed Ollama, never a caller-supplied command.
#[tauri::command]
pub async fn ollama_ensure_service(base: String) -> Result<bool, String> {
    let mut url = endpoint(&base)?;
    url.set_path("/api/tags");
    let client=reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(2)).build().map_err(|e|e.to_string())?;
    if client.get(url.clone()).send().await.map(|r|r.status().is_success()).unwrap_or(false) { return Ok(true); }
    if url.port_or_known_default()!=Some(11434) { return Err("Ollama indisponível no endpoint configurado; início automático apenas na porta local 11434.".into()); }
    {
        let mut child=LOCAL_SERVICE.lock().map_err(|e|e.to_string())?;
        let running=child.as_mut().map(|p|p.try_wait().ok().flatten().is_none()).unwrap_or(false);
        if !running {
            let mut executable=std::path::PathBuf::from("ollama");
            #[cfg(windows)]
            if let Some(local)=std::env::var_os("LOCALAPPDATA") {
                let installed=std::path::PathBuf::from(local).join("Programs/Ollama/ollama.exe");
                if installed.is_file() { executable=installed; }
            }
            let mut command=Command::new(executable);
            command.arg("serve").env("OLLAMA_HOST", &base).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
            #[cfg(windows)] {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }
            *child=Some(command.spawn().map_err(|e|format!("Não foi possível iniciar o Ollama instalado: {e}. Instale o Ollama e prepare o modelo NautIA."))?);
        }
    }
    for _ in 0..12 {
        tauri::async_runtime::spawn_blocking(||std::thread::sleep(Duration::from_millis(500))).await.map_err(|e|e.to_string())?;
        if client.get(url.clone()).send().await.map(|r|r.status().is_success()).unwrap_or(false) { return Ok(true); }
    }
    Err("Ollama ainda não respondeu; o RocketBox tentará reconectar automaticamente.".into())
}
static REQUESTS: LazyLock<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn endpoint(raw: &str) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(raw).map_err(|_| "Endpoint inválido.")?;
    if url.scheme() != "http" || !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]" | "::1")) || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() || url.path() != "/" { return Err("Use endpoint HTTP local (localhost, 127.0.0.1 ou ::1), sem caminho ou credenciais.".into()); }
    if url.host_str() == Some("localhost") { url.set_host(Some("127.0.0.1")).map_err(|e| e.to_string())?; }
    Ok(url)
}

#[tauri::command]
pub fn ollama_cancel(id: String) {
    if let Ok(mut requests) = REQUESTS.lock() { if let Some(handle) = requests.remove(&id) { handle.abort(); } }
}

#[tauri::command]
pub fn ollama_request(id: String, base: String, route: String, body: Option<serde_json::Value>, events: Channel<serde_json::Value>) -> Result<(), String> {
    let mut url = endpoint(&base)?;
    if !["/api/tags", "/api/chat"].contains(&route.as_str()) { return Err("Rota Ollama não autorizada.".into()); }
    if id.len() > 100 || body.as_ref().map(|v| v.to_string().len()).unwrap_or(0) > 256 * 1024 { return Err("Requisição excede o limite.".into()); }
    url.set_path(&route);
    let mut requests = REQUESTS.lock().map_err(|e| e.to_string())?;
    if requests.len() >= 4 || requests.contains_key(&id) { return Err("Limite de requisições locais atingido.".into()); }
    let key = id.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let result: Result<(), String> = async {
            let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(120)).connect_timeout(Duration::from_secs(5)).build().map_err(|e| e.to_string())?;
            let request = if let Some(body) = body { client.post(url).json(&body) } else { client.get(url) };
            let mut response = request.send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
            let mut total = 0;
            while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
                total += chunk.len(); if total > 2 * 1024 * 1024 { return Err("Resposta Ollama excede 2 MiB.".into()); }
                events.send(serde_json::json!({"bytes": chunk.to_vec()})).map_err(|e| e.to_string())?;
            }
            Ok(())
        }.await;
        let _ = events.send(match result { Ok(()) => serde_json::json!({"done":true}), Err(error) => serde_json::json!({"error":error}) });
        if let Ok(mut requests) = REQUESTS.lock() { requests.remove(&key); }
    });
    requests.insert(id, handle);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_local_http_endpoints_are_allowed() {
        assert!(endpoint("http://127.0.0.1:11434").is_ok());
        assert!(endpoint("http://localhost:11434").is_ok());
        for value in ["https://example.org", "http://192.168.1.2:11434", "http://localhost:11434/api/chat", "http://user@localhost:11434", "http://localhost:11434/?q=1"] { assert!(endpoint(value).is_err(), "{value}"); }
    }
}
