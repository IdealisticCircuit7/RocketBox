/**
 * Smart Asset Registration 2.0 — Serviço de Identificação Automática,
 * Validação de Modalidades, Migração de Registros Legados e Orientação Nautia
 * (Etapas 02, 04, 05, 06, 07, 08 e 09).
 */

export type RegistrationKind = 'asset' | 'project' | 'package';

export type OriginSoftware =
  | 'unreal'
  | 'unity'
  | 'blender'
  | 'other'
  | 'unknown';

export type ProjectType = 'blender' | 'unreal' | 'unity' | 'other' | null;

export type VerificationStatus =
  | 'not_verified'
  | 'verified'
  | 'warning'
  | 'unsupported';

export type ViewerPreviewKind = '3d' | 'image' | 'package' | 'project' | 'generic';

export interface AssetRegistration {
  readonly id: string;
  readonly name: string;
  readonly kind: RegistrationKind;

  readonly sourcePath: string;
  readonly sourceSoftware: OriginSoftware;

  readonly detectedFormat: string | null;
  readonly technicalType: string | null;
  readonly projectType?: ProjectType;
  readonly category: string | null;

  readonly targetSoftware: readonly OriginSoftware[];

  readonly folderId: string | null;
  readonly projectId: string | null;

  readonly projectDirectory?: string | null;
  readonly structureMarkers?: readonly string[];
  readonly verificationStatus: VerificationStatus;
  readonly identificationWarnings: readonly string[];
}

export interface PathIdentificationResult {
  readonly normalizedPath: string;
  readonly suggestedName: string;
  readonly suggestedKind: RegistrationKind;
  readonly effectiveKind: RegistrationKind;
  readonly detectedExtension: string | null;
  readonly detectedFormat: string | null;
  readonly legacyFormat: string;
  readonly technicalType: string;
  readonly sourceSoftware: OriginSoftware;
  readonly projectType: ProjectType;
  readonly allowedProjectTypes: readonly OriginSoftware[];
  readonly suggestedCategory: string | null;
  readonly projectDirectory: string | null;
  readonly structureMarkers: readonly string[];
  readonly viewerKind: ViewerPreviewKind;
  readonly formatRecognized: boolean;
  readonly verificationStatus: VerificationStatus;
  readonly isIdentificationUncertain: boolean;
  readonly uncertaintyJustification: string | null;
  readonly warnings: readonly string[];
  readonly blockingError: string | null;
}

export interface IdentifyPathOptions {
  readonly selectedKind?: RegistrationKind;
  readonly selectedSourceSoftware?: OriginSoftware;
  readonly directoryMarkers?: readonly string[];
}

export interface NautiaRegistrationGuidance {
  readonly headline: string;
  readonly explanation: string;
  readonly suggestedKind: RegistrationKind;
  readonly suggestedCategory: string | null;
  readonly compatibilityNotes: readonly string[];
  readonly warnings: readonly string[];
  readonly canProceed: boolean;
  readonly verificationLabel: string;
}

export const ORIGIN_SOFTWARE_LABELS: Readonly<Record<OriginSoftware, string>> = {
  unreal: 'Unreal Engine',
  unity: 'Unity',
  blender: 'Blender',
  other: 'Outro',
  unknown: 'Desconhecido',
};

export const REGISTRATION_KIND_LABELS: Readonly<Record<RegistrationKind, string>> = {
  asset: 'Asset Individual',
  project: 'Projeto de Software / Engine',
  package: 'Pacote de Assets',
};

export const PROJECT_TYPE_LABELS: Readonly<Record<Exclude<ProjectType, null>, string>> = {
  blender: 'Projeto Blender (.blend)',
  unreal: 'Projeto Unreal Engine (.uproject)',
  unity: 'Projeto Unity (Diretório)',
  other: 'Projeto Externo / Outro',
};

export const VERIFICATION_STATUS_LABELS: Readonly<
  Record<VerificationStatus, string>
> = {
  not_verified: 'Não verificado',
  verified: 'Formato reconhecido',
  warning: 'Requer atenção',
  unsupported: 'Incompatível / Não suportado',
};

export const INDIVIDUAL_ASSET_CATEGORIES: readonly {
  readonly value: string;
  readonly label: string;
  readonly badge: string;
}[] = [
  { value: 'Personagem', label: 'Personagem', badge: '3D / Rig' },
  { value: 'Veiculo', label: 'Veículo', badge: 'Hard Surface' },
  { value: 'Cenario', label: 'Cenário', badge: 'Ambiente' },
  { value: 'Objeto', label: 'Objeto', badge: '3D / Prop' },
  { value: 'Textura', label: 'Textura', badge: '2D / Map' },
  { value: 'Material', label: 'Material', badge: 'Shader' },
  { value: 'Animacao', label: 'Animação', badge: 'Motion' },
  { value: 'Audio', label: 'Áudio', badge: 'SFX / BGM' },
  { value: 'Outro', label: 'Outro', badge: 'Geral' },
];

interface FormatRule {
  readonly extension: string;
  readonly formatCode: string;
  readonly defaultKind: RegistrationKind;
  readonly allowedKinds: readonly RegistrationKind[];
  readonly sourceSoftware: OriginSoftware;
  readonly technicalTypeByKind: Readonly<Partial<Record<RegistrationKind, string>>>;
  readonly defaultCategory: string | null;
  readonly viewerKind: ViewerPreviewKind;
  readonly warningOnKind?: Readonly<Partial<Record<RegistrationKind, string>>>;
  readonly disallowKindReason?: Readonly<Partial<Record<RegistrationKind, string>>>;
}

const FORMAT_CATALOG: Readonly<Record<string, FormatRule>> = {
  '.fbx': {
    extension: '.fbx',
    formatCode: 'FBX',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: '3D Mesh / Scene (FBX)' },
    defaultCategory: 'Personagem',
    viewerKind: '3d',
    disallowKindReason: {
      project:
        'Um arquivo .fbx é um asset 3D intercambiável, não um projeto de software.',
      package: 'Um arquivo .fbx representa um asset individual, não um pacote.',
    },
  },
  '.obj': {
    extension: '.obj',
    formatCode: 'OBJ',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: '3D Static Mesh (OBJ)' },
    defaultCategory: 'Cenario',
    viewerKind: '3d',
    disallowKindReason: {
      project: 'Arquivos .obj são malhas 3D individuais, não projetos.',
      package: 'Arquivos .obj são malhas 3D individuais, não pacotes.',
    },
  },
  '.glb': {
    extension: '.glb',
    formatCode: 'GLB',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: 'glTF Binary 3D Asset (GLB)' },
    defaultCategory: 'Cenario',
    viewerKind: '3d',
    disallowKindReason: {
      project: 'Arquivos .glb são assets 3D individuais.',
      package: 'Arquivos .glb são assets 3D individuais.',
    },
  },
  '.gltf': {
    extension: '.gltf',
    formatCode: 'GLTF',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: 'glTF 3D Asset (GLTF)' },
    defaultCategory: 'Cenario',
    viewerKind: '3d',
  },
  '.blend': {
    extension: '.blend',
    formatCode: 'BLEND',
    defaultKind: 'project',
    allowedKinds: ['project', 'asset', 'package'],
    sourceSoftware: 'blender',
    technicalTypeByKind: {
      project: 'Blender Project (.blend)',
      asset: 'Blender 3D Asset (.blend)',
      package: 'Blender Asset Library (.blend)',
    },
    defaultCategory: 'Personagem',
    viewerKind: '3d',
    warningOnKind: {
      asset:
        'Arquivo .blend registrado como Asset Individual. Para uso na Unreal Engine 5, o Motor de Inferência recomenda exportação para .fbx ou .glb.',
      package:
        'Arquivos .blend não são presumidos pacotes automaticamente; certifique-se de que este arquivo contenha marcadores de Asset Library do Blender.',
    },
  },
  '.uasset': {
    extension: '.uasset',
    formatCode: 'UASSET',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unreal',
    technicalTypeByKind: {
      asset: 'Unreal Engine Asset (.uasset)',
    },
    defaultCategory: 'Outro',
    viewerKind: '3d',
    disallowKindReason: {
      project:
        'Um arquivo .uasset é um asset individual da Unreal Engine e não deve ser confundido com um projeto Unreal completo (.uproject).',
      package:
        'Um arquivo .uasset é um asset individual da Unreal Engine, não um pacote distribuível.',
    },
  },
  '.uproject': {
    extension: '.uproject',
    formatCode: 'UPROJECT',
    defaultKind: 'project',
    allowedKinds: ['project'],
    sourceSoftware: 'unreal',
    technicalTypeByKind: {
      project: 'Unreal Project',
    },
    defaultCategory: 'Projeto Unreal',
    viewerKind: 'project',
    disallowKindReason: {
      asset:
        'Um arquivo .uproject representa um Projeto Unreal Engine completo. Utilize a modalidade "Projeto de Software / Engine".',
      package:
        'Um arquivo .uproject é um descritor de projeto da Unreal Engine, não um pacote de assets.',
    },
  },
  '.unitypackage': {
    extension: '.unitypackage',
    formatCode: 'UNITYPACKAGE',
    defaultKind: 'package',
    allowedKinds: ['package'],
    sourceSoftware: 'unity',
    technicalTypeByKind: {
      package: 'Unity Package',
    },
    defaultCategory: 'Outro',
    viewerKind: 'package',
    disallowKindReason: {
      project:
        'Um arquivo .unitypackage é um Pacote de Assets da Unity, não um diretório de projeto Unity completo.',
      asset:
        'Um arquivo .unitypackage é um pacote de coleção da Unity. Utilize a modalidade "Pacote de Assets".',
    },
  },
  '.png': {
    extension: '.png',
    formatCode: 'PNG',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: '2D Texture / Image (PNG)' },
    defaultCategory: 'Textura',
    viewerKind: 'image',
  },
  '.jpg': {
    extension: '.jpg',
    formatCode: 'JPG',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: '2D Texture / Image (JPG)' },
    defaultCategory: 'Textura',
    viewerKind: 'image',
  },
  '.jpeg': {
    extension: '.jpeg',
    formatCode: 'JPEG',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: '2D Texture / Image (JPEG)' },
    defaultCategory: 'Textura',
    viewerKind: 'image',
  },
  '.exr': {
    extension: '.exr',
    formatCode: 'EXR',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: 'HDRI / OpenEXR Texture (EXR)' },
    defaultCategory: 'Textura',
    viewerKind: 'image',
  },
  '.tga': {
    extension: '.tga',
    formatCode: 'TGA',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: '2D Texture (TGA)' },
    defaultCategory: 'Textura',
    viewerKind: 'image',
  },
  '.wav': {
    extension: '.wav',
    formatCode: 'WAV',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: 'Audio Clip (WAV)' },
    defaultCategory: 'Audio',
    viewerKind: 'generic',
  },
  '.ogg': {
    extension: '.ogg',
    formatCode: 'OGG',
    defaultKind: 'asset',
    allowedKinds: ['asset'],
    sourceSoftware: 'unknown',
    technicalTypeByKind: { asset: 'Audio Stream (OGG)' },
    defaultCategory: 'Audio',
    viewerKind: 'generic',
  },
};

const COMPRESSED_EXTENSIONS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz']);

export function normalizeFilesystemPath(rawPath: string): string {
  return rawPath.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function extractPathExtension(rawPath: string): string | null {
  const clean = normalizeFilesystemPath(rawPath).replace(/\/$/, '');
  const lastSegment = clean.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) {
    return null;
  }
  return lastSegment.slice(dotIndex).toLocaleLowerCase('pt-BR');
}

export function extractSuggestedNameFromPath(rawPath: string): string {
  const clean = normalizeFilesystemPath(rawPath).replace(/\/$/, '');
  if (!clean) return '';
  const lastSegment = clean.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex > 0) {
    return lastSegment.slice(0, dotIndex);
  }
  return lastSegment;
}

export function extractParentDirectory(rawPath: string): string | null {
  const clean = normalizeFilesystemPath(rawPath).replace(/\/$/, '');
  const lastSlash = clean.lastIndexOf('/');
  if (lastSlash <= 0) return null;
  return clean.slice(0, lastSlash);
}

export function hasValidUnityDirectoryMarkers(markers?: readonly string[]): boolean {
  if (!markers || markers.length === 0) return false;
  const normalized = new Set(
    markers.map((marker) => marker.trim().toLocaleLowerCase('pt-BR')).filter(Boolean),
  );
  return (
    normalized.has('assets') &&
    (normalized.has('projectsettings') || normalized.has('packages'))
  );
}

export function hasUnrealProjectMarker(markers?: readonly string[]): boolean {
  if (!markers || markers.length === 0) return false;
  return markers.some((marker) =>
    marker.trim().toLocaleLowerCase('pt-BR').endsWith('.uproject'),
  );
}

/**
 * Identifica deterministicamente o arquivo ou diretório informado pelo caminho.
 * Segue estritamente as regras das Etapas 02, 04, 05, 06 e Etapa 11 (validação de projeto).
 */
export function identifyAssetByPath(
  rawPath: string,
  options: IdentifyPathOptions = {},
): PathIdentificationResult {
  const normalizedPath = normalizeFilesystemPath(rawPath);
  const suggestedName = extractSuggestedNameFromPath(normalizedPath);
  const ext = extractPathExtension(normalizedPath);
  const warnings: string[] = [];
  let blockingError: string | null = null;

  if (!normalizedPath) {
    const fallbackKind = options.selectedKind ?? 'asset';
    const selectedSw =
      options.selectedSourceSoftware && options.selectedSourceSoftware !== 'unknown'
        ? (options.selectedSourceSoftware as Exclude<ProjectType, null>)
        : null;
    return {
      normalizedPath: '',
      suggestedName: '',
      suggestedKind: fallbackKind,
      effectiveKind: fallbackKind,
      detectedExtension: null,
      detectedFormat: 'AUTO',
      legacyFormat: fallbackKind === 'project' ? '.uproject' : fallbackKind === 'package' ? '.unitypackage' : '.fbx',
      technicalType: 'Aguardando seleção de caminho',
      sourceSoftware: options.selectedSourceSoftware ?? 'unknown',
      projectType: fallbackKind === 'project' ? selectedSw : null,
      allowedProjectTypes: ['unreal', 'unity', 'blender', 'other'],
      suggestedCategory: fallbackKind === 'asset' ? 'Personagem' : null,
      projectDirectory: null,
      structureMarkers: [],
      viewerKind: fallbackKind === 'project' ? 'project' : fallbackKind === 'package' ? 'package' : '3d',
      formatRecognized: false,
      verificationStatus: 'not_verified',
      isIdentificationUncertain: false,
      uncertaintyJustification: null,
      warnings: [],
      blockingError: null,
    };
  }

  // Caso 1: Caminho sem extensão (Diretório de projeto, ex.: Projeto Unity ou raiz Unreal)
  if (!ext) {
    const suggestedKind: RegistrationKind = 'project';
    const effectiveKind = options.selectedKind ?? suggestedKind;
    const markersProvided = options.directoryMarkers !== undefined;

    if (effectiveKind !== 'project') {
      const dirBlock =
        'Caminhos sem extensão de arquivo representam diretórios e devem ser cadastrados na modalidade "Projeto de Software / Engine".';
      blockingError = dirBlock;
      warnings.push(dirBlock);
    }

    if (markersProvided && hasUnrealProjectMarker(options.directoryMarkers)) {
      const unrealMarkers = options.directoryMarkers ?? [];
      if (
        effectiveKind === 'project' &&
        options.selectedSourceSoftware &&
        options.selectedSourceSoftware !== 'unknown' &&
        options.selectedSourceSoftware !== 'unreal'
      ) {
        blockingError =
          'Incompatível: a estrutura do diretório contém um arquivo .uproject da Unreal Engine e não pode ser classificada como projeto Unity ou Blender.';
        warnings.push(blockingError);
      }

      return {
        normalizedPath,
        suggestedName,
        suggestedKind,
        effectiveKind,
        detectedExtension: null,
        detectedFormat: 'UPROJECT',
        legacyFormat: '.uproject',
        technicalType: 'Unreal Project',
        sourceSoftware: 'unreal',
        projectType: effectiveKind === 'project' ? 'unreal' : null,
        allowedProjectTypes: ['unreal'],
        suggestedCategory: 'Projeto Unreal',
        projectDirectory: normalizedPath,
        structureMarkers: unrealMarkers,
        viewerKind: 'project',
        formatRecognized: true,
        verificationStatus: blockingError ? 'unsupported' : 'verified',
        isIdentificationUncertain: false,
        uncertaintyJustification: null,
        warnings,
        blockingError,
      };
    }

    if (markersProvided) {
      const validUnity = hasValidUnityDirectoryMarkers(options.directoryMarkers);
      const cleanMarkers = [...(options.directoryMarkers ?? [])];

      if (validUnity) {
        if (
          effectiveKind === 'project' &&
          options.selectedSourceSoftware &&
          options.selectedSourceSoftware !== 'unknown' &&
          options.selectedSourceSoftware !== 'unity'
        ) {
          blockingError =
            'Incompatível: o diretório possui estrutura reconhecida da Unity (Assets, Packages, ProjectSettings) e não pode ser classificado como projeto Blender ou Unreal.';
          warnings.push(blockingError);
        } else {
          warnings.push(
            'Diretório de projeto Unity confirmado pelas pastas Assets e ProjectSettings/Packages.',
          );
        }

        return {
          normalizedPath,
          suggestedName,
          suggestedKind,
          effectiveKind,
          detectedExtension: null,
          detectedFormat: 'UNITY_DIR',
          legacyFormat: '.unityproj',
          technicalType: 'Unity Project (Diretório)',
          sourceSoftware: 'unity',
          projectType: effectiveKind === 'project' ? 'unity' : null,
          allowedProjectTypes: ['unity'],
          suggestedCategory: 'Projeto Unity',
          projectDirectory: normalizedPath,
          structureMarkers: cleanMarkers,
          viewerKind: 'project',
          formatRecognized: true,
          verificationStatus: blockingError ? 'unsupported' : 'verified',
          isIdentificationUncertain: false,
          uncertaintyJustification: null,
          warnings,
          blockingError,
        };
      }

      const uncertaintyJustification =
        'O diretório selecionado não contém arquivo .uproject (Unreal) nem as pastas padrão Assets e ProjectSettings (Unity). Confirme se trata-se de outro tipo de projeto ou selecione o diretório correto.';
      warnings.push(uncertaintyJustification);

      const requestedSw = options.selectedSourceSoftware;
      if (effectiveKind === 'project') {
        if (!requestedSw || requestedSw === 'unknown' || requestedSw === 'unity') {
          blockingError =
            'Diretório inválido para Projeto Unity: a estrutura precisa conter as pastas reconhecíveis da Unity (Assets, Packages e ProjectSettings).';
        } else if (requestedSw === 'unreal') {
          blockingError =
            'Diretório inválido para Projeto Unreal: nenhum arquivo .uproject encontrado na estrutura.';
        } else if (requestedSw === 'blender') {
          blockingError =
            'Projeto Blender inválido: selecione um arquivo .blend em vez de um diretório.';
        }
        if (blockingError) {
          warnings.push(blockingError);
        }
      }

      const resolvedSoftware: OriginSoftware =
        requestedSw === 'other' ? 'other' : 'unknown';

      return {
        normalizedPath,
        suggestedName,
        suggestedKind,
        effectiveKind,
        detectedExtension: null,
        detectedFormat: 'DIRECTORY',
        legacyFormat: '.dir',
        technicalType:
          resolvedSoftware === 'other'
            ? 'Projeto Externo (Diretório)'
            : 'Diretório de Projeto (Estrutura incerta)',
        sourceSoftware: resolvedSoftware,
        projectType:
          effectiveKind === 'project' && resolvedSoftware === 'other'
            ? 'other'
            : null,
        allowedProjectTypes: ['other'],
        suggestedCategory:
          resolvedSoftware === 'other' ? 'Projeto Outro' : 'Projeto',
        projectDirectory: normalizedPath,
        structureMarkers: cleanMarkers,
        viewerKind: 'project',
        formatRecognized: false,
        verificationStatus: blockingError ? 'unsupported' : 'warning',
        isIdentificationUncertain: true,
        uncertaintyJustification,
        warnings,
        blockingError,
      };
    }

    // Diretório informado apenas pelo caminho textual (sem marcadores inspecionados em disco)
    const markers = ['Assets', 'Packages', 'ProjectSettings'];
    const requestedSw = options.selectedSourceSoftware;
    const uncertaintyJustification =
      'Diretório ainda não inspecionado no disco: presume-se estrutura Unity (Assets, Packages, ProjectSettings) ou projeto externo.';

    if (effectiveKind === 'project') {
      if (requestedSw === 'blender') {
        blockingError =
          'Projeto Blender inválido: um projeto Blender exige um arquivo .blend, não um diretório.';
        warnings.push(blockingError);
      } else if (requestedSw === 'unreal') {
        blockingError =
          'Projeto Unreal inválido: informe o caminho do arquivo .uproject ou inspecione um diretório contendo .uproject.';
        warnings.push(blockingError);
      }
    }

    const sourceSoftware: OriginSoftware =
      requestedSw && requestedSw !== 'unknown' && (requestedSw === 'unity' || requestedSw === 'other')
        ? requestedSw
        : 'unity';

    if (sourceSoftware === 'unity' && !blockingError) {
      warnings.push(
        'Diretório de projeto Unity: a verificação completa confirma a presença das pastas Assets, Packages e ProjectSettings.',
      );
    }

    return {
      normalizedPath,
      suggestedName,
      suggestedKind,
      effectiveKind,
      detectedExtension: null,
      detectedFormat: sourceSoftware === 'unity' ? 'UNITY_DIR' : 'DIRECTORY',
      legacyFormat: sourceSoftware === 'unity' ? '.unityproj' : '.dir',
      technicalType:
        sourceSoftware === 'unity'
          ? 'Unity Project (Diretório)'
          : 'Diretório de Projeto',
      sourceSoftware,
      projectType:
        effectiveKind === 'project'
          ? (sourceSoftware as Exclude<ProjectType, null>)
          : null,
      allowedProjectTypes: ['unity', 'other'],
      suggestedCategory: sourceSoftware === 'unity' ? 'Projeto Unity' : 'Projeto',
      projectDirectory: normalizedPath,
      structureMarkers: sourceSoftware === 'unity' ? markers : [],
      viewerKind: 'project',
      formatRecognized: true,
      verificationStatus: blockingError ? 'unsupported' : 'not_verified',
      isIdentificationUncertain: true,
      uncertaintyJustification,
      warnings,
      blockingError,
    };
  }

  // Caso 2: Arquivos comprimidos genéricos (.zip, .rar, .7z) -> não presumir pacote válido nem projeto
  if (COMPRESSED_EXTENSIONS.has(ext)) {
    const effectiveKind = options.selectedKind ?? 'package';
    const zipWarning = `Arquivo comprimido (${ext}) detectado: não é possível presumir automaticamente que se trata de um pacote de assets válido sem inspecionar seu conteúdo interno.`;
    warnings.push(zipWarning);
    if (effectiveKind === 'project') {
      blockingError = `Um arquivo comprimido (${ext}) não é uma estrutura válida de projeto Blender (.blend), Unreal (.uproject) ou diretório Unity.`;
      warnings.push(blockingError);
    }
    return {
      normalizedPath,
      suggestedName,
      suggestedKind: 'package',
      effectiveKind,
      detectedExtension: ext,
      detectedFormat: ext.slice(1).toUpperCase(),
      legacyFormat: ext,
      technicalType: `Arquivo Comprimido (${ext.toUpperCase()}) — Não verificado`,
      sourceSoftware: options.selectedSourceSoftware ?? 'unknown',
      projectType: null,
      allowedProjectTypes: [],
      suggestedCategory: 'Outro',
      projectDirectory: extractParentDirectory(normalizedPath),
      structureMarkers: [],
      viewerKind: 'package',
      formatRecognized: false,
      verificationStatus: blockingError ? 'unsupported' : 'warning',
      isIdentificationUncertain: true,
      uncertaintyJustification: zipWarning,
      warnings,
      blockingError,
    };
  }

  // Caso 3: Formato presente no catálogo de regras determinísticas
  const rule = FORMAT_CATALOG[ext];
  if (rule) {
    const suggestedKind = rule.defaultKind;
    const effectiveKind = options.selectedKind ?? suggestedKind;

    const disallowReason = rule.disallowKindReason?.[effectiveKind];
    if (disallowReason) {
      blockingError = disallowReason;
      warnings.push(disallowReason);
    } else if (!rule.allowedKinds.includes(effectiveKind)) {
      blockingError = `O formato ${rule.formatCode} (${ext}) não pode ser registrado na modalidade "${REGISTRATION_KIND_LABELS[effectiveKind]}".`;
      warnings.push(blockingError);
    }

    const kindWarning = rule.warningOnKind?.[effectiveKind];
    if (kindWarning) {
      warnings.push(kindWarning);
    }

    let allowedProjectTypes: readonly OriginSoftware[] = [];
    let projectType: ProjectType = null;
    let suggestedCategory = rule.defaultCategory;

    if (ext === '.blend') {
      allowedProjectTypes = ['blender'];
      if (effectiveKind === 'project') {
        projectType = 'blender';
        suggestedCategory = 'Projeto Blender';
        if (
          options.selectedSourceSoftware &&
          options.selectedSourceSoftware !== 'unknown' &&
          options.selectedSourceSoftware !== 'blender'
        ) {
          blockingError = `Incompatível: um arquivo .blend é um Projeto Blender nativo e não pode ser classificado como projeto ${
            ORIGIN_SOFTWARE_LABELS[options.selectedSourceSoftware]
          }.`;
          warnings.push(blockingError);
        }
      } else if (
        effectiveKind === 'asset' &&
        options.selectedSourceSoftware &&
        (options.selectedSourceSoftware === 'unity' ||
          options.selectedSourceSoftware === 'unreal')
      ) {
        warnings.push(
          `Arquivo .blend tem origem nativa no Blender. Use "Destinos pretendidos" para indicar compatibilidade planejada com ${
            ORIGIN_SOFTWARE_LABELS[options.selectedSourceSoftware]
          }.`,
        );
      }
    } else if (ext === '.uproject') {
      allowedProjectTypes = ['unreal'];
      if (effectiveKind === 'project') {
        projectType = 'unreal';
        if (
          options.selectedSourceSoftware &&
          options.selectedSourceSoftware !== 'unknown' &&
          options.selectedSourceSoftware !== 'unreal'
        ) {
          blockingError = `Incompatível: um arquivo .uproject pertence exclusivamente à Unreal Engine e não pode ser classificado como projeto ${
            ORIGIN_SOFTWARE_LABELS[options.selectedSourceSoftware]
          }.`;
          warnings.push(blockingError);
        }
      }
    }

    const resolvedSourceSoftware =
      rule.sourceSoftware !== 'unknown'
        ? rule.sourceSoftware
        : options.selectedSourceSoftware ?? 'unknown';

    const technicalType =
      rule.technicalTypeByKind[effectiveKind] ??
      rule.technicalTypeByKind[rule.defaultKind] ??
      `${rule.formatCode} Record`;

    const projectDirectory =
      effectiveKind === 'project' ? extractParentDirectory(normalizedPath) : null;

    const structureMarkers =
      ext === '.uproject'
        ? ['Content', 'Config', `${suggestedName}.uproject`]
        : [];

    const verificationStatus: VerificationStatus = blockingError
      ? 'unsupported'
      : kindWarning
        ? 'warning'
        : 'not_verified';

    return {
      normalizedPath,
      suggestedName,
      suggestedKind,
      effectiveKind,
      detectedExtension: ext,
      detectedFormat: rule.formatCode,
      legacyFormat: ext,
      technicalType,
      sourceSoftware: resolvedSourceSoftware,
      projectType,
      allowedProjectTypes,
      suggestedCategory,
      projectDirectory,
      structureMarkers,
      viewerKind:
        effectiveKind === 'project'
          ? 'project'
          : effectiveKind === 'package'
            ? 'package'
            : rule.viewerKind,
      formatRecognized: true,
      verificationStatus,
      isIdentificationUncertain: false,
      uncertaintyJustification: null,
      warnings,
      blockingError,
    };
  }

  // Caso 4: Extensão desconhecida / fora do catálogo
  const effectiveKind = options.selectedKind ?? 'asset';
  const uncertaintyJustification = `A extensão "${ext}" não pertence ao catálogo padrão; valide manualmente se corresponde a um formato proprietário.`;
  warnings.push(
    `Extensão "${ext}" não consta no catálogo técnico padrão. O registro será salvo com estado "Não verificado".`,
  );

  if (effectiveKind === 'project') {
    if (options.selectedSourceSoftware === 'blender') {
      blockingError = `Incompatível: projetos Blender exigem arquivo .blend (recebido "${ext}").`;
      warnings.push(blockingError);
    } else if (options.selectedSourceSoftware === 'unreal') {
      blockingError = `Incompatível: projetos Unreal exigem arquivo .uproject (recebido "${ext}").`;
      warnings.push(blockingError);
    } else if (options.selectedSourceSoftware === 'unity') {
      blockingError = `Incompatível: projetos Unity exigem um diretório de projeto, não o arquivo "${ext}".`;
      warnings.push(blockingError);
    }
  }

  return {
    normalizedPath,
    suggestedName,
    suggestedKind: 'asset',
    effectiveKind,
    detectedExtension: ext,
    detectedFormat: ext.slice(1).toUpperCase(),
    legacyFormat: ext,
    technicalType: `Formato externo (${ext})`,
    sourceSoftware: options.selectedSourceSoftware ?? 'unknown',
    projectType: effectiveKind === 'project' ? 'other' : null,
    allowedProjectTypes: ['other'],
    suggestedCategory: 'Outro',
    projectDirectory: extractParentDirectory(normalizedPath),
    structureMarkers: [],
    viewerKind: 'generic',
    formatRecognized: false,
    verificationStatus: blockingError ? 'unsupported' : 'not_verified',
    isIdentificationUncertain: true,
    uncertaintyJustification,
    warnings,
    blockingError,
  };
}

/**
 * Converte Software de Origem / Destino para o rótulo legado de engine quando aplicável,
 * mantendo retrocompatibilidade com filtros e com o script Python `motor_rocketbox.py`.
 */
export function softwareToLegacyEngineLabel(
  sourceSoftware: OriginSoftware,
  targetSoftware: readonly OriginSoftware[] = [],
): string {
  const primary = targetSoftware[0] ?? sourceSoftware;
  switch (primary) {
    case 'unreal':
      return 'Unreal Engine 5';
    case 'unity':
      return 'Unity';
    case 'blender':
      return 'Blender';
    case 'other':
      return 'OMNIN Engine';
    default:
      return 'Qualquer';
  }
}

export function legacyEngineToOriginSoftware(engine?: string): OriginSoftware {
  const norm = (engine ?? '').trim().toLocaleLowerCase('pt-BR');
  if (norm.includes('unreal') || norm === 'ue5') return 'unreal';
  if (norm.includes('unity')) return 'unity';
  if (norm.includes('blender')) return 'blender';
  if (norm.includes('omnin') || norm.includes('outro')) return 'other';
  return 'unknown';
}

/**
 * Gera orientações determinísticas da Nautia para o formulário Registrar Asset (Etapa 09).
 * Nunca utiliza LLM fictícia nem executa alterações sem ação do usuário.
 */
export function buildNautiaRegistrationGuidance(
  identification: PathIdentificationResult,
  targetSoftware: readonly OriginSoftware[] = [],
): NautiaRegistrationGuidance {
  if (!identification.normalizedPath) {
    return {
      headline: 'Aguardando caminho do arquivo ou diretório',
      explanation:
        'Escolha a modalidade acima e informe o caminho no disco. O RocketBox identificará automaticamente formato, origem e avisos técnicos.',
      suggestedKind: identification.effectiveKind,
      suggestedCategory: identification.suggestedCategory,
      compatibilityNotes: [],
      warnings: [],
      canProceed: false,
      verificationLabel: VERIFICATION_STATUS_LABELS.not_verified,
    };
  }

  const compatibilityNotes: string[] = [...identification.warnings];

  if (
    identification.isIdentificationUncertain &&
    identification.uncertaintyJustification &&
    !compatibilityNotes.includes(identification.uncertaintyJustification)
  ) {
    compatibilityNotes.push(identification.uncertaintyJustification);
  }

  if (
    identification.detectedExtension === '.blend' &&
    targetSoftware.includes('unreal')
  ) {
    compatibilityNotes.push(
      'Destino pretendido Unreal Engine: arquivos .blend exigem exportação intermediária para .fbx ou .glb.',
    );
  }

  if (
    identification.detectedExtension === '.uasset' &&
    targetSoftware.includes('unity')
  ) {
    compatibilityNotes.push(
      'Destino pretendido Unity: arquivos .uasset são proprietários da Unreal Engine e incompatíveis diretamente com Unity.',
    );
  }

  if (targetSoftware.length > 0) {
    compatibilityNotes.push(
      `Destinos pretendidos (${targetSoftware
        .map((s) => ORIGIN_SOFTWARE_LABELS[s])
        .join(', ')}): a indicação de destino registra sua intenção de uso; a validação técnica permanece sob responsabilidade do Motor de Inferência.`,
    );
  }

  const headline = identification.formatRecognized
    ? `${identification.technicalType} identificado (${
        REGISTRATION_KIND_LABELS[identification.suggestedKind]
      })`
    : `Formato ${identification.detectedFormat ?? 'desconhecido'} — Não verificado`;

  const explanation =
    identification.suggestedKind !== identification.effectiveKind
      ? `Caminho sugere "${
          REGISTRATION_KIND_LABELS[identification.suggestedKind]
        }", mas a modalidade atual está configurada como "${
          REGISTRATION_KIND_LABELS[identification.effectiveKind]
        }".`
      : `Origem identificada: ${
          ORIGIN_SOFTWARE_LABELS[identification.sourceSoftware]
        }. Formato técnico: ${identification.detectedFormat ?? 'Diretório'}.`;

  return {
    headline,
    explanation,
    suggestedKind: identification.suggestedKind,
    suggestedCategory: identification.suggestedCategory,
    compatibilityNotes,
    warnings: compatibilityNotes,
    canProceed: !identification.blockingError,
    verificationLabel:
      VERIFICATION_STATUS_LABELS[identification.verificationStatus],
  };
}
