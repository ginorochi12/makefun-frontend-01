// makefun-frontend-01 entry (Node 22, standard library only).
//
// This repository is a static make.fun frontend: app/index.html plus ES
// modules and CSS, no build step, reading make.fun's public API at
// https://make.fun/api. It shows the live bounty board, a page and a
// leaderboard for each bounty, and an account's public profile, on hash
// routes. This program hands it in: it copies app/ and screenshots/ from
// beside this file into the output directory and writes dossier.json there —
// the summary the judge reads (the screenshots, the first load's files and
// bytes, and the source) — using the vendored make.fun library.
//
// Leave vendor/makefun-frontend.ts untouched: the scorer rebuilds the dossier
// with its own copy and requires the two to match byte for byte.
//
// Run it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copy a directory tree from the repo into the output, if it exists. */
function copyTree(name) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) return;
  cpSync(from, join(outputDir, name), { recursive: true });
}

/** The screenshots, newest first by name, each checked against the gate's
 *  caps before the dossier is built (3 at most, 256 KiB each). */
function checkScreenshots() {
  const dir = join(outputDir, 'screenshots');
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((name) => !name.startsWith('.'));
  if (files.length > 3) throw new Error(`too many screenshots: ${files.length}`);
  for (const name of files) {
    const size = statSync(join(dir, name)).size;
    if (size > 262144) throw new Error(`screenshot ${name} is ${size} bytes, over 256 KiB`);
  }
}

mkdirSync(outputDir, { recursive: true });
copyTree('app');
copyTree('screenshots');
checkScreenshots();

// The gate's caps (reference/gate.json): text_max_bytes shapes the dossier's
// text; the rest refuse an entry the scorer would refuse — more than 3
// screenshots or one over 256 KiB, more than 993 files and directories in
// app/, or 16 MiB of app files (app/ counts beside /output's own 1000-entry
// cap, its screenshots/ and dossier.json).
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 3, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 16777216,
  }),
);
