import type { Actor } from '@seta/identity';
import type { ZodTypeAny, z } from 'zod';

export const ACTOR_REQUEST_CONTEXT_KEY = 'actor';

export type CopilotTool<I extends ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: I;
  requiredPermission: string;
  needsApproval?: boolean;
  execute: (actor: Actor, input: z.infer<I>) => Promise<unknown>;
};

type RequestContextLike = { get: (key: string) => unknown };
type MastraExecuteOpts = { requestContext?: RequestContextLike };

type ToolBagEntry = {
  description: string;
  inputSchema: ZodTypeAny;
  needsApproval?: boolean;
  execute: (input: unknown, opts: MastraExecuteOpts) => Promise<unknown>;
};

export function toToolBag(tools: readonly CopilotTool<ZodTypeAny>[]): Record<string, ToolBagEntry> {
  const bag: Record<string, ToolBagEntry> = {};
  for (const t of tools) {
    bag[t.name] = {
      description: t.description,
      inputSchema: t.inputSchema,
      needsApproval: t.needsApproval,
      execute: async (input, opts) => {
        const actor = opts?.requestContext?.get(ACTOR_REQUEST_CONTEXT_KEY) as Actor | undefined;
        if (!actor || actor.type !== 'user' || !actor.user_id) {
          throw new Error('unauthenticated');
        }
        return t.execute(actor, input as never);
      },
    };
  }
  return bag;
}
