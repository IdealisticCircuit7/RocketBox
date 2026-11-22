// Prevents additional console window on Windows in release

use std::process::Command;
use tauri::command;

#[command]
pub(crate) fn rodar_inferencia(engine: &str, categoria: &str, formato: &str) -> String {
    // Chama o Python no background passando as escolhas do usuário
    let output = Command::new("python")
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .arg("../python/motor_rocketbox.py") // Relativo ao diretório src-tauri
        .arg(engine)
        .arg(categoria)
        .arg(formato)
        .output()
        .expect("Falha ao executar o Motor Especialista OCSIS");

    String::from_utf8_lossy(&output.stdout).to_string()
}

#[derive(serde::Serialize)]
pub(crate) struct SelectedAssetFile {
    path: String,
    preview: Option<Vec<u8>>,
}

#[command]
pub(crate) async fn escolher_arquivo() -> Result<Option<SelectedAssetFile>, String> {
    #[cfg(windows)]
    {
        use std::io::Read;
        let Some(handle) = rfd::AsyncFileDialog::new().pick_file().await else { return Ok(None) };
        let path = handle.path();
        let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        let preview = if matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp") {
            let limit = 4 * 1024 * 1024;
            let mut bytes = Vec::new();
            std::fs::File::open(path).ok().and_then(|file| file.take(limit + 1).read_to_end(&mut bytes).ok())
                .filter(|&size| size > 0 && size <= limit as usize).map(|_| bytes)
        } else { None };
        Ok(Some(SelectedAssetFile { path: path.to_string_lossy().into_owned(), preview }))
    }
    #[cfg(not(windows))]
    Err("Seleção nativa disponível no Windows.".into())
}

