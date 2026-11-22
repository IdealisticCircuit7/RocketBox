import { invoke, isTauri } from '@tauri-apps/api/core';

import type { DeckAsset } from './deckFilterService';

export type VaultScope = 'original' | 'dependencies' | 'explicit';

export type ExportAsFormat = 'fbx' | 'obj' | 'glb' | 'gltf';

export interface ExportAsResult {
  outputPath: string;
  format: ExportAsFormat;
  source: string;
}

export interface VaultConfig { enabled: boolean; directory: string; maxBytes: number; maxVersions: number; automatic: boolean }

export interface VaultEntry { relative: string; bytes: number; sha256: string }

export interface VaultVersion { schema: number; version: string; assetId: string; source: string; scope: VaultScope; createdAt: number; entries: VaultEntry[]; warnings: string[] }

export interface VaultInventory { usedBytes: number; availableBytes: number; versions: VaultVersion[] }

export interface VaultPlan { root: string; paths: string[]; bytes: number; warnings: string[]; fingerprint: string }

export interface ResourceInspection { path: string; isDirectory: boolean; size: number | null; signature: string | null; structureMarkers: string[]; warnings: string[] }

export const vaultApi = {

  config: () => invoke<VaultConfig>('vault_config'),

  saveConfig: (config: VaultConfig) => invoke('vault_save_config', { config }),

  list: () => invoke<VaultInventory>('vault_list'),

  plan: (source: string, scope: VaultScope, selected: string[]) => invoke<VaultPlan>('vault_plan', { source, scope, selected }),

  run: (request: { jobId: string; action: 'backup' | 'export' | 'restore' | 'verify'; assetId: string; source: string; scope: VaultScope; selected: string[]; version?: string; destination?: string; expectedPlan?: VaultPlan }) => invoke<VaultVersion>('vault_run', { request }),

  cancel: (jobId: string) => invoke('vault_cancel', { jobId }),

  deleteVersions: (versions: string[], confirmed: boolean) => invoke('vault_delete', { versions, confirmed }),

  choose: (directory: boolean) => invoke<string | null>('escolher_recurso', { directory }),

  inspect: (path: string) => invoke<ResourceInspection>('inspecionar_recurso', { path }),

  exportAs: (sourcePath: string, destinationDir: string, targetFormat: ExportAsFormat) =>
    invoke<ExportAsResult>('export_asset_as', { sourcePath, destinationDir, targetFormat }),

};

export function validateRelink(asset: DeckAsset, inspection: ResourceInspection): void {

  const directory = asset.kind === 'project' && asset.projectType === 'unity';

  if (inspection.isDirectory !== directory) throw new Error(directory ? 'O projeto Unity exige diretório.' : 'Selecione um arquivo, não um diretório.');

  if (directory) {

    if (!['Assets', 'Packages', 'ProjectSettings'].every(k => inspection.structureMarkers.includes(k))) throw new Error('Diretório não contém a estrutura Unity esperada.');

  } else {

    const extension = (p: string) => p.split(/[\\/]/).pop()?.match(/\.[^.]+$/)?.[0].toLowerCase() ?? '';

    const expected = extension(asset.caminho);

    if (extension(inspection.path) !== expected) throw new Error('Relink exige o mesmo formato do registro. Cadastre conversões como novo recurso.');

    const signatures: Record<string, string[]> = { '.glb': ['GLB'], '.blend': ['BLEND'], '.png': ['PNG'], '.jpg': ['JPEG'], '.jpeg': ['JPEG'], '.fbx': ['FBX_BIN','FBX_ASCII'], '.uasset': ['UASSET'] };

    if (signatures[expected] && !signatures[expected].includes(inspection.signature ?? '')) throw new Error('Assinatura do novo arquivo não corresponde ao formato.');

  }

}

export async function automaticAssetBackup(asset: DeckAsset, notify: (message: string) => void) {

  if (!isTauri() || asset.kind === 'project' || asset.kind === 'package') return;

  try {

    const config = await vaultApi.config();

    if (!config.enabled || !config.automatic) return;

    // Automatic policy is deliberately limited to a newly registered/relinked individual original.

    const expectedPlan = await vaultApi.plan(asset.caminho, 'original', []);
    await vaultApi.run({ jobId: crypto.randomUUID(), action: 'backup', assetId: asset.id, source: asset.caminho, scope: 'original', selected: [], expectedPlan });

    notify('Backup automático do original concluído. Dependências exigem escopo manual.');

  } catch (error) { notify(`Registro preservado; backup automático não concluído: ${String(error)}`); }

}

