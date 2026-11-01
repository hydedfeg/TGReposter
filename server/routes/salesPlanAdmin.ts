import { Router, type RequestHandler } from "express";
import {
  listSalesPlanCatalog,saveDraftSalesPlan,createDraftSalesPlan,SalesPlanAdminError
} from "../billing/salesPlanAdminService";

/** Global catalog operations are strictly limited to the system super-admin.
 * Customer/account administrators may only read their own billing overview.
 */
export function createSalesPlanAdminRouter(options:{
  authMiddleware:RequestHandler;
  requireSuperAdmin:RequestHandler;
  hasDatabase?:()=>boolean;
  list?:typeof listSalesPlanCatalog;
  save?:typeof saveDraftSalesPlan;
  create?:typeof createDraftSalesPlan;
}) {
  const router=Router();
  const hasDatabase=options.hasDatabase??(()=>Boolean(process.env.DATABASE_URL?.trim()));
  const list=options.list??listSalesPlanCatalog;
  const save=options.save??saveDraftSalesPlan;
  const create=options.create??createDraftSalesPlan;
  router.use(options.authMiddleware);
  router.use((req:any,res,next)=>{
    res.set("Cache-Control","private, no-store");
    res.set("Vary","Authorization");
    if(!req.user)return res.status(401).json({code:"AUTH_REQUIRED",error:"Sign in required."});
    return next();
  });
  router.use(options.requireSuperAdmin);
  router.get("/",async(_req,res)=>{
    if(!hasDatabase())return res.status(503).json({code:"SALES_PLANS_NOT_READY"});
    try{return res.json(await list());}
    catch(e:any){
      console.error("Sales Plan admin catalog unavailable:",{code:e?.code??"UNEXPECTED"});
      return res.status(503).json({code:"SALES_PLANS_UNAVAILABLE"});
    }
  });
  router.post("/",async(req:any,res)=>{
    if(!hasDatabase())return res.status(503).json({code:"SALES_PLANS_NOT_READY"});
    if(!req.body || typeof req.body!=="object" || Array.isArray(req.body) ||
      typeof req.body.id!=="string" || req.body.id.length>40)
      return res.status(400).json({code:"INVALID_PLAN_ID"});
    const {id,...edit}=req.body;
    try {
      const plan=await create(id,edit,req.user);
      return res.status(201).json({plan});
    } catch(error:any) {
      if(error instanceof SalesPlanAdminError) {
        const status=error.code==="PLAN_EDITOR_DISABLED"?503:
          ["INVALID_PLAN_ID","INVALID_PLAN_INPUT","UNKNOWN_FEATURE"].includes(error.code)?400:409;
        return res.status(status).json({code:error.code,error:error.message});
      }
      if(["42P01","42703"].includes(error?.code))
        return res.status(503).json({code:"SALES_PLANS_NOT_READY"});
      console.error("Sales Plan creation failed:",{code:error?.code??"UNEXPECTED"});
      return res.status(503).json({code:"SALES_PLAN_CREATE_UNAVAILABLE"});
    }
  });

  router.put("/:id",async(req:any,res)=>{
    if(!hasDatabase())return res.status(503).json({code:"SALES_PLANS_NOT_READY"});
    if(!/^[a-z][a-z0-9_]{1,39}$/.test(String(req.params.id??"")))return res.status(400).json({code:"INVALID_PLAN_ID"});
    try{
      const plan=await save(req.params.id,req.body,req.user);
      return res.json({plan});
    }catch(error:any){
      if(error instanceof SalesPlanAdminError){
        const status=error.code==="PLAN_EDITOR_DISABLED"?503:
          error.code==="UNKNOWN_PLAN"?404:
          ["INVALID_PLAN_INPUT","UNKNOWN_FEATURE"].includes(error.code)?400:409;
        return res.status(status).json({code:error.code,error:error.message});
      }
      if(["42P01","42703"].includes(error?.code))
        return res.status(503).json({code:"SALES_PLANS_NOT_READY"});
      console.error("Sales Plan edit failed:",{code:error?.code??"UNEXPECTED"});
      return res.status(503).json({code:"SALES_PLAN_SAVE_UNAVAILABLE"});
    }
  });
  return router;
}
