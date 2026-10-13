import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { salesPlans, aiTopUps } from "../src/data/salesPlans";
import { APP_LOCALES } from "../src/i18n/locales";
import { i18nResources } from "../src/i18n/resources";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("approved Sales Plan amounts and meters stay aligned with documentation", () => {
  assert.deepEqual(salesPlans.map(p => [p.id,p.monthly,p.annual,p.users,p.sources,p.destinations,p.campaigns,p.ai]), [
    ["free",0,0,1,3,1,0,10], ["creator",15,150,1,15,3,1,100],
    ["professional",39,390,3,75,15,10,400], ["business",89,890,10,250,50,50,1000],
    ["agency",199,1990,30,1000,200,200,2500], ["enterprise",null,null,null,null,null,null,null],
  ]);
  for (const p of salesPlans) if (p.monthly !== null && p.annual !== null) assert.equal(p.annual, p.monthly * 10);
  assert.deepEqual(aiTopUps.map(p => [p.id,p.units,p.eur]), [
    ["mini",500,7],["plus",2000,25],["pro",5000,55],["max",10000,99],
  ]);
});
test("Sales Plan copy exists in every locale and sales CTAs remain demo-only", () => {
  for (const locale of APP_LOCALES) {
    const marketing = i18nResources[locale].marketing as Record<string, any>;
    assert.ok(marketing.nav.salesPlan && marketing.footer.salesPlan);
    const sales = marketing.salesPlan;
    for (const key of ["title","notice","annualSavings","request","contact","billingLabel"]) assert.ok(sales[key], locale + key);
    for (const p of salesPlans) assert.ok(sales.plans[p.id].name && sales.plans[p.id].description && sales.plans[p.id].audience);
    for (const p of aiTopUps) assert.ok(sales.topUps.packs[p.id]);
  }
  const page = readFileSync(resolve(root,"src/MarketingHome.tsx"),"utf8");
  const section = readFileSync(resolve(root,"src/components/MarketingSalesPlan.tsx"),"utf8");
  assert.match(page, /<MarketingSalesPlan locale=\{locale\} \/>/);
  assert.match(page, /href="#sales-plan"/);
  assert.match(section, /aria-pressed=\{period === option\}/);
  assert.match(section, /id="sales-plan"/);
  assert.match(section, /href="#request-demo"/);
  assert.match(section, /salesPlan.notice/);
  assert.match(section, /plan.id === "professional"/);
  assert.doesNotMatch(section, /\/api\/billing\/checkout|\/api\/crypto-payments|Buy now|Subscribe now/);
  assert.doesNotMatch(section, /\b(?:left-|right-|pl-|pr-|ml-|mr-|text-left|text-right)\b/);
});
