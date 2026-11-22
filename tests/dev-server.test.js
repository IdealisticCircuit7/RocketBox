import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { isSameProject, projectRoot, probeProject, identityRoute } from '../scripts/dev-identity.mjs';

test('Dev startup reuses only an identified server from the same project', async () => {
  let payload={app:'ocsis-rocketbox-dev',protocol:1,root:projectRoot};
  const server=http.createServer((req,res)=>{
    assert.equal(req.url,identityRoute);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(payload));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await probeProject(origin),true);
    payload={...payload,root:projectRoot+'/different-project'};
    assert.equal(await probeProject(origin),false);
    payload={...payload,app:'other-app'};
    assert.equal(await probeProject(origin),false);
    assert.equal(isSameProject(null),false);
    assert.equal(isSameProject({app:'ocsis-rocketbox-dev',protocol:999,root:projectRoot}),false);
  } finally { await new Promise(resolve=>server.close(resolve)); }
  assert.equal(await probeProject(origin),false);
});
