#!/usr/bin/env node
/**
 * Static route inventory.
 *
 * Reads every backend source file, finds Express route registrations, and
 * writes a normalised table to docs/refactor/routes.json. The point is to have
 * an independent record of the HTTP surface, so a refactor commit that
 * accidentally drops or renames a route is caught by diffing this file.
 *
 * Usage:
 *   node backend/scripts/route-inventory.mjs           # write the table
 *   node backend/scripts/route-inventory.mjs --check   # exit 1 if it changed
 *
 * Budget: reads only .ts files under backend/ (excluding node_modules and the
 * generated Prisma client), one pass, no recursion limit issues.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..');
const REPO = join(BACKEND, '..');
const OUT = join(REPO, 'docs', 'refactor', 'routes.json');

const SKIP_DIRS = new Set(['node_modules', 'prisma', 'dist', 'build', '.tmp']);

function walk(dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(join(dir, entry.name), acc);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            acc.push(join(dir, entry.name));
        }
    }
    return acc;
}

const ROUTE_RE = /\b(app|router)\.(get|post|put|patch|delete|all|use)\(\s*['"`]([^'"`\n]+)['"`]/g;

const rows = [];
for (const file of walk(BACKEND)) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        ROUTE_RE.lastIndex = 0;
        let match;
        while ((match = ROUTE_RE.exec(line)) !== null) {
            const [, host, method, path] = match;
            if (method === 'use' && !path.startsWith('/')) continue;
            rows.push({
                method: method === 'all' ? 'ALL' : method.toUpperCase(),
                path: path.replace(/\/+$/, '') || '/',
                host,
                file: relative(REPO, file).replace(/\\/g, '/'),
                line: index + 1,
            });
        }
    });
}

const byKey = new Map();
for (const row of rows) {
    const key = `${row.method} ${row.path}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
}

const table = [...byKey.entries()]
    .map(([key, occurrences]) => ({
        key,
        count: occurrences.length,
        occurrences: occurrences.map((o) => `${o.file}:${o.line}`),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

const duplicates = table.filter((entry) => entry.count > 1);

const payload = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    unique: table.length,
    duplicates: duplicates.map((d) => ({ key: d.key, at: d.occurrences })),
    routes: table,
};

const serialised = JSON.stringify(payload, null, 2) + '\n';
const check = process.argv.includes('--check');

if (check) {
    if (!existsSync(OUT)) {
        console.error(`route-inventory: ${OUT} is missing, run without --check first`);
        process.exit(1);
    }
    const previous = JSON.parse(readFileSync(OUT, 'utf8'));
    const before = new Set(previous.routes.map((r) => r.key));
    const now = new Set(table.map((r) => r.key));
    const removed = [...before].filter((k) => !now.has(k));
    const added = [...now].filter((k) => !before.has(k));

    if (removed.length || added.length) {
        if (removed.length) console.error(`routes removed (${removed.length}):\n  ${removed.join('\n  ')}`);
        if (added.length) console.error(`routes added (${added.length}):\n  ${added.join('\n  ')}`);
        process.exit(1);
    }
    console.log(`route-inventory: unchanged (${table.length} unique routes)`);
    process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serialised, 'utf8');
console.log(`route-inventory: ${rows.length} registrations, ${table.length} unique routes -> ${relative(REPO, OUT)}`);
if (duplicates.length) {
    console.log(`route-inventory: ${duplicates.length} duplicated path(s):`);
    for (const duplicate of duplicates) console.log(`  ${duplicate.key}  ${duplicate.occurrences.join(', ')}`);
}
