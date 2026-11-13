/**
 * Environment access for the Flux backend.
 *
 * One schema, one parse, one failure message. Modules should read `env` instead
 * of touching `process.env` directly so that a missing variable fails at boot
 * with a list of everything that is missing, not at 2am inside a request.
 *
 * Parsing is intentionally lenient: `env` is always constructed, and required
 * variables are enforced by `assertEnv()` during server startup. That keeps
 * scripts, typechecking and the smoke harness importable without secrets.
 */
import { z } from 'zod';

const optional = z.string().min(1).optional();

const schema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    SMOKE_MODE: optional,

    PORT: z.coerce.number().int().positive().max(65535).default(3001),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),

    // Database
    DATABASE_URL: optional,

    // Supabase (auth + realtime sync)
    SUPABASE_URL: optional,
    SUPABASE_API_SECRET: optional,

    // Models
    NIM_API_KEY: optional,
    NIM_TEAM_MODEL: optional,
    PLANNER_MODEL: optional,
    SUBAGENT_MODEL: optional,
    OPENCODE_API_KEYS: optional,

    // Tools
    TAVILY_API_KEY: optional,
    E2B_API_KEY: optional,
    HF_API_KEY: optional,
    OPENWEATHER_API_KEY: optional,
    IMAGE_SERVICE_URL: optional,

    // Google integrations
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    GOOGLE_REDIRECT_URI: optional,
    GOOGLE_SCOPES: optional,

    // Ops
    HEALTH_SECRET: optional,
});

export type Env = z.infer<typeof schema>;

/** Variables the server cannot serve real traffic without. */
const REQUIRED_IN_PRODUCTION: (keyof Env)[] = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_API_SECRET',
    'NIM_API_KEY',
    'TAVILY_API_KEY',
    'HEALTH_SECRET',
];

/** Variables strongly recommended outside production; missing means the feature is off. */
const RECOMMENDED: (keyof Env)[] = ['E2B_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];

function parse(source: NodeJS.ProcessEnv): Env {
    const result = schema.safeParse(source);
    if (!result.success) {
        const details = result.error.issues
            .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('\n');
        throw new Error(`Invalid environment:\n${details}`);
    }
    return result.data;
}

export const env: Env = parse(process.env);

/** True while the smoke/inventory harness is driving the app. */
export const isSmoke = Boolean(env.SMOKE_MODE && env.SMOKE_MODE !== '0');

export function missingEnv(): { required: string[]; recommended: string[] } {
    const required = REQUIRED_IN_PRODUCTION.filter((key) => !env[key]);
    const recommended = RECOMMENDED.filter((key) => !env[key]);
    return { required: required as string[], recommended: recommended as string[] };
}

/**
 * Fail fast at boot when a required variable is absent.
 * In smoke mode the check is informational only.
 */
export function assertEnv(): void {
    const { required, recommended } = missingEnv();

    if (recommended.length > 0 && !isSmoke) {
        console.warn(`[env] optional features disabled, missing: ${recommended.join(', ')}`);
    }

    if (required.length === 0) return;

    const message = [
        `Missing required environment variables: ${required.join(', ')}`,
        'Copy backend/.env.example to backend/.env and fill them in.',
    ].join('\n');

    if (isSmoke) {
        console.warn(`[env] ${message}`);
        return;
    }

    throw new Error(message);
}
