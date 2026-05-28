import { EMPTY_WORKING_MEMORY, serializeWorkingMemory } from '@seta/agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { resolveTaskRef } from '../../../src/backend/agent-tools/resolve-task-ref.ts';

const UUID_A = '66be2be2-394d-4184-b106-c412289fd1e1';
const UUID_B = '499f9898-2133-4ba3-82b5-83d9fb1996fc';

function buildCtx(recentTaskIds: Array<{ taskId: string; title: string }>) {
  const now = new Date().toISOString();
  const wm = {
    ...EMPTY_WORKING_MEMORY,
    entities: {
      ...EMPTY_WORKING_MEMORY.entities,
      recentTasks: recentTaskIds.map((t) => ({ ...t, lastSeenAt: now })),
    },
  };
  return {
    agent: { threadId: 't-1', resourceId: 'r-1' },
    requestContext: {
      get: (k: string) =>
        k === '__seta_agent_memory__'
          ? {
              memory: { getWorkingMemory: vi.fn(async () => serializeWorkingMemory(wm)) },
              memoryConfig: {},
            }
          : undefined,
    },
  } as never;
}

describe('resolveTaskRef', () => {
  it('returns UUID as-is', async () => {
    const ctx = buildCtx([{ taskId: UUID_A, title: 'A' }]);
    expect(await resolveTaskRef(ctx, UUID_A)).toEqual({ taskId: UUID_A, source: 'uuid' });
  });

  it('resolves "#1" / "1" / "first" → most recent', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'A' },
      { taskId: UUID_B, title: 'B' },
    ]);
    for (const ref of ['#1', '1', 'first', 'First', '  #1  ']) {
      expect((await resolveTaskRef(ctx, ref)).taskId).toBe(UUID_A);
    }
  });

  it('resolves "last" / "latest" / "most recent" → index 0', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'A' },
      { taskId: UUID_B, title: 'B' },
    ]);
    for (const ref of ['last', 'latest', 'most recent']) {
      expect((await resolveTaskRef(ctx, ref)).taskId).toBe(UUID_A);
    }
  });

  it('resolves "#2" / "second" → next', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'A' },
      { taskId: UUID_B, title: 'B' },
    ]);
    expect((await resolveTaskRef(ctx, '#2')).taskId).toBe(UUID_B);
    expect((await resolveTaskRef(ctx, 'second')).taskId).toBe(UUID_B);
  });

  it('throws structured error with availableTasks when ordinal out of range', async () => {
    const ctx = buildCtx([{ taskId: UUID_A, title: 'A' }]);
    await expect(resolveTaskRef(ctx, '#7')).rejects.toThrow(/no.*7/i);
  });

  it('throws structured error when memory is empty', async () => {
    const ctx = buildCtx([]);
    await expect(resolveTaskRef(ctx, 'first')).rejects.toThrow(/no recent tasks/i);
  });

  it('rejects garbage strings', async () => {
    const ctx = buildCtx([{ taskId: UUID_A, title: 'A' }]);
    await expect(resolveTaskRef(ctx, 'banana')).rejects.toThrow(/not a uuid|unrecognized/i);
  });
});
