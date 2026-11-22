import React from 'react';
import { StructuredInferenceReport } from '../../services/inferenceService';

export interface NautiaDiagnosticsPanelProps {
  readonly reports: readonly StructuredInferenceReport[];
  readonly onClose?: () => void;
}

/**
 * Exibe os diagnósticos estruturados produzidos pelo Motor de Inferência,
 * preservando transparência total sobre regras aplicadas, avisos e evidências.
 */
export const NautiaDiagnosticsPanel: React.FC<NautiaDiagnosticsPanelProps> = ({
  reports,
  onClose,
}) => {
  if (reports.length === 0) return null;

  return (
    <section
      className="nautia-diagnostics-panel"
      aria-label="Diagnósticos do Motor de Inferência"
    >
      <header className="nautia-results-header">
        <div>
          <span className="nautia-eyebrow">
            MOTOR DE INFERÊNCIA SIA · RESULTADOS ESTRUTURADOS
          </span>
          <h3 className="nautia-subsection-title">
            {reports.length} {reports.length === 1 ? 'asset analisado' : 'assets analisados'}
          </h3>
        </div>
        {onClose && (
          <button type="button" className="nautia-btn-ghost" onClick={onClose}>
            Fechar diagnósticos
          </button>
        )}
      </header>

      <div className="nautia-diagnostics-list">
        {reports.map((report) => (
          <article
            key={report.assetId}
            className={`nautia-diagnostic-card status-${report.diagnostic.status}`}
          >
            <header className="nautia-diagnostic-card__header">
              <div>
                <strong>{report.assetName}</strong>
                <span className="nautia-muted-note">
                  {' '}
                  · {report.identifiedFormat} · origem: {report.source}
                </span>
              </div>
              <span className={`nautia-status-pill status-${report.diagnostic.status}`}>
                {report.diagnostic.title}
              </span>
            </header>

            <p className="nautia-diagnostic-summary">{report.diagnostic.summary}</p>
            {report.analyzedAt && <p className="nautia-muted-note">Análise: {report.analyzedAt} · Regras: {report.rulesetVersion} · Importação testada: não</p>}
            {report.collectedData && <div><span className="nautia-mini-label">Dados coletados no recurso</span><ul className="nautia-mini-list">{Object.entries(report.collectedData).map(([key, value]) => <li key={key}>{key}: {value}</li>)}</ul></div>}
            {!!report.errors?.length && <div role="alert"><strong>Erros</strong><ul>{report.errors.map(e => <li key={e}>{e}</li>)}</ul></div>}
            {!!report.notPerformed?.length && <div><strong>Verificações não realizadas</strong><ul>{report.notPerformed.map(e => <li key={e}>{e}</li>)}</ul></div>}

            <div className="nautia-diagnostic-grid">
              <div>
                <span className="nautia-mini-label">Metadados declarados no cadastro</span>
                <ul className="nautia-mini-list">
                  {Object.entries(report.verifiedMetadata).map(([key, value]) => (
                    <li key={key}>
                      <code>{key}</code>: {value}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="nautia-mini-label">Regras aplicadas &amp; Evidências</span>
                <ul className="nautia-mini-list">
                  {report.appliedRules.map((rule) => (
                    <li key={rule}>
                      <code>{rule}</code>
                    </li>
                  ))}
                  {report.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {report.recommendedOperations.length > 0 && (
              <div className="nautia-diagnostic-recs">
                <span className="nautia-mini-label">Operações recomendadas</span>
                <ul className="nautia-mini-list">
                  {report.recommendedOperations.map((rec) => (
                    <li key={rec}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            {report.warnings.length > 0 && (
              <div className="nautia-diagnostic-warnings">
                <span className="nautia-mini-label">Avisos &amp; Limitações</span>
                <ul className="nautia-mini-list">
                  {report.warnings.map((warn) => (
                    <li key={warn}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};
