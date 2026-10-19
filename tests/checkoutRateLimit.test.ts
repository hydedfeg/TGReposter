import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";
import {checkCustomerCheckoutRate,CHECKOUT_LIMITS,CheckoutRateLimitError}
  from "../server/billing/checkoutRateLimit";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20261019154000_checkout_rate_limits.sql"),"utf8");
const alice="legacy:alice",bob="legacy:bob";

async function dbFixture(){
  const db=new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(migration);
  const check=(owner:string,action:"quote"|"invoice")=>
    checkCustomerCheckoutRate(owner,action,{query:(sql,args)=>db.query(sql,args)});
  return {db,check};
}

test("checkout budget table has RLS, service-only grants and per-owner action identity",async()=>{
  const {db,check}=await dbFixture();
  try{
    const {rows}=await db.query<{rls:boolean;selectable:boolean;insertable:boolean}>(`
      select relrowsecurity as rls,
        has_table_privilege('authenticated',oid,'select') as selectable,
        has_table_privilege('authenticated',oid,'insert') as insertable
      from pg_class where oid='public.billing_checkout_rate_limits'::regclass`);
    assert.deepEqual(rows[0],{rls:true,selectable:false,insertable:false});
    await check(alice,"quote");
    await check(alice,"invoice");
    await check(bob,"quote");
    const result=await db.query<{owner_principal:string;action:string;minute_hits:number}>(`
      select owner_principal,action,minute_hits from public.billing_checkout_rate_limits
      order by owner_principal,action`);
    assert.deepEqual(result.rows,[
      {owner_principal:alice,action:"invoice",minute_hits:1},
      {owner_principal:alice,action:"quote",minute_hits:1},
      {owner_principal:bob,action:"quote",minute_hits:1}
    ]);
    await assert.rejects(db.query(`
      insert into public.billing_checkout_rate_limits
        (owner_principal,action,minute_hits,hour_hits)
      values('legacy:alice','invalid',1,1)`),/check constraint/i);
  }finally{await db.close();}
});

test("quote budget is atomic under concurrent account requests",async()=>{
  const {db,check}=await dbFixture();
  try{
    const results=await Promise.allSettled(
      Array.from({length:20},()=>check(alice,"quote"))
    );
    assert.equal(results.filter(r=>r.status==="fulfilled").length,CHECKOUT_LIMITS.quote.perMinute);
    const refused=results.filter(r=>r.status==="rejected");
    assert.equal(refused.length,20-CHECKOUT_LIMITS.quote.perMinute);
    for(const r of refused){
      if(r.status!=="rejected")continue;
      assert.ok(r.reason instanceof CheckoutRateLimitError);
      assert.ok(r.reason.retryAfterSeconds>=1&&r.reason.retryAfterSeconds<=60);
      assert.doesNotMatch(r.reason.message,/alice|database|postgres/i);
    }
    await check(bob,"quote");
    const {rows}=await db.query<{hits:number}>(`
      select minute_hits as hits from public.billing_checkout_rate_limits
      where owner_principal=$1 and action='quote'`,[alice]);
    assert.equal(rows[0].hits,CHECKOUT_LIMITS.quote.perMinute);
  }finally{await db.close();}
});

test("invoice hour quota cannot be bypassed by resetting minute window",async()=>{
  const {db,check}=await dbFixture();
  try {
    const {perMinute,perHour}=CHECKOUT_LIMITS.invoice;
    assert.equal(perMinute,3);
    assert.equal(perHour,12);
    for(let i=0;i<perHour;i++){
      if(i>0&&i%perMinute===0){
        await db.query(`update public.billing_checkout_rate_limits
          set minute_started_at=now()-interval '61 seconds'
          where owner_principal=$1 and action='invoice'`,[alice]);
      }
      await check(alice,"invoice");
    }
    await db.query(`update public.billing_checkout_rate_limits
      set minute_started_at=now()-interval '61 seconds'
      where owner_principal=$1 and action='invoice'`,[alice]);
    await assert.rejects(check(alice,"invoice"),error=>{
      assert.ok(error instanceof CheckoutRateLimitError);
      assert.equal(error.retryAfterSeconds>60,true);
      return true;
    });
    const {rows}=await db.query<{hour_hits:number}>(`
      select hour_hits from public.billing_checkout_rate_limits
      where owner_principal=$1 and action='invoice'`,[alice]);
    assert.equal(rows[0].hour_hits,perHour);
    await check(bob,"invoice");
  }finally{await db.close();}
});

test("quota resets after both windows expire without changing another owner's balance",async()=>{
  const {db,check}=await dbFixture();
  try{
    for(let i=0;i<CHECKOUT_LIMITS.quote.perMinute;i++)await check(alice,"quote");
    await assert.rejects(check(alice,"quote"),{code:"CHECKOUT_RATE_LIMITED"});
    await db.query(`update public.billing_checkout_rate_limits
      set minute_started_at=now()-interval '61 seconds',
          hour_started_at=now()-interval '61 minutes'
      where owner_principal=$1 and action='quote'`,[alice]);
    await check(alice,"quote");
    const {rows}=await db.query<{minute_hits:number;hour_hits:number}>(`
      select minute_hits,hour_hits from public.billing_checkout_rate_limits
      where owner_principal=$1 and action='quote'`,[alice]);
    assert.deepEqual(rows[0],{minute_hits:1,hour_hits:1});
  }finally{await db.close();}
});

test("rate limiter fails closed on missing database schema or query failure",async()=>{
  await assert.rejects(
    checkCustomerCheckoutRate(alice,"invoice",{query:async()=>{
      throw Object.assign(new Error("database unavailable"),{code:"42P01"});
    }}),/database unavailable/);
  await assert.rejects(
    checkCustomerCheckoutRate("invalid","quote",{query:async()=>({rows:[]})}),
    /Valid authenticated billing owner/);
});
