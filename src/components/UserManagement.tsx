import React, { useState } from "react";
import { Users, UserPlus, Trash2, ShieldCheck, UserCheck, Calendar, Lock, AlertCircle, Sparkles, Key } from "lucide-react";
import { CuratorUser } from "../types";

interface UserManagementProps {
  users: CuratorUser[];
  onAddUser: (username: string, password: string, role: "super-admin" | "admin") => Promise<boolean>;
  onDeleteUser: (username: string) => Promise<boolean>;
  currentUsername: string | null;
}

export default function UserManagement({ users, onAddUser, onDeleteUser, currentUsername }: UserManagementProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"super-admin" | "admin">("admin");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim() || username.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (!password || password.length < 4) {
      setError("Password must be at least 4 characters long.");
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await onAddUser(username.trim(), password, role);
      if (ok) {
        setSuccess(`User "${username.trim().toLowerCase()}" has been successfully added.`);
        setUsername("");
        setPassword("");
        setRole("admin");
      } else {
        setError("Failed to add user. Username might already exist.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (targetUsername: string) => {
    if (window.confirm(`Are you sure you want to permanently revoke access for user "${targetUsername}"?`)) {
      setError("");
      setSuccess("");
      try {
        const ok = await onDeleteUser(targetUsername);
        if (ok) {
          setSuccess(`User "${targetUsername}" revoked successfully.`);
        } else {
          setError("Failed to revoke access. Ensure you are not deleting the final remaining Super-Admin.");
        }
      } catch (err: any) {
        setError(err.message || "An error occurred during deletion.");
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Block */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <h2 className="font-display font-bold text-slate-900 text-lg">Team & Access Directory</h2>
            </div>
            <p className="text-slate-500 text-xs font-sans max-w-2xl leading-relaxed">
              Define the security structure for your Telegram curator system. You can establish high-privilege <b>Super-Admins</b> who manage APIs and scrapers, and <b>Admins</b> who focus purely on reviewing, editing, and publishing content.
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-indigo-950 font-sans text-xs self-start md:self-center flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Currently logged in as <b>{currentUsername}</b> (Super-Admin)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creation Form */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs h-fit">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-slate-800" />
            <h3 className="font-display font-bold text-slate-900 text-sm">Add Team Administrator</h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex gap-2 text-rose-800 text-[11px] leading-normal font-sans">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2 text-emerald-800 text-[11px] leading-normal font-sans">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. content_manager"
                className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-xs bg-slate-50/50 outline-hidden text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Temporary Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-xs bg-slate-50/50 outline-hidden text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Access Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "super-admin" | "admin")}
                className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-xs bg-slate-50/50 outline-hidden text-slate-800"
              >
                <option value="admin">Admin (Curation & Publishing Only)</option>
                <option value="super-admin">Super-Admin (Full System Controls)</option>
              </select>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Key className="w-3.5 h-3.5 text-sky-400" />
                {isSubmitting ? "Creating User..." : "Provision Access Account"}
              </button>
            </div>
          </form>
        </div>

        {/* User Accounts List */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-slate-900 text-sm">Active Administrator Accounts</h3>
            <span className="text-slate-400 text-xs font-sans">{users.length} configured</span>
          </div>

          <div className="divide-y divide-slate-100">
            {users.map((user) => {
              const isSelf = user.username === currentUsername;
              const isSuper = user.role === "super-admin";

              return (
                <div key={user.username} className="py-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-slate-900 text-sm">
                        {user.username}
                      </span>
                      {isSelf && (
                        <span className="bg-indigo-50 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          You
                        </span>
                      )}
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                        isSuper 
                          ? "bg-slate-100 text-slate-800 border border-slate-200" 
                          : "bg-sky-50 text-sky-700 border border-sky-100"
                      }`}>
                        {isSuper ? <ShieldCheck className="w-3 h-3 text-slate-600" /> : <UserCheck className="w-3 h-3 text-sky-600" />}
                        {isSuper ? "Super-Admin" : "Admin"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-[10px]">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Added on {new Date(user.createdAt || Date.now()).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}</span>
                    </div>
                  </div>

                  {!isSelf && (
                    <button
                      onClick={() => handleDelete(user.username)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Revoke access"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}

            {users.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <Users className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-slate-400 text-xs">No user accounts found. Database requires synchronizing.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
