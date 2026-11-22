import {createIcon} from './icons.js';
import {HELP_ARTICLES,HELP_CATEGORIES,searchHelpArticles,resolveHelpAction,helpAboutMetadata} from './help-service.ts';
import './help-center.css';

const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};

export function mountHelpCenter(host,{navigate,openSettings,version,versionSource='Pacote do aplicativo'}){
  let selected='all',currentVersion=version,currentSource=versionSource;
  const root=el('div',null,'help-center');host.append(root);
  const intro=el('div',null,'help-intro');
  const introCopy=el('div');introCopy.append(el('span','SEU GUIA DE BORDO','help-eyebrow'),el('p','Encontre uma resposta ou explore o manual, no seu ritmo.'));
  const versionBadge=el('span',`Versão ${currentVersion}`,'help-version');
  intro.append(introCopy,versionBadge);
  const searchArea=el('div',null,'help-search');
  const label=el('label','Pesquisar no manual');label.htmlFor='help-query';
  const input=el('input');input.id='help-query';input.type='search';input.maxLength=300;input.placeholder='Ex.: registrar asset, etiquetas, recuperar, Ollama…';input.autocomplete='off';input.setAttribute('aria-controls','help-articles');
  const hint=el('p','Pesquisa local • funciona sem internet e sem Ollama','help-search-hint');input.setAttribute('aria-describedby','help-search-hint');hint.id='help-search-hint';
  searchArea.append(label,input,hint);
  const guide=el('button',null,'help-guide');guide.type='button';
  const guideCopy=el('span');guideCopy.append(el('strong','Primeira vez por aqui?'),el('small','Faça um passeio de seis passos pelo RocketBox.'));
  guide.append(createIcon('rocket'),guideCopy,el('span','Abrir guia →','help-guide-link'));guide.addEventListener('click',()=>openArticle('welcome'));
  const categories=el('nav',null,'help-categories');categories.setAttribute('aria-label','Categorias da Central de Ajuda');
  const categoryButtons=new Map();
  for(const category of [{id:'all',title:'Todos os assuntos',icon:'help'},...HELP_CATEGORIES]){
    const button=el('button',null,'help-category');button.type='button';button.setAttribute('aria-controls','help-articles');
    const count=category.id==='all'?HELP_ARTICLES.length:HELP_ARTICLES.filter(a=>a.category===category.id).length;
    const copy=el('span',category.title);button.append(createIcon(category.icon),copy,el('small',String(count)));
    button.addEventListener('click',()=>{selected=category.id;render();});categories.append(button);categoryButtons.set(category.id,button);
  }
  const resultsHeader=el('div',null,'help-results-header');
  const resultsStatus=el('p');resultsStatus.setAttribute('role','status');resultsStatus.setAttribute('aria-live','polite');
  const clear=el('button','Limpar filtros','btn-ghost');clear.type='button';clear.addEventListener('click',()=>{input.value='';selected='all';render();input.focus();});resultsHeader.append(resultsStatus,clear);
  const articles=el('div',null,'help-articles');articles.id='help-articles';
  const footer=el('p','Os atalhos deste manual apenas abrem telas. Nenhuma alteração de asset é executada por aqui.','help-footer');
  root.append(intro,searchArea,guide,categories,resultsHeader,articles,footer);

  function actionButton(raw){
    const target=resolveHelpAction(raw);if(!target)return null;
    const button=el('button',target.label,'btn-ghost help-action');button.type='button';button.append(createIcon('arrow-right'));
    button.addEventListener('click',()=>{
      if(target.articleId)openArticle(target.articleId);
      else if(target.view==='settings'&&target.settingsCategory)openSettings(target.settingsCategory,target.setting);
      else navigate(target.view);
    });return button;
  }
  function articleCard(article,expanded=false){
    const card=el('details',null,'help-article');card.id=`help-article-${article.id}`;
    const category=HELP_CATEGORIES.find(c=>c.id===article.category);
    const summary=el('summary'),copy=el('span',null,'help-article-copy');
    copy.append(el('small',category.title),el('strong',article.title),el('span',article.summary));
    summary.append(copy,createIcon('arrow-right'));card.append(summary);
    let built=false;
    function build(){
      if(built)return;built=true;const body=el('div',null,'help-article-body');
      if(article.id==='about'){
        const metadata=el('dl',null,'help-metadata');
        for(const [label,value] of helpAboutMetadata(currentVersion,currentSource)){
          const item=el('div'),valueNode=el('dd',value);if(label==='Versão')valueNode.className='help-live-version';if(label==='Origem da versão')valueNode.className='help-live-version-source';
          item.append(el('dt',label),valueNode);metadata.append(item);
        }body.append(metadata);
      }
      for(const section of article.sections){
        const group=el('section');if(section.heading)group.append(el('h3',section.heading));
        for(const text of section.paragraphs??[])group.append(el('p',text));
        if(section.steps){const list=el('ol');for(const step of section.steps)list.append(el('li',step));group.append(list);}
        if(section.note){const note=el('aside',null,'help-note');note.append(createIcon('help'),el('p',section.note));group.append(note);}
        if(section.actions){const actions=el('div',null,'help-actions');for(const raw of section.actions){const button=actionButton(raw);if(button)actions.append(button);}group.append(actions);}
        body.append(group);
      }card.append(body);
    }
    card.addEventListener('toggle',()=>{if(card.open)build();});
    if(expanded){build();card.open=true;}return card;
  }
  function render(expandId){
    const matches=searchHelpArticles(input.value,selected);
    for(const [id,button] of categoryButtons)button.setAttribute('aria-pressed',String(id===selected));
    resultsStatus.textContent=`${matches.length} ${matches.length===1?'artigo encontrado':'artigos encontrados'}`;
    clear.hidden=!input.value&&selected==='all';articles.replaceChildren();
    if(!matches.length){const empty=el('div',null,'help-empty');empty.append(createIcon('help'),el('strong','Nenhum artigo encontrado'),el('p','Tente outro termo ou limpe os filtros para ver todos os assuntos.'));articles.append(empty);return;}
    for(const article of matches)articles.append(articleCard(article,article.id===expandId));
  }
  function openArticle(id){
    if(!HELP_ARTICLES.some(a=>a.id===id))return;input.value='';selected='all';render(id);
    const card=articles.querySelector(`#help-article-${id}`);card?.scrollIntoView({block:'start',behavior:'instant'});card?.querySelector('summary')?.focus({preventScroll:true});
  }
  input.addEventListener('input',()=>render());
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){input.value='';render();}});
  render();
  return {setVersion(value,source='Aplicativo desktop'){
    currentVersion=value;currentSource=source;versionBadge.textContent=`Versão ${value}`;
    root.querySelectorAll('.help-live-version').forEach(node=>{node.textContent=value;});root.querySelectorAll('.help-live-version-source').forEach(node=>{node.textContent=source;});
  }};
}
