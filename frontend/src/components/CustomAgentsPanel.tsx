// Custom Agents Panel — inspired by AionUi's custom agent management
// Allows users to register custom agent backends
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Bot, Trash2, Terminal, ExternalLink } from "lucide-react";
import type { CustomAgent } from "@/hooks/useCustomAgents";

type CustomAgentsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  agents: CustomAgent[];
  onCreateAgent: (spec: { name: string; command: string; args?: string[]; env?: Array<{ name: string; value: string; }>; icon?: string; }) => Promise<CustomAgent>;
  onDeleteAgent: (id: string) => Promise<void>;
  onSelectAgent?: (agent: CustomAgent) => void;
};

export default function CustomAgentsPanel({
  isOpen, onClose, agents, onCreateAgent, onDeleteAgent, onSelectAgent,
}: CustomAgentsPanelProps) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !command.trim()) return;
    setIsCreating(true);
    try {
      await onCreateAgent({
        name: name.trim(),
        command: command.trim(),
        args: args ? args.split(" ").filter(Boolean) : [],
      });
      setName("");
      setCommand("");
      setArgs("");
      setShowForm(false);
    } catch (e: any) {
      console.error("Failed to create agent:", e);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-zinc-900 border-l border-zinc-800 z-50 shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-emerald-400" />
              <span className="text-sm font-medium">Custom Agents</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 transition-colors">
              <X className="size-4 text-zinc-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {agents.length === 0 && !showForm && (
              <p className="text-xs text-zinc-600 text-center py-8">
                No custom agents yet. Add one to use external backends.
              </p>
            )}

            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/30 border border-zinc-700/30 hover:bg-zinc-800/50 transition-colors group"
              >
                <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Terminal className="size-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-zinc-200 truncate">{agent.name}</div>
                  <div className="text-[10px] text-zinc-500 font-mono truncate">{agent.command}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onSelectAgent && (
                    <button
                      onClick={() => onSelectAgent(agent)}
                      className="p-1.5 rounded-lg hover:bg-zinc-700/50 transition-colors"
                      title="Use this agent"
                    >
                      <ExternalLink className="size-3 text-zinc-400" />
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteAgent(agent.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Delete agent"
                  >
                    <Trash2 className="size-3 text-zinc-500 hover:text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-800 p-4">
            {showForm ? (
              <div className="space-y-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Agent name"
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                />
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Command (e.g., npx tsx agent.ts)"
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                />
                <input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="Args (space-separated, optional)"
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={isCreating || !name.trim() || !command.trim()}
                    className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {isCreating ? "Creating..." : "Create Agent"}
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-400 text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-300 text-xs font-medium transition-colors"
              >
                <Plus className="size-3" />
                Add Custom Agent
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
