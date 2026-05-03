import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";

type PeekPanelProps = {
  url: string | null;
  onClose: () => void;
};

export function PeekPanel({ url, onClose }: PeekPanelProps) {
  const [iframeError, setIframeError] = useState(false);

  // Reset error state whenever a new URL opens
  useEffect(() => {
    if (url) {
      setIframeError(false);
    }
  }, [url]);

  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed top-0 right-0 h-full w-full sm:w-[460px] bg-white dark:bg-[#0a0a0a] border-l border-black/5 dark:border-white/10 z-50 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
            <span className="text-sm font-medium truncate">{url}</span>
            <div className="flex items-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
                title="Open in new tab"
              >
                <ExternalLink className="size-4" />
              </a>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Content: iframe or fallback */}
          <div className="flex-1 relative">
            {!iframeError ? (
              <iframe
                src={url}
                className="w-full h-full border-none"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                title="Source preview"
                onError={() => setIframeError(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                <AlertTriangle className="size-10 text-yellow-500" />
                <p className="text-sm text-muted-foreground">
                  This site can't be previewed here.
                </p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-[#40E0FF] hover:underline inline-flex items-center gap-1"
                >
                  Open in new tab
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}