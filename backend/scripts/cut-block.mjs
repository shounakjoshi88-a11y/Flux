#!/usr/bin/env node
/**
 * Cut a block out of a large file while a refactor is in progress.
 *
 *   node scripts/cut-block.mjs <file> "<start text>" "<end text>" ["<replacement>"]
 *
 * Deletes from the first line containing <start text> up to (not including)
 * the first line containing <end text> after it, then inserts <replacement>.
 * Matching is plain substring, deliberately: it survives the mojibake comments
 * in index.ts that regex anchors trip over.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [file, startText, endText, replacement = ''] = process.argv.slice(2);
if (!file || !startText || !endText) {
    console.error('usage: cut-block.mjs <file> <start> <end> [replacement]');
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

const before = lines.slice(0, start);
const after = lines.slice(end);
const inserted = replacement ? replacement.split('\n') : [];

writeFileSync(file, [...before, ...inserted, ...after].join('\n'), 'utf8');
console.log(`cut-block: removed lines ${start + 1}-${end} (${end - start} lines) from ${file}`);
