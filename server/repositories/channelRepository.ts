import { getPostgresPool } from "../utils/postgresPool";

export interface SourceChannel {
  id?: string;
  username: string;
  display_name?: string;
  enabled?: boolean;
  last_scan_at?: string | null;
  status?: "idle" | "fetching" | "success" | "error";
  error_message?: string | null;
}

export class ChannelRepository {
  async getAll(): Promise<SourceChannel[]> {
    const { rows } = await getPostgresPool().query(
      `
        select id, username, display_name, enabled, last_scan_at, status, error_message
        from public.source_channels
        order by created_at asc, username asc
      `
    );

    return rows;
  }

  async create(channel: SourceChannel) {
    await getPostgresPool().query(
      `
        insert into public.source_channels
          (username, display_name, enabled, status, updated_at)
        values ($1, $2, $3, $4, now())
        on conflict (username) do update
        set display_name = excluded.display_name,
            enabled = excluded.enabled,
            status = excluded.status,
            updated_at = now()
      `,
      [
        channel.username,
        channel.display_name ?? null,
        channel.enabled ?? true,
        channel.status ?? "idle",
      ]
    );
  }

  async saveScanState(channel: SourceChannel) {
    await getPostgresPool().query(
      `
        insert into public.source_channels
          (username, display_name, enabled, last_scan_at, status, error_message, updated_at)
        values ($1, $2, $3, $4, $5, $6, now())
        on conflict (username) do update
        set display_name = coalesce(excluded.display_name, public.source_channels.display_name),
            last_scan_at = coalesce(excluded.last_scan_at, public.source_channels.last_scan_at),
            status = excluded.status,
            error_message = excluded.error_message,
            updated_at = now()
      `,
      [
        channel.username,
        channel.display_name ?? null,
        channel.enabled ?? true,
        channel.last_scan_at ?? null,
        channel.status ?? "idle",
        channel.error_message ?? null,
      ]
    );
  }

  async remove(username: string) {
    await getPostgresPool().query(
      `delete from public.source_channels where username = $1`,
      [username]
    );
  }
}
