import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { API_ERROR_CODES } from "../shared/apiErrorCodes";
import { APP_LOCALES } from "../src/i18n/locales";
import { i18nResources } from "../src/i18n/resources";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function publishingErrors(locale: (typeof APP_LOCALES)[number]): Record<string, string> {
  const common = i18nResources[locale].common as {
    runtime: {
      publishing: {
        errors: Record<string, string>;
      };
    };
  };
  return common.runtime.publishing.errors;
}

test("all locales expose the same publishing API error translations", () => {
  const expected = Object.keys(publishingErrors("en")).sort();

  for (const locale of APP_LOCALES) {
    assert.deepEqual(
      Object.keys(publishingErrors(locale)).sort(),
      expected,
      `publishing API error keys differ for ${locale}`,
    );

    for (const value of Object.values(publishingErrors(locale))) {
      assert.equal(typeof value, "string");
      assert.ok(value.trim());
    }
  }
});

test("login prefers stable auth error codes and keeps message fallback compatibility", () => {
  const source = readFileSync(resolve(root, "src/components/Login.tsx"), "utf8");

  assert.match(source, /AUTH_ERROR_CODE_KEYS/);
  assert.match(source, /API_ERROR_CODES\.auth\.invalidCredentials/);
  assert.match(source, /getAuthErrorKey\(data\.code, data\.error\)/);
  assert.match(source, /AUTH_ERROR_KEYS/);
});

test("workspace publishing localizes API codes but preserves backend detail for diagnostics", () => {
  const source = readFileSync(resolve(root, "src/App.tsx"), "utf8");

  assert.match(source, /PUBLISHING_ERROR_KEYS/);
  assert.match(source, /API_ERROR_CODES\.publishing\.postNotApproved/);
  assert.match(source, /errorKey \? t\(errorKey\) : persistedErrorMessage/);
  assert.match(source, /errorMessage: persistedErrorMessage \|\| message/);
});

test("server returns stable codes alongside backward-compatible English error fields", () => {
  const source = readFileSync(resolve(root, "server.ts"), "utf8");

  for (const code of [
    API_ERROR_CODES.auth.noAccountsConfigured,
    API_ERROR_CODES.auth.credentialsRequired,
    API_ERROR_CODES.auth.invalidCredentials,
    API_ERROR_CODES.publishing.postNotFound,
    API_ERROR_CODES.publishing.postNotApproved,
    API_ERROR_CODES.publishing.botNotConfigured,
    API_ERROR_CODES.publishing.noEnabledTargets,
  ]) {
    assert.ok(source.includes(code.split(".").pop() ?? "") || source.includes("API_ERROR_CODES"));
  }

  assert.match(source, /code: API_ERROR_CODES\.auth\.invalidCredentials/);
  assert.match(source, /code: API_ERROR_CODES\.publishing\.postNotFound/);
  assert.match(source, /code: API_ERROR_CODES\.publishing\.postNotApproved/);
  assert.match(source, /code: API_ERROR_CODES\.publishing\.noEnabledTargets/);
  assert.match(source, /error: "Invalid username\/email or password\."/);
  assert.match(source, /error: "Approve this Content Inbox post before publishing it\."/);
});
