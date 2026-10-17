import test from "node:test";
import assert from "node:assert/strict";
import {
  setEndOfTermCancellation,
  expireEndedSubscription,
  SubscriptionLifecycleError,
  type LifecycleClient
} from "../server/billing/subscriptionLifecycleService";

const subscriptionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const paidStart="2026-10-01T00:00:00Z";
const paidEnd="2026-11-01T00:00:00Z";
const now="2026-10-12T10:00:00Z";

interface FakeState {
  status: string;
  cancellation: boolean;
  periodEnd: string;
  prepaid: boolean;
  pending: boolean;
  renewals: Array<{id:string;term_start:string;term_end:string}>;
  events: string[];
  updates: string[];
  lockedOwners: string[];
  released: number;
}
function harness(input: Partial<FakeState> = {}) {
  const state:FakeState={
    status:"active",cancellation:false,periodEnd:paidEnd,
    prepaid:false,pending:false,renewals:[],events:[],updates:[],lockedOwners:[],released:0,...input
  };
  const client={
    async query(sql:string, params:unknown[] = []) {
      const s=sql.replace(/\s+/g," ").trim();
      if (s==="BEGIN" || s==="COMMIT" || s==="ROLLBACK") return {rows:[],rowCount:0};
      if (s.includes("pg_advisory_xact_lock")) {
        state.lockedOwners.push(String(params[0]));return {rows:[{}],rowCount:1};
      }
      if (s.includes("from public.billing_subscriptions") && s.includes("for update")) {
        return {rows:[{
          id:subscriptionId,status:state.status,cancel_at_period_end:state.cancellation,
          current_period_start:paidStart,current_period_end:state.periodEnd
        }],rowCount:1};
      }
      if (s==="select now() as now") return {rows:[{now:new Date(now)}],rowCount:1};
      if (s.includes("prepaid_term")) {
        return {rows:[{prepaid_term:state.prepaid,pending_order:state.pending}],rowCount:1};
      }
      if (s.includes("select id,term_start,term_end")) {
        return {rows:state.renewals,rowCount:state.renewals.length};
      }
      if (s.includes("update public.billing_subscriptions")) {
        state.updates.push(s);
        if(s.includes("cancel_at_period_end=$2")) state.cancellation=Boolean(params[1]);
        if(s.includes("status='expired'")) state.status="expired";
        return {rows:[],rowCount:1};
      }
      if (s.includes("update public.billing_subscription_terms")) {
        state.updates.push(s);return {rows:[],rowCount:1};
      }
      if (s.includes("insert into public.billing_subscription_events")) {
        state.events.push(String(params[2]??"expired"));
        return {rows:[],rowCount:1};
      }
      throw Error("Unexpected SQL: "+s.slice(0,100));
    },
    release(){state.released++;}
  };
  return {state, clientFactory:async()=>client as unknown as LifecycleClient};
}

test("subscription management defaults to disabled without connecting to the database",async()=>{
  const previous=process.env.TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED;
  delete process.env.TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED;
  try {
    await assert.rejects(setEndOfTermCancellation("legacy:alice",true),
      /management is not enabled/);
    await assert.rejects(expireEndedSubscription("legacy:alice"),
      /management is not enabled/);
  } finally {
    if(previous===undefined) delete process.env.TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED;
    else process.env.TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED=previous;
  }
});

test("cancel and reversal preserve paid term and each transition is audited once",async()=>{
  const h=harness();
  const opts={enabled:true,clientFactory:h.clientFactory};
  const first=await setEndOfTermCancellation("LEGACY:ALICE",true,opts);
  assert.equal(first.changed,true);
  assert.equal(first.cancelAtPeriodEnd,true);
  assert.equal(first.effectiveAt,"2026-11-01T00:00:00.000Z");
  const retry=await setEndOfTermCancellation("legacy:alice",true,opts);
  assert.equal(retry.changed,false);
  const undo=await setEndOfTermCancellation("legacy:alice",false,opts);
  assert.equal(undo.changed,true);
  assert.equal(h.state.status,"active");
  assert.deepEqual(h.state.events,["cancel_scheduled","cancel_reversed"]);
  assert.equal(h.state.lockedOwners.length,3);
  assert.ok(h.state.lockedOwners.every(x=>x==="tgreposter:ai-balance:legacy:alice"));
  assert.equal(h.state.released,3);
});

test("prepaid or pending financial orders block cancellation without losing money",async()=>{
  for(const flags of [{prepaid:true},{pending:true}]){
    const h=harness(flags);
    await assert.rejects(
      setEndOfTermCancellation("legacy:alice",true,
        {enabled:true,clientFactory:h.clientFactory}),
      (err:unknown)=>err instanceof SubscriptionLifecycleError &&
        err.code==="PAYMENT_REVIEW_REQUIRED"
    );
    assert.equal(h.state.cancellation,false);
    assert.deepEqual(h.state.events,[]);
    assert.equal(h.state.released,1);
  }
});

test("expired paid term closes historical status without granting further paid access",async()=>{
  const h=harness({periodEnd:"2026-10-11T00:00:00Z"});
  const done=await expireEndedSubscription("legacy:alice",
    {enabled:true,clientFactory:h.clientFactory});
  assert.equal(done,true);
  assert.equal(h.state.status,"expired");
  assert.deepEqual(h.state.events,["expired"]);
  assert.ok(h.state.updates.some(s=>s.includes("update public.billing_subscription_terms")));
});

test("due or missed prepaid renewals cannot be silently forfeited",async()=>{
  const due=harness({
    periodEnd:"2026-10-11T00:00:00Z",
    renewals:[{id:"x",term_start:"2026-10-11T00:00:00Z",term_end:"2026-11-11T00:00:00Z"}]
  });
  assert.equal(await expireEndedSubscription("legacy:alice",
    {enabled:true,clientFactory:due.clientFactory}),false);
  assert.deepEqual(due.state.events,[]);
  const missed=harness({
    periodEnd:"2026-10-11T00:00:00Z",
    renewals:[{id:"x",term_start:"2026-09-01T00:00:00Z",term_end:"2026-10-11T00:00:00Z"}]
  });
  await assert.rejects(expireEndedSubscription("legacy:alice",
    {enabled:true,clientFactory:missed.clientFactory}),
    (err:unknown)=>err instanceof SubscriptionLifecycleError &&
      err.code==="MISSED_PAID_RENEWAL");
  assert.deepEqual(missed.state.events,[]);
});
