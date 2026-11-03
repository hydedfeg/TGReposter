import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import i18next from 'i18next';
import {I18nextProvider} from 'react-i18next';
import en from '../src/i18n/locales/en/billing';
import ru from '../src/i18n/locales/ru/billing';
import ar from '../src/i18n/locales/ar/billing';
import fa from '../src/i18n/locales/fa/billing';
const id='10000000-0000-4000-8000-000000000001';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
test('payment record download validates identity, localizes copy and discards stale responses',async t=>{
 const dir=await mkdtemp(path.join(import.meta.dirname,'../.test-payment-record-'));
 await build({entryPoints:[path.join(import.meta.dirname,'../src/components/PaymentRecordDownload.tsx')],outfile:dir+'/component.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
 const {default:Download}=await import(dir+'/component.mjs');
 const dom=new JSDOM('<div id="root"></div>');
 const keys=['window','document','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const originalFetch=globalThis.fetch,originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const i18n=i18next.createInstance();await i18n.init({lng:'en',fallbackLng:'en',resources:{en:{billing:en},ru:{billing:ru},ar:{billing:ar},fa:{billing:fa}}});
 let root:ReturnType<typeof createRoot>|undefined;
 let blobs:Blob[]=[],downloads:string[]=[],calls:RequestInit[]=[];
 let handler:(init?:RequestInit)=>Promise<Response>;
 URL.createObjectURL=(blob:Blob)=>{blobs.push(blob);return 'blob:synthetic';};URL.revokeObjectURL=()=>{};
 dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
 const container=document.getElementById('root')!;
 const mount=async()=>{
  blobs=[];downloads=[];calls=[];
  globalThis.fetch=async(input,init)=>{assert.equal(String(input),`/api/billing/orders/subscription/${id}/payment-record`);calls.push(init!);return handler(init);};
  root=createRoot(container);await act(async()=>root!.render(React.createElement(I18nextProvider,{i18n},React.createElement(Download,{authToken:'alice-token',orderId:id,orderType:'subscription'}))));
 };
 const unmount=async()=>{if(root){await act(async()=>root!.unmount());root=undefined;}};
 const click=async()=>{await act(async()=>container.querySelector('button')!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
 const record={documentType:'payment_record',taxInvoice:false,orderId:id,orderType:'subscription',payment:{amount:'16.500001'}};
 try{
  await t.test('all four locales download only the matching record with a localized notice',async()=>{
   for(const [language,locale] of Object.entries({en,ru,ar,fa})){
    assert.deepEqual(Object.keys(locale.paymentRecord).sort(),Object.keys(en.paymentRecord).sort());
    await i18n.changeLanguage(language);handler=async()=>json({record});await mount();
    assert.equal(container.querySelector('button')!.textContent,locale.paymentRecord.download);
    await click();assert.equal(downloads.length,1);assert.match(downloads[0],/subscription-.*\.json$/);
    assert.equal(new Headers(calls[0].headers).get('Authorization'),'Bearer alice-token');
    assert.equal(calls[0].cache,'no-store');
    const saved=JSON.parse(await blobs[0].text());assert.equal(saved.notice,locale.paymentRecord.notice);assert.deepEqual(saved.record,record);
    await unmount();
   }
   await i18n.changeLanguage('en');
  });
  await t.test('errors and mismatched order responses cannot produce a download',async()=>{
   for(const response of [json({code:'PAYMENT_RECORD_NOT_READY'},409),json({record:{...record,orderId:'foreign-order'}}),json({record:{...record,taxInvoice:true}})]){
    handler=async()=>response;await mount();await click();assert.equal(downloads.length,0);assert.ok(container.querySelector('[role="alert"]'));await unmount();
   }
  });
  await t.test('duplicate clicks and a response after unmount cannot leak a record',async()=>{
   let resolve!:(value:Response)=>void;const response=new Promise<Response>(done=>{resolve=done;});handler=async()=>response;await mount();
   await act(async()=>{const button=container.querySelector('button')!;button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
   assert.equal(calls.length,1);await unmount();assert.equal(calls[0].signal?.aborted,true);
   await act(async()=>{resolve(json({record}));});assert.equal(downloads.length,0);
  });
 }finally{
  await unmount();globalThis.fetch=originalFetch;
  // Let object URL cleanup timers run against the test stub.
  await new Promise(resolve=>setTimeout(resolve,1050));URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
  for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete(globalThis as any)[key];}
  dom.window.close();await rm(dir,{recursive:true,force:true});
 }
});
