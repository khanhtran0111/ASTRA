import { Agent } from '@mastra/core/agent';
import { lndFindAndAssignTrainer } from '../packages/training-roadmap/src/backend/agent-tools/roadmap-tools.ts';

const agent = new Agent({
  name: 'test-agent',
  instructions: 'Call lnd_findAndAssignTrainer with estimatedHoursMap: { "Kubernetes": 40 }',
  model: { provider: 'OPEN_AI', name: 'gpt-4o' },
  tools: { lnd_findAndAssignTrainer: lndFindAndAssignTrainer as any },
});

async function run() {
  const result = await agent.generate('Call the tool');
  console.log(result.text);
}
run();
