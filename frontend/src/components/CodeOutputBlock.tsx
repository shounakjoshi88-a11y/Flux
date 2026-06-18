import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CodeOutputLine } from "../types";

interface CodeOutputBlockProps {
  language?: string;
  code?: string;
  outputLines: CodeOutputLine[];
  exitCode?: number;
  duration?: number;
  isRunning: boolean;
  generatedFiles?: Array<{ filename: string; downloadUrl: string }>;
}

export function CodeOutputBlock({
  language = "python",
  code,
  outputLines,
  exitCode,
  duration,
  isRunning,
  generatedFiles = [],
}: CodeOutputBlockProps) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div style={{
      borderRadius: "8px",
      border: "1px solid var(--border-color)",
      overflow: "hidden",
      marginTop: "8px",
      marginBottom: "8px",
      fontFamily: "JetBrains Mono, monospace",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", background: "#1e1e1e",
        borderBottom: "1px solid #333",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f56" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#27c93f" }} />
          <span style={{ fontSize: "11px", color: "#888", marginLeft: "4px" }}>{language} interpreter</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isRunning && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#888" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#27c93f", animation: "pulse 1.5s infinite" }} />
              Running...
            </div>
          )}
          {exitCode !== undefined && (
            <span style={{ fontSize: "11px", color: exitCode === 0 ? "#27c93f" : "#ff5f56" }}>
              {exitCode === 0 ? "✓" : "✗"} Exit {exitCode}{duration ? ` · ${(duration / 1000).toFixed(1)}s` : ""}
            </span>
          )}
          {code && (
            <button onClick={() => setShowCode(!showCode)} style={{
              background: "none", border: "1px solid #444", color: "#888",
              fontSize: "10px", padding: "2px 6px", borderRadius: "4px", cursor: "pointer",
            }}>
              {showCode ? "hide code" : "show code"}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCode && code && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ background: "#2d2d2d", padding: "12px", borderBottom: "1px solid #333", overflow: "hidden" }}
          >
            <pre style={{ margin: 0, fontSize: "12px", color: "#ccc", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{code}</pre>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{
        background: "#0d1117", padding: "12px", maxHeight: "400px",
        overflowY: "auto", minHeight: outputLines.length === 0 && isRunning ? "60px" : "auto",
      }}>
        {outputLines.length === 0 && isRunning && (
          <span style={{ color: "#888", fontSize: "12px" }}>▶ Executing...</span>
        )}
        {outputLines.map((line, i) => (
          <div key={i} style={{
            fontSize: "12px", lineHeight: "1.6",
            color: line.type === "stderr" ? "#ff7b72" : "#e6edf3",
            fontFamily: "JetBrains Mono, monospace",
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {line.type === "stderr" && <span style={{ color: "#ff7b72", opacity: 0.7 }}>ERR </span>}
            {line.content}
          </div>
        ))}
        {isRunning && (
          <span style={{
            display: "inline-block", width: "8px", height: "14px",
            background: "#e6edf3", animation: "blink 1s step-end infinite",
            marginLeft: "2px", verticalAlign: "text-bottom",
          }} />
        )}
      </div>

      {generatedFiles.length > 0 && (
        <div style={{
          background: "#161b22", padding: "8px 12px",
          borderTop: "1px solid #333", display: "flex", flexWrap: "wrap", gap: "8px",
        }}>
          {generatedFiles.map((file, i) => (
            <a key={i} href={file.downloadUrl} download={file.filename} style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "4px 10px", background: "#21262d",
              border: "1px solid #30363d", borderRadius: "6px",
              color: "#58a6ff", fontSize: "12px", textDecoration: "none",
            }}>
              📎 {file.filename}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
