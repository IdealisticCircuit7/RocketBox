use serde::{Deserialize, Serialize};

use sha2::{Digest, Sha256};

use std::{
    collections::{BTreeSet, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::Manager;

type R<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn reject_link(path: &Path) -> R<()> {
    let metadata = fs::symlink_metadata(path).map_err(err)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Links e junctions não são permitidos.".into());
        }
    }
    if metadata.file_type().is_symlink() {
        return Err("Links simbólicos não são permitidos.".into());
    }
    Ok(())
}
fn reject_link_ancestors(path: &Path) -> R<()> {
    for parent in path.ancestors() {
        reject_link(parent)?;
    }
    Ok(())
}

static JOB: Mutex<Option<(String, Arc<AtomicBool>)>> = Mutex::new(None);

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]

pub struct Config {
    pub enabled: bool,
    pub directory: String,
    pub max_bytes: u64,
    pub max_versions: usize,
    pub automatic: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: false,
            directory: String::new(),
            max_bytes: 10 * 1024 * 1024 * 1024,
            max_versions: 5,
            automatic: false,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]

pub struct Entry {
    pub relative: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]

pub struct Manifest {
    pub schema: u32,
    pub version: String,
    pub asset_id: String,
    pub source: String,
    pub scope: String,
    pub created_at: u64,
    pub entries: Vec<Entry>,
    pub warnings: Vec<String>,
    #[serde(default = "unchecked")]
    pub verification: String,
}

fn unchecked() -> String {
    "not_checked".into()
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]

pub struct Plan {
    pub root: String,
    pub paths: Vec<String>,
    pub bytes: u64,
    pub warnings: Vec<String>,
    pub fingerprint: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]

pub struct Request {
    pub job_id: String,
    pub action: String,
    pub asset_id: String,
    pub source: String,
    pub scope: String,
    pub selected: Vec<String>,
    pub version: Option<String>,
    pub destination: Option<String>,
    pub expected_plan: Option<Plan>,
}

fn id(s: &str) -> R<()> {
    if s.is_empty()
        || s.len() > 160
        || !s
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Err("Identificador inválido.".into())
    } else {
        Ok(())
    }
}

fn relative(s: &str) -> R<PathBuf> {
    let p = Path::new(s);
    if s.is_empty()
        || s.contains(['\\', ':', '\0'])
        || p.components().any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(format!("Caminho relativo inseguro: {s}"));
    }
    Ok(p.to_owned())
}

fn absolute(s: &str) -> R<PathBuf> {
    let p = Path::new(s);
    if !p.is_absolute() || s.contains('\0') {
        return Err("Informe caminho absoluto.".into());
    }
    Ok(p.to_owned())
}

fn regular(p: &Path) -> R<()> {
    reject_link_ancestors(p)?;
    let m = fs::symlink_metadata(p).map_err(err)?;
    if m.file_type().is_symlink() || !m.is_file() {
        return Err("Somente arquivos regulares, sem links simbólicos.".into());
    }
    Ok(())
}

fn contained(root: &Path, rel: &str) -> R<PathBuf> {
    reject_link_ancestors(root)?;
    let root_canonical = root.canonicalize().map_err(err)?;
    let root = root_canonical.as_path();
    let rel = relative(rel)?;
    let mut p = root.to_owned();
    for part in rel.components() {
        p.push(part);
        reject_link(&p)?;
    }
    let p = p.canonicalize().map_err(err)?;
    if !p.starts_with(root) {
        return Err("Arquivo fora do escopo.".into());
    }
    regular(&p)?;
    Ok(p)
}

fn checkpoint(cancel: &AtomicBool) -> R<()> {
    if cancel.load(Ordering::Relaxed) {
        Err("Operação cancelada; originais preservados.".into())
    } else {
        Ok(())
    }
}

fn hash(p: &Path, cancel: &AtomicBool) -> R<String> {
    regular(p)?;
    let mut f = File::open(p).map_err(err)?;
    let mut h = Sha256::new();
    let mut buf = [0; 65536];
    loop {
        checkpoint(cancel)?;
        let n = f.read(&mut buf).map_err(err)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}

fn small_text(p: &Path) -> R<String> {
    if fs::metadata(p).map_err(err)?.len() > 8 * 1024 * 1024 {
        return Err("Descritor excede 8 MiB; selecione dependências explicitamente.".into());
    }
    fs::read_to_string(p).map_err(err)
}

fn dependencies(root: &Path, rel: &str) -> R<Vec<String>> {
    let p = contained(root, rel)?;
    let ext = p
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mut refs = Vec::new();

    if ext == "gltf" {
        let json: serde_json::Value = serde_json::from_str(&small_text(&p)?).map_err(err)?;
        for key in ["buffers", "images"] {
            if let Some(items) = json[key].as_array() {
                for item in items {
                    if let Some(uri) = item["uri"].as_str() {
                        if !uri.starts_with("data:") {
                            refs.push(uri.to_string());
                        }
                    }
                }
            }
        }
    }

    if ext == "obj" || ext == "mtl" {
        for line in small_text(&p)?.lines() {
            let line = line.trim();
            let mut parts = line.splitn(2, char::is_whitespace);
            let key = parts.next().unwrap_or("");
            let val = parts.next().unwrap_or("").trim();
            if (ext == "obj" && key == "mtllib")
                || (ext == "mtl"
                    && (key.starts_with("map_")
                        || ["bump", "disp", "decal", "norm"].contains(&key)))
            {
                if val.starts_with('-') || val.is_empty() {
                    return Err("MTL com opções ambíguas: use escopo explícito.".into());
                }
                refs.push(val.to_string());
            }
        }
    }

    let parent = Path::new(rel).parent().unwrap_or(Path::new(""));
    refs.into_iter()
        .map(|r| {
            let r = r.replace('\\', "/");
            if r.contains('%') || r.contains('?') || r.contains('#') {
                return Err("URI codificada/ambígua: use escopo explícito.".into());
            }
            relative(&r)?;
            let joined = parent.join(r).to_string_lossy().replace('\\', "/");
            contained(root, &joined)?;
            Ok(joined)
        })
        .collect()
}

fn plan(source: &str, scope: &str, selected: &[String], cancel: &AtomicBool) -> R<Plan> {
    let input = absolute(source)?;
    reject_link_ancestors(&input)?;
    let source = input.canonicalize().map_err(err)?;

    let root = if source.is_dir() {
        source.clone()
    } else {
        regular(&source)?;
        source.parent().ok_or("Sem diretório pai")?.to_owned()
    };

    let mut paths = BTreeSet::new();
    let mut warnings = Vec::new();

    match scope {
        "original" | "dependencies" => {
            if source.is_dir() {
                return Err("Projetos/diretórios exigem escopo explícito de arquivos.".into());
            }
            paths.insert(
                source
                    .file_name()
                    .ok_or("Sem nome")?
                    .to_string_lossy()
                    .to_string(),
            );
            if scope == "original" {
                warnings.push("Somente original; dependências externas não incluídas.".into());
            }
        }
        "explicit" => {
            if selected.is_empty() {
                return Err("Selecione os arquivos relativos do projeto.".into());
            }
            for s in selected {
                relative(s)?;
                paths.insert(s.clone());
            }
        }
        _ => return Err("Escopo inválido.".into()),
    }

    if scope == "dependencies" {
        let mut done = HashSet::new();
        loop {
            checkpoint(cancel)?;
            let next = paths.iter().find(|p| !done.contains(*p)).cloned();
            let Some(next) = next else { break };
            done.insert(next.clone());
            for dep in dependencies(&root, &next)? {
                paths.insert(dep);
            }
            if paths.len() > 10000 {
                return Err("Escopo excede 10000 arquivos.".into());
            }
        }
    }

    if paths.len() > 10000 {
        return Err("Escopo excede 10000 arquivos.".into());
    }

    let mut bytes = 0u64;
    let mut fingerprint = Sha256::new();
    for p in &paths {
        checkpoint(cancel)?;
        let file = contained(&root, p)?;
        let size = fs::metadata(&file).map_err(err)?.len();
        bytes = bytes.checked_add(size).ok_or("Tamanho excedido")?;
        fingerprint.update(p.as_bytes());
        fingerprint.update(size.to_le_bytes());
        fingerprint.update(hash(&file, cancel)?.as_bytes());
    }

    Ok(Plan {
        root: root.to_string_lossy().into_owned(),
        paths: paths.into_iter().collect(),
        bytes,
        warnings,
        fingerprint: format!("{:x}", fingerprint.finalize()),
    })
}

fn native_config(app: &tauri::AppHandle) -> R<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(err)?
        .join("asset-vault-config.json"))
}

fn read_config(path: &Path) -> R<Config> {
    if !path.exists() {
        return Ok(Config::default());
    }
    serde_json::from_slice(&fs::read(path).map_err(err)?).map_err(err)
}

fn vault(config: &Config) -> R<PathBuf> {
    if !config.enabled {
        return Err("Ative e configure o cofre.".into());
    }
    let input = absolute(&config.directory)?;
    reject_link_ancestors(&input)?;
    let p = input.canonicalize().map_err(err)?;
    if !p.is_dir() {
        return Err("Diretório do cofre inválido.".into());
    }

    if let Ok(code_root) = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .canonicalize()
    {
        if p.starts_with(&code_root) || code_root.starts_with(&p) {
            return Err("Escolha cofre separado do diretório de código-fonte.".into());
        }
    }

    for ancestor in p.ancestors() {
        if ancestor.join(".git").exists()
            || ancestor.join("Cargo.toml").is_file()
            || ancestor.join("package.json").is_file()
        {
            return Err("Cofre dentro de árvore de código-fonte não permitido.".into());
        }
    }

    Ok(p)
}

fn owned_root(config: &Config) -> R<PathBuf> {
    let dir = vault(config)?.join("rocketbox-vault-v1");
    if dir.exists() {
        reject_link_ancestors(&dir)?;
    }
    if dir.exists()
        && fs::symlink_metadata(&dir)
            .map_err(err)?
            .file_type()
            .is_symlink()
    {
        return Err("Cofre não pode ser um link.".into());
    }
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir)
}

fn manifests(root: &Path) -> R<Vec<Manifest>> {
    let mut out = Vec::new();
    for item in fs::read_dir(root).map_err(err)? {
        let item = item.map_err(err)?;
        reject_link(&item.path())?;
        let name = item.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        id(&name)?;
        if !item.file_type().map_err(err)?.is_dir() {
            return Err("Entrada desconhecida no cofre.".into());
        }
        let manifest_path = item.path().join("manifest.json");
        regular(&manifest_path)?;

        let mut m: Manifest = serde_json::from_str(&small_text(&manifest_path)?).map_err(err)?;

        m.verification = unchecked();

        let files = item.path().join("files");
        reject_link_ancestors(&files)?;

        if fs::symlink_metadata(&files)
            .map_err(err)?
            .file_type()
            .is_symlink()
            || !files.is_dir()
        {
            return Err("Raiz files inválida.".into());
        }
        if m.schema != 1 || m.version != name {
            return Err("Manifesto incompatível.".into());
        }
        id(&m.asset_id)?;
        if m.entries.is_empty()
            || m.entries.len() > 10000
            || !["original", "dependencies", "explicit"].contains(&m.scope.as_str())
        {
            return Err("Manifesto inválido.".into());
        }
        let mut seen = HashSet::new();
        for e in &m.entries {
            relative(&e.relative)?;
            if !seen.insert(e.relative.to_lowercase())
                || e.sha256.len() != 64
                || !e.sha256.chars().all(|c| c.is_ascii_hexdigit())
            {
                return Err("Entradas duplicadas ou hash inválido no manifesto.".into());
            }
        }
        out.push(m);
    }
    out.sort_by_key(|m| m.created_at);
    Ok(out)
}

fn usage(ms: &[Manifest]) -> R<u64> {
    ms.iter().flat_map(|m| &m.entries).try_fold(0u64, |a, e| {
        a.checked_add(e.bytes).ok_or("Uso excedido".into())
    })
}

#[cfg(windows)]

fn available(path: &Path) -> R<u64> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetDiskFreeSpaceExW(
            path: *const u16,
            available: *mut u64,
            total: *mut u64,
            free: *mut u64,
        ) -> i32;
    }
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut bytes = 0;
    if unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut bytes,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    } == 0
    {
        return Err(err(std::io::Error::last_os_error()));
    }
    Ok(bytes)
}

#[cfg(not(windows))]

fn available(_path: &Path) -> R<u64> {
    Err("Verificação de espaço disponível implementada apenas no Windows.".into())
}

struct Staging(PathBuf);
impl Drop for Staging {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn copy_entry(src: &Path, dst: &Path, cancel: &AtomicBool) -> R<Entry> {
    regular(src)?;
    let before = fs::metadata(src).map_err(err)?;
    let digest = hash(src, cancel)?;
    fs::create_dir_all(dst.parent().ok_or("Destino sem pai")?).map_err(err)?;
    let mut input = File::open(src).map_err(err)?;
    let mut output = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(dst)
        .map_err(err)?;
    let mut buf = [0; 65536];
    let mut size = 0;
    loop {
        checkpoint(cancel)?;
        let n = input.read(&mut buf).map_err(err)?;
        if n == 0 {
            break;
        }
        output.write_all(&buf[..n]).map_err(err)?;
        size += n as u64;
    }
    output.sync_all().map_err(err)?;
    drop(output);
    if size != before.len() || hash(dst, cancel)? != digest || hash(src, cancel)? != digest {
        return Err("Arquivo alterado durante a cópia ou integridade inválida.".into());
    }
    Ok(Entry {
        relative: String::new(),
        bytes: size,
        sha256: digest,
    })
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn require_review(request: &Request, actual: &Plan) -> R<()> {
    if request.expected_plan.as_ref() != Some(actual) {
        return Err("A fonte ou o escopo mudou desde a revisão. Prepare e revise novamente antes de copiar.".into());
    }
    Ok(())
}
fn transfer(config: &Config, req: &Request, cancel: &AtomicBool) -> R<Manifest> {
    id(&req.asset_id)?;
    id(&req.job_id)?;

    if req.action == "backup" {
        let root = owned_root(config)?;
        let ms = manifests(&root)?;
        let p = plan(&req.source, &req.scope, &req.selected, cancel)?;
        require_review(req, &p)?;

        if ms.iter().filter(|m| m.asset_id == req.asset_id).count() >= config.max_versions {
            return Err("Limite de versões atingido. Revise e confirme a limpeza no cofre.".into());
        }

        if usage(&ms)?.checked_add(p.bytes).ok_or("Uso excedido")? > config.max_bytes {
            return Err("Limite de uso do cofre atingido.".into());
        }

        if available(&root)? < p.bytes.saturating_add(1024 * 1024) {
            return Err("Espaço livre insuficiente.".into());
        }

        let version = format!("v{}-{}", timestamp(), req.job_id);
        let stage = Staging(root.join(format!(".partial-{version}")));
        fs::create_dir(&stage.0).map_err(err)?;

        let source_root = Path::new(&p.root).canonicalize().map_err(err)?;

        if root.starts_with(&source_root) || source_root.starts_with(&root) {
            return Err("Cofre e original devem estar em árvores separadas.".into());
        }

        let mut entries = Vec::new();
        for rel in &p.paths {
            checkpoint(cancel)?;
            let src = contained(Path::new(&p.root), &rel)?;
            let mut e = copy_entry(&src, &stage.0.join("files").join(relative(&rel)?), cancel)?;
            e.relative = rel.clone();
            entries.push(e);
        }

        require_review(req, &plan(&req.source, &req.scope, &req.selected, cancel)?)?;
        let m = Manifest {
            schema: 1,
            version: version.clone(),
            asset_id: req.asset_id.clone(),
            source: req.source.clone(),
            scope: req.scope.clone(),
            created_at: timestamp(),
            entries,
            warnings: p.warnings.clone(),
            verification: "verified_at_copy".into(),
        };

        if usage(std::slice::from_ref(&m))? > p.bytes {
            return Err("Escopo cresceu durante a cópia. Prepare novamente.".into());
        }
        let mut f = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(stage.0.join("manifest.json"))
            .map_err(err)?;
        f.write_all(&serde_json::to_vec_pretty(&m).map_err(err)?)
            .map_err(err)?;
        f.sync_all().map_err(err)?;
        drop(f);
        checkpoint(cancel)?;
        fs::rename(&stage.0, root.join(&version)).map_err(err)?;
        Ok(m)
    } else if req.action == "verify" {
        let root = owned_root(config)?;
        let version = req.version.as_deref().ok_or("Escolha versão")?;
        id(version)?;

        let mut m = manifests(&root)?
            .into_iter()
            .find(|m| m.version == version && m.asset_id == req.asset_id)
            .ok_or("Versão não encontrada")?;

        let files = root.join(version).join("files");

        for e in &m.entries {
            let src = contained(&files, &e.relative)?;
            if fs::metadata(&src).map_err(err)?.len() != e.bytes || hash(&src, cancel)? != e.sha256
            {
                return Err(format!("Integridade inválida: {}", e.relative));
            }
        }

        m.verification = "verified_now".into();
        Ok(m)
    } else if req.action == "export" || req.action == "restore" {
        let input = absolute(req.destination.as_deref().ok_or("Escolha o destino")?)?;
        reject_link_ancestors(&input)?;
        let destination = input.canonicalize().map_err(err)?;
        if !destination.is_dir() {
            return Err("Destino deve ser um diretório existente.".into());
        }

        let (mut m, source_root) = if req.action == "restore" {
            let root = owned_root(config)?;
            let version = req.version.as_deref().ok_or("Escolha versão")?;
            id(version)?;
            let m = manifests(&root)?
                .into_iter()
                .find(|m| m.version == version && m.asset_id == req.asset_id)
                .ok_or("Versão não encontrada")?;
            (
                m,
                root.join(version)
                    .join("files")
                    .canonicalize()
                    .map_err(err)?,
            )
        } else {
            let p = plan(&req.source, &req.scope, &req.selected, cancel)?;
            require_review(req, &p)?;
            let mut entries = Vec::new();
            for rel in &p.paths {
                let path = contained(Path::new(&p.root), &rel)?;
                entries.push(Entry {
                    relative: rel.clone(),
                    bytes: fs::metadata(&path).map_err(err)?.len(),
                    sha256: hash(&path, cancel)?,
                });
            }
            (
                Manifest {
                    schema: 1,
                    version: format!("export-{}-{}", timestamp(), req.job_id),
                    asset_id: req.asset_id.clone(),
                    source: req.source.clone(),
                    scope: req.scope.clone(),
                    created_at: timestamp(),
                    entries,
                    warnings: p.warnings.clone(),
                    verification: "verified_at_copy".into(),
                },
                PathBuf::from(p.root),
            )
        };

        let bytes = usage(std::slice::from_ref(&m))?;
        if available(&destination)? < bytes.saturating_add(1024 * 1024) {
            return Err("Espaço livre insuficiente.".into());
        }

        let final_path = destination.join(&m.version);
        if final_path.exists() {
            return Err(
                "Destino já existe; escolha outro diretório. Nenhum arquivo sobrescrito.".into(),
            );
        }

        let stage = Staging(destination.join(format!(".partial-{}", req.job_id)));
        fs::create_dir(&stage.0).map_err(err)?;

        for e in &m.entries {
            let src = contained(&source_root, &e.relative)?;
            if hash(&src, cancel)? != e.sha256 || fs::metadata(&src).map_err(err)?.len() != e.bytes
            {
                return Err(format!("Integridade inválida: {}", e.relative));
            }
            let copied = copy_entry(&src, &stage.0.join(relative(&e.relative)?), cancel)?;
            if copied.sha256 != e.sha256 {
                return Err("Integridade alterada durante recuperação.".into());
            }
        }

        if req.action == "export" {
            require_review(req, &plan(&req.source, &req.scope, &req.selected, cancel)?)?;
        }
        checkpoint(cancel)?;
        if final_path.exists() {
            return Err("Destino passou a existir. Cópia cancelada.".into());
        }
        fs::rename(&stage.0, &final_path).map_err(err)?;
        m.warnings
            .push(format!("Destino: {}", final_path.display()));
        Ok(m)
    } else {
        Err("Ação não suportada. Conversões exigem adaptador real instalado.".into())
    }
}

#[tauri::command]

pub fn vault_config(app: tauri::AppHandle) -> R<Config> {
    read_config(&native_config(&app)?)
}

#[tauri::command]

pub fn vault_save_config(app: tauri::AppHandle, config: Config) -> R<()> {
    if config.max_versions < 1 || config.max_versions > 100 || config.max_bytes < 1024 * 1024 {
        return Err("Limites inválidos (1–100 versões, mínimo 1 MiB).".into());
    }
    if config.enabled {
        vault(&config)?;
    }
    let _guard = JOB.lock().map_err(err)?;
    if _guard.is_some() {
        return Err("Aguarde a operação atual.".into());
    }
    let path = native_config(&app)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(err)?;
    reject_link_ancestors(path.parent().unwrap())?;
    let tmp = path.with_extension(format!("tmp-{}", timestamp()));
    let mut f = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&tmp)
        .map_err(err)?;
    f.write_all(&serde_json::to_vec_pretty(&config).map_err(err)?)
        .map_err(err)?;
    f.sync_all().map_err(err)?;
    drop(f);
    let result = replace_config(&tmp, &path);
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[tauri::command]

pub async fn vault_plan(source: String, scope: String, selected: Vec<String>) -> R<Plan> {
    tauri::async_runtime::spawn_blocking(move || {
        plan(&source, &scope, &selected, &AtomicBool::new(false))
    })
    .await
    .map_err(err)?
}

#[tauri::command]

pub async fn vault_run(app: tauri::AppHandle, request: Request) -> R<Manifest> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut job = JOB.lock().map_err(err)?;
        if job.is_some() {
            return Err("Outra operação do cofre está em andamento.".into());
        }
        *job = Some((request.job_id.clone(), cancel.clone()));
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        let config = read_config(&native_config(&app)?)?;
        transfer(&config, &request, &cancel)
    })
    .await
    .map_err(err)
    .and_then(|x| x);
    *JOB.lock().map_err(err)? = None;
    result
}

#[tauri::command]

pub fn vault_cancel(job_id: String) -> R<()> {
    if let Some((id, cancel)) = JOB.lock().map_err(err)?.as_ref() {
        if *id == job_id {
            cancel.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

#[tauri::command]

pub fn vault_list(app: tauri::AppHandle) -> R<serde_json::Value> {
    let config = read_config(&native_config(&app)?)?;
    let root = owned_root(&config)?;
    let ms = manifests(&root)?;
    Ok(
        serde_json::json!({"usedBytes":usage(&ms)?,"versions":ms,"availableBytes":available(&root)?}),
    )
}

#[tauri::command]

pub fn vault_delete(app: tauri::AppHandle, versions: Vec<String>, confirmed: bool) -> R<()> {
    if !confirmed {
        return Err("Confirmação explícita necessária.".into());
    }
    let job = JOB.lock().map_err(err)?;
    if job.is_some() {
        return Err("Aguarde a operação atual.".into());
    }
    let root = owned_root(&read_config(&native_config(&app)?)?)?;
    let ms = manifests(&root)?;
    for v in &versions {
        id(v)?;
        if !ms.iter().any(|m| m.version == *v) {
            return Err("Versão desconhecida.".into());
        }
    }
    for v in versions {
        let p = root.join(v);
        reject_link_ancestors(&p)?;
        if fs::symlink_metadata(&p)
            .map_err(err)?
            .file_type()
            .is_symlink()
        {
            return Err("Link inválido.".into());
        }
        fs::remove_dir_all(p).map_err(err)?;
    }
    drop(job);
    Ok(())
}

#[cfg(windows)]

fn replace_config(from: &Path, to: &Path) -> R<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32;
    }
    let a: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let b: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe { MoveFileExW(a.as_ptr(), b.as_ptr(), 1 | 8) } == 0 {
        Err(err(std::io::Error::last_os_error()))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]

fn replace_config(from: &Path, to: &Path) -> R<()> {
    fs::rename(from, to).map_err(err)
}

#[tauri::command]

pub async fn vault_relink_review(
    app: tauri::AppHandle,
    asset_id: String,
    path: String,
) -> R<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move||{

 let inspected=super::inspecionar_recurso(path.clone())?;

 let config=read_config(&native_config(&app)?)?;

 let mut comparison=serde_json::json!({"status":"no_backup"});

 if config.enabled {let ms=manifests(&owned_root(&config)?)?;if let Some(m)=ms.iter().rev().find(|m|m.asset_id==asset_id) {

 if inspected.is_directory {comparison=serde_json::json!({"status":"directory_requires_explicit_scope"});} else {

 let original_name=Path::new(&m.source).file_name().and_then(|x|x.to_str()).unwrap_or("");

 if let Some(e)=m.entries.iter().find(|e|e.relative==original_name) {let digest=hash(Path::new(&path),&AtomicBool::new(false))?;

 comparison=serde_json::json!({"status":if digest==e.sha256 {"same"}else{"different"},"sha256":digest,"backupSha256":e.sha256,"backupBytes":e.bytes,"version":m.version,"backupVerification":"not_checked"});

 }else {comparison=serde_json::json!({"status":"original_not_in_scope"});}}}}

 Ok(serde_json::json!({"inspection":inspected,"comparison":comparison}))

 }).await.map_err(err)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    static SEQ: AtomicUsize = AtomicUsize::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "rocketbox-vault-test-{}-{}-{}",
                std::process::id(),
                timestamp(),
                SEQ.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(root.join("source")).unwrap();
            fs::create_dir(root.join("vault")).unwrap();
            fs::create_dir(root.join("destination")).unwrap();
            Self(root)
        }
        fn config(&self) -> Config {
            Config {
                enabled: true,
                directory: self.0.join("vault").to_string_lossy().into_owned(),
                max_bytes: 1024 * 1024,
                max_versions: 3,
                automatic: false,
            }
        }
        fn request(&self) -> Request {
            fs::write(self.0.join("source/model.obj"), b"v 0 0 0\n").unwrap();
            Request {
                job_id: format!("test{}", SEQ.fetch_add(1, Ordering::Relaxed)),
                action: "backup".into(),
                asset_id: "fixture-asset".into(),
                source: self
                    .0
                    .join("source/model.obj")
                    .to_string_lossy()
                    .into_owned(),
                scope: "original".into(),
                selected: vec![],
                version: None,
                destination: None,
                expected_plan: Some(
                    plan(
                        self.0.join("source/model.obj").to_str().unwrap(),
                        "original",
                        &[],
                        &token(),
                    )
                    .unwrap(),
                ),
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn token() -> AtomicBool {
        AtomicBool::new(false)
    }
    #[test]
    fn scope_paths_reject_traversal_absolute_and_streams() {
        for path in [
            "../secret",
            "/secret",
            "C:/file",
            "textures/../secret",
            "textures\\file",
            "file:stream",
            "",
        ] {
            assert!(relative(path).is_err(), "{path}");
        }
        assert!(relative("textures/albedo.png").is_ok());
    }
    #[test]
    fn sha256_known_fixture() {
        let f = Fixture::new();
        let p = f.0.join("source/hash");
        fs::write(&p, b"abc").unwrap();
        assert_eq!(
            hash(&p, &token()).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
    #[test]
    fn gltf_dependencies_and_embedded_data() {
        let f = Fixture::new();
        fs::write(f.0.join("source/model.gltf"),r#"{"buffers":[{"uri":"mesh.bin"}],"images":[{"uri":"data:image/png;base64,AAAA"},{"uri":"texture.png"}]}"#).unwrap();
        fs::write(f.0.join("source/mesh.bin"), b"mesh").unwrap();
        fs::write(f.0.join("source/texture.png"), b"fixture").unwrap();
        let p = plan(
            f.0.join("source/model.gltf").to_str().unwrap(),
            "dependencies",
            &[],
            &token(),
        )
        .unwrap();
        assert_eq!(p.paths, vec!["mesh.bin", "model.gltf", "texture.png"]);
        assert_eq!(
            p.bytes,
            fs::metadata(f.0.join("source/model.gltf")).unwrap().len() + 11
        );
    }
    #[test]
    fn obj_mtl_dependencies_and_ambiguous_options() {
        let f = Fixture::new();
        fs::write(f.0.join("source/model.obj"), "mtllib material.mtl\n").unwrap();
        fs::write(f.0.join("source/material.mtl"), "map_Kd color.png\n").unwrap();
        fs::write(f.0.join("source/color.png"), b"fixture").unwrap();
        let source = f.0.join("source/model.obj");
        assert_eq!(
            plan(source.to_str().unwrap(), "dependencies", &[], &token())
                .unwrap()
                .paths
                .len(),
            3
        );
        fs::write(f.0.join("source/material.mtl"), "map_Kd -s 1 1 1 color.png").unwrap();
        assert!(plan(source.to_str().unwrap(), "dependencies", &[], &token()).is_err());
    }
    #[test]
    fn directory_requires_explicit_scope_and_never_recurses() {
        let f = Fixture::new();
        let path = f.0.join("source");
        fs::write(path.join("chosen"), b"chosen").unwrap();
        fs::write(path.join("not-chosen"), b"large").unwrap();
        assert!(plan(path.to_str().unwrap(), "original", &[], &token()).is_err());
        let p = plan(
            path.to_str().unwrap(),
            "explicit",
            &["chosen".into()],
            &token(),
        )
        .unwrap();
        assert_eq!(p.paths, vec!["chosen"]);
        assert_eq!(p.bytes, 6);
    }
    #[test]
    fn missing_or_outside_dependencies_fail_closed() {
        let f = Fixture::new();
        let p = f.0.join("source/model.gltf");
        for uri in [
            "missing.bin",
            "../secret.bin",
            "https://host/file",
            "%2e%2e/secret",
        ] {
            fs::write(&p, format!(r#"{{"buffers":[{{"uri":"{uri}"}}]}}"#)).unwrap();
            assert!(plan(p.to_str().unwrap(), "dependencies", &[], &token()).is_err());
        }
    }
    #[test]
    fn cancel_copy_does_not_publish() {
        let f = Fixture::new();
        let r = f.request();
        assert!(transfer(&f.config(), &r, &AtomicBool::new(true)).is_err());
        assert_eq!(
            fs::read(f.0.join("source/model.obj")).unwrap(),
            b"v 0 0 0\n"
        );
        assert_eq!(
            fs::read_dir(owned_root(&f.config()).unwrap())
                .unwrap()
                .count(),
            0
        );
    }
    #[test]
    fn backup_verify_restore_detect_corruption_and_conflicts() {
        let f = Fixture::new();
        let mut r = f.request();
        let original = fs::read(&r.source).unwrap();
        let m = transfer(&f.config(), &r, &token()).unwrap();
        assert_eq!(m.verification, "verified_at_copy");
        let root = owned_root(&f.config()).unwrap();
        assert_eq!(manifests(&root).unwrap()[0].verification, "not_checked");
        r.version = Some(m.version.clone());
        r.action = "verify".into();
        assert_eq!(
            transfer(&f.config(), &r, &token()).unwrap().verification,
            "verified_now"
        );
        r.action = "restore".into();
        r.destination = Some(f.0.join("destination").to_string_lossy().into_owned());
        transfer(&f.config(), &r, &token()).unwrap();
        assert_eq!(
            fs::read(f.0.join("destination").join(&m.version).join("model.obj")).unwrap(),
            original
        );
        assert!(
            transfer(&f.config(), &r, &token())
                .unwrap_err()
                .contains("existe")
        );
        fs::write(root.join(&m.version).join("files/model.obj"), b"corrupted").unwrap();
        r.action = "verify".into();
        assert!(transfer(&f.config(), &r, &token()).is_err());
        r.action = "restore".into();
        let other = f.0.join("other");
        fs::create_dir(&other).unwrap();
        r.destination = Some(other.to_string_lossy().into_owned());
        assert!(transfer(&f.config(), &r, &token()).is_err());
        assert_eq!(fs::read_dir(other).unwrap().count(), 0);
        assert_eq!(fs::read(&r.source).unwrap(), original);
    }
    #[test]
    fn versions_and_usage_limits_preserve_existing() {
        let f = Fixture::new();
        let mut config = f.config();
        let r = f.request();
        config.max_bytes = 1;
        assert!(transfer(&config, &r, &token()).is_err());
        config = f.config();
        config.max_versions = 1;
        transfer(&config, &r, &token()).unwrap();
        assert!(
            transfer(&config, &r, &token())
                .unwrap_err()
                .contains("versões")
        );
        assert_eq!(manifests(&owned_root(&config).unwrap()).unwrap().len(), 1);
    }
    #[test]
    fn export_original_without_enabled_vault() {
        let f = Fixture::new();
        let mut r = f.request();
        r.action = "export".into();
        r.destination = Some(f.0.join("destination").to_string_lossy().into_owned());
        let mut config = f.config();
        config.enabled = false;
        let m = transfer(&config, &r, &token()).unwrap();
        assert!(
            f.0.join("destination")
                .join(m.version)
                .join("model.obj")
                .is_file()
        );
    }
    #[test]
    fn code_tree_and_original_cannot_be_vault() {
        let f = Fixture::new();
        let mut config = f.config();
        config.directory = Path::new(env!("CARGO_MANIFEST_DIR"))
            .to_string_lossy()
            .into_owned();
        assert!(vault(&config).is_err());
        let r = f.request();
        config = f.config();
        config.directory = f.0.join("source").to_string_lossy().into_owned();
        assert!(
            transfer(&config, &r, &token())
                .unwrap_err()
                .contains("separadas")
        );
    }
    #[test]
    fn config_replacement_repeated_and_corrupt_read() {
        let f = Fixture::new();
        let target = f.0.join("config.json");
        let temp = f.0.join("config.tmp");
        for max_versions in [1, 7, 12] {
            let mut config = f.config();
            config.max_versions = max_versions;
            fs::write(&temp, serde_json::to_vec(&config).unwrap()).unwrap();
            replace_config(&temp, &target).unwrap();
            assert_eq!(read_config(&target).unwrap().max_versions, max_versions);
        }
        fs::write(&target, b"invalid").unwrap();
        assert!(read_config(&target).is_err());
    }
    #[test]
    fn stale_review_rejects_new_dependencies_and_same_size_content_changes() {
        let f = Fixture::new();
        let r = f.request();
        fs::write(&r.source, b"v 1 0 0\n").unwrap();
        assert!(
            transfer(&f.config(), &r, &token())
                .unwrap_err()
                .contains("revis")
        );
        assert_eq!(
            manifests(&owned_root(&f.config()).unwrap()).unwrap().len(),
            0
        );
        let mut missing = f.request();
        missing.expected_plan = None;
        assert!(transfer(&f.config(), &missing, &token()).is_err());
    }
    #[test]
    fn recovery_works_after_original_is_removed() {
        let f = Fixture::new();
        let mut r = f.request();
        let m = transfer(&f.config(), &r, &token()).unwrap();
        fs::remove_file(&r.source).unwrap();
        r.action = "restore".into();
        r.version = Some(m.version.clone());
        r.destination = Some(f.0.join("destination").to_string_lossy().into_owned());
        transfer(&f.config(), &r, &token()).unwrap();
        assert!(
            f.0.join("destination")
                .join(m.version)
                .join("model.obj")
                .is_file()
        );
        assert!(!Path::new(&r.source).exists());
    }
    #[cfg(windows)]
    fn junction(link: &Path, target: &Path) {
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()
            .unwrap();
        assert!(
            status.status.success(),
            "{}",
            String::from_utf8_lossy(&status.stderr)
        );
    }
    #[cfg(windows)]
    #[test]
    fn junction_version_and_files_root_are_rejected() {
        let f = Fixture::new();
        let r = f.request();
        let m = transfer(&f.config(), &r, &token()).unwrap();
        let root = owned_root(&f.config()).unwrap();
        let version = root.join(&m.version);
        let saved = f.0.join("saved-version");
        fs::rename(&version, &saved).unwrap();
        junction(&version, &saved);
        assert!(manifests(&root).is_err());
        fs::remove_dir(&version).unwrap();
        fs::rename(&saved, &version).unwrap();
        let files = version.join("files");
        let saved_files = f.0.join("saved-files");
        fs::rename(&files, &saved_files).unwrap();
        junction(&files, &saved_files);
        assert!(manifests(&root).is_err());
        let mut restore = f.request();
        restore.action = "restore".into();
        restore.version = Some(m.version);
        restore.destination = Some(f.0.join("destination").to_string_lossy().into_owned());
        assert!(transfer(&f.config(), &restore, &token()).is_err());
        fs::remove_dir(files).unwrap();
    }
}
