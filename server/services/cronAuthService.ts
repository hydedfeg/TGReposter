import crypto from "crypto";
import { getPostgresPool } from "../utils/postgresPool";

const INBOX_CRON_SECRET_NAME = "tgreposter_cron_secret";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function isValidInboxCronSecret(provided?: string): Promise<boolean> {
  const candidate = provided?.trim();
  if (!candidate) return false;

  const { rows } = await getPostgresPool().query(
    `
      select decrypted_secret
      from vault.decrypted_secrets
      where name = $1
      order by created_at desc
      limit 1
    `,
    [INBOX_CRON_SECRET_NAME]
  );

  const expected =
    typeof rows[0]?.decrypted_secret === "string"
      ? rows[0].decrypted_secret.trim()
      : "";

  return !!expected && safeEqual(candidate, expected);
}
