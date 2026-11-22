import {hasNautiaConversationStarted} from '../../services/nautiaLanguageContext';
import {nautiaFailureCause,nautiaFailureMessage} from '../../services/nautiaFailure';
import {NautiaAvatar} from './NautiaAvatar';
import './nautiaConversation.css';
import {createNautiaRequestSession} from '../../services/nautiaRequestSession';
import {appendNautiaReply,canReviewNautiaPlan} from '../../services/nautiaConversationFlow';
import {rocketBoxAnswer} from '../../services/rocketBoxKnowledge';
import { matchNautiaQuickReply } from '../../services/nautiaQuickReplies';
import {
  clearNautiaPerformanceLogs,
  createNautiaPerformanceEntry,
  formatPerfDuration,
  loadNautiaPerformanceLogs,
  recordNautiaPerformance,
  type NautiaPerformanceEntry,
} from '../../services/nautiaPerformance';
import {NautiaAvatarDiagnostics} from './NautiaAvatarDiagnostics';
import {createNautiaAvatarState,type NautiaAvatarState} from '../../services/nautiaAvatarState';
import {thoughtCategoryForTool,type NautiaThoughtCategory} from '../../services/nautiaThoughts';
import type { NautiaContext } from '../../services/nautiaToolSystem';
import { converseWithOllama, loadLocalLlmConfig } from '../../services/ollamaConversation';
import { localEndpoint } from '../../services/ollamaClient';
import { connectNautia } from '../../services/nautiaConnectionService';
import { nautiaConfig } from '../../services/nautiaFoundation';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DeckAsset, DeckFolder, FolderTagIconId } from '../../services/deckFilterService';
import { LibraryOperationsService } from '../../services/libraryOperationsService';
import {
  DEFAULT_LLM_CONFIG,
  LlmClientConfig,
  LlmProviderType,
} from '../../services/llmClient';
import {
  ChatTurn,
  createEmptyConversation,
  deriveConversationTitle,
  loadNautiaConversations,
  makeConversationId,
  NautiaConversationRecord,
  resolveAssistantServiceStatus,
  saveNautiaConversations,
  restoreActiveConversation,
  rememberActiveConversation,
  deleteNautiaConversations,
} from '../../services/nautiaConversationStore';
import {
  executeApprovedActionPlan,
  NautiaActionPlan as ActionPlanModel,
  orchestrateNaturalLanguageRequest,
} from '../../services/nautiaOrchestratorService';
import {
  OperationHistoryEntry,
  OperationHistoryService,
} from '../../services/operationHistoryService';
import { FolderTagIconGlyph } from '../deck/FolderTagIconGlyph';
import { NautiaActionPlan } from './NautiaActionPlan';
import { NautiaChatThread } from './NautiaChatThread';
import { NautiaChibiIcon } from './NautiaChibiIcon';
import { NautiaHistoryPanel } from './NautiaHistoryPanel';
import { NautiaWelcomeScreen } from './NautiaWelcomeScreen';

export interface NautiaModuleViewProps {
  readonly context?: NautiaContext;
  readonly currentFolder: string;
  readonly folders: readonly DeckFolder[];
  readonly selectedAssets: readonly DeckAsset[];
  readonly showAvatar: boolean;
  readonly operations: LibraryOperationsService;
  readonly history: OperationHistoryService;
  readonly historyEntries: readonly OperationHistoryEntry[];
  readonly onLibraryMutated: () => void;
  readonly onNotify: (message: string) => void;
}

type NautiaModeTab = 'conversa' | 'analise' | 'organizacao' | 'diagnostico';

const STAGE_STATE_LABELS: Readonly<Record<NautiaAvatarState, string>> = {
  idle: 'Pronta',
  thinking: 'Pensando...',
  speaking: 'Explicando...',
  uncertainty: 'Em dúvida',
  drowsy: 'Sonolenta',
  sleeping: 'Standby',
};

const MODE_TABS: readonly {
  readonly id: NautiaModeTab;
  readonly label: string;
  readonly icon: FolderTagIconId;
  readonly helper: string;
}[] = [
  {
    id: 'conversa',
    label: 'Conversa',
    icon: 'sparkles',
    helper: 'Chat contínuo com a NautIA',
  },
  {
    id: 'analise',
    label: 'Análise de Asset',
    icon: 'cube',
    helper: 'Foco em formatos, metadados e inferência',
  },
  {
    id: 'organizacao',
    label: 'Organização',
    icon: 'layers',
    helper: 'Planos de pastas e etiquetas com aprovação',
  },
  {
    id: 'diagnostico',
    label: 'Diagnóstico',
    icon: 'shield',
    helper: 'Duplicados e compatibilidade com engines',
  },
];

const SIDE_QUICK_ACTIONS: readonly {
  title: string;
  subtitle: string;
  icon: FolderTagIconId;
  prompt: string;
  requiresInput?:boolean;
}[] = [
  {
    title: 'Analisar Asset',
    subtitle: 'Extrai informações, formato e metadados.',
    icon: 'cube',
    prompt: 'Analise tecnicamente os assets selecionados ou listados na biblioteca.',
  },
  {
    title: 'Organizar Biblioteca',
    subtitle: 'Prepara uma pasta virtual para revisão.',
    icon: 'layers',
    prompt: 'Crie uma pasta chamada Personagens 3D.',
  },
  {
    title: 'Criar Etiquetas',
    subtitle: 'Escolha o nome e revise a aplicação à seleção.',
    icon: 'tag',
    prompt: 'Adicione a etiqueta ',
    requiresInput:true,
  },
  {
    title: 'Verificar Compatibilidade',
    subtitle: 'Analisa compatibilidade com engines.',
    icon: 'shield',
    prompt: 'Quais assets possuem problemas de compatibilidade com Unreal?',
  },
];

function upsertConversationList(
  list: readonly NautiaConversationRecord[],
  updated: NautiaConversationRecord,
): NautiaConversationRecord[] {
  const remaining = list.filter((item) => item.id !== updated.id);
  if (updated.turns.length === 0) {
    return [...remaining];
  }
  return [updated, ...remaining];
}

/**
 * Menu Completo da NautIA — Interface Conversacional 2.0.
 * Separa boas-vindas, conversa em balões agrupados, estados de processamento/erro,
 * cartões técnicos integrados e histórico persistido sem duplicar mensagens entre abas.
 */
export const NautiaModuleView: React.FC<NautiaModuleViewProps> = ({
  context,
  folders,
  selectedAssets,
  currentFolder,
  showAvatar,
  operations,
  history,
  historyEntries,
  onLibraryMutated,
  onNotify,
}) => {
  const [savedConversations, setSavedConversations] = useState<NautiaConversationRecord[]>(() =>
    loadNautiaConversations(),
  );
  const [activeConversation, setActiveConversation] = useState<NautiaConversationRecord>(() =>
    restoreActiveConversation(savedConversations,localStorage),
  );
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [operationStatus,setOperationStatus]=useState('Interpretando a solicitação…');
  const [avatarSleepSeconds,setAvatarSleepSeconds]=useState(()=>{try{const value=Number(localStorage.getItem('ocsis.nautia.avatar.sleepSeconds'));return Number.isFinite(value)&&value>=10&&value<=3600?value:60;}catch{return 60;}});
  const [avatarMinimumMs,setAvatarMinimumMs]=useState(()=>{try{const raw=localStorage.getItem('ocsis.nautia.avatar.minimumSpeakingMs'),value=raw===null?450:Number(raw);return Number.isFinite(value)&&value>=0&&value<=1500?value:450;}catch{return 450;}});
  const [avatarPreview,setAvatarPreview]=useState<NautiaAvatarState|null>(null);
  const [thoughtCategory,setThoughtCategory]=useState<NautiaThoughtCategory>('generic');
  const avatarController=useMemo(()=>createNautiaAvatarState(),[]);
  const avatarState=useSyncExternalStore(avatarController.subscribe,avatarController.getSnapshot,avatarController.getSnapshot);
  useEffect(()=>{avatarController.start();return()=>avatarController.dispose();},[avatarController]);
  useEffect(()=>{avatarController.configureSleep(avatarSleepSeconds*1000);},[avatarController,avatarSleepSeconds]);
  useEffect(()=>{avatarController.configureMinimumSpeaking(avatarMinimumMs);},[avatarController,avatarMinimumMs]);

  const [compactMode, setCompactMode] = useState(false);
  const [sidePanelSection,setSidePanelSection]=useState<'tools'|'context'|null>(null);
  const showSidePanel=sidePanelSection!==null;
  const [showAvatarDiagnostics,setShowAvatarDiagnostics]=useState(false);
  const [showLlmSettings, setShowLlmSettings] = useState(false);
  const [deleteThreads,setDeleteThreads]=useState<string[]|null>(null);
  const [showThreadHistory, setShowThreadHistory] = useState(false);
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<NautiaModeTab>('conversa');
  const [llmConfig, setLlmConfig] = useState<LlmClientConfig>(() => loadLocalLlmConfig(localStorage));
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [connectionMessage, setConnectionMessage] = useState('Conexão ainda não verificada.');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionAttempt,setConnectionAttempt]=useState(0);
  const [generatedText,setGeneratedText]=useState('');
  const [perfLogs, setPerfLogs] = useState<NautiaPerformanceEntry[]>(() => loadNautiaPerformanceLogs());
  const refreshPerfLogs = useCallback(() => setPerfLogs(loadNautiaPerformanceLogs()), []);
  const requests=useMemo(()=>createNautiaRequestSession(),[]);
  useEffect(() => {
    setLlmConfig(previous => ({...previous,verifiedAt:undefined}));
    try { localStorage.setItem('ocsis.nautia.ollama.v1', JSON.stringify({foundationVersion:nautiaConfig.version,provider:llmConfig.provider,endpoint:llmConfig.endpoint,model:llmConfig.model})); } catch { onNotify('Não foi possível salvar a configuração local da NautIA.'); }
  }, [llmConfig.provider,llmConfig.endpoint,llmConfig.model,onNotify]);
  useEffect(() => () => {requests.cancel('unmount');}, [requests]);
  useEffect(() => {
    if(llmConfig.provider!=='ollama'){setTestingConnection(false);return;}
    let disposed=false,busy=false;
    const controller=new AbortController();
    const check=async()=>{
      if(disposed||busy)return;
      busy=true;setTestingConnection(true);
      try {
        const result=await connectNautia(llmConfig,AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]));
        if(disposed)return;
        setInstalledModels(result.models);
        setLlmConfig(previous=>({...previous,model:result.model,verifiedAt:result.verifiedAt}));
        setConnectionMessage(`NautIA conectada a ${result.model}. Reconexão automática ativa.${result.usingBase?' Perfil personalizado ainda não instalado; identidade aplicada pelo RocketBox.':''}`);
      }catch(error){if(!disposed){setLlmConfig(previous=>({...previous,verifiedAt:undefined}));setConnectionMessage(`Não consegui conectar ao Ollama: ${String(error)}. Vou tentar novamente automaticamente.`);}}
      finally{busy=false;if(!disposed)setTestingConnection(false);}
    };
    void check();const timer=setInterval(()=>void check(),30000);
    window.addEventListener('focus',check);
    return ()=>{disposed=true;controller.abort();clearInterval(timer);window.removeEventListener('focus',check);};
  },[llmConfig.provider,llmConfig.endpoint,llmConfig.model,connectionAttempt]);
  const testConnection=()=>setConnectionAttempt(value=>value+1);
  const [pendingPlan, setPendingPlan] = useState<ActionPlanModel | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionPlanRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const manualScrollRef=useRef(false);
  const activeConversationIdRef = useRef(activeConversation.id);
  const conversationsRef=useRef(new Map([...savedConversations,activeConversation].map(c=>[c.id,c])));


  useEffect(() => {
    try { rememberActiveConversation(activeConversation,localStorage); } catch { onNotify('Não foi possível lembrar a conversa ativa.'); }
  }, [activeConversation.id,activeConversation.turns.length,onNotify]);

  useEffect(() => {
    saveNautiaConversations(savedConversations);
  }, [savedConversations]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = chatScrollRef.current;
    if (!el) return;
    manualScrollRef.current=false;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setIsScrolledUp(false);
  }, []);

  const handleChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom <= 64;
    if(manualScrollRef.current){isNearBottomRef.current=nearBottom;setIsScrolledUp(!nearBottom);}
  };

  useLayoutEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('auto');
    }
  }, [activeConversation.id,activeConversation.turns.length,isProcessing,generatedText,sidePanelSection,compactMode,showThreadHistory,showLlmSettings,scrollToBottom]);
  useEffect(()=>{
    const element=chatScrollRef.current;if(!element||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(()=>{if(isNearBottomRef.current)scrollToBottom('auto');});
    observer.observe(element);if(element.firstElementChild)observer.observe(element.firstElementChild);
    return()=>observer.disconnect();
  },[activeConversation.id,activeConversation.turns.length===0,scrollToBottom]);

  useEffect(() => {
    const input = textareaRef.current;
    if (!input) return;
    input.style.height = 'auto';
    const nextHeight = Math.max(46, Math.min(input.scrollHeight, 132));
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > 132 ? 'auto' : 'hidden';
  }, [prompt]);

  const updateConversationTurns=useCallback((conversationId:string,updater:(turns:readonly ChatTurn[])=>readonly ChatTurn[],firstUserText?:string)=>{
    const previous=conversationsRef.current.get(conversationId);if(!previous)return;
    const turns=updater(previous.turns);
    if(turns===previous.turns)return;
    const updated={...previous,title:previous.turns.length===0&&firstUserText?deriveConversationTitle(firstUserText):previous.title,updatedAt:new Date().toISOString(),turns};
    conversationsRef.current.set(conversationId,updated);
    setSavedConversations(list=>upsertConversationList(list,updated));
    if(activeConversationIdRef.current===conversationId)setActiveConversation(updated);
  },[]);
  const updateActiveTurns=useCallback((updater:(turns:readonly ChatTurn[])=>readonly ChatTurn[],firstUserText?:string)=>updateConversationTurns(activeConversationIdRef.current,updater,firstUserText),[updateConversationTurns]);
  const cancelGeneration=useCallback((cause:'user'|'conversation-change'='user')=>{
    const request=requests.cancel(cause);if(!request)return;
    const retryPrompt=conversationsRef.current.get(request.conversationId)?.turns.find(t=>t.id===request.userMessageId)?.text;
    const reply:ChatTurn={id:request.assistantMessageId,requestId:request.requestId,replyTo:request.userMessageId,role:'nautia',text:(request.publishedText?request.publishedText+'\n\n':'')+'Geração cancelada. Nenhum plano pendente foi executado.',createdAt:new Date().toISOString(),status:'cancelled',retryPrompt};
    updateConversationTurns(request.conversationId,()=>appendNautiaReply(conversationsRef.current.get(request.conversationId)!,request,reply));
    avatarController.cancel();setGeneratedText('');setIsProcessing(false);
  },[requests,updateConversationTurns,avatarController]);

  const submitPrompt = async (rawText: string, deterministic = false) => {
    const clean=rawText.trim();if(!clean||isProcessing||requests.current)return;
    const targetConversationId=activeConversationIdRef.current;
    const source=conversationsRef.current.get(targetConversationId);if(!source)return;
    const request=requests.begin({requestId:makeConversationId('request'),conversationId:targetConversationId,userMessageId:makeConversationId('u'),assistantMessageId:makeConversationId('n')});if(!request)return;
    const controller=request.controller,avatarRequest=avatarController.begin();
    let avatarResult:'ok'|'cancelled'|'error'='ok';
    setGeneratedText('');setOperationStatus('Interpretando a solicitação…');setAvatarPreview(null);
    const hadPendingPlan = Boolean(pendingPlan);
    setPendingPlan(null);
    setThoughtCategory(activeTab==='organizacao'?'organization':'generic');
    isNearBottomRef.current=true;setIsScrolledUp(false);setShowThreadHistory(false);setPrompt('');setIsProcessing(true);
    const userTurn:ChatTurn={id:request.userMessageId,requestId:request.requestId,role:'user',text:clean,createdAt:new Date().toISOString()};
    updateConversationTurns(targetConversationId,turns=>[...turns.map(t=>t.planResolution==='pending'?{...t,planResolution:'cancelled' as const}:t),userTurn],clean);
    const canPresent=()=>requests.accepts(request)&&activeConversationIdRef.current===targetConversationId;
    try {
      const quickStart = performance.now();
      let usedLocalLlm=false;
      const known = rocketBoxAnswer(clean);
      const offlineQuick = llmConfig.provider !== 'ollama' || deterministic
        ? matchNautiaQuickReply(clean, { hasPendingPlan: hadPendingPlan, conversationStarted:hasNautiaConversationStarted(source.turns) })
        : null;
      let outcome;
      if (offlineQuick) {
        outcome = { kind: 'guidance' as const, message: offlineQuick.message };
        recordNautiaPerformance(createNautiaPerformanceEntry({
          source: 'quick-reply',
          model: llmConfig.model || nautiaConfig.modelName,
          stages: { totalDurationMs: Math.max(0, Math.round(performance.now() - quickStart)) },
        }));
        refreshPerfLogs();
      } else if(known) {
        outcome={kind:'guidance' as const,message:known};
        recordNautiaPerformance(createNautiaPerformanceEntry({
          source: 'knowledge',
          model: llmConfig.model || nautiaConfig.modelName,
          stages: { totalDurationMs: Math.max(0, Math.round(performance.now() - quickStart)) },
        }));
        refreshPerfLogs();
      } else if(llmConfig.provider==='ollama'&&!deterministic){
        localEndpoint(llmConfig.endpoint);
        const timeoutSignal = AbortSignal.timeout(180000);
        try {
          outcome=await converseWithOllama({config:llmConfig,prompt:clean,history:source.turns,context:structuredClone(context??{folderId:null,selectedAssetIds:selectedAssets.map(a=>a.id),project:null,filters:{}}),operations,identity:request,signal:AbortSignal.any([controller.signal,timeoutSignal]),
            hasPendingPlan: hadPendingPlan,
            onPerformanceMetrics: () => refreshPerfLogs(),
            onText:text=>{if(canPresent()&&!request.publishedText)setOperationStatus(text);},
            onGeneratedText:text=>{if(canPresent()){request.publishedText=text;setGeneratedText(text);}},
            onActivity:phase=>{if(canPresent())avatarController.phase(avatarRequest,phase);},
            onToolActivity:name=>{if(canPresent())setThoughtCategory(thoughtCategoryForTool(name));}});
          if(!requests.accepts(request))return;
          usedLocalLlm=outcome.sourceMode!=='deterministic';if(usedLocalLlm)setLlmConfig(previous=>({...previous,verifiedAt:Date.now()}));
        }catch(error){
          if(!requests.accepts(request))return;
          if(controller.signal.aborted)throw error;
          const cause=nautiaFailureCause(error,timeoutSignal);
          console.warn('[NautIA] Solicitação interrompida', {requestId:request.requestId,cause,error});
          if(cause!=='timeout'){setLlmConfig(previous=>({...previous,verifiedAt:undefined}));void testConnection();}
          throw new Error(nautiaFailureMessage(cause));
        }
      }else outcome=await orchestrateNaturalLanguageRequest({prompt:clean,selectedAssets,operations,llmConfig:DEFAULT_LLM_CONFIG,context});
      if(!requests.accepts(request))return;
      if(outcome.plan)outcome={...outcome,plan:{...outcome.plan,origin:{requestId:request.requestId,conversationId:targetConversationId,userMessageId:request.userMessageId}}};
      if(outcome.failed)avatarResult='error';else if(canPresent())avatarController.phase(avatarRequest,'speaking');
      if(outcome.inferenceReports)onLibraryMutated();
      const assistantTurn:ChatTurn={id:request.assistantMessageId,requestId:request.requestId,replyTo:request.userMessageId,role:'nautia',text:outcome.message,createdAt:new Date().toISOString(),status:outcome.failed?'error':'success',sourceMode:usedLocalLlm?'llm':'deterministic',planResolution:outcome.plan?'pending':undefined,outcome};
      updateConversationTurns(targetConversationId,()=>appendNautiaReply(conversationsRef.current.get(targetConversationId)!,request,assistantTurn));
      if(canPresent()&&outcome.plan)setPendingPlan(outcome.plan);
    }catch(error){
      if(!requests.owns(request))return;
      avatarResult=controller.signal.aborted?'cancelled':'error';
      const detail=error instanceof Error?error.message:String(error);
      const errorTurn:ChatTurn={id:request.assistantMessageId,requestId:request.requestId,replyTo:request.userMessageId,role:'nautia',text:(request.publishedText?request.publishedText+'\n\n':'')+(controller.signal.aborted?'Geração cancelada. Nenhum plano pendente foi executado.':`Não foi possível concluir: ${detail}`),createdAt:new Date().toISOString(),status:controller.signal.aborted?'cancelled':'error',retryPrompt:clean};
      updateConversationTurns(targetConversationId,()=>appendNautiaReply(conversationsRef.current.get(targetConversationId)!,request,errorTurn));
    }finally{
      if(requests.finish(request)){avatarController.finish(avatarRequest,avatarResult);setGeneratedText('');setIsProcessing(false);}
    }
  };

  const handleConfirmPlan = (adjustedPlan: ActionPlanModel) => {
    if (isProcessing||pendingPlan?.id !== adjustedPlan.id||!canReviewNautiaPlan(adjustedPlan,conversationsRef.current.get(activeConversationIdRef.current)!)) { onNotify('Este plano não está pendente de aprovação.'); return; }
    const execution = executeApprovedActionPlan({
      plan: adjustedPlan,
      operations,
      history,
    });
    setPendingPlan(null);
    onLibraryMutated();
    onNotify(execution.summary);
    if(!execution.ok)avatarController.uncertainty();

    const execTurn: ChatTurn = {
      id: makeConversationId('n-exec'),
      role: 'nautia',
      text: execution.ok
        ? `Plano executado com sucesso: ${execution.summary}`
        : `Execução interrompida: ${execution.summary}`,
      createdAt: new Date().toISOString(),
      status: execution.ok ? 'success' : 'error',
    };

    updateActiveTurns((turns) => [
      ...turns.map((turn) =>
        turn.outcome?.plan?.id === adjustedPlan.id
          ? {
              ...turn,
              planResolution: (execution.ok ? 'confirmed' : 'cancelled') as
                | 'confirmed'
                | 'cancelled',
            }
          : turn,
      ),
      execTurn,
    ]);
  };

  const handleCancelPlan = (planId?: string) => {
    const targetId = planId ?? pendingPlan?.id ?? null;
    setPendingPlan(null);
    if (!targetId) return;

    updateActiveTurns((turns) =>
      turns.map((turn) =>
        turn.outcome?.plan?.id === targetId
          ? { ...turn, planResolution: 'cancelled' }
          : turn,
      ),
    );
  };

  const handleFocusActionPlan = (plan: ActionPlanModel) => {
    if(isProcessing||!canReviewNautiaPlan(plan,conversationsRef.current.get(activeConversationIdRef.current)!)){onNotify('Este plano pertence a outra solicitação ou já foi encerrado.');return;}
    setPendingPlan(plan);
    setTimeout(() => {
      actionPlanRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 40);
  };

  const handleUndo = (entryId: string) => {
    const result = history.undoEntry(entryId, operations);
    onLibraryMutated();
    onNotify(result.summary);
  };

  const handleNewConversation = () => {
    cancelGeneration('conversation-change');
    setPendingPlan(null);
    setShowThreadHistory(false);
    const next=createEmptyConversation();conversationsRef.current.set(next.id,next);activeConversationIdRef.current=next.id;setActiveConversation(next);
    setIsScrolledUp(false);
    isNearBottomRef.current = true;
    textareaRef.current?.focus();
  };

  const handleOpenConversation = (record: NautiaConversationRecord) => {
    cancelGeneration('conversation-change');
    const next=conversationsRef.current.get(record.id)??record;activeConversationIdRef.current=next.id;setActiveConversation(next);
    setShowThreadHistory(false);
    setPendingPlan(null);
    isNearBottomRef.current = true;
    setIsScrolledUp(false);
  };

  const handleModeSelect = (tab: NautiaModeTab) => {
    setActiveTab(tab);
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isProcessing) void submitPrompt(prompt);
    }
  };

  const turns = activeConversation.turns;
  const lastNautiaTurn = useMemo(
    () => [...turns].reverse().find((turn) => turn.role === 'nautia') ?? null,
    [turns],
  );
  const serviceStatus = useMemo(
    () => resolveAssistantServiceStatus(llmConfig, lastNautiaTurn),
    [llmConfig, lastNautiaTurn],
  );

  const activeProjectLabel =
    context?.project || (selectedAssets.length === 1 && selectedAssets[0].projeto)
      ? context?.project || selectedAssets[0].projeto
      : 'Sem projeto associado';

  const effectiveAvatarState: NautiaAvatarState = avatarPreview ?? avatarState;

  const openSideSection = (section: 'tools' | 'context') => {
    setSidePanelSection(current=>current===section?null:section);
  };

  return (
    <div
      onPointerDown={()=>avatarController.activity()} onKeyDown={()=>avatarController.activity()} onWheel={()=>avatarController.activity()}
      className={`nautia-module-shell ${compactMode ? 'is-compact' : ''} ${
        !showSidePanel ? 'is-side-collapsed' : ''
      }`}
    >
      {showLlmSettings && (
        <section
          className="nautia-panel nautia-llm-config"
          aria-label="Configuração do provedor LLM"
        >
          <div className="nautia-llm-config__head">
            <span className="nautia-eyebrow">INTEGRAÇÃO LLM CONFIGURÁVEL</span>
            <button
              type="button"
              className="nautia-btn-chip"
              onClick={() => setShowLlmSettings(false)}
            >
              Fechar
            </button>
          </div>
          <div className="nautia-universal-filters__grid">
            <label className="nautia-field">
              <span>Provedor</span>
              <select
                value={llmConfig.provider}
                onChange={(event) =>
                  setLlmConfig((prev) => ({
                    ...prev,
                    provider: event.target.value as LlmProviderType,
                  }))
                }
              >
                <option value="none">Desativado (Interpretador Determinístico)</option>
                <option value="ollama">Ollama Local</option>
                <option value="openai-compatible">Endpoint OpenAI-Compatível</option>
              </select>
            </label>

            <label className="nautia-field">
              <span>Endpoint</span>
              <input
                type="url"
                value={llmConfig.endpoint}
                disabled={llmConfig.provider === 'none'}
                onChange={(event) =>
                  setLlmConfig((prev) => ({ ...prev, endpoint: event.target.value, verifiedAt:undefined }))
                }
              />
            </label>

            <label className="nautia-field">
              <span>Modelo</span>
              <select
                value={llmConfig.model}
                disabled={llmConfig.provider !== 'ollama' || isProcessing}
                onChange={(event) =>
                  setLlmConfig((prev) => ({ ...prev, model: event.target.value }))
                }
              ><option value="">Selecione um modelo instalado</option>{llmConfig.model && !installedModels.includes(llmConfig.model) && <option value={llmConfig.model}>{llmConfig.model} (não verificado)</option>}{installedModels.map(model=><option key={model} value={model}>{model}</option>)}</select>
            </label>
            <button type="button" className="nautia-btn-ghost" disabled={llmConfig.provider!=='ollama'||testingConnection||isProcessing} onClick={()=>void testConnection()}>{testingConnection?'Testando…':'Testar conexão / Listar modelos'}</button>
            <p role="status" className="nautia-muted-note">{connectionMessage}</p>
          </div>
          <p className="nautia-muted-note">
            Mesmo com LLM ativa, nenhuma mutação ocorre sem validação e aprovação no Nautia Action Plan.
          </p>
          <details className="nautia-perf-diagnostics">
            <summary>Diagnóstico de desempenho ({perfLogs.length})</summary>
            {perfLogs.length === 0 ? (
              <p className="nautia-muted-note">Nenhuma medição registrada nesta sessão ainda.</p>
            ) : (
              <div className="nautia-perf-diagnostics__body">
                {(() => {
                  const latest = perfLogs[0];
                  return (
                    <dl className="nautia-perf-diagnostics__grid">
                      <div><dt>Modelo ativo</dt><dd>{latest.model}</dd></div>
                      <div><dt>Origem</dt><dd>{latest.source === 'quick-reply' ? 'Resposta rápida local' : latest.source === 'knowledge' ? 'Conhecimento local' : 'Ollama'}</dd></div>
                      <div><dt>Carregamento</dt><dd>{formatPerfDuration(latest.ollamaLoadDurationMs)}</dd></div>
                      <div><dt>Prompt</dt><dd>{formatPerfDuration(latest.ollamaPromptEvalDurationMs)}</dd></div>
                      <div><dt>1º token</dt><dd>{formatPerfDuration(latest.stages.firstTokenMs)}</dd></div>
                      <div><dt>Velocidade aprox.</dt><dd>{latest.tokensPerSecond ? `${latest.tokensPerSecond} tok/s` : '—'}</dd></div>
                      <div><dt>Duração total</dt><dd>{formatPerfDuration(latest.stages.totalDurationMs)}</dd></div>
                      <div><dt>Chamadas LLM</dt><dd>{latest.llmCalls}</dd></div>
                      {latest.failureCause&&<div><dt>Interrupção</dt><dd>{latest.failureCause} · {latest.failureType}</dd></div>}
                    </dl>
                  );
                })()}
                <ul className="nautia-perf-diagnostics__list">
                  {perfLogs.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <span>{item.source === 'quick-reply' ? 'Rápida' : item.source === 'knowledge' ? 'Local' : item.model}</span>
                      <span>{item.llmCalls} LLM · {item.toolsExecuted} tools</span>
                      <strong>{formatPerfDuration(item.stages.totalDurationMs)}</strong>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="nautia-btn-ghost"
                  onClick={() => {
                    clearNautiaPerformanceLogs();
                    refreshPerfLogs();
                  }}
                >
                  Limpar histórico de métricas
                </button>
              </div>
            )}
          </details>
        </section>
      )}

      <div className="studio-assistant">
        {showAvatar && !compactMode && (
          <figure
            id="nautia-avatar-slot"
            className="studio-portrait"
          >
            <div className="nautia-stage-header">
              <div>
                <p className="eyebrow">OCSIS / ROCKETBOX</p>
                <h1 id="nautia-title" tabIndex={-1} className="nautia-stage-title">
                  NautIA
                </h1>
                <p className="nautia-stage-subtitle">— Central de Comando</p>
              </div>
              <details className="nautia-avatar-settings">
                <summary title="Preferências de comportamento do avatar">Ajustes</summary>
                <label>
                  Segundos até sonolência
                  <input
                    aria-label="Segundos de inatividade do avatar"
                    type="number"
                    min={10}
                    max={3600}
                    value={avatarSleepSeconds}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value >= 10 && value <= 3600) {
                        setAvatarSleepSeconds(value);
                        try {
                          localStorage.setItem('ocsis.nautia.avatar.sleepSeconds', String(value));
                        } catch {
                          onNotify('Não foi possível salvar o tempo de inatividade do avatar.');
                        }
                      }
                    }}
                  />
                </label>
                <label>
                  Fala mínima (ms)
                  <input
                    aria-label="Duração visual mínima da fala"
                    type="number"
                    min={0}
                    max={1500}
                    step={50}
                    value={avatarMinimumMs}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value >= 0 && value <= 1500) {
                        setAvatarMinimumMs(value);
                        try {
                          localStorage.setItem('ocsis.nautia.avatar.minimumSpeakingMs', String(value));
                        } catch {
                          onNotify('Não foi possível salvar a duração mínima da fala.');
                        }
                      }
                    }}
                  />
                </label>
              </details>
            </div>

            <NautiaAvatar
              state={effectiveAvatarState}
              thoughtCategory={avatarPreview ? 'generic' : thoughtCategory}
            />

            {showAvatarDiagnostics&&!isProcessing && <NautiaAvatarDiagnostics onPreview={setAvatarPreview} />}

            <figcaption className="nautia-stage-footer">
              <span className="nautia-stage-state-pill" data-state={effectiveAvatarState}>
                <span className="status-dot" aria-hidden="true" />
                <span>{STAGE_STATE_LABELS[effectiveAvatarState]}</span>
              </span>
            </figcaption>
          </figure>
        )}

        <section
          className="nautia-panel nautia-conversation"
          aria-label="Conversa com a NautIA"
        >
          <div className="nautia-chat-topbar">
            <div className="nautia-chat-header">
              <div className="nautia-chat-header__title">
                <NautiaChibiIcon className="nautia-chat-header__icon" />
                {compactMode && (
                  <h1 id="nautia-title" tabIndex={-1} className="sr-only">
                    NautIA
                  </h1>
                )}
                <h2 title={activeConversation.title}>
                  {activeConversation.title==='Nova conversa'?<>Conversa com <span className="nautia-accent-violet">NautIA</span></>:activeConversation.title}
                </h2>
                {turns.length > 0 && (
                  <span className="nautia-thread-bar__count">
                    {turns.length} {turns.length === 1 ? 'msg' : 'msgs'}
                  </span>
                )}
              </div>

              <div className="nautia-chat-header__actions">
                <span
                  className={`nautia-status-badge connectivity-${serviceStatus.connectivity}`}
                  title={serviceStatus.detail}
                >
                  <span className="status-dot" aria-hidden="true" />
                  {serviceStatus.label}
                </span>
                <button
                  type="button"
                  className="nautia-btn-chip nautia-btn-new-chat"
                  disabled={turns.length === 0}
                  onClick={handleNewConversation}
                >
                  + Nova conversa
                </button>
                <button
                  type="button"
                  className="nautia-btn-chip"
                  aria-expanded={showThreadHistory}
                  onClick={() => setShowThreadHistory((prev) => !prev)}
                >
                  Histórico ({savedConversations.length})
                </button>
                <details className="nautia-options">
                  <summary aria-label="Opções da NautIA" title="Opções da NautIA">•••</summary>
                  <div className="nautia-options__menu" onClick={event=>{if((event.target as HTMLElement).closest('button'))event.currentTarget.closest('details')?.removeAttribute('open');}}>
                    <button type="button" className="nautia-btn-ghost" aria-expanded={showLlmSettings} onClick={()=>setShowLlmSettings(previous=>!previous)}>Configurações da NautIA</button>
                    <button type="button" className="nautia-btn-ghost" aria-pressed={compactMode} onClick={()=>setCompactMode(previous=>!previous)}>{compactMode?'Exibir avatar':'Modo compacto'}</button>
                    <button type="button" className="nautia-btn-ghost" aria-pressed={showAvatarDiagnostics} onClick={()=>{setShowAvatarDiagnostics(previous=>!previous);setCompactMode(false);}}>Diagnóstico do avatar</button>
                    <button type="button" className="nautia-btn-ghost" aria-expanded={showAuditHistory} onClick={()=>setShowAuditHistory(previous=>!previous)}>Operações ({historyEntries.length})</button>
                  </div>
                </details>
              </div>
            </div>

            <div className="nautia-mode-tabs" role="tablist" aria-label="Modos de operação da NautIA">
              {MODE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`nautia-mode-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => handleModeSelect(tab.id)}
                >
                  <FolderTagIconGlyph icon={tab.icon} className="nautia-mini-svg" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {showThreadHistory && (
              <div
                className="nautia-history-drawer"
                role="region"
                aria-label="Conversas anteriores da NautIA"
              >
                <button type="button" className="nautia-btn-ghost" disabled={isProcessing||!savedConversations.length} onClick={()=>setDeleteThreads(savedConversations.map(c=>c.id))}>Limpar histórico de conversas</button>
                {deleteThreads&&<div role="alertdialog" aria-label="Confirmar exclusão de conversas" className="nautia-inline-alert"><p>{deleteThreads.length===savedConversations.length?'Todas as conversas salvas da NautIA serão excluídas. Esta ação não afeta seus assets ou projetos.':'Excluir esta conversa salva? Esta ação não afeta seus assets ou projetos.'}</p><button type="button" className="nautia-btn-ghost" onClick={()=>setDeleteThreads(null)}>Cancelar</button><button type="button" className="nautia-btn-danger" disabled={isProcessing} onClick={()=>{if(isProcessing||requests.current){onNotify('Aguarde o fim da geração para excluir conversas.');return;}try{const next=deleteNautiaConversations(savedConversations,deleteThreads,activeConversation.id,localStorage);setSavedConversations(next.records);for(const id of deleteThreads)conversationsRef.current.delete(id);if(next.activeRemoved){const empty=createEmptyConversation();conversationsRef.current.set(empty.id,empty);activeConversationIdRef.current=empty.id;setActiveConversation(empty);setPendingPlan(null);setPrompt('');}setDeleteThreads(null);onNotify('Conversas excluídas.');}catch(e){onNotify(`Não foi possível excluir: ${String(e)}`);}}}>Excluir conversas</button></div>}
                {savedConversations.length === 0 ? (
                  <p className="nautia-muted-note">
                    Nenhuma conversa anterior salva ainda. Inicie uma conversa abaixo.
                  </p>
                ) : (
                  <ul className="nautia-history-drawer__list">
                    {savedConversations.map((conv) => (
                      <li key={conv.id}>
                        <button
                          type="button"
                          className={`nautia-history-drawer__item ${
                            conv.id === activeConversation.id ? 'is-current' : ''
                          }`}
                          onClick={() => handleOpenConversation(conv)}
                        >
                          <strong>{conv.title}</strong>
                          <small>
                            {conv.turns.length} msg ·{' '}
                            {new Date(conv.updatedAt).toLocaleDateString('pt-BR')}
                          </small>
                        </button>
                        <button type="button" className="nautia-btn-ghost" disabled={isProcessing} aria-label={`Excluir conversa ${conv.title}`} onClick={()=>setDeleteThreads([conv.id])}>Excluir</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="nautia-chat-viewport">
            <div
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              onWheel={event=>{manualScrollRef.current=true;if(event.deltaY<0){isNearBottomRef.current=false;setIsScrolledUp(true);}}}
              onPointerDown={()=>{manualScrollRef.current=true;}}
              onTouchStart={()=>{manualScrollRef.current=true;}}
              onKeyDown={event=>{if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown'].includes(event.key))manualScrollRef.current=true;}}
              className={`nautia-chat-log ${turns.length === 0 && !isProcessing ? 'is-empty' : 'is-active'}`}
              role="log"
              aria-live="polite"
            >
              {turns.length === 0 && !isProcessing ? (
                <NautiaWelcomeScreen
                  disabled={isProcessing}
                  onSelectSuggestion={(suggestionPrompt) => void submitPrompt(suggestionPrompt)}
                />
              ) : (
                <NautiaChatThread
                  turns={turns}
                  folders={folders}
                  isProcessing={isProcessing}
                  operationStatus={operationStatus}
                  streamingText={generatedText}
                  activePendingPlanId={pendingPlan?.id ?? null}
                  onConfirmPlan={handleConfirmPlan}
                  onCancelPlan={(planId) => handleCancelPlan(planId)}
                  onFocusActionPlan={handleFocusActionPlan}
                  onRetryPrompt={(retryText) => void submitPrompt(retryText)}
                />
              )}
            </div>

            {isScrolledUp && turns.length > 0 && (
              <button
                type="button"
                className="nautia-scroll-bottom-btn"
                onClick={() => scrollToBottom('auto')}
              >
                Voltar às mensagens recentes ↓
              </button>
            )}
          </div>

          <form
            className="nautia-composer-shell"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPrompt(prompt);
            }}
          >
            {selectedAssets.length > 0 && (
              <div className="nautia-composer-context">
                <span>
                  Escopo ativo: <strong>{selectedAssets.length}</strong>{' '}
                  {selectedAssets.length === 1 ? 'asset selecionado' : 'assets selecionados'}
                </span>
              </div>
            )}

            <div className="nautia-composer">
              <label className="sr-only" htmlFor="nautia-command-input">
                Instrução para a NautIA
              </label>
              <textarea
                ref={textareaRef}
                id="nautia-command-input"
                rows={1}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Pergunte algo à NautIA..."
              />
              <button
                type={isProcessing ? 'button' : 'submit'}
                className={`nautia-btn-primary nautia-send-btn ${isProcessing ? 'is-stop' : ''}`}
                disabled={!isProcessing && !prompt.trim()}
                aria-label={isProcessing ? 'Parar geração' : 'Enviar mensagem para a NautIA'}
                title={isProcessing ? 'Parar geração' : 'Enviar mensagem'}
                onClick={isProcessing ? ()=>cancelGeneration() : undefined}
              >
                {isProcessing ? (
                  <svg
                    className="nautia-mini-svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="5" y="5" width="14" height="14" rx="3" />
                  </svg>
                ) : (
                  <svg
                    className="nautia-mini-svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 2 11 13" />
                    <path d="m22 2-7 20-4-9-9-4 20-7Z" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </section>

        {!showSidePanel && (
          <aside className="studio-tools-rail" aria-label="Atalhos das ferramentas contextuais">
            <button
              type="button"
              className="studio-tools-rail__btn"
              aria-label="Ferramentas"
              onClick={() => openSideSection('tools')}
              title="Abrir ferramentas contextuais"
            >
              <FolderTagIconGlyph icon="sparkles" className="nautia-icon-svg" />
            </button>
            <button
              type="button"
              className="studio-tools-rail__btn"
              aria-label="Contexto"
              onClick={() => openSideSection('context')}
              title="Abrir contexto atual"
            >
              <FolderTagIconGlyph icon="layers" className="nautia-icon-svg" />
            </button>
          </aside>
        )}

        {showSidePanel && (
          <aside className="studio-chat-side" aria-label={sidePanelSection==='tools'?'Ferramentas da NautIA':'Contexto da NautIA'} id={sidePanelSection==='tools'?'nautia-tools-panel':'nautia-context-panel'}>
            <div className="studio-side-card__topbar">
              <nav className="nautia-side-tabs" aria-label="Painel lateral da NautIA">
                <button type="button" className="nautia-btn-chip nautia-panel-icon" aria-label="Ferramentas" title="Ferramentas" aria-pressed={sidePanelSection==='tools'} onClick={()=>openSideSection('tools')}><FolderTagIconGlyph icon="sparkles" className="nautia-icon-svg"/></button>
                <button type="button" className="nautia-btn-chip nautia-panel-icon" aria-label="Contexto" title="Contexto" aria-pressed={sidePanelSection==='context'} onClick={()=>openSideSection('context')}><FolderTagIconGlyph icon="layers" className="nautia-icon-svg"/></button>
                <button type="button" className="nautia-btn-ghost" onClick={()=>setSidePanelSection(null)} aria-label="Recolher painel lateral">Recolher</button>
              </nav>
            </div>

            {sidePanelSection === 'context' && (
              <div className="studio-side-card">
                <header className="studio-side-card__header">
                  <h3>Contexto Atual</h3>
                  <span className="studio-side-card__stripes" aria-hidden="true">
                    ///
                  </span>
                </header>
                <dl className="studio-side-context">
                  <div>
                    <dt>Pasta:</dt>
                    <dd>{currentFolder}</dd>
                  </div>
                  <div>
                    <dt>Seleção:</dt>
                    <dd>
                      {selectedAssets.length === 0
                        ? 'Nenhum item'
                        : selectedAssets.length === 1
                          ? selectedAssets[0].nome
                          : `${selectedAssets.length} itens`}
                    </dd>
                  </div>
                  <div>
                    <dt>Projeto:</dt>
                    <dd>{activeProjectLabel}</dd>
                  </div>
                  <div><dt>Coleção:</dt><dd>{context?.collection||'Não informada'}</dd></div>
                </dl>
                {selectedAssets.length>0&&<ul className="nautia-context-assets">{selectedAssets.slice(0,20).map(asset=><li key={asset.id}><strong>{asset.nome}</strong><dl><div><dt>Formato</dt><dd>{asset.formato||'Não identificado'}</dd></div><div><dt>Categoria</dt><dd>{asset.categoria||'Não informada'}</dd></div><div><dt>Etiquetas</dt><dd>{asset.tags.length?asset.tags.join(', '):'Sem etiquetas'}</dd></div><div><dt>Análise</dt><dd>{asset.analysisReport?.diagnostic.title||'Sem diagnóstico disponível'}</dd></div></dl></li>)}</ul>}
                {selectedAssets.length>20&&<p className="nautia-muted-note">Mostrando 20 de {selectedAssets.length} itens selecionados.</p>}
                {context&&<details className="nautia-context-filters"><summary>Filtros do Convés</summary><dl>{Object.entries(context.filters).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{typeof value==='object'?JSON.stringify(value):String(value??'Não definido')}</dd></div>)}</dl></details>}
              </div>
            )}

            {sidePanelSection==='tools'&&<div className="studio-side-card">
              <header className="studio-side-card__header">
                <h3>Ações Rápidas</h3>
                <span className="studio-side-card__stripes" aria-hidden="true">
                  ///
                </span>
              </header>
              <div className="studio-side-actions">
                {SIDE_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.title}
                    type="button"
                    disabled={isProcessing}
                    className="studio-side-action-btn"
                    onClick={() => {if(action.requiresInput){setPrompt(action.prompt);textareaRef.current?.focus();}else void submitPrompt(action.prompt, true);}}
                  >
                    <span className="studio-side-action-btn__icon" aria-hidden="true">
                      <FolderTagIconGlyph icon={action.icon} className="nautia-mini-svg" />
                    </span>
                    <span className="studio-side-action-btn__body">
                      <strong>{action.title}</strong>
                      <small>{action.subtitle}</small>
                    </span>
                    <span className="studio-side-action-btn__chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ))}
              </div>
            </div>}

            {sidePanelSection==='tools'&&<div className="studio-side-card studio-side-card--tip">
              <header className="studio-side-card__header">
                <h3>Dica da NautIA</h3>
                <span className="studio-side-card__stripes" aria-hidden="true">
                  ///
                </span>
              </header>
              <p>
                Selecione assets no Convés ou use um comando acima para analisar compatibilidade, sugerir etiquetas e organizar pastas com segurança.
              </p>
            </div>}
          </aside>
        )}
      </div>

      {(pendingPlan || showAuditHistory) && (
        <div className="nautia-module-dock">
          <div ref={actionPlanRef}>
            <NautiaActionPlan
              plan={pendingPlan}
              folders={folders}
              onConfirm={handleConfirmPlan}
              onCancel={() => handleCancelPlan()}
            />
          </div>

          {showAuditHistory && (
            <NautiaHistoryPanel entries={historyEntries} onUndo={handleUndo} onClear={()=>{try{history.clear();onLibraryMutated();onNotify('Histórico de atividades limpo.');}catch(e){onNotify(String(e));}}}/>
          )}
        </div>
      )}
    </div>
  );
};
