mod preview_process;
mod advanced_preview;
mod media_preview;
mod asset_vault;

mod legacy_commands;

mod technical_analysis;

mod viewer;

mod ollama;
mod app_state;

#[tauri::command]

fn localizar_recurso(path: String, app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;

    let input = std::path::Path::new(&path);

    if !input.is_absolute() || path.contains('\0') {
        return Err("Caminho absoluto inválido.".into());
    }

    if input.exists() {
        let inspected = inspecionar_recurso(path)?;

        app.opener()
            .reveal_item_in_dir(inspected.path)
            .map_err(|e| e.to_string())?;
        Ok("Original encontrado e exibido no Explorador de Arquivos.".into())
    } else {
        let parent = input
            .parent()
            .ok_or("Recurso ausente e sem diretório pai.")?;

        if !parent.is_dir() {
            return Err(
                "Original e diretório pai indisponíveis. Use Relink ou restaure do cofre.".into(),
            );
        }

        app.opener()
            .open_path(parent.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())?;
        Ok("Original ausente. A pasta pai existente foi aberta; use Localizar novamente ou restaure do cofre.".into())
    }
}

#[tauri::command]

fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]

struct ResourceInspection {
    path: String,

    is_directory: bool,

    size: Option<u64>,

    signature: Option<String>,

    structure_markers: Vec<String>,

    warnings: Vec<String>,
}

#[tauri::command]

fn inspecionar_recurso(path: String) -> Result<ResourceInspection, String> {
    use std::{fs, io::Read, path::Path};

    let input = Path::new(&path);

    if !input.is_absolute() || path.contains('\0') {
        return Err("Informe um caminho absoluto válido.".into());
    }

    let canonical = input
        .canonicalize()
        .map_err(|e| format!("Recurso indisponível: {e}"))?;

    let metadata =
        fs::metadata(&canonical).map_err(|e| format!("Sem acesso aos metadados: {e}"))?;

    let is_directory = metadata.is_dir();

    if !is_directory && !metadata.is_file() {
        return Err("O caminho não aponta para arquivo ou diretório regular.".into());
    }

    let mut markers = Vec::new();

    let mut warnings = Vec::new();

    let mut signature = None;

    if is_directory {
        fs::read_dir(&canonical).map_err(|e| format!("Sem permissão para ler o diretório: {e}"))?;

        for marker in ["Assets", "Packages", "ProjectSettings"] {
            if canonical.join(marker).is_dir() {
                markers.push(marker.to_string());
            }
        }

        if markers.len() != 3 {
            warnings.push("Estrutura Unity incompleta ou não identificada.".into());
        }
    } else {
        let mut file = fs::File::open(&canonical)
            .map_err(|e| format!("Sem permissão para ler o arquivo: {e}"))?;

        let mut header = [0u8; 32];

        let count = file
            .read(&mut header)
            .map_err(|e| format!("Falha ao ler o cabeçalho: {e}"))?;

        let bytes = &header[..count];

        signature = if bytes.starts_with(b"Kaydara FBX Binary") {
            Some("FBX_BIN".into())
        } else if bytes.starts_with(b"glTF") {
            Some("GLB".into())
        } else if bytes.starts_with(b"BLENDER") {
            Some("BLEND".into())
        } else if bytes.starts_with(b"PK\x03\x04") {
            Some("ZIP".into())
        } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            Some("PNG".into())
        } else if bytes.starts_with(b"\xff\xd8\xff") {
            Some("JPEG".into())
        } else if bytes.starts_with(b"v/1\x01") {
            Some("EXR".into())
        } else if bytes.starts_with(b"\xc1\x83\x2a\x9e") {
            Some("UASSET".into())
        } else if bytes.starts_with(b"\x1f\x8b") {
            Some("GZIP".into())
        } else if bytes.starts_with(b"; FBX") {
            Some("FBX_ASCII".into())
        } else {
            None
        };

        let extension = canonical
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        if extension == "uproject" {
            let parent = canonical.parent().ok_or("Projeto sem diretório pai.")?;

            for marker in ["Content", "Config"] {
                if parent.join(marker).is_dir() {
                    markers.push(marker.to_string());
                }
            }

            if markers.len() != 2 {
                warnings.push("Estrutura Unreal incompleta ou não identificada.".into());
            }
        }

        if signature.is_none() {
            warnings.push("Assinatura não verificada para este formato.".into());
        }
    }

    Ok(ResourceInspection {
        path: canonical.to_string_lossy().into_owned(),
        is_directory,

        size: if is_directory {
            None
        } else {
            Some(metadata.len())
        },

        signature,
        structure_markers: markers,
        warnings,
    })
}

#[cfg(windows)]
#[tauri::command]

async fn escolher_recurso(directory: bool) -> Option<String> {
    let dialog = rfd::AsyncFileDialog::new();

    let selected = if directory {
        dialog.pick_folder().await
    } else {
        dialog.pick_file().await
    };

    selected.map(|p| p.path().to_string_lossy().into_owned())
}

#[cfg(not(windows))]
#[tauri::command]

fn escolher_recurso(_directory: bool) -> Option<String> {
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("rocketmedia", |_ctx, request, responder| {std::thread::spawn(move || responder.respond(media_preview::response(request)));})
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_state::app_state_load, app_state::app_state_save, app_state::app_data_location, asset_vault::vault_relink_review,
            asset_vault::vault_config,
            asset_vault::vault_save_config,
            asset_vault::vault_plan,
            asset_vault::vault_run,
            asset_vault::vault_cancel,
            asset_vault::vault_list,
            asset_vault::vault_delete,
            greet,
            inspecionar_recurso,
            escolher_recurso,
            localizar_recurso,
            viewer::ler_recurso_viewer,
            advanced_preview::preview_validate,advanced_preview::preview_environment,advanced_preview::preview_configure_blender,advanced_preview::preview_blender,advanced_preview::preview_cancel,advanced_preview::preview_clear,advanced_preview::preview_unreal,advanced_preview::export_asset_as,media_preview::media_prepare,media_preview::media_release,
            viewer::ler_dependencia_viewer,
            technical_analysis::analisar_recurso,
            ollama::ollama_request,
            ollama::ollama_cancel,
            ollama::ollama_ensure_service,
            legacy_commands::rodar_inferencia,
            legacy_commands::escolher_arquivo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
