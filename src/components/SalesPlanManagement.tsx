import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck, Save } from "lucide-react";
import { useTranslation } from "react-i18next";

type Plan = {
  id:string;displayName:string;sortOrder:number;
  monthlyEurCents:number|null;annualEurCents:number|null;
  maxUsers:number|null;maxSources:number|null;maxDestinations:number|null;
  maxActiveCampaigns:number|null;historyDays:number|null;monthlyAiUnits:string|null;
  monitoringPriority:"low"|"standard"|"frequent"|"priority"|"custom";
  supportTier:"community"|"standard"|"priority"|"dedicated";
  isEnabled:boolean;isPublished:boolean;revision:number;featureCodes:string[];
};
type Catalog={
  plans:Plan[];
  features:Array<{code:string;description:string;releaseState:string}>;
  editorEnabled:boolean;publicationEnabled:boolean;newTierCreationEnabled:boolean;
};
type Draft=Omit<Plan,"id"|"sortOrder"|"isPublished">;
const fields:[
  keyof Pick<Draft,"maxUsers"|"maxSources"|"maxDestinations"|"maxActiveCampaigns"|"historyDays">,
  string
][]=[
  ["maxUsers","Max team seats"],["maxSources","Source channels"],
  ["maxDestinations","Destinations"],["maxActiveCampaigns","Active campaigns"],
  ["historyDays","History retention (days)"]
];

export default function SalesPlanManagement({authToken}:{authToken:string|null}) {
  const {t}=useTranslation("billing");
  const [catalog,setCatalog]=useState<Catalog|null>(null);
  const [selected,setSelected]=useState<string>("creator");
  const [draft,setDraft]=useState<Draft|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const load=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/admin/sales-plans",{
        headers:{Authorization:`Bearer ${authToken??""}`},signal
      });
      if(!response.ok)throw new Error("CATALOG_UNAVAILABLE");
      const data=await response.json() as Catalog;
      if(!signal?.aborted)setCatalog(data);
    }catch(e){
      if(!signal?.aborted)setError(t("salesPlans.loadError"));
    }finally{if(!signal?.aborted)setLoading(false);}
  },[authToken,t]);
  useEffect(()=>{
    const controller=new AbortController();
    void load(controller.signal);
    return ()=>controller.abort();
  },[load]);

  const chosen=catalog?.plans.find(p=>p.id===selected)??catalog?.plans[0]??null;
  useEffect(()=>{
    if(chosen) {
      const {id:_id,sortOrder:_sort,isPublished:_published,...fields}=chosen;
      setDraft(fields);
    }
  },[chosen?.id,chosen?.revision,catalog]);
  function edit<K extends keyof Draft>(field:K,value:Draft[K]){
    setDraft(prev=>prev?{...prev,[field]:value}:prev);
    setMessage("");setError("");
  }
  const locked=!catalog?.editorEnabled || chosen?.isPublished || saving;
  async function save(e:React.FormEvent){
    e.preventDefault();
    if(!chosen || !draft || locked)return;
    setSaving(true);setMessage("");setError("");
    try{
      const response=await fetch(`/api/admin/sales-plans/${encodeURIComponent(chosen.id)}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${authToken??""}`},
        body:JSON.stringify(draft)
      });
      const result=await response.json() as {plan?:Plan;code?:string};
      if(!response.ok){
        if(result.code==="PLAN_EDIT_CONFLICT")await load();
        throw new Error(result.code??"SAVE_FAILED");
      }
      await load();
      setMessage(t("salesPlans.saved"));
    }catch(e){
      setError(e instanceof Error && e.message==="PLAN_EDIT_CONFLICT"
        ?t("salesPlans.conflict"):t("salesPlans.saveError"));
    }finally{setSaving(false);}
  }

  const inputClass="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-500";
  return <section className="mx-auto w-full max-w-6xl space-y-5 pb-12" aria-label={t("salesPlans.title")}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.13em] text-sky-700">{t("salesPlans.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{t("salesPlans.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">{t("salesPlans.description")}</p>
      </div>
      <button type="button" onClick={()=>void load()} disabled={loading}
        className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-60">
        <RefreshCw className="h-4 w-4"/>{t("salesPlans.refresh")}
      </button>
    </header>
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/>
      <div>
        <strong>{t("salesPlans.prelaunchTitle")}</strong>
        <p className="mt-1">{t("salesPlans.prelaunchDescription")}</p>
      </div>
    </div>
    {error&&<p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4"/>{error}</p>}
    {message&&<p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4"/>{message}</p>}
    {loading&&!catalog?<p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin"/>{t("salesPlans.loading")}</p>:null}
    {catalog&&chosen&&draft?<div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        {catalog.plans.map(p=><button type="button" key={p.id}
          onClick={()=>{setSelected(p.id);setMessage("");setError("");}}
          aria-current={chosen.id===p.id?"page":undefined}
          className={`flex min-h-12 w-full flex-col rounded-xl px-3 py-2 text-start text-sm transition ${chosen.id===p.id?"bg-sky-50 font-bold text-sky-900 ring-1 ring-sky-200":"hover:bg-slate-50 text-slate-700"}`}>
          <span>{p.displayName}</span>
          <span className="text-xs font-normal opacity-75">{p.isPublished?t("salesPlans.published"):p.isEnabled?t("salesPlans.draftEnabled"):t("salesPlans.draftDisabled")}</span>
        </button>)}
      </aside>
      <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">{chosen.displayName}</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Revision {draft.revision}</span>
        </div>
        {!catalog.editorEnabled&&<p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{t("salesPlans.editorDisabled")}</p>}
        {chosen.isPublished&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("salesPlans.publishedLocked")}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">{t("salesPlans.name")}
            <input className={inputClass+" mt-1"} value={draft.displayName} maxLength={70}
              disabled={locked} onChange={e=>edit("displayName",e.target.value)} required/>
          </label>
          {([["monthlyEurCents","Monthly price (€ cents)"],["annualEurCents","Annual price (€ cents)"]] as const).map(([key,label])=>
            <label key={key} className="text-sm font-medium text-slate-700">{label}
              <input type="number" min={0} max={1000000000} step={1}
                className={inputClass+" mt-1"} value={draft[key]??""}
                disabled={locked||chosen.id==="enterprise"}
                onChange={e=>edit(key, e.target.value===""?null:Number(e.target.value))}/>
            </label>)}
          {fields.map(([key,label])=>
            <label key={key} className="text-sm font-medium text-slate-700">{label}
              <input type="number" min={0} max={1000000} step={1}
                className={inputClass+" mt-1"} value={draft[key]??""}
                disabled={locked||chosen.id==="enterprise"}
                onChange={e=>edit(key,e.target.value===""?null:Number(e.target.value))}/>
            </label>)}
          <label className="text-sm font-medium text-slate-700">Monthly AI Units
            <input type="text" inputMode="decimal" className={inputClass+" mt-1"}
              disabled={locked||chosen.id==="enterprise"}
              value={draft.monthlyAiUnits??""}
              onChange={e=>edit("monthlyAiUnits",e.target.value)}/>
          </label>
          <label className="text-sm font-medium text-slate-700">Monitoring priority
            <select className={inputClass+" mt-1"} disabled={locked} value={draft.monitoringPriority}
              onChange={e=>edit("monitoringPriority",e.target.value as Draft["monitoringPriority"])}>
              {["low","standard","frequent","priority","custom"].map(x=><option value={x} key={x}>{x}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Support level
            <select className={inputClass+" mt-1"} disabled={locked} value={draft.supportTier}
              onChange={e=>edit("supportTier",e.target.value as Draft["supportTier"])}>
              {["community","standard","priority","dedicated"].map(x=><option value={x} key={x}>{x}</option>)}
            </select>
          </label>
        </div>
        <label className="flex min-h-12 items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={draft.isEnabled} disabled={locked}
            onChange={e=>edit("isEnabled",e.target.checked)} className="h-5 w-5 accent-sky-600"/>
          {t("salesPlans.enabledDraft")}
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-slate-900">{t("salesPlans.features")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {catalog.features.map(f=><label key={f.code}
              className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sky-600"
                disabled={locked} checked={draft.featureCodes.includes(f.code)}
                onChange={e=>edit("featureCodes",e.target.checked?
                  [...draft.featureCodes,f.code]:draft.featureCodes.filter(x=>x!==f.code))}/>
              <span><strong className="block">{f.code.replaceAll("_"," ")}</strong>
                <span className="block text-xs text-slate-500">{f.description}</span>
                {f.releaseState!=="available"&&<span className="text-xs font-semibold text-amber-700">({f.releaseState})</span>}
              </span>
            </label>)}
          </div>
        </fieldset>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">{t("salesPlans.noPublication")}</p>
          <button type="submit" disabled={locked}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white disabled:opacity-45">
            {saving?<LoaderCircle className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}
            {t("salesPlans.save")}
          </button>
        </div>
      </form>
    </div>:null}
  </section>;
}
