use serde::Serialize;
use std::{collections::BTreeMap, fs, io::Read, path::Path, sync::atomic::{AtomicBool, Ordering}, time::{Instant, UNIX_EPOCH}};

const MAX_BYTES: u64 = 1024 * 1024;
static BUSY: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectedFacts {
    path: String,
    fingerprint: String,
    format: String,
    metadata: BTreeMap<String, String>,
    evidence: Vec<String>,
    warnings: Vec<String>,
    not_performed: Vec<String>,
    errors: Vec<String>,
}

pub fn collect(path: &str) -> Result<CollectedFacts, String> {
    let started = Instant::now();
    if !Path::new(path).is_absolute() || path.contains('\0') { return Err("Caminho absoluto inválido.".into()); }
    let canonical = fs::canonicalize(path).map_err(|e| format!("Recurso indisponível: {e}"))?;
    let before = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    let mut facts = CollectedFacts { path: canonical.to_string_lossy().into(), fingerprint: String::new(), format: canonical.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase(), metadata: BTreeMap::new(), evidence: vec![], warnings: vec![], not_performed: vec!["Importação no software de destino".into(), "Dependências externas, geometria completa, rig e materiais".into()], errors: vec![] };
    let modified = before.modified().map_err(|e| e.to_string())?.duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let mut checksum: u64 = 0xcbf29ce484222325;
    if before.is_dir() {
        fs::read_dir(&canonical).map_err(|e| format!("Diretório sem acesso: {e}"))?;
        facts.format = "directory".into();
        for name in ["Assets", "Packages", "ProjectSettings"] {
            let exists = canonical.join(name).is_dir();
            facts.metadata.insert(name.into(), exists.to_string());
        }
        facts.not_performed.push("Varredura recursiva e conteúdo dos arquivos do projeto".into());
    } else if before.is_file() {
        let mut bytes = Vec::new();
        fs::File::open(&canonical).map_err(|e| format!("Arquivo sem acesso: {e}"))?.take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > MAX_BYTES { bytes.truncate(MAX_BYTES as usize); facts.not_performed.push("Conteúdo após o primeiro MiB".into()); }
        for b in &bytes { checksum ^= *b as u64; checksum = checksum.wrapping_mul(0x100000001b3); }
        facts.metadata.insert("bytesLidos".into(), bytes.len().to_string());
        facts.metadata.insert("tamanhoBytes".into(), before.len().to_string());
        let expected: Option<bool> = match facts.format.as_str() {
            "blend" => { if bytes.len() >= 12 && bytes.starts_with(b"BLENDER") { facts.metadata.insert("versaoBlenderHeader".into(), String::from_utf8_lossy(&bytes[9..12]).into()); } Some(bytes.len() >= 12 && bytes.starts_with(b"BLENDER")) },
            "fbx" => Some(bytes.starts_with(b"Kaydara FBX Binary") || String::from_utf8_lossy(&bytes).contains("FBXHeaderExtension")),
            "uasset" => Some(bytes.starts_with(b"\xc1\x83\x2a\x9e")),
            "unitypackage" => { facts.not_performed.push("Extração TAR e validação dos membros do pacote".into()); Some(bytes.starts_with(b"\x1f\x8b")) },
            "png" => { if bytes.len() >= 24 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") { facts.metadata.insert("largura".into(), u32::from_be_bytes(bytes[16..20].try_into().unwrap()).to_string()); facts.metadata.insert("altura".into(), u32::from_be_bytes(bytes[20..24].try_into().unwrap()).to_string()); } Some(bytes.len() >= 24 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") && &bytes[12..16] == b"IHDR") },
            "glb" => { if bytes.len() >= 12 && bytes.starts_with(b"glTF") { facts.metadata.insert("versaoGLB".into(), u32::from_le_bytes(bytes[4..8].try_into().unwrap()).to_string()); facts.metadata.insert("comprimentoDeclarado".into(), u32::from_le_bytes(bytes[8..12].try_into().unwrap()).to_string()); if u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as u64 != before.len() { facts.errors.push("Comprimento GLB diverge do arquivo.".into()); } } Some(bytes.len() >= 12 && bytes.starts_with(b"glTF")) },
            "uproject" | "gltf" if before.len() <= MAX_BYTES => {
                match serde_json::from_slice::<serde_json::Value>(&bytes) {
                    Ok(value) if value.is_object() => {
                        if facts.format == "uproject" { for key in ["FileVersion", "EngineAssociation"] { if let Some(v) = value.get(key) { facts.metadata.insert(key.into(), v.to_string()); } } Some(value.get("FileVersion").is_some()) }
                        else { if let Some(v) = value.pointer("/asset/version") { facts.metadata.insert("versaoGLTF".into(), v.to_string()); } Some(value.pointer("/asset/version").is_some()) }
                    },
                    _ => Some(false)
                }
            },
            "obj" => { let text = String::from_utf8_lossy(&bytes); Some(text.lines().any(|l| l.starts_with("v "))) },
            _ => None,
        };
        match expected {
            Some(true) => { facts.metadata.insert("conteudoReconhecido".into(), "true".into()); facts.evidence.push("Cabeçalho/estrutura inicial coerente com a extensão; integridade completa não verificada.".into()); },
            Some(false) => facts.errors.push("Conteúdo inicial não corresponde ao formato informado ou arquivo está truncado.".into()),
            None => facts.not_performed.push("Validação de conteúdo deste formato".into()),
        }
    } else { return Err("Tipo de recurso não suportado.".into()); }
    let after = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if before.len() != after.len() || before.modified().ok() != after.modified().ok() { return Err("Arquivo mudou durante a coleta; tente novamente.".into()); }
    if started.elapsed().as_secs() >= 5 { return Err("Limite de tempo da coleta excedido.".into()); }
    facts.fingerprint = format!("{}:{modified}:{checksum:x}:{:?}", before.len(), facts.metadata);
    facts.metadata.insert("modificadoUnixNs".into(), modified.to_string());
    facts.evidence.push(format!("Coleta local somente leitura; limite de {MAX_BYTES} bytes, sem executar conteúdo."));
    facts.not_performed.push("Hash integral do recurso; alterações além do prefixo com tamanho e data preservados não são detectadas".into());
    Ok(facts)
}

#[tauri::command]
pub async fn analisar_recurso(path: String) -> Result<CollectedFacts, String> {
    if BUSY.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() { return Err("Uma análise já está em execução. Tente novamente.".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        struct Release;
        impl Drop for Release { fn drop(&mut self) { BUSY.store(false, Ordering::SeqCst); } }
        let _release = Release;
        collect(&path)
    }).await.map_err(|e| format!("Falha no worker: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::SystemTime;
    #[test]
    fn collects_known_truncated_unknown_and_changed_files() {
        let dir = std::env::temp_dir().join(format!("rocket-analysis-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&dir).unwrap();
        let p = dir.join("sample.blend");
        fs::write(&p, b"BLENDER-v300").unwrap();
        let first = collect(p.to_str().unwrap()).unwrap();
        assert_eq!(first.metadata.get("conteudoReconhecido").unwrap(), "true");
        fs::write(&p, b"bad").unwrap();
        let second = collect(p.to_str().unwrap()).unwrap();
        assert!(!second.errors.is_empty()); assert_ne!(first.fingerprint, second.fingerprint);
        let unknown = dir.join("sample.xyz"); fs::write(&unknown, b"data").unwrap();
        assert!(!collect(unknown.to_str().unwrap()).unwrap().metadata.contains_key("conteudoReconhecido"));
        assert!(collect(dir.join("missing").to_str().unwrap()).is_err());
        let glb = dir.join("sample.glb");
        let mut glb_bytes = b"glTF".to_vec(); glb_bytes.extend(2u32.to_le_bytes()); glb_bytes.extend(12u32.to_le_bytes());
        fs::write(&glb, glb_bytes).unwrap();
        assert_eq!(collect(glb.to_str().unwrap()).unwrap().metadata.get("versaoGLB").unwrap(), "2");
        let obj = dir.join("sample.obj"); fs::write(&obj, b"# fixture\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n").unwrap();
        assert!(collect(obj.to_str().unwrap()).unwrap().errors.is_empty());
        let project = dir.join("sample.uproject"); fs::write(&project, br#"{"FileVersion":3,"EngineAssociation":"5.4"}"#).unwrap();
        assert_eq!(collect(project.to_str().unwrap()).unwrap().metadata.get("EngineAssociation").unwrap(), "\"5.4\"");
        fs::write(&project, b"{").unwrap(); assert!(!collect(project.to_str().unwrap()).unwrap().errors.is_empty());
        for marker in ["Assets", "Packages", "ProjectSettings"] { fs::create_dir(dir.join(marker)).unwrap(); }
        assert_eq!(collect(dir.to_str().unwrap()).unwrap().metadata.get("Assets").unwrap(), "true");
        for marker in ["Assets", "Packages", "ProjectSettings"] { fs::remove_dir(dir.join(marker)).unwrap(); }
        fs::remove_file(glb).unwrap(); fs::remove_file(obj).unwrap(); fs::remove_file(project).unwrap();
        fs::remove_file(p).unwrap(); fs::remove_file(unknown).unwrap(); fs::remove_dir(dir).unwrap();
    }
}
