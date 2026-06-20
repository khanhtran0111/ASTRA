import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { withTestDb } from '../packages/shared-testing/src/with-test-db.ts';
import { ensureTemplateDb, markAsTemplate, startPgContainer } from '../packages/shared-testing/src/pg-container.ts';
import { runMigrations } from '../packages/shared-db/src/migrate.ts';
import { Pool } from 'pg';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function run() {
  const TEMPLATE = 'platform_template_planner_scratch';
  console.log('Starting container...');
  const handle = await startPgContainer();
  console.log('Ensuring template DB...');
  await ensureTemplateDb(handle, TEMPLATE);

  const pool = new Pool({ connectionString: `${handle.baseUrl}/${TEMPLATE}` });
  try {
    console.log('Running migrations...');
    await runMigrations({
      pool,
      modules: [
        { name: 'core', dir: resolve(__dirname, '../packages/core/drizzle/migrations') },
        { name: 'identity', dir: resolve(__dirname, '../packages/identity/drizzle') },
        { name: 'planner', dir: resolve(__dirname, '../packages/planner/drizzle') },
        { name: 'agent', dir: resolve(__dirname, '../packages/agent/drizzle') },
      ],
    });
  } finally {
    console.log('Ending migration pool...');
    await pool.end();
  }

  console.log('Marking as template...');
  await markAsTemplate(handle, TEMPLATE);

  const opts = { templateDbName: TEMPLATE, baseUrl: handle.baseUrl };

  console.log('\n--- FIRST CALL ---');
  await withTestDb(opts, async ({ pool, databaseUrl }) => {
    console.log('Inside FIRST call. Checking connection...');
    const { rows } = await pool.query('SELECT 1 as n');
    console.log('First call got:', rows[0].n);
  });
  console.log('FIRST CALL DONE\n');

  console.log('--- SECOND CALL ---');
  await withTestDb(opts, async ({ pool, databaseUrl }) => {
    console.log('Inside SECOND call. Checking connection...');
    const { rows } = await pool.query('SELECT 1 as n');
    console.log('Second call got:', rows[0].n);
  });
  console.log('SECOND CALL DONE\n');

  await handle.stop();
  console.log('ALL DONE');
}

run().catch(console.error);
