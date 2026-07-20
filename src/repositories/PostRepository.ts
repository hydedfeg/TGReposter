import { supabase } from "../supabase";

export interface PostRecord {
  id: string;
  channel_username: string;
  original_text: string;
  edited_text?: string;
  photo_url?: string;
  telegram_url: string;
  published_at: string;
  status: string;
}

export class PostRepository {
  async upsertMany(posts: PostRecord[]) {
    const { data, error } = await supabase
      .from("posts")
      .upsert(posts, {
        onConflict: "id",
      })
      .select();

    if (error) {
      throw error;
    }

    return data;
  }

  async getRecent(limit = 400) {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data;
  }

  async count() {
    const { count, error } = await supabase
      .from("posts")
      .select("*", {
        count: "exact",
        head: true,
      });

    if (error) {
      throw error;
    }

    return count ?? 0;
  }
}

export default new PostRepository();