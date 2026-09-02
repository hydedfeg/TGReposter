import test from "node:test";
import assert from "node:assert/strict";
import {
  destinationOwnerPrincipalForUser,
} from "../server/services/userDestinationService";

test("Supabase destination ownership is tied to the immutable auth user id", () => {
  assert.equal(
    destinationOwnerPrincipalForUser({
      id: "A0B1C2D3-E4F5-6789-ABCD-EF0123456789",
      username: "Display Name",
      authProvider: "supabase",
    }),
    "supabase:a0b1c2d3-e4f5-6789-abcd-ef0123456789"
  );
});

test("legacy destination ownership is isolated by normalized username", () => {
  assert.equal(
    destinationOwnerPrincipalForUser({
      username: "  User_1  ",
      authProvider: "legacy",
    }),
    "legacy:user_1"
  );
});

test("destination ownership fails closed without an authenticated identity", () => {
  assert.throws(
    () => destinationOwnerPrincipalForUser({}),
    /Authenticated user identity is required/
  );
});
