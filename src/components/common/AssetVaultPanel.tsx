import { useEffect, useState } from 'react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import type { DeckAsset } from '../../services/deckFilterService';
import type { LibraryOperationsService } from '../../services/libraryOperationsService';
import { automaticAssetBackup, validateRelink, vaultApi, type ResourceInspection, type VaultConfig, type VaultInventory, type VaultPlan, type VaultScope, type VaultVersion } from '../../services/assetVaultService';
import './assetVault.css';
const size = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MiB`;
const failure = (error: unknown) => error instanceof Error ? error.message : String(error);
export function AssetVaultPanel({ asset, operations, changed, notify }: { asset: DeckAsset; operations?: LibraryOperationsService; changed?: () => void; notify?: (message: string) => void }) {
  const looksLikeDirectory = !/\.[a-z0-9]{1,10}$/i.test(asset.caminho.trim());
  const [scope, setScope] = useState<VaultScope>(looksLikeDirectory ? 'explicit' : 'original');
  const [selected, setSelected] = useState('');
  const [inventory, setInventory] = useState<VaultInventory | null>(null);
  const [status, setStatus] = useState('');
  const [job, setJob] = useState<string | null>(null);
  const [review, setReview] = useState<{ plan: VaultPlan; action: 'backup' | 'export'; destination?: string } | null>(null);
  const [relink, setRelink] = useState<{ inspection: ResourceInspection; comparison: Record<string, unknown> } | null>(null);
  const [verified, setVerified] = useState<Record<string, string>>({});
  const [exists, setExists] = useState<string>('Verificando original…');
  const refresh = async () => { const config = await vaultApi.config(); setInventory(config.enabled ? await vaultApi.list() : null); };
  useEffect(() => { let active = true; if (!isTauri()) { setExists('Operações de disco exigem aplicativo desktop.'); return; }
    vaultApi.inspect(asset.caminho).then(i => { if (active) setExists(`Original disponível • ${i.isDirectory ? 'diretório' : size(i.size ?? 0)}`); }).catch(e => { if (active) setExists(`Original indisponível: ${failure(e)}`); });
    refresh().catch(e => { if (active) setStatus(failure(e)); }); return () => { active = false; };
  }, [asset.caminho]);
  const paths = () => selected.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const report = (message: string) => { setStatus(message); notify?.(message); };
  const run = async (action: 'backup' | 'export' | 'restore' | 'verify', version?: string, destination?: string) => {
    const jobId = crypto.randomUUID(); setJob(jobId); setStatus('Processando e verificando arquivos…');
    try {
      const result = await vaultApi.run({ jobId, action, assetId: asset.id, source: asset.caminho, scope, selected: paths(), version, destination, expectedPlan: review?.plan });
      if (action === 'verify' && version) setVerified(v => ({ ...v, [version]: 'SHA-256 e tamanhos verificados agora' }));
      report(`${action === 'verify' ? 'Verificação concluída' : 'Cópia concluída'}: ${result.entries.length} arquivo(s). ${result.warnings.join(' ')}`);
      setReview(null); await refresh();
    } catch (error) { if (version) setVerified(v => ({ ...v, [version]: `Falha: ${failure(error)}` })); report(failure(error)); }
    finally { setJob(null); }
  };
  const prepare = async (action: 'backup' | 'export') => {
    setReview(null); setRelink(null);
    try { const destination = action === 'export' ? await vaultApi.choose(true) : undefined; if (destination === null) return;
      const plan = await vaultApi.plan(asset.caminho, scope, paths()); setReview({ plan, action, destination });
    } catch (error) { report(failure(error)); }
  };
  useEffect(() => {
    if (typeof window === 'undefined' || !isTauri()) return;
    const onVaultAction = (event: Event) => {
      const detail = (event as CustomEvent<{ assetId?: string; action?: 'backup' | 'export' } | undefined>).detail;
      if (!detail || detail.assetId !== asset.id || !detail.action) return;
      void prepare(detail.action);
    };
    window.addEventListener('rocketbox:vault-action', onVaultAction);
    return () => window.removeEventListener('rocketbox:vault-action', onVaultAction);
  }, [asset.id, asset.caminho, scope, selected]);
  const chooseRelink = async () => {
    setReview(null); setRelink(null);
    try {const path = await vaultApi.choose(asset.kind === 'project' && asset.projectType === 'unity'); if (!path) return;
      const result = await invoke<{ inspection: ResourceInspection; comparison: Record<string, unknown> }>('vault_relink_review', { assetId: asset.id, path });
      validateRelink(asset, result.inspection); setRelink(result);
    } catch (error) { report(failure(error)); }
  };
  return <section className="asset-vault studio-inspector__section" aria-label="Cofre e recuperação">
    <h4>Cofre, recuperação e exportação</h4><p role="status">{exists}</p>
    <fieldset disabled={!isTauri() || !!job}>
      <div className="asset-vault__actions"><button type="button" onClick={() => void invoke<string>('localizar_recurso', { path: asset.caminho }).then(report).catch(e => report(failure(e)))}>Mostrar no Explorador de Arquivos</button>
      <button type="button" disabled={!operations} onClick={() => void chooseRelink()}>Localizar novamente</button></div>
      {relink && <div className="asset-vault__review"><strong>Revisar nova referência</strong><dl><dt>Anterior</dt><dd>{asset.caminho}</dd><dt>Novo caminho</dt><dd>{relink.inspection.path}</dd><dt>Tamanho anterior / novo</dt><dd>{String(asset.fileSize ?? 'não registrado')} / {relink.inspection.size ?? 'diretório'} bytes</dd><dt>Assinatura</dt><dd>{relink.inspection.signature ?? 'não verificada'}</dd><dt>Comparação com backup</dt><dd>{({same:'Conteúdo igual ao hash registrado no backup',different:'CONTEÚDO DIFERENTE do backup',no_backup:'Sem backup disponível',directory_requires_explicit_scope:'Diretório: comparação exige escopo explícito',original_not_in_scope:'Original não incluído no backup'} as Record<string,string>)[String(relink.comparison.status)]}</dd></dl><pre>{JSON.stringify(relink.comparison, null, 2)}</pre><p>O hash do manifesto não substitui a verificação atual da cópia. {relink.inspection.warnings.join(' ')}</p>
      <button type="button" onClick={async () => { if (!operations) return; const result = await operations.relinkAsset(asset.id, relink.inspection.path, async path => { const latest = await invoke<typeof relink>('vault_relink_review', { assetId: asset.id, path }); if (JSON.stringify(latest) !== JSON.stringify(relink)) { setRelink(latest); throw new Error('O recurso mudou desde a revisão. Revise os novos metadados antes de confirmar.'); } return latest.inspection; }); report(result.summary); if (result.ok && result.data) { setRelink(null); changed?.(); void automaticAssetBackup(result.data, m => notify?.(m)); } }}>Confirmar nova referência</button><button type="button" onClick={() => setRelink(null)}>Cancelar</button></div>}
      <label>Escopo da cópia<select value={scope} onChange={e => { setScope(e.target.value as VaultScope); setReview(null); }}><option value="original">Somente original</option><option value="dependencies">Original + dependências glTF / OBJ</option><option value="explicit">Arquivos explícitos do projeto</option></select></label>
      {scope === 'explicit' && <label>Arquivos relativos (um por linha, sem diretórios ou ..)<textarea value={selected} onChange={e => { setSelected(e.target.value); setReview(null); }} placeholder={'Assets/model.glb\nProjectSettings/ProjectVersion.txt'} /></label>}
      <p>Diretórios nunca são copiados automaticamente. Escopo explícito é relativo ao projeto/diretório pai do original. Conversões indisponíveis: nenhum adaptador instalado.</p>
      <div className="asset-vault__actions"><button type="button" onClick={() => void prepare('backup')}>Preparar backup…</button><button type="button" onClick={() => void prepare('export')}>Exportar original…</button><button type="button" onClick={() => void refresh().catch(e => report(failure(e)))}>Atualizar versões</button></div>
      {review && <div className="asset-vault__review"><strong>Revisão: {review.plan.paths.length} arquivos • {size(review.plan.bytes)}</strong><p>{review.destination ?? 'Diretório do cofre configurado'}</p><pre>{review.plan.paths.join('\n')}</pre><p>{review.plan.warnings.join(' ')}</p><button type="button" onClick={() => void run(review.action, undefined, review.destination)}>Copiar escopo revisado</button><button type="button" onClick={() => setReview(null)}>Cancelar</button></div>}
      {inventory ? <><p>Cofre: {size(inventory.usedBytes)} usados • {size(inventory.availableBytes)} livres no disco</p>{inventory.versions.filter(v => v.assetId === asset.id).reverse().map(v => <details key={v.version}><summary>{new Date(v.createdAt).toLocaleString()} • {v.scope} • {v.entries.length} arquivos</summary><p>{verified[v.version] ?? 'Integridade não verificada nesta leitura'}</p><pre>{v.entries.map(e => `${e.relative} • ${e.bytes} bytes\nSHA-256 ${e.sha256}`).join('\n')}</pre><button type="button" onClick={() => void run('verify', v.version)}>Verificar cópia</button><button type="button" onClick={async () => {try {const destination = await vaultApi.choose(true); if (destination) await run('restore', v.version, destination);}catch(e){report(failure(e));}}}>Restaurar em…</button></details>)}</> : <p>Cofre opcional desativado. Configure-o em Sistema e Desempenho. Exportação do original continua disponível.</p>}
    </fieldset>
    {job && <button type="button" onClick={() => void vaultApi.cancel(job).then(() => setStatus('Cancelamento solicitado…')).catch(e => report(failure(e)))}>Cancelar operação</button>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}
export function AssetVaultSettings() {
  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [inventory, setInventory] = useState<VaultInventory | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = async (c: VaultConfig) => { setInventory(c.enabled ? await vaultApi.list() : null); setSelected([]); setConfirming(false); };
  useEffect(() => { if (isTauri()) vaultApi.config().then(c => { setConfig(c); return refresh(c); }).catch(e => setStatus(failure(e))); }, []);
  if (!isTauri()) return <p>Cofre físico disponível no aplicativo desktop.</p>;
  if (!config) return <p role="status">{status || 'Lendo configuração do cofre…'}</p>;
  const change = (patch: Partial<VaultConfig>) => { setConfig({ ...config, ...patch }); setConfirming(false); };
  const selectedVersions: VaultVersion[] = inventory?.versions.filter(v => selected.includes(v.version)) ?? [];
  return <div className="asset-vault"><fieldset disabled={busy}><label><input type="checkbox" checked={config.enabled} onChange={e => change({ enabled: e.target.checked })} />Ativar cofre opcional</label>
    <label>Diretório do cofre<input value={config.directory} onChange={e => change({ directory: e.target.value })} /></label><button type="button" onClick={async () => { try {const directory = await vaultApi.choose(true); if (directory) change({ directory });}catch(e){setStatus(failure(e));} }}>Escolher diretório…</button>
    <label>Limite de uso (MiB)<input type="number" min="1" value={config.maxBytes / 1048576} onChange={e => change({ maxBytes: Number(e.target.value) * 1048576 })} /></label>
    <label>Máximo de versões por registro (1–100)<input type="number" min="1" max="100" value={config.maxVersions} onChange={e => change({ maxVersions: Number(e.target.value) })} /></label>
    <label><input type="checkbox" checked={config.automatic} onChange={e => change({ automatic: e.target.checked })} />Backup automático ao cadastrar ou relinkar assets individuais</label>
    <p>Automático copia somente o arquivo original. Projetos e pacotes exigem seleção manual. Não há monitoramento de arquivos nem exclusão automática; atingir limites bloqueia novas versões até limpeza confirmada.</p>
    <button type="button" onClick={async () => { setBusy(true); try {await vaultApi.saveConfig(config); await refresh(config); setStatus('Configuração salva. Arquivos anteriores permanecem no diretório anterior se ele foi alterado.');}catch(e){setStatus(failure(e));}finally{setBusy(false);} }}>Salvar configuração</button>
    <button type="button" onClick={async () => {try {const saved = await vaultApi.config(); setConfig(saved); await refresh(saved); setStatus('Uso atualizado (conteúdo das cópias ainda não verificado).');}catch(e){setStatus(failure(e));}}}>Atualizar uso</button>
    {inventory && <><p>{size(inventory.usedBytes)} usados / {size(config.maxBytes)} de limite • {size(inventory.availableBytes)} livres no volume</p><p>Selecione versões para limpeza. Originais e referências serão preservados.</p>{inventory.versions.map(v => <label key={v.version}><input type="checkbox" checked={selected.includes(v.version)} onChange={e => {setSelected(s => e.target.checked ? [...s,v.version] : s.filter(x => x !== v.version)); setConfirming(false);}} />{v.assetId} • {new Date(v.createdAt).toLocaleString()} • {size(v.entries.reduce((sum,e) => sum + e.bytes,0))} • não verificada nesta leitura</label>)}
    <button type="button" disabled={!selected.length} onClick={() => setConfirming(true)}>Revisar limpeza…</button>
    {confirming && <div className="asset-vault__review"><p>Eliminar permanentemente {selected.length} versões ({size(selectedVersions.reduce((sum,v) => sum + v.entries.reduce((n,e) => n + e.bytes,0),0))}) do cofre?</p><pre>{selected.join('\n')}</pre><button type="button" onClick={async () => {setBusy(true);try {await vaultApi.deleteVersions(selected,true); await refresh(await vaultApi.config()); setStatus('Versões selecionadas removidas do cofre.');}catch(e){setStatus(failure(e));}finally{setBusy(false);}}}>Confirmar exclusão das cópias</button><button type="button" onClick={() => setConfirming(false)}>Cancelar</button></div>}</>}
    </fieldset><p role="status" aria-live="polite">{status}</p></div>;
}
