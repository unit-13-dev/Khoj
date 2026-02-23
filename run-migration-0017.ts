import { drizzle } from 'drizzle-orm/neon-serverless';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log('Running migration 0017: Add finalized_itinerary column...');
  
  try {
    await db.execute(sql`
      ALTER TABLE "planning_sessions" ADD COLUMN IF NOT EXISTS "finalized_itinerary" jsonb;
    `);
    
    console.log('✓ Migration 0017 complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
