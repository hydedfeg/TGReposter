import { Client } from "pg";
import { getPostgresConnectionString } from "../utils/postgresConnection";

export const DEMO_REQUEST_USE_CASES = [
  "curation",
  "campaigns",
  "both",
  "other",
] as const;

export type DemoRequestUseCase = (typeof DEMO_REQUEST_USE_CASES)[number];

export interface DemoRequestInput {
  fullName: string;
  email: string;
  company?: string;
  telegramUsername?: string;
  useCase: DemoRequestUseCase;
  message?: string;
  locale: "en" | "ru" | "ar" | "fa";
}

type DemoRequestValidationResult =
  | { ok: true; value: DemoRequestInput }
  | { ok: false; code: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function validateDemoRequest(input: unknown): DemoRequestValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, code: "DEMO_REQUEST_INVALID" };
  }

  const payload = input as Record<string, unknown>;
  const fullName = cleanText(payload.fullName, 100);
  const email = cleanText(payload.email, 254).toLowerCase();
  const company = cleanText(payload.company, 120);
  const telegramUsername = cleanText(payload.telegramUsername, 64);
  const message = cleanText(payload.message, 1200);
  const useCase = cleanText(payload.useCase, 32);
  const locale = cleanText(payload.locale, 8);

  if (fullName.length < 2) {
    return { ok: false, code: "DEMO_REQUEST_NAME_REQUIRED" };
  }

  if (!emailPattern.test(email)) {
    return { ok: false, code: "DEMO_REQUEST_EMAIL_INVALID" };
  }

  if (!DEMO_REQUEST_USE_CASES.includes(useCase as DemoRequestUseCase)) {
    return { ok: false, code: "DEMO_REQUEST_USE_CASE_INVALID" };
  }

  if (!["en", "ru", "ar", "fa"].includes(locale)) {
    return { ok: false, code: "DEMO_REQUEST_LOCALE_INVALID" };
  }

  return {
    ok: true,
    value: {
      fullName,
      email,
      company: company || undefined,
      telegramUsername: telegramUsername || undefined,
      useCase: useCase as DemoRequestUseCase,
      message: message || undefined,
      locale: locale as DemoRequestInput["locale"],
    },
  };
}

export async function saveDemoRequest(input: DemoRequestInput): Promise<string> {
  const client = new Client({ connectionString: getPostgresConnectionString() });

  try {
    await client.connect();

    const recent = await client.query<{ count: string }>(
      `select count(*)::text as count
         from public.demo_requests
        where lower(email) = lower($1)
          and created_at >= now() - interval '24 hours'`,
      [input.email],
    );

    if (Number(recent.rows[0]?.count ?? 0) >= 3) {
      const error = new Error("Demo request limit reached.");
      error.name = "DemoRequestRateLimitError";
      throw error;
    }

    const result = await client.query<{ id: string }>(
      `insert into public.demo_requests (
         full_name,
         email,
         company,
         telegram_username,
         use_case,
         message,
         locale,
         source
       ) values ($1, $2, $3, $4, $5, $6, $7, 'landing_page')
       returning id::text`,
      [
        input.fullName,
        input.email,
        input.company ?? null,
        input.telegramUsername ?? null,
        input.useCase,
        input.message ?? null,
        input.locale,
      ],
    );

    return result.rows[0].id;
  } finally {
    await client.end().catch(() => undefined);
  }
}
