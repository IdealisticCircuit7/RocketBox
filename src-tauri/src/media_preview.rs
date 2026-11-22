use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
    sync::{LazyLock, Mutex},
};
use tauri::http::{Request, Response};
static MEDIA: LazyLock<Mutex<HashMap<String, PathBuf>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
#[tauri::command]
pub fn media_prepare(path: String, token: String) -> Result<String, String> {
    if token.len() != 36 || !token.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Token inválido".into());
    }
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err("Caminho absoluto obrigatório".into());
    }
    let p = p.canonicalize().map_err(|e| e.to_string())?;
    if !p.is_file()
        || !matches!(
            p.extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase()
                .as_str(),
            "wav" | "mp3" | "ogg"
        )
    {
        return Err("Formato de áudio sem suporte".into());
    }
    let mut media = MEDIA.lock().map_err(|e| e.to_string())?;
    if media.len() >= 16 {
        return Err("Limite de players simultâneos".into());
    }
    media.insert(token.clone(), p);
    Ok(token)
}
#[tauri::command]
pub fn media_release(token: String) {
    if let Ok(mut map) = MEDIA.lock() {
        map.remove(&token);
    }
}
pub fn byte_range(value: Option<&str>, len: u64) -> Result<(u64, u64), String> {
    if len == 0 {
        return Err("Áudio vazio".into());
    }
    let (start, end) = if let Some(value) = value {
        let value = value.strip_prefix("bytes=").ok_or("Range inválido")?;
        if value.contains(',') {
            return Err("Somente um range".into());
        }
        let (a, b) = value.split_once('-').ok_or("Range inválido")?;
        if a.is_empty() {
            let suffix = b.parse::<u64>().map_err(|_| "Range inválido")?;
            if suffix == 0 {
                return Err("Range inválido".into());
            }
            (len.saturating_sub(suffix), len - 1)
        } else {
            (
                a.parse::<u64>().map_err(|_| "Range inválido")?,
                if b.is_empty() {
                    len - 1
                } else {
                    b.parse::<u64>().map_err(|_| "Range inválido")?.min(len - 1)
                },
            )
        }
    } else {
        (0, len - 1)
    };
    if start >= len || end < start {
        return Err("Range fora do arquivo".into());
    }
    Ok((start, end.min(start.saturating_add(1024 * 1024 - 1))))
}
pub fn response(req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let run = || -> Result<Response<Vec<u8>>, String> {
        let token = req.uri().path().trim_start_matches('/');
        let path = MEDIA
            .lock()
            .map_err(|e| e.to_string())?
            .get(token)
            .cloned()
            .ok_or("Player encerrado ou não autorizado")?;
        let mut file = File::open(&path).map_err(|e| e.to_string())?;
        let len = file.metadata().map_err(|e| e.to_string())?.len();
        let range = req.headers().get("range").and_then(|v| v.to_str().ok());
        let (start, end) = byte_range(range, len)?;
        let mime = match path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str()
        {
            "wav" => "audio/wav",
            "mp3" => "audio/mpeg",
            _ => "audio/ogg",
        };
        if req.method() != tauri::http::Method::GET && req.method() != tauri::http::Method::HEAD {
            return Err("Método não permitido".into());
        }
        let mut bytes = Vec::new();
        if req.method() != tauri::http::Method::HEAD {
            file.seek(SeekFrom::Start(start))
                .map_err(|e| e.to_string())?;
            file.take(end - start + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
        }
        Response::builder()
            .status(if req.method() == tauri::http::Method::HEAD {
                200
            } else {
                206
            })
            .header("Content-Type", mime)
            .header("Accept-Ranges", "bytes")
            .header("Content-Range", format!("bytes {start}-{end}/{len}"))
            .header(
                "Content-Length",
                if req.method() == tauri::http::Method::HEAD {
                    len
                } else {
                    end - start + 1
                },
            )
            .header("Access-Control-Allow-Origin", "*")
            .body(bytes)
            .map_err(|e| e.to_string())
    };
    run().unwrap_or_else(|e| {
        Response::builder()
            .status(416)
            .body(e.into_bytes())
            .unwrap()
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ranges_are_bounded_and_seekable() {
        assert_eq!(byte_range(Some("bytes=10-19"), 100).unwrap(), (10, 19));
        assert_eq!(byte_range(Some("bytes=-10"), 100).unwrap(), (90, 99));
        assert_eq!(byte_range(None, 10_000_000).unwrap(), (0, 1048575));
        for v in ["bytes=100-", "bytes=30-10", "bytes=0-1,2-3", "bytes=-0"] {
            assert!(byte_range(Some(v), 100).is_err());
        }
        assert!(byte_range(None, 0).is_err());
    }
}

#[cfg(test)]
mod io_tests {
    use super::*;
    #[test]
    fn range_reads_and_release_are_real_and_bounded() {
        let path = std::env::temp_dir().join(format!("rocketbox-media-{}.wav", std::process::id()));
        std::fs::write(&path, b"RIFF-fixture-bytes").unwrap();
        let token = "12345678-1234-1234-1234-123456789abc".to_string();
        media_prepare(path.to_string_lossy().into_owned(), token.clone()).unwrap();
        let request = || {
            Request::builder()
                .uri(format!("rocketmedia://localhost/{token}"))
                .header("Range", "bytes=0-3")
                .body(vec![])
                .unwrap()
        };
        let data = response(request());
        assert_eq!(data.status(), 206);
        assert_eq!(data.body(), b"RIFF");
        media_release(token.clone());
        assert_eq!(response(request()).status(), 416);
        std::fs::remove_file(path).unwrap();
    }
}
