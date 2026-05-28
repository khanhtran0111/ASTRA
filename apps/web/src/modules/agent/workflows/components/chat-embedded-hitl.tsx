import { useAui } from '@assistant-ui/react';
import { useMutation } from '@tanstack/react-query';
import { type DecideApprovalBody, workflowsApi } from '../api/workflows.ts';
import { useThreadPendingApprovals } from '../hooks/use-thread-pending-approvals.ts';
import { HitlApprovalCard } from './hitl-approval-card.tsx';

export interface ChatEmbeddedHitlProps {
  threadId: string | undefined;
}

const DECISION_LABELS: Record<string, string> = {
  approve: 'Approved',
  reject: 'Declined',
  modify: 'Modified',
};

export function ChatEmbeddedHitl({ threadId }: ChatEmbeddedHitlProps) {
  const approvalsQuery = useThreadPendingApprovals(threadId);
  const aui = useAui();

  const decide = useMutation({
    mutationFn: (args: { approvalId: string } & DecideApprovalBody) =>
      workflowsApi.decideApproval(args.approvalId, {
        decision: args.decision,
        overrideUserIds: args.overrideUserIds,
        note: args.note,
      }),
    onSuccess: (_res, variables) => {
      // The card stays visible (decided state rendered below).
      // Trigger a new agent turn — the LLM sees full thread history and generates
      // a contextual follow-up in the user's language. Works for any HITL flow.
      const label = DECISION_LABELS[variables.decision] ?? variables.decision;
      aui.thread().append({ role: 'user', content: [{ type: 'text', text: label }] });
    },
  });

  const approvals = approvalsQuery.data;
  if (!approvals || approvals.length === 0) return null;

  // Once decided, replace the interactive card with a compact confirmation row
  // so the thread shows what was chosen without re-fetching.
  if (decide.isSuccess && decide.variables) {
    const label = DECISION_LABELS[decide.variables.decision] ?? decide.variables.decision;
    return (
      <div className="rounded-md border border-border bg-surface-1 px-4 py-2 text-body-sm text-ink-subtle">
        <span className="mr-1 font-medium text-ink">{label}.</span>
        Agent is responding…
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-label="In-thread approvals">
      {approvals.map((approval) => (
        <HitlApprovalCard
          key={approval.approvalId}
          approval={approval}
          canAct
          pending={decide.isPending}
          onDecide={(args) => decide.mutate({ approvalId: approval.approvalId, ...args })}
        />
      ))}
    </section>
  );
}
