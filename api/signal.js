import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  return neon(dbUrl);
}

// In-memory fallback map
const memorySignals = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const room = (req.query.room || req.body?.room || '').trim();
  if (!room) {
    return res.status(400).json({ error: 'room parameter is required' });
  }

  const sql = getDb();
  const now = Date.now();

  // POST: Send WebRTC signal (OFFER, ANSWER, ICE_CANDIDATE, PING, HANGUP)
  if (req.method === 'POST') {
    const { senderId, senderRole, type, payload } = req.body || {};
    if (!type) {
      return res.status(400).json({ error: 'signal type is required' });
    }

    // Always update memory fallback
    if (!memorySignals.has(room)) {
      memorySignals.set(room, []);
    }
    const memList = memorySignals.get(room);
    const memEntry = {
      id: now,
      room,
      senderId: senderId || '',
      senderRole: senderRole || '',
      type,
      payload: payload || {},
      timestamp: now
    };
    memList.push(memEntry);
    if (memList.length > 50) memList.shift();

    // Persist to Neon DB
    let insertedId = now;
    if (sql) {
      try {
        const rows = await sql`
          INSERT INTO upchaar_signals (room, sender_id, sender_role, signal_type, payload)
          VALUES (${room}, ${senderId || ''}, ${senderRole || ''}, ${type}, ${JSON.stringify(payload || {})})
          RETURNING id;
        `;
        if (rows && rows.length > 0) {
          insertedId = rows[0].id;
        }

        // Lazy cleanup: prune signals older than 15 minutes (1 in 10 requests)
        if (Math.random() < 0.1) {
          sql`DELETE FROM upchaar_signals WHERE created_at < NOW() - INTERVAL '15 minutes';`.catch(() => {});
        }
      } catch (err) {
        console.warn('DB signal insert failed, using memory fallback:', err.message);
      }
    }

    return res.status(200).json({ success: true, signalId: insertedId });
  }

  // GET: Poll WebRTC signals for this room
  if (req.method === 'GET') {
    const sinceId = parseInt(req.query.sinceId || '0', 10);
    const excludeRole = (req.query.excludeRole || '').trim();
    const excludeId = (req.query.excludeId || '').trim();

    if (sql) {
      try {
        const rows = await sql`
          SELECT 
            id,
            room,
            sender_id as "senderId",
            sender_role as "senderRole",
            signal_type as "type",
            payload,
            created_at as "timestamp"
          FROM upchaar_signals
          WHERE room = ${room}
            AND id > ${sinceId}
            AND created_at > NOW() - INTERVAL '10 minutes'
          ORDER BY id ASC
          LIMIT 50;
        `;

        const filtered = rows.filter(r => {
          if (excludeRole && r.senderRole === excludeRole) return false;
          if (excludeId && r.senderId === excludeId) return false;
          return true;
        });

        const maxId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) : sinceId;

        return res.status(200).json({
          signals: filtered,
          lastId: maxId
        });
      } catch (err) {
        console.warn('DB signal query failed, using memory fallback:', err.message);
      }
    }

    // Memory fallback
    const memList = memorySignals.get(room) || [];
    const filteredMem = memList.filter(s => {
      if (s.id <= sinceId) return false;
      if (excludeRole && s.senderRole === excludeRole) return false;
      if (excludeId && s.senderId === excludeId) return false;
      return true;
    });
    const maxMemId = filteredMem.length > 0 ? Math.max(...filteredMem.map(s => s.id)) : sinceId;

    return res.status(200).json({
      signals: filteredMem,
      lastId: maxMemId
    });
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
