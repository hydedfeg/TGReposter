import React, { useState } from "react";
import { Lock, Key, ShieldAlert, Sparkles, RefreshCw, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { safeResponseJson } from "../utils/api";
import LanguageSelector from "./LanguageSelector";

const AUTH_ERROR_KEYS: Record<string, string> = {
  "administration account has already been configured.": "errors.alreadyConfigured",
  "no accounts configured. please set up owner credentials.": "errors.noAccountsConfigured",
  "username/email and password are required.": "errors.credentialsRequired",
  "invalid username/email or password.": "errors.invalidCredentials",
  "invalid email or password.": "errors.invalidEmailPassword",
  "username must be at least 3 characters.": "validation.usernameTooShort",
  "password must be at least 4 characters long.": "validation.passwordTooShort",
};

function getAuthErrorKey(error: unknown): string {
  const message = typeof error === "string" ? error.trim().toLowerCase() : "";

  if (AUTH_ERROR_KEYS[message]) return AUTH_ERROR_KEYS[message];
  if (message.includes("invalid login credentials")) return "errors.invalidLoginCredentials";
  if (message.includes("email not confirmed")) return "errors.emailNotConfirmed";
  if (message.includes("rate limit") || message.includes("too many requests")) return "errors.rateLimited";

  return "errors.authenticationFailed";
}

interface LoginProps {
  passwordSet: boolean;
  onSuccess: (
    token: string,
    isNewSetup: boolean,
    role: 'super-admin' | 'admin',
    username: string,
    accountKey: string
  ) => void;
}

export default function Login({ passwordSet, onSuccess }: LoginProps) {
  const { t } = useTranslation("auth");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorKey("validation.identityRequired");
      return;
    }
    if (!password.trim()) {
      setErrorKey("validation.passwordRequired");
      return;
    }

    if (!passwordSet) {
      if (username.trim().length < 3) {
        setErrorKey("validation.usernameTooShort");
        return;
      }
      if (password.length < 4) {
        setErrorKey("validation.passwordTooShort");
        return;
      }
      if (password !== confirmPassword) {
        setErrorKey("validation.passwordsMismatch");
        return;
      }
    }

    setErrorKey(null);
    setIsSubmitting(true);

    const endpoint = passwordSet ? "/api/auth/login" : "/api/auth/setup";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim()
        })
      });

      const data = await safeResponseJson(res);

      if (res.ok && data.token) {
        if (!passwordSet) {
          setSetupSuccess(true);
          setTimeout(() => {
            onSuccess(
              data.token,
              true,
              data.role || "super-admin",
              data.username || username.trim(),
              data.accountKey
            );
          }, 1500);
        } else {
          onSuccess(
            data.token,
            false,
            data.role || "admin",
            data.username || username.trim(),
            data.accountKey
          );
        }
      } else {
        setErrorKey(getAuthErrorKey(data.error));
      }
    } catch (err: any) {
      setErrorKey("errors.network");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md space-y-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9">
        <div className="flex justify-end">
          <LanguageSelector />
        </div>

        {/* Branding/Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-lg shadow-sky-100">
            {passwordSet ? (
              <Lock className="h-6 w-6" />
            ) : (
              <Key className="h-6 w-6" />
            )}
          </div>
          <h2 className="mt-6 text-2xl font-display font-bold tracking-tight text-slate-900">
            {passwordSet ? t("title.signIn") : t("title.setup")}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
            {passwordSet 
              ? t("description.signIn")
              : t("description.setup")}
          </p>
        </div>

        {setupSuccess ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto animate-pulse" />
            <h3 className="text-base font-semibold text-emerald-950">{t("success.title")}</h3>
            <p className="text-sm leading-6 text-emerald-700">
              {t("success.description")}
            </p>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {errorKey && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800" role="alert">
                <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">{t("alert.title")}</p>
                  <p className="mt-0.5 leading-5 text-rose-700">{t(errorKey)}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  {passwordSet ? t("fields.usernameOrEmail") : t("fields.superAdminUsername")}
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={passwordSet ? t("placeholders.usernameOrEmail") : t("placeholders.ownerUsername")}
                  autoComplete="username"
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-base text-slate-800 outline-hidden focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  {t("fields.password")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete={passwordSet ? "current-password" : "new-password"}
                    className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 ps-3.5 pe-12 font-mono text-base text-slate-800 outline-hidden focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t("actions.hidePassword") : t("actions.showPassword")}
                    className="absolute end-0 top-0 flex h-12 w-12 items-center justify-center text-slate-400 transition-colors hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!passwordSet && (
                  <p className="mt-1.5 text-sm leading-5 text-slate-500">
                    {t("passwordHelp")}
                  </p>
                )}
              </div>

              {!passwordSet && (
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    {t("fields.confirmPassword")}
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 font-mono text-base text-slate-800 outline-hidden focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  />
                </div>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-slate-950 px-4 text-sm font-bold text-white transition-colors hover:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:bg-slate-300"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {passwordSet ? t("actions.signingIn") : t("actions.creatingOwner")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-sky-400" />
                    {passwordSet ? t("actions.signIn") : t("actions.createOwner")}
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer info */}
        <div className="border-t border-slate-100 pt-5 text-center text-sm leading-6 text-slate-500">
          {t("footer")}
        </div>
      </div>
    </div>
  );
}
