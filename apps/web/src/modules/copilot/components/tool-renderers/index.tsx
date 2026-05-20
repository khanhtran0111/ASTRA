import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { makeAssistantToolUI } from '@assistant-ui/react';
import { ListMyThreadsRenderer } from './copilot.list-my-threads';
import { ServerTimeRenderer } from './core.server-time';
import { ListMyRolesRenderer } from './identity.list-my-roles';
import { UpdateMyDisplayNameRenderer } from './identity.update-my-display-name';
import { WhoAmIRenderer } from './identity.who-am-i';

// Maps assistant-ui's runtime status discriminant to the read-only state string (no HITL branch).
function toReadState(
  props: ToolCallMessagePartProps,
): 'input-streaming' | 'output-available' | 'output-error' {
  if (props.status.type === 'complete') return props.isError ? 'output-error' : 'output-available';
  if (props.status.type === 'incomplete') return 'output-error';
  return 'input-streaming';
}

// Maps assistant-ui status to the full state set that includes the HITL branch.
function toWriteState(
  props: ToolCallMessagePartProps,
): 'input-streaming' | 'input-pending-approval' | 'output-available' | 'output-error' {
  if (props.status.type === 'requires-action') return 'input-pending-approval';
  return toReadState(props);
}

// Using `any` for TResult avoids addResult contravariance issues — we only read result, never write.
/* eslint-disable @typescript-eslint/no-explicit-any */
const SERVER_TIME_TOOL = makeAssistantToolUI<Record<string, unknown>, any>({
  toolName: 'core_serverTime',
  render: (props) => (
    <ServerTimeRenderer
      args={props.args}
      state={toReadState(props)}
      output={props.result ?? undefined}
    />
  ),
});

const WHO_AM_I_TOOL = makeAssistantToolUI<Record<string, unknown>, any>({
  toolName: 'identity_whoAmI',
  render: (props) => (
    <WhoAmIRenderer
      args={props.args}
      state={toReadState(props)}
      output={props.result ?? undefined}
    />
  ),
});

const LIST_MY_ROLES_TOOL = makeAssistantToolUI<Record<string, unknown>, any>({
  toolName: 'identity_listMyRoles',
  render: (props) => (
    <ListMyRolesRenderer
      args={props.args}
      state={toReadState(props)}
      output={props.result ?? undefined}
    />
  ),
});

const LIST_MY_THREADS_TOOL = makeAssistantToolUI<Record<string, unknown>, any>({
  toolName: 'copilot_listMyThreads',
  render: (props) => (
    <ListMyThreadsRenderer
      args={props.args}
      state={toReadState(props)}
      output={props.result ?? undefined}
    />
  ),
});

const UPDATE_MY_DISPLAY_NAME_TOOL = makeAssistantToolUI<
  { displayName: string; expiresAt?: string },
  any
>({
  toolName: 'identity_updateMyDisplayName',
  render: (props) => (
    <UpdateMyDisplayNameRenderer
      args={props.args}
      state={toWriteState(props)}
      callId={props.toolCallId}
    />
  ),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function ToolUIRegistry() {
  return (
    <>
      <SERVER_TIME_TOOL />
      <WHO_AM_I_TOOL />
      <LIST_MY_ROLES_TOOL />
      <LIST_MY_THREADS_TOOL />
      <UPDATE_MY_DISPLAY_NAME_TOOL />
    </>
  );
}
