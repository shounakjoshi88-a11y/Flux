/**
 * IntegrationsTab — the Integrations settings panel.
 *
 * Extracted from `features/settings/Settings.tsx`: the Google connected
 * service card with its connect / disconnect flow.
 */
import { Loader2 } from "lucide-react";
/**
 * Props for IntegrationsTab, threaded from the settings modal in
 * `features/settings/Settings.tsx`, which owns the state.
 */
export interface IntegrationsTabProps {
  googleConnected: boolean;
  googleEmail: string;
  googleConnecting: boolean;
  handleGoogleConnect: () => void | Promise<void>;
  handleGoogleDisconnect: () => void | Promise<void>;
}


export function IntegrationsTab({
  googleConnected,
  googleEmail,
  googleConnecting,
  handleGoogleConnect,
  handleGoogleDisconnect,
}: IntegrationsTabProps) {
  return (
      <div className="space-y-8 max-w-2xl mx-auto">
        <h3 className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[var(--text-primary)]/40 mb-5">Connected Services</h3>

        {/* Google Card */}
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--surface-border)] shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-lg bg-gradient-to-br from-[var(--accent)] to-green-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">G</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Google</p>
                <p className="text-xs text-[var(--text-primary)]/50">
                  {googleConnected ? `Connected as ${googleEmail}` : "Gmail, Calendar & Drive"}
                </p>
              </div>
            </div>
            <button
              onClick={googleConnected ? handleGoogleDisconnect : handleGoogleConnect}
              disabled={googleConnecting}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${googleConnected ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30" : "bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"}`}
            >
              {googleConnecting ? <Loader2 className="size-4 animate-spin" /> : null}
              {googleConnected ? "Disconnect" : googleConnecting ? "Connecting..." : "Connect"}
            </button>
          </div>
          {googleConnected && (
            <p className="text-xs text-[var(--text-primary)]/40 mt-4 border-t border-[var(--surface-border)] pt-4">
              Connected scopes: Gmail (read & send), Calendar, Drive (read-only)
            </p>
          )}
        </div>
      </div>
  );
}
