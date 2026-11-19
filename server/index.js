import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import http from 'http';
import { ExpressPeerServer } from 'peer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// PeerJS Server
const peerServer = ExpressPeerServer(server, {
  path: '/myapp'
});
app.use('/peerjs', peerServer);

const io = new Server(server, {
  cors: { origin: '*' }
});

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

let pusher = null;
if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET) {
  try {
    const { default: Pusher } = await import('pusher');
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER || 'ap2',
      useTLS: true
    });
  } catch (e) {
    console.warn('Pusher package not available, using in-memory signaling fallback.');
  }
}

// Signaling with Pusher fallback
app.post('/api/video/signal', async (req, res) => {
  const { roomId, event, data } = req.body;
  if (pusher) {
    try {
      await pusher.trigger(`presence-${roomId}`, event, data);
    } catch (e) {
      console.warn('Pusher trigger error:', e);
    }
  }
  res.json({ success: true });
});

// Emergency Call Request
app.post('/api/video/emergency-request', async (req, res) => {
  const { doctorId, patientName, roomId } = req.body;
  if (pusher) {
    try {
      await pusher.trigger(`doctor-${doctorId}`, 'emergency-call', {
        patientName,
        roomId,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Pusher emergency trigger error:', e);
    }
  }
  res.json({ success: true });
});

const DATA_FILE = path.join(__dirname, 'data', 'store.json');

// Helper to read persistent store
function readStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { cases: [], appointments: [] };
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading store:', err);
    return { cases: [], appointments: [] };
  }
}

// Helper to write to persistent store
function writeStore(data) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing store:', err);
  }
}

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'AI Upchaar Telemedicine Backend',
    timestamp: new Date().toISOString(),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// 2. Doctor / Patient Auth
app.post('/api/auth/login', (req, res) => {
  const { role, id, password, name, age, gender } = req.body;

  if (role === 'DOCTOR') {
    const validDoctors = [
      { id: 'DR101', name: 'Dr. A. Sharma', pass: 'password123', spec: 'General Physician', hospital: 'Civil Hospital Ludhiana' },
      { id: 'DR102', name: 'Dr. P. Kaur', pass: 'password123', spec: 'Cardiologist', hospital: 'District Hospital Amritsar' }
    ];

    const match = validDoctors.find(d => d.id === id && d.pass === password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid Doctor ID or Password' });
    }

    return res.json({
      id: match.id,
      name: match.name,
      role: 'DOCTOR',
      specialization: match.spec,
      hospital: match.hospital,
      token: `jwt-${Date.now()}`
    });
  } else {
    if (!name || !age) {
      return res.status(400).json({ error: 'Name and Age are required' });
    }

    return res.json({
      id: `P-${Date.now()}`,
      name,
      age,
      gender,
      role: 'PATIENT',
      token: `jwt-patient-${Date.now()}`
    });
  }
});

// 3. Cases API
app.get('/api/cases', (req, res) => {
  const store = readStore();
  res.json(store.cases || []);
});

app.post('/api/cases', (req, res) => {
  const newCase = req.body;
  if (!newCase || !newCase.id) {
    return res.status(400).json({ error: 'Invalid case payload' });
  }

  const store = readStore();
  store.cases = [newCase, ...(store.cases || [])];
  writeStore(store);

  res.status(201).json(newCase);
});

app.put('/api/cases/:id', (req, res) => {
  const { id } = req.params;
  const { status, prescription, doctorNotes } = req.body;

  const store = readStore();
  let updatedCase = null;

  store.cases = (store.cases || []).map(c => {
    if (c.id === id) {
      updatedCase = {
        ...c,
        status: status || c.status,
        prescription: prescription || c.prescription,
        doctorNotes: doctorNotes || c.doctorNotes,
        approvalTimestamp: status === 'APPROVED' ? new Date().toISOString() : c.approvalTimestamp,
        deliveryEta: status === 'APPROVED' ? 'Dispatched (20 min)' : c.deliveryEta
      };
      return updatedCase;
    }
    return c;
  });

  if (!updatedCase) {
    return res.status(404).json({ error: 'Case not found' });
  }

  writeStore(store);
  res.json(updatedCase);
});

// 4. Appointments API
app.get('/api/appointments', (req, res) => {
  const store = readStore();
  res.json(store.appointments || []);
});

app.post('/api/appointments', (req, res) => {
  const appt = req.body;
  const store = readStore();
  store.appointments = [appt, ...(store.appointments || [])];
  writeStore(store);
  res.status(201).json(appt);
});

// 6. Groq AI Proxy Endpoint (keeps API key secure on server)
app.post('/api/ai/chat', async (req, res) => {
  const { messages, model = 'llama-3.3-70b-versatile', temperature = 0.2, jsonMode = false } = req.body;
  const apiKey = req.headers.authorization?.replace('Bearer ', '') || process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'GROQ_API_KEY is not configured on server or in request header.' });
  }

  try {
    const payload = {
      model,
      messages,
      temperature,
      max_tokens: 1500
    };

    if (jsonMode) {
      payload.response_format = { type: 'json_object' };
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return res.status(groqRes.status).json({ error: errText });
    }

    const data = await groqRes.json();
    res.json({ reply: data.choices?.[0]?.message?.content || '' });
  } catch (err) {
    console.error('AI Proxy Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`AI Upchaar Backend running on port ${PORT}`);
});
