import { describe, expect, it } from 'vitest';

import { resetCoreDb } from '../../src/db/client.ts';
import { emit, withEmit } from '../../src/events/index.ts';
import { startDispatcher } from '../../src/runtime/dispatcher/index.ts';
import { waitFor, withCoreTestDb } from '../helpers.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

describe('dispatcher per-subscriber isolation', () => {
  it('slow subscriber does not block fast one within one wall-clock window', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      let slowSeen = 0;
      let fastSeen = 0;

      const slowGate = deferred();

      const slowSub = {
        subscription: 'test.iso.slow',
        event: 'test.iso.entity.created',
        eventVersion: 1,
        handler: async () => {
          slowSeen += 1;
          await slowGate.promise;
        },
      };

      const fastSub = {
        subscription: 'test.iso.fast',
        event: 'test.iso.entity.created',
        eventVersion: 1,
        handler: async () => {
          fastSeen += 1;
        },
      };

      const EVENTS = 10;

      const d = await startDispatcher({
        pool,
        subscribers: [slowSub, fastSub],
        pollIntervalMs: 25,
      });

      try {
        await withEmit(undefined, async () => {
          for (let i = 0; i < EVENTS; i++) {
            await emit({
              tenantId: '00000000-0000-0000-0000-000000000001',
              aggregateType: 'test.iso',
              aggregateId: '00000000-0000-0000-0000-000000000001',
              eventType: 'test.iso.entity.created',
              eventVersion: 1,
              payload: { i },
            });
          }
        });

        // Slow subscriber must start and then stay blocked on its first event.
        await waitFor(() => slowSeen === 1, 1_500);

        // Fast subscriber must still finish all events while slow is blocked.
        await waitFor(() => fastSeen === EVENTS, 1_500);

        expect(fastSeen).toBe(EVENTS);
        expect(slowSeen).toBe(1);
      } finally {
        slowGate.resolve();
        await d.shutdown(10_000);
      }
    });
  });
});
