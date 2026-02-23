import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './app/db/migrations' });
  await pool.end();
  console.log('Migration complete!');
}

main().catch(console.error);
