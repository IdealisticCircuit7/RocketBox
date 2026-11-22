import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { DeckAsset } from '../../services/deckFilterService';
import {
  vaultApi,
  type ExportAsFormat,
  type VaultScope,
} from '../../services/assetVaultService';

export interface DeckExportModalProps {
  readonly asset: DeckAsset;
  readonly mode: 'original' | 'convert';
  readonly onClose: () => void;
  readonly onNotify?: (message: string) => void;
}

const EXPORT_FORMATS: ReadonlyArray<{
  readonly value: ExportAsFormat;
  readonly label: string;
  readonly hint: string;
}> = [
  { value: 'fbx', label: 'FBX (.fbx)', hint: 'Compatível com Unreal, Unity e Maya' },
  { value: 'obj', label: 'OBJ (.obj)', hint: 'Malha universal com arquivo .mtl' },
  { value: 'glb', label: 'GLB (.glb)', hint: 'glTF binário único com texturas embutidas' },
  { value: 'gltf', label: 'GLTF (.gltf)', hint: 'glTF JSON + arquivos separados' },
];

export function DeckExportModal({
  asset,
  mode,
  onClose,
  onNotify,
}: DeckExportModalProps) {
  const looksLikeDirectory = !/\.[a-z0-9]{1,10}$/i.test(asset.caminho.trim());
  const [isDirectoryProject, setIsDirectoryProject] = useState(looksLikeDirectory);
  const [scope, setScope] = useState<VaultScope>(
    looksLikeDirectory ? 'explicit' : 'original',
  );
  const [explicitPaths, setExplicitPaths] = useState('');
  const [format, setFormat] = useState<ExportAsFormat>('glb');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const [blenderMissing, setBlenderMissing] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    vaultApi
      .inspect(asset.caminho)
      .then((info) => {
        if (!active) return;
        setIsDirectoryProject(info.isDirectory);
        setScope(info.isDirectory ? 'explicit' : 'original');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [asset.caminho]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const handleChooseDestination = async () => {
    setError('');
    try {
      const picked = await vaultApi.choose(true);
      if (picked) {
        setDestination(picked);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfigureBlender = async () => {
    setError('');
    try {
      const picked = await vaultApi.choose(false);
      if (!picked) return;
      await invoke('preview_configure_blender', { path: picked });
      setBlenderMissing(false);
      setStatus('Blender configurado! Você já pode exportar.');
      onNotify?.('Blender configurado para exportação.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!isTauri()) {
      setError('A exportação de arquivos exige o aplicativo desktop RocketBox.');
      return;
    }

    setError('');
    setExportedPath(null);
    setBlenderMissing(false);

    let targetDir = destination.trim();
    if (!targetDir) {
      try {
        const picked = await vaultApi.choose(true);
        if (!picked) return;
        targetDir = picked;
        setDestination(picked);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'original') {
        const selected = explicitPaths
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (scope === 'explicit' && selected.length === 0) {
          throw new Error(
            'Informe ao menos um caminho relativo do projeto (ex.: Assets/modelo.glb).',
          );
        }
        setStatus('Verificando integridade e preparando cópia...');
        const plan = await vaultApi.plan(asset.caminho, scope, selected);
        setStatus(`Copiando ${plan.paths.length} arquivo(s)...`);
        const result = await vaultApi.run({
          jobId: crypto.randomUUID(),
          action: 'export',
          assetId: asset.id,
          source: asset.caminho,
          scope,
          selected,
          destination: targetDir,
          expectedPlan: plan,
        });
        const msg = `Exportação concluída: ${result.entries.length} arquivo(s) em "${targetDir}".`;
        setStatus(msg);
        setExportedPath(targetDir);
        onNotify?.(msg);
      } else {
        setStatus(`Convertendo "${asset.nome}" para ${format.toUpperCase()} via Blender...`);
        const result = await vaultApi.exportAs(asset.caminho, targetDir, format);
        const msg = `Exportado como ${format.toUpperCase()} em "${result.outputPath}".`;
        setStatus(msg);
        setExportedPath(result.outputPath);
        onNotify?.(msg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/blender não configurado/i.test(message)) {
        setBlenderMissing(true);
      }
      setError(message);
      setStatus('');
      onNotify?.(`Falha na exportação: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="nautia-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-export-modal-title"
    >
      <form
        className="nautia-modal-card nautia-compact-modal"
        onSubmit={handleExport}
      >
        <header className="nautia-modal-header">
          <div>
            <span className="nautia-eyebrow">Convés / Exportação</span>
            <h2 id="deck-export-modal-title" className="nautia-section-title">
              {mode === 'original' ? 'Exportar original' : 'Exportar como...'}
            </h2>
          </div>
          <button
            type="button"
            className="nautia-btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            Fechar
          </button>
        </header>

        <div className="nautia-export-modal__body">
          <p className="nautia-muted-note">
            Asset: <strong>{asset.nome}</strong>
          </p>

          {mode === 'original' ? (
            <>
              {!isDirectoryProject ? (
                <label className="nautia-field">
                  <span>O que exportar</span>
                  <select
                    value={scope}
                    disabled={busy}
                    onChange={(e) => setScope(e.target.value as VaultScope)}
                  >
                    <option value="original">
                      Arquivo original ({asset.caminho.split(/[\\/]/).pop() ?? asset.nome})
                    </option>
                    <option value="dependencies">
                      Original + dependências (glTF / OBJ)
                    </option>
                  </select>
                </label>
              ) : (
                <label className="nautia-field">
                  <span>Arquivos relativos da pasta do projeto (um por linha)</span>
                  <textarea
                    rows={3}
                    value={explicitPaths}
                    disabled={busy}
                    onChange={(e) => setExplicitPaths(e.target.value)}
                    placeholder={'Assets/personagem.fbx\nProjectSettings/ProjectVersion.txt'}
                  />
                </label>
              )}
            </>
          ) : (
            <label className="nautia-field">
              <span>Formato de destino</span>
              <select
                value={format}
                disabled={busy}
                onChange={(e) => setFormat(e.target.value as ExportAsFormat)}
              >
                {EXPORT_FORMATS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.hint}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="nautia-field">
            <span>Pasta de destino</span>
            <div className="nautia-export-modal__dest-row">
              <input
                type="text"
                readOnly
                value={destination}
                placeholder="Selecione uma pasta de destino..."
              />
              <button
                type="button"
                className="nautia-btn-ghost"
                disabled={busy}
                onClick={() => void handleChooseDestination()}
              >
                Escolher pasta…
              </button>
            </div>
          </div>

          {status && (
            <p role="status" className="nautia-muted-note">
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="nautia-error-note">
              {error}
            </p>
          )}
          {blenderMissing && (
            <button
              type="button"
              className="nautia-btn-ghost"
              disabled={busy}
              onClick={() => void handleConfigureBlender()}
            >
              Configurar Blender…
            </button>
          )}
          {exportedPath && (
            <button
              type="button"
              className="nautia-btn-ghost"
              onClick={() =>
                void invoke('localizar_recurso', { path: exportedPath }).catch(
                  (err) => setError(String(err)),
                )
              }
            >
              Abrir destino no Explorer
            </button>
          )}
        </div>

        <footer className="nautia-modal-footer">
          <button
            type="button"
            className="nautia-btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="submit" className="nautia-btn-primary" disabled={busy}>
            {busy
              ? 'Exportando...'
              : mode === 'original'
                ? 'Exportar original'
                : `Exportar como ${format.toUpperCase()}`}
          </button>
        </footer>
      </form>
    </div>
  );
}
