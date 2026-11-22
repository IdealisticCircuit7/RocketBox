/**
 * OCSIS RocketBox — Smart Tags & Classification 3.0 (Etapas 07 e 08).
 * Serviço compartilhado de classificação e sugestões para o Convés e a NautIA.
 *
 * Separa rigorosamente 4 camadas de informação:
 * 1. Classificação declarada (`declared`): dados preenchidos pelo usuário.
 * 2. Identificação técnica (`technical_identification`): dados reconhecidos por analisadores de caminho/extensão.
 * 3. Inferência técnica (`technical_inference`): conclusões determinísticas do Motor de Inferência.
 * 4. Sugestões inteligentes (`intelligent_suggestion`): recomendações da NautIA (ou futura LLM), sempre exigindo confirmação.
 */

import {
  type DeckAsset,
  type DeckFolder,
  type EtiquetaDeAsset,
  type EtiquetaDePasta,
  migrateLegacyAssetRecord,
  normalizeTagLabel,
  ORIGIN_SOFTWARE_LABELS,
  type OriginSoftware,
  REGISTRATION_KIND_LABELS,
  type RegistrationKind,
  VERIFICATION_STATUS_LABELS,
  type VerificationStatus,
} from './deckFilterService.ts';
import {
  analyzeSingleAsset,
  type StructuredInferenceReport,
} from './inferenceService.ts';

export type InformationOriginLayer =
  | 'declared'
  | 'technical_identification'
  | 'technical_inference'
  | 'intelligent_suggestion';

export type UncertaintyLevel = 'low' | 'medium' | 'high';

export interface CategorySuggestion {
  readonly originLayer: 'intelligent_suggestion';
  readonly provider: 'nautia-deterministic' | 'nautia-llm';
  readonly suggestedCategory: string | null;
  readonly justification: string;
  readonly evidence: readonly string[];
  readonly uncertainty: UncertaintyLevel;
  readonly uncertaintyNote: string;
  readonly requiresUserConfirmation: true;
  readonly canOverwriteUserCategory: false;
}

export interface TagSuggestion {
  readonly originLayer: 'intelligent_suggestion';
  readonly provider: 'nautia-deterministic' | 'nautia-llm';
  readonly label: string;
  readonly normalizedLabel: string;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly uncertainty: UncertaintyLevel;
  readonly requiresUserConfirmation: true;
}

export interface DeclaredClassificationLayer {
  readonly originLayer: 'declared';
  readonly name: string;
  readonly category: string | null;
  readonly categoryDefinedByUser: boolean;
  readonly project: string | null;
  readonly folderId: string | null;
  readonly folderName: string | null;
  readonly assignedTags: readonly string[];
  readonly assignedTagIds: readonly string[];
  readonly declaredTargetSoftware: readonly OriginSoftware[];
}

export interface TechnicalIdentificationLayer {
  readonly originLayer: 'technical_identification';
  readonly registrationKind: RegistrationKind;
  readonly registrationKindLabel: string;
  readonly detectedFormat: string | null;
  readonly fileExtension: string | null;
  readonly technicalType: string | null;
  readonly detectedSourceSoftware: OriginSoftware;
  readonly detectedSourceSoftwareLabel: string;
  readonly projectDirectory: string | null;
  readonly structureMarkers: readonly string[];
}

export interface TechnicalInferenceLayer {
  readonly originLayer: 'technical_inference';
  readonly verificationStatus: VerificationStatus;
  readonly verificationLabel: string;
  readonly compatibilityStatus: StructuredInferenceReport['diagnostic']['status'];
  readonly diagnosticTitle: string;
  readonly diagnosticSummary: string;
  readonly appliedRules: readonly string[];
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
  readonly recommendedOperations: readonly string[];
  readonly analyzedAt: string | null;
}

export interface IntelligentSuggestionsLayer {
  readonly originLayer: 'intelligent_suggestion';
  readonly categorySuggestion: CategorySuggestion;
  readonly tagSuggestions: readonly TagSuggestion[];
  readonly guardrails: readonly string[];
}

export interface AssetClassificationProfile {
  readonly assetId: string;
  readonly declared: DeclaredClassificationLayer;
  readonly technicalIdentification: TechnicalIdentificationLayer;
  readonly technicalInference: TechnicalInferenceLayer;
  readonly suggestions: IntelligentSuggestionsLayer;
}

const THREE_D_EXTENSIONS = new Set([
  '.fbx',
  '.obj',
  '.glb',
  '.gltf',
  '.blend',
  '.uasset',
]);

const TEXTURE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.tga', '.exr']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.ogg', '.mp3', '.flac']);

interface SemanticRule {
  readonly category: string;
  readonly keywords: readonly string[];
  readonly label: string;
}

const SEMANTIC_CATEGORY_RULES: readonly SemanticRule[] = [
  {
    category: 'Personagem',
    label: 'Personagem / Entidade orgânica ou humanoide',
    keywords: [
      'personagem',
      'personagens',
      'character',
      'characters',
      'char',
      'hero',
      'heroi',
      'protagonista',
      'npc',
      'boss',
      'enemy',
      'inimigo',
      'mascots',
      'mascote',
      'jade',
      'lucy',
      'nautia',
      'avatar',
      'soldier',
      'warrior',
    ],
  },
  {
    category: 'Veiculo',
    label: 'Veículo / Embarcação / Aeronave',
    keywords: [
      'veiculo',
      'veiculos',
      'vehicle',
      'vehicles',
      'nave',
      'ship',
      'spaceship',
      'rocket',
      'foguete',
      'car',
      'carro',
      'mech',
      'rover',
      'tank',
      'tanque',
      'hover',
      'aircraft',
    ],
  },
  {
    category: 'Cenario',
    label: 'Cenário / Ambiente / Arquitetura',
    keywords: [
      'cenario',
      'cenarios',
      'environment',
      'env',
      'level',
      'mapa',
      'map',
      'terrain',
      'terreno',
      'corridor',
      'corredor',
      'room',
      'sala',
      'hangar',
      'base',
      'station',
      'estacao',
      'skybox',
      'landscape',
      'forest',
      'floresta',
    ],
  },
  {
    category: 'Objeto',
    label: 'Objeto / Prop / Item interativo',
    keywords: [
      'objeto',
      'objetos',
      'prop',
      'props',
      'crate',
      'caixa',
      'weapon',
      'arma',
      'rifle',
      'sword',
      'espada',
      'chair',
      'cadeira',
      'table',
      'mesa',
      'door',
      'porta',
      'container',
      'barrel',
      'barril',
      'item',
      'pickup',
    ],
  },
  {
    category: 'Animacao',
    label: 'Animação / Clipe de movimento',
    keywords: [
      'anim',
      'animacao',
      'animation',
      'animations',
      'walk',
      'run',
      'idle',
      'attack',
      'jump',
      'locomotion',
      'mocap',
    ],
  },
  {
    category: 'Material',
    label: 'Material / Shader',
    keywords: ['material', 'materials', 'shader', 'shaders', 'mat', 'pbr_mat'],
  },
];

function tokenizeContext(text: string): string[] {
  return normalizeTagLabel(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function buildProjectAcronym(projectName?: string | null): string | null {
  if (!projectName) return null;
  const cleaned = projectName.trim();
  if (!cleaned) return null;

  const words = cleaned
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length >= 2 && words.length <= 5) {
    const stopWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'of', 'the', 'and', 'for']);
    const significant = words.filter((w) => !stopWords.has(w.toLowerCase()));
    if (significant.length >= 2) {
      const acronym = significant.map((w) => w[0].toUpperCase()).join('');
      if (acronym.length >= 2 && acronym.length <= 6) {
        return acronym;
      }
    }
  }
  return null;
}

/**
 * Etapa 07 — Identificação automática / sugestão de categoria semântica.
 * Regra crítica: nunca determina a categoria semântica de formatos 3D (.fbx, .obj, .glb, .blend, .uasset)
 * apenas pela extensão do arquivo, exigindo evidências lexicais/contextuais no nome, caminho ou pasta.
 */
export function suggestAssetCategory(params: {
  readonly asset: DeckAsset;
  readonly folderName?: string | null;
}): CategorySuggestion {
  const asset = migrateLegacyAssetRecord(params.asset);
  const ext = (asset.formato || '').trim().toLocaleLowerCase('pt-BR');

  // Projetos completos de engine não usam categoria semântica de asset individual
  if (asset.kind === 'project') {
    const swLabel = ORIGIN_SOFTWARE_LABELS[asset.sourceSoftware ?? 'unknown'];
    return {
      originLayer: 'intelligent_suggestion',
      provider: 'nautia-deterministic',
      suggestedCategory: `Projeto ${swLabel}`,
      justification:
        'Registros na modalidade Projeto de Software / Engine utilizam classificação estrutural de projeto, sem exigir categoria de personagem, veículo ou cenário.',
      evidence: [`Modalidade registrada: ${REGISTRATION_KIND_LABELS.project}`],
      uncertainty: 'low',
      uncertaintyNote: 'Classificação derivada diretamente da modalidade de projeto.',
      requiresUserConfirmation: true,
      canOverwriteUserCategory: false,
    };
  }

  // Formatos 2D de imagem: evidência direta de textura/imagem, mas com aviso de incerteza semântica
  if (TEXTURE_EXTENSIONS.has(ext)) {
    return {
      originLayer: 'intelligent_suggestion',
      provider: 'nautia-deterministic',
      suggestedCategory: 'Textura',
      justification: `A extensão "${ext.toUpperCase()}" indica um arquivo de imagem ou mapa de textura 2D.`,
      evidence: [`Extensão detectada no caminho: ${ext}`],
      uncertainty: 'low',
      uncertaintyNote:
        'Sem inspeção visual (LLM multimodal), não é possível distinguir se o mapa pertence a personagem, cenário ou interface.',
      requiresUserConfirmation: true,
      canOverwriteUserCategory: false,
    };
  }

  // Formatos de áudio
  if (AUDIO_EXTENSIONS.has(ext)) {
    return {
      originLayer: 'intelligent_suggestion',
      provider: 'nautia-deterministic',
      suggestedCategory: 'Audio',
      justification: `A extensão "${ext.toUpperCase()}" corresponde a um arquivo de áudio.`,
      evidence: [`Extensão detectada no caminho: ${ext}`],
      uncertainty: 'low',
      uncertaintyNote:
        'Sem leitura da faixa de áudio, não é possível distinguir trilha musical (BGM) de efeito sonoro (SFX).',
      requiresUserConfirmation: true,
      canOverwriteUserCategory: false,
    };
  }

  // Para formatos 3D (.fbx, .obj, .glb, .gltf, .blend, .uasset) ou outros:
  // NUNCA determinar categoria apenas pela extensão! Avaliar tokens do nome, caminho e pasta.
  const nameTokens = tokenizeContext(asset.nome || '');
  const pathTokens = tokenizeContext(asset.caminho || '');
  const folderTokens = params.folderName ? tokenizeContext(params.folderName) : [];

  for (const rule of SEMANTIC_CATEGORY_RULES) {
    const matchedInName = rule.keywords.filter((kw) => nameTokens.includes(kw));
    const matchedInFolder = rule.keywords.filter((kw) => folderTokens.includes(kw));
    const matchedInPath = rule.keywords.filter((kw) => pathTokens.includes(kw));

    const evidence: string[] = [];
    if (matchedInName.length > 0) {
      evidence.push(`Nome do asset contém termo indicador: "${matchedInName.join(', ')}".`);
    }
    if (matchedInFolder.length > 0) {
      evidence.push(`Pasta atual ("${params.folderName}") indica contexto: "${matchedInFolder.join(', ')}".`);
    }
    if (matchedInPath.length > 0 && matchedInName.length === 0) {
      evidence.push(`Caminho do arquivo contém segmento indicador: "${matchedInPath.join(', ')}".`);
    }

    if (evidence.length > 0) {
      if (THREE_D_EXTENSIONS.has(ext)) {
        evidence.push(`Formato 3D compatível com ${rule.label}: ${ext.toUpperCase()}.`);
      }
      return {
        originLayer: 'intelligent_suggestion',
        provider: 'nautia-deterministic',
        suggestedCategory: rule.category,
        justification: `Sugestão "${rule.category}" fundamentada em evidências de nomenclatura/contexto (a extensão ${
          ext.toUpperCase() || 'do arquivo'
        } isoladamente poderia representar personagem, veículo, objeto ou cenário).`,
        evidence,
        uncertainty: matchedInName.length > 0 ? 'medium' : 'high',
        uncertaintyNote:
          'Sugestão heurística baseada em metadados textuais; confirmação visual ou do usuário recomendada.',
        requiresUserConfirmation: true,
        canOverwriteUserCategory: false,
      };
    }
  }

  // Sem evidências semânticas suficientes além da extensão
  return {
    originLayer: 'intelligent_suggestion',
    provider: 'nautia-deterministic',
    suggestedCategory: null,
    justification: THREE_D_EXTENSIONS.has(ext)
      ? `Um arquivo ${ext.toUpperCase()} pode representar Personagem, Veículo, Objeto ou Cenário. Não há evidências suficientes no nome ou caminho para sugerir a categoria apenas pela extensão.`
      : 'Evidências insuficientes nos metadados atuais para sugerir uma categoria semântica com segurança.',
    evidence: ext ? [`Formato identificado: ${ext.toUpperCase()} (ambíguo semanticamente)`] : [],
    uncertainty: 'high',
    uncertaintyNote:
      'Defina a categoria manualmente ou conecte futuramente uma análise visual/multimodal para inspecionar a prévia.',
    requiresUserConfirmation: true,
    canOverwriteUserCategory: false,
  };
}

/**
 * Etapa 07 — Sugestão determinística de etiquetas pela NautIA.
 * Utiliza nome do asset, categoria cadastrada, projeto associado, metadados disponíveis,
 * diagnósticos técnicos e contexto do Convés.
 * Nunca afirma rig, animações ou compatibilidade verificada sem evidência técnica.
 */
export function suggestAssetTags(params: {
  readonly asset: DeckAsset;
  readonly folderName?: string | null;
  readonly existingAssetTags?: readonly EtiquetaDeAsset[];
  readonly inferenceReport?: StructuredInferenceReport | null;
}): readonly TagSuggestion[] {
  const asset = migrateLegacyAssetRecord(params.asset);
  const assignedNormalized = new Set(
    (asset.tags ?? []).map((label) => normalizeTagLabel(label)),
  );
  const suggestions: TagSuggestion[] = [];
  const addedNormalized = new Set<string>();

  const pushSuggestion = (
    label: string,
    reason: string,
    evidence: readonly string[],
    uncertainty: UncertaintyLevel = 'low',
  ) => {
    const clean = label.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    const norm = normalizeTagLabel(clean);
    if (!norm || assignedNormalized.has(norm) || addedNormalized.has(norm)) {
      return;
    }
    addedNormalized.add(norm);
    suggestions.push({
      originLayer: 'intelligent_suggestion',
      provider: 'nautia-deterministic',
      label: clean,
      normalizedLabel: norm,
      reason,
      evidence,
      uncertainty,
      requiresUserConfirmation: true,
    });
  };

  // 1. Sigla e nome do Projeto associado (ex.: "Deadly Ops Warfare" -> "DOW")
  if (asset.projeto?.trim()) {
    const proj = asset.projeto.trim();
    const acronym = buildProjectAcronym(proj);
    if (acronym) {
      pushSuggestion(
        acronym,
        `Sigla derivada do projeto associado "${proj}".`,
        [`Projeto cadastrado pelo usuário: "${proj}"`],
        'low',
      );
    }
    if (proj.length <= 24 && normalizeTagLabel(proj) !== normalizeTagLabel(acronym ?? '')) {
      pushSuggestion(
        proj,
        `Identificador direto do projeto associado.`,
        [`Projeto cadastrado pelo usuário: "${proj}"`],
        'low',
      );
    }
  }

  // 2. Combinação de Categoria cadastrada + natureza técnica (ex.: Personagem + .fbx -> "Personagem 3D")
  const ext = (asset.formato || '').trim().toLocaleLowerCase('pt-BR');
  const is3D = THREE_D_EXTENSIONS.has(ext) || asset.technicalType?.includes('3D');
  if (asset.categoria?.trim() && asset.kind !== 'project') {
    const cat = asset.categoria.trim();
    if (is3D && ['personagem', 'veiculo', 'veículo', 'cenario', 'cenário', 'objeto'].includes(normalizeTagLabel(cat))) {
      pushSuggestion(
        `${cat} 3D`,
        `Combina a categoria cadastrada ("${cat}") com o formato tridimensional (${(asset.detectedFormat || ext).toUpperCase()}).`,
        [
          `Categoria informada: "${cat}"`,
          `Formato técnico: ${(asset.detectedFormat || ext).toUpperCase()}`,
        ],
        'low',
      );
    } else {
      pushSuggestion(
        cat,
        `Classificação rápida baseada na categoria cadastrada ("${cat}").`,
        [`Categoria informada: "${cat}"`],
        'low',
      );
    }
  }

  // 3. Software de origem quando conhecido tecnicamente ou declarado
  if (asset.sourceSoftware && asset.sourceSoftware !== 'unknown') {
    const swLabel = ORIGIN_SOFTWARE_LABELS[asset.sourceSoftware];
    pushSuggestion(
      swLabel,
      `Software de origem identificado para o registro.`,
      [`Software de origem: ${swLabel}`],
      'low',
    );
  }

  // 4. Formato detectado (ex.: FBX, GLB, BLEND)
  const fmtCode = (asset.detectedFormat || ext.replace(/^\./, '')).trim().toUpperCase();
  if (fmtCode && fmtCode !== 'UNKNOWN' && fmtCode !== 'AUTO') {
    pushSuggestion(
      fmtCode,
      `Formato técnico do arquivo (${fmtCode}).`,
      [`Formato detectado: ${fmtCode}`],
      'low',
    );
  }

  // 5. Destinos pretendidos ou diagnósticos técnicos
  for (const target of asset.targetSoftware ?? []) {
    if (target !== 'unknown') {
      const targetLabel = ORIGIN_SOFTWARE_LABELS[target];
      pushSuggestion(
        targetLabel,
        `Destino pretendido declarado para o asset.`,
        [`Destino pretendido: ${targetLabel}`],
        'medium',
      );
    }
  }

  if (params.inferenceReport?.diagnostic.status === 'warning') {
    pushSuggestion(
      'Requer Conversão',
      'Diagnóstico do Motor de Inferência apontou ressalva de exportação/conversão.',
      params.inferenceReport.warnings.slice(0, 1),
      'low',
    );
  }

  // 6. Correspondência com etiquetas já existentes no catálogo do Convés presentes no nome/pasta
  const contextTokens = new Set([
    ...tokenizeContext(asset.nome || ''),
    ...tokenizeContext(params.folderName || ''),
  ]);
  for (const catalogTag of params.existingAssetTags ?? []) {
    if (contextTokens.has(catalogTag.normalizedLabel)) {
      pushSuggestion(
        catalogTag.label,
        `Etiqueta já existente no Convés encontrada no contexto do asset.`,
        [`Correspondência com etiqueta do catálogo: "${catalogTag.label}"`],
        'medium',
      );
    }
  }

  return suggestions.slice(0, 6);
}

/**
 * Etapa 08 — Constrói o perfil completo de classificação separando explicitamente
 * Classificação Declarada, Identificação Técnica, Inferência Técnica e Sugestões Inteligentes.
 */
export function buildAssetClassificationProfile(params: {
  readonly asset: DeckAsset;
  readonly folders?: readonly DeckFolder[];
  readonly existingAssetTags?: readonly EtiquetaDeAsset[];
  readonly existingFolderTags?: readonly EtiquetaDePasta[];
  readonly inferenceReport?: StructuredInferenceReport | null;
  readonly analyzedAt?: string | null;
}): AssetClassificationProfile {
  const migrated = migrateLegacyAssetRecord(params.asset);
  const folder =
    (params.folders ?? []).find((f) => !f.deleted && f.id === migrated.folder) ?? null;

  const report =
    params.inferenceReport ?? analyzeSingleAsset(migrated, migrated.engine);

  const categorySuggestion = suggestAssetCategory({
    asset: migrated,
    folderName: folder?.name ?? null,
  });

  const tagSuggestions = suggestAssetTags({
    asset: migrated,
    folderName: folder?.name ?? null,
    existingAssetTags: params.existingAssetTags,
    inferenceReport: report,
  });

  return {
    assetId: migrated.id,
    declared: {
      originLayer: 'declared',
      name: migrated.nome,
      category: migrated.categoria || null,
      categoryDefinedByUser: Boolean(migrated.categoria?.trim()),
      project: migrated.projeto ?? null,
      folderId: migrated.folder ?? null,
      folderName: folder?.name ?? null,
      assignedTags: migrated.tags ?? [],
      assignedTagIds: migrated.assetTagIds ?? [],
      declaredTargetSoftware: migrated.targetSoftware ?? [],
    },
    technicalIdentification: {
      originLayer: 'technical_identification',
      registrationKind: migrated.kind ?? 'asset',
      registrationKindLabel: REGISTRATION_KIND_LABELS[migrated.kind ?? 'asset'],
      detectedFormat:
        migrated.detectedFormat ??
        (migrated.formato ? migrated.formato.replace(/^\./, '').toUpperCase() : null),
      fileExtension: migrated.formato || null,
      technicalType: migrated.technicalType ?? null,
      detectedSourceSoftware: migrated.sourceSoftware ?? 'unknown',
      detectedSourceSoftwareLabel:
        ORIGIN_SOFTWARE_LABELS[migrated.sourceSoftware ?? 'unknown'],
      projectDirectory: migrated.projectDirectory ?? null,
      structureMarkers: migrated.structureMarkers ?? [],
    },
    technicalInference: {
      originLayer: 'technical_inference',
      verificationStatus:
        report.verificationStatus ?? migrated.verificationStatus ?? 'not_verified',
      verificationLabel:
        VERIFICATION_STATUS_LABELS[
          report.verificationStatus ?? migrated.verificationStatus ?? 'not_verified'
        ],
      compatibilityStatus: report.diagnostic.status,
      diagnosticTitle: report.diagnostic.title,
      diagnosticSummary: report.diagnostic.summary,
      appliedRules: report.appliedRules,
      warnings: report.warnings,
      evidence: report.evidence,
      recommendedOperations: report.recommendedOperations,
      analyzedAt: params.analyzedAt ?? migrated.lastAnalyzedAt ?? null,
    },
    suggestions: {
      originLayer: 'intelligent_suggestion',
      categorySuggestion,
      tagSuggestions,
      guardrails: [
        'Sugestões da NautIA não substituem automaticamente a categoria definida pelo usuário.',
        'Etiquetas sugeridas exigem confirmação explícita antes de serem associadas.',
        'Propriedades internas como rig, animações ou malha não são afirmadas sem verificação técnica.',
      ],
    },
  };
}
