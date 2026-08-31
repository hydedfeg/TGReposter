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

  async remove(username: string) {
    await getPostgresPool().query(
      `delete from public.source_channels where username = $1`,
      [username]
    );
  }
}
