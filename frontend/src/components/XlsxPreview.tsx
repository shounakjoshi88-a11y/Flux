// src/components/XlsxPreview.tsx
import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Download, Search, Table as TableIcon, Loader2, X } from "lucide-react";
import * as XLSX from "xlsx";

interface XlsxPreviewProps {
  base64: string;
  filename: string;
  onClose: () => void;
  onDownload: () => void;
}

export function XlsxPreview({ base64, filename, onClose, onDownload }: XlsxPreviewProps) {
  const [data, setData] = useState<any[][]>([]);
  const [sheets, setSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    try {
      const binary = atob(base64);
      const workbook = XLSX.read(binary, { type: "binary" });
      const sheetNames = workbook.SheetNames;
      if (!sheetNames || sheetNames.length === 0) throw new Error("No sheets found");
      setSheets(sheetNames);
      
      const firstName = sheetNames[0];
      if (!firstName) throw new Error("No sheet name found");
      const firstSheet = workbook.Sheets[firstName];
      if (!firstSheet) throw new Error("Empty sheet");
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
      setData(rows);
    } catch (err) {
      console.error("XLSX parse error:", err);
    } finally {
      setLoading(false);
    }
  }, [base64]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(row => 
      row.some(cell => String(cell).toLowerCase().includes(q))
    );
  }, [data, search]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="size-8 animate-spin text-emerald-500/20" />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#0d0d0d] h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <TableIcon className="size-4 text-emerald-500" />
          </div>
          <div className="truncate">
            <p className="text-sm font-medium text-foreground truncate">{filename}</p>
            <p className="text-[10px] text-muted-foreground">{data.length} rows detected</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-lg px-2.5 py-1.5 focus-within:border-emerald-500/30 transition-all">
            <Search className="size-3 text-muted-foreground mr-2" />
            <input 
              type="text" 
              placeholder="Search rows..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none text-xs text-foreground placeholder:text-muted-foreground/40 w-32"
            />
          </div>
          <button onClick={onDownload} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all">
            <Download className="size-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto bg-[#fcfcfc] dark:bg-[#0a0a0a]" style={{ scrollbarWidth: "none" }}>
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[#f4f4f4] dark:bg-[#161616] border-b border-black/10 dark:border-white/10">
            <tr>
              <th className="px-3 py-2 text-left text-muted-foreground font-medium border-r border-black/5 dark:border-white/5 w-10">#</th>
              {data[0]?.map((col, i) => (
                <th key={i} className="px-4 py-2 text-left text-foreground font-semibold border-r border-black/5 dark:border-white/5 min-w-[120px]">
                  {String(col || `Col ${i + 1}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.slice(1).map((row, ri) => (
              <tr key={ri} className="border-b border-black/[0.03] dark:border-white/[0.03] hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
                <td className="px-3 py-2 text-muted-foreground text-center border-r border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01]">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2 text-foreground/80 border-r border-black/5 dark:border-white/5 whitespace-nowrap truncate max-w-[300px]">
                    {String(cell ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredData.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center opacity-20">
            <Search className="size-12 mb-4" />
            <p className="text-sm font-bold uppercase tracking-widest">No matching rows</p>
          </div>
        )}
      </div>

      {/* Sheet Tabs if multiple */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-2 bg-[#f4f4f4] dark:bg-[#161616] border-t border-black/10 dark:border-white/10 overflow-x-auto shrink-0">
          {sheets.map((name, i) => (
            <button
              key={name}
              onClick={() => setActiveSheet(i)}
              className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
                activeSheet === i ? "bg-emerald-500 text-white" : "bg-black/5 dark:bg-white/5 text-muted-foreground hover:bg-black/10"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
