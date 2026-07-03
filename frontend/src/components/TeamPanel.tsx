// Team Panel — real-time multi-agent orchestration via NVIDIA NIM
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  UserCheck,
  UserCog,
  Play,
  Square,
  ListChecks,
  ChevronDown,
  Network,
  LoaderCircle,
  CheckCircle2,
  XCircle,
  Bot,
  Sparkles,
  ArrowRight,
  Clock,
  AlertCircle,
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

const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; label: string; icon: any }
> = {
  idle: {
    color: "text-zinc-400",
    bg: "bg-zinc-500/20",
    label: "Idle",
    icon: Clock,
  },
  working: {
    color: "text-blue-400",
    bg: "bg-blue-500/15",
    label: "Working",
    icon: LoaderCircle,
  },
  waiting: {
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    label: "Waiting",
    icon: Clock,
  },
  completed: {
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    label: "Done",
    icon: CheckCircle2,
  },
  error: {
    color: "text-rose-400",
    bg: "bg-rose-500/15",
    label: "Error",
    icon: XCircle,
  },
};

function TeamMemberCard({ member }: { member: TeamMember }) {
  const cfg = STATUS_CONFIG[member.status]!;
  const StatusIcon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative flex items-center gap-3 rounded-xl border border-zinc-700/40 bg-zinc-800/40 p-3 transition-all duration-200 hover:border-zinc-600/60 hover:bg-zinc-800/60"
    >
      {/* Status glow */}
      <div
        className={`absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${cfg.bg}`}
      />

      <div className="relative shrink-0">
        <div
          className={`flex size-9 items-center justify-center rounded-full border border-zinc-700/50 ${
            member.role === "leader"
              ? "bg-gradient-to-br from-amber-500/20 to-amber-600/10 text-amber-400"
              : "bg-gradient-to-br from-slate-500/20 to-slate-600/10 text-slate-300"
          }`}
        >
          {member.role === "leader" ? (
            <UserCog className="size-4" />
          ) : (
            <UserCheck className="size-4" />
          )}
        </div>
        {/* Status dot */}
        <div
          className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-zinc-800 ${
            member.status === "working"
              ? "bg-blue-500 shadow-lg shadow-blue-500/50"
              : member.status === "completed"
              ? "bg-emerald-500 shadow-lg shadow-emerald-500/50"
              : member.status === "error"
              ? "bg-rose-500 shadow-lg shadow-rose-500/50"
              : member.status === "waiting"
              ? "bg-amber-500 shadow-lg shadow-amber-500/50"
              : "bg-zinc-500"
          }`}
        />
      </div>

      <div className="relative flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-zinc-200">
            {member.name}
          </span>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color}`}
          >
            {member.status === "working" && (
              <LoaderCircle className="size-3 animate-spin" />
            )}
            {member.status === "completed" && (
              <CheckCircle2 className="size-3" />
            )}
            {member.status === "error" && <XCircle className="size-3" />}
            {cfg.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 capitalize">
            {member.role}
          </span>
          {member.task && (
            <>
              <span className="text-zinc-600">•</span>
              <span className="text-[11px] text-zinc-500 truncate">
                {member.task}
              </span>
            </>
          )}
        </div>
        {member.resultPreview && (
          <div className="mt-1.5 text-[11px] text-zinc-500 line-clamp-2">
            {member.resultPreview}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TaskItemView({ task }: { task: TaskItem }) {
  const isComplete = task.status === "completed";
  const isInProgress = task.status === "in_progress";
  const isFailed = task.status === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="group flex items-start gap-3 rounded-lg border border-zinc-700/30 bg-zinc-800/20 p-3 transition-all duration-200 hover:border-zinc-600/40 hover:bg-zinc-800/30"
    >
      <div className="mt-0.5 shrink-0">
        {isInProgress ? (
          <div className="relative">
            <LoaderCircle className="size-4 text-blue-400 animate-spin" />
            <div className="absolute inset-0 blur-sm">
              <LoaderCircle className="size-4 text-blue-400/50 animate-spin" />
            </div>
          </div>
        ) : isComplete ? (
          <div className="rounded-full bg-emerald-500/20 p-1">
            <CheckCircle2 className="size-3.5 text-emerald-400" />
          </div>
        ) : isFailed ? (
          <div className="rounded-full bg-rose-500/20 p-1">
            <XCircle className="size-3.5 text-rose-400" />
          </div>
        ) : (
          <div className="size-4 rounded-full border-2 border-zinc-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm ${
            isComplete
              ? "text-zinc-400 line-through"
              : isFailed
              ? "text-rose-300"
              : "text-zinc-200"
          }`}
        >
          {task.description}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">
            {task.assignedTo}
          </span>
          {isInProgress && (
            <span className="text-[10px] text-blue-400">In progress</span>
          )}
        </div>
        {task.resultPreview && (
          <div className="mt-2 rounded-md border border-zinc-700/30 bg-zinc-900/50 p-2 text-[11px] text-zinc-400 line-clamp-3">
            {task.resultPreview}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const EMPTY_MEMBERS: TeamMember[] = [];
const EMPTY_TASKS: TaskItem[] = [];

export default function TeamPanel({
  isOpen,
  onClose,
  onStartTeam,
  members = EMPTY_MEMBERS,
  tasks = EMPTY_TASKS,
  isRunning = false,
  streamedText = "",
  onWsEvent,
}: TeamPanelProps) {
  const [query, setQuery] = useState("");
  const [localMembers, setLocalMembers] = useState<TeamMember[]>(members);
  const [localTasks, setLocalTasks] = useState<TaskItem[]>(tasks);
  const [localStreamedText, setLocalStreamedText] = useState(streamedText);
  const streamedTextRef = useRef(streamedText);

  // Sync props → state
  useEffect(() => {
    setLocalMembers(members);
  }, [members]);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

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
                ? {
                    ...m,
                    status: mapStatus(payload.status),
                    resultPreview: payload.result || m.resultPreview,
                  }
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
              ? {
                  ...t,
                  status: payload.status,
                  resultPreview: payload.result || t.resultPreview,
                }
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
  const progress =
    localTasks.length > 0
      ? Math.round((completedTasks / localTasks.length) * 100)
      : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%", opacity: 0.8 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0.8 }}
           transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.7 }}
          className="fixed top-0 right-0 h-full w-full sm:w-[440px] glass-panel-strong z-50 shadow-2xl shadow-black/40 flex flex-col will-change-transform"
        >
          {/* Header */}
          <div className="relative flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
            {/* Gradient accent line */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border border-indigo-500/20">
                  <Network className="size-4 text-indigo-400" />
                </div>
                {isRunning && (
                  <div className="absolute -top-1 -right-1 size-2 rounded-full bg-blue-500 animate-pulse shadow-lg shadow-blue-500/50" />
                )}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
                  Team Mode
                </h2>
                <p className="text-[11px] text-zinc-500">
                  Multi-agent orchestration
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isRunning && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5 text-[10px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full"
                >
                  <LoaderCircle className="size-3 animate-spin" />
                  Running
                </motion.span>
              )}
              <button
                onClick={onClose}
                className="group flex size-8 items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-800/40 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800"
              >
                <ChevronDown className="size-4 text-zinc-400 transition-transform duration-200 group-hover:rotate-180" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Members Section */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="size-3.5 text-zinc-500" />
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Team Members
                  </h3>
                </div>
                <span className="text-[11px] text-zinc-500 font-medium">
                  {localMembers.length} active
                </span>
              </div>
              <div className="space-y-2">
                {localMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-zinc-800/50 border border-zinc-700/30 mb-3">
                      <Users className="size-5 text-zinc-600" />
                    </div>
                    <p className="text-xs text-zinc-500 max-w-[200px]">
                      No team members yet. Start a team task to add members.
                    </p>
                  </div>
                ) : (
                  localMembers.map((m, i) => <TeamMemberCard key={i} member={m} />)
                )}
              </div>
            </section>

            {/* Task Board Section */}
            {localTasks.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ListChecks className="size-3.5 text-zinc-500" />
                    <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                      Task Board
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500 font-medium">
                      {completedTasks}/{localTasks.length}
                    </span>
                    {failedTasks > 0 && (
                      <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-full font-medium">
                        {failedTasks} failed
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/60">
                  <motion.div
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>

                <div className="space-y-2">
                  {localTasks.map((task) => (
                    <TaskItemView key={task.id} task={task} />
                  ))}
                </div>
              </section>
            )}

            {/* Streaming Results */}
            {localStreamedText && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex size-6 items-center justify-center rounded-md bg-indigo-500/10 border border-indigo-500/20">
                    <Bot className="size-3.5 text-indigo-400" />
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Results
                  </h3>
                </div>
                <div className="relative rounded-xl border border-zinc-700/40 bg-zinc-900/60 p-4">
                  {/* Subtle grid pattern */}
                  <div className="absolute inset-0 rounded-xl bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:16px_16px] opacity-50" />
                  <pre className="relative text-[12px] text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">
                    {localStreamedText}
                  </pre>
                </div>
              </section>
            )}

            {/* Team Input */}
            <section className="pt-2 pb-4">
              <div className="relative rounded-xl border border-zinc-700/40 bg-zinc-800/30 p-1 transition-all duration-200 focus-within:border-indigo-500/50 focus-within:bg-zinc-800/50 focus-within:shadow-lg focus-within:shadow-indigo-500/5">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Describe a multi-step task for the team..."
                  className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none"
                  rows={3}
                />
                <div className="flex items-center justify-between px-3 pb-2">
                  <span className="text-[10px] text-zinc-600">
                    Press Enter to send
                  </span>
                  <button
                    onClick={() => {
                      if (query.trim()) {
                        setLocalStreamedText("");
                        streamedTextRef.current = "";
                        onStartTeam(query.trim());
                      }
                    }}
                    disabled={!query.trim() || isRunning}
                    className="group flex items-center gap-2 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-500"
                  >
                    {isRunning ? (
                      <>
                        <LoaderCircle className="size-3 animate-spin" />
                        <span>Running...</span>
                      </>
                    ) : (
                      <>
                        <Play className="size-3 fill-current" />
                        <span>Start Team Task</span>
                        <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
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
