import type {NautiaIntent} from '../../ai/Nautia_llm/runtime/foundation.ts';

/** Context for the existing conversation, never a visible answer or a tool authorization. */
export function nautiaTemporalContext(prompt:string,intent:NautiaIntent,isSocial:boolean,now=new Date()):string {
  if(isSocial)return '';
  const text=prompt.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const asksTime=/\b(?:que horas|quantas horas|qual (?:e )?(?:o )?horario|hora (?:atual|agora)|what time|current time)\b/.test(text);
  const asksDate=/\b(?:qual (?:e )?(?:a )?data|que dia|qual dia|em que dia|data (?:de (?:hoje|amanha|ontem)|atual)|dia (?:da semana|do mes)|em que (?:ano|mes)|qual (?:e )?(?:o )?(?:ano|mes)|what (?:is (?:the )?)?date|what day|current date|today.s date)\b/.test(text);
  // Operational prompts retain their previous date reference (relative date filters, planning).
  const operational=!['general_chat','clarification_needed'].includes(intent.intent);
  if(!asksTime&&!asksDate&&!operational)return '';
  const date=new Intl.DateTimeFormat('sv-SE').format(now);
  const time=asksTime?new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false}).format(now):null;
  const zone=asksTime?new Intl.DateTimeFormat().resolvedOptions().timeZone:null;
  return [`Referência temporal interna — Data local: ${date}.`,...(time?[`Horário local: ${time} (${zone}).`]:[]),'Use esta referência somente se necessária ao pedido atual. Não a anuncie em saudações ou como informação adicional sem relevância.',...(!operational?['Responda somente ao que foi perguntado sobre a data ou horário. Não acrescente ofertas de organizar assets, perguntas sobre outra tarefa ou uma nova apresentação.']:[])].join('\n');
}
