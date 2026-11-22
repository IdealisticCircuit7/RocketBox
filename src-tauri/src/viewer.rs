use std::{fs, io::Read, path::Path};

#[tauri::command]
pub async fn ler_dependencia_viewer(source: String, relative: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || read_dependency(&source,&relative)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

pub fn read_viewer(path: &str) -> Result<Vec<u8>, String> {
    let path = Path::new(path);
    if !path.is_absolute() { return Err("Caminho absoluto inválido.".into()); }
    let path = path.canonicalize().map_err(|e| format!("Falha de leitura: {e}"))?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "glb", "gltf", "obj", "fbx"].contains(&ext.as_str()) { return Err("Formato sem suporte no visualizador.".into()); }
    let file = fs::File::open(&path).map_err(|e| format!("Falha de leitura: {e}"))?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    const LIMIT: u64 = 32 * 1024 * 1024;
    if !metadata.is_file() || metadata.len() > LIMIT { return Err("O visualizador aceita arquivos de até 32 MiB.".into()); }
    let mut bytes = Vec::new();
    file.take(LIMIT + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT { return Err("Arquivo excede o limite.".into()); }
    Ok(bytes)
}

#[tauri::command]
pub async fn ler_recurso_viewer(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || read_viewer(&path)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

fn read_dependency(source:&str, relative:&str)->Result<Vec<u8>,String> {
        use std::path::Component;
        if !Path::new(source).is_absolute() { return Err("Origem deve ser absoluta.".into()); }
        let rel = Path::new(&relative);
        if relative.contains(['\\', ':', '\0', '%', '?', '#']) || rel.components().any(|c| !matches!(c, Component::Normal(_))) { return Err("Dependência fora do escopo local.".to_string()); }
        let source = Path::new(&source).canonicalize().map_err(|e| e.to_string())?;
        let root = source.parent().ok_or("Recurso sem diretório")?;
        let path = root.join(rel).canonicalize().map_err(|e| e.to_string())?;
        if !path.starts_with(root) { return Err("Dependência fora da pasta do recurso.".into()); }
        let file = fs::File::open(path).map_err(|e| e.to_string())?;
        if {let m=file.metadata().map_err(|e| e.to_string())?; !m.is_file() || m.len()>32*1024*1024} { return Err("Dependência não é arquivo.".into()); }
        let mut bytes = Vec::new(); file.take(32*1024*1024+1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        if bytes.len()>32*1024*1024 { return Err("Dependência excede 32 MiB.".into()); } Ok(bytes)

}

#[cfg(test)]
mod tests {
 use super::*;
 #[test]
 fn local_dependencies_are_read_without_allowing_parent_or_remote_paths() {
  let root=std::env::temp_dir().join(format!("rocketbox-viewer-{}",std::process::id()));
  fs::create_dir_all(root.join("textures")).unwrap();
  let source=root.join("model.gltf");fs::write(&source,b"{}").unwrap();fs::write(root.join("textures/color.png"),b"fixture").unwrap();
  assert_eq!(read_dependency(source.to_str().unwrap(),"textures/color.png").unwrap(),b"fixture");
  for bad in ["../secret","https://host/file","/absolute","C:/file","%2e%2e/file","textures"] {assert!(read_dependency(source.to_str().unwrap(),bad).is_err());}
  assert!(read_dependency(source.to_str().unwrap(),"missing.bin").is_err());
  fs::remove_file(root.join("textures/color.png")).unwrap();fs::remove_dir(root.join("textures")).unwrap();fs::remove_file(source).unwrap();fs::remove_dir(root).unwrap();
 }
}
