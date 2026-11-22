/**
 * Cliente LLM configurável da Nautia (Etapa 02 - Seção 6 e 11).
 * Responsável apenas por traduzir solicitações em linguagem natural para
 * chamadas de ferramentas estruturadas e explicações fundamentadas.
 * Quando nenhum provedor está configurado (`provider: 'none'`), não realiza
 * chamadas externas nem simula respostas de IA.
 */

export type LlmProviderType = 'none' | 'ollama' | 'openai-compatible';

export interface LlmClientConfig {
  readonly provider: LlmProviderType;
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly verifiedAt?: number;
}

export const DEFAULT_LLM_CONFIG: LlmClientConfig = Object.freeze({
  provider: 'none',
  endpoint: 'http://127.0.0.1:11434',
  model: '',
});

export interface AuthorizedToolCall {
  readonly tool:
    | 'listAssets'
    | 'searchAssets'
    | 'createFolder'
    | 'renameFolder'
    | 'createTag'
    | 'assignTags'
    | 'organizeRecords'
    | 'queryDiagnostics'
    | 'moveToTrash'
    | 'restoreFromTrash';
  readonly args: Record<string, unknown>;
}

export interface LlmPlannerOutput {
  readonly usedLlm: boolean;
  readonly objective: string;
  readonly explanation: string;
  readonly toolCalls: readonly AuthorizedToolCall[];
  readonly warning?: string;
}

const ALLOWED_TOOLS = new Set<AuthorizedToolCall['tool']>([
  'listAssets',
  'searchAssets',
  'createFolder',
  'renameFolder',
  'createTag',
  'assignTags',
  'organizeRecords',
  'queryDiagnostics',
  'moveToTrash',
  'restoreFromTrash',
]);

const SYSTEM_PROMPT = `Você é a Nautia, copilota do OCSIS RocketBox.
Converta a solicitação do usuário em JSON estrito no formato:
{"objective":"...", "explanation":"...", "toolCalls":[{"tool":"...", "args":{...}}]}
Ferramentas autorizadas: listAssets, searchAssets, createFolder, renameFolder, createTag, assignTags, organizeRecords, queryDiagnostics, moveToTrash, restoreFromTrash.
Nunca use exclusão permanente nem caminhos fora dos registros da biblioteca.`;

export function validateToolCalls(rawCalls: unknown): AuthorizedToolCall[] {
  if (!Array.isArray(rawCalls)) return [];
  const valid: AuthorizedToolCall[] = [];
  for (const item of rawCalls) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (
      typeof record.tool === 'string' &&
      ALLOWED_TOOLS.has(record.tool as AuthorizedToolCall['tool'])
    ) {
      valid.push({
        tool: record.tool as AuthorizedToolCall['tool'],
        args:
          record.args && typeof record.args === 'object' && !Array.isArray(record.args)
            ? (record.args as Record<string, unknown>)
            : {},
      });
    }
  }
  return valid;
}

export async function planWithConfiguredLlm(
  prompt: string,
  contextSummary: string,
  config: LlmClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<LlmPlannerOutput | null> {
  if (config.provider === 'none') {
    return null;
  }

  const endpoint = config.endpoint.trim().replace(/\/+$/, '');
  if (!endpoint || !config.model.trim()) {
    return {
      usedLlm: false,
      objective: prompt,
      explanation: 'Provedor LLM incompleto; usando interpretação determinística local.',
      toolCalls: [],
      warning: 'Endpoint ou modelo LLM não configurado.',
    };
  }

  try {
    const userMessage = `Contexto da biblioteca:\n${contextSummary}\n\nSolicitação do usuário:\n${prompt}`;
    let contentText = '';

    if (config.provider === 'ollama') {
      const response = await fetchImpl(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        message?: { content?: string };
      };
      contentText = data.message?.content ?? '';
    } else {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey?.trim()) {
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
      }
      const response = await fetchImpl(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      contentText = data.choices?.[0]?.message?.content ?? '';
    }

    const parsed = JSON.parse(contentText) as {
      objective?: string;
      explanation?: string;
      toolCalls?: unknown;
    };

    const toolCalls = validateToolCalls(parsed.toolCalls);
    return {
      usedLlm: true,
      objective:
        typeof parsed.objective === 'string' && parsed.objective.trim()
          ? parsed.objective
          : prompt,
      explanation:
        typeof parsed.explanation === 'string' ? parsed.explanation : '',
      toolCalls,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na conexão';
    return {
      usedLlm: false,
      objective: prompt,
      explanation:
        'Não foi possível contatar o provedor LLM configurado; recorrendo ao interpretador determinístico local.',
      toolCalls: [],
      warning: `Provedor LLM indisponível (${message}).`,
    };
  }
}
