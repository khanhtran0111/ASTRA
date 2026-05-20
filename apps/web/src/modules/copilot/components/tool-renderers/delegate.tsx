import { ChatToolCall } from '@seta/shared-ui';

interface DelegateArgs {
  prompt?: unknown;
  instructions?: unknown;
}

interface DelegateOutput {
  text?: unknown;
}

interface Props {
  targetLabel: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: unknown;
}

function summary(args: Record<string, unknown>, output: unknown): string | undefined {
  const a = args as DelegateArgs;
  const o = (output ?? {}) as DelegateOutput;
  const prompt = typeof a.prompt === 'string' ? a.prompt : undefined;
  const text = typeof o.text === 'string' ? o.text : undefined;
  if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  if (prompt) return prompt.length > 120 ? `${prompt.slice(0, 120)}…` : prompt;
  return undefined;
}

export function DelegateRenderer({ targetLabel, args, state, output }: Props) {
  const name = `→ ${targetLabel}`;
  if (state === 'output-available') {
    return (
      <ChatToolCall
        name={name}
        status="ok"
        summary={summary(args, output)}
        payload={{ args, output }}
      />
    );
  }
  if (state === 'output-error') {
    return <ChatToolCall name={name} status="error" summary="delegation failed" />;
  }
  return <ChatToolCall name={name} status="running" summary={summary(args, undefined)} />;
}
