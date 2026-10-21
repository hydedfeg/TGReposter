import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildAiBillingRequest} from "../src/utils/aiBilling";

test("BYOK curation is unchanged and never creates an AI billing request key",()=>{
  let calls=0;
  const actual=buildAiBillingRequest("byok","disabled",()=>{
    calls++;
    return "should-never-exist";
  });
  assert.deepEqual(actual,{body:{},headers:{}});
  assert.equal(calls,0);
});

test("included AI curation is explicit and requires verified server availability",()=>{
  for(const state of ["loading","disabled","unavailable"] as const) {
    assert.throws(()=>buildAiBillingRequest("included",state,()=> "unused"),/not available/);
  }
  const key="ef111e53-b431-438c-a160-b487d71eb450";
  const actual=buildAiBillingRequest("included","ready",()=>key);
  assert.deepEqual(actual,{
    body:{billingMode:"included"},
    headers:{"Idempotency-Key":key}
  });
});

test("every new included AI action generates its own request key",()=>{
  let sequence=0;
  const make=()=>`request-${++sequence}`;
  const first=buildAiBillingRequest("included","ready",make);
  const second=buildAiBillingRequest("included","ready",make);
  assert.equal(first.headers["Idempotency-Key"],"request-1");
  assert.equal(second.headers["Idempotency-Key"],"request-2");
});

test("AI configuration and Content Inbox integrate credit choice but preserve BYOK by default",()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
  for(const name of ["AIConfig.tsx","CurationFeed.tsx"]) {
    const source=fs.readFileSync(path.join(root,"src/components",name),"utf8");
    assert.match(source,/AiBillingModePanel/);
    assert.match(source,/buildAiBillingRequest/);
    assert.match(source,/billing\.refresh\(\)/);
    assert.match(source,/\.\.\.request\.headers/);
    assert.match(source,/\.\.\.request\.body/);
    assert.match(source,/localStorage\.getItem\("curator_token"\)/);
  }
  const app=fs.readFileSync(path.join(root,"src/App.tsx"),"utf8");
  assert.match(app,/aiProvider=\{settings\.aiConfig\?\.provider/);
  assert.match(app,/<AIConfigView\s+authToken=\{authToken\}/);
  for(const locale of ["en","ru","fa","ar"]) {
    const source=fs.readFileSync(path.join(root,"src/i18n/locales",locale,"ai.ts"),"utf8");
    assert.match(source,/billingMode:/);
    assert.match(source,/included:/);
    assert.match(source,/byok:/);
  }
});
