import test from "node:test";
import assert from "node:assert/strict";
import { getEffectivePlanId, isPlanId } from "../server/billing/planCatalog";

const now = new Date("2026-10-10T12:00:00.000Z");
const current = {
  planId: "professional",
  status: "active",
  currentPeriodStart: "2026-10-01T00:00:00Z",
  currentPeriodEnd: "2026-11-01T00:00:00Z",
};

test("commercial plan identifiers are explicit and stable", () => {
  assert.equal(isPlanId("free"), true);
  assert.equal(isPlanId("enterprise"), true);
  assert.equal(isPlanId("unknown"), false);
  assert.equal(isPlanId(null), false);
});

test("accounts without a valid active subscription resolve to Free", () => {
  assert.equal(getEffectivePlanId(null, now), "free");
  assert.equal(getEffectivePlanId({ ...current, planId: "unknown" }, now), "free");
  assert.equal(getEffectivePlanId({ ...current, status: "past_due" }, now), "free");
  assert.equal(getEffectivePlanId({ ...current, status: "paused" }, now), "free");
  assert.equal(getEffectivePlanId({ ...current, status: "canceled" }, now), "free");
  assert.equal(getEffectivePlanId({ ...current, currentPeriodEnd: null }, now), "free");
  assert.equal(getEffectivePlanId({ ...current, currentPeriodEnd: "bad" }, now), "free");
  assert.equal(getEffectivePlanId({ ...current, currentPeriodStart: "2026-10-11T00:00:00Z" }, now), "free");
  assert.equal(getEffectivePlanId({ ...current, currentPeriodEnd: "2026-10-10T12:00:00Z" }, now), "free");
});

test("only an in-period active subscription can grant a higher plan", () => {
  assert.equal(getEffectivePlanId(current, now), "professional");
  assert.equal(getEffectivePlanId({ ...current, planId: "agency" }, now), "agency");
});
