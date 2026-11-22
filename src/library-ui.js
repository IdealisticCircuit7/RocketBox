import { createIcon } from './icons.js';
import { createAssetIconElement } from './services/assetIconDom';
import { filterAssets, folderPath, itemKey, trashEntries } from './workspace-store.js';

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function button(text, icon, callback, className = 'btn-ghost') {
  const node = element('button', text, className); node.type = 'button';
  if (icon) node.prepend(createIcon(icon));
  node.addEventListener('click', callback); return node;
}

export function initializeLibrary({ store, notify, onChange, preferences }) {
  let tab = 'folders', presentation = 'cards', dragRef = null;
  const selected = new Set();
  const dropzone = document.getElementById('floating-trash');
  const confirmation = document.getElementById('collection-confirm');
  const details = document.getElementById('asset-details');
  const filters = () => Object.fromEntries(['query', 'category', 'extension', 'tag', 'folder', 'sort'].map(name => [name, document.getElementById(`library-${name}`)?.value ?? '']));
  const current = ref => store.snapshot()[ref.type === 'folder' ? 'folders' : 'assets'].find(i => i.id === ref.id);
  function run(operation, success) {
    try {
      const result = operation(); onChange(); refresh();
      if (success) notify(typeof success === 'function' ? success(result) : success);
      return true;
    } catch (error) { notify(`Operação não concluída. ${error.message}`); return false; }
  }
  function ask({ title, message, permanent = false, submitLabel }) {
    if (confirmation.open) return Promise.resolve(false);
    document.getElementById('collection-confirm-title').textContent = title;
    document.getElementById('collection-confirm-message').textContent = message;
    const token = document.getElementById('purge-token');
    const submit = document.getElementById('collection-confirm-submit');
    document.getElementById('purge-token-field').hidden = !permanent;
    token.value = ''; submit.disabled = permanent;
    submit.textContent = submitLabel || (permanent ? 'Excluir permanentemente' : 'Mover para a lixeira');
    submit.classList.toggle('btn-danger', permanent);
    token.oninput = () => { submit.disabled = token.value !== 'EXCLUIR'; };
    confirmation.returnValue = '';
    confirmation.showModal(); document.getElementById('collection-confirm-cancel').focus();
    return new Promise(resolve => confirmation.addEventListener('close', () => resolve(confirmation.returnValue === 'confirm'), { once: true }));
  }
  async function trash(ref, { confirm = true } = {}) {
    try {
      const record = current(ref), targets = store.plan([ref]);
      const folders = targets.filter(i => i.type === 'folder').length;
      if ((confirm || (ref.type === 'folder' && preferences.snapshot().confirmFolders)) && !await ask({ title: `Mover ${ref.type === 'folder' ? 'pasta' : 'asset'} para a lixeira?`, message: `“${record.name || record.nome}”: ${targets.length} registro(s), incluindo ${folders} pasta(s) e ${targets.length - folders} asset(s). A hierarquia será preservada para restauração. Nenhum arquivo do disco será apagado.` })) return;
      if (run(() => store.moveToTrash([ref]))) {
        focusCurrentView();
        notify('Item movido para a lixeira.', { label: 'Desfazer', run: () => restore([ref]) });
      }
    } catch (error) { notify(error.message); }
  }
  async function restore(refs) {
    if (refs.length > 1 && preferences.snapshot().confirmBatch) {
      try {
        const total = store.plan(refs, 'restore').length;
        if (!await ask({ title:'Restaurar seleção?', message:`${total} registro(s), incluindo descendentes, serão restaurados. A hierarquia será preservada quando o destino estiver disponível.`, submitLabel:'Restaurar selecionados' })) return;
      } catch (error) { notify(error.message); return; }
    }
    if (run(() => store.restore(refs), result => `Restauração concluída.${result.relocated.length ? ' Destino original indisponível: itens recuperados na raiz do Convés.' : ''}${result.renamed.length ? ' Nomes em conflito receberam sufixo, sem sobrescrever registros.' : ''}`)) {
      selected.clear(); renderTrash();
      if (!document.getElementById('view-trash').hidden) document.getElementById('trash-select-all').focus();
      else focusCurrentView();
    }
  }
  async function purge(refs, { empty = false } = {}) {
    if (!refs.length) return;
    try {
      const affected = store.plan(refs, 'purge');
      if (!await ask({ title: empty ? 'Esvaziar lixeira?' : 'Eliminar selecionados?', submitLabel: empty ? 'Esvaziar lixeira' : 'Eliminar selecionados', message: `${affected.length} registro(s) do RocketBox, incluindo descendentes, serão removidos definitivamente. Esta ação não pode ser desfeita. Os arquivos externos no disco não serão apagados. Digite EXCLUIR para confirmar.`, permanent: true })) return;
      if (run(() => store.purge(refs), 'Registros excluídos permanentemente. Arquivos externos preservados.')) {
        selected.clear(); document.getElementById('trash-select-all').focus();
      }
    } catch (error) { notify(error.message); }
  }
  function showDetails(asset) {
    const data = store.snapshot();
    document.getElementById('asset-details-title').textContent = asset.nome;
    const list = document.getElementById('asset-details-data'); list.replaceChildren();
    const kindLabels = { asset: 'Asset Individual', project: 'Projeto de Software / Engine', package: 'Pacote de Assets' };
    const softwareLabels = { unreal: 'Unreal Engine', unity: 'Unity', blender: 'Blender', other: 'Outro', unknown: 'Desconhecido' };
    const statusLabels = { not_verified: 'Não verificado', verified: 'Formato reconhecido', warning: 'Requer atenção', unsupported: 'Incompatível / Não suportado' };
    const targetList = Array.isArray(asset.targetSoftware) && asset.targetSoftware.length
      ? asset.targetSoftware.map(s => softwareLabels[s] || s).join(', ')
      : null;
    for (const [label, value] of [
      ['Modalidade', kindLabels[asset.kind] || 'Asset Individual'],
      ['Caminho no disco', asset.caminho],
      ['Software de origem', softwareLabels[asset.sourceSoftware] || 'Desconhecido'],
      ['Destinos pretendidos', targetList || (asset.engine && asset.engine !== 'Qualquer' ? asset.engine : 'Não especificado')],
      ['Tipo / categoria', asset.categoria],
      ['Formato detectado', asset.detectedFormat || asset.formato],
      ['Tipo técnico', asset.technicalType || asset.formato],
      ['Estado de verificação', statusLabels[asset.verificationStatus] || 'Não verificado'],
      ['Pasta', folderPath(data, asset.folder)],
      ['Etiquetas', (asset.tags || []).join(', ') || 'Sem etiquetas'],
      ['Cadastro', asset.createdAt ? new Date(asset.createdAt).toLocaleString('pt-BR') : 'Data não registrada']
    ]) list.append(element('dt', label), element('dd', value || 'Não informado'));
    details.showModal();
  }
  document.getElementById('asset-details-close').addEventListener('click', () => details.close());
  document.getElementById('collection-confirm-cancel').addEventListener('click', () => confirmation.close('cancel'));
  document.getElementById('collection-confirm-form').addEventListener('submit', event => { event.preventDefault(); if (!document.getElementById('collection-confirm-submit').disabled) confirmation.close('confirm'); });

  const context = document.getElementById('item-context');
  function showContext(ref) {
    const record = current(ref); if (!record || record.deleted) return;
    document.getElementById('item-context-title').textContent = record.nome || record.name;
    const actions = document.getElementById('item-context-actions'); actions.replaceChildren();
    if (ref.type === 'asset') actions.append(button('Ver detalhes', 'help', () => { context.close(); showDetails(record); }));
    actions.append(button('Mover para...', 'folder', () => { context.close(); window.dispatchEvent(new CustomEvent('rocketbox:open-move-modal', { detail: ref })); }));
    actions.append(button('Mover para a lixeira', 'trash', () => { context.close(); trash(ref); }, 'btn-ghost btn-danger'));
    actions.append(button('Cancelar', null, () => context.close())); context.showModal();
  }
  function focusCurrentView() {
    document.querySelector('.view.active h1')?.focus({ preventScroll: true });
  }
  function resetDrag() {
    dragRef = null; dropzone.hidden = true; document.body.classList.remove('is-item-dragging');
    dropzone.classList.remove('drop-valid', 'drop-invalid', 'drop-ready');
    document.querySelectorAll('.collection-dragging').forEach(n => n.classList.remove('collection-dragging'));
    document.getElementById('trash-drop-message').textContent = 'Solte aqui para remover do Convés';
  }
  function attachItem(card, ref) {
    card.tabIndex = 0; card.dataset.itemKey = itemKey(ref); card.draggable = true;
    card.setAttribute('aria-keyshortcuts', 'Delete');
    const title = current(ref)?.nome || current(ref)?.name || 'Item';
    card.setAttribute('aria-label', `${title}. Delete move para a lixeira. Menu de contexto disponível.`);
    let actions = card.querySelector('.folder-actions');
    if (!actions) { actions = element('div', null, 'record-actions'); card.append(actions); }
    if (ref.type === 'asset') actions.append(button('Detalhes', 'help', () => showDetails(current(ref))));
    const remove = button('', 'trash', () => trash(ref), 'btn-ghost btn-danger item-trash');
    remove.setAttribute('aria-label', `Mover ${title} para a lixeira`); remove.title = 'Mover para a lixeira (Delete)'; actions.append(remove);
    card.addEventListener('contextmenu', event => { event.preventDefault(); showContext(ref); });
    card.addEventListener('keydown', event => {
      if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Delete') { event.preventDefault(); event.stopPropagation(); trash(ref); }
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); showContext(ref); }
    });
    card.addEventListener('dragstart', event => startItemDrag(event, card, ref, title));
  }
  function startItemDrag(event, card, ref, title) {
      if (current(ref)?.deleted || event.target.closest('.record-actions, .folder-actions')) { event.preventDefault(); return; }
      dragRef = ref; dropzone.hidden = false; document.body.classList.add('is-item-dragging');
      event.dataTransfer.setData('text/plain', itemKey(ref));
      event.dataTransfer.setData('application/x-rocketbox-item', JSON.stringify(ref));
      event.dataTransfer.effectAllowed = 'move'; card.classList.add('collection-dragging');
      dropzone.classList.add('drop-ready'); document.getElementById('trash-drop-message').textContent = `Solte para remover “${title}” do Convés`;
  }
  const deck = document.getElementById('conves-react-root');
  function deckItem(event) {
    const card = event.target.closest('[data-deck-id]');
    return card && { card, ref: {type:card.dataset.deckType, id:card.dataset.deckId} };
  }
  deck.addEventListener('dragstart', event => {
    const item = deckItem(event);
    if (!item) return;
    const record = current(item.ref);
    if (record) startItemDrag(event,item.card,item.ref,record.name || record.nome);
  });
  function dragValid(event) { return dragRef && [...event.dataTransfer.types].includes('application/x-rocketbox-item') && current(dragRef) && !current(dragRef).deleted; }
  function acceptTrashDrag(event) {
    event.preventDefault(); const valid = dragValid(event);
    event.dataTransfer.dropEffect = valid ? 'move' : 'none';
    dropzone.classList.toggle('drop-valid', !!valid); dropzone.classList.toggle('drop-invalid', !valid);
    if (!valid) document.getElementById('trash-drop-message').textContent = 'Arrasto inválido: use um item ativo do RocketBox';
  }
  dropzone.addEventListener('dragenter', acceptTrashDrag);
  dropzone.addEventListener('dragover', acceptTrashDrag);
  dropzone.addEventListener('dragleave', event => { if (!dropzone.contains(event.relatedTarget)) { dropzone.classList.remove('drop-valid', 'drop-invalid'); if (!dragRef) resetDrag(); } });
  dropzone.addEventListener('drop', async event => {
    event.preventDefault();const ref=dragValid(event)?dragRef:null;
    let refs=ref?[ref]:[];
    try {const raw=event.dataTransfer.getData('application/x-rocketbox-deck-drag');if(raw&&ref){const p=JSON.parse(raw);if(p.kind==='assets'){if(ref.type!=='asset'||!Array.isArray(p.assetIds)||p.assetIds.length>1000||!p.assetIds.includes(ref.id)||p.assetIds.some(id=>typeof id!=='string'))throw Error('Seleção de arrasto inválida');refs=[...new Set(p.assetIds)].map(id=>({type:'asset',id}));if(refs.some(r=>!current(r)||current(r).deleted))throw Error('Seleção de arrasto inativa');}}}
    catch(error){resetDrag();notify(`Arrasto rejeitado: ${error.message}`);return;}
    resetDrag();if(!refs.length){notify('Arrasto ignorado: nenhum registro foi alterado.');return;}
    if(refs.length===1){trash(refs[0],{confirm:false});return;}
    if(preferences.snapshot().confirmBatch&&!await ask({title:'Mover seleção para a lixeira?',message:`${refs.length} assets. Nenhum arquivo físico será removido.`,submitLabel:'Mover para a lixeira'}))return;
    if(run(()=>store.moveToTrash(refs))){focusCurrentView();notify(`${refs.length} assets movidos para a lixeira.`,{label:'Desfazer',run:()=>restore(refs)});}
  });
  window.addEventListener('blur', resetDrag);
  document.addEventListener('dragend', resetDrag);
  document.addEventListener('drop', resetDrag);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && dragRef) { resetDrag(); notify('Arrasto cancelado.'); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetDrag(); });

  function assetCard(asset, data) {
    const card = element('article', null, 'asset-card library-asset');
    const header = element('div', null, 'record-heading'); header.append(createAssetIconElement(asset), element('strong', asset.nome));
    const extension = preferences.snapshot().showExtensions ? `${asset.formato || 'Sem extensão'} · ` : '';
    card.append(header, element('p', `${extension}${asset.categoria || 'Sem categoria'}`), element('p', folderPath(data, asset.folder), 'asset-location'));
    const tags = element('div', null, 'tag-list');
    for (const tag of asset.tags || []) tags.append(element('span', tag, 'tag-chip'));
    card.append(tags); attachItem(card, { type: 'asset', id: asset.id }); return card;
  }
  function renderGlobal() {
    const list = document.getElementById('global-assets');
    if (!list) return;
    const data = store.snapshot(), assets = filterAssets(data, filters());
    const countEl = document.getElementById('library-result-count');
    if (countEl) countEl.textContent = `${assets.length} de ${data.assets.filter(a => !a.deleted).length} assets ativos`;
    list.replaceChildren();
    list.classList.toggle('library-list', presentation === 'list');
    if (!assets.length) list.append(element('p', 'Nenhum asset encontrado. Ajuste os filtros ou registre um asset.', 'collection-empty'));
    else assets.forEach(asset => list.append(assetCard(asset, data)));
  }
  function updateFilter(name, options) {
    const select = document.getElementById(`library-${name}`);
    if (!select) return;
    const previous = select.value;
    const label = select.options[0].text;
    select.replaceChildren(new Option(label, ''));
    options.forEach(([value, text]) => select.add(new Option(text, value)));
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
  }
  const trashControl = id => document.getElementById('trash-' + id);
  let visibleTrash = [];
  for (const id of ['query','type','origin','order','layout']) {
    trashControl(id).addEventListener(id === 'query' ? 'input' : 'change', renderTrash);
  }
  function inferTrashOrigin(record) {
    if (record.type === 'folder') return '—';
    if (record.originSoftware && record.originSoftware !== 'Desconhecido') return record.originSoftware;
    const fmt = String(record.formato || '').toUpperCase();
    if (fmt === 'BLEND') return 'Blender';
    if (fmt === 'UASSET' || fmt === 'UPROJECT') return 'Unreal Engine';
    if (fmt === 'UNITYPACKAGE') return 'Unity';
    return record.engineFoco || '—';
  }
  function renderTrash() {
    const data = store.snapshot(), allEntries = trashEntries(data);
    const origin = trashControl('origin'), previous = origin.value;
    const locations = [...new Set(allEntries.map(r => r.deleted.originalLocation))].sort();
    origin.replaceChildren(new Option('Todas as origens', ''), ...locations.map(value => new Option(value, value)));
    if (locations.includes(previous)) origin.value = previous;
    const query = trashControl('query').value.trim().toLocaleLowerCase();
    const entries = allEntries.filter(r => (!origin.value || r.deleted.originalLocation === origin.value) && (!trashControl('type').value || r.type === trashControl('type').value) && (r.name || r.nome).toLocaleLowerCase().includes(query));
    if (trashControl('order').value === 'asc') entries.reverse();
    visibleTrash = entries;
    const validKeys = new Set(entries.map(itemKey));
    for (const key of selected) if (!validKeys.has(key)) selected.delete(key);
    const list = document.getElementById('trash-items'); list.replaceChildren();
    list.dataset.layout = trashControl('layout').value;
    trashControl('record-count').textContent = allEntries.length + (allEntries.length === 1 ? ' item na lixeira' : ' itens na lixeira');
    if (entries.length && list.dataset.layout === 'list') {
      const header = element('div',null,'explorer-columns trash-columns');
      for (const name of ['Nome','Tipo','Origem','Local original','Excluído em ↓','']) header.append(element('span',name));
      list.append(header);
    }
    if (allEntries.length && !entries.length) list.append(element('p','Nenhum registro corresponde aos filtros.','collection-empty'));
    if (!allEntries.length) list.append(element('p', 'A lixeira está vazia. Seus arquivos externos permanecem no disco.', 'collection-empty'));
    for (const record of entries) {
      const ref = { type: record.type, id: record.id }, key = itemKey(ref);
      const card = element('article', null, 'trash-record');
      card.tabIndex = 0; card.dataset.trashKey = key;
      card.setAttribute('aria-label', `${record.name || record.nome}. Item da lixeira. Shift+F10 abre ações da seleção.`);
      card.classList.toggle('selected', selected.has(key));
      const label = element('label', null, 'trash-select');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(key);
      checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(key) : selected.delete(key); card.classList.toggle('selected', checkbox.checked); updateSelection(); });
      const titleWrap = element('div', null, 'trash-record__title');
      titleWrap.append(element('strong', record.name || record.nome), element('small', record.caminho || record.deleted.originalLocation));
      label.append(checkbox, record.type === 'folder' ? createIcon('folder') : createAssetIconElement(record), titleWrap);
      const typeBadge = element('span', record.type === 'folder' ? 'Pasta' : record.categoria || 'Asset', 'trash-type-pill');
      const originSpan = element('span', inferTrashOrigin(record), 'trash-origin-cell');
      const locSpan = element('span', record.deleted.originalLocation, 'trash-location-cell');
      const timeEl = element('time', new Date(record.deleted.at).toLocaleString('pt-BR'));
      const menuBtn = element('button', '⋯', 'nautia-row-action-btn');
      menuBtn.type = 'button';
      menuBtn.title = 'Ações do item';
      menuBtn.addEventListener('click', event => { event.stopPropagation(); openTrashContext(ref); });
      card.append(label, typeBadge, originSpan, locSpan, timeEl, menuBtn);
      card.addEventListener('click', event => {
        if (event.target.closest('button, input, label')) return;
        checkbox.checked = !checkbox.checked;
        checkbox.checked ? selected.add(key) : selected.delete(key);
        card.classList.toggle('selected', checkbox.checked); updateSelection();
      });
      card.addEventListener('contextmenu', event => { event.preventDefault(); openTrashContext(ref); });
      card.addEventListener('keydown', event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); openTrashContext(ref); }
      });
      list.append(card);
    }
    updateSelection();
  }
  function selectedRefs() { return trashEntries(store.snapshot()).filter(record => selected.has(itemKey(record))).map(r => ({ type: r.type, id: r.id })); }
  function updateSelection() {
    const inspector = trashControl('inspector');
    const records = visibleTrash.filter(record => selected.has(itemKey(record)));
    inspector.replaceChildren();
    if (records.length === 1) {
      const record = records[0], ref = {type:record.type,id:record.id};
      const head = element('div', null, 'studio-inspector__header');
      const headText = element('div', null, 'studio-inspector__title-block');
      headText.append(
        element('span', record.type === 'folder' ? 'PASTA NA LIXEIRA' : 'ASSET NA LIXEIRA', 'nautia-eyebrow'),
        element('h3', record.name || record.nome)
      );
      head.append(headText);
      const preview = element('div', null, 'studio-inspector__preview');
      const glyph = element('span', record.type === 'folder' ? '📁' : null, 'studio-inspector__preview-glyph');
      if(record.type !== 'folder') glyph.append(createAssetIconElement(record));
      const badge = element('span', record.type === 'folder' ? 'PASTA' : (record.formato || record.categoria || 'ASSET'), 'studio-inspector__preview-badge');
      preview.append(glyph, badge);
      const meta = element('dl', null, 'studio-inspector__meta');
      const pairs = [
        ['Caminho original', record.caminho || record.deleted.originalLocation],
        ['Local no Convés', record.deleted.originalLocation],
        ['Origem', inferTrashOrigin(record)],
        ['Excluído em', new Date(record.deleted.at).toLocaleString('pt-BR')],
      ];
      for (const [dtText, ddText] of pairs) {
        const row = element('div');
        row.append(element('dt', dtText), element('dd', ddText));
        meta.append(row);
      }
      const scrollBody = element('div', null, 'trash-inspector__scroll');
      scrollBody.append(head, preview, element('h4', 'Detalhes', 'trash-inspector-subtitle'), meta);
      const actions = element('div', null, 'trash-inspector-actions');
      actions.append(
        button('Restaurar este item','restore',() => restore([ref]), 'btn-restore-full'),
        button('Excluir permanentemente','trash',() => purge([ref]),'btn-ghost btn-danger btn-purge-full')
      );
      inspector.append(scrollBody, actions);
    } else if (records.length > 1) {
      const head = element('div', null, 'studio-inspector__header');
      const headText = element('div', null, 'studio-inspector__title-block');
      headText.append(element('span', 'SELEÇÃO EM LOTE', 'nautia-eyebrow'), element('h3', `${records.length} itens selecionados`));
      head.append(headText);
      const scrollBody = element('div', null, 'trash-inspector__scroll');
      scrollBody.append(head, element('p', 'Você pode restaurar todos os itens para seus locais originais ou removê-los definitivamente do índice.', 'studio-inspector__empty-text'));
      const actions = element('div', null, 'trash-inspector-actions');
      actions.append(
        button('Restaurar selecionados','restore',() => restore(selectedRefs()), 'btn-restore-full'),
        button('Excluir permanentemente','trash',() => purge(selectedRefs()),'btn-ghost btn-danger btn-purge-full')
      );
      inspector.append(scrollBody, actions);
    } else {
      inspector.append(
        element('h3','Detalhes'),
        element('p', 'Selecione um item na lista da lixeira para consultar seu caminho original, data de exclusão e opções de restauração.', 'studio-inspector__empty-text')
      );
    }

    document.getElementById('trash-selection-count').textContent = `${selected.size} item(ns) selecionado(s)`;
    document.getElementById('restore-selected').disabled = selected.size === 0;
    document.getElementById('empty-trash').disabled = trashEntries(store.snapshot()).length === 0;
    document.getElementById('purge-selected').disabled = selected.size === 0;
    const all = document.getElementById('trash-select-all'), count = visibleTrash.length;
    all.checked = count > 0 && selected.size === count; all.indeterminate = selected.size > 0 && selected.size < count;
  }
  function openTrashContext(ref = null) {
    if (ref && !selected.has(itemKey(ref))) { selected.clear(); selected.add(itemKey(ref)); renderTrash(); }
    document.getElementById('item-context-title').textContent = `${selected.size} item(ns) selecionado(s)`;
    const actions = document.getElementById('item-context-actions'); actions.replaceChildren();
    const recover = button('Restaurar selecionados', 'restore', () => { const refs = selectedRefs(); context.close(); restore(refs); });
    const remove = button('Eliminar selecionados', 'trash', () => { const refs = selectedRefs(); context.close(); purge(refs); }, 'btn-ghost btn-danger');
    recover.disabled = remove.disabled = selected.size === 0;
    actions.append(recover, remove, button('Cancelar', null, () => context.close()));
    context.showModal();
  }
  document.getElementById('trash-items').addEventListener('contextmenu', event => {
    if (!event.target.closest('.trash-record')) { event.preventDefault(); openTrashContext(); }
  });
  document.getElementById('empty-trash').addEventListener('click', () => purge(trashEntries(store.snapshot()).map(r => ({ type: r.type, id: r.id })), { empty: true }));
  document.getElementById('trash-select-all').addEventListener('change', event => { selected.clear(); if (event.target.checked) visibleTrash.forEach(r => selected.add(itemKey(r))); renderTrash(); });
  document.getElementById('restore-selected').addEventListener('click', () => restore(selectedRefs()));
  document.getElementById('purge-selected').addEventListener('click', () => purge(selectedRefs()));
  for (const name of ['query', 'category', 'extension', 'tag', 'folder', 'sort']) document.getElementById(`library-${name}`)?.addEventListener(name === 'query' ? 'input' : 'change', renderGlobal);
  for (const mode of ['cards', 'list']) document.getElementById(`library-${mode}`)?.addEventListener('click', () => {
    try { preferences.set('assetView', mode); } catch (error) { notify(error.message); }
  });
  function selectTab(name) {
    tab = name;
    document.querySelectorAll('[data-workspace-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.workspaceTab === tab)));
    for (const part of ['folders', 'all']) {
      const node = document.getElementById(`workspace-${part}`);
      if (node) node.hidden = part !== tab;
    }
    refresh();
  }
  document.querySelectorAll('[data-workspace-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.workspaceTab)));
  function refresh() {
    const data = store.snapshot(), active = data.assets.filter(a => !a.deleted);
    const options = key => [...new Set(active.flatMap(a => key === 'tags' ? a.tags || [] : [a[key]]).filter(Boolean))].sort().map(v => [v, v]);
    updateFilter('category', options('categoria')); updateFilter('extension', options('formato')); updateFilter('tag', options('tags'));
    updateFilter('folder', [['__root__', 'Convés / raiz'], ...data.folders.filter(f => !f.deleted).map(f => [f.id, folderPath(data, f.id)])]);
    const deletedCount = [...data.folders, ...data.assets].filter(i => i.deleted).length;
    const trashTotal = document.getElementById('trash-total');
    if (trashTotal) trashTotal.textContent = String(deletedCount);
    const allTotal = document.getElementById('all-assets-total');
    if (allTotal) allTotal.textContent = String(active.length);
    renderGlobal(); renderTrash();
  }
  refresh();
  function applyPreferences(p, changed = ['assetView','sort','initialCategory','initialExtension']) {
    if (!changed.some(key => ['assetView','sort','initialCategory','initialExtension','showExtensions'].includes(key))) return;
    if (changed.includes('assetView')) {
      presentation = p.assetView;
      for (const option of ['cards','list']) document.getElementById(`library-${option}`)?.setAttribute('aria-pressed', String(option === presentation));
    }
    for (const [key,name] of [['sort','sort'],['initialCategory','category'],['initialExtension','extension']]) {
      if (!changed.includes(key)) continue;
      const control = document.getElementById(`library-${name}`);
      if (control) control.value = [...control.options].some(o=>o.value === p[key]) ? p[key] : '';
    }
    renderGlobal();
  }
  preferences.subscribe(applyPreferences); applyPreferences(preferences.snapshot());
  return { attachItem, refresh, selectTab, cancelDrag: resetDrag, confirmAction: ask, showDetails, trash };
}
