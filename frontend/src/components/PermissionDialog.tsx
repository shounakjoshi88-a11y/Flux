import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Check, X, AlertTriangle } from "lucide-react";
import { BACKEND_URL } from "@/lib/config";
import { createClient } from "@/lib/client";
import type { PermissionRequest } from "@/types";

const supabase = createClient();

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

type PermissionDialogProps = {
  request: PermissionRequest;
  onRespond: (id: string, approved: boolean) => void;
};

export default function PermissionDialog({ request, onRespond }: PermissionDialogProps) {
  const [responded, setResponded] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);

  const handleRespond = async (approved: boolean) => {
    setResponded(true);
    try {
      const token = await getAccessToken();
      await fetch(`${BACKEND_URL}/api/permissions/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: request.id, approved }),
      });
    } catch (e) {
      console.error("Failed to send permission response:", e);
    }
    onRespond(request.id, approved);
  };

  return (
    <AnimatePresence>
      {!responded && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-amber-500/10">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-300">Tool Permission Required</span>
            </div>
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 text-amber-400/70 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm text-zinc-200">{request.description}</div>
                {request.args && Object.keys(request.args).length > 0 && (
                  <div className="mt-2 p-2 rounded-lg bg-black/20">
                    <pre className="text-[11px] text-zinc-400 font-mono whitespace-pre-wrap">
                      {JSON.stringify(request.args, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberChoice}
                  onChange={(e) => setRememberChoice(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/30"
                />
                <span className="text-[11px] text-zinc-500">Remember for this session</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRespond(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-sm font-medium transition-colors"
              >
                <Check className="size-3.5" />
                Allow
              </button>
              <button
                onClick={() => handleRespond(false)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
              >
                <X className="size-3.5" />
                Deny
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
