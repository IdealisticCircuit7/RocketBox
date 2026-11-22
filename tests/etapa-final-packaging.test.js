import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PERSISTED_KEYS } from '../src/services/nativePersistence.ts';

test('ETAPA FINAL: identidade 1.0.0 e empacotador NSIS configurados corretamente', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const tauriConf = JSON.parse(fs.readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const cargoToml = fs.readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');

  assert.equal(pkg.version, '1.0.0');
  assert.equal(tauriConf.version, '1.0.0');
  assert.equal(tauriConf.productName, 'RocketBox');
  assert.equal(tauriConf.app.windows[0].title, 'RocketBox by OCSIS');
  assert.equal(tauriConf.bundle.publisher, 'OCSIS');
  assert.deepEqual(tauriConf.bundle.targets, ['nsis']);
  assert.equal(tauriConf.bundle.windows.nsis.installMode, 'currentUser');
  assert.match(cargoToml, /version = "1\.0\.0"/);
  assert.match(cargoToml, /authors = \["OCSIS"\]/);
});

test('ETAPA FINAL: todas as chaves críticas de persistência e ícones do instalador existem', () => {
  for (const requiredKey of [
    'ocsis.rocketbox.workspace.v1',
    'ocsis.rocketbox.preferences.v1',
    'ocsis.rocketbox.history.v1',
    'ocsis.nautia.conversations.v1',
    'ocsis.nautia.ollama.v1',
  ]) {
    assert.ok(PERSISTED_KEYS.includes(requiredKey), `Chave ausente: ${requiredKey}`);
  }

  for (const iconPath of [
    '../src-tauri/icons/icon.ico',
    '../src-tauri/icons/32x32.png',
    '../src-tauri/icons/128x128.png',
    '../src-tauri/icons/128x128@2x.png',
  ]) {
    assert.ok(fs.existsSync(new URL(iconPath, import.meta.url)), `Ícone ausente: ${iconPath}`);
  }

  const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(mainSrc, /initializeNativePersistence/);
  const appStateRs = fs.readFileSync(new URL('../src-tauri/src/app_state.rs', import.meta.url), 'utf8');
  assert.match(appStateRs, /rocketbox-state\.json/);
  assert.match(appStateRs, /rocketbox-state\.bak\.json/);
});
