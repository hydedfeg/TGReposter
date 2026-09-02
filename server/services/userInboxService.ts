import userInboxRepository, {
  type UserInboxPostRow,
} from "../repositories/userInboxRepository";
import {
  ownerPrincipalForUser,
  type AuthenticatedUserIdentity,
} from "./userPrincipalService";

function mapRow(row: UserInboxPostRow) {
  return {
    id: row.id,
    channelUsername: row.channel_username,
    originalText: row.original_text,
    text: row.edited_text ?? row.original_text,
    mediaType: row.media_type ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    videoUrl: row.video_url ?? undefined,
    date: row.published_at,
    url: row.telegram_url,
    status: row.status,
    postedAt: row.posted_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
  };
}

export async function getUserInboxPosts(
  user: AuthenticatedUserIdentity,
  limit = 400
) {
  const ownerPrincipal = ownerPrincipalForUser(user);
  const rows = await userInboxRepository.list(ownerPrincipal, limit);
  return rows.map(mapRow);
}

export async function getUserInboxPost(
  user: AuthenticatedUserIdentity,
  postId: string
) {
  const ownerPrincipal = ownerPrincipalForUser(user);
  const row = await userInboxRepository.getById(ownerPrincipal, postId);
  return row ? mapRow(row) : null;
}

export async function saveUserInboxPosts(
  user: AuthenticatedUserIdentity,
  posts: unknown
) {
  const ownerPrincipal = ownerPrincipalForUser(user);
  await userInboxRepository.upsertStates(ownerPrincipal, posts);
}
