import type {ChatTurn,NautiaConversationRecord} from './nautiaConversationStore.ts';
import type {NautiaRequestIdentity} from './nautiaRequestSession.ts';
import type {NautiaActionPlan} from './nautiaOrchestratorService.ts';

export function appendNautiaReply(conversation:NautiaConversationRecord,identity:NautiaRequestIdentity,reply:ChatTurn):readonly ChatTurn[]{
 if(conversation.id!==identity.conversationId||!conversation.turns.some(t=>t.role==='user'&&t.id===identity.userMessageId&&t.requestId===identity.requestId))return conversation.turns;
 if(reply.id!==identity.assistantMessageId||reply.replyTo!==identity.userMessageId||reply.requestId!==identity.requestId||conversation.turns.some(t=>t.id===reply.id))return conversation.turns;
 return [...conversation.turns,reply];
}
export function canReviewNautiaPlan(plan:NautiaActionPlan,conversation:NautiaConversationRecord):boolean {
 const origin=plan.origin;if(!origin||origin.conversationId!==conversation.id)return false;
 const user=[...conversation.turns].reverse().find(t=>t.role==='user');
 const owner=conversation.turns.find(t=>t.outcome?.plan?.id===plan.id);
 return user?.id===origin.userMessageId&&user.requestId===origin.requestId&&owner?.requestId===origin.requestId&&owner.replyTo===origin.userMessageId&&owner.planResolution==='pending';
}
