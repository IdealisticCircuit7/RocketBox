import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HELP_ARTICLES,HELP_CATEGORIES,normalizeHelpText,searchHelpArticles,resolveHelpAction,helpAboutMetadata} from '../src/help-service.ts';

test('Manual tem categorias, IDs únicos e artigos estruturados com destinos existentes',()=>{
 assert.equal(new Set(HELP_CATEGORIES.map(c=>c.id)).size,HELP_CATEGORIES.length);
 assert.equal(new Set(HELP_ARTICLES.map(a=>a.id)).size,HELP_ARTICLES.length);
 assert.ok(HELP_ARTICLES.length>=20);
 for(const category of HELP_CATEGORIES)assert.ok(HELP_ARTICLES.some(a=>a.category===category.id),category.id);
 for(const article of HELP_ARTICLES){
  assert.ok(HELP_CATEGORIES.some(c=>c.id===article.category));assert.ok(article.title&&article.summary&&article.sections.length);
  for(const section of article.sections)for(const action of section.actions??[])assert.deepEqual(resolveHelpAction(action),action,article.id);
 }
});

test('Pesquisa offline encontra títulos, categorias, palavras-chave e conteúdo sem diferenciar acentos ou caixa',()=>{
 assert.equal(normalizeHelpText('CONFIGURAÇÕES / Áudio'),'configuracoes audio');
 assert.ok(searchHelpArticles('SELETOR').some(a=>a.id==='file-errors'));
 assert.ok(searchHelpArticles('configuracoes').some(a=>a.id==='preferences'));
 assert.ok(searchHelpArticles('UPROJECT').some(a=>a.id==='register-resource'));
 assert.ok(searchHelpArticles('EXCLUIR').some(a=>a.id==='trash-permanent'));
 assert.ok(searchHelpArticles('dependencias').some(a=>a.id==='vault'));
 assert.equal(searchHelpArticles('exportar preferencias')[0].id,'preferences-backup');
 assert.ok(searchHelpArticles('integridade SHA-256').some(a=>a.id==='vault'));
});

test('Filtros combinam categoria com todos os termos e retornam estado vazio real',()=>{
 assert.deepEqual(searchHelpArticles('Ollama','trash'),[]);
 assert.ok(searchHelpArticles('Ollama','nautia').every(a=>a.category==='nautia'));
 assert.deepEqual(searchHelpArticles('xyz-nao-existe-987654'),[]);
 assert.deepEqual(searchHelpArticles('','categoria-invalida'),[]);
 assert.equal(searchHelpArticles('').length,HELP_ARTICLES.length);
 assert.equal(searchHelpArticles('   ').length,HELP_ARTICLES.length);
 assert.deepEqual(searchHelpArticles('<script>alert(1)</script>'),[]);
});

test('Pesquisa não depende de rede, DOM, armazenamento, biblioteca do usuário ou Ollama',()=>{
 const original=globalThis.fetch,initial=JSON.stringify(HELP_ARTICLES);
 try{globalThis.fetch=()=>{throw new Error('Rede indisponível');};for(const q of ['cadastro','recuperar','Ollama'])assert.ok(searchHelpArticles(q).length);}
 finally{globalThis.fetch=original;}
 assert.equal(JSON.stringify(HELP_ARTICLES),initial);
 const source=readFileSync(new URL('../src/help-center.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:fetch|invoke|transact|executeApprovedActionPlan|moveToTrash|purge|localStorage)\s*\(/);
 assert.doesNotMatch(source,/innerHTML|outerHTML|insertAdjacentHTML/);
});

test('Atalhos não aceitam URLs, execução de comandos, exclusão ou alterações de preferências',()=>{
 for(const action of [
  {label:'Apagar',view:'purge'},{label:'Enviar',view:'https://example.com'},
  {label:'Comando',view:'workspace',command:'cmd.exe'},{label:'Alterar',view:'settings',settingsCategory:'system',setting:'reset'},
  {label:'Misturado',articleId:'welcome',view:'trash'},{label:'Artigo ausente',articleId:'no-such-article'},
  {label:'Categoria errada',view:'settings',settingsCategory:'unknown'},{label:'Campo errado',view:'register',settingsCategory:'system'},
 ])assert.equal(resolveHelpAction(action),null);
 assert.deepEqual(resolveHelpAction({label:'Diagnósticos',view:'settings',settingsCategory:'system',setting:'diagnostics'}),{label:'Diagnósticos',view:'settings',settingsCategory:'system',setting:'diagnostics'});
});

test('Metadados usam versão fornecida e não inferem autoria individual, contato ou licença',()=>{
 const metadata=Object.fromEntries(helpAboutMetadata('2.3.4','Aplicativo desktop'));
 assert.equal(metadata['Versão'],'2.3.4');assert.equal(metadata['Origem da versão'],'Aplicativo desktop');
 assert.equal(metadata.Identidade,'OCSIS');assert.match(metadata['Autoria individual'],/Não confirmada/);
 assert.match(metadata['Licença de distribuição'],/Não declarada/);
 assert.doesNotMatch(JSON.stringify(metadata),/bruno|@|you|MIT|Apache/i);
});

test('Manual distingue originais, registros, backup de preferências e capacidades indisponíveis',()=>{
 const article=id=>JSON.stringify(HELP_ARTICLES.find(a=>a.id===id));
 assert.match(article('references'),/não cria, por si só, uma cópia de segurança/);
 assert.match(article('trash-permanent'),/não exclui os arquivos físicos originais/);
 assert.match(article('trash-restore'),/Não há prazo automático de eliminação/);
 assert.match(article('vault'),/não há adaptador de conversão instalado/);
 assert.match(article('preferences-backup'),/não incluem assets, caminhos, histórico de conversas ou credenciais/);
 assert.match(article('ollama-setup'),/não baixa modelos automaticamente/);
});

test('Configurações integram Ajuda, versão nativa e diagnósticos sem descrições antigas de IA inexistente',()=>{
 const source=readFileSync(new URL('../src/settings-ui.js',import.meta.url),'utf8');
 assert.match(source,/Central de Ajuda/);assert.match(source,/mountHelpCenter/);assert.match(source,/helpCenter\.setVersion\(v\)/);
 assert.match(source,/if\(cat==='system'\)refreshDiagnostics\(\)/);
 assert.doesNotMatch(source,/Nenhuma IA real foi conectada|A assistente Nautia está em preparação/);
});
