import React, { useEffect, useState } from 'react';
import { DeckFolder } from '../../services/deckFilterService';
import { NautiaActionPlan as ActionPlanModel } from '../../services/nautiaOrchestratorService';

export interface NautiaActionPlanProps {
  readonly plan: ActionPlanModel | null;
  readonly folders: readonly DeckFolder[];
  readonly onConfirm: (adjustedPlan: ActionPlanModel) => void;
  readonly onCancel: () => void;
}

/**
 * Componente "Nautia Action Plan" (Seção 7).
 * Exibe prévia completa antes de qualquer modificação de registros,
 * permitindo ajustar destino/etiquetas quando suportado, confirmar ou cancelar.
 */
export const NautiaActionPlan: React.FC<NautiaActionPlanProps> = ({
  plan,
  folders,
  onConfirm,
  onCancel,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [editedTags, setEditedTags] = useState<string>('');
  const [destructiveAccepted, setDestructiveAccepted] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setSelectedFolderId(plan.adjustableTargetFolderId ?? '');
    setEditedTags((plan.adjustableTagLabels ?? []).join(', '));
    setDestructiveAccepted(false);
  }, [plan]);

  if (!plan) return null;

  const activeFolders = folders.filter((f) => !f.deleted);
  const canAdjustFolder = plan.adjustableTargetFolderId !== undefined;
  const canAdjustTags = plan.adjustableTagLabels !== undefined;

  const handleConfirm = () => {
    let updatedSteps = [...plan.steps];
    let updatedFolders = [...plan.affectedFolders];
    let updatedTagsAdded = [...plan.tagsAdded];

    if (canAdjustFolder && selectedFolderId) {
      const targetFolder = activeFolders.find((f) => f.id === selectedFolderId);
      updatedSteps = updatedSteps
        .filter((s) => s.tool !== 'createFolder')
        .map((step) =>
          step.tool === 'organizeRecords'
            ? {
                ...step,
                description: `Associar ${plan.affectedAssetsCount} asset(s) à pasta "${
                  targetFolder?.name ?? selectedFolderId
                }".`,
                params: {
                  ...step.params,
                  targetFolderId: selectedFolderId,
                },
              }
            : step,
        );
      if (targetFolder) {
        updatedFolders = [targetFolder.name];
      }
    }

    if (canAdjustTags) {
      const parsedLabels = editedTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (parsedLabels.length > 0) {
        updatedSteps = updatedSteps.map((step) =>
          step.tool === 'assignTags'
            ? {
                ...step,
                description: `Aplicar etiquetas (${parsedLabels.join(', ')}) ao lote selecionado.`,
                params: {
                  ...step.params,
                  labels: parsedLabels,
                },
              }
            : step,
        );
        updatedTagsAdded = parsedLabels;
      }
    }

    onConfirm({
      ...plan,
      steps: updatedSteps,
      affectedFolders: updatedFolders,
      tagsAdded: updatedTagsAdded,
    });
  };

  return (
    <section
      className="nautia-action-plan"
      role="region"
      aria-label="Nautia Action Plan"
    >
      <header className="nautia-action-plan__header">
        <div>
          <span className="nautia-eyebrow">NAUTIA ACTION PLAN · CONFIRMAÇÃO</span>
          <h3 className="nautia-section-title">{plan.objective}</h3>
        </div>
        <span className="nautia-format-badge">
          {plan.affectedAssetsCount} asset(s)
        </span>
      </header>

      <div className="nautia-action-plan__meta">
        <div>
          <strong>Pastas envolvidas:</strong>{' '}
          <span>
            {plan.affectedFolders.length > 0
              ? plan.affectedFolders.map(id=>folders.find(f=>f.id===id)?.name??id).join(', ')
              : 'Nenhuma pasta modificada'}
          </span>
        </div>
        <div>
          <strong>Etiquetas adicionadas:</strong>{' '}
          <span>
            {plan.tagsAdded.length > 0 ? plan.tagsAdded.join(', ') : 'Nenhuma'}
          </span>
        </div>
        <div>
          <strong>Etiquetas removidas:</strong>{' '}
          <span>
            {plan.tagsRemoved.length > 0 ? plan.tagsRemoved.join(', ') : 'Nenhuma'}
          </span>
        </div>
      </div>

      <ol className="nautia-action-plan__steps">
        {plan.steps.map((step) => (
          <li key={step.stepId}>
            {step.description.split(' Parâmetros:')[0]}<details className="nautia-technical-data"><summary>Parâmetros técnicos</summary><pre>{JSON.stringify(step.params,null,2)}</pre></details>
          </li>
        ))}
      </ol>

      {canAdjustFolder && activeFolders.length > 0 && (
        <label className="nautia-field">
          <span>Ajustar pasta de destino</span>
          <select
            value={selectedFolderId}
            onChange={(event) => setSelectedFolderId(event.target.value)}
          >
            {activeFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {canAdjustTags && (
        <label className="nautia-field">
          <span>Ajustar etiquetas sugeridas (separadas por vírgula)</span>
          <input
            type="text"
            value={editedTags}
            onChange={(event) => setEditedTags(event.target.value)}
          />
        </label>
      )}

      {plan.conflicts.length > 0 && (
        <div className="nautia-plan-alerts is-conflict">
          <strong>Conflitos detectados:</strong>
          <ul>
            {plan.conflicts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.warnings.length > 0 && (
        <div className="nautia-plan-alerts is-warning">
          <strong>Avisos:</strong>
          <ul>
            {plan.warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.requiresDestructiveConfirmation && (
        <label className="nautia-asset-select">
          <input
            type="checkbox"
            checked={destructiveAccepted}
            onChange={(event) => setDestructiveAccepted(event.target.checked)}
          />
          <span>Confirmo que desejo mover estes registros para a lixeira.</span>
        </label>
      )}

      <footer className="nautia-action-plan__footer">
        <button type="button" className="nautia-btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="nautia-btn-primary"
          disabled={plan.requiresDestructiveConfirmation && !destructiveAccepted}
          onClick={handleConfirm}
        >
          Confirmar e executar plano
        </button>
      </footer>
    </section>
  );
};
