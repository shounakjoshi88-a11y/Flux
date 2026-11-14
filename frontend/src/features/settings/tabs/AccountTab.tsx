/**
 * AccountTab — the Account settings panel.
 *
 * Extracted from `features/settings/Settings.tsx`: log out of all devices,
 * account deletion, the organization id and the active-sessions table with
 * per-session revoke menus.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, LogOut, MoreVertical } from "lucide-react";
/**
 * Props for AccountTab, threaded from the settings modal in
 * `features/settings/Settings.tsx`, which owns the state.
 */
export interface AccountTabProps {
  user: any;
  handleLogoutAllDevices: () => void | Promise<void>;
  loggingOutAllDevices: boolean;
  handleDeleteAccount: () => void | Promise<void>;
  deletingAccount: boolean;
  loadingSessions: boolean;
  sessions: any[];
  openMenuSessionId: string | null;
  setOpenMenuSessionId: (v: string | null) => void;
  handleRevokeSession: (sessionId: string) => void | Promise<void>;
  revokingSessionId: string | null;
}


export function AccountTab({
  user,
  handleLogoutAllDevices,
  loggingOutAllDevices,
  handleDeleteAccount,
  deletingAccount,
  loadingSessions,
  sessions,
  openMenuSessionId,
  setOpenMenuSessionId,
  handleRevokeSession,
  revokingSessionId,
}: AccountTabProps) {
  return (
      <div className="space-y-8 max-w-2xl mx-auto">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Account</h3>
        <div className="space-y-5">
          <div className="flex items-center justify-between py-1"><span className="text-sm font-medium text-[var(--text-primary)]">Log out of all devices</span><button onClick={handleLogoutAllDevices} disabled={loggingOutAllDevices} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--surface-border)]/50 text-[var(--text-primary)] text-sm font-medium transition-all duration-200 disabled:opacity-50">{loggingOutAllDevices ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}Log out</button></div>
          <div className="flex items-center justify-between py-1"><span className="text-sm font-medium text-[var(--text-primary)]">Delete your account</span><button onClick={handleDeleteAccount} disabled={deletingAccount} className="px-4 py-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--surface-border)] text-[var(--text-primary)] text-sm font-medium transition-all duration-200 disabled:opacity-50 border border-[var(--surface-border)]">{deletingAccount ? <Loader2 className="size-4 animate-spin" /> : "Delete account"}</button></div>
          <div className="flex items-center justify-between py-1"><span className="text-sm font-medium text-[var(--text-primary)]">Organization ID</span><div className="px-4 py-2 rounded-lg bg-[var(--bg-secondary)] text-xs font-mono text-[var(--text-primary)]/50">{user?.id || "Not available"}</div></div>
        </div>
        <div className="pt-6">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Active sessions</h4>
          {loadingSessions ? (<div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-[var(--text-primary)]/40" /></div>) : sessions.length === 0 ? (<p className="text-sm text-[var(--text-primary)]/50">No active sessions found.</p>) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--surface-border)] shadow-sm">
              <table className="w-full text-sm"><thead><tr className="text-left text-[var(--text-primary)]/50 bg-[var(--bg-secondary)]"><th className="px-5 py-3 font-medium">Device</th><th className="px-5 py-3 font-medium">Created</th><th className="px-5 py-3 font-medium">Updated</th><th className="px-5 py-3 w-10"></th></tr></thead>
                <tbody className="divide-y divide-[var(--surface-border)]">
                  {sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-[var(--bg-secondary)] transition-colors duration-150">
                      <td className="px-5 py-3"><div className="flex items-center gap-2"><span className="font-medium text-[var(--text-primary)]">{session.device}</span>{session.isCurrent && (<span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-medium">Current</span>)}</div></td>
                      <td className="px-5 py-3 text-[var(--text-primary)]/50">{new Date(session.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3 text-[var(--text-primary)]/50">{new Date(session.updated_at).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right relative">
                        {!session.isCurrent && (
                          <div className="relative inline-block">
                            <button onClick={() => setOpenMenuSessionId(openMenuSessionId === session.id ? null : session.id)} className="p-1.5 hover:bg-[var(--surface-border)]/50 rounded-lg transition-all duration-200 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]"><MoreVertical className="size-4" /></button>
                            <AnimatePresence>
                              {openMenuSessionId === session.id && (
                                <motion.div initial={{ opacity: 0, scale: 0.95, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 4 }} className="absolute right-0 bottom-full mb-1 w-36 rounded-lg bg-[var(--bg-secondary)] border-[var(--surface-border)] shadow-xl z-10 overflow-hidden">
                                  <button onClick={() => handleRevokeSession(session.id)} disabled={revokingSessionId === session.id} className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition flex items-center gap-2">{revokingSessionId === session.id ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}Sign out</button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
  );
}
