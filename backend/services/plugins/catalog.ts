/**
 * Flux plugins — installable bundles of skills.
 *
 * A plugin is a named collection of skills plus metadata. Installing one
 * enables the bundled skills through the normal builtin-skill mechanism
 * (user_metadata.disabledBuiltinSkills is consulted LAST: a plugin's skills
 * are treated as enabled while the plugin is installed). Uninstalling
 * restores normal per-skill toggling.
 */

export interface FluxPlugin {
    id: string;
    name: string;
    /** Short attribution line, e.g. "from Flux Directory". */
    source: string;
    description: string;
    /** Skill names from the built-in catalog this plugin provides. */
    skills: string[];
    /** Category badge, e.g. "Code" — cosmetic, shown in the plugins list. */
    badge: string;
    iconKey: 'office' | 'design' | 'research';
}

export const PLUGIN_CATALOG: FluxPlugin[] = [
    {
        id: 'flux-office',
        name: 'Flux Office',
        source: 'from Flux Directory',
        description: 'Office document skills — Word (docx), PowerPoint (pptx), Excel (xlsx), PDF and CSV/TSV export with layout and citation rules.',
        skills: ['docx-skill', 'pptx-skill', 'xlsx-skill', 'pdf-skill', 'csv-skill', 'tsv-skill'],
        badge: 'Docs',
        iconKey: 'office',
    },
    {
        id: 'flux-design',
        name: 'Flux Design',
        source: 'from Flux Directory',
        description: 'Distinctive frontend design skills — production-grade UI styling and live interactive visualizations (<LIVE> widgets).',
        skills: ['frontend-design', 'live-viz'],
        badge: 'Code',
        iconKey: 'design',
    },
    {
        id: 'flux-research',
        name: 'Flux Research',
        source: 'from Flux Directory',
        description: 'Analysis writing skills — technical documentation, financial analysis and software-engineering explainers.',
        skills: ['tech-writer-skill', 'finance-skill', 'coder-skill'],
        badge: 'Analysis',
        iconKey: 'research',
    },
];

export function getPlugin(id: string): FluxPlugin | undefined {
    return PLUGIN_CATALOG.find((p) => p.id === id);
}

/** Union of skill names across the given installed plugins. */
export function skillsForPlugins(installedIds: string[]): Set<string> {
    const out = new Set<string>();
    for (const id of installedIds) {
        getPlugin(id)?.skills.forEach((s) => out.add(s));
    }
    return out;
}
