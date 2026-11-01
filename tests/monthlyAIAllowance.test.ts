import test from "node:test";
import assert from "node:assert/strict";
import {
  addUtcMonths, paidAllowancePeriod, freeAllowancePeriod, ensureMonthlyAIAllowance
} from "../server/billing/monthlyAIAllowance";

test("monthly grants clamp annual anniversaries to valid UTC dates", () => {
  const january = new Date("2026-01-31T10:30:00Z");
  assert.equal(addUtcMonths(january,1).toISOString(),"2026-02-28T10:30:00.000Z");
  assert.equal(addUtcMonths(january,2).toISOString(),"2026-03-31T10:30:00.000Z");

  assert.deepEqual(paidAllowancePeriod(
    "2026-01-31T10:30:00Z","2027-01-31T10:30:00Z","annual",
    new Date("2026-02-28T10:30:00Z")
  ), {
    start:"2026-02-28T10:30:00.000Z",
    end:"2026-03-31T10:30:00.000Z"
  });
});

test("annual monthly grants never roll into the next window", () => {
  const start = "2026-09-06T12:00:00Z";
  const end = "2027-09-06T12:00:00Z";
  assert.deepEqual(paidAllowancePeriod(start,end,"annual",
    new Date("2026-10-06T11:59:59Z")),
    { start:"2026-09-06T12:00:00.000Z",end:"2026-10-06T12:00:00.000Z" });
  assert.deepEqual(paidAllowancePeriod(start,end,"annual",
    new Date("2026-10-06T12:00:00Z")),
    { start:"2026-10-06T12:00:00.000Z",end:"2026-11-06T12:00:00.000Z" });
  assert.throws(() => paidAllowancePeriod(start,end,"annual",new Date(end)),
    /No current paid billing period/);
});

test("monthly billing uses exact subscription boundaries", () => {
  assert.deepEqual(paidAllowancePeriod(
    "2026-10-10T18:00:00Z","2026-11-10T18:00:00Z","monthly",
    new Date("2026-10-31T10:00:00Z")), {
    start:"2026-10-10T18:00:00.000Z",
    end:"2026-11-10T18:00:00.000Z"
  });
  assert.throws(() => paidAllowancePeriod(
    "2026-10-10T18:00:00Z","2026-11-10T18:00:00Z","custom",
    new Date("2026-10-31T10:00:00Z")), /Unsupported/);
});

test("Free plan grants use UTC calendar months and reset at the boundary", () => {
  assert.deepEqual(freeAllowancePeriod(new Date("2026-12-31T23:59:59Z")), {
    start:"2026-12-01T00:00:00.000Z",
    end:"2027-01-01T00:00:00.000Z"
  });
});

test("grants remain disabled by default", async () => {
  const previous = process.env.TGREPOSTER_COMMERCIAL_AI_ENABLED;
  delete process.env.TGREPOSTER_COMMERCIAL_AI_ENABLED;
  try {
    await assert.rejects(
      ensureMonthlyAIAllowance("legacy:alice"),
      /allocation is disabled/
    );
  } finally {
    if (previous === undefined) delete process.env.TGREPOSTER_COMMERCIAL_AI_ENABLED;
    else process.env.TGREPOSTER_COMMERCIAL_AI_ENABLED = previous;
  }
});
