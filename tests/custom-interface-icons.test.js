import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function readText(relPath) {
  return fs.readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');
}

function readPngDimensions(relPath) {
  const buf = fs.readFileSync(new URL(`../${relPath}`, import.meta.url));
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relPath} deve ser um PNG válido`);
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', `${relPath} deve conter chunk IHDR`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf.readUInt8(25),
    bytes: buf.length,
  };
}

test('Custom Interface Icons 1.0 possui PNGs normalizados com transparência RGBA em src/assets/icons', () => {
  for (const file of [
    'src/assets/icons/rocket-icon.png',
    'src/assets/icons/library-icon.png',
    'src/assets/icons/settings-icon.png',
  ]) {
    const info = readPngDimensions(file);
    assert.equal(info.width, 128, `${file} largura esperada 128px`);
    assert.equal(info.height, 128, `${file} altura esperada 128px`);
    assert.equal(info.colorType, 6, `${file} deve ser RGBA (colorType 6) com canal alfa real`);
    assert.ok(info.bytes > 1000, `${file} não pode estar vazio`);
  }
});

test('Custom Interface Icons 1.0 configura máscara monocromática, inclinação do foguete e isolamento de outros ícones', () => {
  const iconsCss = readText('src/icons.css');
  const iconsJs = readText('src/icons.js');
  const mainJs = readText('src/main.js');
  const customIconTsx = readText('src/components/common/CustomIcon.tsx');
  const cinematicCss = readText('src/cinematic.css');

  // CSS tokens, mask-image monocromático via currentColor, rotação isolada no foguete e estados
  assert.match(iconsCss, /--rocket-icon-tilt:\s*45deg;/);
  assert.match(iconsCss, /\.ocsis-custom-icon\s*\{[^}]*background-color:\s*currentColor;/s);
  assert.match(iconsCss, /\.ocsis-custom-icon--rocket\s*\{[^}]*rocket-icon\.png[^}]*transform:\s*rotate\(var\(--rocket-icon-tilt,\s*45deg\)\);/s);
  assert.match(iconsCss, /\.launch-card > \.ocsis-custom-icon\s*\{[^}]*background-color:\s*var\(--card-color\);/s);
  assert.match(iconsCss, /\.ocsis-custom-icon--library\s*\{[^}]*library-icon\.png/s);
  assert.match(iconsCss, /\.ocsis-custom-icon--settings\s*\{[^}]*settings-icon\.png/s);
  assert.match(iconsCss, /:disabled\s+\.ocsis-custom-icon\s*\{[^}]*opacity:\s*0\.5;/s);
  assert.match(iconsCss, /\.no-lighting\s+\.ocsis-icon\s*\{\s*filter:\s*none\s*!important;\s*\}/);

  // Vanilla bridge substitui somente rocket, library e settings sem alterar outros ícones do sprite
  assert.match(iconsJs, /CUSTOM_ICON_NAMES\s*=\s*new Set\(\['rocket',\s*'library',\s*'settings'\]\)/);
  assert.match(iconsJs, /createCustomIconElement/);
  assert.match(iconsJs, /svg\.replaceWith\(replacement\)/);

  // Menu recolhido (.icons-only) não deve esconder os ícones personalizados <span> dentro de .nav-label
  assert.match(mainJs, /!node\.classList\?\.contains\('ocsis-icon'\)/);

  // Componente React CustomIcon acessível
  assert.match(customIconTsx, /export type CustomIconName = 'rocket' \| 'library' \| 'settings';/);
  assert.match(customIconTsx, /aria-hidden=\{title \? undefined : true\}/);

  // Home cards no mobile mantêm altura quadrada explícita
  assert.match(cinematicCss, /@media\s*\(max-width:650px\)[\s\S]*\.launch-card > :is\(svg,\s*\.launch-icon\)\s*\{[^}]*width:\s*44px;\s*height:\s*44px;/);
});

test('Custom Interface Icons 1.0 aplica novos ícones apenas em Registrar Asset, Biblioteca e Configurações sem alterar ícones internos', () => {
  const deckTsx = readText('src/components/deck/DeckFilteredView.tsx');
  const registerTsx = readText('src/components/deck/RegisterAssetForm.tsx');

  // Topbar Registrar Asset e sidebar Biblioteca usam CustomIcon
  assert.match(deckTsx, /<CustomIcon name="rocket" size=\{16\} className="nautia-mini-svg" \/>/);
  assert.match(deckTsx, /name === 'Biblioteca' \? \(\s*<CustomIcon name="library" size=\{18\} \/>/s);

  // CTA principal do formulário Registrar Asset usa CustomIcon("rocket")
  assert.match(registerTsx, /<CustomIcon name="rocket" size=\{17\} className="nautia-icon-svg" \/>/);

  // Demais coleções e ícones internos continuam preservados no FolderTagIconGlyph
  assert.match(deckTsx, /\{ name: 'Todos os Assets', icon: 'layers' \}/);
  assert.match(deckTsx, /\{ name: 'Recentes', icon: 'compass' \}/);
  assert.match(deckTsx, /\{ name: 'Sem etiqueta', icon: 'tag' \}/);
});
