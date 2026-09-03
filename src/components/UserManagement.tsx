import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  Calendar,
  CheckCircle2,
  Database,
  Inbox,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { CuratorUser } from "../types";

interface UserManagementProps {
  users: CuratorUser[];
  onAddUser: (
    username: string,
    password: string,
    role: "super-admin" | "admin"
  ) => Promise<boolean>;
  onDeleteUser: (username: string) => Promise<boolean>;
  currentUsername: string | null;
}

function isCurrentUser(user: CuratorUser, currentUsername: string | null) {
  const current = (currentUsername || "").trim().toLowerCase();
  if (!current) return false;

  return (
    user.username.trim().toLowerCase() === current ||
    (user.email || "").trim().toLowerCase() === current
  );
}

export default function UserManagement({
  users,
  onAddUser,
  onDeleteUser,
  currentUsername,
}: UserManagementProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"super-admin" | "admin">("admin");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeUsers = useMemo(
    () => users.filter((user) => user.isActive !== false),
    [users]
  );
  const legacyUsers = useMemo(
    () => users.filter((user) => user.authProvider !== "supabase"),
    [users]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Enter a valid email address. New workspace members use Supabase Auth.");
      return;
    }

    if (!password || password.length < 8) {
      setError("Temporary passwords must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await onAddUser(cleanEmail, password, role);
      if (ok) {
        setSuccess(
          `Workspace member "${cleanEmail}" was provisioned with a fully isolated personal workspace.`
        );
        setEmail("");
        setPassword("");
        setRole("admin");
      } else {
        setError("Unable to provision this workspace member.");
      }
    } catch (err: any) {
      setError(err?.message || "Unable to provision this workspace member.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (identity: string) => {
    const confirmed = window.confirm(
      `Revoke access for "${identity}"? Their complete personal workspace will be retained for audit/recovery, but they will no longer be able to sign in.`
    );
    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      const ok = await onDeleteUser(identity);
      if (ok) {
        setSuccess(
          `Access for "${identity}" was revoked. Personal workspace data was retained.`
        );
      } else {
        setError(
          "Unable to revoke access. Make sure you are not revoking yourself or the final Super-Admin."
        );
      }
    } catch (err: any) {
      setError(err?.message || "Unable to revoke this account.");
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold text-slate-950">
                Team & Workspace Access
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Every member owns a fully isolated workspace: Sources, Filters, AI configuration,
              Content Inbox, Destinations, Promotions, publishing history, and dashboard data.
              No member's application data is reused as another member's configuration or content.
              Super-Admins only receive additional Team & Access and infrastructure-health controls.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
            <ShieldCheck className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
            <div>
              <p className="font-bold">{currentUsername || "Super-Admin"}</p>
              <p className="text-xs text-indigo-700">Current system administrator</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-sky-100 bg-sky-50/70 p-4">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-sky-600" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-900">Private Content & Sources</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Sources, filters, collected content, edits, approvals, archives, and history belong to that member.
            </p>
          </article>

          <article className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-900">Private Publishing & Promotions</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Each member owns separate Telegram credentials, destinations, promotion targets, and campaigns.
            </p>
          </article>

          <article className="rounded-xl border border-violet-100 bg-violet-50/70 p-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-violet-600" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-900">Administrative Controls Only</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Super-Admins manage the account directory and infrastructure health; they do not provide shared application configuration to other users.
            </p>
          </article>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-slate-700" aria-hidden="true" />
            <div>
              <h3 className="font-display text-base font-bold text-slate-950">
                Add Workspace Member
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                New accounts use Supabase Auth and get a separate personal workspace.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error ? (
              <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            {success ? (
              <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>{success}</span>
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="member@example.com"
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-hidden focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <p className="mt-1.5 text-xs leading-5 text-slate-400">
                Email becomes the durable Supabase identity used to isolate personal data.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Temporary password
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-hidden focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Access role
              </label>
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as "super-admin" | "admin")
                }
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-hidden focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              >
                <option value="admin">
                  Admin — Personal curation & publishing
                </option>
                <option value="super-admin">
                  Super-Admin — Personal workspace + system administration
                </option>
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-700">
                {role === "super-admin" ? "Super-Admin access" : "Admin access"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {role === "super-admin"
                  ? "Gets a complete private workspace (Sources, Filters, AI, Inbox, Destinations, Promotions and History) plus Team & Access and infrastructure-health administration."
                  : "Gets a complete private workspace: Sources, Filters, AI, Inbox, Destinations, Promotions and Publishing History. Other users' application data is never exposed."}
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:bg-slate-400"
            >
              <KeyRound className="h-4 w-4 text-sky-400" aria-hidden="true" />
              {isSubmitting ? "Provisioning member..." : "Provision workspace member"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-950">
                Workspace Members
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {activeUsers.length} active · {users.length} total
                {legacyUsers.length ? ` · ${legacyUsers.length} legacy` : ""}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Personal workspace isolation enabled
            </div>
          </div>

          {legacyUsers.length > 0 ? (
            <div className="mx-5 mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-bold">Legacy accounts still exist</p>
                <p className="mt-0.5 text-amber-700">
                  They remain compatible and use a normalized username as their personal workspace key.
                  New members should be created with email so ownership is tied to an immutable Supabase user ID.
                </p>
              </div>
            </div>
          ) : null}

          <div className="divide-y divide-slate-100 px-5">
            {users.map((user) => {
              const self = isCurrentUser(user, currentUsername);
              const isSuper = user.role === "super-admin";
              const isSupabase = user.authProvider === "supabase";
              const active = user.isActive !== false;
              const identity = user.email || user.username;

              return (
                <article
                  key={user.id || `${user.authProvider || "legacy"}:${identity}`}
                  className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-950">
                        {user.username}
                      </p>
                      {self ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                          You
                        </span>
                      ) : null}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                          isSuper
                            ? "border-slate-200 bg-slate-100 text-slate-800"
                            : "border-sky-100 bg-sky-50 text-sky-700"
                        }`}
                      >
                        {isSuper ? (
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <UserCheck className="h-3 w-3" aria-hidden="true" />
                        )}
                        {isSuper ? "Super-Admin" : "Admin"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {active ? "Active" : "Revoked"}
                      </span>
                    </div>

                    {user.email ? (
                      <p className="mt-1 truncate text-xs font-medium text-slate-500">
                        {user.email}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        Added{" "}
                        {new Date(user.createdAt || Date.now()).toLocaleDateString(
                          undefined,
                          { year: "numeric", month: "short", day: "numeric" }
                        )}
                      </span>
                      <span>·</span>
                      <span className="font-semibold">
                        {isSupabase ? "Supabase Auth" : "Legacy identity"}
                      </span>
                      <span>·</span>
                      <span>Fully isolated personal workspace</span>
                    </div>

                    {!isSupabase ? (
                      <p className="mt-2 text-xs font-medium text-amber-600">
                        Legacy workspace ownership is username-based. Prefer an email/Supabase account for new members.
                      </p>
                    ) : null}
                  </div>

                  {!self && active ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(identity)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:self-center"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Revoke access
                    </button>
                  ) : null}
                </article>
              );
            })}

            {users.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="mx-auto h-9 w-9 text-slate-300" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-slate-700">
                  No workspace members found
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Provision the first account from the form on the left.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
