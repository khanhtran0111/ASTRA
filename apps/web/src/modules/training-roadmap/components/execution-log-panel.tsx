import { Card, CardContent, CardHeader, CardTitle } from '@seta/shared-ui';

export function ExecutionLogPanel({ logs }: { logs: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution Log</CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-body-sm text-ink-subtle">No execution steps yet.</p>
        ) : (
          <ol className="space-y-2">
            {logs.map((log, index) => (
              <li key={log} className="flex gap-3 text-body-sm">
                <span className="flex size-5 flex-none items-center justify-center rounded-full bg-primary-tint text-eyebrow text-primary-ink">
                  {index + 1}
                </span>
                <span className="min-w-0 text-ink">{log}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
