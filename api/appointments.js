import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  return neon(dbUrl);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sql = getDb();

    // GET /api/appointments
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT 
          id,
          patient_id as "patientId",
          patient_name as "patientName",
          doctor_id as "doctorId",
          doctor_name as "doctorName",
          hospital_name as "hospitalName",
          date,
          time_slot as "timeSlot",
          consultation_type as "consultationType",
          meeting_room_id as "meetingRoomId",
          status
        FROM upchaar_appointments
        ORDER BY created_at DESC;
      `;
      return res.status(200).json(rows);
    }

    // POST /api/appointments
    if (req.method === 'POST') {
      const appt = req.body;
      if (!appt || !appt.id) {
        return res.status(400).json({ error: 'Appointment id and details are required' });
      }

      await sql`
        INSERT INTO upchaar_appointments (
          id, patient_id, patient_name, doctor_id, doctor_name,
          hospital_name, date, time_slot, consultation_type, meeting_room_id, status
        ) VALUES (
          ${appt.id},
          ${appt.patientId || 'P-UNKNOWN'},
          ${appt.patientName || 'Anonymous Patient'},
          ${appt.doctorId || null},
          ${appt.doctorName || null},
          ${appt.hospitalName || 'Online Teleconsultation'},
          ${appt.date || new Date().toISOString()},
          ${appt.timeSlot || '10:00 AM - 10:30 AM'},
          ${appt.consultationType || 'ONLINE_VIDEO'},
          ${appt.meetingRoomId || `room-${appt.id}`},
          ${appt.status || 'SCHEDULED'}
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          date = EXCLUDED.date,
          time_slot = EXCLUDED.time_slot,
          updated_at = NOW();
      `;

      return res.status(201).json({ success: true, appointment: appt });
    }

    // PUT /api/appointments
    if (req.method === 'PUT') {
      const { id, status } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'Appointment id is required' });
      }

      const rows = await sql`
        UPDATE upchaar_appointments
        SET
          status = COALESCE(${status}, status),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING
          id,
          patient_id as "patientId",
          patient_name as "patientName",
          doctor_id as "doctorId",
          doctor_name as "doctorName",
          hospital_name as "hospitalName",
          date,
          time_slot as "timeSlot",
          consultation_type as "consultationType",
          meeting_room_id as "meetingRoomId",
          status;
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      return res.status(200).json({ success: true, appointment: rows[0] });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Database Error (/api/appointments):', err);
    return res.status(500).json({ error: err.message || 'Database operation failed' });
  }
}
