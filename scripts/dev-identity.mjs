import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const projectRoot = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
export const identityRoute = '/__rocketbox_dev_identity';
export const devOrigin = 'http://127.0.0.1:1420';
const normalized = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);

export function isSameProject(value, expectedRoot = projectRoot) {
  return value?.app === 'ocsis-rocketbox-dev' && value.protocol === 1 && typeof value.root === 'string' && normalized(value.root) === normalized(expectedRoot);
}

export function devIdentityPlugin() {
  return {
    name: 'rocketbox-dev-identity',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== identityRoute) return next();
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({app:'ocsis-rocketbox-dev', protocol:1, root:projectRoot}));
      });
    },
  };
}

export async function probeProject(origin = devOrigin, expectedRoot = projectRoot) {
  try {
    const response = await fetch(`${origin}${identityRoute}`, {signal:AbortSignal.timeout(1500),redirect:'error'});
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
    const body = await response.text();
    if (body.length > 8192) return false;
    return isSameProject(JSON.parse(body),expectedRoot);
  } catch { return false; }
}
