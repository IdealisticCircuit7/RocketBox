import { mountHelpCenter } from './help-center.js';
import { mountAssetVaultSettings } from './react-mount';
import { createIcon } from './icons.js';
import { DEFAULT_PREFERENCES, parsePreferences, PREFERENCES_KEY, PREFERENCES_VERSION } from './preferences.ts';
import { WALLPAPERS, WALLPAPER_POSITIONS } from './appearance.js';
import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import packageInfo from '../package.json';
import { WORKSPACE_KEY, folderPath } from './workspace-store.js';

const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const categories = [
  ['appearance', 'Aparência', 'personalize', 'Tema, wallpaper, cores e elementos visuais.'],
  ['interface', 'Interface e Navegação', 'navigation', 'Layout, menus, atalhos e experiência de uso.'],
  ['library', 'Biblioteca e Assets', 'library', 'Padrões de registro, metadados, etiquetas e organização.'],
  ['security', 'Lixeira e Segurança', 'trash', 'Recuperação, retenção e proteção de registros.'],
  ['assistant', 'Nautia e SIA', 'nautia', 'Assistente inteligente, automações e integração com IA.'],
  ['system', 'Sistema e Desempenho', 'settings', 'Recursos, cache, backups e comportamento do app.'],
  ['help', 'Central de Ajuda', 'book-open', 'Primeiros passos, manual, perguntas frequentes e solução de problemas.'],
  ['about', 'Sobre o RocketBox', 'rocket', 'Versão, créditos, licenças e ecossistema OCSIS.'],
];
const options = (...pairs) => pairs.map(([value, label]) => ({ value, label }));
const fieldDefinitions = [
  ['appearance','theme','Tema','select','Escolha um perfil visual. Ajustes manuais de aparência ativam Personalizado.', options(['cinematic','RocketBox Cinematic'],['professional','Professional'],['performance','Performance'],['custom','Personalizado'])],
  ['appearance','accent','Cor de destaque','select','Cor das seleções e dos controles do RocketBox.',options(['cyan','Ciano'],['blue','Azul'],['purple','Roxo'])],
  ['appearance','wallpaper','Wallpaper','select','Use uma das três imagens locais disponíveis.',options(['close','Foguete • close expandido'],['original','Lançamento original'],['wide','Panorama espacial'])],
  ['appearance','wallpaperPosition','Posicionamento do wallpaper','select','Mantém a proporção da imagem. O enquadramento varia com a janela.',options(['cinema','Cinematográfico'],['center','Centralizado'],['right','Foco à direita'])],
  ['appearance','overlay','Overlay escuro','range','Equilibre o impacto da cena e a leitura da interface.',[0,85]],
  ['appearance','parallax','Parallax na Home','toggle','Movimento sutil com o cursor. Respeita movimento reduzido do sistema.'],
  ['appearance','parallaxIntensity','Intensidade do parallax','range','Deslocamento máximo de 10 px, dentro da margem de segurança.',[0,100]],
  ['appearance','lighting','Efeitos luminosos','toggle','Iluminação nas bordas, ícones e barras de seleção.'],
  ['appearance','glow','Intensidade do brilho','range','Controle o glow sem afetar os indicadores de foco.',[0,100]],
  ['appearance','panelOpacity','Opacidade dos painéis','range','Quanto maior, menos o wallpaper atravessa os painéis.',[40,100]],
  ['appearance','animationIntensity','Intensidade das animações','range','Ajusta o tempo e a amplitude das microinterações. Zero desativa animações.',[0,100]],
  ['interface','layout','Posição do menu','select','Alterne instantaneamente entre menu lateral e menu superior.',options(['layout-left','Menu lateral'],['layout-top','Menu superior'])],
  ['interface','showNavLabels','Nomes junto aos ícones','toggle','O nome acessível permanece disponível para leitores de tela.'],
  ['interface','compactMenu','Menu compacto','toggle','Reduz espaçamentos e largura da navegação lateral.'],
  ['interface','density','Densidade da interface','select','Ajusta controles e espaçamento dos cartões.',options(['comfortable','Confortável'],['compact','Compacta'])],
  ['interface','assetView','Visualização dos assets','select','Preferência compartilhada com Todos os Assets no Convés.',options(['cards','Grade'],['list','Lista'])],
  ['interface','tooltips','Dicas contextuais','toggle','Exibe as dicas de texto ao repousar o cursor sobre ações.'],
  ['library','sort','Ordenação padrão','select','Aplicada à biblioteca global ao iniciar e ao alterar esta preferência.',options(['name','Nome A–Z'],['name-desc','Nome Z–A'],['recent','Mais recentes'],['format','Formato'])],
  ['library','initialCategory','Categoria inicial','select','Filtro inicial da biblioteca global, com opções dos registros ativos.',[]],
  ['library','initialExtension','Extensão inicial','select','Filtro inicial; todas as pastas continuam incluídas na consulta.',[]],
  ['library','defaultFolder','Pasta padrão de cadastro','select','Destino de metadados ao abrir Registrar Asset pela raiz. Não importa nem move arquivos.',[]],
  ['library','showExtensions','Exibir extensões','toggle','Mostra o formato nos cartões. Detalhes mantém o registro completo.'],
  ['library','showMetadata','Metadados nos cartões','toggle','Exibe caminho, categoria, localização e etiquetas. Não remove dados.'],
  ['library','duplicateMode','Caminhos duplicados','select','Compara referências locais por caminho, ignorando maiúsculas e separadores. Não compara conteúdo.',options(['warn','Avisar antes de cadastrar'],['block','Bloquear novo cadastro'],['allow','Permitir sem aviso'])],
  ['security','confirmFolders','Confirmar ao arrastar pastas','toggle','Também exige confirmação ao soltar uma pasta na lixeira. Botões e Delete já pedem confirmação.'],
  ['security','confirmBatch','Confirmar restauração em lote','toggle','Mostra a contagem antes de restaurar mais de um item selecionado. Exclusões permanentes sempre exigem confirmação.'],
  ['assistant','showNautiaAvatar','Ilustração da Nautia','toggle','Exibe o avatar animado no módulo Nautia.'],
  ['assistant','siaExpanded','Painel SIA expandido ao iniciar','toggle','Abre o painel existente de consulta ao motor Python no Convés.'],
  ['system','startup','Tela de inicialização','select','Aplicada quando o app abre sem uma rota explícita.',options(['home','Início'],['workspace','Convés'],['register','Registrar Asset'],['trash','Lixeira'],['nautia','Nautia'],['settings','Configurações'])],
  ['system','performance','Modo de desempenho','toggle','Suspende parallax, glow, blur e animações. Usa painéis opacos, preservando os seus ajustes.'],
  ['system','animations','Animações não essenciais','toggle','Controla a abertura orbital, transições e movimento do wallpaper. A preferência do sistema tem prioridade.'],
];

export function initializeSettings({ preferences, store, notify, confirm, navigate }) {
  const host = document.getElementById('settings-root');
  const records = [], panels = new Map(), bodies = new Map(), navButtons = new Map(), logs = [];
  let category = 'appearance', version = packageInfo.version, pendingImport = null;
  function log(message) { logs.unshift({ at: new Date().toISOString(), event: message }); logs.splice(40); }
  function action(label, icon, fn, cls = 'btn-ghost') { const b = el('button', label, cls); b.type = 'button'; if (icon) b.prepend(createIcon(icon)); b.addEventListener('click', fn); return b; }
  function save(fn) {
    try { fn(); status.textContent = 'Salvo neste dispositivo'; }
    catch (error) { status.textContent = 'Não foi possível salvar'; notify(error.message); log('Gravação de preferências recusada'); sync(preferences.snapshot()); }
  }
  const searchWrap = el('div', null, 'settings-search');
  const searchLabel = el('label', 'Localizar uma configuração'); searchLabel.htmlFor = 'settings-search';
  const search = el('input'); search.id = 'settings-search'; search.type = 'search'; search.placeholder = 'Busque por parallax, menu superior, backup…'; search.autocomplete = 'off';
  search.setAttribute('aria-controls', 'settings-results');
  const results = el('div', null, 'settings-results'); results.id = 'settings-results'; results.hidden = true;
  const searchStatus = el('p', '', 'sr-only'); searchStatus.setAttribute('role', 'status');
  const status = el('span', 'Preferências locais', 'settings-save-state'); status.id = 'settings-save-state'; status.setAttribute('role', 'status');
  searchWrap.append(searchLabel, search, results, searchStatus, status);
  const layout = el('div', null, 'settings-layout');
  const sidebar = el('nav', null, 'settings-sidebar'); sidebar.setAttribute('aria-label', 'Categorias de configurações');
  const content = el('div', null, 'settings-content');
  host.append(searchWrap, layout); layout.append(sidebar, content);
  const back = action('Todas as categorias','navigation',() => {
    layout.classList.remove('detail-open');
    searchWrap.hidden=false;
    navButtons.get(category)?.focus();
  });
  back.classList.add('settings-back');
  content.prepend(back);
  function showCategory(id, focus = false) {
    if(!panels.has(id))return;
    category = id;
    searchWrap.hidden=id==='help';
    layout.classList.add('detail-open');
    for (const [key, panel] of panels) panel.hidden = key !== id;
    for (const [key, b] of navButtons) b.setAttribute('aria-pressed', String(key === id));
    if (focus) panels.get(id).querySelector('h2').focus({ preventScroll: true });
  }
  for (const [id, title, icon, description] of categories) {
    const b = el('button', null, 'btn-ghost settings-card-btn');
    b.type = 'button';
    const iconWrap = el('span', null, 'settings-card-btn__icon');
    iconWrap.append(createIcon(icon));
    const titleEl = el('strong', title, 'settings-card-btn__title');
    const descEl = el('small', description, 'settings-card-btn__desc');
    const chev = el('span', '›', 'settings-card-btn__chevron');
    chev.setAttribute('aria-hidden', 'true');
    b.append(iconWrap, titleEl, descEl, chev);
    b.dataset.category = id;
    b.setAttribute('aria-controls', `settings-${id}`);
    b.addEventListener('click', () => showCategory(id, true));
    sidebar.append(b);
    navButtons.set(id, b);

    const panel = el('section', null, 'settings-category');
    panel.id = `settings-${id}`;
    panel.setAttribute('aria-labelledby', `settings-heading-${id}`);
    const header = el('header', null, 'settings-category__header');
    const headerIcon = el('span', null, 'settings-category__icon');
    headerIcon.append(createIcon(icon));
    const headerText = el('div', null, 'settings-category__titles');
    const heading = el('h2', title);
    heading.id = `settings-heading-${id}`;
    heading.tabIndex = -1;
    headerText.append(heading, el('p', description, 'muted'));
    const stripes = el('span', '///', 'settings-category__stripes');
    stripes.setAttribute('aria-hidden', 'true');
    header.append(headerIcon, headerText, stripes);
    const body = el('div', null, 'settings-category__body'); panel.append(header, body); bodies.set(id, body);
    panels.set(id, panel);
    content.append(panel);
  }
  sidebar.addEventListener('keydown', event => {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault(); const ids = [...navButtons.keys()], index = ids.indexOf(category);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length;
    navButtons.get(ids[next]).click(); navButtons.get(ids[next]).focus();
  });
  for (const [cat, key, title, type, description, choices] of fieldDefinitions) {
    const row = el('div', null, 'settings-row'); row.id = `setting-${key}`; row.tabIndex = -1;
    const copy = el('div', null, 'setting-copy'), label = el('label', title), help = el('p', description);
    help.id = `help-${key}`; label.htmlFor = `pref-${key}`; copy.append(label, help);
    const control = el('div', null, 'setting-control');
    const input = el(type === 'select' ? 'select' : 'input'); input.id = `pref-${key}`; input.dataset.pref = key; input.setAttribute('aria-describedby', help.id);
    if (type === 'select') choices.forEach(({ value, label }) => input.add(new Option(label, value)));
    else if (type === 'toggle') { input.type = 'checkbox'; input.setAttribute('role', 'switch'); input.className = 'settings-switch'; }
    else { input.type = 'range'; input.min = choices[0]; input.max = choices[1]; input.step = 1; }
    control.append(input);
    if (type === 'range') { const output = el('output'); output.htmlFor = input.id; output.dataset.output = key; control.append(output); }
    const badge = el('span', '', 'setting-status'); badge.hidden = true; control.append(badge);
    const eventType = type === 'range' ? 'input' : 'change';
    input.addEventListener(eventType, () => save(() => {
      const value = type === 'toggle' ? input.checked : type === 'range' ? Number(input.value) : input.value;
      key === 'theme' ? preferences.setTheme(value) : preferences.set(key, value);
    }));
    row.append(copy, control); bodies.get(cat).append(row);
    records.push({ cat, key, title, description, row, input, badge });
  }
  const themes = el('div', null, 'studio-themes');
  for (const choice of fieldDefinitions.find(field => field[1] === 'theme')[5]) {
    const tile = action(choice.label, null, () => save(() => preferences.setTheme(choice.value)));
    tile.dataset.themeChoice = choice.value;
    themes.append(tile);
  }
  document.getElementById('setting-theme').append(themes);
  const palette = el('div', null, 'studio-palette');
  for (const [value,label,color] of [['cyan','Ciano','#00d4ff'],['blue','Azul','#65adff'],['purple','Roxo','#ba8cff']]) {
    const swatch = action(label, null, () => save(() => preferences.set('accent',value)));
    swatch.style.setProperty('--swatch', color);
    swatch.dataset.accentChoice = value;
    palette.append(swatch);
  }
  document.getElementById('setting-accent').append(palette);
  const preview = el('div', null, 'settings-preview'); preview.id = 'settings-preview'; preview.tabIndex = 0;
  preview.setAttribute('aria-label', 'Pré-visualização do wallpaper e dos painéis. Mova o cursor para testar o parallax.');
  const previewImage = el('img'); previewImage.alt = ''; const previewShade = el('div', null, 'preview-shade');
  const previewPanel = el('div', null, 'preview-panel'); previewPanel.append(createIcon('rocket'), el('strong', 'RocketBox'), el('span', 'Seu próximo universo começa aqui.'));
  const wallpaperKeys = Object.keys(WALLPAPERS);
  const cycleWallpaper = delta => save(() => {
    const idx = wallpaperKeys.indexOf(preferences.snapshot().wallpaper);
    const next = wallpaperKeys[(idx + delta + wallpaperKeys.length) % wallpaperKeys.length];
    preferences.set('wallpaper', next);
  });
  const prevWallBtn = el('button', '‹', 'settings-preview-arrow is-prev'); prevWallBtn.type = 'button'; prevWallBtn.setAttribute('aria-label', 'Wallpaper anterior');
  prevWallBtn.addEventListener('click', () => cycleWallpaper(-1));
  const nextWallBtn = el('button', '›', 'settings-preview-arrow is-next'); nextWallBtn.type = 'button'; nextWallBtn.setAttribute('aria-label', 'Próximo wallpaper');
  nextWallBtn.addEventListener('click', () => cycleWallpaper(1));
  const wallDots = el('div', null, 'settings-preview-dots');
  for (const key of wallpaperKeys) {
    const dot = el('button', '', 'settings-preview-dot'); dot.type = 'button'; dot.dataset.wallpaperDot = key;
    dot.setAttribute('aria-label', `Selecionar wallpaper ${key}`);
    dot.addEventListener('click', () => save(() => preferences.set('wallpaper', key)));
    wallDots.append(dot);
  }
  preview.append(previewImage, previewShade, previewPanel, prevWallBtn, nextWallBtn, wallDots, el('small', 'PRÉVIA INTERATIVA • HOME')); document.getElementById('setting-wallpaper').after(preview);
  preview.addEventListener('pointermove', event => {
    const p = preferences.snapshot(); if (!p.parallax || !p.animations || !p.animationIntensity || p.performance || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = preview.getBoundingClientRect(), x = ((event.clientX - bounds.left) / bounds.width - .5) * -12 * p.parallaxIntensity / 100;
    const y = ((event.clientY - bounds.top) / bounds.height - .5) * -8 * p.parallaxIntensity / 100;
    previewImage.style.transform = `translate(${x}px,${y}px)`;
  });
  preview.addEventListener('pointerleave', () => { previewImage.style.transform = ''; });
  function resetGroup(label, fields) {
    return action(label, 'restore', async () => {
      if (!await confirm({ title: label + '?', message: 'Somente estas preferências serão restauradas. Seus assets, pastas e lixeira serão preservados.', submitLabel: 'Restaurar preferências' })) return;
      save(() => preferences.update(Object.fromEntries(fields.map(key => [key, DEFAULT_PREFERENCES[key]]))));
    });
  }
  bodies.get('appearance').append(resetGroup('Restaurar wallpaper padrão', ['wallpaper','wallpaperPosition','overlay','parallax','parallaxIntensity']));
  bodies.get('interface').append(resetGroup('Restaurar layout padrão', ['layout','showNavLabels','compactMenu','density','assetView','tooltips']));
  bodies.get('library').append(action('Configurar grade ou lista', 'navigation', () => jump('interface','assetView')));
  function note(cat, title, message, { key = title, control = null } = {}) {
    const row = el('section', null, 'settings-note'); row.tabIndex = -1;
    row.append(el('h3', title), el('p', message)); if (control) row.append(control);
    bodies.get(cat).append(row); records.push({ cat, key, title, description: message, row }); return row;
  }
  function future(cat, title, message, choices = ['Em desenvolvimento']) {
    const select = el('select'); select.disabled = true; select.setAttribute('aria-label', title + ' — Em desenvolvimento');
    choices.forEach(label => select.add(new Option(label)));
    const n = note(cat, title, message, { control: select }); n.classList.add('settings-future'); n.prepend(el('span', 'Em desenvolvimento', 'badge'));
  }
  note('library', 'Referências e recuperação', 'No inspetor do Convés, verifique o original, abra seu diretório pai, revise um relink e exporte ou restaure cópias do cofre.');
  const safety = note('security','Proteção dos arquivos','Exclusões permanentes sempre exigem confirmação explícita e a palavra EXCLUIR. A lixeira remove apenas registros locais, nunca arquivos externos. Não existe rotina de exclusão física.');
  const trashCount = el('p'); safety.append(trashCount, action('Abrir lixeira e restaurar itens', 'trash', () => navigate('trash')));
  future('security','Retenção da lixeira','Política atual: sem exclusão automática. Prazos de 7, 30 e 90 dias ainda não estão disponíveis; nenhum item é eliminado em segundo plano.', ['Sem exclusão automática']);
  future('security','Vínculos com outros projetos','O campo Projeto associado está disponível nos registros. Relações estruturadas entre múltiplos projetos e seus avisos de dependência não estão implementados.');
  note('assistant','Conversação e ferramentas da NautIA','A assistente consulta a biblioteca e prepara planos pelas ferramentas existentes. A conversação generativa utiliza Ollama local quando disponível; o indicador de conexão informa o estado verificado.', { control: action('Abrir a NautIA e configurar o modelo','nautia',()=>navigate('nautia')) });
  note('assistant','Confirmações e histórico','Consultas, relatórios e conversas usam os serviços locais. Alterações na biblioteca exigem um plano aprovado. O histórico permite reabrir conversas; Desfazer depende do suporte da operação.');
  note('assistant','Motor especialista SIA', isTauri() ? 'Ambiente Tauri detectado. O motor Python e as regras locais operam como serviço interno integrado ao Convés e à Nautia.' : 'Prévia no navegador. As regras locais funcionam normalmente; o sub-processo Python requer abrir o aplicativo Tauri.', { control: action('Ir para o Convés Inteligente','sia', () => navigate('workspace')) });
  const system = note('system','Ambiente e armazenamento','Diagnósticos locais, sem caminhos de assets, credenciais ou conteúdo da biblioteca.', { key: 'diagnostics' });
  const diagnostics = el('dl', null, 'settings-diagnostics'); system.append(diagnostics);
  const diagnosticLog = el('pre', '', 'settings-log'); diagnosticLog.setAttribute('aria-label','Eventos não sensíveis desta sessão');
  system.append(action('Atualizar diagnósticos', 'settings', refreshDiagnostics), action('Ver eventos desta sessão', 'help', () => { diagnosticLog.hidden = !diagnosticLog.hidden; refreshDiagnostics(); }));
  diagnosticLog.hidden = true; system.append(diagnosticLog);
  const vaultSettings = note('system', 'Asset Vault — backups dos originais', 'Cofre opcional versionado com SHA-256, escopos explícitos, recuperação e limpeza confirmada.', { key: 'asset-vault' });
  const vaultHost = el('div'); vaultSettings.append(vaultHost); mountAssetVaultSettings(vaultHost);
  const transfers = note('system','Backup de preferências','Exporta somente configurações visuais e políticas. Assets, caminhos, histórico e credenciais não fazem parte deste arquivo.', { key: 'backup' });
  const fileInput = el('input'); fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.id = 'preferences-file'; fileInput.hidden = true;
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([preferences.export()], { type: 'application/json' }));
      const link = el('a'); link.href = url; link.download = `rocketbox-preferencias-v${PREFERENCES_VERSION}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      log('Exportação de preferências preparada'); notify('Arquivo de preferências preparado para download.');
    } catch { notify('Não foi possível exportar as preferências.'); }
  }
  const importReview = el('div', null, 'settings-import-review'); importReview.hidden = true;
  const importSummary = el('p');
  const applyImport = action('Aplicar preferências importadas', 'restore', () => {
    if (!pendingImport) return;
    save(() => { preferences.import(pendingImport); pendingImport = null; importReview.hidden = true; notify('Preferências importadas. Biblioteca preservada.'); log('Importação validada e aplicada'); });
  }, 'btn-primary'); applyImport.id = 'preferences-import-apply';
  importReview.append(importSummary, applyImport, action('Cancelar importação', null, () => { pendingImport = null; importReview.hidden = true; fileInput.value = ''; }));
  fileInput.addEventListener('change', async () => {
    pendingImport = null; importReview.hidden = true;
    const file = fileInput.files?.[0]; if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('Arquivo de preferências excede 100 KB.');
      const raw = await file.text(), parsed = parsePreferences(raw), current = preferences.snapshot();
      pendingImport = raw;
      importSummary.textContent = `Arquivo validado. ${Object.keys(parsed).filter(k => parsed[k] !== current[k]).length} preferência(s) diferente(s). Confira e aplique para salvar neste dispositivo. Nenhum registro da biblioteca será alterado.`;
      importReview.hidden = false; applyImport.focus(); log('Arquivo de preferências validado');
    } catch (error) { notify(error.message); log('Importação inválida recusada'); }
    fileInput.value = '';
  });
  transfers.append(action('Exportar preferências', 'arrow-up-right', download), action('Importar preferências', 'folder', () => fileInput.click()), fileInput, importReview);
  const reset = action('Restaurar todas as configurações', 'restore', async () => {
    if (!await confirm({ title:'Restaurar configurações padrão?', message:'Todos os ajustes voltarão ao padrão RocketBox Cinematic. Assets, pastas, etiquetas e itens da lixeira serão preservados. Esta ação não apaga a biblioteca.', submitLabel:'Restaurar configurações' })) return;
    save(() => { preferences.reset(); notify('Configurações padrão restauradas. Biblioteca preservada.'); log('Preferências restauradas ao padrão'); });
  }); reset.id = 'preferences-reset'; bodies.get('system').append(reset);
  const about = el('div', null, 'settings-about');
  const logo = el('img'); logo.src = new URL('./assets/branding/rocketbox-logo.png', import.meta.url).href; logo.alt = 'RocketBox by OCSIS';
  const aboutVersion = el('span', `Versão ${version}`, 'badge');
  about.append(logo, el('p','Um espaço para organizar assets e conectar possibilidades criativas.'), aboutVersion, el('p','RocketBox integra o ecossistema OCSIS: biblioteca local de metadados, organização por pastas virtuais e consultas ao motor especialista SIA.'), el('p','Tecnologias: Tauri 2, Rust, Vite, React, JavaScript, TypeScript e Python. A NautIA utiliza os serviços do aplicativo e conversação local opcional com Ollama.'), el('p','Identidade OCSIS. Autoria individual e contato público não estão confirmados nos metadados examinados. Não há licença de distribuição declarada no package.json.'));
  bodies.get('about').append(about);
  const helpHost=el('div');helpHost.tabIndex=-1;bodies.get('help').append(helpHost);
  const helpCenter=mountHelpCenter(helpHost,{
    navigate,version,
    openSettings:(cat,key)=>{
      search.value='';results.hidden=true;searchStatus.textContent='';
      if(cat==='system')refreshDiagnostics();
      if(key)jump(cat,key);else showCategory(cat,true);
    },
  });
  records.push({cat:'help',key:'manual',title:'Central de Ajuda e Manual',description:'Primeiros passos, cadastro, Convés, organização, lixeira, NautIA, Ollama, perguntas frequentes e diagnóstico.',row:helpHost});

  function refreshDiagnostics() {
    diagnostics.replaceChildren();
    let bytes = 0, storageAvailable = true;
    try { for (const key of [PREFERENCES_KEY, WORKSPACE_KEY]) { const value = localStorage.getItem(key); if (value !== null) bytes += (key.length + value.length) * 2; } } catch { storageAvailable = false; }
    for (const [name, value] of [['Versão', version],['Ambiente',isTauri() ? 'Tauri desktop' : 'Navegador / prévia'],['Armazenamento local', storageAvailable ? `${(bytes/1024).toFixed(1)} KiB estimados (UTF-16, biblioteca + preferências)` : 'Leitura indisponível'],['Biblioteca', store.readError ? 'Modo protegido: falha na leitura' : 'Snapshot local carregado'],['Preferências',preferences.status.warning || 'Valores validados'],['Movimento reduzido do sistema',matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Ativo' : 'Inativo'],['Escopo','Sem telemetria ou envio de diagnósticos']]) diagnostics.append(el('dt', name),el('dd',value));
    diagnosticLog.textContent = logs.length ? logs.map(l => `${new Date(l.at).toLocaleTimeString('pt-BR')} · ${l.event}`).join('\n') : 'Nenhum evento registrado nesta sessão.';
  }
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function jump(cat, key) {
    search.value = ''; searchStatus.textContent = ''; results.hidden = true; showCategory(cat);
    const record = records.find(r => r.cat === cat && r.key === key); if (!record) return;
    record.row.scrollIntoView({ block:'center', behavior:'instant' });
    const tile = record.row.querySelector('[aria-pressed="true"]');
    if (tile) {tile.focus({preventScroll:true});return;}
    (record.input?.disabled ? record.row : record.input || record.row).focus({ preventScroll:true });
  }
  search.addEventListener('input', () => {
    const query = normalize(search.value.trim()); results.replaceChildren(); results.hidden = !query;
    if (!query) { searchStatus.textContent = ''; return; }
    const matches = records.filter(r => normalize(`${r.title} ${r.description} ${categories.find(c=>c[0]===r.cat)[1]}`).includes(query));
    searchStatus.textContent = `${matches.length} resultado(s)`;
    if (!matches.length) results.append(el('p','Nenhuma configuração encontrada.'));
    matches.forEach(r => {
      const b = action(`${r.title} · ${categories.find(c=>c[0]===r.cat)[1]}`, null, () => jump(r.cat,r.key)); results.append(b);
    });
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') { search.value = ''; results.hidden = true; searchStatus.textContent = ''; }
    if (event.key === 'ArrowDown' && !results.hidden) { event.preventDefault(); results.querySelector('button')?.focus(); }
  });
  function refreshData() {
    const data = store.snapshot(), active = data.assets.filter(a=>!a.deleted);
    for (const [key, values, first] of [
      ['initialCategory', [...new Set(active.map(a=>a.categoria).filter(Boolean))].sort().map(v=>[v,v]), 'Todas as categorias'],
      ['initialExtension',[...new Set(active.map(a=>a.formato).filter(Boolean))].sort().map(v=>[v,v]),'Todas as extensões'],
      ['defaultFolder',data.folders.filter(f=>!f.deleted).map(f=>[f.id,folderPath(data,f.id)]),'Convés / raiz'],
    ]) {
      const select = records.find(r=>r.key===key).input, saved = preferences.snapshot()[key];
      select.replaceChildren(new Option(first,'')); values.forEach(([value,label])=>select.add(new Option(label,value)));
      if (saved && !values.some(([v])=>v===saved)) select.add(new Option('Seleção indisponível • usando todos / raiz', saved));
      select.value = saved;
    }
    trashCount.textContent = `${[...data.folders,...data.assets].filter(r=>r.deleted).length} registro(s) na lixeira, incluindo descendentes.`;
    refreshDiagnostics();
  }
  function sync(p, changed = null) {
    if (changed) {
      status.textContent = preferences.status.warning ? 'Padrões seguros • revise Sistema' : 'Salvo neste dispositivo';
      if (changed.length) log('Preferências atualizadas');
    }
    for (const {key,input,badge} of records.filter(r=>r.input)) {
      if (input.type === 'checkbox') input.checked = p[key]; else input.value = p[key];
      const output = host.querySelector(`[data-output="${key}"]`); if (output) output.value = `${p[key]}%`;
      const limited = (p.performance && ['parallax','parallaxIntensity','lighting','glow','panelOpacity','animationIntensity','animations'].includes(key)) || (key==='parallaxIntensity' && (!p.parallax || !p.animations || !p.animationIntensity)) || (key==='glow' && !p.lighting);
      input.disabled = limited; badge.hidden = !limited; badge.textContent = p.performance ? 'Suspenso no modo desempenho' : 'Ative o efeito para ajustar';
    }
    for (const swatch of palette.children) swatch.setAttribute('aria-pressed',String(swatch.dataset.accentChoice === p.accent));
    for (const tile of themes.children) tile.setAttribute('aria-pressed', String(tile.dataset.themeChoice === p.theme));
    for (const dot of wallDots.children) dot.setAttribute('aria-pressed', String(dot.dataset.wallpaperDot === p.wallpaper));
    if (previewImage.getAttribute('src') !== WALLPAPERS[p.wallpaper]) previewImage.src = WALLPAPERS[p.wallpaper];
    themes.style.setProperty('--theme-scene', 'url("' + WALLPAPERS[p.wallpaper] + '")');
    previewImage.style.objectPosition = WALLPAPER_POSITIONS[p.wallpaperPosition]; previewImage.style.transform = '';
    previewShade.style.opacity = p.overlay/100; previewPanel.style.background = `rgba(10,24,41,${p.performance ? 1 : p.panelOpacity/100})`;
    if (!changed || changed.some(key=>['initialCategory','initialExtension','defaultFolder'].includes(key))) refreshData();
    else if (!panels.get('system').hidden) refreshDiagnostics();
  }
  preferences.subscribe(sync); sync(preferences.snapshot()); showCategory(category); layout.classList.remove('detail-open');
  if (isTauri()) getVersion().then(v=>{ version=v; aboutVersion.textContent=`Versão ${v}`; helpCenter.setVersion(v); refreshDiagnostics(); }).catch(()=>log('Versão nativa indisponível; usando versão do pacote'));
  if (preferences.status.warning) { status.textContent = 'Padrões seguros • revise Sistema'; notify(preferences.status.warning); }
  return { refreshData, log };
}
