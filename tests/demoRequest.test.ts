import assert from "node:assert/strict";
import test from "node:test";
import { validateDemoRequest } from "../server/services/demoRequestService";

test("demo request validation accepts a normalized valid request", () => {
  const result = validateDemoRequest({
    fullName: "  Jane Smith  ",
    email: "  JANE@Example.com ",
    company: " Example Co ",
    telegramUsername: " @jane ",
    useCase: "both",
    message: " Interested in curation and campaigns. ",
    locale: "en",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.fullName, "Jane Smith");
  assert.equal(result.value.email, "jane@example.com");
  assert.equal(result.value.company, "Example Co");
  assert.equal(result.value.telegramUsername, "@jane");
  assert.equal(result.value.useCase, "both");
  assert.equal(result.value.locale, "en");
});

test("demo request validation rejects invalid email, use-case, and locale values", () => {
  assert.deepEqual(
    validateDemoRequest({
      fullName: "Jane",
      email: "not-an-email",
      useCase: "both",
      locale: "en",
    }),
    { ok: false, code: "DEMO_REQUEST_EMAIL_INVALID" },
  );

  assert.deepEqual(
    validateDemoRequest({
      fullName: "Jane",
      email: "jane@example.com",
      useCase: "admin",
      locale: "en",
    }),
    { ok: false, code: "DEMO_REQUEST_USE_CASE_INVALID" },
  );

  assert.deepEqual(
    validateDemoRequest({
      fullName: "Jane",
      email: "jane@example.com",
      useCase: "both",
      locale: "de",
    }),
    { ok: false, code: "DEMO_REQUEST_LOCALE_INVALID" },
  );
});
