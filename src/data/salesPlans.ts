// Approved pricing hypotheses from docs/PRICING_AND_SALES_PLAN.md.
// The commercial products are unpublished; this is a marketing preview, not checkout.
export const salesPlans = [
  { id: "free", monthly: 0, annual: 0, users: 1, sources: 3, destinations: 1, campaigns: 0, ai: 10, history: "days7" },
  { id: "creator", monthly: 15, annual: 150, users: 1, sources: 15, destinations: 3, campaigns: 1, ai: 100, history: "days90" },
  { id: "professional", monthly: 39, annual: 390, users: 3, sources: 75, destinations: 15, campaigns: 10, ai: 400, history: "year1" },
  { id: "business", monthly: 89, annual: 890, users: 10, sources: 250, destinations: 50, campaigns: 50, ai: 1000, history: "year2" },
  { id: "agency", monthly: 199, annual: 1990, users: 30, sources: 1000, destinations: 200, campaigns: 200, ai: 2500, history: "year3" },
  { id: "enterprise", monthly: null, annual: null, users: null, sources: null, destinations: null, campaigns: null, ai: null, history: "custom" },
] as const;

export const aiTopUps = [
  { id: "mini", units: 500, eur: 7 },
  { id: "plus", units: 2000, eur: 25 },
  { id: "pro", units: 5000, eur: 55 },
  { id: "max", units: 10000, eur: 99 },
] as const;
