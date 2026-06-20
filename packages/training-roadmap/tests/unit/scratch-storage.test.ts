import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readJsonFileOrDefault } from '../../src/backend/scratch-storage.ts';

const testDir = mkdtempSync(join(tmpdir(), 'training-roadmap-scratch-'));

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readJsonFileOrDefault', () => {
  it('returns the fallback when the file does not exist', () => {
    expect(readJsonFileOrDefault(join(testDir, 'missing.json'), [])).toEqual([]);
  });

  it('returns the fallback when the file is empty', () => {
    const filePath = join(testDir, 'empty.json');
    writeFileSync(filePath, '   ');

    expect(readJsonFileOrDefault(filePath, { ok: false })).toEqual({ ok: false });
  });

  it('parses a non-empty JSON file', () => {
    const filePath = join(testDir, 'data.json');
    writeFileSync(filePath, JSON.stringify({ ok: true }));

    expect(readJsonFileOrDefault(filePath, null)).toEqual({ ok: true });
  });
});
