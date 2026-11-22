import { suggestAssetTags } from './assetClassificationService.ts';
import { createNautiaToolSystem, executeToolMutation, validateTool, recordRevision, type NautiaContext } from './nautiaToolSystem.ts';
import {
  type DeckAsset,
  type DeckFolder,
  deduplicateAssets,
  type EtiquetaDePasta,
  normalizeTagLabel,
} from './deckFilterService.ts';
import type { StructuredInferenceReport } from './inferenceService.ts';
import type {
  LibraryOperationsService,
  PermissionContext,
  UndoDescriptor,
} from './libraryOperationsService.ts';
import {
  DEFAULT_LLM_CONFIG,
  type LlmClientConfig,
  planWithConfiguredLlm,
} from './llmClient.ts';
import type { NautiaQuickActionId } from './nautiaQuickActionsService.ts';
import type {
  HistorySource,
  OperationHistoryService,
} from './operationHistoryService.ts';

/**
 * Orquestrador de Ferramentas da Nautia (Etapa 02 - Seções 4, 6, 7 e 10).
 * Converte tanto Quick Actions do Convés quanto comandos em linguagem natural
 * em consultas fundamentadas ou em um `NautiaActionPlan` validado antes de mutar dados.
 */

export type PlannedStepTool =
  | 'updateAssetRecord'
  | 'updateAssetCategory'
  | 'renameFolder'
  | 'removeTags'
  | 'moveAssetRecord'
  | 'moveFolder'
  | 'restoreRecord'
  | 'createFolder'
  | 'createTag'
  | 'assignTags'
  | 'organizeRecords'
  | 'moveToTrash';

export interface PlannedOperationStep {
  readonly stepId: string;
  readonly tool: PlannedStepTool;
  readonly description: string;
  readonly params: Record<string, unknown>;
}

export interface NautiaActionPlan {
  readonly expectedRecords?:readonly {type:'asset'|'folder';id:string;revision:string}[];
  readonly origin?: {requestId:string;conversationId:string;userMessageId:string};
  readonly id: string;
  readonly source: HistorySource;
  readonly objective: string;
  readonly steps: readonly PlannedOperationStep[];
  readonly affectedAssetsCount: number;
  readonly affectedAssetIds: readonly string[];
  readonly affectedFolders: readonly string[];
  readonly tagsAdded: readonly string[];
  readonly tagsRemoved: readonly string[];
  readonly conflicts: readonly string[];
  readonly warnings: readonly string[];
  readonly requiresDestructiveConfirmation: boolean;
  readonly adjustableTargetFolderId?: string | null;
  readonly adjustableTagLabels?: readonly string[];
}

export interface NautiaQueryOutcome {
  readonly sourceMode?:'deterministic'|'llm';
  readonly kind: 'read-result' | 'action-plan' | 'guidance';
  readonly message: string;
  readonly matchedAssets?: readonly DeckAsset[];
  readonly duplicateGroups?: ReadonlyArray<{
    readonly reason: string;
    readonly assets: readonly DeckAsset[];
  }>;
  readonly inferenceReports?: readonly StructuredInferenceReport[];
  readonly plan?: NautiaActionPlan;
  readonly warnings?: readonly string[];
  readonly toolData?: unknown;
  readonly failed?: boolean;
}

function makePlanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `plan-${crypto.randomUUID()}`;
  }
  return `plan-${Date.now().toString(36)}`;
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase('pt-BR');
}

function suggestTagLabelsForAssets(
  assets: readonly DeckAsset[],
  folders: readonly DeckFolder[] = [],
): string[] {
  const suggestions = new Set<string>();
  for (const asset of assets) {
    if (asset.categoria?.trim()) suggestions.add(asset.categoria.trim());
    if (asset.formato?.trim()) {
      suggestions.add(asset.formato.replace(/^\./, '').toUpperCase());
    }
    if (asset.engine && asset.engine !== 'Qualquer') {
      suggestions.add(asset.engine);
    }
    const folderName =
      folders.find((f) => !f.deleted && f.id === asset.folder)?.name ?? null;
    const smart = suggestAssetTags({
      asset,
      folderName,
      existingAssetTags: [],
    });
    for (const item of smart) {
      suggestions.add(item.label);
    }
  }
  return Array.from(suggestions).slice(0, 6);
}

/**
 * Orquestra os 4 cards de Nautia Quick Actions reutilizando o serviço centralizado.
 */
export async function orchestrateQuickAction(params: {
  readonly actionId: NautiaQuickActionId;
  readonly selectedAssets: readonly DeckAsset[];
  readonly folders: readonly DeckFolder[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly operations: LibraryOperationsService;
  readonly targetFolderId?: string | null;
  readonly targetEngine?: string;
}): Promise<NautiaQueryOutcome> {
  const uniqueSelected = deduplicateAssets(params.selectedAssets).filter(
    (asset) => !asset.deleted,
  );
  if (uniqueSelected.length === 0) {
    return {
      kind: 'guidance',
      message:
        'Nenhum arquivo selecionado. Selecione um ou mais assets no Convés para definir o escopo da Nautia.',
    };
  }

  const selectedIds = uniqueSelected.map((a) => a.id);

  if (params.actionId === 'analyze-assets') {
    const result = await createNautiaToolSystem(params.operations, () => ({ folderId: params.targetFolderId ?? null, selectedAssetIds: selectedIds, project: null, filters: {} })).call('analyzeAsset', { assetIds: selectedIds });
    return {
      kind: 'read-result',
      message: result.summary,
      failed: !result.ok,
      matchedAssets: uniqueSelected,
      inferenceReports: result.data as StructuredInferenceReport[] ?? [],
    };
  }

  if (params.actionId === 'check-compatibility') {
    const result = await params.operations.queryDiagnostics(selectedIds, {
      targetEngine: params.targetEngine,
    });
    return {
      kind: 'read-result',
      message: result.summary,
      failed: !result.ok || result.data?.some(r => !!r.errors?.length),
      matchedAssets: uniqueSelected,
      inferenceReports: result.data ?? [],
    };
  }

  if (params.actionId === 'organize') {
    const activeFolders = params.folders.filter((f) => !f.deleted);
    const chosenFolder =
      activeFolders.find((f) => f.id === params.targetFolderId) ??
      activeFolders[0] ??
      null;

    const conflicts: string[] = [];
    const warnings = [
      'Apenas os vínculos virtuais no Convés serão atualizados; os arquivos originais no disco não serão movidos.',
    ];

    const steps: PlannedOperationStep[] = [];
    let targetFolderName = chosenFolder?.name ?? 'Organizados';
    let targetId: string | null = chosenFolder?.id ?? null;

    if (!chosenFolder) {
      const defaultTagId = params.folderTags[0]?.id ?? null;
      steps.push({
        stepId: 'step-create-folder',
        tool: 'createFolder',
        description: `Criar pasta virtual "${targetFolderName}" com etiqueta obrigatória.`,
        params: {
          name: targetFolderName,
          parent: null,
          existingTagId: defaultTagId,
          newTag: defaultTagId
            ? null
            : { label: 'Organizados', icon: 'layers', accent: 'purple' },
        },
      });
      targetId = '__NEW_FOLDER_0__';
    }

    const alreadyInTarget = chosenFolder
      ? uniqueSelected.filter((a) => a.folder === chosenFolder.id).length
      : 0;
    if (alreadyInTarget > 0) {
      conflicts.push(
        `${alreadyInTarget} asset(s) selecionado(s) já estão na pasta "${targetFolderName}".`,
      );
    }

    steps.push({
      stepId: 'step-organize-records',
      tool: 'organizeRecords',
      description: `Associar ${uniqueSelected.length} asset(s) selecionado(s) à pasta "${targetFolderName}".`,
      params: {
        assetIds: selectedIds,
        targetFolderId: targetId,
      },
    });

    return {
      kind: 'action-plan',
      message: `Plano preparado para organizar ${uniqueSelected.length} asset(s). Confirme para aplicar.`,
      plan: {
        id: makePlanId(),
        source: 'quick-action',
        objective: `Organizar ${uniqueSelected.length} asset(s) selecionado(s) em pasta do Convés`,
        steps,
        affectedAssetsCount: uniqueSelected.length,
        affectedAssetIds: selectedIds,
        affectedFolders: [targetFolderName],
        tagsAdded: [],
        tagsRemoved: [],
        conflicts,
        warnings,
        requiresDestructiveConfirmation: false,
        adjustableTargetFolderId: chosenFolder?.id ?? null,
      },
    };
  }

  // 'create-tags'
  const suggestedLabels = suggestTagLabelsForAssets(uniqueSelected);
  const effectiveLabels =
    suggestedLabels.length > 0 ? suggestedLabels : ['Revisado'];

  return {
    kind: 'action-plan',
    message: `Plano preparado para aplicar etiquetas técnicas aos ${uniqueSelected.length} asset(s) selecionado(s).`,
    plan: {
      id: makePlanId(),
      source: 'quick-action',
      objective: `Criar e associar etiquetas aos ${uniqueSelected.length} asset(s) selecionado(s)`,
      steps: [
        {
          stepId: 'step-assign-asset-tags',
          tool: 'assignTags',
          description: `Aplicar etiquetas (${effectiveLabels.join(', ')}) ao lote selecionado.`,
          params: {
            scope: 'asset-tag',
            assetIds: selectedIds,
            labels: effectiveLabels,
          },
        },
      ],
      affectedAssetsCount: uniqueSelected.length,
      affectedAssetIds: selectedIds,
      affectedFolders: [],
      tagsAdded: effectiveLabels,
      tagsRemoved: [],
      conflicts: [],
      warnings: [
        'As sugestões foram derivadas exclusivamente de formato, categoria e engine cadastrados.',
      ],
      requiresDestructiveConfirmation: false,
      adjustableTagLabels: effectiveLabels,
    },
  };
}

/**
 * Orquestra comandos em linguagem natural do módulo completo da Nautia (Nível 2).
 * Se um provedor LLM estiver configurado, tenta planejar via ferramentas autorizadas;
 * caso contrário (ou em fallback), utiliza interpretação determinística sem respostas falsas.
 */
export async function orchestrateNaturalLanguageRequest(params: {
  readonly prompt: string;
  readonly selectedAssets: readonly DeckAsset[];
  readonly operations: LibraryOperationsService;
  readonly llmConfig?: LlmClientConfig;
  readonly context?: NautiaContext;
}): Promise<NautiaQueryOutcome> {
  const cleanPrompt = params.prompt.trim();
  if (!cleanPrompt) {
    return {
      kind: 'guidance',
      message: 'Descreva o que deseja consultar ou organizar na sua biblioteca.',
    };
  }

  const allAssets = params.operations.listAssets().data ?? [];
  const allFolders = params.operations.listFolders();
  const allTags = params.operations.listTags().data ?? {
    folderTags: [],
    assetTags: [],
  };

  const warnings: string[] = [];
  const tools = createNautiaToolSystem(params.operations, () => params.context ?? { folderId: null, selectedAssetIds: params.selectedAssets.map(a => a.id), project: null, filters: {} });
  const command = cleanPrompt.toLocaleLowerCase('pt-BR');
  let request: Promise<import('./nautiaToolSystem.ts').ToolResult> | undefined;
  const selectedIds = params.selectedAssets.map(a => a.id);
  if (/^(contexto|contexto atual|qual (é )?o contexto)\??$/.test(command)) request = tools.call('getCurrentContext', {});
  else if (/^(listar|liste|mostrar|mostre) (as )?pastas\.?$/.test(command)) request = tools.call('listFolders', {});
  else if (/^(listar|liste|mostrar|mostre) (as )?etiquetas\.?$/.test(command)) request = tools.call('listTags', {});
  else if (/^(pesquise|pesquisar|busque|buscar)\s+/.test(command)) request = tools.call('searchAssets', { query: cleanPrompt.replace(/^(pesquise|pesquisar|busque|buscar)\s+/i, '') });
  else if (/^(detalhes|diagnóstico salvo|diagnostico salvo|última análise|ultima analise)/.test(command)) {
    if (selectedIds.length !== 1) return { kind: 'guidance', message: 'Selecione exatamente um asset no Convés.' };
    request = /detalhes/.test(command) ? tools.call('getAssetDetails', { assetId: selectedIds[0] }) : tools.call('getAnalysisResult', { assetId: selectedIds[0] });
  } else if (/^(analise|analisar|análise|analisa)/.test(command)) {
    if (!selectedIds.length) return { kind: 'guidance', message: 'Nenhum asset selecionado. Selecione no Convés os recursos para análise.' };
    request = tools.call('analyzeAsset', { assetIds: selectedIds });
  } else if (/^(remova|remover) (a )?etiqueta /.test(command)) request = tools.call('removeTags', { assetIds: selectedIds, labels: [cleanPrompt.replace(/^(remova|remover) (a )?etiqueta /i, '').trim()] });
  else if (/^(envie|mova|mover).*lixeira/.test(command)) request = tools.call('moveToTrash', { refs: selectedIds.map(id => ({ type: 'asset', id })) });
  else if (/^(restaure|restaurar) registro /.test(command)) request = tools.call('restoreRecord', { refs: [{ type: 'asset', id: cleanPrompt.replace(/^(restaure|restaurar) registro /i, '').trim() }] });
  else if (/^(mova|mover) selecionados para /.test(command)) request = tools.call('moveAssetRecord', { assetIds: selectedIds, targetFolderId: cleanPrompt.replace(/^(mova|mover) selecionados para /i, '').trim() === 'raiz' ? null : cleanPrompt.replace(/^(mova|mover) selecionados para /i, '').trim() });
  if (request) {
    const result = await request;
    return { kind: result.plan ? 'action-plan' : 'read-result', message: result.summary, failed: !result.ok, plan: result.plan, toolData: result.data, inferenceReports: result.tool === 'analyzeAsset' ? result.data as StructuredInferenceReport[] | undefined : undefined };
  }

  if (params.llmConfig && params.llmConfig.provider !== 'none') {
    const contextSummary = `Assets ativos: ${allAssets.length}; Pastas ativas: ${allFolders.length}; Selecionados: ${params.selectedAssets.length}`;
    const llmResult = await planWithConfiguredLlm(
      cleanPrompt,
      contextSummary,
      params.llmConfig,
    );
    if (llmResult?.warning) {
      warnings.push(llmResult.warning);
    }
    if (llmResult?.usedLlm && llmResult.toolCalls.length > 0) {
      const steps: PlannedOperationStep[] = llmResult.toolCalls
        .filter((call) =>
          [
            'createFolder',
            'createTag',
            'assignTags',
            'organizeRecords',
            'moveToTrash',
          ].includes(call.tool),
        )
        .map((call, idx) => ({
          stepId: `llm-step-${idx + 1}`,
          tool: call.tool as PlannedStepTool,
          description: `${call.tool}(${JSON.stringify(call.args)})`,
          params: call.args,
        }));

      if (steps.length > 0) {
        return {
          kind: 'action-plan',
          message: llmResult.explanation || 'Plano proposto pela Nautia para revisão.',
          warnings,
          plan: {
            id: makePlanId(),
            source: 'nautia-chat',
            objective: llmResult.objective,
            steps,
            affectedAssetsCount: params.selectedAssets.length,
            affectedAssetIds: params.selectedAssets.map((a) => a.id),
            affectedFolders: [],
            tagsAdded: [],
            tagsRemoved: [],
            conflicts: [],
            warnings: [
              'Plano gerado por provedor LLM configurado e validado pela lista de ferramentas autorizadas.',
              ...warnings,
            ],
            requiresDestructiveConfirmation: steps.some(
              (s) => s.tool === 'moveToTrash',
            ),
          },
        };
      }
    }
  }

  const norm = normalizeTagLabel(cleanPrompt);

  // 1. Criar pasta ("Crie uma pasta chamada ...")
  const createFolderMatch = cleanPrompt.match(
    /(?:crie|criar|nova)\s+(?:uma\s+)?pasta(?:\s+chamada|\s+com\s+nome)?\s+["“]?([^"”.!\n]+)["”]?/i,
  );
  if (createFolderMatch) {
    const folderName = createFolderMatch[1].trim();
    const existing = allFolders.find(
      (f) => normalizeTagLabel(f.name) === normalizeTagLabel(folderName),
    );
    const defaultTag = allTags.folderTags[0] ?? null;

    return {
      kind: 'action-plan',
      message: `Plano pronto para criar a pasta "${folderName}". Confirme para gravar no Convés.`,
      warnings,
      plan: {
        id: makePlanId(),
        source: 'nautia-chat',
        objective: `Criar pasta "${folderName}" com etiqueta obrigatória`,
        steps: [
          {
            stepId: 'step-create-folder',
            tool: 'createFolder',
            description: `Criar pasta "${folderName}" associada à etiqueta "${
              defaultTag?.label ?? folderName
            }".`,
            params: {
              name: folderName,
              parent: null,
              existingTagId: defaultTag?.id ?? null,
              newTag: defaultTag
                ? null
                : { label: folderName, icon: 'folder', accent: 'cyan' },
            },
          },
        ],
        affectedAssetsCount: 0,
        affectedAssetIds: [],
        affectedFolders: [folderName],
        tagsAdded: defaultTag ? [] : [folderName],
        tagsRemoved: [],
        conflicts: existing
          ? [`Já existe uma pasta ativa chamada "${existing.name}" na raiz.`]
          : [],
        warnings: [
          'Pastas exigem ao menos uma Etiqueta de Pasta para manter a navegação por ícones.',
          ...warnings,
        ],
        requiresDestructiveConfirmation: false,
      },
    };
  }

  // 2. Encontrar duplicados ("duplicad...")
  if (norm.includes('duplicad')) {
    const byPath = new Map<string, DeckAsset[]>();
    const byName = new Map<string, DeckAsset[]>();

    for (const asset of allAssets) {
      const pKey = normalizePath(asset.caminho || '');
      if (pKey) {
        byPath.set(pKey, [...(byPath.get(pKey) ?? []), asset]);
      }
      const nKey = normalizeTagLabel(asset.nome || '');
      if (nKey) {
        byName.set(nKey, [...(byName.get(nKey) ?? []), asset]);
      }
    }

    const groups: Array<{ reason: string; assets: DeckAsset[] }> = [];
    const seenGroupIds = new Set<string>();

    for (const [pathKey, list] of byPath.entries()) {
      if (list.length > 1) {
        groups.push({ reason: `Mesmo caminho normalizado: ${pathKey}`, assets: list });
        list.forEach((a) => seenGroupIds.add(a.id));
      }
    }
    for (const [nameKey, list] of byName.entries()) {
      if (list.length > 1 && list.some((a) => !seenGroupIds.has(a.id))) {
        groups.push({ reason: `Mesmo nome normalizado: ${nameKey}`, assets: list });
      }
    }

    return {
      kind: 'read-result',
      message:
        groups.length > 0
          ? `Encontrado(s) ${groups.length} grupo(s) com possível duplicidade por caminho ou nome.`
          : 'Nenhum registro duplicado encontrado por caminho ou nome na biblioteca.',
      duplicateGroups: groups,
      matchedAssets: deduplicateAssets(groups.flatMap((g) => g.assets)),
      warnings: [
        'Comparação realizada sobre caminho e nome cadastrados (sem hash binário no disco).',
        ...warnings,
      ],
    };
  }

  // 3. Compatibilidade ("compatibilidade", "unreal", "unity", "omnin", "problema")
  if (
    norm.includes('compatibil') ||
    norm.includes('problema') ||
    norm.includes('unreal') ||
    norm.includes('unity') ||
    norm.includes('omnin')
  ) {
    const targetEngine = norm.includes('unreal')
      ? 'Unreal Engine 5'
      : norm.includes('unity')
        ? 'Unity'
        : norm.includes('omnin')
          ? 'OMNIN Engine'
          : undefined;

    const scopeAssets =
      params.selectedAssets.length > 0 ? params.selectedAssets : allAssets;
    if (scopeAssets.length === 0) {
      return {
        kind: 'guidance',
        message: 'Não há assets ativos cadastrados para avaliar compatibilidade.',
        warnings,
      };
    }

    const diagResult = await params.operations.queryDiagnostics(
      scopeAssets.map((a) => a.id),
      { targetEngine },
    );
    const reports = diagResult.data ?? [];
    if (!diagResult.ok || reports.some(r => r.errors?.length)) return { kind: 'read-result', failed: true, message: diagResult.ok ? 'A análise retornou erros; consulte os relatórios.' : diagResult.summary, inferenceReports: reports, warnings };
    const issues = reports.filter(
      (r) =>
        r.diagnostic.status === 'warning' || r.diagnostic.status === 'incompatible',
    );

    return {
      kind: 'read-result',
      message:
        issues.length > 0
          ? `Identificado(s) ${issues.length} asset(s) com ressalva ou incompatibilidade${
              targetEngine ? ` para ${targetEngine}` : ''
            }.`
          : `Nenhum problema determinístico identificado nos ${reports.length} asset(s) avaliados${
              targetEngine ? ` para ${targetEngine}` : ''
            }.`,
      inferenceReports: issues.length > 0 ? issues : reports,
      matchedAssets: scopeAssets,
      warnings,
    };
  }

  // 4. Encontrar FBX / formato sem etiquetas ("encontre ... fbx ... sem etiquetas")
  if (norm.includes('encontre') || norm.includes('buscar') || norm.includes('quais')) {
    const knownFmtMatch = cleanPrompt.match(/\b(fbx|blend|obj|glb|gltf|uasset|png|jpg)\b/i);
    const format = knownFmtMatch ? `.${knownFmtMatch[1].toLowerCase()}` : null;
    const withoutTags = norm.includes('sem etiqueta');

    const searchResult = params.operations.searchAssets({
      universalFilters: {
        matchMode: 'all',
        format,
        organizationState: withoutTags ? 'untagged' : 'all',
      },
    });
    const matched = searchResult.data?.assets ?? [];

    // Caso composto: "encontre ... e organize em uma pasta chamada X"
    const organizeTargetMatch = cleanPrompt.match(
      /organize(?:\s+os)?(?:\s+em\s+(?:uma\s+)?pasta(?:\s+chamada)?)?\s+["“]?([^"”.!\n]+)["”]?/i,
    );
    if (organizeTargetMatch && norm.includes('organize') && matched.length > 0) {
      const targetName = organizeTargetMatch[1].trim();
      const existingFolder = allFolders.find(
        (f) => normalizeTagLabel(f.name) === normalizeTagLabel(targetName),
      );
      const defaultTag = allTags.folderTags[0] ?? null;

      const steps: PlannedOperationStep[] = [];
      let folderRef = existingFolder?.id ?? '__NEW_FOLDER_0__';

      if (!existingFolder) {
        steps.push({
          stepId: 'step-create-target-folder',
          tool: 'createFolder',
          description: `Criar pasta virtual "${targetName}".`,
          params: {
            name: targetName,
            parent: null,
            existingTagId: defaultTag?.id ?? null,
            newTag: defaultTag
              ? null
              : { label: targetName, icon: 'folder', accent: 'cyan' },
          },
        });
      }

      steps.push({
        stepId: 'step-organize-matched',
        tool: 'organizeRecords',
        description: `Organizar ${matched.length} asset(s) encontrado(s) em "${targetName}".`,
        params: {
          assetIds: matched.map((a) => a.id),
          targetFolderId: folderRef,
        },
      });

      return {
        kind: 'action-plan',
        message: `Encontrado(s) ${matched.length} asset(s) compatíveis. Revise o plano antes de organizar.`,
        matchedAssets: matched,
        plan: {
          id: makePlanId(),
          source: 'nautia-chat',
          objective: `Encontrar${format ? ` ${format}` : ''}${
            withoutTags ? ' sem etiquetas' : ''
          } e organizar em "${targetName}"`,
          steps,
          affectedAssetsCount: matched.length,
          affectedAssetIds: matched.map((a) => a.id),
          affectedFolders: [targetName],
          tagsAdded: existingFolder || defaultTag ? [] : [targetName],
          tagsRemoved: [],
          conflicts: [],
          warnings: [
            'Os arquivos originais no disco permanecerão intactos.',
            ...warnings,
          ],
          requiresDestructiveConfirmation: false,
        },
      };
    }

    return {
      kind: 'read-result',
      message: `${matched.length} asset(s) encontrado(s)${
        format ? ` no formato ${format}` : ''
      }${withoutTags ? ' sem etiquetas' : ''}.`,
      matchedAssets: matched,
      warnings,
    };
  }

  // 5. Separar texturas em coleção própria
  if (norm.includes('textura') && (norm.includes('separe') || norm.includes('colecao') || norm.includes('pasta'))) {
    const textures = allAssets.filter(
      (a) =>
        normalizeTagLabel(a.categoria || '') === 'textura' ||
        ['.png', '.jpg', '.jpeg', '.tga'].includes((a.formato || '').toLowerCase()),
    );
    if (textures.length === 0) {
      return {
        kind: 'guidance',
        message: 'Nenhuma textura (.png, .jpg, .tga ou categoria Textura) cadastrada na biblioteca.',
        warnings,
      };
    }

    const folderName = 'Texturas';
    const existing = allFolders.find(
      (f) => normalizeTagLabel(f.name) === 'texturas',
    );
    const defaultTag = allTags.folderTags[0] ?? null;
    const steps: PlannedOperationStep[] = [];

    if (!existing) {
      steps.push({
        stepId: 'step-create-textures-folder',
        tool: 'createFolder',
        description: 'Criar coleção/pasta virtual "Texturas".',
        params: {
          name: folderName,
          parent: null,
          existingTagId: defaultTag?.id ?? null,
          newTag: defaultTag
            ? null
            : { label: 'Texturas', icon: 'layers', accent: 'purple' },
        },
      });
    }

    steps.push({
      stepId: 'step-move-textures-meta',
      tool: 'organizeRecords',
      description: `Agrupar ${textures.length} textura(s) na coleção virtual "Texturas".`,
      params: {
        assetIds: textures.map((a) => a.id),
        targetFolderId: existing?.id ?? '__NEW_FOLDER_0__',
      },
    });

    return {
      kind: 'action-plan',
      message: `Plano preparado para separar ${textures.length} textura(s) sem mover os arquivos originais.`,
      plan: {
        id: makePlanId(),
        source: 'nautia-chat',
        objective: 'Separar texturas em coleção virtual própria',
        steps,
        affectedAssetsCount: textures.length,
        affectedAssetIds: textures.map((a) => a.id),
        affectedFolders: [folderName],
        tagsAdded: existing || defaultTag ? [] : ['Texturas'],
        tagsRemoved: [],
        conflicts: [],
        warnings: [
          'Garantia: nenhum arquivo original no disco será movido ou renomeado.',
          ...warnings,
        ],
        requiresDestructiveConfirmation: false,
      },
    };
  }

  // 6. Organizar modelos por projeto
  if (norm.includes('organize') && norm.includes('projeto')) {
    const withProject = allAssets.filter((a) => Boolean(a.projeto?.trim()));
    if (withProject.length === 0) {
      return {
        kind: 'guidance',
        message:
          'Nenhum asset ativo possui o campo "Projeto" preenchido para agrupamento automático.',
        warnings,
      };
    }

    const byProject = new Map<string, DeckAsset[]>();
    for (const asset of withProject) {
      const proj = asset.projeto!.trim();
      byProject.set(proj, [...(byProject.get(proj) ?? []), asset]);
    }

    const steps: PlannedOperationStep[] = [];
    const folderNames: string[] = [];
    const defaultTag = allTags.folderTags[0] ?? null;
    let newFolderCounter = 0;

    for (const [projectName, list] of byProject.entries()) {
      folderNames.push(projectName);
      const existing = allFolders.find(
        (f) => normalizeTagLabel(f.name) === normalizeTagLabel(projectName),
      );
      let targetRef = existing?.id;
      if (!targetRef) {
        targetRef = `__NEW_FOLDER_${newFolderCounter++}__`;
        steps.push({
          stepId: `step-create-${projectName}`,
          tool: 'createFolder',
          description: `Criar pasta do projeto "${projectName}".`,
          params: {
            name: projectName,
            parent: null,
            existingTagId: defaultTag?.id ?? null,
            newTag: defaultTag
              ? null
              : { label: projectName, icon: 'rocket', accent: 'cyan' },
          },
        });
      }
      steps.push({
        stepId: `step-assign-${projectName}`,
        tool: 'organizeRecords',
        description: `Vincular ${list.length} asset(s) ao projeto "${projectName}".`,
        params: {
          assetIds: list.map((a) => a.id),
          targetFolderId: targetRef,
        },
      });
    }

    return {
      kind: 'action-plan',
      message: `Plano preparado para organizar ${withProject.length} asset(s) em ${byProject.size} projeto(s).`,
      plan: {
        id: makePlanId(),
        source: 'nautia-chat',
        objective: 'Organizar assets por projeto',
        steps,
        affectedAssetsCount: withProject.length,
        affectedAssetIds: withProject.map((a) => a.id),
        affectedFolders: folderNames,
        tagsAdded: [],
        tagsRemoved: [],
        conflicts: [],
        warnings: [
          'Somente metadados virtuais do Convés serão atualizados.',
          ...warnings,
        ],
        requiresDestructiveConfirmation: false,
      },
    };
  }

  // 7. Adicionar etiqueta ("Adicione a etiqueta Blender a estes arquivos")
  const addTagMatch = cleanPrompt.match(
    /(?:adicione|adicionar|aplique|aplicar|crie)\s+(?:a\s+)?etiqueta\s+["“]?([^"”.!\n]+?)["”]?(?:\s+(?:a|em|nos|nestes)\s+.*)?$/i,
  );
  if (addTagMatch) {
    const label = addTagMatch[1].trim();
    const targetAssets = params.selectedAssets;
    if (targetAssets.length === 0) {
      return {
        kind: 'guidance',
        message: `Selecione no Convés os arquivos que devem receber a etiqueta "${label}". Não seleciono a biblioteca inteira automaticamente.`,
        warnings,
      };
    }

    return {
      kind: 'action-plan',
      message: `Plano preparado para aplicar a etiqueta "${label}" aos ${targetAssets.length} asset(s) selecionado(s).`,
      plan: {
        id: makePlanId(),
        source: 'nautia-chat',
        objective: `Aplicar etiqueta "${label}" aos arquivos selecionados`,
        steps: [
          {
            stepId: 'step-assign-tag',
            tool: 'assignTags',
            description: `Adicionar etiqueta "${label}" em ${targetAssets.length} asset(s).`,
            params: {
              scope: 'asset-tag',
              assetIds: targetAssets.map((a) => a.id),
              labels: [label],
            },
          },
        ],
        affectedAssetsCount: targetAssets.length,
        affectedAssetIds: targetAssets.map((a) => a.id),
        affectedFolders: [],
        tagsAdded: [label],
        tagsRemoved: [],
        conflicts: [],
        warnings,
        requiresDestructiveConfirmation: false,
        adjustableTagLabels: [label],
      },
    };
  }

  return {
    kind: 'guidance',
    message:
      'Não consegui mapear esta solicitação para uma ferramenta segura sem LLM ativa. Experimente comandos como: "Crie uma pasta chamada Personagens 3D", "Encontre todos os arquivos FBX sem etiquetas", "Quais assets possuem problemas de compatibilidade com Unreal?" ou "Encontre arquivos duplicados na biblioteca".',
    warnings,
  };
}

/**
 * Executa exclusivamente as etapas incluídas em um `NautiaActionPlan` aprovado,
 * registrando o histórico estruturado com suporte a Desfazer.
 */
const attemptedPlans=new WeakMap<LibraryOperationsService,Set<string>>();
export function executeApprovedActionPlan(params: {
  readonly plan: NautiaActionPlan;
  readonly operations: LibraryOperationsService;
  readonly history: OperationHistoryService;
  readonly permissions?: PermissionContext;
}): {
  readonly ok: boolean;
  readonly summary: string;
  readonly historyEntryId?: string;
} {
  const permissions = params.permissions ?? {
    actor: 'nautia-assistant',
    allowMutations: true,
  };

  try {
    if (!permissions.allowMutations) throw new Error('Permissão insuficiente para executar o plano.');
    if(attemptedPlans.get(params.operations)?.has(params.plan.id))throw new Error('Este plano já teve uma tentativa de execução. Consulte os registros e prepare um novo plano.');
    for(const expected of params.plan.expectedRecords??[]){
      const current=expected.type==='asset'?params.operations.listAssets(true).data?.find(a=>a.id===expected.id):params.operations.listFolders(true).find(f=>f.id===expected.id);
      if(recordRevision(current)!==expected.revision)throw new Error('Um recurso mudou desde a preparação. Consulte o estado atual e prepare um novo plano.');
    }
    if (!params.plan.steps.length || params.plan.steps.length > 100) throw new Error('Plano vazio ou acima do limite de 100 passos.');
    const placeholders = new Set<string>();
    for (const step of params.plan.steps) {
      validateTool(step.tool, step.params, params.operations, placeholders);
      if (step.tool === 'createFolder') placeholders.add(`__NEW_FOLDER_${placeholders.size}__`);
    }
  } catch (error) {
    const summary = error instanceof Error ? error.message : String(error);
    params.history.record({ actionType: 'action-plan', source: params.plan.source, summary: params.plan.objective, affectedResources: params.plan.affectedAssetIds, status: 'failed', resultSummary: summary });
    return { ok: false, summary };
  }

  const createdFolderPlaceholders = new Map<string, string>();
  const attempted=attemptedPlans.get(params.operations)??new Set<string>();attempted.add(params.plan.id);attemptedPlans.set(params.operations,attempted);
  let newFolderIdx = 0;
  const undoSteps: UndoDescriptor[] = [];
  const stepSummaries: string[] = [];

  for (const step of params.plan.steps) {
    if (step.tool === 'updateAssetRecord' || step.tool === 'updateAssetCategory' || step.tool === 'renameFolder' || step.tool === 'removeTags' || step.tool === 'moveAssetRecord' || step.tool === 'moveFolder' || step.tool === 'restoreRecord' || step.tool === 'createTag') {
      try {
        const result = executeToolMutation(step, params.operations, permissions);
        if (!result.ok) throw new Error(result.summary);
        if (result.undo) undoSteps.push(result.undo);
        stepSummaries.push(result.summary);
      } catch (error) {
        const summary = `${stepSummaries.length} passo(s) concluído(s). Execução interrompida: ${error instanceof Error ? error.message : String(error)}`;
        params.history.record({ actionType: 'action-plan', source: params.plan.source, summary: params.plan.objective, affectedResources: params.plan.affectedAssetIds, status: 'failed', resultSummary: summary });
        return { ok: false, summary };
      }
    } else
    if (step.tool === 'createFolder') {
      const result = params.operations.createFolder(
        {
          name: String(step.params.name ?? ''),
          parent: (step.params.parent as string | null) ?? null,
          existingTagId: (step.params.existingTagId as string | null) ?? null,
          newTag: (step.params.newTag as never) ?? null,
        },
        permissions,
      );
      if (!result.ok || !result.data) {
        params.history.record({
          actionType: 'action-plan',
          source: params.plan.source,
          summary: params.plan.objective,
          affectedResources: params.plan.affectedAssetIds,
          status: 'failed',
          resultSummary: result.summary,
        });
        return { ok: false, summary: result.summary };
      }
      createdFolderPlaceholders.set(
        `__NEW_FOLDER_${newFolderIdx++}__`,
        result.data.folder.id,
      );
      if (result.undo) undoSteps.push(result.undo);
      stepSummaries.push(result.summary);
    } else if (step.tool === 'organizeRecords') {
      let targetFolderId = step.params.targetFolderId as string | null;
      if (targetFolderId && createdFolderPlaceholders.has(targetFolderId)) {
        targetFolderId = createdFolderPlaceholders.get(targetFolderId) ?? null;
      }
      const result = params.operations.organizeRecords(
        {
          assetIds: (step.params.assetIds as string[]) ?? [],
          targetFolderId,
        },
        permissions,
      );
      if (!result.ok) {
        params.history.record({
          actionType: 'action-plan',
          source: params.plan.source,
          summary: params.plan.objective,
          affectedResources: params.plan.affectedAssetIds,
          status: 'failed',
          resultSummary: result.summary,
        });
        return { ok: false, summary: result.summary };
      }
      if (result.undo) undoSteps.push(result.undo);
      stepSummaries.push(result.summary);
    } else if (step.tool === 'assignTags') {
      const result = params.operations.assignTags(
        step.params as Parameters<LibraryOperationsService['assignTags']>[0],
        permissions,
      );
      if (!result.ok) {
        params.history.record({
          actionType: 'action-plan',
          source: params.plan.source,
          summary: params.plan.objective,
          affectedResources: params.plan.affectedAssetIds,
          status: 'failed',
          resultSummary: result.summary,
        });
        return { ok: false, summary: result.summary };
      }
      if (result.undo) undoSteps.push(result.undo);
      stepSummaries.push(result.summary);
    } else if (step.tool === 'moveToTrash') {
      const refs = (step.params.refs as Array<{ type: 'folder' | 'asset'; id: string }>) ?? [];
      const result = params.operations.moveToTrash(refs, permissions);
      if (!result.ok) {
        params.history.record({
          actionType: 'action-plan',
          source: params.plan.source,
          summary: params.plan.objective,
          affectedResources: params.plan.affectedAssetIds,
          status: 'failed',
          resultSummary: result.summary,
        });
        return { ok: false, summary: result.summary };
      }
      if (result.undo) undoSteps.push(result.undo);
      stepSummaries.push(result.summary);
    }
  }

  const finalSummary = stepSummaries.join(' ') || 'Plano executado com sucesso.';
  const entry = params.history.record({
    actionType: 'action-plan',
    source: params.plan.source,
    summary: params.plan.objective,
    affectedResources: [
      ...params.plan.affectedAssetIds,
      ...createdFolderPlaceholders.values(),
    ],
    status: 'executed',
    resultSummary: finalSummary,
    undoSteps,
  });

  return {
    ok: true,
    summary: finalSummary,
    historyEntryId: entry.id,
  };
}

export { DEFAULT_LLM_CONFIG };
