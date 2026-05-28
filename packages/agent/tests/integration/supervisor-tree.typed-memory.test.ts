import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import { EMPTY_WORKING_MEMORY, parseWorkingMemory, serializeWorkingMemory } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { initAgentRegistry } from '../../src/backend/init-registry.ts';
import { buildSupervisorTree } from '../../src/backend/supervisor-tree.ts';
import { wrapUpdateWorkingMemoryTool } from '../../src/backend/working-memory-guard.ts';
import { withAgentTestDb } from '../helpers.ts';

const UUID_A = '66be2be2-394d-4184-b106-c412289fd1e1';

// initAgentRegistry is idempotent — safe to call at module scope so snapshot() works below.
initAgentRegistry();

describe('supervisor-tree typed working memory', () => {
  it('writes from one sub-thread are readable from another on same resource without UUID corruption', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const storage = new PostgresStore({ id: 't-cross', schemaName: 'agent', pool });
      await storage.init();
      const mastra = new Mastra({ storage, logger: false });
      // Omit databaseUrl — skips the OpenAI embedder path (semanticRecall: false),
      // which is sufficient for testing working-memory persistence across threads.
      const { memory, memoryConfig } = buildSupervisorTree({ mastra });
      if (!memory) throw new Error('memory required');

      const resourceId = 'r-test';
      const wm = {
        ...EMPTY_WORKING_MEMORY,
        entities: {
          ...EMPTY_WORKING_MEMORY.entities,
          recentTasks: [
            {
              taskId: UUID_A,
              title: 'Audit Kubernetes cluster security',
              lastSeenAt: new Date().toISOString(),
            },
          ],
        },
      };
      await memory.updateWorkingMemory({
        threadId: 't-a',
        resourceId,
        workingMemory: serializeWorkingMemory(wm),
        memoryConfig,
      });

      const raw = await memory.getWorkingMemory({
        threadId: 't-b',
        resourceId,
        memoryConfig,
      });
      const read = parseWorkingMemory(raw);
      expect(read.entities.recentTasks[0]?.taskId).toBe(UUID_A);
    });
  }, 60_000);

  it('LLM guard prevents poisoning entities via the updateWorkingMemory tool', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const storage = new PostgresStore({ id: 't-guard', schemaName: 'agent', pool });
      await storage.init();
      const mastra = new Mastra({ storage, logger: false });
      const { memory, memoryConfig } = buildSupervisorTree({ mastra });
      if (!memory) throw new Error('memory required');

      const resourceId = 'r-guard-test';
      const threadId = 't-guard-test';

      await memory.updateWorkingMemory({
        threadId,
        resourceId,
        workingMemory: serializeWorkingMemory({
          ...EMPTY_WORKING_MEMORY,
          entities: {
            ...EMPTY_WORKING_MEMORY.entities,
            recentTasks: [
              { taskId: UUID_A, title: 'Original', lastSeenAt: new Date().toISOString() },
            ],
          },
        }),
        memoryConfig,
      });

      // Replicate the merge semantics of Mastra's schema-mode updateWorkingMemory tool:
      // read existing → deep-merge patch (object keys merged recursively) → write merged result.
      function deepMerge(
        base: Record<string, unknown>,
        patch: Record<string, unknown>,
      ): Record<string, unknown> {
        const result = { ...base };
        for (const [key, value] of Object.entries(patch)) {
          if (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            result[key] !== null &&
            typeof result[key] === 'object' &&
            !Array.isArray(result[key])
          ) {
            result[key] = deepMerge(
              result[key] as Record<string, unknown>,
              value as Record<string, unknown>,
            );
          } else {
            result[key] = value;
          }
        }
        return result;
      }
      const innerTool = {
        id: 'updateWorkingMemory',
        execute: async (input: { memory: string }) => {
          const existingRaw = await memory.getWorkingMemory({ threadId, resourceId, memoryConfig });
          const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, unknown>) : {};
          const patch = JSON.parse(input.memory) as Record<string, unknown>;
          const merged = deepMerge(existing, patch);
          await memory.updateWorkingMemory({
            threadId,
            resourceId,
            workingMemory: JSON.stringify(merged),
            memoryConfig,
          });
          return { success: true };
        },
      };
      const guarded = wrapUpdateWorkingMemoryTool(innerTool as never);
      await guarded.execute(
        {
          memory: JSON.stringify({
            userContext: { notes: 'a soft note from the model' },
            entities: {
              recentTasks: [
                {
                  taskId: 'corrupt-uuid',
                  title: 'Corrupted',
                  lastSeenAt: new Date().toISOString(),
                },
              ],
            },
          }),
        } as never,
        {} as never,
      );

      const after = parseWorkingMemory(
        await memory.getWorkingMemory({ threadId, resourceId, memoryConfig }),
      );
      expect(after.entities.recentTasks).toEqual([
        expect.objectContaining({ taskId: UUID_A, title: 'Original' }),
      ]);
      expect(after.userContext.notes).toBe('a soft note from the model');
    });
  }, 60_000);
});
