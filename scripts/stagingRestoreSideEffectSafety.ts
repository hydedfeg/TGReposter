/**
 * Checks the read-only PostgreSQL catalog for restored-clone side effects.
 * The operator must block outgoing network access BEFORE any clone starts.
 */
export interface RestoreSideEffectState {
  cronInstalled:boolean;netInstalled:boolean;
  activeCronJobs:number;activeHttpCronJobs:number;queuedHttpRequests:number;
  publicTablesWithoutRls:number;anonymousReadablePublicTables:number;
  authenticatedReadableSensitiveTables:number;anonymousExecutableDefinerFunctions:number;
}
const fields:ReadonlyArray<keyof RestoreSideEffectState>=[
  "cronInstalled","netInstalled","activeCronJobs","activeHttpCronJobs",
  "queuedHttpRequests","publicTablesWithoutRls","anonymousReadablePublicTables",
  "authenticatedReadableSensitiveTables","anonymousExecutableDefinerFunctions"
];
export function evaluateRestoreSideEffectSafety(value:unknown):string[]{
  if(!value||typeof value!=="object")return ["missing restored safety state"];
  const state=value as Record<string,unknown>;
  const errors:string[]=[];
  for(const key of fields){
    const v=state[key];
    const valid=key==="cronInstalled"||key==="netInstalled"?
      typeof v==="boolean":typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
    if(!valid)errors.push("invalid restore safety metric: "+key);
  }
  if(errors.length)return errors;
  if(state.cronInstalled!==true||state.netInstalled!==true)
    errors.push("expected pg_cron or pg_net extension missing");
  if(state.activeCronJobs!==0)errors.push("active cron jobs remain");
  if(state.activeHttpCronJobs!==0)errors.push("active outbound HTTP cron jobs remain");
  if(state.queuedHttpRequests!==0)errors.push("pending pg_net outbound HTTP requests remain");
  if(state.publicTablesWithoutRls!==0)errors.push("public tables without RLS detected");
  if(state.anonymousReadablePublicTables!==0)errors.push("anonymous public-table grants detected");
  if(state.authenticatedReadableSensitiveTables!==0)
    errors.push("authenticated direct sensitive-table grants detected");
  if(state.anonymousExecutableDefinerFunctions!==0)
    errors.push("anonymous SECURITY DEFINER execution detected");
  return errors;
}
