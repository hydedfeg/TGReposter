import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_USDT_ASSETS,
  resolveCanonicalUsdtTokenIdentifier,
} from "../server/payments/usdtAssetRegistry";

test("USDT asset registry pins the supported network identifiers", () => {
  assert.equal(
    CANONICAL_USDT_ASSETS.ethereum.tokenIdentifier,
    "0xdac17f958d2ee523a2206206994597c13d831ec7"
  );
  assert.equal(
    CANONICAL_USDT_ASSETS.ton.tokenIdentifier,
    "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"
  );
  assert.equal(
    CANONICAL_USDT_ASSETS.bsc.tokenIdentifier,
    "0x55d398326f99059ff775485246999027b3197955"
  );
  assert.equal(
    CANONICAL_USDT_ASSETS.bsc.provenance,
    "bnb-chain-usdt-representation"
  );
});

test("USDT asset registry rejects lookalike token contracts", () => {
  assert.throws(
    () =>
      resolveCanonicalUsdtTokenIdentifier(
        "ethereum",
        "0x1111111111111111111111111111111111111111"
      ),
    /not the allow-listed USDT asset/
  );

  assert.throws(
    () =>
      resolveCanonicalUsdtTokenIdentifier(
        "ton",
        "EQFakeUsdtJettonMaster"
      ),
    /not the allow-listed USDT asset/
  );
});

test("TON registry accepts the canonical raw master and normalizes it", () => {
  assert.equal(
    resolveCanonicalUsdtTokenIdentifier(
      "ton",
      "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe"
    ),
    "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"
  );
});
