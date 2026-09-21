import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verifyStatusRegistryDatabase } from '../scripts/verify-status-registry-database.mjs';

const key='sb_publishable_isolated_fixture_not_a_credential';
const snapshot={revision:0,fingerprint:'unpublished',payload:{contract:'echo-status-registry/v1',definitions:[],bindings:[]}};
test('deployment preflight reads the public RPC and accepts an explicitly empty publication',async()=>{
  const result=await verifyStatusRegistryDatabase({publishableKey:key,fetchImpl:async(url,options)=>{
    assert.equal(new URL(url).pathname,'/rest/v1/rpc/get_status_registry_v1');
    assert.equal(options.method,'POST'); assert.equal(options.body,'{}');
    return {ok:true,json:async()=>snapshot};
  }});
  assert.equal(result.revision,0);
});
test('deployment cannot advance on a missing migration or invalid public contract',async()=>{
  await assert.rejects(()=>verifyStatusRegistryDatabase({publishableKey:key,fetchImpl:async()=>({ok:false,status:404})}),/migration validada/);
  await assert.rejects(()=>verifyStatusRegistryDatabase({publishableKey:key,fetchImpl:async()=>({ok:true,json:async()=>({})})}),/registro ausente/);
});
test('deployment refuses another project before any request',async()=>{
  let calls=0;
  await assert.rejects(()=>verifyStatusRegistryDatabase({projectRef:'not-authorized',publishableKey:key,fetchImpl:async()=>{calls++;}}),/somente o SNV/);
  assert.equal(calls,0);
});
test('production checks database availability before mutating the Edge Function',()=>{
  const ci=fs.readFileSync(new URL('../.gitlab-ci.yml',import.meta.url),'utf8').split('echo-brain-production:')[1].split('pages-production:')[0];
  const preflight=ci.indexOf('node scripts/verify-status-registry-database.mjs'),deploy=ci.indexOf('functions deploy');
  assert.ok(preflight>=0&&deploy>preflight);
});
