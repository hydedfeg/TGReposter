import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { API_ERROR_CODES } from "../shared/apiErrorCodes";
import { APP_LOCALES } from "../src/i18n/locales";
import { i18nResources } from "../src/i18n/resources";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("every stable publishing error code has localized UI copy", () => {
  for (const locale of APP_LOCALES) {
    const common = i18nResources[locale].common as {
      runtime?: {
        publishing?: {
          errors?: Record<string, unknown>;
        };
      };
    };

    const translations = common.runtime?.publishing?.errors;
    assert.ok(translations, `missing runtime.publishing.errors for ${locale}`);

    for (const key of Object.keys(API_ERROR_CODES.publishing)) {
      assert.equal(
        typeof translations[key],
        "string",
        `missing publishing error translation for ${locale}.${key}`,
      );
      assert.ok(String(translations[key]).trim());
    }
  }
});

test("login prefers stable API auth codes and keeps legacy message fallback", () => {
  const login = readFileSync(resolve(root, "src/components/Login.tsx"), "utf8");

  assert.match(login, /AUTH_ERROR_CODE_KEYS/);
  assert.match(login, /API_ERROR_CODES\.auth\.invalidCredentials/);
  assert.match(login, /getAuthErrorKey\(data\.code, data\.error\)/);
  assert.match(login, /AUTH_ERROR_KEYS/);
  assert.match(login, /invalid login credentials/);
});

test("workspace localizes publishing errors by code without discarding backend detail", () => {
  const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");

  assert.match(app, /PUBLISHING_ERROR_KEYS/);
  assert.match(app, /API_ERROR_CODES\.publishing\.botNotConfigured/);
  assert.match(app, /typeof data\.code === "string"/);
  assert.match(app, /PUBLISHING_ERROR_KEYS\[data\.code\]/);
  assert.match(app, /persistedErrorMessage/);
  assert.match(app, /errorMessage: persistedErrorMessage \|\| message/);
});

test("backend emits stable auth and publishing codes while preserving error text", () => {
  const server = readFileSync(resolve(root, "server.ts"), "utf8");

  for (const code of Object.values(API_ERROR_CODES.auth)) {
    assert.equal(server.includes(code), false, "server should reference shared constants, not duplicate auth literals");
  }
  for (const code of Object.values(API_ERROR_CODES.publishing)) {
    assert.equal(server.includes(code), false, "server should reference shared constants, not duplicate publishing literals");
  }

  assert.match(server, /API_ERROR_CODES\.auth\.invalidCredentials/);
  assert.match(server, /API_ERROR_CODES\.auth\.emailNotConfirmed/);
  assert.match(server, /API_ERROR_CODES\.publishing\.postNotApproved/);
  assert.match(server, /API_ERROR_CODES\.publishing\.disabledTargets/);
  assert.match(server, /error: "Invalid username\/email or password\."/);
  assert.match(server, /error: "Approve this Content Inbox post before publishing it\."/);
});
