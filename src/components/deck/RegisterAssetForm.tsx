import { invoke, isTauri } from '@tauri-apps/api/core';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildNautiaRegistrationGuidance,
  DeckAsset,
  DeckFolder,
  EtiquetaDeAsset,
  identifyAssetByPath,
  ORIGIN_SOFTWARE_LABELS,
  OriginSoftware,
  PROJECT_TYPE_LABELS,
  RegisterAssetInput,
  REGISTRATION_KIND_LABELS,
  RegistrationKind,
  softwareToLegacyEngineLabel,
  VERIFICATION_STATUS_LABELS,
  ViewerPreviewKind,
} from '../../services/deckFilterService';
import { AccessibleSelect, SelectOptionItem } from './AccessibleSelect';
import { CustomIcon } from '../common/CustomIcon';
import { AssetViewer } from '../common/AssetViewer';
import { AssetIcon } from '../common/AssetIcon';
import { FolderTagIconGlyph } from './FolderTagIconGlyph';
import { TagPicker, TagPickerOption } from './TagPicker';

export interface RegisterAssetFormProps {
  readonly folders: readonly DeckFolder[];
  readonly availableAssetTags?: readonly EtiquetaDeAsset[];
  readonly defaultFolderId?: string | null;
  readonly errorMessage?: string | null;
  readonly onRegisterAsset: (input: RegisterAssetInput) => DeckAsset | null;
  readonly onCancel?: () => void;
}

interface ResourceInspection {
  path: string;
  isDirectory: boolean;
  size: number | null;
  signature: string | null;
  structureMarkers: string[];
  warnings: string[];
}

export const REGISTER_CATEGORY_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'Personagem', label: 'Personagem', badge: '3D / Rig' },
  { value: 'Veiculo', label: 'Veículo', badge: 'Hard Surface' },
  { value: 'Cenario', label: 'Cenário', badge: 'Ambiente' },
  { value: 'Objeto', label: 'Objeto', badge: '3D / Prop' },
  { value: 'Textura', label: 'Textura', badge: '2D / Map' },
  { value: 'Animacao', label: 'Animação', badge: 'Motion' },
  { value: 'Audio', label: 'Áudio', badge: 'SFX / BGM' },
  { value: 'Material', label: 'Material', badge: 'Shader' },
  { value: 'Outro', label: 'Outro', badge: 'Geral' },
];

export const REGISTER_PACKAGE_CATEGORY_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'Pacote Multi-Asset', label: 'Pacote Multi-Asset (Geral)', badge: 'Bundle' },
  { value: 'Cenario', label: 'Cenário / Environment Pack', badge: 'Ambiente' },
  { value: 'Personagem', label: 'Personagem / Character Pack', badge: '3D / Rig' },
  { value: 'Material', label: 'Material / Shader Library', badge: 'Shader' },
  { value: 'Textura', label: 'Textura / Megascans Pack', badge: '2D / Map' },
  { value: 'Audio', label: 'Áudio / Sound Pack', badge: 'SFX' },
  { value: 'Outro', label: 'Outro', badge: 'Geral' },
];

export const ASSET_SOURCE_SOFTWARE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'unknown', label: 'Automático / Não especificado', badge: 'Auto' },
  { value: 'blender', label: 'Blender', badge: 'DCC' },
  { value: 'unreal', label: 'Unreal Engine', badge: 'UE5' },
  { value: 'unity', label: 'Unity', badge: 'Unity' },
  { value: 'other', label: 'Outro software DCC / CAD', badge: 'Externo' },
];

export const PROJECT_SOURCE_SOFTWARE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'unreal', label: 'Unreal Engine', badge: '.uproject' },
  { value: 'unity', label: 'Unity', badge: 'Diretório Unity' },
  { value: 'blender', label: 'Blender', badge: '.blend' },
  { value: 'other', label: 'Outro', badge: 'Projeto' },
];

export const PACKAGE_SOURCE_SOFTWARE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'unity', label: 'Unity', badge: '.unitypackage' },
  { value: 'unreal', label: 'Unreal Engine', badge: 'Pack UE' },
  { value: 'blender', label: 'Blender', badge: 'Asset Library' },
  { value: 'other', label: 'Outro', badge: 'Pacote' },
  { value: 'unknown', label: 'Não especificado', badge: 'Auto' },
];

export const TARGET_SOFTWARE_CHOICES: readonly {
  readonly value: OriginSoftware;
  readonly label: string;
  readonly badge: string;
}[] = [
  { value: 'unreal', label: 'Unreal Engine', badge: 'UE5' },
  { value: 'unity', label: 'Unity', badge: 'Unity' },
  { value: 'blender', label: 'Blender', badge: 'DCC' },
  { value: 'other', label: 'Outro', badge: 'Custom' },
];

interface ModalityCardDefinition {
  readonly kind: RegistrationKind;
  readonly title: string;
  readonly subtitle: string;
  readonly examples: string;
  readonly icon: 'cube' | 'folder' | 'layers';
}

export const REGISTRATION_MODALITIES: readonly ModalityCardDefinition[] = [
  {
    kind: 'asset',
    title: 'Asset Individual',
    subtitle: 'Modelos, texturas, materiais, animações e arquivos isolados.',
    examples: '.fbx · .obj · .glb · .gltf · .blend · .uasset · .png · .exr',
    icon: 'cube',
  },
  {
    kind: 'project',
    title: 'Projeto de Software / Engine',
    subtitle: 'Projetos completos de criação ou engine (Unreal, Unity, Blender).',
    examples: 'Unreal (.uproject) · Unity (Diretório) · Blender (.blend)',
    icon: 'folder',
  },
  {
    kind: 'package',
    title: 'Pacote de Assets',
    subtitle: 'Pacotes empacotados contendo múltiplos assets (.unitypackage, etc).',
    examples: 'Unity Package (.unitypackage)',
    icon: 'layers',
  },
];

const VIEWER_PREVIEW_META: Record<
  ViewerPreviewKind,
  {
    readonly badge: string;
    readonly title: string;
    readonly description: string;
    readonly eyebrow: string;
    readonly footerLeft: string;
    readonly footerRight: string;
  }
> = {
  '3d': {
    badge: 'ARQUIVO 3D',
    title: 'Inspeção de Geometria 3D',
    description: 'Malha 3D ou ativo de cena identificado automaticamente pelo caminho.',
    eyebrow: 'MODALIDADE · ARQUIVO 3D INDIVIDUAL',
    footerLeft: 'MALHA / RIG / ESCALA',
    footerRight: 'DIAGNÓSTICO POR MOTOR DE INFERÊNCIA',
  },
  image: {
    badge: 'IMAGEM / TEXTURA',
    title: 'Inspeção de Mapa 2D / HDRI',
    description: 'Textura 2D ou mapa PBR identificado automaticamente pela extensão.',
    eyebrow: 'MODALIDADE · IMAGEM / TEXTURA 2D',
    footerLeft: 'CANAL DE COR / RESOLUÇÃO',
    footerRight: 'DIAGNÓSTICO POR MOTOR DE INFERÊNCIA',
  },
  package: {
    badge: 'PACOTE DE ASSETS',
    title: 'Container de Pacote de Assets',
    description: 'Pacote distribuível contendo múltiplos recursos empacotados.',
    eyebrow: 'MODALIDADE · PACOTE DE ASSETS',
    footerLeft: 'INTEGRIDADE DO PACOTE',
    footerRight: 'SEM EXTRAÇÃO AUTOMÁTICA',
  },
  project: {
    badge: 'PROJETO DE ENGINE / DCC',
    title: 'Estrutura de Projeto Identificada',
    description: 'Projeto vinculado ao seu arquivo descritor ou diretório raiz no disco.',
    eyebrow: 'MODALIDADE · PROJETO DE SOFTWARE / ENGINE',
    footerLeft: 'DIRETÓRIO & ESTRUTURA',
    footerRight: 'VÍNCULO DE PROJETO ATIVO',
  },
  generic: {
    badge: 'EM PREPARAÇÃO',
    title: 'O próximo mundo começa aqui.',
    description: 'Selecione ou arraste um arquivo ou informe o caminho para identificação automática.',
    eyebrow: '3D / 2D / PROJETO / PACOTE · IDENTIFICAÇÃO AUTOMÁTICA',
    footerLeft: 'MODALIDADE INTELIGENTE',
    footerRight: 'AGUARDANDO CAMINHO',
  },
};

function formatFileSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Smart Asset Registration 2.0 — Layout Integrado Duas Colunas (Sprint_registrar_asset.png).
 * - Coluna Esquerda (#register-preview-slot + #asset-canvas): Seleção/arraste de arquivo,
 *   prévia de imagem ou indicação de formato sem renderizador e quadro "Identificação automática".
 * - Coluna Direita: 4 etapas numeradas (Modalidade, Identificação, Classificação, Organização).
 */
export const RegisterAssetForm: React.FC<RegisterAssetFormProps> = ({
  folders,
  availableAssetTags = [],
  defaultFolderId = null,
  errorMessage,
  onRegisterAsset,
  onCancel,
}) => {
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ResourceInspection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const browserFileInputRef = useRef<HTMLInputElement | null>(null);


  const previewHost =
    typeof document !== 'undefined'
      ? document.getElementById('register-preview-slot')
      : null;

  const [kind, setKind] = useState<RegistrationKind>('asset');
  const [userLockedKind, setUserLockedKind] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  const [nome, setNome] = useState('');
  const [caminho, setCaminho] = useState('');
  const [categoria, setCategoria] = useState('Outro');
  const [packageCategoria, setPackageCategoria] = useState(
    REGISTER_PACKAGE_CATEGORY_OPTIONS[0].value,
  );
  const [sourceSoftware, setSourceSoftware] = useState<OriginSoftware>('unknown');
  const [userSelectedSoftware, setUserSelectedSoftware] = useState(false);
  const [targetSoftware, setTargetSoftware] = useState<readonly OriginSoftware[]>([]);
  const [projeto, setProjeto] = useState('');
  const [folder, setFolder] = useState<string>(defaultFolderId ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const tagPickerOptions = useMemo<readonly TagPickerOption[]>(
    () =>
      availableAssetTags.map((tag) => ({
        id: tag.id,
        label: tag.label,
        icon: 'tag',
        color: tag.color ?? 'cyan',
      })),
    [availableAssetTags],
  );

  const activeFolders = useMemo(
    () => folders.filter((item) => !item.deleted),
    [folders],
  );

  const folderOptions = useMemo<readonly SelectOptionItem[]>(
    () => [
      { value: '', label: 'Convés / Raiz (Sem pasta)', badge: 'Raiz' },
      ...activeFolders.map((item) => ({
        value: item.id,
        label: item.name,
        badge: 'Pasta',
      })),
    ],
    [activeFolders],
  );

  const identification = useMemo(
    () =>
      identifyAssetByPath(caminho || previewFile?.name || '', {
        selectedKind: kind,
        selectedSourceSoftware: userSelectedSoftware ? sourceSoftware : undefined,
        directoryMarkers: inspection?.isDirectory
          ? inspection.structureMarkers
          : undefined,
      }),
    [caminho, previewFile, kind, sourceSoftware, userSelectedSoftware, inspection],
  );

  const nautiaGuidance = useMemo(
    () => buildNautiaRegistrationGuidance(identification, targetSoftware),
    [identification, targetSoftware],
  );

  const projectSoftwareOptions = useMemo<readonly SelectOptionItem[]>(() => {
    const hasPath = Boolean(caminho.trim() || previewFile);
    if (!hasPath || identification.allowedProjectTypes.length === 0) {
      return PROJECT_SOURCE_SOFTWARE_OPTIONS;
    }
    const allowed = new Set(identification.allowedProjectTypes);
    return PROJECT_SOURCE_SOFTWARE_OPTIONS.map((option) => {
      const isAllowed = allowed.has(option.value as OriginSoftware);
      return isAllowed
        ? option
        : {
            ...option,
            disabled: true,
            badge: 'Incompatível',
          };
    });
  }, [caminho, previewFile, identification.allowedProjectTypes]);

  const assetSourceOptions = useMemo<readonly SelectOptionItem[]>(() => {
    const lockedOrigin =
      Boolean(caminho.trim() || previewFile) &&
      identification.formatRecognized &&
      identification.sourceSoftware !== 'unknown'
        ? identification.sourceSoftware
        : null;
    if (!lockedOrigin) {
      return ASSET_SOURCE_SOFTWARE_OPTIONS;
    }
    return ASSET_SOURCE_SOFTWARE_OPTIONS.map((option) =>
      option.value === lockedOrigin || option.value === 'unknown'
        ? option
        : {
            ...option,
            disabled: true,
            badge: 'Incompatível',
          },
    );
  }, [
    caminho,
    previewFile,
    identification.formatRecognized,
    identification.sourceSoftware,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const viewerSection = document.querySelector('#view-register .viewport-panel');
    if (!viewerSection) {
      return;
    }

    const previewKind: ViewerPreviewKind =
      caminho.trim() || previewFile
        ? identification.viewerKind
        : kind === 'project'
          ? 'project'
          : kind === 'package'
            ? 'package'
            : 'generic';

    const meta = VIEWER_PREVIEW_META[previewKind];
    viewerSection.setAttribute('data-viewer-kind', previewKind);

    const badgeEl = viewerSection.querySelector('.panel-header .badge');
    const titleEl = viewerSection.querySelector('.viewer-placeholder h3');
    const descEl = viewerSection.querySelector('.viewer-placeholder p');
    const eyebrowEl = viewerSection.querySelector('.viewer-placeholder .eyebrow');
    const footerSpans = viewerSection.querySelectorAll('.viewer-footer span');

    if (badgeEl) badgeEl.textContent = meta.badge;
    if (titleEl) titleEl.textContent = meta.title;
    if (descEl) descEl.textContent = meta.description;
    if (eyebrowEl) eyebrowEl.textContent = meta.eyebrow;
    if (footerSpans.length >= 2) {
      footerSpans[0].textContent = meta.footerLeft;
      footerSpans[1].textContent = meta.footerRight;
    }
  }, [caminho, previewFile, identification.viewerKind, kind]);

  const handlePathChange = (nextPath: string) => {
    setCaminho(nextPath);
    setLocalError(null);

    if (!nextPath.trim()) {
      return;
    }

    const autoProbe = identifyAssetByPath(nextPath);

    if (!userLockedKind) {
      setKind(autoProbe.suggestedKind);
    }

    if (autoProbe.sourceSoftware !== 'unknown') {
      setSourceSoftware(autoProbe.sourceSoftware);
      setUserSelectedSoftware(false);
    }

    setInspection(null);
    if (autoProbe.suggestedCategory && autoProbe.suggestedKind === 'asset' && autoProbe.suggestedCategory !== 'Personagem') {
      setCategoria(autoProbe.suggestedCategory);
    }
  };

  const chooseFile = (file: File | null, path = '') => {
    const probe = identifyAssetByPath(path || file?.name || '');
    setPreviewFile(file);
    setInspection(null);
    setNome(probe.suggestedName);
    setKind(probe.suggestedKind);
    setUserLockedKind(false);
    setSourceSoftware(probe.sourceSoftware);
    setUserSelectedSoftware(false);
    setCategoria(probe.suggestedCategory && probe.suggestedCategory !== 'Personagem' ? probe.suggestedCategory : 'Outro');
    setCaminho(path);
    setLocalError(null);
  };

  const pickNativeFile = async (directory = false) => {
    try {
      const path = await invoke<string | null>('escolher_recurso', { directory });
      if (!path) return;
      const result = await invoke<ResourceInspection>('inspecionar_recurso', { path });
      const probe = identifyAssetByPath(result.path, {
        directoryMarkers: result.isDirectory ? result.structureMarkers : undefined,
      });
      chooseFile(null, result.path);
      setInspection(result);
      if (result.isDirectory) {
        setKind('project');
        setSourceSoftware(
          probe.sourceSoftware !== 'unknown' ? probe.sourceSoftware : 'other',
        );
      }
    } catch (error) {
      setLocalError(`Não foi possível selecionar o recurso: ${String(error)}`);
    }
  };

  const handleTriggerFilePicker = () => {
    if (isTauri()) {
      void pickNativeFile();
    } else {
      browserFileInputRef.current?.click();
    }
  };

  const handleTriggerDirectoryPicker = () => {
    if (isTauri()) void pickNativeFile(true);
    else setLocalError('A seleção de diretórios exige a versão desktop do RocketBox.');
  };

  const handleDropFile = async (file: File | null) => {
    if (!file) return;
    const desktopPath = (file as File & { path?: string }).path;
    if (isTauri() && desktopPath) {
      try {
        const result = await invoke<ResourceInspection>('inspecionar_recurso', { path: desktopPath });
        const probe = identifyAssetByPath(result.path, {
          directoryMarkers: result.isDirectory ? result.structureMarkers : undefined,
        });
        chooseFile(result.isDirectory ? null : file, result.path);
        setInspection(result);
        if (result.isDirectory) {
          setKind('project');
          setSourceSoftware(
            probe.sourceSoftware !== 'unknown' ? probe.sourceSoftware : 'other',
          );
        }
      } catch (error) { setLocalError(`Não foi possível acessar o item solto: ${String(error)}`); }
      return;
    }
    chooseFile(file);
    setLocalError('O arraste não forneceu um caminho verificável. Selecione o recurso pelo botão no aplicativo desktop.');
  };

  const handleSelectModality = (nextKind: RegistrationKind) => {
    setKind(nextKind);
    setUserLockedKind(true);
    setLocalError(null);

    if (nextKind === 'project') {
      if (sourceSoftware === 'unknown') {
        const probed = identifyAssetByPath(caminho);
        setSourceSoftware(
          probed.sourceSoftware !== 'unknown' ? probed.sourceSoftware : 'unreal',
        );
      }
    } else if (nextKind === 'package') {
      if (sourceSoftware === 'unknown') {
        const probed = identifyAssetByPath(caminho);
        setSourceSoftware(
          probed.sourceSoftware !== 'unknown' ? probed.sourceSoftware : 'unity',
        );
      }
    }
  };

  const handleApplySuggestedModality = () => {
    setKind(identification.suggestedKind);
    setUserLockedKind(false);
    if (identification.sourceSoftware !== 'unknown') {
      setSourceSoftware(identification.sourceSoftware);
      setUserSelectedSoftware(false);
    }
    setLocalError(null);
  };

  const handleApplySuggestedSoftware = () => {
    const suggestedType =
      identification.projectType ?? identification.allowedProjectTypes[0];
    if (suggestedType) {
      setSourceSoftware(suggestedType);
      setUserSelectedSoftware(false);
    } else if (identification.sourceSoftware !== 'unknown') {
      setSourceSoftware(identification.sourceSoftware);
      setUserSelectedSoftware(false);
    }
    setLocalError(null);
  };

  const handleToggleTargetSoftware = (software: OriginSoftware) => {
    setTargetSoftware((current) =>
      current.includes(software)
        ? current.filter((item) => item !== software)
        : [...current, software],
    );
  };

  const resetDraft = () => {
    setNome('');
    setPreviewFile(null);
    setInspection(null);
    setCaminho('');
    setProjeto('');
    setTargetSoftware([]);
    setSelectedTags([]);
    setUserLockedKind(false);
    setUserSelectedSoftware(false);
    setLocalError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      let verified = inspection;
      if (isTauri()) {
        verified = await invoke<ResourceInspection>('inspecionar_recurso', { path: caminho.trim() });
        setInspection(verified);
        if (verified.isDirectory && kind !== 'project') throw new Error('Diretórios devem ser cadastrados como Projeto.');
        if (!verified.isDirectory && kind === 'project' && sourceSoftware === 'unity') throw new Error('Selecione um diretório Unity.');
        const ext = verified.path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase();
        const signatureMap: Record<string, string[]> = { fbx: ['FBX_BIN', 'FBX_ASCII'], glb: ['GLB'], blend: ['BLEND'], uasset: ['UASSET'], unitypackage: ['GZIP'], png: ['PNG'], jpg: ['JPEG'], jpeg: ['JPEG'], exr: ['EXR'] };
        if (ext && signatureMap[ext] && verified.signature && !signatureMap[ext].includes(verified.signature)) throw new Error('A assinatura do arquivo não corresponde à extensão.');
      } else if (!caminho.trim()) {
        throw new Error('O navegador não fornece o caminho completo. Use o aplicativo desktop para selecionar e validar o recurso.');
      }

    const cleanName = nome.trim() || identification.suggestedName.trim();
    if (!cleanName || !caminho.trim()) {
      setLocalError('Informe o nome e o caminho no disco para concluir o registro.');
      return;
    }

    const submitIdentification = identifyAssetByPath(verified?.path ?? caminho.trim(), {
      selectedKind: kind,
      selectedSourceSoftware: userSelectedSoftware ? sourceSoftware : undefined,
      directoryMarkers: verified?.isDirectory ? verified.structureMarkers : undefined,
    });

    if (submitIdentification.blockingError) {
      setLocalError(submitIdentification.blockingError);
      return;
    }

    setLocalError(null);

    const effectiveSoftware =
      submitIdentification.sourceSoftware !== 'unknown'
        ? submitIdentification.sourceSoftware
        : userSelectedSoftware && sourceSoftware !== 'unknown'
          ? sourceSoftware
          : sourceSoftware;

    const registeredPath = verified?.path ?? caminho.trim();
    const sanitizedInput: RegisterAssetInput =
      kind === 'asset'
        ? {
            nome: cleanName,
            caminho: registeredPath,
            kind: 'asset',
            categoria,
            formato: submitIdentification.legacyFormat,
            engine: softwareToLegacyEngineLabel(effectiveSoftware, targetSoftware),
            sourceSoftware: effectiveSoftware,
            targetSoftware: [...targetSoftware],
            detectedFormat: submitIdentification.detectedFormat,
            technicalType: submitIdentification.technicalType,
            verificationStatus: verified && verified.signature ? 'verified' : submitIdentification.verificationStatus,
            identificationWarnings: [...submitIdentification.warnings, ...(verified?.warnings ?? [])],
            projeto: projeto.trim() || undefined,
            folder: folder || null,
            tags: selectedTags.length > 0 ? [...selectedTags] : undefined,
            fileSize: formatFileSize(verified?.size ?? previewFile?.size) ?? undefined,
          }
        : kind === 'project'
          ? {
              nome: cleanName,
              caminho: registeredPath,
              kind: 'project',
              categoria: submitIdentification.suggestedCategory ?? 'Projeto',
              formato: verified?.isDirectory ? '.unityproj' : submitIdentification.legacyFormat,
              engine: softwareToLegacyEngineLabel(effectiveSoftware, []),
              sourceSoftware:
                effectiveSoftware === 'unknown' ? 'unreal' : effectiveSoftware,
              projectType: submitIdentification.projectType,
              targetSoftware: [],
              detectedFormat: submitIdentification.detectedFormat,
              technicalType: submitIdentification.technicalType,
              projectDirectory: verified?.isDirectory ? registeredPath : submitIdentification.projectDirectory,
              structureMarkers: verified?.structureMarkers ?? submitIdentification.structureMarkers,
              directoryMarkers: verified?.isDirectory ? verified.structureMarkers : undefined,
              verificationStatus: verified?.structureMarkers.length ? 'verified' : submitIdentification.verificationStatus,
              identificationWarnings: [...submitIdentification.warnings, ...(verified?.warnings ?? [])],
              projeto: projeto.trim() || undefined,
              folder: folder || null,
              tags: selectedTags.length > 0 ? [...selectedTags] : undefined,
              fileSize: formatFileSize(verified?.size ?? previewFile?.size) ?? undefined,
            }
          : {
              nome: cleanName,
              caminho: registeredPath,
              kind: 'package',
              categoria: packageCategoria || 'Pacote',
              formato: submitIdentification.legacyFormat,
              engine: softwareToLegacyEngineLabel(effectiveSoftware, []),
              sourceSoftware:
                effectiveSoftware === 'unknown' ? 'unity' : effectiveSoftware,
              targetSoftware: [],
              detectedFormat: submitIdentification.detectedFormat,
              technicalType: submitIdentification.technicalType,
              verificationStatus: verified?.signature ? 'verified' : submitIdentification.verificationStatus,
              identificationWarnings: [...submitIdentification.warnings, ...(verified?.warnings ?? [])],
              projeto: projeto.trim() || undefined,
              folder: folder || null,
              tags: selectedTags.length > 0 ? [...selectedTags] : undefined,
              fileSize: formatFileSize(verified?.size ?? previewFile?.size) ?? undefined,
            };

    const created = onRegisterAsset(sanitizedInput);

    if (created) {
      resetDraft();
    }
    } catch (error) {
      setLocalError(String(error instanceof Error ? error.message : error));
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = localError || identification.blockingError || errorMessage;
  const effectiveSoftwareForDisplay: OriginSoftware =
    userSelectedSoftware && sourceSoftware !== 'unknown'
      ? sourceSoftware
      : identification.sourceSoftware !== 'unknown'
        ? identification.sourceSoftware
        : sourceSoftware;

  const pathPlaceholder =
    kind === 'project'
      ? sourceSoftware === 'unity'
        ? 'Ex.: C:/Projetos/Unity/SpaceOdyssey'
        : sourceSoftware === 'blender'
          ? 'Ex.: D:/Producao/Cena_Principal.blend'
          : 'Ex.: D:/UnrealProjects/DeadlyGame/DeadlyGame.uproject'
      : kind === 'package'
        ? 'Ex.: D:/Bundles/SciFi_Environment.unitypackage'
        : 'Ex.: C:/OCSIS_Vault/Assets/Lucy_Tactical_Rig.fbx';

  const nameLabel =
    kind === 'project'
      ? 'Nome do Projeto'
      : kind === 'package'
        ? 'Nome do Pacote'
        : 'Nome do Asset';

  const pathLabel =
    kind === 'project'
      ? 'Caminho do arquivo (.uproject / .blend) ou diretório (Unity)'
      : kind === 'package'
        ? 'Caminho do pacote no disco'
        : 'Caminho no disco';

  const displayFileName =
    previewFile?.name ||
    (caminho.trim() ? caminho.trim().split(/[\\/]/).pop() : null) ||
    null;

  const displayFileSize = formatFileSize(previewFile?.size);
  const iconRecord = displayFileName ? {
    kind, caminho: caminho || previewFile?.name || '',
    formato: identification.legacyFormat, detectedFormat: identification.detectedFormat,
    sourceSoftware: effectiveSoftwareForDisplay, projectType: identification.projectType,
    structureMarkers: identification.structureMarkers, categoria, technicalType: identification.technicalType,
  } : {};

  return (
    <form
      className="nautia-register-form"
      onSubmit={handleSubmit}
      aria-label="Registrar novo asset"
    >
      {/* Portal para a coluna esquerda (#register-preview-slot dentro de .viewport-panel) */}
      {typeof document !== 'undefined' && document.getElementById('asset-canvas') && createPortal(<AssetViewer path={inspection?.path ?? caminho} file={previewFile} iconRecord={iconRecord} />, document.getElementById('asset-canvas')!)}
      {previewHost &&
        createPortal(
          <div
            className="studio-preview"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleDropFile(event.dataTransfer.files[0] ?? null);
            }}
          >
            <input
              ref={browserFileInputRef}
              type="file"
              hidden
              onChange={(event) => {
                chooseFile(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />


            {/* Barra de arquivo selecionado / Seletor de arquivo */}
            <div className="studio-preview__file-card">
              <span className="studio-preview__file-icon">
                <AssetIcon asset={iconRecord} />
              </span>

              <div className="studio-preview__file-info">
                <strong>
                  {displayFileName || 'Arraste ou selecione um arquivo'}
                </strong>
                <div className="studio-preview__file-meta">
                  <span className="studio-preview__type-pill">
                    {identification.detectedFormat &&
                    identification.detectedFormat !== 'AUTO'
                      ? `${identification.detectedFormat} · ${
                          previewFile?.type.startsWith('image/')
                            ? 'Prévia 2D ativa'
                            : displayFileName
                              ? 'Consulte o visualizador'
                              : 'Aguardando'
                        }`
                      : REGISTRATION_KIND_LABELS[kind]}
                  </span>
                  {displayFileSize && <small>{displayFileSize}</small>}
                  {previewFile && !caminho.trim() && (
                    <small className="studio-preview__path-hint">
                      O navegador não informa o caminho completo. Use o aplicativo desktop para registrar este recurso.
                    </small>
                  )}
                </div>
              </div>

              <div className="studio-preview__file-actions">
                <button
                  type="button"
                  className="nautia-btn-chip"
                  onClick={handleTriggerFilePicker}
                >
                  Selecionar arquivo
                </button>
                <button type="button" className="nautia-btn-chip" onClick={handleTriggerDirectoryPicker}>Selecionar diretório</button>
                {(previewFile || caminho.trim()) && (
                  <button
                    type="button"
                    className="nautia-btn-chip"
                    title="Limpar arquivo selecionado"
                    aria-label="Limpar arquivo"
                    onClick={() => chooseFile(null, '')}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Quadro "Identificação automática" idêntico à referência Sprint_registrar_asset.png */}
            <div
              className="studio-preview__auto-card"
              aria-label="Identificação automática"
            >
              <div className="studio-preview__auto-header">
                <FolderTagIconGlyph icon="compass" className="nautia-mini-svg" />
                <strong>Identificação automática</strong>
                <span
                  className={`studio-preview__auto-check is-${identification.verificationStatus}`}
                  aria-hidden="true"
                >
                  ✓
                </span>
              </div>

              <dl className="studio-preview__auto-grid">
                <div>
                  <dt>Modalidade</dt>
                  <dd>{REGISTRATION_KIND_LABELS[kind]}</dd>
                </div>
                <div>
                  <dt>Formato</dt>
                  <dd>
                    {identification.detectedFormat &&
                    identification.detectedFormat !== 'AUTO'
                      ? identification.detectedFormat
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Origem</dt>
                  <dd>
                    {ORIGIN_SOFTWARE_LABELS[effectiveSoftwareForDisplay]}
                  </dd>
                </div>
                {kind === 'project' && (
                  <div>
                    <dt>Tipo de projeto</dt>
                    <dd>
                      {identification.projectType
                        ? PROJECT_TYPE_LABELS[identification.projectType]
                        : 'Não confirmado'}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Categoria</dt>
                  <dd>
                    {kind === 'project'
                      ? (identification.suggestedCategory ?? 'Projeto')
                      : categoria}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd
                    className={`nautia-detected-item__status is-${identification.verificationStatus}`}
                  >
                    <span className="studio-preview__status-dot" aria-hidden="true">•</span>{' '}
                    {VERIFICATION_STATUS_LABELS[identification.verificationStatus]}
                  </dd>
                </div>
              </dl>
            </div>
          </div>,
          previewHost,
        )}

      {/* Barra de 4 etapas numeradas conectadas no topo do formulário */}
      <div className="studio-steps" aria-label="Etapas do cadastro">
        {(['Modalidade', 'Identificação', 'Classificação', 'Organização'] as const).map(
          (name, idx) => {
            const stepNum = (idx + 1) as 1 | 2 | 3 | 4;
            const isActive = activeStep === stepNum;
            const isCompleted =
              (stepNum === 1 && userLockedKind) ||
              (stepNum === 2 && Boolean(caminho.trim())) ||
              stepNum < activeStep;
            return (
              <React.Fragment key={name}>
                <button
                  type="button"
                  className={`studio-step ${isActive ? 'is-active' : ''} ${
                    isCompleted ? 'is-completed' : ''
                  }`}
                  onClick={() => setActiveStep(stepNum)}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span className="studio-step__num">{stepNum}</span>
                  <span className="studio-step__label">{name}</span>
                </button>
                {idx < 3 && <span className="studio-step__connector" aria-hidden="true" />}
              </React.Fragment>
            );
          },
        )}
      </div>

      <div className="nautia-register-form__body">
        {/* ETAPA 1: Seletor de Modalidade */}
      <fieldset
        className="nautia-form-group"
        onFocusCapture={() => setActiveStep(1)}
      >
        <legend className="nautia-form-group__legend">
          <FolderTagIconGlyph icon="sparkles" className="nautia-mini-svg" />
          <span>1. O que deseja registrar?</span>
        </legend>

        <div
          className="nautia-modality-grid"
          role="radiogroup"
          aria-label="O que deseja registrar?"
        >
          {REGISTRATION_MODALITIES.map((item) => {
            const isSelected = kind === item.kind;
            const isSuggested =
              Boolean(caminho.trim() || previewFile) &&
              identification.suggestedKind === item.kind;

            return (
              <button
                key={item.kind}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`nautia-modality-card ${isSelected ? 'is-selected' : ''} ${
                  isSuggested && !isSelected ? 'is-suggested' : ''
                }`}
                onClick={() => handleSelectModality(item.kind)}
              >
                <div className="nautia-modality-card__top">
                  <span className="nautia-modality-card__icon">
                    <FolderTagIconGlyph
                      icon={item.icon}
                      className="nautia-icon-svg"
                    />
                  </span>
                  <div className="nautia-modality-card__badges">
                    {isSuggested && !isSelected && (
                      <span className="nautia-modality-card__pill is-auto">
                        Detectado
                      </span>
                    )}
                    {isSelected && (
                      <span
                        className="nautia-modality-card__check"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    )}
                  </div>
                </div>
                <strong className="nautia-modality-card__title">
                  {item.title}
                </strong>
                <span className="nautia-modality-card__subtitle">
                  {item.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ETAPA 2: Identificação do arquivo */}
      <fieldset
        className="nautia-form-group"
        onFocusCapture={() => setActiveStep(2)}
      >
        <legend className="nautia-form-group__legend">
          <FolderTagIconGlyph icon="rocket" className="nautia-mini-svg" />
          <span>2. Identificação do arquivo</span>
        </legend>

        <div className="nautia-register-form__grid">
          <label className="nautia-field">
            <span className="nautia-field__label">{nameLabel}</span>
            <div className="nautia-input-with-action">
              <input
                type="text"
                maxLength={120}
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder={
                  identification.suggestedName
                    ? identification.suggestedName
                    : 'Ex.: Lucy_Tactical_Rig'
                }
                required={!identification.suggestedName}
              />
              {identification.suggestedName &&
                nome !== identification.suggestedName && (
                  <button
                    type="button"
                    className="nautia-btn-inline"
                    onClick={() => setNome(identification.suggestedName)}
                    title="Preencher com o nome extraído do caminho"
                  >
                    Auto
                  </button>
                )}
            </div>
          </label>

          <label className="nautia-field">
            <span className="nautia-field__label">{pathLabel}</span>
            <div className="nautia-input-with-action">
              <input
                type="text"
                value={caminho}
                onChange={(event) => {
                  const path = event.target.value;
                  if (
                    previewFile &&
                    path.split(/[\\/]/).pop()?.toLowerCase() !==
                      previewFile.name.toLowerCase()
                  ) {
                    setPreviewFile(null);
                  }
                  handlePathChange(path);
                }}
                placeholder={pathPlaceholder}
                required
              />
              <button
                type="button"
                className="nautia-btn-inline"
                onClick={handleTriggerFilePicker}
                title="Selecionar arquivo no disco"
                aria-label="Procurar arquivo"
              >
                <FolderTagIconGlyph icon="folder" className="nautia-mini-svg" />
              </button>
            </div>
          </label>
        </div>

        {(kind === 'project' &&
          (identification.projectDirectory ||
            identification.structureMarkers.length > 0)) && (
          <div className="nautia-detected-strip">
            {identification.projectDirectory && (
              <div className="nautia-detected-item">
                <span className="nautia-detected-item__label">
                  Diretório do projeto
                </span>
                <code className="nautia-detected-item__code">
                  {identification.projectDirectory}
                </code>
              </div>
            )}
            {identification.structureMarkers.length > 0 && (
              <div className="nautia-detected-item">
                <span className="nautia-detected-item__label">
                  Estrutura característica esperada
                </span>
                <code className="nautia-detected-item__code">
                  {identification.structureMarkers.join(' · ')}
                </code>
              </div>
            )}
          </div>
        )}
      </fieldset>

      {/* ETAPA 3: Classificação Condicional */}
      <fieldset
        className="nautia-form-group"
        onFocusCapture={() => setActiveStep(3)}
      >
        <legend className="nautia-form-group__legend">
          <FolderTagIconGlyph
            icon={
              kind === 'project'
                ? 'folder'
                : kind === 'package'
                  ? 'layers'
                  : 'cube'
            }
            className="nautia-mini-svg"
          />
          <span>3. Classificação</span>
        </legend>

        {kind === 'asset' && (
          <div className="nautia-conditional-section">
            <div className="nautia-register-form__grid">
              <AccessibleSelect
                id="register-category-select"
                name="categoria"
                label="Tipo / Categoria de Conteúdo"
                value={categoria}
                options={REGISTER_CATEGORY_OPTIONS}
                onChange={setCategoria}
              />

              <AccessibleSelect
                id="register-source-software-select"
                name="sourceSoftware"
                label="Software de origem (se conhecido)"
                value={effectiveSoftwareForDisplay}
                options={assetSourceOptions}
                onChange={(val) => {
                  setSourceSoftware(val as OriginSoftware);
                  setUserSelectedSoftware(true);
                }}
              />
            </div>

            <div className="nautia-target-software-block">
              <div className="nautia-target-software-block__header">
                <span className="nautia-field__label">
                  Destinos pretendidos (opcional — intenção de uso)
                </span>
              </div>
              <div
                className="nautia-target-pills"
                role="group"
                aria-label="Destinos pretendidos"
              >
                {TARGET_SOFTWARE_CHOICES.map((target) => {
                  const active = targetSoftware.includes(target.value);
                  return (
                    <button
                      key={target.value}
                      type="button"
                      aria-pressed={active}
                      className={`nautia-target-pill ${active ? 'is-active' : ''}`}
                      onClick={() => handleToggleTargetSoftware(target.value)}
                    >
                      <span aria-hidden="true">{active ? '✓' : '☐'}</span>
                      <span>{target.label}</span>
                      <span className="nautia-target-pill__badge">
                        {target.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {kind === 'project' && (
          <div className="nautia-conditional-section">
            <div className="nautia-register-form__grid">
              <AccessibleSelect
                id="register-project-software-select"
                name="sourceSoftware"
                label="Software / Engine de origem"
                value={
                  effectiveSoftwareForDisplay === 'unknown'
                    ? (identification.allowedProjectTypes[0] ?? 'unreal')
                    : effectiveSoftwareForDisplay
                }
                options={projectSoftwareOptions}
                onChange={(val) => {
                  setSourceSoftware(val as OriginSoftware);
                  setUserSelectedSoftware(true);
                }}
              />

              <div className="nautia-field">
                <span className="nautia-field__label">
                  Tipo de projeto identificado
                </span>
                <div className="nautia-readonly-note">
                  {identification.projectType
                    ? PROJECT_TYPE_LABELS[identification.projectType]
                    : identification.technicalType}
                </div>
                <span className="nautia-field__hint">
                  Categoria: {identification.suggestedCategory ?? 'Projeto'} ·{' '}
                  {identification.technicalType}
                </span>
              </div>
            </div>
            {identification.isIdentificationUncertain &&
              identification.uncertaintyJustification && (
                <p className="nautia-muted-note">
                  <strong>Justificativa da inferência:</strong>{' '}
                  {identification.uncertaintyJustification}
                </p>
              )}
          </div>
        )}

        {kind === 'package' && (
          <div className="nautia-conditional-section">
            <div className="nautia-register-form__grid">
              <AccessibleSelect
                id="register-package-software-select"
                name="sourceSoftware"
                label="Software de origem do pacote"
                value={
                  effectiveSoftwareForDisplay === 'unknown'
                    ? 'unity'
                    : effectiveSoftwareForDisplay
                }
                options={PACKAGE_SOURCE_SOFTWARE_OPTIONS}
                onChange={(val) => {
                  setSourceSoftware(val as OriginSoftware);
                  setUserSelectedSoftware(true);
                }}
              />

              <AccessibleSelect
                id="register-package-category-select"
                name="packageCategoria"
                label="Categoria do pacote (quando aplicável)"
                value={packageCategoria}
                options={REGISTER_PACKAGE_CATEGORY_OPTIONS}
                onChange={setPackageCategoria}
              />
            </div>
          </div>
        )}
      </fieldset>

      {/* ETAPA 4: Organização no Convés */}
      <fieldset
        className="nautia-form-group"
        onFocusCapture={() => setActiveStep(4)}
      >
        <legend className="nautia-form-group__legend">
          <FolderTagIconGlyph icon="folder" className="nautia-mini-svg" />
          <span>4. Organização no Convés</span>
        </legend>

        <div className="nautia-register-form__grid">
          <label className="nautia-field">
            <span className="nautia-field__label">
              {kind === 'project'
                ? 'Projeto ou coleção de organização (opcional)'
                : 'Projeto associado (opcional)'}
            </span>
            <input
              type="text"
              maxLength={80}
              value={projeto}
              onChange={(event) => setProjeto(event.target.value)}
              placeholder="Ex.: Projeto Aurora"
            />
          </label>

          <AccessibleSelect
            id="register-folder-select"
            name="folder"
            label="Pasta no Convés"
            value={folder}
            options={folderOptions}
            onChange={setFolder}
          />

          <TagPicker
            id="register-asset-tags"
            className="nautia-field--full"
            label="Etiquetas"
            optionalHint="opcional"
            ariaLabel="Etiquetas (opcional)"
            placeholder="Pesquisar ou criar etiqueta (Ex.: DOW, Heroi, Sci-Fi)..."
            availableTags={tagPickerOptions}
            selectedTags={selectedTags}
            onChange={setSelectedTags}
          />
        </div>
      </fieldset>

      {/* Avisos determinísticos quando houver bloqueio ou ressalva */}
      {(identification.blockingError || nautiaGuidance.warnings.length > 0) && (
        <section
          className={`nautia-guidance-banner ${
            identification.blockingError ? 'is-error' : 'is-warning'
          }`}
          aria-label="Diagnóstico prévio da Nautia e Motor de Inferência"
        >
          <div className="nautia-guidance-banner__header">
            <FolderTagIconGlyph icon="sparkles" className="nautia-mini-svg" />
            <strong>{nautiaGuidance.headline}</strong>
            {identification.blockingError &&
              identification.suggestedKind !== kind && (
                <button
                  type="button"
                  className="nautia-btn-inline"
                  onClick={handleApplySuggestedModality}
                >
                  Mudar para{' '}
                  {REGISTRATION_KIND_LABELS[identification.suggestedKind]}
                </button>
              )}
            {identification.blockingError &&
              kind === 'project' &&
              identification.allowedProjectTypes.length > 0 &&
              !identification.allowedProjectTypes.includes(
                effectiveSoftwareForDisplay,
              ) &&
              identification.allowedProjectTypes[0] !== 'unknown' && (
                <button
                  type="button"
                  className="nautia-btn-inline"
                  onClick={handleApplySuggestedSoftware}
                >
                  Corrigir para{' '}
                  {
                    PROJECT_TYPE_LABELS[
                      identification.allowedProjectTypes[0] as Exclude<
                        OriginSoftware,
                        'unknown'
                      >
                    ]
                  }
                </button>
              )}
          </div>
          {nautiaGuidance.warnings.length > 0 && (
            <ul className="nautia-guidance-banner__warnings">
              {nautiaGuidance.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      </div>

      <div className="nautia-register-form__footer-bar">
        <p className="nautia-muted-note">
          O Motor de Inferência validará a compatibilidade e extrairá metadados após o registro.
        </p>

        {activeError && (
          <p className="nautia-inline-error" role="alert">
            {activeError}
          </p>
        )}

        <div className="nautia-register-form__actions">
          {onCancel && (
            <button
              type="button"
              className="nautia-btn-ghost"
              onClick={() => {
                resetDraft();
                onCancel();
              }}
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            className="nautia-btn-primary nautia-btn-cta"
            disabled={Boolean(identification.blockingError)}
          >
            <CustomIcon name="rocket" size={17} className="nautia-icon-svg" />
            <span>Registrar no Convés</span>
          </button>
        </div>
      </div>
    </form>
  );
};
