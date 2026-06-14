// Team Panel — real-time multi-agent orchestration via NVIDIA NIM
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserCheck, UserCog, Play, Square, ListChecks,
  ChevronDown, Network, LoaderCircle, CheckCircle2, XCircle, Bot,
} from "lucide-react";

type TeamMemberStatus = "idle" | "working" | "waiting" | "completed" | "error";

interface TeamMember {
  name: string;
  role: "leader" | "teammate";
  status: TeamMemberStatus;
  task?: string;
  resultPreview?: string;
}

interface TaskItem {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  assignedTo: string;
  resultPreview?: string;
}

type TeamPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  onStartTeam: (query: string) => void;
  members?: TeamMember[];
  tasks?: TaskItem[];
  isRunning?: boolean;
  streamedText?: string;
  onWsEvent?: (callback: (event: any) => void) => () => void;
};

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  idle: { color: "bg-zinc-600", icon: null, label: "Idle" },
  working: { color: "bg-blue-500 animate-pulse", icon: LoaderCircle, label: "Working" },
  waiting: { color: "bg-yellow-500", icon: null, label: "Waiting" },
  completed: { color: "bg-emerald-500", icon: CheckCircle2, label: "Done" },
  error: { color: "bg-red-500", icon: XCircle, label: "Error" },
};

function TeamMemberCard({ member }: { member: TeamMember }) {
  const cfg = STATUS_CONFIG[member.status]!;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/30 border border-zinc-700/30">
      <div className="relative">
        <div className={`size-8 rounded-full flex items-center justify-center ${
          member.role === "leader" ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"
        }`}>
          {member.role === "leader" ? <UserCog className="size-4" /> : <UserCheck className="size-4" />}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-zinc-900 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-200">{member.name}</span>
          <span className={`text-[10px] ${member.status === "working" ? "text-blue-400" : "text-zinc-500"}`}>
            {cfg.label}
          </span>
        </div>
        <div className="text-[10px] text-zinc-500 capitalize">{member.role}</div>
        {member.resultPreview && (
          <div className="text-[10px] text-zinc-600 mt-1 truncate">{member.resultPreview}</div>
        )}
      </div>
      {member.status === "working" && (
        <LoaderCircle className="size-3 text-blue-400 animate-spin shrink-0" />
      )}
    </div>
  );
}

function TaskItemView({ task }: { task: TaskItem }) {
  const isComplete = task.status === "completed";
  const isInProgress = task.status === "in_progress";
  const isFailed = task.status === "failed";

  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="mt-0.5 shrink-0">
        {isInProgress ? (
          <LoaderCircle className="size-3 text-blue-400 animate-spin" />
        ) : isComplete ? (
          <CheckCircle2 className="size-3 text-emerald-500" />
        ) : isFailed ? (
          <XCircle className="size-3 text-red-500" />
        ) : (
          <div className="size-3 rounded-full border-2 border-zinc-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`${isComplete ? "text-zinc-400" : "text-zinc-300"} truncate`}>{task.description}</div>
        {task.resultPreview && (
          <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{task.resultPreview}</div>
        )}
      </div>
    </div>
  );
}

const EMPTY_MEMBERS: TeamMember[] = [];
const EMPTY_TASKS: TaskItem[] = [];

export default function TeamPanel({
  isOpen, onClose, onStartTeam, members = EMPTY_MEMBERS,
  tasks = EMPTY_TASKS, isRunning = false, streamedText = "", onWsEvent,
}: TeamPanelProps) {
  const [query, setQuery] = useState("");
  const [localMembers, setLocalMembers] = useState<TeamMember[]>(members);
  const [localTasks, setLocalTasks] = useState<TaskItem[]>(tasks);
  const [localStreamedText, setLocalStreamedText] = useState(streamedText);
  const streamedTextRef = useRef(streamedText);

  // Sync props → state
  useEffect(() => { setLocalMembers(members); }, [members]);
  useEffect(() => { setLocalTasks(tasks); }, [tasks]);
  useEffect(() => {
    if (streamedText) {
      streamedTextRef.current = streamedText;
      setLocalStreamedText(streamedText);
    }
  }, [streamedText]);

  // Subscribe to WS events for real-time updates
  useEffect(() => {
    if (!onWsEvent) return;
    const unsub = onWsEvent((event: any) => {
      const { type, payload } = event;

      if (type === "agent_status") {
        // Update team member status
        if (payload.teammate) {
          setLocalMembers((prev) =>
            prev.map((m) =>
              m.name === payload.teammate
                ? { ...m, status: mapStatus(payload.status), resultPreview: payload.result || m.resultPreview }
                : m
            )
          );
        }
        if (payload.status === "synthesizing") {
          setLocalMembers((prev) =>
            prev.map((m) =>
              m.role === "leader" ? { ...m, status: "working" } : m
            )
          );
        }
        if (payload.status === "team_run_completed") {
          setLocalMembers((prev) =>
            prev.map((m) => ({ ...m, status: "completed" }))
          );
        }
      }

      if (type === "task_changed" && payload.taskId) {
        setLocalTasks((prev) =>
          prev.map((t) =>
            t.id === payload.taskId
              ? { ...t, status: payload.status, resultPreview: payload.result || t.resultPreview }
              : t
          )
        );
      }

      if (type === "text") {
        streamedTextRef.current += payload.text || "";
        setLocalStreamedText(streamedTextRef.current);
      }
    });
    return unsub;
  }, [onWsEvent]);

  const completedTasks = localTasks.filter((t) => t.status === "completed").length;
  const failedTasks = localTasks.filter((t) => t.status === "failed").length;

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
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Network className="size-4 text-indigo-400" />
              <span className="text-sm font-medium">Team Mode</span>
              {isRunning && (
                <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                  <LoaderCircle className="size-2.5 animate-spin" />
                  Running
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 transition-colors">
              <ChevronDown className="size-4 text-zinc-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Members */}
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium mb-2">
                <Users className="size-3" />
                Team Members ({localMembers.length})
              </div>
              <div className="space-y-2">
                {localMembers.length === 0 ? (
                  <p className="text-xs text-zinc-600 text-center py-4">
                    No team members yet. Start a team task to add members.
                  </p>
                ) : (
                  localMembers.map((m, i) => <TeamMemberCard key={i} member={m} />)
                )}
              </div>
            </div>

            {/* Task Board */}
            {localTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium mb-2">
                  <ListChecks className="size-3" />
                  Task Board ({completedTasks}/{localTasks.length}
                  {failedTasks > 0 && `, ${failedTasks} failed`})
                </div>
                <div className="space-y-2 bg-zinc-800/20 rounded-lg p-3">
                  {localTasks.map((task) => (
                    <TaskItemView key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}

            {/* Streaming results */}
            {localStreamedText && (
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium mb-2">
                  <Bot className="size-3" />
                  Results
                </div>
                <div className="bg-zinc-800/20 rounded-lg p-3">
                  <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-y-auto">
                    {localStreamedText}
                  </pre>
                </div>
              </div>
            )}

            {/* Team Input */}
            <div className="pt-2">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Describe a multi-step task for the team (e.g., 'research quantum computing and create a presentation')..."
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:border-indigo-500/50"
                rows={3}
              />
              <button
                onClick={() => {
                  if (query.trim()) {
                    setLocalStreamedText("");
                    streamedTextRef.current = "";
                    onStartTeam(query.trim());
                  }
                }}
                disabled={!query.trim() || isRunning}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isRunning ? (
                  <div className="size-3 border-2 border-indigo-400/20 border-t-indigo-400 rounded-full animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {isRunning ? "Team Running..." : "Start Team Task"}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function mapStatus(wsStatus: string): TeamMemberStatus {
  switch (wsStatus) {
    case "child_turn_started":
    case "teammate_working":
    case "synthesizing":
      return "working";
    case "child_turn_completed":
    case "teammate_completed":
      return "completed";
    case "child_turn_failed":
      return "error";
    default:
      return "idle";
  }
}
