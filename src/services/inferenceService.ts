import { invoke, isTauri } from '@tauri-apps/api/core';
import { RULESET_VERSION, TECHNICAL_RULES } from './technicalRules.ts';
import {
  type DeckAsset,
  migrateLegacyAssetRecord,
  ORIGIN_SOFTWARE_LABELS,
  REGISTRATION_KIND_LABELS,
  softwareToLegacyEngineLabel,
  VERIFICATION_STATUS_LABELS,
  type VerificationStatus,
} from './deckFilterService.ts';

/**
 * Motor de Inferência como serviço interno (Etapa 02 - Seção 2 e Smart Asset Registration 2.0 - Etapa 06).
 * Regras puramente determinísticas: analisa apenas informações verificáveis,
 * nunca inventa propriedades de arquivos não inspecionados no disco e nunca declara
 * compatibilidade apenas porque o usuário selecionou um destino pretendido.
 */

export type DiagnosticStatus =
  | 'compatible'
  | 'warning'
  | 'incompatible'
  | 'limited';

export interface StructuredInferenceReport {
  readonly analyzedAt?: string;
  readonly rulesetVersion?: string;
  readonly fingerprint?: string;
  readonly contextKey?: string;
  readonly collectedData?: Readonly<Record<string, string>>;
  readonly errors?: readonly string[];
  readonly notPerformed?: readonly string[];
  readonly ruleDefinitions?: readonly unknown[];
  readonly compatibility?: { readonly target: string; readonly status: 'not_verified' | 'conditional' | 'incompatible'; readonly testedImport: false };
  readonly assetId: string;
  readonly assetName: string;
  readonly identifiedFormat: string;
  readonly verificationStatus?: VerificationStatus;
  readonly verifiedMetadata: Readonly<Record<string, string>>;
  readonly appliedRules: readonly string[];
  readonly diagnostic: {
    readonly status: DiagnosticStatus;
    readonly title: string;
    readonly summary: string;
  };
  readonly warnings: readonly string[];
  readonly recommendedOperations: readonly string[];
  readonly evidence: readonly string[];
  readonly source: 'tauri-python+rules' | 'local-rules' | 'tauri-file+rules';
}

export interface PythonKnowledgeMatch {
  readonly id?: string;
  readonly nome: string;
  readonly caminho: string;
  readonly formato: string;
  readonly diagnostico: string;
  readonly explicacao: string;
  readonly regras_aplicadas?: readonly string[];
  readonly avisos?: readonly string[];
  readonly operacoes_recomendadas?: readonly string[];
  readonly evidencias?: readonly string[];
}

export interface InferenceServiceOptions {
  readonly targetEngine?: string;
  readonly consultPythonBackend?: boolean;
  readonly tauriInvoker?: <T>(cmd: string, args: Record<string, unknown>) => Promise<T>;
  readonly runningInTauri?: boolean;
  readonly savedReports?: Readonly<Record<string, StructuredInferenceReport | undefined>>;
}

const nativeInvoker = <T,>(cmd: string, args: Record<string, unknown>) => invoke<T>(cmd, args);
const inFlightCollections = new Map<string, Promise<CollectedFacts>>();
async function collectNative(path: string): Promise<CollectedFacts> {
  let pending = inFlightCollections.get(path);
  if (!pending) {
    pending = nativeInvoker<CollectedFacts>('analisar_recurso', { path });
    inFlightCollections.set(path, pending);
    void pending.finally(() => inFlightCollections.delete(path)).catch(() => {});
  }
  return pending;
}

const KNOWN_FORMATS = new Set([
  '.fbx',
  '.obj',
  '.blend',
  '.glb',
  '.gltf',
  '.uasset',
  '.uproject',
  '.unitypackage',
  '.unityproj',
  '.png',
  '.jpg',
  '.jpeg',
  '.exr',
  '.tga',
  '.wav',
  '.ogg',
]);

function extractExtensionFromPath(path: string): string {
  const clean = path.trim().replace(/\\/g, '/');
  const lastSegment = clean.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return lastSegment.slice(dotIndex).toLocaleLowerCase('pt-BR');
}

function normalizeFormat(value?: string): string {
  const trimmed = (value ?? '').trim().toLocaleLowerCase('pt-BR');
  if (!trimmed) return '';
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

export function analyzeSingleAsset(
  rawAsset: DeckAsset,
  targetEngine?: string,
  pythonMatches: readonly PythonKnowledgeMatch[] = [],
  usedPythonBackend = false,
): StructuredInferenceReport {
  const asset = migrateLegacyAssetRecord(rawAsset);
  const declaredFormat = normalizeFormat(asset.formato);
  const pathExtension = extractExtensionFromPath(asset.caminho || '');
  const isUnityDir =
    asset.kind === 'project' &&
    asset.sourceSoftware === 'unity' &&
    !pathExtension;
  const identifiedFormat =
    pathExtension ||
    (isUnityDir ? '.unityproj' : declaredFormat) ||
    'Não identificado';

  const kindLabel = REGISTRATION_KIND_LABELS[asset.kind ?? 'asset'];
  const originLabel = ORIGIN_SOFTWARE_LABELS[asset.sourceSoftware ?? 'unknown'];
  const targetLabels = (asset.targetSoftware ?? []).map(
    (item) => ORIGIN_SOFTWARE_LABELS[item],
  );

  const verifiedMetadata: Record<string, string> = {
    nome: asset.nome,
    caminho: asset.caminho,
    modalidade: kindLabel,
    softwareOrigem: originLabel,
    categoria: asset.categoria || 'Não informado',
    formatoDeclarado: declaredFormat || 'Não informado',
    extensaoNoCaminho: pathExtension || (isUnityDir ? 'Diretório Unity' : 'Sem extensão detectável'),
    engineCadastro: asset.engine || 'Qualquer',
  };
  if (targetLabels.length > 0) {
    verifiedMetadata.destinosPretendidos = targetLabels.join(', ');
  }
  if (asset.technicalType) {
    verifiedMetadata.tipoTecnico = asset.technicalType;
  }
  if (asset.projeto) verifiedMetadata.projeto = asset.projeto;
  if (asset.createdAt) verifiedMetadata.dataRegistro = asset.createdAt;

  const appliedRules: string[] = ['RULE_VERIFY_DECLARED_METADATA'];
  const warnings: string[] = [];
  const recommendedOperations: string[] = [];
  const evidence: string[] = [
    `Metadado cadastrado: modalidade="${kindLabel}", origem="${originLabel}", categoria="${verifiedMetadata.categoria}", formato="${verifiedMetadata.formatoDeclarado}".`,
  ];

  let status: DiagnosticStatus = 'compatible';
  let verificationStatus: VerificationStatus = 'verified';
  let title = 'Compatível com os parâmetros verificados';
  let summary = `Registro "${asset.nome}" (${kindLabel}) analisado deterministicamente a partir dos metadados registrados.`;

  if (pathExtension) {
    appliedRules.push('RULE_PATH_EXTENSION_CHECK');
    evidence.push(`Extensão extraída do caminho registrado: "${pathExtension}".`);
  } else if (isUnityDir) {
    appliedRules.push('RULE_UNITY_PROJECT_DIRECTORY_CHECK');
    verificationStatus = 'not_verified';
    status = 'limited';
    title = 'Diretório de Projeto Unity — Não verificado em disco';
    summary =
      'Diretório registrado como Projeto Unity. A presença física de Assets, Packages e ProjectSettings depende de verificação em disco.';
    warnings.push(
      'Verifique a existência das pastas Assets, Packages e ProjectSettings no diretório do projeto.',
    );
  } else {
    warnings.push(
      'O caminho informado não possui extensão identificável; estado classificado como Não verificado.',
    );
    status = 'limited';
    verificationStatus = 'not_verified';
  }

  if (
    declaredFormat &&
    pathExtension &&
    declaredFormat !== pathExtension &&
    declaredFormat !== '.unknown'
  ) {
    appliedRules.push('RULE_FORMAT_PATH_MISMATCH');
    status = 'warning';
    verificationStatus = 'warning';
    title = 'Divergência entre formato declarado e caminho';
    warnings.push(
      `O formato cadastrado (${declaredFormat}) diverge da extensão do caminho (${pathExtension}).`,
    );
    recommendedOperations.push('Revisar metadado de formato do registro.');
    evidence.push(
      `Divergência detectada: formato="${declaredFormat}" vs caminho="${pathExtension}".`,
    );
  }

  // Determina a engine avaliada sem presumir compatibilidade automática só pela escolha de destino
  const derivedEngine =
    asset.targetSoftware && asset.targetSoftware.length > 0
      ? softwareToLegacyEngineLabel(
          asset.sourceSoftware ?? 'unknown',
          asset.targetSoftware,
        )
      : asset.engine || 'Qualquer';
  const effectiveEngine = (targetEngine || derivedEngine || 'Qualquer').trim();
  verifiedMetadata.engineAvaliada = effectiveEngine;

  if (targetLabels.length > 0) {
    appliedRules.push('RULE_TARGET_INTENT_SEPARATION');
    evidence.push(
      `Destinos pretendidos declarados pelo usuário: ${targetLabels.join(', ')} (intenção de uso separada da validação técnica).`,
    );
  }

  // Regras determinísticas de compatibilidade por Engine e Formato
  if (effectiveEngine === 'Unreal Engine 5') {
    appliedRules.push('RULE_ENGINE_UE5_COMPATIBILITY');
    if (identifiedFormat === '.blend') {
      appliedRules.push('RULE_UE5_BLEND_EXPORT');
      status = 'warning';
      verificationStatus = 'warning';
      title = 'Compatível com ressalva na Unreal Engine 5';
      summary =
        'Arquivos .blend não são importados nativamente pela Unreal Engine 5.';
      warnings.push(
        'Unreal Engine 5 requer exportação intermediária para .fbx ou .glb.',
      );
      recommendedOperations.push(
        'Exportar o modelo do Blender para .fbx antes de importar na UE5.',
      );
      evidence.push('Regra determinística UE5: formato .blend exige exportação.');
    } else if (identifiedFormat === '.unitypackage') {
      status = 'incompatible';
      verificationStatus = 'unsupported';
      title = 'Pacote Unity incompatível diretamente com Unreal Engine 5';
      summary =
        'Arquivos .unitypackage são pacotes proprietários do ecossistema Unity.';
      warnings.push(
        'Para uso na Unreal Engine 5, extraia as malhas/texturas originais (.fbx, .png) do pacote.',
      );
    } else if (
      identifiedFormat === '.uasset' ||
      identifiedFormat === '.fbx' ||
      identifiedFormat === '.uproject'
    ) {
      if (identifiedFormat === '.uproject') {
        appliedRules.push('RULE_UNREAL_UPROJECT');
      }
      title = 'Compatibilidade nativa com Unreal Engine 5';
      summary = `O formato ${identifiedFormat} possui integração direta com Unreal Engine 5.`;
      evidence.push(`Regra determinística UE5: formato ${identifiedFormat} nativo.`);
    } else if (identifiedFormat === '.glb' || identifiedFormat === '.gltf') {
      title = 'Compatível via Interchange na Unreal Engine 5';
      summary = `O formato ${identifiedFormat} é suportado via pipeline Interchange na UE5.`;
      evidence.push(`Regra determinística UE5: ${identifiedFormat} via Interchange.`);
    }
  } else if (effectiveEngine === 'Unity') {
    appliedRules.push('RULE_ENGINE_UNITY_COMPATIBILITY');
    if (identifiedFormat === '.uasset' || identifiedFormat === '.uproject') {
      status = 'incompatible';
      verificationStatus = 'unsupported';
      title = 'Formato incompatível com Unity';
      summary = `Arquivos ${identifiedFormat} são proprietários da Unreal Engine e não são importáveis na Unity.`;
      warnings.push(
        'Necessário exportar malhas/materiais originais para .fbx ou .glb.',
      );
      recommendedOperations.push('Converter fonte original para .fbx ou .glb.');
      evidence.push(`Regra determinística Unity: ${identifiedFormat} não suportado.`);
    } else if (KNOWN_FORMATS.has(identifiedFormat)) {
      title = 'Compatível com Unity';
      summary = `O formato ${identifiedFormat} é suportado pelo ecossistema Unity.`;
      evidence.push(`Regra determinística Unity: ${identifiedFormat} aceito.`);
    }
  } else if (effectiveEngine === 'OMNIN Engine') {
    appliedRules.push('RULE_ENGINE_OMNIN_COMPATIBILITY');
    if (['.fbx', '.glb', '.gltf', '.obj', '.png', '.jpg', '.exr'].includes(identifiedFormat)) {
      title = 'Compatível com OMNIN Engine';
      summary = `Formato ${identifiedFormat} suportado pelas diretrizes padrão do ecossistema OMNIN.`;
      evidence.push(`Regra determinística OMNIN: ${identifiedFormat} aceito.`);
    } else {
      status = status === 'compatible' ? 'limited' : status;
      verificationStatus = 'not_verified';
      warnings.push(
        `Compatibilidade específica de ${identifiedFormat} na OMNIN Engine não está catalogada na base local.`,
      );
    }
  }

  if (!KNOWN_FORMATS.has(identifiedFormat) && identifiedFormat !== 'Não identificado') {
    appliedRules.push('RULE_UNCATALOGED_FORMAT');
    if (status === 'compatible') status = 'limited';
    verificationStatus = 'not_verified';
    title = 'Não verificado — Formato fora do catálogo padrão';
    warnings.push(
      `Formato "${identifiedFormat}" fora do catálogo padrão de regras conhecidas. Estado: Não verificado.`,
    );
  }

  verifiedMetadata.estadoVerificacao = VERIFICATION_STATUS_LABELS[verificationStatus];

  if ((asset.tags?.length ?? 0) === 0 && (asset.assetTagIds?.length ?? 0) === 0) {
    recommendedOperations.push(
      `Sugestão determinística: aplicar etiqueta técnica "${identifiedFormat}" ou "${asset.categoria}".`,
    );
  }

  const kbMatch = pythonMatches.find(
    (entry) =>
      entry.nome.toLocaleLowerCase('pt-BR') === asset.nome.toLocaleLowerCase('pt-BR') ||
      entry.caminho.toLocaleLowerCase('pt-BR') === asset.caminho.toLocaleLowerCase('pt-BR'),
  );

  if (kbMatch) {
    appliedRules.push(...(kbMatch.regras_aplicadas ?? ['RULE_SIA_KNOWLEDGE_BASE_MATCH']));
    evidence.push(
      `Correspondência verificada na base SIA (motor_rocketbox.py): ${kbMatch.diagnostico}`,
    );
    if (kbMatch.avisos?.length) {
      for (const warn of kbMatch.avisos) {
        if (!warnings.includes(warn)) warnings.push(warn);
      }
    }
  }

  warnings.push(
    'Escopo verificado por metadados: leitura binária/física do arquivo em disco não executada neste nível.',
  );

  // Metadata and extension rules never establish complete compatibility.
  if (status === 'compatible') {
    status = 'limited';
    title = 'Compatibilidade não verificada no software de destino';
    summary = 'Metadados e extensão reconhecidos; conteúdo e importação requerem verificação.';
    verificationStatus = 'not_verified';
  }
  verifiedMetadata.estadoVerificacao = VERIFICATION_STATUS_LABELS[verificationStatus];
  return {
    assetId: asset.id,
    assetName: asset.nome,
    identifiedFormat,
    verificationStatus,
    verifiedMetadata,
    appliedRules: Array.from(new Set(appliedRules)),
    diagnostic: {
      status,
      title,
      summary,
    },
    warnings,
    recommendedOperations,
    evidence,
    source: usedPythonBackend ? 'tauri-python+rules' : 'local-rules',
  };
}

/**
 * Serviço interno reutilizável do Motor de Inferência.
 * Aceita lote de assets, consulta o comando Tauri/Python quando disponível
 * e retorna diagnósticos estruturados e fundamentados.
 */
export async function runStructuredInference(
  assets: readonly DeckAsset[],
  options: InferenceServiceOptions = {},
): Promise<StructuredInferenceReport[]> {
  if (assets.length > 100) throw new Error('Selecione até 100 assets por análise.');
  const native = options.runningInTauri ?? isTauri();
  const invoker = options.tauriInvoker ?? nativeInvoker;
  const reports: StructuredInferenceReport[] = [];
  const collected = new Map<string, Promise<CollectedFacts>>();
  for (const asset of assets) {
    const contextKey = analysisContextKey(asset, options.targetEngine);
    const base = analyzeSingleAsset(asset, options.targetEngine);
    let report: StructuredInferenceReport = {
      ...base, analyzedAt: new Date().toISOString(), rulesetVersion: RULESET_VERSION, contextKey,
      errors: [], collectedData: {}, notPerformed: ['Inspeção física não realizada', 'Importação no software de destino', 'Dependências externas, rig e geometria completa'],
      ruleDefinitions: TECHNICAL_RULES,
      compatibility: { target: options.targetEngine ?? base.verifiedMetadata.engineAvaliada, status: base.diagnostic.status === 'incompatible' ? 'incompatible' : 'not_verified', testedImport: false },
    };
    if (native) {
      try {
        if (!collected.has(asset.caminho)) collected.set(asset.caminho, options.tauriInvoker ? invoker<CollectedFacts>('analisar_recurso', { path: asset.caminho }) : collectNative(asset.caminho));
        let timer: ReturnType<typeof setTimeout> | undefined;
        const facts = await Promise.race([collected.get(asset.caminho)!, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo limite de coleta excedido (6 segundos).')), 6000); })]).finally(() => clearTimeout(timer));
        const saved = options.savedReports?.[asset.id];
        if (saved?.fingerprint === facts.fingerprint && saved.rulesetVersion === RULESET_VERSION && saved.contextKey === contextKey && !facts.errors.length) {
          reports.push(saved); continue;
        }
        const recognized = facts.metadata.conteudoReconhecido === 'true';
        const structure = facts.format === 'directory' && ['Assets', 'Packages', 'ProjectSettings'].every(k => facts.metadata[k] === 'true');
        report = { ...report, source: 'tauri-file+rules', fingerprint: facts.fingerprint, collectedData: facts.metadata,
          errors: facts.errors, notPerformed: facts.notPerformed,
          warnings: [...base.warnings.filter(w => !w.startsWith('Escopo verificado por metadados')), ...facts.warnings],
          appliedRules: [...base.appliedRules, facts.format === 'directory' ? 'PROJECT_MARKERS' : 'CONTENT_HEADER'],
          evidence: [...base.evidence, `Caminho efetivamente lido: ${facts.path}`, ...facts.evidence],
          diagnostic: facts.errors.length ? { status: 'warning', title: 'Arquivo inválido ou análise com erro', summary: facts.errors.join(' ') }
            : base.diagnostic.status === 'incompatible' || base.diagnostic.status === 'warning' ? base.diagnostic
            : { status: 'limited', title: recognized || structure ? 'Análise técnica parcial' : 'Conteúdo não verificado', summary: 'Coleta local concluída; a compatibilidade completa depende das verificações pendentes.' },
          verificationStatus: facts.errors.length ? 'warning' : recognized || structure ? 'verified' : 'not_verified',
          compatibility: { target: options.targetEngine ?? base.verifiedMetadata.engineAvaliada, status: facts.errors.length ? 'not_verified' : base.diagnostic.status === 'incompatible' ? 'incompatible' : 'not_verified', testedImport: false },
        };
      } catch (error) {
        report = { ...report, errors: [String(error)], diagnostic: { status: 'warning', title: 'Recurso indisponível para análise', summary: String(error) } };
      }
    }
    report = { ...report, ruleDefinitions: report.appliedRules.map(id => TECHNICAL_RULES.find(r => r.id === id) ?? { id, version: 1, origin: 'RocketBox legacy metadata rules', format: report.identifiedFormat, resourceType: asset.kind ?? 'asset', sourceSoftware: asset.sourceSoftware ?? 'unknown', targetSoftware: report.compatibility?.target, softwareVersion: null, limitation: 'Declared metadata only; no destination import test.' }) };
    reports.push(report);
    // Yield between bounded rules evaluations on large batches.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return reports;
}

interface CollectedFacts {
  path: string; fingerprint: string; format: string;
  metadata: Record<string, string>; evidence: string[]; warnings: string[]; errors: string[]; notPerformed: string[];
}

export function analysisContextKey(asset: DeckAsset, target?: string): string {
  return JSON.stringify([asset.caminho, asset.nome, asset.formato, asset.kind, asset.categoria, asset.sourceSoftware, asset.engine, asset.targetSoftware, asset.projeto, asset.tags, target ?? null]);
}
