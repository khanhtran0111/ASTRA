import {
  type AgentMemoryHandle,
  parseWorkingMemory,
  RC_AGENT_MEMORY,
  type RecentTask,
} from '@seta/agent-sdk';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};
const LAST_WORDS = new Set(['last', 'latest', 'most recent', 'previous']);

type ToolExecuteCtx = {
  agent?: { threadId?: string; resourceId?: string };
  requestContext?: { get: (k: string) => unknown };
};

export type TaskRefResolution = {
  taskId: string;
  source: 'uuid' | 'ordinal' | 'keyword';
};

export class TaskRefResolveError extends Error {
  constructor(
    message: string,
    public readonly availableTasks: ReadonlyArray<RecentTask>,
  ) {
    super(message);
    this.name = 'TaskRefResolveError';
  }
}

export async function resolveTaskRef(
  ctx: ToolExecuteCtx,
  rawRef: string,
): Promise<TaskRefResolution> {
  if (UUID_RE.test(rawRef.trim())) {
    return { taskId: rawRef.trim(), source: 'uuid' };
  }
  const ref = rawRef.trim().toLowerCase().replace(/^#/, '').trim();

  const recentTasks = await loadRecentTasks(ctx);

  if (LAST_WORDS.has(ref)) {
    if (recentTasks.length === 0) {
      throw new TaskRefResolveError(
        `No recent tasks in this conversation to resolve "${rawRef}" against.`,
        [],
      );
    }
    return { taskId: recentTasks[0]!.taskId, source: 'keyword' };
  }

  const ordinal = ORDINAL_WORDS[ref] ?? (/^\d+$/.test(ref) ? Number(ref) : null);
  if (ordinal !== null) {
    if (recentTasks.length === 0) {
      throw new TaskRefResolveError('No recent tasks in this conversation; search first.', []);
    }
    if (ordinal < 1 || ordinal > recentTasks.length) {
      throw new TaskRefResolveError(
        `No #${ordinal} in recent tasks (have ${recentTasks.length}).`,
        recentTasks,
      );
    }
    return { taskId: recentTasks[ordinal - 1]!.taskId, source: 'ordinal' };
  }

  throw new TaskRefResolveError(
    `Could not resolve task reference "${rawRef}" — not a UUID and not a recognized ordinal.`,
    recentTasks,
  );
}

async function loadRecentTasks(ctx: ToolExecuteCtx): Promise<ReadonlyArray<RecentTask>> {
  const handle = ctx.requestContext?.get(RC_AGENT_MEMORY) as AgentMemoryHandle | undefined;
  if (!handle) return [];
  const threadId = ctx.agent?.threadId;
  const resourceId = ctx.agent?.resourceId;
  if (!threadId || !resourceId) return [];
  const raw = await handle.memory.getWorkingMemory({
    threadId,
    resourceId,
    memoryConfig: handle.memoryConfig,
  });
  return parseWorkingMemory(raw).entities.recentTasks;
}
