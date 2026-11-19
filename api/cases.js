import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  return neon(dbUrl);
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sql = getDb();

    // GET /api/cases - List all medical cases
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT 
          id,
          patient_id as "patientId",
          patient_name as "patientName",
          timestamp,
          mode,
          symptoms,
          ai_diagnosis as "aiDiagnosis",
          severity,
          status,
          transcript,
          prescription,
          care_suggestions as "careSuggestions",
          patient_location as "patientLocation",
          doctor_notes as "doctorNotes",
          approval_timestamp as "approvalTimestamp"
        FROM upchaar_cases
        ORDER BY created_at DESC;
      `;
      return res.status(200).json(rows);
    }

    // POST /api/cases - Create or upsert a medical case
    if (req.method === 'POST') {
      const newCase = req.body;
      if (!newCase || !newCase.id) {
        return res.status(400).json({ error: 'Case id and details are required' });
      }

      await sql`
        INSERT INTO upchaar_cases (
          id, patient_id, patient_name, timestamp, mode, symptoms,
          ai_diagnosis, severity, status, transcript, prescription,
          care_suggestions, patient_location, doctor_notes, updated_at
        ) VALUES (
          ${newCase.id},
          ${newCase.patientId || 'P-UNKNOWN'},
          ${newCase.patientName || 'Anonymous Patient'},
          ${newCase.timestamp ? new Date(newCase.timestamp) : new Date()},
          ${newCase.mode || 'ONLINE'},
          ${JSON.stringify(newCase.symptoms || [])}::jsonb,
          ${newCase.aiDiagnosis || 'Pending Review'},
          ${newCase.severity || 'MODERATE'},
          ${newCase.status || 'OPEN'},
          ${JSON.stringify(newCase.transcript || [])}::jsonb,
          ${newCase.prescription || ''},
          ${newCase.careSuggestions || ''},
          ${JSON.stringify(newCase.patientLocation || {})}::jsonb,
          ${newCase.doctorNotes || ''},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          prescription = EXCLUDED.prescription,
          doctor_notes = EXCLUDED.doctor_notes,
          care_suggestions = EXCLUDED.care_suggestions,
          transcript = EXCLUDED.transcript,
          symptoms = EXCLUDED.symptoms,
          updated_at = NOW();
      `;

      return res.status(201).json({ success: true, case: newCase });
    }

    // PUT /api/cases - Update case status / prescription / doctor notes
    if (req.method === 'PUT') {
      const { id, status, prescription, doctorNotes } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'Case id is required for update' });
      }

      const rows = await sql`
        UPDATE upchaar_cases
        SET
          status = COALESCE(${status}, status),
          prescription = COALESCE(${prescription}, prescription),
          doctor_notes = COALESCE(${doctorNotes}, doctor_notes),
          approval_timestamp = CASE WHEN ${status} = 'APPROVED' THEN NOW() ELSE approval_timestamp END,
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING 
          id,
          patient_id as "patientId",
          patient_name as "patientName",
          timestamp,
          mode,
          symptoms,
          ai_diagnosis as "aiDiagnosis",
          severity,
          status,
          transcript,
          prescription,
          care_suggestions as "careSuggestions",
          patient_location as "patientLocation",
          doctor_notes as "doctorNotes",
          approval_timestamp as "approvalTimestamp";
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Case not found' });
      }

      return res.status(200).json({ success: true, case: rows[0] });
    }

    // DELETE /api/cases - Delete a case
    if (req.method === 'DELETE') {
      const { id, reset } = req.query || req.body || {};

      if (reset === 'true') {
        // Reset to initial mock state
        await sql`TRUNCATE TABLE upchaar_cases;`;
        return res.status(200).json({ success: true, message: 'All cases reset' });
      }

      if (!id) {
        return res.status(400).json({ error: 'Case id is required' });
      }

      await sql`DELETE FROM upchaar_cases WHERE id = ${id};`;
      return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Database Error (/api/cases):', err);
    return res.status(500).json({ error: err.message || 'Database operation failed' });
  }
}
