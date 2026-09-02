import React, { useState } from "react";
import { Lock, Key, ShieldAlert, Sparkles, RefreshCw, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { safeResponseJson } from "../utils/api";

interface LoginProps {
  passwordSet: boolean;
  onSuccess: (token: string, isNewSetup: boolean, role: 'super-admin' | 'admin', username: string) => void;
}

export default function Login({ passwordSet, onSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Username or email cannot be empty.");
      return;
    }
    if (!password.trim()) {
      setError("Password cannot be empty.");
      return;
    }

    if (!passwordSet) {
      if (username.trim().length < 3) {
        setError("Username must be at least 3 characters.");
        return;
      }
      if (password.length < 4) {
        setError("Password must be at least 4 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setError("");
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
            onSuccess(data.token, true, data.role || "super-admin", data.username || username.trim());
          }, 1500);
        } else {
          onSuccess(data.token, false, data.role || "admin", data.username || username.trim());
        }
      } else {
        setError(data.error || "Authentication failed. Please verify credentials.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected server network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md space-y-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9">
        
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
            {passwordSet ? "Sign in to TGReposter" : "Create the owner account"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
            {passwordSet 
              ? "Use your legacy username or Supabase Auth email to access TGReposter."
              : "Create the first super-admin account to secure this workspace and establish ownership."}
          </p>
        </div>

        {setupSuccess ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto animate-pulse" />
            <h3 className="text-base font-semibold text-emerald-950">Account created</h3>
            <p className="text-sm leading-6 text-emerald-700">
              Your super-admin account is ready. Opening the dashboard…
            </p>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800" role="alert">
                <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Sign-in problem</p>
                  <p className="mt-0.5 leading-5 text-rose-700">{error}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  {passwordSet ? "Username or Email" : "Super-Admin Username"}
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={passwordSet ? "Enter legacy username or Supabase email" : "e.g. owner"}
                  autoComplete="username"
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-base text-slate-800 outline-hidden focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete={passwordSet ? "current-password" : "new-password"}
                    className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-3.5 pr-12 font-mono text-base text-slate-800 outline-hidden focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-slate-400 transition-colors hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!passwordSet && (
                  <p className="mt-1.5 text-sm leading-5 text-slate-500">
                    Use at least 4 characters. This account controls workspace configuration and publishing.
                  </p>
                )}
              </div>

              {!passwordSet && (
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Confirm Password
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
                    {passwordSet ? "Signing in…" : "Creating account…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-sky-400" />
                    {passwordSet ? "Sign in" : "Create owner account"}
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer info */}
        <div className="border-t border-slate-100 pt-5 text-center text-sm leading-6 text-slate-500">
          Supabase Auth sessions are validated server-side against the profiles RBAC table; legacy usernames remain available during migration.
        </div>
      </div>
    </div>
  );
}
