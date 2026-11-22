import React, {useState} from 'react';
import { OperationHistoryEntry } from '../../services/operationHistoryService';

export interface NautiaHistoryPanelProps {
  readonly entries: readonly OperationHistoryEntry[];
  readonly onClear?: () => void;
  readonly onUndo: (entryId: string) => void;
}

/**
 * Painel de Histórico Estruturado e Desfazer (Seção 8).
 */
export const NautiaHistoryPanel: React.FC<NautiaHistoryPanelProps> = ({
  entries,
  onUndo,onClear,
}) => { const [confirm,setConfirm]=useState(false);return (
  <section
    className="nautia-history-panel"
    aria-label="Histórico de atividades do Convés"
  >
    <header className="nautia-results-header">
      <div>
        <span className="nautia-eyebrow">HISTÓRICO &amp; AUDITORIA</span>
        <h3 className="nautia-subsection-title">
          Operações registradas ({entries.length})
        </h3>
      </div>
      {onClear&&<button type="button" className="nautia-btn-ghost" disabled={!entries.length} onClick={()=>setConfirm(true)}>Limpar histórico</button>}
    </header>
    {confirm&&<div className="nautia-inline-alert" role="alertdialog" aria-label="Confirmar limpeza do histórico"><p>Tem certeza de que deseja limpar o histórico de atividades do Convés? Os registros de atividades serão removidos, mas seus assets e pastas permanecerão intactos.</p><button type="button" className="nautia-btn-ghost" onClick={()=>setConfirm(false)}>Cancelar</button><button type="button" className="nautia-btn-danger" onClick={()=>{onClear?.();setConfirm(false);}}>Limpar histórico</button></div>}

    {entries.length === 0 ? (
      <p className="nautia-empty-hint">
        Nenhuma atividade registrada.
      </p>
    ) : (
      <ul className="nautia-history-list">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`nautia-history-item status-${entry.status}`}
          >
            <div className="nautia-history-item__main">
              <div>
                <strong>{entry.summary}</strong>
                <p className="nautia-muted-note">
                  {new Date(entry.timestamp).toLocaleString('pt-BR')} · origem:{' '}
                  {entry.source} · {entry.affectedResources.length} recurso(s)
                </p>
                <p className="nautia-history-item__result">{entry.resultSummary}</p>
              </div>

              <div className="nautia-history-item__actions">
                <span className="nautia-format-badge">{entry.status}</span>
                {entry.reversible && entry.status === 'executed' && (
                  <button
                    type="button"
                    className="nautia-btn-accent"
                    onClick={() => onUndo(entry.id)}
                  >
                    Desfazer
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);};
