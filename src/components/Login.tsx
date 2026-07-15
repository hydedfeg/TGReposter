import React, { useState } from "react";
import { Lock, Key, ShieldAlert, Sparkles, RefreshCw, Eye, EyeOff, CheckCircle2 } from "lucide-react";

interface LoginProps {
  passwordSet: boolean;
  onSuccess: (token: string, isNewSetup: boolean) => void;
}

export default function Login({ passwordSet, onSuccess }: LoginProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Password cannot be empty.");
      return;
    }

    if (!passwordSet) {
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
        body: JSON.stringify({ password: password.trim() })
      });

      const data = await res.json();

      if (res.ok && data.token) {
        if (!passwordSet) {
          setSetupSuccess(true);
          setTimeout(() => {
            onSuccess(data.token, true);
          }, 1500);
        } else {
          onSuccess(data.token, false);
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
    <div className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white border border-slate-200 shadow-2xl rounded-2xl p-8 sm:p-10 transition-all">
        
        {/* Branding/Header */}
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            {passwordSet ? (
              <Lock className="h-6 w-6" />
            ) : (
              <Key className="h-6 w-6 animate-bounce" />
            )}
          </div>
          <h2 className="mt-6 text-2xl font-display font-bold tracking-tight text-slate-900">
            {passwordSet ? "Secure Curator Access" : "Configure Access Password"}
          </h2>
          <p className="mt-2 text-xs font-sans text-slate-500 leading-relaxed max-w-xs mx-auto">
            {passwordSet 
              ? "Enter your password to unlock the curation feed, sources scraper, and publishing panel."
              : "This application is currently unlocked. Set a secure master password to safeguard your configurations."}
          </p>
        </div>

        {setupSuccess ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto animate-pulse" />
            <h3 className="font-semibold text-emerald-950 text-sm">Security Initialized</h3>
            <p className="text-emerald-700 text-xs font-sans leading-relaxed">
              Your master password was configured successfully! Directing to workspace dashboard...
            </p>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-lg p-3.5 flex gap-2.5 items-start">
                <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Authentication Notice</p>
                  <p className="text-[11px] text-rose-600 mt-0.5 leading-normal">{error}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  {passwordSet ? "Curator Password" : "New Master Password"}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-3.5 pr-10 py-3 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-xs bg-slate-50/50 outline-hidden font-mono text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!passwordSet && (
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-normal">
                    Must be at least 4 characters. Keep it secure; this gates all API credentials and publishing triggers.
                  </p>
                )}
              </div>

              {!passwordSet && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Confirm Master Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3.5 py-3 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-xs bg-slate-50/50 outline-hidden font-mono text-slate-800"
                  />
                </div>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 border border-transparent rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {passwordSet ? "Verifying..." : "Initializing Security..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-sky-400" />
                    {passwordSet ? "Unlock Curator Workspace" : "Establish Master Access"}
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer info */}
        <div className="text-center border-t border-slate-100 pt-5 text-[10px] text-slate-400 leading-relaxed font-sans">
          Curator Gatekeeper utilizes secure cryptographic hashing to check master tokens locally without leaking credentials.
        </div>
      </div>
    </div>
  );
}
