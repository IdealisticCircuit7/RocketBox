/** Verified in the app branding, package configuration and existing official services. No individual author is inferred from paths. */
export const ROCKETBOX_FACTS={
  name:'RocketBox by OCSIS',brand:'OCSIS',
  purpose:'Biblioteca desktop de assets, projetos e pacotes, organizada por pastas virtuais e etiquetas.',
  capabilities:['Cadastro por referência aos originais','Pesquisa e filtros no Convés','Lixeira de registros','Inspeção de formatos suportados','Diagnósticos determinísticos','NautIA com ferramentas validadas e Ollama local opcional'],
  registrationSteps:['Abrir Registrar Asset','Escolher Asset Individual, Projeto de Software / Engine ou Pacote de Assets','Usar Selecionar arquivo ou Selecionar diretório para escolher o recurso local','Revisar identificação, nome e organização; associar pasta, projeto e etiquetas quando desejado','Confirmar em Registrar no Convés'],
  registrationLimits:'O registro referencia o caminho local selecionado. Este fluxo não cadastra assets por links, IDs de launchers ou identificadores externos. Convés é a biblioteca virtual, não apenas uma interface de busca.',
  limits:['Organizar registros não move os arquivos físicos','Alterações propostas pela NautIA precisam de aprovação','Não há navegação web nem suporte universal a formatos proprietários','Autoria individual não confirmada nos metadados do projeto'],
} as const;
export const ROCKETBOX_KNOWLEDGE_CONTEXT=`Informações oficiais desta versão do aplicativo (não são dados da biblioteca): ${JSON.stringify(ROCKETBOX_FACTS)}`;
/** Narrow product FAQs, not a business-command/authorization router. Composite requests continue through the ordinary pipeline. */
export function rocketBoxAnswer(prompt:string):string|null {
 const text=prompt.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim().replace(/[?.!]+$/,'').trim();
 if(/^(?:quem (?:criou|desenvolveu|fez) (?:o|a) rocket\s?box|(?:quem e|qual e|qual) (?:o|a) (?:criador|criadora|desenvolvedor|desenvolvedora|empresa responsavel) (?:do|da) rocket\s?box)$/.test(text))return 'O projeto se apresenta como **RocketBox by OCSIS**. A marca responsável indicada é **OCSIS**; os metadados consultados não confirmam uma autoria individual. Posso te ajudar a explorar o Convés ou explicar algum recurso?';
 if(/^(?:o que e (?:o|a) rocket\s?box|(?:para que serve|qual (?:e )?a proposta (?:do|da)) (?:o |a )?rocket\s?box)$/.test(text))return `O **${ROCKETBOX_FACTS.name}** é uma biblioteca desktop para organizar assets, projetos e pacotes com pastas virtuais, etiquetas e pesquisa. Ele mantém referências aos arquivos originais: organizar um registro não move seu arquivo no disco. Quer que eu te ajude a buscar ou organizar algum asset agora?`;
 if(/^(?:quem e (?:a )?nautia|o que (?:e|faz) (?:a )?nautia)$/.test(text))return 'Sou a **NautIA**, assistente da OCSIS no RocketBox. Posso conversar, consultar a biblioteca e propor ações pelas ferramentas autorizadas. Alterações dependem da sua aprovação; diagnósticos técnicos vêm do motor determinístico. A conversação generativa usa um modelo local no Ollama, quando disponível. Como posso te ajudar hoje?';
 return null;
}
