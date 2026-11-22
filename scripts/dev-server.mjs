import { createServer } from 'vite';
import { resolve } from 'node:path';
import { projectRoot, probeProject, devOrigin } from './dev-identity.mjs';

// Own Vite in this process so Tauri can clean up its hook without orphaning a child.
process.chdir(projectRoot);
let server;
let monitor;
let closing = false;
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  clearInterval(monitor);
  await server?.close();
  process.exitCode = code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

try {
  let reused = await probeProject();
  if (!reused) {
    server = await createServer({configFile:resolve(projectRoot,'vite.config.ts')});
    try { await server.listen(); }
    catch (error) {
      await server.close(); server=undefined;
      // Another invocation may have won the bind race.
      reused = await probeProject();
      if (!reused) throw error;
    }
  }
  if (reused) {
    console.log(`[RocketBox] Reutilizando o Vite deste projeto em ${devOrigin}.`);
    // Keep the Tauri hook alive. Never close a shared server on exit.
    let checking = false;
    monitor = setInterval(async () => {
      if(checking || closing)return;
      checking=true;
      const alive=await probeProject(); checking=false;
      if(!alive && !closing) { console.error('[RocketBox] O servidor compartilhado foi encerrado. Inicie o app novamente.'); await stop(1); }
    },5000);
  } else {
    console.log('[RocketBox] Servidor de desenvolvimento iniciado.');
    server.printUrls();
  }
} catch (error) {
  console.error(`[RocketBox] Não foi possível iniciar o Vite: ${error.message}`);
  console.error('Se a porta 1420 estiver ocupada por outro projeto, encerre esse servidor no terminal de origem ou libere a porta. Nenhum processo foi encerrado automaticamente.');
  await stop(1);
}
