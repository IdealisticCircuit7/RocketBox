import { useEffect, useState, type ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AssetIconInput } from '../../services/assetIconResolver';
import { formatDisplayPath } from '../../services/deckFilterService';
import { AssetIcon } from './AssetIcon';

interface Preview {
  assetId: string;
  source: string;
  hash: string;
  adapter: string;
  format: string;
  createdAt: number;
  path: string;
  outputHash: string;
}

type CacheStatus = 'ready' | 'empty' | 'stale' | 'error';

const CACHE_STATUS_LABELS: Readonly<Record<CacheStatus, string>> = {
  ready: 'Prévia disponível',
  empty: 'Prévia não gerada',
  stale: 'Prévia desatualizada',
  error: 'Falha na geração',
};

function summarizeSoftwareName(
  isBlend: boolean,
  environment: Record<string, unknown>,
  declaredUnreal?: string,
): string {
  if (isBlend) {
    const rawBlender = environment.blender;
    if (typeof rawBlender === 'string' && rawBlender.trim()) {
      const versionMatch = rawBlender.match(/blender[\s_-]*(\d+(?:\.\d+)?)/i);
      return versionMatch ? `Blender ${versionMatch[1]}` : 'Blender configurado';
    }
    return 'Blender não detectado';
  }
  return declaredUnreal ? `Unreal Engine ${declaredUnreal}` : 'Unreal Engine';
}

export function ConvertedPreview({
  path,
  assetId,
  active,
  render,
  iconRecord,
}: {
  path: string;
  assetId: string;
  active: boolean;
  render: (path: string) => ReactNode;
  iconRecord?: AssetIconInput;
}) {
  const [environment, setEnvironment] = useState<Record<string, unknown>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cacheStale, setCacheStale] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [unreal, setUnreal] = useState<unknown>(null);
  const [clear, setClear] = useState(false);
  const [assisted, setAssisted] = useState('');

  const declared = (unreal as { engineAssociation?: string } | null)
    ?.engineAssociation;
  const installed =
    (
      environment.unreal as
        | { version: { MajorVersion: number; MinorVersion: number } }[]
        | undefined
    ) ?? [];
  const matching = declared
    ? installed.some(
        (e) =>
          `${e.version.MajorVersion}.${e.version.MinorVersion}` === declared,
      )
    : false;
  const blend = path.toLowerCase().endsWith('.blend');

  useEffect(() => {
    setPreview(null);
    setAssisted('');
    setErrorMessage(null);
    setCacheStale(false);
    setStatusNote(null);
    if (!isTauri()) return;
    void invoke<Record<string, unknown>>('preview_environment')
      .then(setEnvironment)
      .catch((e) => setErrorMessage(String(e)));
    if (!blend) {
      void invoke('preview_unreal', { path })
        .then(setUnreal)
        .catch((e) => setErrorMessage(String(e)));
    }
    return () => {
      void invoke('preview_cancel');
    };
  }, [path, blend]);

  useEffect(() => {
    if (!preview || !active) return;
    let alive = true;
    const check = () =>
      void invoke<boolean>('preview_validate', { preview })
        .then((valid) => {
          if (alive && !valid) {
            setPreview(null);
            setCacheStale(true);
            setErrorMessage(null);
            setStatusNote('Prévia desatualizada. Gere uma nova prévia.');
          }
        })
        .catch(() => {});
    const timer = setInterval(check, 15000);
    window.addEventListener('focus', check);
    check();
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [preview, active]);

  const generate = async () => {
    setBusy(true);
    setErrorMessage(null);
    setCacheStale(false);
    setStatusNote('Gerando prévia GLB em segundo plano…');
    try {
      const p = await invoke<Preview>('preview_blender', { assetId, path });
      setPreview(p);
      setStatusNote('Prévia GLB gerada a partir do arquivo original.');
    } catch (e) {
      setErrorMessage(String(e));
      setStatusNote(null);
    } finally {
      setBusy(false);
    }
  };

  const configureBlender = async () => {
    setErrorMessage(null);
    const chosen = await invoke<string | null>('escolher_recurso', {
      directory: false,
    });
    if (!chosen) return;
    try {
      await invoke('preview_configure_blender', { path: chosen });
      setEnvironment(await invoke('preview_environment'));
      setStatusNote('Executável do Blender atualizado.');
    } catch (e) {
      setErrorMessage(String(e));
    }
  };

  const pickUnrealExport = async () => {
    setErrorMessage(null);
    const chosen = await invoke<string | null>('escolher_recurso', {
      directory: false,
    });
    if (!chosen) return;
    if (!/\.(glb|gltf|fbx|obj)$/i.test(chosen)) {
      setErrorMessage('Selecione uma exportação GLB, GLTF, FBX ou OBJ válida.');
      return;
    }
    setAssisted(chosen);
    setStatusNote('Exportação manual carregada para visualização.');
  };

  const locateOriginal = () => {
    setErrorMessage(null);
    void invoke('localizar_recurso', { path })
      .then(() => setStatusNote('Original localizado no Explorador de Arquivos.'))
      .catch((e) => setErrorMessage(String(e)));
  };

  const softwareLabel = summarizeSoftwareName(blend, environment, declared);
  const hasPreview = Boolean(preview || assisted);
  const cacheStatus: CacheStatus = errorMessage
    ? 'error'
    : hasPreview
      ? 'ready'
      : cacheStale
        ? 'stale'
        : 'empty';

  const shortReason = errorMessage
    ? errorMessage
    : busy
      ? 'Convertendo geometria no Blender em segundo plano…'
      : statusNote
        ? statusNote
        : blend
          ? 'Arquivos .blend requerem prévia GLB para visualização 3D.'
          : 'Assets .uasset exigem uma exportação GLB, GLTF, FBX ou OBJ.';

  const fullBlenderPath =
    typeof environment.blender === 'string' && environment.blender.trim()
      ? formatDisplayPath(environment.blender)
      : 'Não configurado';

  return (
    <section
      className={`rb-viewer rb-preview-panel ${
        hasPreview ? 'has-preview' : 'rb-viewer--compact'
      }`}
      aria-label="Painel de prévia do asset"
    >
      {!hasPreview ? (
        <div className="rb-preview-unavailable">
          <div className="rb-preview-unavailable__head">
            <span className="rb-preview-unavailable__icon" aria-hidden="true">
              <AssetIcon asset={iconRecord ?? { caminho: path }} />
            </span>
            <div className="rb-preview-unavailable__copy">
              <h4>Prévia indisponível</h4>
              <p className={errorMessage ? 'is-error' : undefined}>
                {shortReason}
              </p>
            </div>
          </div>

          <div className="rb-preview-unavailable__meta">
            <span className="rb-preview-software-chip">{softwareLabel}</span>
            <span className={`rb-preview-cache-badge is-${cacheStatus}`}>
              {CACHE_STATUS_LABELS[cacheStatus]}
            </span>
          </div>

          <div className="rb-preview-actions">
            {blend ? (
              <button
                type="button"
                className="rb-preview-btn rb-preview-btn--primary"
                disabled={busy || !isTauri()}
                onClick={() => void generate()}
              >
                <svg
                  className="nautia-mini-svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="6 4 20 12 6 20 6 4" />
                </svg>
                <span>{busy ? 'Gerando prévia…' : 'Gerar prévia GLB'}</span>
              </button>
            ) : (
              <button
                type="button"
                className="rb-preview-btn rb-preview-btn--primary"
                disabled={!isTauri()}
                onClick={() => void pickUnrealExport()}
              >
                <svg
                  className="nautia-mini-svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M4 20h16" />
                </svg>
                <span>Abrir exportação do Unreal…</span>
              </button>
            )}

            {busy && (
              <button
                type="button"
                className="rb-preview-btn"
                onClick={() => void invoke('preview_cancel')}
              >
                Cancelar
              </button>
            )}

            {blend && (
              <button
                type="button"
                className="rb-preview-btn"
                disabled={busy || !isTauri()}
                onClick={() => void configureBlender()}
              >
                <svg
                  className="nautia-mini-svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.84 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
                <span>Configurar Blender</span>
              </button>
            )}

            <button
              type="button"
              className="rb-preview-btn"
              disabled={!isTauri() || busy}
              onClick={locateOriginal}
            >
              <svg
                className="nautia-mini-svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span>Localizar no Explorer</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="rb-preview-active-wrap">
          <div className="rb-preview-active-bar">
            <span className="rb-preview-cache-badge is-ready">
              {preview ? 'Prévia disponível' : 'Exportação carregada'}
            </span>
            <span className="rb-preview-software-chip">{softwareLabel}</span>
          </div>
          {active && render(preview?.path ?? assisted)}
        </div>
      )}

      <details className="rb-preview-details">
        <summary>
          <span>Detalhes técnicos</span>
          <span className="rb-preview-details__hint">Cache e adaptador</span>
        </summary>
        <div className="rb-preview-details__body">
          <dl className="rb-preview-details__meta">
            <div>
              <dt>Estado do cache</dt>
              <dd>{CACHE_STATUS_LABELS[cacheStatus]}</dd>
            </div>
            {blend ? (
              <div>
                <dt>Executável Blender</dt>
                <dd className="rb-preview-details__path">{fullBlenderPath}</dd>
              </div>
            ) : (
              <div>
                <dt>Versão Unreal</dt>
                <dd>
                  {declared ?? 'Não identificada'}{' '}
                  {declared ? (matching ? '(compatível)' : '(não confirmada)') : ''}
                </dd>
              </div>
            )}
          </dl>

          <p className="rb-preview-details__note">
            A conversão gera uma prévia temporária para visualização e pode omitir materiais procedurais, modificadores ou simulações. Cache de prévia não substitui backup do arquivo original.
          </p>

          {!blend && (
            <p className="rb-preview-details__note">
              Exporte o asset como GLB ou FBX no Unreal Editor e selecione o arquivo gerado acima para inspecioná-lo.
            </p>
          )}

          {preview && (
            <pre className="rb-preview-details__json">
              {JSON.stringify(preview, null, 2)}
            </pre>
          )}

          <div className="rb-preview-cache-clear">
            <label className="rb-preview-cache-clear__check">
              <input
                type="checkbox"
                checked={clear}
                onChange={(e) => setClear(e.target.checked)}
              />
              <span>Limpar prévias temporárias (originais e backups preservados)</span>
            </label>
            <button
              type="button"
              className="rb-preview-btn"
              disabled={!clear || busy || !isTauri()}
              onClick={() =>
                void invoke('preview_clear', { confirmed: true })
                  .then(() => {
                    setPreview(null);
                    setClear(false);
                    setCacheStale(false);
                    setErrorMessage(null);
                    setStatusNote('Cache de prévias limpo.');
                  })
                  .catch((e) => setErrorMessage(String(e)))
              }
            >
              Limpar cache
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
