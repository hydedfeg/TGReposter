import test from "node:test";
import assert from "node:assert/strict";
import {
  TON_RATE_LIMIT_BASE_MS, TON_RATE_LIMIT_MAX_MS, TonScanRateLimitBackoff
} from "../server/payments/tonScanRateLimitBackoff";

test("TON cooldown doubles between repeated HTTP 429s and caps at fifteen minutes",()=>{
  let now=Date.parse("2026-10-17T12:00:00Z");
  const backoff=new TonScanRateLimitBackoff(()=>now);
  const lengths=[60_000,120_000,240_000,480_000,900_000,900_000];
  for(const ms of lengths){
    assert.equal(backoff.noteRateLimited(),new Date(now+ms).toISOString());
    assert.equal(backoff.retryAt(),new Date(now+ms).toISOString());
    now+=ms;
    assert.equal(backoff.retryAt(),null);
  }
  assert.equal(TON_RATE_LIMIT_BASE_MS,60_000);
  assert.equal(TON_RATE_LIMIT_MAX_MS,900_000);
});

test("TON provider Retry-After enforces longer delay but never exceeds cap",()=>{
  let now=Date.parse("2026-10-17T12:00:00Z");
  const backoff=new TonScanRateLimitBackoff(()=>now);
  assert.equal(backoff.noteRateLimited(240_000),new Date(now+240_000).toISOString());
  now+=240_000;
  assert.equal(backoff.noteRateLimited(100_000_000),new Date(now+900_000).toISOString());
  backoff.reset();
  assert.equal(backoff.retryAt(),null);
  assert.equal(backoff.noteRateLimited(-50),new Date(now+60_000).toISOString());
});

test("TON successful scan clears accumulated failure streak",()=>{
  let now=Date.parse("2026-10-17T12:00:00Z");
  const backoff=new TonScanRateLimitBackoff(()=>now);
  backoff.noteRateLimited();
  now+=60_000;
  assert.equal(backoff.noteRateLimited(),new Date(now+120_000).toISOString());
  backoff.reset();
  assert.equal(backoff.noteRateLimited(),new Date(now+60_000).toISOString());
});
