import content from './help-content.json' with {type:'json'};

export interface HelpAction {label:string;view?:string;settingsCategory?:string;setting?:string;articleId?:string}
export interface HelpSection {heading?:string;paragraphs?:string[];steps?:string[];note?:string;actions?:HelpAction[]}
export interface HelpArticle {id:string;category:string;title:string;summary:string;keywords:string[];sections:HelpSection[]}
export const HELP_CATEGORIES=content.categories;
export const HELP_ARTICLES:readonly HelpArticle[]=content.articles;
export const normalizeHelpText=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const index=HELP_ARTICLES.map((article,position)=>{
  const category=HELP_CATEGORIES.find(c=>c.id===article.category)!;
  const title=normalizeHelpText(article.title),keywords=normalizeHelpText(article.keywords.join(' '));
  const categoryText=normalizeHelpText(`${category.title} ${category.description}`);
  const body=normalizeHelpText([article.summary,...article.sections.flatMap(s=>[s.heading??'',...(s.paragraphs??[]),...(s.steps??[]),s.note??'',...(s.actions??[]).map(a=>a.label)])].join(' '));
  return {article,position,title,keywords,categoryText,body,all:[title,keywords,categoryText,body].join(' ')};
});

/** Offline AND search; index is built once, independently of the user's library. */
export function searchHelpArticles(query:string,category='all'):HelpArticle[]{
  const tokens=normalizeHelpText(query.slice(0,300)).split(/\s+/).filter(Boolean);
  return index.filter(row=>(category==='all'||row.article.category===category)&&tokens.every(t=>row.all.includes(t)))
    .map(row=>({...row,score:tokens.reduce((n,t)=>n+(row.title.includes(t)?9:0)+(row.keywords.includes(t)?6:0)+(row.categoryText.includes(t)?4:0)+(row.body.includes(t)?1:0),0)}))
    .sort((a,b)=>b.score-a.score||a.position-b.position).map(row=>row.article);
}

const views=new Set(['home','workspace','register','trash','nautia','settings']);
const settings=new Set(['appearance','interface','library','security','assistant','system','about','help']);
const fields:Record<string,readonly string[]>={library:['duplicateMode'],system:['diagnostics','asset-vault','backup']};
/** Help links are navigation data, never service calls, file actions or arbitrary URLs. */
export function resolveHelpAction(raw:HelpAction):HelpAction|null{
  if(!raw||typeof raw.label!=='string'||!raw.label.trim())return null;
  if(Object.keys(raw).some(k=>!['label','view','settingsCategory','setting','articleId'].includes(k)))return null;
  if(raw.articleId)return !raw.view&&!raw.settingsCategory&&!raw.setting&&HELP_ARTICLES.some(a=>a.id===raw.articleId)?{label:raw.label,articleId:raw.articleId}:null;
  if(!raw.view||!views.has(raw.view))return null;
  if(raw.settingsCategory&&(raw.view!=='settings'||!settings.has(raw.settingsCategory)))return null;
  if(raw.setting&&(!raw.settingsCategory||!fields[raw.settingsCategory]?.includes(raw.setting)))return null;
  return {...raw};
}

export function helpAboutMetadata(version:string,versionSource:string){
  return [
    ['Aplicativo','RocketBox by OCSIS'],['Identidade','OCSIS'],['Versão',version],['Origem da versão',versionSource],
    ['Autoria individual','Não confirmada nos metadados do projeto.'],['Licença de distribuição','Não declarada nos metadados examinados.'],
  ];
}
