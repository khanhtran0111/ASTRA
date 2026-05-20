import { ChatHitlCard, ChatToolCall } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { copilotApi } from '../../api/client';

export interface UpdateMyDisplayNameProps {
  args: { displayName: string; expiresAt?: string };
  state: 'input-streaming' | 'input-pending-approval' | 'output-available' | 'output-error';
  callId: string;
  approval?: { id?: string } | null;
}

function splitApprovalId(composite: string | undefined): {
  runId?: string;
  toolCallId?: string;
} {
  if (!composite) return {};
  const [runId, toolCallId] = composite.split('::');
  return { runId, toolCallId };
}

export function UpdateMyDisplayNameRenderer({
  args,
  state,
  callId,
  approval,
}: UpdateMyDisplayNameProps) {
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { thread?: string };
  const threadId = search.thread;
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);

  const resolve = async (approved: boolean) => {
    const { runId, toolCallId: parsedToolCallId } = splitApprovalId(approval?.id);
    if (!runId) return;
    setPending(approved ? 'approve' : 'reject');
    try {
      await copilotApi.resolveApproval('self', {
        runId,
        toolCallId: parsedToolCallId ?? callId,
        approved,
        ...(threadId ? { threadId } : {}),
      });
      void queryClient.invalidateQueries({ queryKey: ['copilot', 'threads'] });
      if (threadId) {
        void queryClient.invalidateQueries({ queryKey: ['copilot', 'thread', threadId] });
      }
    } finally {
      setPending(null);
    }
  };

  if (state === 'input-pending-approval') {
    return (
      <ChatHitlCard
        title="Change display name"
        toolName="identity.updateMyDisplayName"
        {...(args.expiresAt ? { expiresAt: new Date(args.expiresAt) } : {})}
        permissionHint="Requires identity.user.write.self"
        onApprove={() => void resolve(true)}
        onReject={() => void resolve(false)}
        pending={pending}
      >
        <div className="rounded-md border border-hairline bg-surface-1 p-3 text-body-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono text-caption text-ink-subtle">New display name:</span>
            <span className="font-medium">{args.displayName}</span>
          </div>
        </div>
      </ChatHitlCard>
    );
  }
  if (state === 'output-available')
    return (
      <ChatToolCall
        name="identity.updateMyDisplayName"
        status="ok"
        summary="Display name updated"
      />
    );
  if (state === 'output-error')
    return <ChatToolCall name="identity.updateMyDisplayName" status="error" summary="failed" />;
  return <ChatToolCall name="identity.updateMyDisplayName" status="running" />;
}
