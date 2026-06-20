import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

/**
 * Runtime scratch directory shared by the training-roadmap route and tools.
 *
 * Do not derive this path from import.meta.url or process.cwd(). In Docker and
 * pnpm workspaces the package may execute from inside node_modules, while the
 * process working directory can vary between the CLI, server, and tests.
 */
const SCRATCH_DIR = process.env.ASTRA_SCRATCH_DIR
  ? resolve(process.env.ASTRA_SCRATCH_DIR)
  : resolve(tmpdir(), 'astra', 'scratch');

mkdirSync(SCRATCH_DIR, { recursive: true });

export function getScratchPath(...segments: string[]): string {
  return resolve(SCRATCH_DIR, ...segments);
}

export function readJsonFileOrDefault(filePath: string, fallback: unknown): unknown {
  if (!existsSync(filePath)) {
    return fallback;
  }

  const raw = readFileSync(filePath, 'utf-8').trim();
  if (!raw) {
    return fallback;
  }

  return JSON.parse(raw) as unknown;
}
