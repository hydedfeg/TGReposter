export interface AuthenticatedUserIdentity {
  id?: string;
  username?: string;
  authProvider?: "supabase" | "legacy" | string;
}

export function ownerPrincipalForUser(
  user: AuthenticatedUserIdentity | null | undefined
): string {
  if (user?.authProvider === "supabase" && user.id) {
    return `supabase:${String(user.id).trim().toLowerCase()}`;
  }

  const username =
    typeof user?.username === "string"
      ? user.username.trim().toLowerCase()
      : "";

  if (username) {
    return `legacy:${username}`;
  }

  throw new Error("Authenticated user identity is required.");
}
