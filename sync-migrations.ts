import { drizzle } from 'drizzle-orm/neon-serverless';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log('Creating migration tracking table...\n');
  
  // Create the drizzle migrations table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);
  
  console.log('✓ Migration tracking table created\n');
  
  // Read the journal to get all migrations
  const journalPath = path.join(process.cwd(), 'app/db/migrations/meta/_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
  
  console.log('Registering migrations in tracking table...\n');
  
  for (const entry of journal.entries) {
    const hash = entry.tag;
    const when = entry.when;
    
    // Check if already registered
    const existing = await db.execute(sql`
      SELECT * FROM "__drizzle_migrations" WHERE hash = ${hash};
    `);
    
    if (existing.rows.length === 0) {
      await db.execute(sql`
        INSERT INTO "__drizzle_migrations" (hash, created_at) 
        VALUES (${hash}, ${when});
      `);
      console.log(`✓ Registered: ${hash}`);
    } else {
      console.log(`- Already registered: ${hash}`);
    }
  }
  
  console.log('\n✓ All migrations synced!');
  await pool.end();
}

main().catch(console.error);
