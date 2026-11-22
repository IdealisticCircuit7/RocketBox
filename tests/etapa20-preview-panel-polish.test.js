import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Etapa 20: painel de prévia compacto, controles organizados, Detalhes técnicos recolhível, cache limpo e cabeçalho refinado', () => {
  const convertedPreview = readFileSync(
    new URL('../src/components/common/ConvertedPreview.tsx', import.meta.url),
    'utf8',
  );
  const viewerCss = readFileSync(
    new URL('../src/components/common/assetViewer.css', import.meta.url),
    'utf8',
  );
  const deckView = readFileSync(
    new URL('../src/components/deck/DeckFilteredView.tsx', import.meta.url),
    'utf8',
  );

  // 1. Card compacto de prévia indisponível
  assert.match(convertedPreview, /className="rb-preview-unavailable"/);
  assert.match(convertedPreview, /<h4>Prévia indisponível<\/h4>/);

  // 2. Hierarquia de controles e isolamento por formato (.blend vs .uasset)
  assert.match(convertedPreview, /rb-preview-btn--primary/);
  assert.match(convertedPreview, /Gerar prévia GLB/);
  assert.match(convertedPreview, /Configurar Blender/);
  assert.match(convertedPreview, /Localizar no Explorer/);
  assert.match(convertedPreview, /Abrir exportação do Unreal…/);
  assert.match(convertedPreview, /\{blend \?/);
  assert.match(convertedPreview, /\{blend && \(/);

  // 3. Informações técnicas recolhíveis por padrão e versão resumida do software
  assert.match(convertedPreview, /summarizeSoftwareName/);
  assert.match(convertedPreview, /<details className="rb-preview-details">/);
  assert.match(convertedPreview, /<span>Detalhes técnicos<\/span>/);
  assert.equal(convertedPreview.includes('<details open className="rb-preview-details">'), false);
  assert.match(convertedPreview, /formatDisplayPath\(environment\.blender\)/);

  // 4. Estados claros do cache de prévias e preservação do backend
  assert.match(convertedPreview, /Prévia disponível/);
  assert.match(convertedPreview, /Prévia não gerada/);
  assert.match(convertedPreview, /Prévia desatualizada/);
  assert.match(convertedPreview, /Falha na geração/);
  assert.match(convertedPreview, /preview_blender/);
  assert.match(convertedPreview, /preview_clear/);
  assert.match(convertedPreview, /preview_configure_blender/);

  // 5 & 7. Cabeçalho refinado e CSS responsivo sem corte/overflow
  assert.match(deckView, /studio-inspector__header-meta/);
  assert.match(deckView, /studio-inspector__asset-title/);
  assert.match(viewerCss, /\.studio-inspector__preview:has\(\.rb-viewer--compact\)/);
  assert.match(viewerCss, /\.rb-preview-btn--primary/);
  assert.match(viewerCss, /\.rb-preview-details/);
});
