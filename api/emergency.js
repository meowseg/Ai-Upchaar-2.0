// In-memory + persistent emergency call signal store for cross-device notification

let activeEmergency = null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/emergency - Check if there is an active emergency call in last 5 minutes
  if (req.method === 'GET') {
    if (activeEmergency) {
      const ageMs = Date.now() - new Date(activeEmergency.timestamp).getTime();
      if (ageMs > 300000) { // 5 minutes expiration
        activeEmergency = null;
      }
    }
    return res.status(200).json({ emergency: activeEmergency });
  }

  // POST /api/emergency - Trigger emergency call from patient
  if (req.method === 'POST') {
    const { patientId, patientName, roomId } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    activeEmergency = {
      patientId: patientId || 'P-UNKNOWN',
      patientName: patientName || 'Emergency Patient',
      roomId: roomId,
      timestamp: new Date().toISOString()
    };

    return res.status(200).json({ success: true, emergency: activeEmergency });
  }

  // DELETE /api/emergency - Dismiss or clear emergency call
  if (req.method === 'DELETE') {
    activeEmergency = null;
    return res.status(200).json({ success: true, message: 'Emergency cleared' });
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
