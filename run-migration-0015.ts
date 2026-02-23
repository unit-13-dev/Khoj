import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('Running migration 0016...');
  
  const sql = readFileSync('./app/db/migrations/0016_colossal_satana.sql', 'utf-8');
  const statements = sql.split('-->statement-breakpoint').map(s => s.trim()).filter(Boolean);
  
  for (const statement of statements) {
    console.log('Executing:', statement.substring(0, 100) + '...');
    await pool.query(statement);
  }
  
  await pool.end();
  console.log('Migration 0016 complete!');
}

main().catch(console.error);
