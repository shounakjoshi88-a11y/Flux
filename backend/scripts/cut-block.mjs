#!/usr/bin/env node
/**
 * Cut a block out of a large file while a refactor is in progress.
 *
 *   node scripts/cut-block.mjs <file> "<start text>" "<end text>" [options]
 *
 * Deletes from the first line containing <start text> up to (not including)
 * the first line containing <end text> after it.
 *
 * Options:
 *   --to <path>       append the removed lines to <path> (created if missing)
 *   --export          prefix top-level declarations with `export `
 *   --replace <text>  insert <text> where the block was
 *
 * Matching is plain substring on purpose: it survives the mojibake comments in
 * index.ts that regex anchors trip over.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const positional = [];
const options = { to: null, exportAll: false, replace: null };

for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--to') options.to = argv[++i];
    else if (arg === '--export') options.exportAll = true;
    else if (arg === '--replace') options.replace = argv[++i];
    else positional.push(arg);
}

const [file, startText, endText] = positional;
if (!file || !startText || !endText) {
    console.error('usage: cut-block.mjs <file> <start> <end> [--to path] [--export] [--replace text]');
    process.exit(2);
}

const lines = readFileSync(file, 'utf8').split('\n');
const start = lines.findIndex((line) => line.includes(startText));
if (start === -1) {
    console.error(`cut-block: start not found: ${startText}`);
    process.exit(1);
}
const end = lines.findIndex((line, index) => index > start && line.includes(endText));
if (end === -1) {
    console.error(`cut-block: end not found after start: ${endText}`);
    process.exit(1);
}

let block = lines.slice(start, end);

if (options.exportAll) {
    block = block.map((line) => {
        if (/^(async )?function [A-Za-z_$]/.test(line)) return `export ${line}`;
        if (/^const [A-Za-z_$][\w$]* =/.test(line)) return `export ${line}`;
        if (/^(type|interface) [A-Za-z_$]/.test(line)) return `export ${line}`;
        return line;
    });
}

if (options.to) {
    const header = existsSync(options.to) ? '\n' : '';
    writeFileSync(options.to, header + block.join('\n') + '\n', { flag: 'a' });
    console.log(`cut-block: wrote ${block.length} lines to ${options.to}`);
}

const replacement = options.replace ? options.replace.split('\\n') : [];
const next = [...lines.slice(0, start), ...replacement, ...lines.slice(end)];
writeFileSync(file, next.join('\n'), 'utf8');
console.log(`cut-block: removed lines ${start + 1}-${end} (${block.length} lines) from ${file}`);
