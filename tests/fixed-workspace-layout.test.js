import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(relPath) {
  return fs.readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');
}

test('Fixed Workspace Layout elimina rolagem global no AppShell e trava cabeçalhos/rodapés', () => {
  const stylesCss = read('src/styles.css');
  const studioCss = read('src/studio.css');
  const settingsCss = read('src/settings.css');

  // Documento raiz e .main-stage sem rolagem global
  assert.match(stylesCss, /html,\s*body\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s);
  assert.match(stylesCss, /\.main-stage\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden;/s);
  assert.match(stylesCss, /\.view\.active\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);

  // Containers dos módulos preenchem exatamente o espaço útil em Menu Lateral e Menu Superior
  assert.match(studioCss, /#conves-react-root,\s*#nautia-react-root,\s*#settings-root\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.equal(studioCss.includes('min-height: calc(100vh - 165px)'), false);
  assert.equal(studioCss.includes('position: sticky;\n  top: 16px;\n  overflow: hidden;'), false);

  // Convés: rail, lista de registros e inspetor rolam internamente com rodapé fixo
  assert.match(studioCss, /#view-workspace \.nautia-deck-shell\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s);
  assert.match(studioCss, /\.explorer-records\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto;/s);
  assert.match(studioCss, /\.explorer-footer\s*\{[^}]*flex:\s*none;/s);

  // Registrar Asset: visualizador estático + formulário com corpo rolável e rodapé fixo
  const registerTsx = read('src/components/deck/RegisterAssetForm.tsx');
  assert.equal(registerTsx.includes('nautia-register-form__body'), true);
  assert.match(studioCss, /#view-register \.nautia-register-form\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden;/s);
  assert.match(studioCss, /#view-register \.nautia-register-form__body\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(studioCss, /#view-register \.nautia-register-form__footer-bar\s*\{[^}]*flex:\s*none;/s);

  // Configurações: sidebar e corpo das opções rolam independentemente com cabeçalho fixo
  const settingsJs = read('src/settings-ui.js');
  assert.equal(settingsJs.includes('settings-category__body'), true);
  assert.match(settingsCss, /\.settings-layout\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(studioCss, /#settings-root \.settings-sidebar\s*\{[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;/s);
  assert.match(studioCss, /#settings-root \.settings-category__body\s*\{[^}]*overflow-y:\s*auto;/s);

  // Lixeira: corpo dividido com rolagem independente na lista e inspetor + ações fixas
  const libraryJs = read('src/library-ui.js');
  assert.equal(libraryJs.includes('trash-inspector__scroll'), true);
  assert.match(studioCss, /#trash-items\s*\{[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;/s);
  assert.match(studioCss, /\.trash-inspector__scroll\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(studioCss, /\.trash-inspector-actions\s*\{[^}]*flex:\s*none;/s);

  // NautIA: altura adaptável (flex: 1; min-height: 0) e histórico/auditoria controlado
  const nautiaTsx = read('src/components/nautia/NautiaModuleView.tsx');
  assert.equal(nautiaTsx.includes('nautia-module-dock'), true);
  assert.match(studioCss, /#view-nautia \.nautia-module-shell\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s);
  assert.match(studioCss, /\.studio-assistant\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s);
  assert.match(studioCss, /\.studio-chat-side\s*\{[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;/s);
});
