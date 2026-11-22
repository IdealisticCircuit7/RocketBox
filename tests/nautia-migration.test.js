import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferencesService, DEFAULT_PREFERENCES, PREFERENCES_KEY, PREFERENCES_VERSION, parsePreferences } from '../src/preferences.ts';
import { ROCKETBOX_ASSISTANT, resolveAssistantRoute } from '../src/assistant-identity.js';

function legacyV2(overrides = {}) {
  const { showNautiaAvatar, ...other } = DEFAULT_PREFERENCES;
  return { format:'ocsis.rocketbox.preferences', schemaVersion:2,
    preferences:{ ...other, showSynclairAvatar:showNautiaAvatar, ...overrides } };
}
function setup(raw = null, extra = {}) {
  const data = new Map(Object.entries(extra)); if (raw !== null) data.set(PREFERENCES_KEY,raw);
  const storage = { fail:false, getItem:key=>data.get(key) ?? null,
    setItem(key,value) { if (this.fail) throw new Error('Quota'); data.set(key,value); } };
  return { data, storage, service:createPreferencesService({ storage }) };
}
test('migra avatar oculto e inicialização da antiga assistente sem alterar biblioteca ou histórico', () => {
  const raw=JSON.stringify(legacyV2({showSynclairAvatar:false,startup:'synclair',layout:'layout-top',overlay:47,defaultFolder:'p'}));
  const library=JSON.stringify({assets:[{id:'a',nome:'Manual Synclaire',folder:'p'}],folders:[{id:'p',name:'Projeto'}]});
  const history='Registro histórico: Synclaire global';
  const {service,data,storage}=setup(raw,{'ocsis.rocketbox.workspace.v1':library,'ocsis.global.history':history});
  assert.equal(service.status.damaged,false); assert.equal(service.snapshot().showNautiaAvatar,false);
  assert.equal(service.snapshot().startup,'nautia'); assert.equal(service.snapshot().layout,'layout-top');
  assert.equal(service.snapshot().overlay,47); assert.equal(service.snapshot().defaultFolder,'p');
  assert.equal(data.get(PREFERENCES_KEY),raw); // Read migration is non-destructive.
  service.set('density','compact');
  const saved=JSON.parse(data.get(PREFERENCES_KEY));
  assert.equal(saved.schemaVersion,3); assert.equal(saved.preferences.showNautiaAvatar,false);
  assert.ok(!Object.hasOwn(saved.preferences,'showSynclairAvatar')); assert.equal(saved.preferences.startup,'nautia');
  assert.equal(data.get('ocsis.rocketbox.workspace.v1'),library); assert.equal(data.get('ocsis.global.history'),history);
  assert.deepEqual(createPreferencesService({storage}).snapshot(),service.snapshot());
  assert.equal([...data.keys()].filter(k=>k.startsWith(PREFERENCES_KEY)).length,1);
});
test('backup v2 continua importável e a nova exportação usa somente a identidade Nautia', () => {
  const {service}=setup(); service.import(JSON.stringify(legacyV2({showSynclairAvatar:true,startup:'workspace',assetView:'list'})));
  assert.equal(service.snapshot().showNautiaAvatar,true); assert.equal(service.snapshot().startup,'workspace');
  assert.equal(service.snapshot().assetView,'list');
  const exported=service.export(); assert.equal(JSON.parse(exported).schemaVersion,PREFERENCES_VERSION);
  assert.ok(!/synclair/i.test(exported)); assert.deepEqual(parsePreferences(exported),service.snapshot());
});
test('migração v2 rejeita campos ambíguos, valores inválidos e backups incompletos sem escrita', () => {
  const {service,data}=setup(); const missing=legacyV2(); delete missing.preferences.showSynclairAvatar;
  const incomplete=legacyV2(); delete incomplete.preferences.density;
  for (const envelope of [missing,incomplete,legacyV2({showNautiaAvatar:false}),legacyV2({showSynclairAvatar:'false'}),legacyV2({startup:'synclaire'}),legacyV2({apiKey:'segredo'})]) {
    assert.throws(()=>service.import(JSON.stringify(envelope)));
  }
  assert.equal(data.size,0); assert.deepEqual(service.snapshot(),DEFAULT_PREFERENCES);
});
test('schema atual não aceita aliases antigos em novos documentos ou atualizações', () => {
  const {service,data}=setup(), current=JSON.parse(service.export());
  assert.throws(()=>service.import(JSON.stringify({...current,preferences:{...current.preferences,showSynclairAvatar:false}})));
  assert.throws(()=>service.import(JSON.stringify({...current,preferences:{...current.preferences,startup:'synclair'}})));
  assert.throws(()=>service.update({showSynclairAvatar:false}));
  assert.equal(data.size,0);
});
test('falha de gravação após migração mantém exatamente o documento v2 original', () => {
  const raw=JSON.stringify(legacyV2({showSynclairAvatar:false,startup:'synclair'}));
  const {service,storage,data}=setup(raw); const before=service.snapshot(); storage.fail=true;
  assert.throws(()=>service.set('overlay',51),/Quota/);
  assert.equal(data.get(PREFERENCES_KEY),raw); assert.deepEqual(service.snapshot(),before);
  assert.equal(service.status.damaged,false); assert.equal(data.size,1);
  storage.fail=false; service.set('overlay',51);
  assert.equal(parsePreferences(data.get(PREFERENCES_KEY)).showNautiaAvatar,false);
});
test('reimportar preferências já migradas é idempotente e não duplica chaves', () => {
  const {service,data,storage}=setup(JSON.stringify(legacyV2({showSynclairAvatar:false,startup:'synclair'})));
  const migrated=service.export(); service.import(migrated); const expected=service.snapshot();
  service.import(service.export()); service.reload();
  assert.deepEqual(service.snapshot(),expected); assert.equal(data.size,1);
  assert.deepEqual(createPreferencesService({storage}).snapshot(),expected);
});
test('rota antiga resolve para Nautia sem confundir a identidade global Synclaire', () => {
  for (const old of ['synclair','Synclair','SYNCLAIR']) assert.equal(resolveAssistantRoute(old),'nautia');
  for (const route of ['nautia','workspace','settings','synclaire','ocsis-synclaire']) assert.equal(resolveAssistantRoute(route),route);
  assert.deepEqual(ROCKETBOX_ASSISTANT,{id:'nautia',name:'Nautia'});
});
