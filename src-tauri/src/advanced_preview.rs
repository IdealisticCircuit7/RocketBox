use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
type R<T> = Result<T, String>;
static BUSY: Mutex<()> = Mutex::new(());
static CANCEL: AtomicBool = AtomicBool::new(false);
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    asset_id: String,
    source: String,
    hash: String,
    adapter: String,
    format: String,
    created_at: u64,
    path: String,
    output_hash: String,
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn stamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn unredirected(path: &Path) -> R<()> {
    let metadata = fs::symlink_metadata(path).map_err(error)?;
    if metadata.file_type().is_symlink() {
        return Err("Cache com link não permitido".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Cache com reparse point não permitido".into());
        }
    }
    Ok(())
}
fn root(app: &tauri::AppHandle) -> R<PathBuf> {
    let p = app
        .path()
        .app_cache_dir()
        .map_err(error)?
        .join("rocketbox-previews-v1");
    fs::create_dir_all(&p).map_err(error)?;
    unredirected(&p)?;
    if fs::symlink_metadata(&p)
        .map_err(error)?
        .file_type()
        .is_symlink()
    {
        return Err("Cache redirecionado não permitido".into());
    }
    p.canonicalize().map_err(error)
}
fn digest(path: &Path) -> R<String> {
    let mut f = fs::File::open(path).map_err(error)?;
    let mut h = Sha256::new();
    let mut b = [0; 65536];
    loop {
        if CANCEL.load(Ordering::Relaxed) {
            return Err("Conversão cancelada".into());
        }
        let n = f.read(&mut b).map_err(error)?;
        if n == 0 {
            break;
        }
        h.update(&b[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}
fn source(path: &str, ext: &str) -> R<PathBuf> {
    if !Path::new(path).is_absolute() {
        return Err("Caminho absoluto obrigatório".into());
    }
    let p = Path::new(path).canonicalize().map_err(error)?;
    let m = fs::metadata(&p).map_err(error)?;
    if !m.is_file()
        || p.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
            != ext
    {
        return Err("Formato de origem incorreto".into());
    }
    if m.len() > 256 * 1024 * 1024 {
        return Err(
            "Arquivo grande: limite de conversão de 256 MiB. Abra no software de origem.".into(),
        );
    }
    Ok(p)
}
fn detect_blender() -> Vec<String> {
    let mut out = Vec::new();
    if let Some(program) = std::env::var_os("ProgramFiles") {
        let dir = PathBuf::from(program).join("Blender Foundation");
        if let Ok(items) = fs::read_dir(dir) {
            for item in items.flatten() {
                let exe = item.path().join("blender.exe");
                if exe.is_file() {
                    out.push(exe.to_string_lossy().into_owned());
                }
            }
        }
    }
    out.sort();
    out.reverse();
    out
}
fn config(app: &tauri::AppHandle) -> R<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(error)?
        .join("preview-blender.json"))
}
fn executable(path: &str) -> R<PathBuf> {
    let p = Path::new(path).canonicalize().map_err(error)?;
    if !p.is_file()
        || !p
            .file_name()
            .map(|s| s.to_string_lossy().eq_ignore_ascii_case("blender.exe"))
            .unwrap_or(false)
    {
        return Err("Selecione o executável Blender instalado (blender.exe)".into());
    }
    Ok(p)
}
#[tauri::command]
pub fn preview_environment(app: tauri::AppHandle) -> R<serde_json::Value> {
    let installed = detect_blender();
    let configured = fs::read_to_string(config(&app)?)
        .ok()
        .and_then(|s| serde_json::from_str::<String>(&s).ok());
    let mut unreal = Vec::new();
    if let Some(program) = std::env::var_os("ProgramFiles") {
        if let Ok(items) = fs::read_dir(PathBuf::from(program).join("Epic Games")) {
            for item in items.flatten() {
                let build = item.path().join("Engine/Build/Build.version");
                if let Ok(s) = fs::read_to_string(build) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                        unreal.push(serde_json::json!({"directory":item.path(),"version":v}));
                    }
                }
            }
        }
    }
    Ok(
        serde_json::json!({"blender":configured.or_else(||installed.first().cloned()),"installedBlender":installed,"unreal":unreal}),
    )
}
#[tauri::command]
pub fn preview_configure_blender(app: tauri::AppHandle, path: String) -> R<()> {
    let p = executable(&path)?;
    let dest = config(&app)?;
    fs::create_dir_all(dest.parent().unwrap()).map_err(error)?;
    fs::write(
        dest,
        serde_json::to_vec(&p.to_string_lossy()).map_err(error)?,
    )
    .map_err(error)
}
struct ChildGuard(std::process::Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
struct Work(PathBuf);
impl Drop for Work {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn convert(cache: &Path, exe: &Path, asset_id: &str, path: &str) -> R<Preview> {
    let src = source(path, "blend")?;
    let hash = digest(&src)?;
    let metadata = fs::metadata(exe).map_err(error)?;
    let adapter = format!(
        "blender-glb-v1:{}:{}:{:?}:{:x}",
        exe.display(),
        metadata.len(),
        metadata.modified().map_err(error)?,
        Sha256::digest(include_str!("blender_preview.py").as_bytes())
    );
    let key = format!(
        "{:x}",
        Sha256::digest(format!("{asset_id}|{}|{hash}|{adapter}", src.display()).as_bytes())
    );
    let final_dir = cache.join(&key);
    if final_dir.exists() {
        unredirected(&final_dir)?;
    }
    let manifest = final_dir.join("manifest.json");
    if manifest.exists() {
        unredirected(&manifest)?;
        unredirected(&final_dir.join("preview.glb"))?;
    }
    if let Ok(data) = fs::read(&manifest) {
        if let Ok(p) = serde_json::from_slice::<Preview>(&data) {
            let output = final_dir.join("preview.glb");
            if p.hash == hash
                && p.asset_id == asset_id
                && p.adapter == adapter
                && p.path == output.to_string_lossy()
                && output.is_file()
                && digest(&output)? == p.output_hash
            {
                return Ok(p);
            }
        }
        return Err("Cache inválido; limpe o cache antes de tentar novamente".into());
    }
    let used = fs::read_dir(cache)
        .map_err(error)?
        .filter_map(Result::ok)
        .map(|e| {
            fs::metadata(e.path().join("preview.glb"))
                .map(|m| m.len())
                .unwrap_or(0)
        })
        .sum::<u64>();
    if used > 480 * 1024 * 1024 {
        return Err("Cache próximo do limite de 512 MiB; limpe as prévias".into());
    }
    let work = Work(cache.join(format!(".work-{}-{}", std::process::id(), stamp())));
    fs::create_dir(&work.0).map_err(error)?;
    let script = work.0.join("export.py");
    fs::write(&script, include_str!("blender_preview.py")).map_err(error)?;
    let output = work.0.join("preview.glb");
    let mut command = Command::new(exe);
    command
        .args([
            "--background",
            "--factory-startup",
            "--disable-autoexec",
            "--threads",
            "2",
            "--python-exit-code",
            "20",
            "--python",
        ])
        .arg(&script)
        .arg("--")
        .arg(&src)
        .arg(&output)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = ChildGuard(command.spawn().map_err(error)?);
    let _process_limit = crate::preview_process::ProcessLimit::attach(&child.0)?;
    let start = Instant::now();
    loop {
        if CANCEL.load(Ordering::Relaxed) || start.elapsed() > Duration::from_secs(120) {
            return Err("Conversão cancelada ou timeout de 120 s; original preservado".into());
        }
        if let Some(status) = child.0.try_wait().map_err(error)? {
            if !status.success() {
                return Err("Blender não conseguiu exportar. Dependências ausentes, complexidade ou variante sem suporte; original preservado.".into());
            }
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    if digest(&src)? != hash {
        return Err("Original mudou durante a conversão; prévia descartada".into());
    }
    let mut header = [0; 4];
    fs::File::open(&output)
        .map_err(error)?
        .read_exact(&mut header)
        .map_err(error)?;
    if &header != b"glTF" || fs::metadata(&output).map_err(error)?.len() > 32 * 1024 * 1024 {
        return Err("Prévia GLB inválida ou muito grande".into());
    }
    let preview = Preview {
        asset_id: asset_id.into(),
        source: src.to_string_lossy().into_owned(),
        hash,
        adapter,
        format: "glb".into(),
        created_at: stamp(),
        path: final_dir.join("preview.glb").to_string_lossy().into_owned(),
        output_hash: digest(&output)?,
    };
    fs::remove_file(script).map_err(error)?;
    fs::write(
        work.0.join("manifest.json"),
        serde_json::to_vec_pretty(&preview).map_err(error)?,
    )
    .map_err(error)?;
    fs::rename(&work.0, &final_dir).map_err(error)?;
    Ok(preview)
}
#[tauri::command]
pub async fn preview_blender(app: tauri::AppHandle, asset_id: String, path: String) -> R<Preview> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = BUSY
            .try_lock()
            .map_err(|_| "Outra conversão está em andamento")?;
        CANCEL.store(false, Ordering::Relaxed);
        if asset_id.is_empty() || asset_id.len() > 500 {
            return Err("ID inválido".into());
        }
        let env = preview_environment(app.clone())?;
        let exe = executable(
            env["blender"]
                .as_str()
                .ok_or("Blender não instalado/configurado")?,
        )?;
        convert(&root(&app)?, &exe, &asset_id, &path)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub fn preview_cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}
#[tauri::command]
pub fn preview_clear(app: tauri::AppHandle, confirmed: bool) -> R<()> {
    if !confirmed {
        return Err("Confirme a limpeza do cache de prévias, que não é backup".into());
    }
    let _lock = BUSY.try_lock().map_err(|_| "Aguarde o fim da conversão")?;
    let root = root(&app)?;
    for entry in fs::read_dir(&root).map_err(error)? {
        let entry = entry.map_err(error)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.len() == 64
            && name.chars().all(|c| c.is_ascii_hexdigit())
            && entry.file_type().map_err(error)?.is_dir()
        {
            unredirected(&entry.path())?;
            fs::remove_dir_all(entry.path()).map_err(error)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn preview_unreal(path: String) -> R<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move||{let source=source(&path,"uasset")?;let mut parent=source.parent();while let Some(dir)=parent{if let Ok(entries)=fs::read_dir(dir){for entry in entries.flatten(){let p=entry.path();if p.extension().and_then(|s|s.to_str())==Some("uproject"){let meta=fs::metadata(&p).map_err(error)?;if meta.len()>1024*1024{return Err("Descritor de projeto excessivo".into());}let json:serde_json::Value=serde_json::from_slice(&fs::read(&p).map_err(error)?).map_err(error)?;return Ok(serde_json::json!({"project":p,"engineAssociation":json["EngineAssociation"],"relativeAsset":source.strip_prefix(dir).map_err(error)?.to_string_lossy(),"bytes":fs::metadata(&source).map_err(error)?.len(),"type":"não identificado sem Unreal Editor","export":"assistido: selecione no Editor um asset exportável; exporte GLB/FBX e abra no Viewer. Plugins/versões precisam ser verificados no Editor; nenhum projeto é alterado automaticamente."}));}}}parent=dir.parent();}Ok(serde_json::json!({"project":null,"bytes":fs::metadata(source).map_err(error)?.len(),"export":"Prévia indisponível: projeto associado não encontrado. UASSET não é lido diretamente."}))}).await.map_err(error)?
}

#[tauri::command]
pub async fn preview_validate(app: tauri::AppHandle, preview: Preview) -> R<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = BUSY.try_lock().map_err(|_| "Conversão ocupada")?;
        CANCEL.store(false, Ordering::Relaxed);
        let root = root(&app)?;
        let Ok(output) = Path::new(&preview.path).canonicalize() else {
            return Ok(false);
        };
        if !output.starts_with(&root)
            || output.file_name().and_then(|s| s.to_str()) != Some("preview.glb")
        {
            return Ok(false);
        }
        let Ok(src) = source(&preview.source, "blend") else {
            return Ok(false);
        };
        Ok(digest(&src)? == preview.hash && digest(&output)? == preview.output_hash)
    })
    .await
    .map_err(error)?
}

fn export_source(path: &str) -> R<(PathBuf, String)> {
    if !Path::new(path).is_absolute() {
        return Err("Caminho absoluto obrigatório".into());
    }
    unredirected(Path::new(path))?;
    let p = Path::new(path).canonicalize().map_err(error)?;
    let m = fs::metadata(&p).map_err(error)?;
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !m.is_file() || !["blend", "fbx", "obj", "glb", "gltf"].contains(&ext.as_str()) {
        return Err(
            "Formato de origem sem suporte para conversão. Suportados: .blend, .fbx, .obj, .glb e .gltf.".into(),
        );
    }
    if m.len() > 256 * 1024 * 1024 {
        return Err(
            "Arquivo grande: limite de conversão de 256 MiB. Abra no software de origem.".into(),
        );
    }
    Ok((p, ext))
}

fn next_available_target(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let primary = dir.join(format!("{stem}.{ext}"));
    if !primary.exists() {
        return primary;
    }
    for idx in 1..1000 {
        let candidate = dir.join(format!("{stem}-{idx}.{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem}-{}.{ext}", stamp()))
}

#[tauri::command]
pub async fn export_asset_as(
    app: tauri::AppHandle,
    source_path: String,
    destination_dir: String,
    target_format: String,
) -> R<serde_json::Value> {
    let fmt = target_format.trim().to_lowercase();
    if !["fbx", "obj", "glb", "gltf"].contains(&fmt.as_str()) {
        return Err("Formato de exportação inválido. Escolha FBX, OBJ, GLB ou GLTF.".into());
    }
    let configured = fs::read_to_string(config(&app)?)
        .ok()
        .and_then(|s| serde_json::from_str::<String>(&s).ok());
    let blender_exe = configured
        .or_else(|| detect_blender().into_iter().next())
        .ok_or("Blender não configurado. Configure o executável do Blender para exportar como outro formato.")?;
    let exe = executable(&blender_exe)?;
    let (src, _src_ext) = export_source(&source_path)?;

    if !Path::new(&destination_dir).is_absolute() {
        return Err("Escolha uma pasta de destino válida.".into());
    }
    unredirected(Path::new(&destination_dir))?;
    let dest_dir = Path::new(&destination_dir).canonicalize().map_err(error)?;
    if !dest_dir.is_dir() {
        return Err("O destino selecionado precisa ser uma pasta existente.".into());
    }

    let cache = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = BUSY.lock().map_err(error)?;
        CANCEL.store(false, Ordering::Relaxed);
        let work = Work(cache.join(format!(".work-export-{}-{}", std::process::id(), stamp())));
        fs::create_dir(&work.0).map_err(error)?;
        let script = work.0.join("export.py");
        fs::write(&script, include_str!("blender_export.py")).map_err(error)?;

        let stem = src
            .file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("asset");
        let staged_name = format!("{stem}.{fmt}");
        let staged_output = work.0.join(&staged_name);

        let mut command = Command::new(&exe);
        command
            .args([
                "--background",
                "--factory-startup",
                "--disable-autoexec",
                "--threads",
                "2",
                "--python-exit-code",
                "20",
                "--python",
            ])
            .arg(&script)
            .arg("--")
            .arg(&src)
            .arg(&staged_output)
            .arg(&fmt)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = ChildGuard(command.spawn().map_err(error)?);
        let _process_limit = crate::preview_process::ProcessLimit::attach(&child.0)?;
        let start = Instant::now();
        loop {
            if CANCEL.load(Ordering::Relaxed) || start.elapsed() > Duration::from_secs(120) {
                return Err("Exportação cancelada ou timeout de 120 s; original preservado.".into());
            }
            if let Some(status) = child.0.try_wait().map_err(error)? {
                if !status.success() {
                    return Err("Blender não conseguiu converter este arquivo. Verifique dependências ou geometria; original preservado.".into());
                }
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        if !staged_output.is_file() {
            return Err("Arquivo convertido não encontrado após execução.".into());
        }
        let final_target = next_available_target(&dest_dir, stem, &fmt);
        fs::copy(&staged_output, &final_target).map_err(error)?;

        // Para OBJ (.mtl) e GLTF (.bin / texturas), copia arquivos auxiliares gerados na pasta de trabalho.
        if fmt == "obj" || fmt == "gltf" {
            if let Ok(items) = fs::read_dir(&work.0) {
                for entry in items.flatten() {
                    let path = entry.path();
                    if path == script || path == staged_output || !path.is_file() {
                        continue;
                    }
                    if let Some(name) = path.file_name() {
                        let aux_dest = dest_dir.join(name);
                        if !aux_dest.exists() {
                            let _ = fs::copy(&path, &aux_dest);
                        }
                    }
                }
            }
        }

        Ok(serde_json::json!({
            "outputPath": final_target.to_string_lossy().into_owned(),
            "format": fmt,
            "source": src.to_string_lossy().into_owned()
        }))
    })
    .await
    .map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn oversized_original_is_rejected_before_launch() {
        let path = std::env::temp_dir().join(format!(
            "rocketbox-preview-large-{}.blend",
            std::process::id()
        ));
        let f = fs::File::create(&path).unwrap();
        f.set_len(257 * 1024 * 1024).unwrap();
        drop(f);
        assert!(
            source(path.to_str().unwrap(), "blend")
                .unwrap_err()
                .contains("grande")
        );
        fs::remove_file(path).unwrap();
    }
    #[test]
    #[ignore = "requires installed Blender; run explicitly with default user privileges"]
    fn real_blender_conversions_cache_and_cancellation() {
        let _lock = BUSY.lock().unwrap();
        CANCEL.store(false, Ordering::Relaxed);
        let fixture = std::env::temp_dir().join("rocketbox-etapa15-fixtures");
        fs::create_dir_all(&fixture).unwrap();
        let cache = fixture.join("cache");
        fs::create_dir_all(&cache).unwrap();
        let exe = executable(&detect_blender()[0]).unwrap();
        let create = fixture.join("create.py");
        fs::write(
            &create,
            include_str!("../../tests/fixtures/etapa15-create.py"),
        )
        .unwrap();
        let status = Command::new(&exe)
            .args([
                "--background",
                "--factory-startup",
                "--disable-autoexec",
                "--python-exit-code",
                "20",
                "--python",
            ])
            .arg(create)
            .arg("--")
            .arg(&fixture)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
        let retained = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("tests/fixtures");
        fs::copy(
            fixture.join("animated.fbx"),
            retained.join("etapa15-animated.fbx"),
        )
        .unwrap();
        for name in ["simple", "multiple", "materials", "rig"] {
            let input = fixture.join(format!("{name}.blend"));
            let before = digest(&input).unwrap();
            let p = convert(&cache, &exe, name, input.to_str().unwrap()).unwrap();
            assert_eq!(digest(&input).unwrap(), before);
            let second = convert(&cache, &exe, name, input.to_str().unwrap()).unwrap();
            assert_eq!(p.path, second.path);
            let glb = fs::read(&p.path).unwrap();
            let length = u32::from_le_bytes(glb[12..16].try_into().unwrap()) as usize;
            let json: serde_json::Value = serde_json::from_slice(&glb[20..20 + length]).unwrap();
            assert!(!json["meshes"].as_array().unwrap().is_empty());
            if name == "multiple" {
                assert!(json["meshes"].as_array().unwrap().len() > 1);
            }
            if name == "materials" {
                assert!(
                    json["materials"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|m| m["name"] == "Fixture Copper")
                );
            }
            if name == "rig" {
                fs::copy(&p.path, retained.join("etapa15-animated.glb")).unwrap();
                assert!(!json["skins"].as_array().unwrap().is_empty());
                assert!(!json["animations"].as_array().unwrap().is_empty());
            }
            println!("VERIFIED {name}: {}", p.path);
        }
        let input = fixture.join("simple.blend");
        let before = digest(&input).unwrap();
        let old = convert(&cache, &exe, "simple", input.to_str().unwrap()).unwrap();
        fs::copy(fixture.join("multiple.blend"), &input).unwrap();
        let next = convert(&cache, &exe, "simple", input.to_str().unwrap()).unwrap();
        assert_ne!(old.hash, next.hash);
        assert_ne!(old.path, next.path);
        fs::write(&next.path, b"corrupt").unwrap();
        assert!(convert(&cache, &exe, "simple", input.to_str().unwrap()).is_err());
        assert!(
            convert(
                &cache,
                &exe,
                "missing",
                fixture.join("missing.blend").to_str().unwrap()
            )
            .is_err()
        );
        let t = std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(250));
            CANCEL.store(true, Ordering::Relaxed);
        });
        let result = convert(&cache, &exe, "cancel-fixture", input.to_str().unwrap());
        t.join().unwrap();
        assert!(result.is_err());
        CANCEL.store(false, Ordering::Relaxed);
        assert_ne!(before, digest(&input).unwrap());
        assert!(
            !fs::read_dir(&cache)
                .unwrap()
                .flatten()
                .any(|e| e.file_name().to_string_lossy().starts_with(".work"))
        );
        println!("FIXTURES {}", fixture.display());
    }
}
