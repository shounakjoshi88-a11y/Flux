/**
 * AddCustomConnectorDialog — Claude's "Add custom connector" dialog, 1:1.
 *
 * Name (shown in the connectors list) + MCP server URL, with the same helper
 * copy, disclaimer and Cancel/Continue affordances. Validates https and runs
 * a live initialize handshake server-side before saving.
 */
import { useEffect, useState } from "react";
import { IconClose } from "../layout/anthropicIcons";
import { Loader2 } from "lucide-react";
import { addCustomConnector } from "../../lib/connectors";

export function AddCustomConnectorDialog({
  isOpen,
  onClose,
  onAdded,
  onBrowsePrebuilt,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful add (parent should refresh its list). */
  onAdded?: () => void;
  /** Optional — "get started with pre-built ones" switches the parent to the Discover view. */
  onBrowsePrebuilt?: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setUrl("");
      setError(null);
      setBusy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    const n = name.trim();
    const u = url.trim();
    if (!n) { setError("Name is required — it's shown in the connectors list."); return; }
    if (!/^https:\/\//i.test(u)) { setError("MCP server URL must start with https://"); return; }
    setBusy(true);
    setError(null);
    const result = await addCustomConnector(n, u);
    setBusy(false);
    if (!result.ok) { setError(result.message ?? "Couldn't add connector."); return; }
    onAdded?.();
    onClose();
  };

  const inputClass =
    "h-10 w-full rounded-xl border border-white/[0.08] bg-[#262523] px-3.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[#2383e2]/60 focus:bg-[#292826]";
  const labelClass = "mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]";
  const helperClass = "mt-1.5 text-[11px] leading-4 text-[var(--text-muted)]";

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Add custom connector">
      {/* Backdrop */}
      <button className="absolute inset-0 bg-black/60 cursor-default" aria-label="Close" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-[520px] rounded-2xl border border-white/[0.06] bg-[#1f1e1c] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Add custom connector</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)] transition-colors"
          >
            <IconClose className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5">
          <p className="mb-4 text-[13px] leading-5 text-[var(--text-secondary)]">
            Connect Flux to your data and tools.{" "}
            <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer" className="text-[#6b8afd] hover:underline">
              Learn more about connectors
            </a>{" "}
            {onBrowsePrebuilt ? (
              <>
                or get started with{" "}
                <button onClick={() => { onBrowsePrebuilt(); onClose(); }} className="text-[#6b8afd] hover:underline">
                  pre-built ones
                </button>
                .
              </>
            ) : (
              <>.</>
            )}
          </p>

          <label className={labelClass} htmlFor="connector-name">Name</label>
          <input
            id="connector-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            placeholder="Name"
            maxLength={60}
            className={inputClass}
            spellCheck={false}
            autoCapitalize="off"
          />
          <p className={helperClass}>Shown in the connectors list.</p>

          <label className={`${labelClass} mt-4`} htmlFor="connector-url">MCP server URL</label>
          <input
            id="connector-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            placeholder="https://mcp.example.com/mcp"
            className={inputClass}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <p className={helperClass}>
            The HTTPS address where the server accepts MCP requests, for example https://mcp.example.com/mcp.
          </p>

          <p className="mt-4 text-[11px] leading-4 text-[var(--text-muted)]">
            Only use connectors from developers you trust. Flux does not control which tools developers make available and cannot verify that they will work as intended or that they won&apos;t change.
          </p>
          <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">
            Building an MCP server?{" "}
            <a href="https://modelcontextprotocol.io/docs/tools/architecture" target="_blank" rel="noopener noreferrer" className="text-[#6b8afd] hover:underline">
              Read the MCP docs
            </a>
          </p>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] leading-4 text-red-400">{error}</p>
          )}

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void submit()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2383e2] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#1f78d1] disabled:opacity-60"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
