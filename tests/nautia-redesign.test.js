import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Redesign NautIA: avatar com fundo estático 30%, chat 70%, ferramentas recolhíveis e responsividade', () => {
  const moduleView = readFileSync(
    new URL('../src/components/nautia/NautiaModuleView.tsx', import.meta.url),
    'utf8',
  );
  const avatarCss = readFileSync(
    new URL('../src/components/nautia/nautiaAvatar.css', import.meta.url),
    'utf8',
  );
  const studioCss = readFileSync(
    new URL('../src/studio.css', import.meta.url),
    'utf8',
  );

  // Fundo neutro, sem decorações animadas; avatar e controles existentes preservados.
  assert.match(moduleView, /className="studio-portrait"/);
  assert.doesNotMatch(moduleView, /nautia-holo-/);
  assert.match(moduleView, /<NautiaAvatar/);
  assert.match(moduleView, /className="nautia-stage-footer"/);
  assert.match(moduleView, /className="nautia-stage-state-pill"/);
  assert.match(moduleView, /— Central de Comando/);

  // Chat à direita: cabeçalho, abas horizontais, streaming, cancelamento, Enter/Shift+Enter
  assert.match(moduleView, /Conversa com <span className="nautia-accent-violet">NautIA<\/span>/);
  assert.match(moduleView, /nautia-status-badge connectivity-/);
  assert.match(moduleView, /\+ Nova conversa/);
  assert.match(moduleView, /Histórico \(/);
  assert.match(moduleView, /Parar geração/);
  assert.match(moduleView, /event\.shiftKey/);

  // Ferramentas contextuais recolhíveis
  assert.match(moduleView, /className="studio-tools-rail"/);
  assert.match(moduleView, /className="studio-chat-side"/);
  assert.match(moduleView, /openSideSection\('tools'\)/);
  assert.match(moduleView, /openSideSection\('context'\)/);
  assert.match(moduleView, /Recolher/);

  // Proporção e acessibilidade mantidas, sem animações/iluminação de fundo por estado.
  assert.match(studioCss, /0\.31fr.*0\.69fr/);
  assert.doesNotMatch(studioCss, /nautia-holo-|nautiaHoloSpin|nautiaParticleDrift/);
  assert.match(studioCss, /\.studio-tools-rail\s*\{/);
  assert.match(studioCss, /prefers-reduced-motion:\s*reduce/);

  // Avatar CSS preserva sprites inteiros com object-fit: contain e balão de pensamento
  assert.match(avatarCss, /object-fit:\s*contain/);
  assert.match(avatarCss, /\.nautia-thought\s*\{/);
});
