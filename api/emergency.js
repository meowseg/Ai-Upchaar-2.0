import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  return neon(dbUrl);
}

// In-memory fallback
let inMemoryEmergency = null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = getDb();

  // GET /api/emergency - Check if there is an active emergency or doctor call in the last 5 minutes
  if (req.method === 'GET') {
    try {
      if (sql) {
        const rows = await sql`
          SELECT 
            patient_id as "patientId", 
            patient_name as "patientName", 
            room_id as "roomId", 
            doctor_id as "doctorId",
            doctor_name as "doctorName",
            is_doctor_call as "isDoctorCall",
            created_at as "timestamp"
          FROM upchaar_emergency 
          WHERE status = 'ACTIVE' 
            AND created_at > NOW() - INTERVAL '5 minutes'
          ORDER BY created_at DESC 
          LIMIT 1;
        `;
        if (rows && rows.length > 0) {
          return res.status(200).json({ emergency: rows[0] });
        }
      }
    } catch (e) {
      console.warn('Neon DB query error in emergency.js, falling back to in-memory:', e.message);
    }

    // In-memory fallback
    if (inMemoryEmergency) {
      const ageMs = Date.now() - new Date(inMemoryEmergency.timestamp).getTime();
      if (ageMs > 300000) {
        inMemoryEmergency = null;
      }
    }
    return res.status(200).json({ emergency: inMemoryEmergency });
  }

  // POST /api/emergency - Broadcast an emergency SOS or doctor-initiated call
  if (req.method === 'POST') {
    const { patientId, patientName, roomId, doctorId, doctorName, isDoctorCall } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    const payload = {
      patientId: patientId || 'P-UNKNOWN',
      patientName: patientName || 'Emergency Patient',
      roomId: roomId.trim().toLowerCase(),
      doctorId: doctorId || '',
      doctorName: doctorName || '',
      isDoctorCall: !!isDoctorCall,
      timestamp: new Date().toISOString()
    };
    inMemoryEmergency = payload;

    try {
      if (sql) {
        // Resolve older active emergencies and insert new one
        await sql`UPDATE upchaar_emergency SET status = 'RESOLVED' WHERE status = 'ACTIVE';`;
        await sql`
          INSERT INTO upchaar_emergency (patient_id, patient_name, room_id, doctor_id, doctor_name, is_doctor_call, status)
          VALUES (${payload.patientId}, ${payload.patientName}, ${payload.roomId}, ${payload.doctorId}, ${payload.doctorName}, ${payload.isDoctorCall}, 'ACTIVE');
        `;
      }
    } catch (e) {
      console.warn('Neon DB insert error in emergency.js:', e.message);
    }

    return res.status(200).json({ success: true, emergency: payload });
  }

  // DELETE /api/emergency - Dismiss or clear active call
  if (req.method === 'DELETE') {
    inMemoryEmergency = null;
    try {
      if (sql) {
        await sql`UPDATE upchaar_emergency SET status = 'RESOLVED' WHERE status = 'ACTIVE';`;
      }
    } catch (e) {
      console.warn('Neon DB delete error in emergency.js:', e.message);
    }
    return res.status(200).json({ success: true, message: 'Emergency cleared' });
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
