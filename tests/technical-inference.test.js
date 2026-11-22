import test from 'node:test';
import assert from 'node:assert/strict';
import { runStructuredInference } from '../src/services/inferenceService.ts';
import { RULESET_VERSION } from '../src/services/technicalRules.ts';
import { createWorkspaceStore } from '../src/workspace-store.js';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';

const asset = { id: 'a', nome: 'Resource', caminho: 'C:/sample.glb', formato: '.glb', categoria: 'Outro', folder: null, tags: [] };
test('Physical evidence is distinct from declared metadata; diagnostics persist and invalidate by file and rules', async () => {
  const map = new Map();
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) };
  const store = createWorkspaceStore({ storage }); store.transact(d => { d.assets = [asset]; });
  const ops = createLibraryOperationsService(store);
  let fingerprint = 'first'; let calls = 0;
  const options = { runningInTauri: true, tauriInvoker: async command => {
    assert.equal(command, 'analisar_recurso'); calls++;
    return { path: asset.caminho, fingerprint, format: 'glb', metadata: { conteudoReconhecido: 'true', versaoGLB: '2' }, evidence: ['GLB header'], warnings: [], errors: [], notPerformed: ['External buffers', 'Destination import'] };
  } };
  const first = (await ops.queryDiagnostics(['a'], options)).data[0];
  assert.equal(first.diagnostic.status, 'limited'); assert.equal(first.compatibility.testedImport, false);
  assert.equal(first.collectedData.versaoGLB, '2'); assert.equal(first.rulesetVersion, RULESET_VERSION);
  assert.equal(createWorkspaceStore({ storage }).snapshot().assets[0].analysisReport.fingerprint, 'first');
  const cached = (await ops.queryDiagnostics(['a'], options)).data[0]; assert.equal(cached.analyzedAt, first.analyzedAt); assert.equal(calls, 2); // still verifies physical freshness
  fingerprint = 'second'; assert.equal((await ops.queryDiagnostics(['a'], options)).data[0].fingerprint, 'second');
  const changedRules = { ...first, rulesetVersion: 'old', analyzedAt: 'old' };
  const refreshed = await runStructuredInference([asset], { ...options, savedReports: { a: changedRules } });
  assert.notEqual(refreshed[0].analyzedAt, 'old');
});
test('Offline, unknown and missing resources never produce complete compatibility', async () => {
  const [offline] = await runStructuredInference([asset], { runningInTauri: false });
  assert.equal(offline.compatibility.status, 'not_verified'); assert.ok(offline.notPerformed.length);
  const [missing] = await runStructuredInference([asset], { runningInTauri: true, tauriInvoker: async () => { throw new Error('missing'); } });
  assert.match(missing.errors[0], /missing/); assert.equal(missing.verificationStatus, 'not_verified');
  await assert.rejects(runStructuredInference(Array(101).fill(asset)), /100/);
});
