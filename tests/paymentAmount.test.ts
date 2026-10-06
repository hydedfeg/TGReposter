import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPaymentDiscriminator,
  formatUnits,
  maxPaymentDiscriminatorSlot,
  parseDecimalToUnits,
} from "../server/payments/paymentAmount";

test("payment amount math uses exact integer units", () => {
  assert.equal(parseDecimalToUnits("20", 6), 20_000_000n);
  assert.equal(parseDecimalToUnits("20.1", 6), 20_100_000n);
  assert.equal(formatUnits(20_003_827n, 6), "20.003827");
  assert.equal(formatUnits(20_000_000n, 6), "20");
});

test("USDT discriminator adds only bounded micro-unit suffixes", () => {
  assert.equal(
    applyPaymentDiscriminator({
      baseAmount: "20.00",
      tokenDecimals: 6,
      slot: 3827,
      discriminatorDigits: 4,
    }),
    "20.003827"
  );

  assert.equal(
    applyPaymentDiscriminator({
      baseAmount: "20.00",
      tokenDecimals: 18,
      slot: 3827,
      discriminatorDigits: 4,
    }),
    "20.003827"
  );

  assert.equal(maxPaymentDiscriminatorSlot(4), 9999);
});

test("payment amount math rejects unsafe precision", () => {
  assert.throws(
    () => parseDecimalToUnits("20.0000001", 6),
    /more than 6 supported decimal places/
  );
  assert.throws(
    () =>
      applyPaymentDiscriminator({
        baseAmount: "20",
        tokenDecimals: 5,
        slot: 1,
      }),
    /requires at least 6 token decimals/
  );
  assert.throws(
    () =>
      applyPaymentDiscriminator({
        baseAmount: "999999999999999999",
        tokenDecimals: 6,
        slot: 9999,
      }),
    /ledger integer precision/
  );
});
