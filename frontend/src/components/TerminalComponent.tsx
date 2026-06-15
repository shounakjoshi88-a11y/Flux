import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalComponentProps {
  content: string;
}

export const TerminalComponent: React.FC<TerminalComponentProps> = ({ content }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastContentLength = useRef(0);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
      },
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      rows: 15,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Write initial content
    if (content) {
        term.write(content);
        lastContentLength.current = content.length;
    }

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (xtermRef.current && content) {
        if (content.length > lastContentLength.current) {
            const newContent = content.slice(lastContentLength.current);
            xtermRef.current.write(newContent);
            lastContentLength.current = content.length;
        } else if (content.length < lastContentLength.current) {
            // Reset case
            xtermRef.current.clear();
            xtermRef.current.write(content);
            lastContentLength.current = content.length;
        }
    }
  }, [content]);

  return (
    <div className="w-full h-64 bg-[#1a1b26] p-2 rounded-lg overflow-hidden border border-slate-700/50 shadow-inner my-2 font-mono">
      <div className="flex items-center justify-between mb-1 px-1 text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-1">
        <span>Interactive Terminal</span>
        <div className="flex space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/50" />
            <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
            <div className="w-2 h-2 rounded-full bg-green-500/50" />
        </div>
      </div>
      <div ref={terminalRef} className="w-full h-[calc(100%-24px)]" />
    </div>
  );
};
