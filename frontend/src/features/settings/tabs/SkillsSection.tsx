/**
 * SkillsSection — Settings → Capabilities → Skills.
 *
 * The real thing: merged catalog (built-in + custom), on/off toggles for
 * every skill, "View" to read any SKILL.md, delete for custom skills, and a
 * create form that writes straight to the Skill table — the same store the
 * agent reads from. A skill created here works on the very next message.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { IconFolder, IconArtifacts } from "../../layout/anthropicIcons";
import {
  fetchSkills,
  fetchSkillBody,
  toggleSkill,
  createSkill,
  deleteSkill,
  invalidateSkillsCache,
  type SkillMeta,
} from "../../../lib/skills";

export function SkillsSection() {
  const [skills, setSkills] = useState<SkillMeta[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [viewBody, setViewBody] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busyToggle, setBusyToggle] = useState<string | null>(null);

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = async () => {
    setSkills(await fetchSkills(true));
  };
  useEffect(() => { refresh(); }, []);

  const enabledCount = useMemo(() => (skills ?? []).filter((s) => s.enabled).length, [skills]);

  const onToggle = async (skill: SkillMeta) => {
    if (busyToggle) return;
    setBusyToggle(skill.name);
    const next = !skill.enabled;
    // Optimistic flip
    setSkills((prev) => prev?.map((s) => (s.name === skill.name ? { ...s, enabled: next } : s)) ?? prev);
    const ok = await toggleSkill(skill, next);
    if (!ok) {
      // Revert
      setSkills((prev) => prev?.map((s) => (s.name === skill.name ? { ...s, enabled: skill.enabled } : s)) ?? prev);
    }
    setBusyToggle(null);
  };

  const onView = async (skill: SkillMeta) => {
    if (viewing === skill.name) { setViewing(null); setViewBody(null); return; }
    setViewing(skill.name);
    setViewBody(null);
    setLoadingBody(true);
    const body = await fetchSkillBody(skill.name);
    setViewBody(body?.body ?? "Could not load this skill.");
    setLoadingBody(false);
  };

  const onDelete = async (skill: SkillMeta) => {
    setDeleting(skill.name);
    const ok = await deleteSkill(skill.name);
    if (ok) {
      setSkills((prev) => prev?.filter((s) => s.name !== skill.name) ?? prev);
      if (viewing === skill.name) { setViewing(null); setViewBody(null); }
    }
    setDeleting(null);
    setConfirmingDelete(null);
  };

  const onCreate = async () => {
    setCreating(true);
    setCreateError(null);
    const result = await createSkill({ name: name.trim().toLowerCase(), description: description.trim(), content });
    setCreating(false);
    if (!result.ok) { setCreateError(result.message ?? "Could not create skill."); return; }
    setName(""); setDescription(""); setContent(""); setCreateOpen(false);
    invalidateSkillsCache();
    await refresh();
  };

  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[var(--text-primary)]/40 mb-1">Skills</h3>
      <p className="text-xs text-[var(--text-primary)]/50 mb-5">
        Claude-style agent skills — markdown playbooks the model loads on demand when a task matches.
        {skills ? ` ${enabledCount} of ${skills.length} enabled.` : ""}
      </p>

      {/* List */}
      {skills === null ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-primary)]/50"><Loader2 className="size-3.5 animate-spin" /> Loading skills…</div>
      ) : skills.length === 0 ? (
        <p className="text-xs text-[var(--text-primary)]/50">No skills yet.</p>
      ) : (
        <div className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
          {skills.map((skill) => (
            <div key={skill.name} className="overflow-hidden">
              <div className="flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-white/[0.02]">
                {skill.source === "custom"
                  ? <IconArtifacts className="size-4 shrink-0 text-[var(--accent)]/80" />
                  : <IconFolder className="size-4 shrink-0 text-[var(--text-secondary)]" />}
                <button onClick={() => onView(skill)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{skill.name}
                    {skill.source === "custom" && <span className="ml-2 text-[10px] font-normal text-[var(--accent)]/70 align-middle">yours</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--text-primary)]/45">{skill.description}</span>
                </button>
                {skill.source === "custom" && (
                  confirmingDelete === skill.name ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => onDelete(skill)}
                        disabled={deleting === skill.name}
                        className="rounded-lg bg-red-500/15 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/25 transition-colors"
                      >{deleting === skill.name ? "Deleting…" : "Delete"}</button>
                      <button onClick={() => setConfirmingDelete(null)} className="rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]">Keep</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmingDelete(skill.name)} title="Delete skill" className="shrink-0 p-1.5 rounded-lg text-[var(--text-primary)]/35 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  )
                )}
                {/* Toggle */}
                <button
                  role="switch"
                  aria-checked={skill.enabled}
                  aria-label={skill.enabled ? `Disable ${skill.name}` : `Enable ${skill.name}`}
                  disabled={busyToggle === skill.name}
                  onClick={() => onToggle(skill)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${skill.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-border)]"}`}
                >
                  <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${skill.enabled ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
              {/* Inline SKILL.md viewer */}
              {viewing === skill.name && (
                <div className="border-t border-white/[0.05] bg-black/20 px-3 py-2.5">
                  {loadingBody ? (
                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-primary)]/50"><Loader2 className="size-3 animate-spin" /> Loading SKILL.md…</div>
                  ) : (
                    <pre className="max-h-64 overflow-y-auto custom-scrollbar whitespace-pre-wrap text-[11px] leading-4 text-[var(--text-primary)]/75 font-mono">{viewBody}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create */}
      <div className="mt-4">
        <button
          onClick={() => setCreateOpen((v) => !v)}
          className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] transition-colors"
        >
          {createOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Create a skill
          <span className="text-[10px] font-normal text-[var(--text-primary)]/35">— or just ask: “save this as a skill”</span>
        </button>
        {createOpen && (
          <div className="mt-3 space-y-2 rounded-xl border border-[var(--surface-border)]/40 bg-[var(--bg-secondary)] p-3">
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="name (e.g. standup-notes)"
                className="w-40 rounded-lg bg-[var(--bg-primary)] border border-[var(--surface-border)] px-2.5 py-2 text-xs outline-none focus:border-[var(--accent)]/50"
                spellCheck={false}
                autoCapitalize="off"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Use when <trigger> — what it does"
                className="flex-1 rounded-lg bg-[var(--bg-primary)] border border-[var(--surface-border)] px-2.5 py-2 text-xs outline-none focus:border-[var(--accent)]/50"
                spellCheck={false}
              />
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"Skill instructions in markdown. Example:\n\n# Standup notes\n\n1. Ask what changed since yesterday\n2. Format as: Done / Doing / Blocked"}
              className="h-36 w-full rounded-lg bg-[var(--bg-primary)] border border-[var(--surface-border)] px-2.5 py-2 text-xs leading-4 outline-none focus:border-[var(--accent)]/50 font-mono custom-scrollbar"
              spellCheck={false}
            />
            {createError && <p className="text-[11px] text-red-400">{createError}</p>}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[var(--text-primary)]/40">Name must be lowercase letters, digits and hyphens.</p>
              <button
                onClick={onCreate}
                disabled={creating || !name.trim() || !description.trim() || content.trim().length < 20}
                className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-[var(--bg-primary)] disabled:opacity-40 hover:opacity-90 transition-opacity"
              >{creating ? "Creating…" : "Create skill"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
