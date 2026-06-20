import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const t = createTool({
  id: 'test',
  name: 'test',
  description: 'test',
  input: z.object({
    val: z.string(),
  }),
  execute: async (args) => {
    console.log('ARGS:', args);
    return args;
  },
});

async function run() {
  await t.execute({} as any);
}
run();
