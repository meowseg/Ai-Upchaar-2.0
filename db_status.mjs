import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const envText = fs.readFileSync('C:/Users/shrey/Desktop/projects/ai-upchaar-2.0/.env.local', 'utf-8');
const match = envText.match(/DATABASE_URL="?([^"\r\n]+)/);
const sql = neon(match[1]);

async function check() {
  const signals = await sql`SELECT id, room, sender_id, sender_role, signal_type, created_at FROM upchaar_signals ORDER BY id DESC LIMIT 25`;
  console.log('Signals count:', signals.length);
  for (const s of signals) {
    console.log(`[${s.id}] room=${s.room} sender=${s.sender_id} (${s.sender_role}) type=${s.signal_type} at ${s.created_at}`);
  }
  const emg = await sql`SELECT * FROM upchaar_emergency ORDER BY id DESC LIMIT 5`;
  console.log('Emergencies:', emg);
}
check();
