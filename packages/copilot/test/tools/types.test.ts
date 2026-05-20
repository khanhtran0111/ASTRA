import type { Actor } from '@seta/identity';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CopilotTool } from '../../src/backend/tools/_types.ts';
import { ACTOR_REQUEST_CONTEXT_KEY, toToolBag } from '../../src/backend/tools/_types.ts';
import { STATIC_SELF_TOOLS } from '../../src/backend/tools/self-tools.ts';

class FakeRequestContext {
  constructor(private readonly entries: Record<string, unknown>) {}
  get(key: string): unknown {
    return this.entries[key];
  }
}

const actorOpts = (actor: Actor) => ({
  requestContext: new FakeRequestContext({ [ACTOR_REQUEST_CONTEXT_KEY]: actor }),
});

describe('toToolBag', () => {
  it('produces a Mastra-shaped tools record', () => {
    const tool: CopilotTool<z.ZodObject<{ x: z.ZodString }>> = {
      name: 'x_echo',
      description: 'echoes',
      inputSchema: z.object({ x: z.string() }),
      requiredPermission: 'copilot.chat.use',
      execute: async (_actor, input) => ({ echoed: input.x }),
    };
    const bag = toToolBag([tool]);
    const entry = bag.x_echo;
    expect(entry).toBeDefined();
    expect(entry?.description).toBe('echoes');
  });

  it('preserves needsApproval flag when set', () => {
    const tool: CopilotTool<z.ZodObject<Record<string, never>>> = {
      name: 'y_write',
      description: 'writes',
      inputSchema: z.object({}),
      requiredPermission: 'copilot.chat.use',
      needsApproval: true,
      execute: async () => null,
    };
    const bag = toToolBag([tool]);
    const entry = bag.y_write;
    expect(entry?.needsApproval).toBe(true);
  });

  it('threads the actor from requestContext into execute', async () => {
    const seen: Actor[] = [];
    const tool: CopilotTool<z.ZodObject<Record<string, never>>> = {
      name: 'probe_actor',
      description: 'records the actor it was called with',
      inputSchema: z.object({}),
      requiredPermission: 'copilot.chat.use',
      execute: async (actor) => {
        seen.push(actor);
        return { ok: true };
      },
    };
    const bag = toToolBag([tool]);
    const actor: Actor = { type: 'user', user_id: 'u-1' };
    await bag.probe_actor!.execute({}, actorOpts(actor));
    expect(seen).toEqual([actor]);
  });

  it('throws unauthenticated when no actor in requestContext', async () => {
    const tool: CopilotTool<z.ZodObject<Record<string, never>>> = {
      name: 'no_actor',
      description: 'needs actor',
      inputSchema: z.object({}),
      requiredPermission: 'copilot.chat.use',
      execute: async () => ({ ok: true }),
    };
    const bag = toToolBag([tool]);
    await expect(
      bag.no_actor!.execute({}, { requestContext: new FakeRequestContext({}) }),
    ).rejects.toThrow('unauthenticated');
  });
});

describe('STATIC_SELF_TOOLS', () => {
  it('contains the four static self tools', () => {
    const names = STATIC_SELF_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      'core_serverTime',
      'identity_listMyRoles',
      'identity_updateMyDisplayName',
      'identity_whoAmI',
    ]);
  });
});
