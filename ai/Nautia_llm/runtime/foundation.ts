import config from '../config/model.config.json' with { type: 'json' };
import schema from '../schemas/intent.schema.json' with { type: 'json' };
import prompts from './promptBundle.json' with { type: 'json' };

export const nautiaConfig = Object.freeze(config);
export const intentSchema = schema;
export interface MemoryTurn {role:'user'|'nautia';text:string;id?:string;requestId?:string;replyTo?:string;status?:string;planResolution?:string;outcome?:{toolData?:unknown;plan?:unknown};}
export function foundationPrompt(identity: string, conversation: string, persona=''): string { return [identity.trim(),conversation.trim(),persona.trim()].filter(Boolean).join('\n\n').replace(/\r\n/g,'\n'); }
export const NAUTIA_SYSTEM_PROMPT=foundationPrompt(prompts.identity,prompts.conversation,prompts.persona);
export const NAUTIA_INTENT_PROMPT=`${prompts.identity.trim()}\n\n${prompts.intent}`;
export function renderModelfile(identity: string, conversation: string, persona=prompts.persona): string {
  return `# Gerado a partir de config/ e prompts/; sem pesos neste módulo.\nFROM ${config.baseModel}\nPARAMETER temperature ${config.temperature}\nPARAMETER num_ctx ${config.numCtx}\nSYSTEM """\n${foundationPrompt(identity, conversation,persona)}\n"""\n`;
}

/** Extractive memory: quotes, not inferred facts. The original thread remains persisted. */
export function buildConversationMemory(turns: readonly MemoryTurn[], minimize: (value: unknown) => unknown) {
  const groups:MemoryTurn[][]=[];
  for(const turn of turns){if(turn.role==='user')groups.push([turn]);else if(groups.length)groups[groups.length-1].push(turn);}
  // Incomplete, cancelled and failed exchanges remain in the visual history, not in the model's actionable memory.
  const complete=groups.filter(group=>group.some(t=>t.role==='nautia'&&!['cancelled','error','unavailable'].includes(t.status??''))&&!group.some(t=>t.status==='cancelled'));
  const recent:MemoryTurn[][]=[];let size=0;
  for(let i=complete.length-1;i>=0;i--){if(size+complete[i].length>config.recentTurns)break;recent.unshift(complete[i]);size+=complete[i].length;}
  const older=complete.slice(0,complete.length-recent.length);
  const excerpts=older.slice(-4).map(group=>({kind:'Usuário disse:',text:group[0].text.replace(/\s+/g,' ').slice(0,220),historical:true}));
  while(excerpts.length&&JSON.stringify(excerpts).length>config.summaryCharBudget)excerpts.shift();
  const summary=excerpts.length?JSON.stringify(excerpts):'';
  let remaining=config.historyCharBudget;
  const messages: {role:'user'|'assistant';content:string}[]=[];
  const references:{requestId?:string;userMessageId?:string;planState?:string;data:unknown}[]=[];
  for(let i=recent.length-1;i>=0;i--){
    const exchange=recent[i].filter(t=>!['cancelled','error','unavailable'].includes(t.status??''));
    const entries=exchange.map(turn=>({role:turn.role==='user'?'user' as const:'assistant' as const,content:turn.text.slice(0,1800)+(turn.outcome?.plan?`\n[Plano histórico: ${turn.planResolution??'pendente'}. Não é autorização para este pedido.]`:'')}));
    const cost=entries.reduce((n,m)=>n+m.content.length,0);if(cost>remaining)break;
    remaining-=cost;messages.unshift(...entries);
    for(const turn of exchange)if(turn.outcome?.toolData!==undefined&&!turn.outcome.plan){
      const data=JSON.stringify(minimize(turn.outcome.toolData));
      if(data&&data.length<=1600)references.unshift({requestId:turn.requestId,userMessageId:exchange[0].id,planState:turn.planResolution,data:JSON.parse(data)});
    }
  }
  return {summary,messages,references:references.slice(-4)};
}

export interface NautiaIntent {
  intent: string; entities: Record<string,string|null>; referencesPrior: boolean; requiresClarification: boolean; proposedTool: string|null;
}
export function validateIntent(value: unknown): NautiaIntent {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('Intenção deve ser um objeto.');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join()!==[...schema.required].sort().join() || !schema.properties.intent.enum.includes(String(v.intent)) || typeof v.referencesPrior!=='boolean' || typeof v.requiresClarification!=='boolean' || !schema.properties.proposedTool.enum.includes(v.proposedTool as string|null))throw new Error('Schema de intenção inválido.');
  if(!v.entities || typeof v.entities!=='object' || Array.isArray(v.entities))throw new Error('Entidades inválidas.');
  const entities=v.entities as Record<string,unknown>;
  if(schema.properties.entities.required.some(k=>!(k in entities)) || Object.keys(entities).some(k=>!(k in schema.properties.entities.properties)) || Object.values(entities).some(x=>x!==null&&(typeof x!=='string'||x.length>500)))throw new Error('Entidades fora do schema.');
  if(v.requiresClarification && (v.intent!=='clarification_needed'||v.proposedTool!==null))throw new Error('Pedido ambíguo não pode sugerir execução.');
  return value as NautiaIntent;
}
