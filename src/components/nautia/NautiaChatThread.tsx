import React from 'react';
import portrait from '../../assets/branding/nautia-portrait.png';
import {
  formatTurnTime,
  groupConversationTurns,
  ChatTurn,
} from '../../services/nautiaConversationStore';
import { NautiaActionPlan as ActionPlanModel } from '../../services/nautiaOrchestratorService';
import { NautiaTurnCards } from './NautiaTurnCards';
import {NautiaMarkdown} from './NautiaMarkdown';
import type {DeckFolder} from '../../services/deckFilterService';

export interface NautiaChatThreadProps {
  readonly turns: readonly ChatTurn[];
  readonly folders?:readonly DeckFolder[];
  readonly isProcessing: boolean;
  readonly streamingText?: string;
  readonly operationStatus?:string;
  readonly activePendingPlanId: string | null;
  readonly onConfirmPlan: (plan: ActionPlanModel) => void;
  readonly onCancelPlan: (planId: string) => void;
  readonly onFocusActionPlan: (plan: ActionPlanModel) => void;
  readonly onRetryPrompt: (promptText: string) => void;
}

/**
 * Thread conversacional com agrupamento de balões por emissor, estados de processamento/erro e cartões estruturados.
 */
export const NautiaChatThread: React.FC<NautiaChatThreadProps> = ({
  turns,
  folders,
  isProcessing,
  streamingText='',
  operationStatus='Analisando sua solicitação…',
  activePendingPlanId,
  onConfirmPlan,
  onCancelPlan,
  onFocusActionPlan,
  onRetryPrompt,
}) => {
  const grouped = groupConversationTurns(turns);

  return (
    <div className="nautia-thread" role="list" aria-label="Mensagens da conversa">
      {grouped.map(({ turn, isGroupStart, isGroupEnd }) => {
        const isUser = turn.role === 'user';
        const timeLabel = formatTurnTime(turn.createdAt);
        const isError = turn.status === 'error' || turn.status === 'unavailable';

        return (
          <div
            key={turn.id}
            role="listitem"
            className={`nautia-msg-row ${isUser ? 'is-user' : 'is-nautia'} ${
              isGroupStart ? 'is-group-start' : 'is-group-cont'
            } ${isGroupEnd ? 'is-group-end' : ''}`}
          >
            {!isUser && (
              <div className="nautia-msg-avatar-col" aria-hidden="true">
                {isGroupStart ? (
                  <img
                    src={portrait}
                    alt=""
                    className="nautia-msg-avatar"
                  />
                ) : (
                  <span className="nautia-msg-avatar-spacer" />
                )}
              </div>
            )}

            <div className="nautia-msg-stack">
              {isGroupStart && (
                <div className="nautia-msg-meta-top">
                  <span className="nautia-msg-sender">
                    {isUser ? 'Você' : 'NautIA'}
                  </span>
                  {!isUser && turn.status === 'error' && (
                    <span className="nautia-msg-state is-error">Erro</span>
                  )}
                  {!isUser && turn.status === 'unavailable' && (
                    <span className="nautia-msg-state is-unavailable">Serviço indisponível</span>
                  )}
                  {!isUser && turn.status === 'cancelled' && <span className="nautia-msg-state">Cancelada</span>}
                  {!isUser && !isError && turn.sourceMode === 'llm' && (
                    <span className="nautia-msg-state is-llm">NautIA · local</span>
                  )}
                </div>
              )}

              <div
                className={`nautia-chat-bubble role-${turn.role} ${
                  isError ? 'is-error-bubble' : ''
                } ${!isUser&&(turn.outcome?.plan||(turn.outcome?.matchedAssets?.length??0)>0)?'is-asset-operation':''}`}
              >
                {isUser?<p className="nautia-chat-bubble__text">{turn.text}</p>:<NautiaMarkdown text={turn.text}/>}

                {(isError || turn.status==='cancelled') && turn.retryPrompt && (
                  <div className="nautia-bubble-retry" role="alert">
                    <button
                      type="button"
                      className="nautia-btn-chip"
                      disabled={isProcessing}
                      onClick={() => onRetryPrompt(turn.retryPrompt!)}
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}

                {!isUser && turn.outcome && (
                  <NautiaTurnCards
                    outcome={turn.outcome}
                    folders={folders}
                    activePendingPlanId={activePendingPlanId}
                    planResolution={turn.planResolution}
                    onConfirmPlan={onConfirmPlan}
                    onCancelPlan={onCancelPlan}
                    onFocusActionPlan={onFocusActionPlan}
                  />
                )}
              </div>

              {isGroupEnd && timeLabel && (
                <span className="nautia-msg-time">{timeLabel}</span>
              )}
            </div>
          </div>
        );
      })}

      {isProcessing && (
        <div
          className="nautia-msg-row is-nautia is-group-start is-group-end is-processing"
          role="status"
          aria-live="polite"
        >
          <div className="nautia-msg-avatar-col" aria-hidden="true">
            <img src={portrait} alt="" className="nautia-msg-avatar" />
          </div>
          <div className="nautia-msg-stack">
            <div className="nautia-msg-meta-top">
              <span className="nautia-msg-sender">NautIA</span>
              <span className="nautia-msg-state">{streamingText?'Respondendo...':'Pensando...'}</span>
            </div>
            <div className={`nautia-chat-bubble role-nautia ${streamingText?'':'is-typing'}`}>
              {streamingText?<NautiaMarkdown text={streamingText}/>:<><span className="nautia-typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="sr-only">{operationStatus}</span></>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
