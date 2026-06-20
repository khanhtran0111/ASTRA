import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { trainingRoadmapRoutes } from '../packages/training-roadmap/src/backend/http/routes.ts';

async function run() {
  console.log('Invoking Agent Pipeline via POST /run...');

  const response = await trainingRoadmapRoutes.request('/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userPrompt:
        'Hãy tạo lộ trình đào tạo Q3 cho team Frontend gồm 12 nhân sự Mid-level. Mục tiêu là nâng cao React performance optimization và testing automation để phục vụ các dự án UK. Ưu tiên training on job, có assignment và review code. Thời lượng tối đa 2 buổi/tuần, mỗi buổi 2 tiếng. Output cần gồm: roadmap theo tháng, danh sách khóa học, hình thức đào tạo và tiêu chí đánh giá sau training.',
    }),
  });

  let result;
  try {
    result = await response.json();
  } catch (err) {
    console.error('Failed to parse JSON. Response text:');
    console.error(await response.text());
    return;
  }

  if (result.agentReasoning) {
    console.log('\n=======================================');
    console.log('🤖 AGENT REASONING:');
    console.log('=======================================');
    console.log(result.agentReasoning);
    console.log('=======================================\n');
  }

  if (result.draftRoadmap) {
    console.log('✅ Agent successfully returned Draft Roadmap JSON!');
  }

  // Write full result to file
  const outPath = join(process.cwd(), 'scratch', 'roadmap_output_agent.json');
  await writeFile(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n✅ Full output written to: ${outPath}`);
}

run().catch(console.error);
