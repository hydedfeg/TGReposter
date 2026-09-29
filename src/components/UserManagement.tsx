import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { normalizeAppLocale } from "../i18n";
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

interface TeamFeedback {
  message?: string;
  messageKey?: string;
  values?: Record<string, string>;
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
  const { t, i18n } = useTranslation("team");
  const locale = normalizeAppLocale(i18n.language);
  const numberFormatter = new Intl.NumberFormat(locale);
  const dateFormatter = new Intl.DateTimeFormat(`${locale}-u-ca-gregory`, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"super-admin" | "admin">("admin");
  const [error, setError] = useState<TeamFeedback | null>(null);
  const [success, setSuccess] = useState<TeamFeedback | null>(null);
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
    setError(null);
    setSuccess(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError({ messageKey: "feedback.validEmail" });
      return;
    }

    if (!password || password.length < 8) {
      setError({ messageKey: "feedback.passwordLength" });
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await onAddUser(cleanEmail, password, role);
      if (ok) {
        setSuccess({
          messageKey: "feedback.provisionSuccess",
          values: { identity: cleanEmail },
        });
        setEmail("");
        setPassword("");
        setRole("admin");
      } else {
        setError({ messageKey: "feedback.provisionFailed" });
      }
    } catch (err: any) {
      setError(err?.message ? { message: err.message } : { messageKey: "feedback.provisionFailed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (identity: string) => {
    const confirmed = window.confirm(
      t("feedback.revokeConfirm", { identity })
    );
    if (!confirmed) return;

    setError(null);
    setSuccess(null);

    try {
      const ok = await onDeleteUser(identity);
      if (ok) {
        setSuccess({
          messageKey: "feedback.revokeSuccess",
          values: { identity },
        });
      } else {
        setError({ messageKey: "feedback.revokeFailed" });
      }
    } catch (err: any) {
      setError(err?.message ? { message: err.message } : { messageKey: "feedback.revokeAccountFailed" });
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
                {t("header.title")}
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {t("header.description")}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
            <ShieldCheck className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
            <div>
              <p className="font-bold" dir="auto">{currentUsername || t("header.superAdminFallback")}</p>
              <p className="text-xs text-indigo-700">{t("header.currentAdministrator")}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-sky-100 bg-sky-50/70 p-4">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-sky-600" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-900">{t("isolation.inboxTitle")}</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {t("isolation.inboxDescription")}
            </p>
          </article>

          <article className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-900">{t("isolation.destinationsTitle")}</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {t("isolation.destinationsDescription")}
            </p>
          </article>

          <article className="rounded-xl border border-violet-100 bg-violet-50/70 p-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-violet-600" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-900">{t("isolation.setupTitle")}</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {t("isolation.setupDescription")}
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
                {t("form.title")}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("form.description")}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error ? (
              <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
                <span dir="auto">{error.messageKey ? t(error.messageKey, error.values) : error.message}</span>
              </div>
            ) : null}

            {success ? (
              <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span dir="auto">{success.messageKey ? t(success.messageKey, success.values) : success.message}</span>
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("form.email")}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  dir="ltr"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("form.emailPlaceholder")}
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 ps-10 pe-3 text-sm text-slate-900 outline-hidden focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <p className="mt-1.5 text-xs leading-5 text-slate-400">
                {t("form.emailHelp")}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("form.password")}
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  dir="ltr"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("form.passwordPlaceholder")}
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 ps-10 pe-3 text-sm text-slate-900 outline-hidden focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("form.role")}
              </label>
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as "super-admin" | "admin")
                }
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-hidden focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              >
                <option value="admin">
                  {t("form.roles.adminOption")}
                </option>
                <option value="super-admin">
                  {t("form.roles.superAdminOption")}
                </option>
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-700">
                {role === "super-admin" ? t("form.roles.superAdminTitle") : t("form.roles.adminTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {role === "super-admin"
                  ? t("form.roles.superAdminDescription")
                  : t("form.roles.adminDescription")}
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:bg-slate-400"
            >
              <KeyRound className="h-4 w-4 text-sky-400" aria-hidden="true" />
              {isSubmitting ? t("form.submitting") : t("form.submit")}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-950">
                {t("members.title")}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("members.summary", {
                  active: numberFormatter.format(activeUsers.length),
                  total: numberFormatter.format(users.length),
                })}
                {legacyUsers.length
                  ? t("members.legacySuffix", { legacy: numberFormatter.format(legacyUsers.length) })
                  : ""}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t("members.isolationEnabled")}
            </div>
          </div>

          {legacyUsers.length > 0 ? (
            <div className="mx-5 mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-bold">{t("members.legacyTitle")}</p>
                <p className="mt-0.5 text-amber-700">
                  {t("members.legacyDescription")}
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
                        <span dir="auto">{user.username}</span>
                      </p>
                      {self ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                          {t("members.you")}
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
                        {isSuper ? t("members.roles.superAdmin") : t("members.roles.admin")}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {active ? t("members.status.active") : t("members.status.revoked")}
                      </span>
                    </div>

                    {user.email ? (
                      <p className="mt-1 truncate text-xs font-medium text-slate-500" dir="ltr">
                        {user.email}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("members.added", {
                          date: dateFormatter.format(new Date(user.createdAt || Date.now())),
                        })}
                      </span>
                      <span>·</span>
                      <span className="font-semibold">
                        {isSupabase ? t("members.providers.supabase") : t("members.providers.legacy")}
                      </span>
                      <span>·</span>
                      <span>{t("members.privateWorkspace")}</span>
                    </div>

                    {!isSupabase ? (
                      <p className="mt-2 text-xs font-medium text-amber-600">
                        {t("members.legacyWarning")}
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
                      {t("members.revoke")}
                    </button>
                  ) : null}
                </article>
              );
            })}

            {users.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="mx-auto h-9 w-9 text-slate-300" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-slate-700">
                  {t("members.emptyTitle")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("members.emptyDescription")}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
