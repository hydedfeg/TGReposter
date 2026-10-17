import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, CheckCircle2, Copy, CreditCard, LoaderCircle,
  RefreshCw, ShieldCheck, Wallet
} from "lucide-react";
import { safeResponseJson } from "../utils/api";

type Network = "bsc" | "ethereum" | "ton";
interface CheckoutPlan {
  id: string; name: string; monthlyEurCents: number; annualEurCents: number;
}
interface CheckoutPack {
  id:string;name:string;aiUnits:string;priceEurCents:number;
}
interface CheckoutStatus {
  enabled:boolean;topupsEnabled:boolean;plans:CheckoutPlan[];
  packs:CheckoutPack[];networks:Network[];
}
interface Quote {
  id: string; eurCents: number; usdtAmount: string; expiresAt: string;
  product:
    | {kind:"subscription";planId:string;interval:"monthly"|"annual"}
    | {kind:"topup";packId:string};
}
interface Order {
  orderId:string;invoiceId:string;kind:"subscription"|"topup";
  planId:string|null;packId:string|null;aiUnits:string|null;interval:string|null;
  orderStatus:string;paymentStatus:string;listedEurCents:number;
  network:Network;asset:"USDT";amount:string;receivingAddress:string;
  tokenIdentifier:string;expiresAt:string;confirmedAt:string|null;
}

export default function BillingCheckout({authToken,onBack,initialOrderId}:{
  authToken:string|null;onBack:()=>void;initialOrderId?:string|null;
}){
  const {t,i18n}=useTranslation("billing");
  const [catalog,setCatalog]=useState<CheckoutStatus|null>(null);
  const [productKind,setProductKind]=useState<"subscription"|"topup">("subscription");
  const [planId,setPlanId]=useState("");
  const [packId,setPackId]=useState("");
  const [interval,setInterval]=useState<"monthly"|"annual">("monthly");
  const [network,setNetwork]=useState<Network>("bsc");
  const [quote,setQuote]=useState<Quote|null>(null);
  const [order,setOrder]=useState<Order|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const formatEuro=new Intl.NumberFormat(i18n.language,{style:"currency",currency:"EUR"});
  const date=(iso:string)=>Number.isFinite(Date.parse(iso))
    ? new Intl.DateTimeFormat(i18n.language,{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso)) : iso;

  const request=useCallback(async(path:string,init:RequestInit={})=>{
    if(!authToken)throw new Error(t("checkout.signIn"));
    const response=await fetch("/api/billing/checkout/"+path,{
      ...init,cache:"no-store",headers:{
        Authorization:"Bearer "+authToken,
        ...(init.body?{"Content-Type":"application/json"}:{}),
      }
    });
    const payload=await safeResponseJson(response);
    if(!response.ok)throw new Error(typeof payload?.error==="string"?payload.error:t("checkout.requestFailed"));
    return payload;
  },[authToken,t]);

  useEffect(()=>{
    let active=true;
    setCatalog(null);setQuote(null);setOrder(null);setError("");
    if(!authToken){setError(t("checkout.signIn"));return;}
    void request("status").then((body)=>{
      if(!active)return;
      const status=body as CheckoutStatus;
      setCatalog(status);
      if(status.plans.length)setPlanId(status.plans[0].id);
      if(status.packs.length)setPackId(status.packs[0].id);
      if(status.networks.length)setNetwork(status.networks[0]);
    }).catch(()=>{if(active)setError(t("checkout.requestFailed"));});
    return ()=>{active=false;};
  },[authToken,request,t]);

  useEffect(()=>{
    if(!initialOrderId || !authToken)return;
    let active=true;
    void request("orders/"+encodeURIComponent(initialOrderId)).then(body=>{
      if(active)setOrder(body.order as Order);
    }).catch(()=>{if(active)setError(t("checkout.requestFailed"));});
    return ()=>{active=false;};
  },[initialOrderId,authToken,request,t]);

  useEffect(()=>{
    if(!order || !authToken || order.orderStatus==="fulfilled" ||
       ["expired","cancelled","failed"].includes(order.paymentStatus))return;
    let active=true;
    const refresh=()=>{
      if(document.visibilityState!=="visible")return;
      void request("orders/"+encodeURIComponent(order.orderId)).then(body=>{
        if(active)setOrder(body.order as Order);
      }).catch(()=>{ /* Keep last confirmed view; user may retry refresh. */ });
    };
    const handle=window.setInterval(refresh,10000);
    return ()=>{active=false;window.clearInterval(handle);};
  },[order?.orderId,order?.orderStatus,order?.paymentStatus,authToken,request]);

  async function getQuote(){
    setBusy(true);setError("");setNotice("");setQuote(null);
    try{
      const isTopup=productKind==="topup";
      const body=await request(isTopup?"topups/quotes":"quotes",{method:"POST",
        body:JSON.stringify(isTopup?{packId}:{planId,interval})});
      setQuote(body.quote as Quote);
    }catch(e){setError(e instanceof Error?e.message:t("checkout.requestFailed"));}
    finally{setBusy(false);}
  }

  async function issueInvoice(){
    if(!quote)return;
    setBusy(true);setError("");setNotice("");
    try{
      const body=await request(quote.product.kind==="topup"?"topups/orders":"orders",{method:"POST",
        body:JSON.stringify({quoteId:quote.id,network})});
      setOrder(body.order as Order);
      setNotice(t("checkout.invoiceCreated"));
    }catch(e){setError(e instanceof Error?e.message:t("checkout.requestFailed"));}
    finally{setBusy(false);}
  }

  async function copyValue(value:string){
    try{await navigator.clipboard.writeText(value);setNotice(t("checkout.copied"));}
    catch{setNotice(t("checkout.copyManually"));}
  }

  const selected=catalog?.plans.find(p=>p.id===planId);
  const selectedPack=catalog?.packs.find(p=>p.id===packId);
  const ended=order && ["expired","cancelled","failed"].includes(order.paymentStatus);
  return <div className="space-y-5 sm:space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true"/>{t("checkout.back")}
        </button>
        <h1 className="font-display text-2xl font-bold text-slate-950 sm:text-3xl">{t("checkout.title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("checkout.description")}</p>
      </div>
      <ShieldCheck className="hidden h-8 w-8 text-sky-600 sm:block" aria-hidden="true"/>
    </header>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">{notice}</div>}
    {!catalog && !order ? <section className="rounded-2xl border border-slate-200 bg-white p-6" role="status">
      <LoaderCircle className="h-6 w-6 animate-spin text-sky-600" aria-hidden="true"/>{t("loading")}
    </section>:null}
    {catalog && !catalog.enabled && !order ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6" role="status">
      <h2 className="text-lg font-bold text-amber-950">{t("checkout.unavailableTitle")}</h2>
      <p className="mt-2 text-sm leading-6 text-amber-900">{t("checkout.unavailableDescription")}</p>
    </section>:null}
    {catalog && !catalog.enabled && !order && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <h2 className="text-lg font-bold text-slate-950">{t("checkout.previewPlans")}</h2>
      <p className="mt-2 text-sm text-slate-500">{t("checkout.previewNote")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {catalog.plans.map(plan=><article key={plan.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-bold text-slate-900">{plan.name}</h3>
          <p className="mt-2 text-sm text-slate-700">{formatEuro.format(plan.monthlyEurCents/100)} / {t("checkout.monthly")}</p>
          <p className="text-sm text-slate-600">{formatEuro.format(plan.annualEurCents/100)} / {t("checkout.annual")}</p>
        </article>)}
      </div>
      <h3 className="mt-6 text-base font-bold text-slate-900">{t("checkout.previewTopups")}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {catalog.packs.map(pack=><article key={pack.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="font-bold text-slate-900">{pack.name}</h4>
          <p className="mt-2 text-sm text-slate-600">{pack.aiUnits} {t("checkout.aiUnits")}</p>
          <p className="text-sm font-semibold text-slate-800">{formatEuro.format(pack.priceEurCents/100)}</p>
        </article>)}
      </div>
      {!catalog.plans.length&&!catalog.packs.length && <p className="mt-3 text-sm text-slate-500">{t("checkout.catalogUnavailable")}</p>}
    </section>}
    {catalog?.enabled && !order ? <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">{t("checkout.chooseProduct")}</h2>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("checkout.chooseProduct")}>
          <button type="button" disabled={busy} aria-pressed={productKind==="subscription"}
            onClick={()=>{setProductKind("subscription");setQuote(null);}}
            className={productKind==="subscription"?"min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white":"min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"}>
            {t("checkout.subscriptionProduct")}
          </button>
          {catalog.topupsEnabled && <button type="button" disabled={busy} aria-pressed={productKind==="topup"}
            onClick={()=>{setProductKind("topup");setQuote(null);}}
            className={productKind==="topup"?"min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white":"min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"}>
            {t("checkout.topupProduct")}
          </button>}
        </div>
        {productKind==="subscription" ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold text-slate-700">{t("checkout.plan")}
            <select value={planId} disabled={busy} onChange={e=>{setPlanId(e.target.value);setQuote(null);}}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900">
              {catalog.plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">{t("checkout.interval")}
            <select value={interval} disabled={busy} onChange={e=>{setInterval(e.target.value as "monthly"|"annual");setQuote(null);}}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900">
              <option value="monthly">{t("checkout.monthly")}</option>
              <option value="annual">{t("checkout.annual")}</option>
            </select>
          </label>
        </div>
        {selected && <p className="mt-4 text-sm text-slate-600">
          {t("checkout.catalogPrice")}: <strong>{formatEuro.format((interval==="annual"?selected.annualEurCents:selected.monthlyEurCents)/100)}</strong>
        </p>}
        </div> : <div className="mt-4">
          <label className="block space-y-2 text-sm font-semibold text-slate-700">{t("checkout.choosePack")}
            <select value={packId} disabled={busy} onChange={e=>{setPackId(e.target.value);setQuote(null);}}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900">
              {catalog.packs.map(pack=><option key={pack.id} value={pack.id}>
                {pack.name} · {pack.aiUnits} {t("checkout.aiUnits")}
              </option>)}
            </select>
          </label>
          {selectedPack && <p className="mt-3 text-sm text-slate-600">
            {t("checkout.catalogPrice")}: <strong>{formatEuro.format(selectedPack.priceEurCents/100)}</strong>
          </p>}
        </div>}
        <button type="button" onClick={()=>void getQuote()} disabled={busy||(productKind==="subscription"?!selected:!selectedPack)}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white disabled:opacity-50">
          {busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:<CreditCard className="h-4 w-4"/>}
          {t("checkout.getQuote")}
        </button>
      </section>
      {quote && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">{t("checkout.quote")}</h2>
        <p className="mt-3 text-2xl font-bold tabular-nums text-slate-950">{quote.usdtAmount} USDT</p>
        <p className="mt-2 text-sm text-slate-600">{t("checkout.quoteExpires")}: {date(quote.expiresAt)}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{t("checkout.discriminatorWarning")}</p>
        <label className="mt-4 block space-y-2 text-sm font-semibold text-slate-700">{t("checkout.network")}
          <select value={network} disabled={busy} onChange={e=>setNetwork(e.target.value as Network)}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900">
            {catalog.networks.map(n=><option key={n} value={n}>{n.toUpperCase()}</option>)}
          </select>
        </label>
        <button type="button" onClick={()=>void issueInvoice()} disabled={busy}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50">
          {busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:<Wallet className="h-4 w-4"/>}
          {t("checkout.createInvoice")}
        </button>
      </section>}
    </>:null}
    {order && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-950">{t("checkout.paymentInstructions")}</h2>
        {order.orderStatus==="fulfilled"?
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4"/>{t("checkout.fulfilled")}</span>:
          <span className="text-sm font-semibold text-slate-600">{t("checkout.paymentStatus")}: {order.paymentStatus}</span>}
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">
        {order.kind==="topup"
          ? t("checkout.purchasedUnits",{count:Number(order.aiUnits??0)})
          : t("checkout.subscriptionProduct")}
      </p>
      <p className="mt-3 text-sm text-slate-600">{t("checkout.network")}: <strong>{order.network.toUpperCase()}</strong></p>
      <p className="mt-3 text-sm text-slate-600">{t("checkout.sendExactAmount")}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="min-w-0 break-all rounded-xl bg-slate-50 p-3 font-mono text-lg font-bold tabular-nums text-slate-900">{order.amount} USDT</span>
        <button type="button" onClick={()=>void copyValue(order.amount)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200" aria-label={t("checkout.copyAmount")}>
          <Copy className="h-4 w-4"/></button>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-700">{t("checkout.receivingAddress")}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-slate-50 p-3 text-xs text-slate-900">{order.receivingAddress}</code>
        <button type="button" onClick={()=>void copyValue(order.receivingAddress)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200" aria-label={t("checkout.copyAddress")}>
          <Copy className="h-4 w-4"/></button>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-600">{t("checkout.tokenIdentifier")}</p>
      <code className="mt-1 block break-all text-xs text-slate-700">{order.tokenIdentifier}</code>
      <p className="mt-4 text-sm text-slate-600">{t("checkout.invoiceExpires")}: {date(order.expiresAt)}</p>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        {ended?t("checkout.expiredNotice"):t("checkout.networkWarning")}
      </p>
      <button type="button" onClick={()=>void request("orders/"+order.orderId).then(body=>setOrder(body.order as Order)).catch(()=>setError(t("checkout.requestFailed")))}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
        <RefreshCw className="h-4 w-4"/>{t("checkout.refreshStatus")}
      </button>
    </section>}
  </div>;
}
