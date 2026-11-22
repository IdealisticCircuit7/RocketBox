import React, { useState } from 'react';
import { StructuredInferenceReport } from '../../services/inferenceService';
import {
  NautiaActionPlan as ActionPlanModel,
  NautiaQueryOutcome,
} from '../../services/nautiaOrchestratorService';
import { PlanResolutionState } from '../../services/nautiaConversationStore';
import { NautiaDiagnosticsPanel } from './NautiaDiagnosticsPanel';
import {NautiaToolResults} from './NautiaToolResults';
import type {DeckFolder} from '../../services/deckFilterService';
import {AssetIcon} from '../common/AssetIcon';
import {FolderTagIconGlyph} from '../deck/FolderTagIconGlyph';

const actionTitles:Partial<Record<ActionPlanModel['steps'][number]['tool'],string>>={
  assignTags:'Atualizar etiquetas',removeTags:'Remover etiquetas',moveAssetRecord:'Mover assets',organizeRecords:'Organizar assets',moveFolder:'Mover pasta',createFolder:'Criar pasta',renameFolder:'Renomear pasta',updateAssetRecord:'Editar registro',updateAssetCategory:'Alterar categoria',moveToTrash:'Enviar para a lixeira',restoreRecord:'Restaurar registros',createTag:'Criar etiqueta',
};

export interface NautiaTurnCardsProps {
  readonly outcome: NautiaQueryOutcome;
  readonly folders?:readonly DeckFolder[];
  readonly activePendingPlanId: string | null;
  readonly planResolution?: PlanResolutionState;
  readonly onConfirmPlan: (plan: ActionPlanModel) => void;
  readonly onCancelPlan: (planId: string) => void;
  readonly onFocusActionPlan: (plan: ActionPlanModel) => void;
}

function isCompatibilityReport(report: StructuredInferenceReport): boolean {
  return (
    Boolean(report.verifiedMetadata.engine) ||
    Boolean(report.verifiedMetadata.targetEngine) ||
    report.appliedRules.some((rule) => /compat|engine|ue|unreal|unity|godot/i.test(rule))
  );
}

/**
 * Cartões técnicos compactos integrados às mensagens da NautIA (Análise, Organização, Compatibilidade e Listagens).
 */
export const NautiaTurnCards: React.FC<NautiaTurnCardsProps> = ({
  outcome,
  folders=[],
  activePendingPlanId,
  planResolution,
  onConfirmPlan,
  onCancelPlan,
  onFocusActionPlan,
}) => {
  const [expandedReportIds, setExpandedReportIds] = useState<Record<string, boolean>>({});
  const [showAllMatches, setShowAllMatches] = useState(false);

  const toggleReport = (assetId: string) => {
    setExpandedReportIds((prev) => ({
      ...prev,
      [assetId]: !prev[assetId],
    }));
  };

  const reports = outcome.inferenceReports ?? [];
  const matchedAssets = outcome.matchedAssets ?? [];
  const duplicateGroups = outcome.duplicateGroups ?? [];
  const plan = outcome.plan;
  const folderPath=(id:string|null|undefined)=>{
    const names:string[]=[],visited=new Set<string>();let current=id;
    while(current&&!visited.has(current)){visited.add(current);const folder=folders.find(f=>f.id===current);if(!folder){names.unshift('Pasta indisponível');break;}names.unshift(folder.name);current=folder.parent;}
    return ['Convés',...names].join(' / ');
  };

  if (
    reports.length === 0 &&
    matchedAssets.length === 0 &&
    duplicateGroups.length === 0 &&
    !plan &&
    outcome.toolData === undefined &&
    (!outcome.warnings || outcome.warnings.length === 0)
  ) {
    return null;
  }

  return (
    <div className="nautia-turn-cards">
      {/* Avisos reais de provedor LLM / fallback determinístico */}
      {outcome.warnings && outcome.warnings.length > 0 && (
        <div className="nautia-inline-alert is-warning" role="note">
          <strong>Observações técnicas</strong>
          <ul>
            {outcome.warnings.map((warn) => (
              <li key={warn}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Análise de Asset & Compatibilidade */}
      {reports.length > 0 && (
        <div className="nautia-compact-stack">
          {reports.map((report) => {
            const isCompat = isCompatibilityReport(report);
            const isExpanded = Boolean(expandedReportIds[report.assetId]);
            const softwareAnalyzed =
              report.verifiedMetadata.targetEngine ||
              report.verifiedMetadata.engine ||
              report.source;

            return (
              <article
                key={report.assetId}
                className={`nautia-compact-card status-${report.diagnostic.status}`}
              >
                <header className="nautia-compact-card__header">
                  <div className="nautia-compact-card__title">
                    <span className="nautia-eyebrow">
                      {isCompat ? 'COMPATIBILIDADE & ANÁLISE' : 'ANÁLISE DE ASSET'}
                    </span>
                    <strong>{report.assetName}</strong>
                  </div>
                  <div className="nautia-compact-card__badges">
                    <span className="nautia-format-badge">{report.identifiedFormat}</span>
                    <span className={`nautia-status-pill status-${report.diagnostic.status}`}>
                      {report.diagnostic.title}
                    </span>
                  </div>
                </header>

                <dl className="nautia-compact-kv">
                  <div>
                    <dt>{isCompat ? 'Software analisado' : 'Origem verificada'}</dt>
                    <dd>{softwareAnalyzed || '—'}</dd>
                  </div>
                  <div>
                    <dt>Resultado verificado</dt>
                    <dd>{report.diagnostic.summary}</dd>
                  </div>
                </dl>

                {report.warnings.length > 0 && (
                  <div className="nautia-compact-subsection">
                    <span className="nautia-mini-label">
                      {isCompat ? 'Avisos e limitações' : 'Avisos técnicos'}
                    </span>
                    <ul className="nautia-mini-list">
                      {report.warnings.map((warn) => (
                        <li key={warn}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.recommendedOperations.length > 0 && (
                  <div className="nautia-compact-subsection">
                    <span className="nautia-mini-label">Recomendações fundamentadas</span>
                    <ul className="nautia-mini-list">
                      {report.recommendedOperations.map((rec) => (
                        <li key={rec}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <footer className="nautia-compact-card__footer">
                  <button
                    type="button"
                    className="nautia-btn-chip"
                    aria-expanded={isExpanded}
                    onClick={() => toggleReport(report.assetId)}
                  >
                    {isExpanded ? 'Ocultar relatório técnico' : 'Ver relatório completo'}
                  </button>
                </footer>

                {isExpanded && (
                  <div className="nautia-compact-card__drawer">
                    <NautiaDiagnosticsPanel reports={[report]} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Assets encontrados (consultas) */}
      {matchedAssets.length > 0 && (
        <article className="nautia-compact-card nautia-asset-result">
          <header className="nautia-compact-card__header">
            <div className="nautia-compact-card__title">
              <span className="nautia-eyebrow">NA BIBLIOTECA</span>
              <strong>
                {matchedAssets.length}{' '}
                {matchedAssets.length === 1 ? 'asset localizado' : 'assets localizados'}
              </strong>
            </div>
          </header>
          <ul className="nautia-asset-result__list">
            {(showAllMatches ? matchedAssets : matchedAssets.slice(0, 6)).map((asset) => (
              <li key={asset.id} className="nautia-asset-result__item">
                <div className="nautia-asset-result__identity">
                  <AssetIcon asset={asset} className="nautia-asset-result__icon"/>
                  <strong>{asset.nome}</strong>
                  {asset.formato&&<span className="nautia-format-badge">{asset.formato.replace(/^\./,'').toUpperCase()}</span>}
                </div>
                <p className="nautia-asset-result__location"><FolderTagIconGlyph icon="folder"/><span>{folderPath(asset.folder)}</span></p>
                <details className="nautia-asset-result__path"><summary>Caminho do arquivo</summary><code>{asset.caminho||'Sem caminho registrado'}</code></details>
              </li>
            ))}
          </ul>
          {matchedAssets.length > 6 && (
            <footer className="nautia-compact-card__footer">
              <button
                type="button"
                className="nautia-btn-chip"
                onClick={() => setShowAllMatches((prev) => !prev)}
              >
                {showAllMatches
                  ? 'Mostrar menos'
                  : `Ver todos (${matchedAssets.length})`}
              </button>
            </footer>
          )}
        </article>
      )}

      {/* Duplicados detectados */}
      {duplicateGroups.length > 0 && (
        <article className="nautia-compact-card status-warning">
          <header className="nautia-compact-card__header">
            <div className="nautia-compact-card__title">
              <span className="nautia-eyebrow">VERIFICAÇÃO DE DUPLICADOS</span>
              <strong>{duplicateGroups.length} grupo(s) identificado(s)</strong>
            </div>
          </header>
          <div className="nautia-compact-stack">
            {duplicateGroups.map((group) => (
              <div key={group.reason} className="nautia-compact-subsection">
                <span className="nautia-mini-label">{group.reason}</span>
                <ul className="nautia-mini-list">
                  {group.assets.map((asset) => (
                    <li key={asset.id}>
                      <strong>{asset.nome}</strong> — {asset.caminho}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* Organização / Plano de Ação integrado à conversa */}
      {plan && (
        <article className="nautia-compact-card is-plan">
          <header className="nautia-compact-card__header">
            <div className="nautia-compact-card__title">
              <span className="nautia-eyebrow">PLANO DE ALTERAÇÃO</span>
              <strong>{plan.steps.length===1?(actionTitles[plan.steps[0].tool]??plan.objective):'Organizar recursos'}</strong>
            </div>
            <div className="nautia-compact-card__badges">
              {plan.affectedAssetsCount>0&&<span className="nautia-format-badge">{plan.affectedAssetsCount} {plan.affectedAssetsCount===1?'asset':'assets'}</span>}
              {activePendingPlanId===plan.id&&planResolution!=='confirmed'&&planResolution!=='cancelled'&&<span className="nautia-status-pill status-pending">Aguardando confirmação</span>}
              {planResolution === 'confirmed' && (
                <span className="nautia-status-pill status-ok">Confirmado</span>
              )}
              {planResolution === 'cancelled' && (
                <span className="nautia-status-pill status-warning">Cancelado</span>
              )}
            </div>
          </header>

          <dl className="nautia-compact-kv">
            <div>
              <dt>Pastas envolvidas</dt>
              <dd>
                {plan.affectedFolders.length > 0
                  ? plan.affectedFolders.map(id=>folders.find(f=>f.id===id)?.name??id).join(', ')
                  : 'Nenhuma pasta modificada'}
              </dd>
            </div>
            {plan.tagsAdded.length > 0 && (
              <div>
                <dt>Etiquetas previstas</dt>
                <dd className="nautia-plan-tags">{plan.tagsAdded.map(tag=><span key={tag}>{tag}</span>)}</dd>
              </div>
            )}
            {plan.tagsRemoved.length>0&&<div><dt>Etiquetas a remover</dt><dd className="nautia-plan-tags is-removal">{plan.tagsRemoved.map(tag=><span key={tag}>{tag}</span>)}</dd></div>}
          </dl>

          {plan.conflicts.length>0&&<div className="nautia-inline-alert is-warning" role="note"><strong>Conflitos identificados</strong><ul>{plan.conflicts.map(conflict=><li key={conflict}>{conflict}</li>)}</ul></div>}
          <ol className="nautia-compact-steps">
            {plan.steps.map((step) => (
              <li key={step.stepId}>{step.description.split(' Parâmetros:')[0]}</li>
            ))}
          </ol>
          {plan.warnings.length>0&&<aside className="nautia-plan-note"><FolderTagIconGlyph icon="shield"/><div><span>Antes de confirmar</span><ul className="nautia-plan-warnings">{plan.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></div></aside>}
          <details className="nautia-technical-data"><summary>Detalhes técnicos do plano</summary><pre>{JSON.stringify(plan.steps.map(step=>({acao:step.tool,parametros:step.params})),null,2)}</pre></details>

          {activePendingPlanId === plan.id &&
            planResolution !== 'confirmed' &&
            planResolution !== 'cancelled' && (
              <footer className="nautia-compact-card__footer is-actions">
                <button
                  type="button"
                  className="nautia-btn-chip"
                  onClick={() => onFocusActionPlan(plan)}
                >
                  Ajustar no painel
                </button>
                <button
                  type="button"
                  className="nautia-btn-ghost"
                  onClick={() => onCancelPlan(plan.id)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="nautia-btn-primary"
                  onClick={() =>
                    plan.requiresDestructiveConfirmation
                      ? onFocusActionPlan(plan)
                      : onConfirmPlan(plan)
                  }
                >
                  {plan.requiresDestructiveConfirmation ? 'Revisar e confirmar' : 'Confirmar alteração'}
                </button>
              </footer>
            )}
        </article>
      )}
      {outcome.toolData !== undefined && !outcome.inferenceReports && <NautiaToolResults data={outcome.toolData}/>}
    </div>
  );
};
