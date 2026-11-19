import React, { useState, useEffect, useMemo } from 'react';
import { Phone, Stethoscope, User as UserIcon, LayoutGrid, LogOut, Loader2, Key, Zap, Sparkles, Shield, Video } from 'lucide-react';
import PatientPortal from './components/PatientPortal';
import DoctorDashboard from './components/DoctorDashboard';
import LoginScreen from './components/LoginScreen';
import ApiKeyModal from './components/ApiKeyModal';
import VideoCall from './components/VideoCall';
import Logo from './components/Logo';
import { MedicalCase, CaseStatus, CaseSeverity, User, UserRole, Appointment, ActiveVideoSession, PatientProfile } from './types';
import { logout, getSession } from './services/authService';
import { getAIConfig } from './services/aiService';

function App() {
  const [currentView, setCurrentView] = useState<'LOGIN' | 'PATIENT' | 'DOCTOR'>('LOGIN');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState(getAIConfig());
  const [activeVideoSession, setActiveVideoSession] = useState<ActiveVideoSession | null>(null);

  // Persistent States across sessions & tabs - clean of mock data
  const [cases, setCases] = useState<MedicalCase[]>(() => {
    try {
      const saved = localStorage.getItem('ai_upchaar_cases');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(c => c && c.id && !c.id.startsWith('CS-2023-') && !c.id.startsWith('CS-2026-LIVE-'));
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    try {
      const saved = localStorage.getItem('ai_upchaar_appointments');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(a => a && a.id && !a.id.startsWith('apt-101') && !a.id.startsWith('apt-102') && !a.id.startsWith('APT-'));
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  // Dynamically derived stats from live cases
  const stats = useMemo(() => ({
    totalPatients: new Set(cases.map(c => c.patientId)).size,
    casesResolved: cases.filter(c => c.status === CaseStatus.COMPLETED || c.status === CaseStatus.APPROVED).length,
    activeTriage: cases.filter(c => c.status === CaseStatus.OPEN || c.status === CaseStatus.PENDING_APPROVAL).length,
    criticalPending: cases.filter(c => c.severity === CaseSeverity.CRITICAL && c.status !== CaseStatus.COMPLETED).length,
    deliveriesInProgress: cases.filter(c => c.status === CaseStatus.APPROVED).length
  }), [cases]);

  // Dynamically derived patient profiles from live cases
  const dynamicPatients: PatientProfile[] = useMemo(() => {
    const map = new Map<string, PatientProfile>();
    for (const c of cases) {
      if (c.patientId && !map.has(c.patientId)) {
        map.set(c.patientId, {
          id: c.patientId,
          name: c.patientName,
          age: 30,
          gender: 'Male',
          location: c.patientLocation?.address || 'India'
        });
      }
    }
    return Array.from(map.values());
  }, [cases]);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ai_upchaar_cases', JSON.stringify(cases));
    } catch (e) {}
  }, [cases]);

  useEffect(() => {
    try {
      localStorage.setItem('ai_upchaar_appointments', JSON.stringify(appointments));
    } catch (e) {}
  }, [appointments]);

  // Check for existing session on app start
  useEffect(() => {
    const checkSession = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      const session = getSession();
      if (session) {
        setCurrentUser(session);
        if (session.role === UserRole.DOCTOR) {
          setCurrentView('DOCTOR');
        } else {
          setCurrentView('PATIENT');
        }
      } else {
        setCurrentView('LOGIN');
      }
      setIsAppLoading(false);
    };
    checkSession();
  }, []);

  // Live Sync with Neon PostgreSQL Database via /api
  useEffect(() => {
    const syncWithDb = async () => {
      try {
        const [casesRes, apptsRes] = await Promise.all([
          fetch('/api/cases').then(r => r.ok ? r.json() : null),
          fetch('/api/appointments').then(r => r.ok ? r.json() : null)
        ]);

        if (Array.isArray(casesRes)) {
          const realCases = casesRes.filter((c: any) => c && c.id && !c.id.startsWith('CS-2023-') && !c.id.startsWith('CS-2026-LIVE-'));
          setCases(realCases);
        }

        if (Array.isArray(apptsRes)) {
          const realAppts = apptsRes.filter((a: any) => a && a.id && !a.id.startsWith('apt-101') && !a.id.startsWith('apt-102') && !a.id.startsWith('APT-'));
          setAppointments(realAppts);
        }
      } catch (err) {
        console.warn('Neon DB sync error (fallback to local state):', err);
      }
    };

    // Initial load
    syncWithDb();

    // Live background polling every 6 seconds so patient bookings & cases show on doctor screen in real-time
    const interval = setInterval(syncWithDb, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleNewCase = async (newCase: MedicalCase) => {
    setCases(prev => [newCase, ...prev.filter(c => c.id !== newCase.id)]);

    // Persist to Neon DB
    try {
      await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCase)
      });
    } catch (err) {
      console.warn('Failed to persist case to Neon DB:', err);
    }
  };

  const handleBookAppointment = async (newAppt: Appointment) => {
    setAppointments(prev => [newAppt, ...prev.filter(a => a.id !== newAppt.id)]);

    // Persist to Neon DB
    try {
      await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAppt)
      });
    } catch (err) {
      console.warn('Failed to persist appointment to Neon DB:', err);
    }
  };

  const handleUpdateAppointment = async (updatedAppt: Appointment) => {
    setAppointments(prev => prev.map(a => a.id === updatedAppt.id ? updatedAppt : a));

    // Persist to Neon DB
    try {
      await fetch('/api/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: updatedAppt.id,
          status: updatedAppt.status
        })
      });
    } catch (err) {
      console.warn('Failed to update appointment in Neon DB:', err);
    }
  };

  const handleStartVideoCall = (session: ActiveVideoSession) => {
    setActiveVideoSession(session);
  };

  const handleEndVideoCall = (doctorNotes?: string, prescription?: string) => {
    if (activeVideoSession) {
      if (activeVideoSession.appointmentId) {
        setAppointments(prev => prev.map(a => {
          if (a.id === activeVideoSession.appointmentId) {
            const updated = { ...a, status: 'COMPLETED' as const };
            fetch('/api/appointments', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: updated.id, status: 'COMPLETED' })
            }).catch(() => {});
            return updated;
          }
          return a;
        }));
      }

      if (prescription && currentUser?.role === UserRole.DOCTOR) {
        handleNewCase({
          id: `CS-CALL-${Date.now()}`,
          patientId: activeVideoSession.patientId,
          patientName: activeVideoSession.patientName,
          timestamp: new Date().toISOString(),
          mode: 'ONLINE',
          symptoms: activeVideoSession.symptoms || ['Video Teleconsultation'],
          aiDiagnosis: activeVideoSession.diagnosis || 'Doctor Teleconsultation Complete',
          severity: activeVideoSession.isEmergency ? CaseSeverity.CRITICAL : CaseSeverity.MODERATE,
          status: CaseStatus.APPROVED,
          prescription: prescription,
          doctorNotes: doctorNotes,
          transcript: [{
            id: `msg-${Date.now()}`,
            role: 'model',
            text: `Teleconsultation completed by Dr. ${currentUser.name}. Prescription: ${prescription}`,
            timestamp: new Date()
          }]
        });
      }
    }
    setActiveVideoSession(null);
  };

  const handleUpdateStatus = async (caseId: string, status: CaseStatus, prescription?: string, notes?: string) => {
    setCases(prev => prev.map(c => {
      if (c.id === caseId) {
        return {
          ...c,
          status,
          prescription: prescription || c.prescription,
          doctorNotes: notes || c.doctorNotes,
          approvalTimestamp: status === 'APPROVED' ? new Date().toISOString() : c.approvalTimestamp,
          deliveryEta: status === 'APPROVED' ? 'Dispatched (20 min)' : c.deliveryEta
        };
      }
      return c;
    }));

    // Persist to Neon DB
    try {
      await fetch('/api/cases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: caseId,
          status,
          prescription,
          doctorNotes: notes
        })
      });
    } catch (err) {
      console.warn('Failed to update case in Neon DB:', err);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    setCases(prev => {
      const updated = prev.filter(c => c.id !== caseId);
      try {
        localStorage.setItem('ai_upchaar_cases', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await fetch(`/api/cases?id=${encodeURIComponent(caseId)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to delete case from Neon DB:', err);
    }
  };

  const handleResetCases = async () => {
    try {
      localStorage.removeItem('ai_upchaar_cases');
    } catch (e) {}
    setCases([]);

    try {
      await fetch('/api/cases?reset=true', { method: 'DELETE' });
    } catch (err) {}
  };


  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    if (user.role === UserRole.DOCTOR) {
      setCurrentView('DOCTOR');
    } else {
      setCurrentView('PATIENT');
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setCurrentView('LOGIN');
  };

  const refreshAIConfig = () => {
    setAiConfig(getAIConfig());
  };

  if (isAppLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center p-3 mb-6 shadow-xl border border-slate-100 animate-pulse ring-4 ring-emerald-100">
          <Logo className="w-full h-full" />
        </div>
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        <p className="text-slate-600 mt-4 text-sm font-semibold tracking-wider uppercase">Initializing PraanSewa...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => {
          setIsKeyModalOpen(false);
          refreshAIConfig();
        }}
      />

      {(currentView !== 'LOGIN') && (
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <button onClick={() => { }} className="flex items-center gap-2.5 sm:gap-3 focus:outline-none group">
                <div className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-200/80 p-1 group-hover:border-emerald-300 transition">
                  <Logo className="w-full h-full" />
                </div>
                <div className="flex flex-col items-start leading-none text-left">
                  <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                    <span className="text-[#002D56]">Praan</span><span className="text-[#00875A]">Sewa</span>
                    <span className="text-[10px] align-super text-emerald-600 font-bold ml-0.5">™</span>
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-700 tracking-wider uppercase mt-0.5">
                    Care Today. Healthier Tomorrows.
                  </span>
                </div>
              </button>

              <div className="flex items-center space-x-3 sm:space-x-4">
                {/* AI Key & Model Trigger */}
                <button
                  onClick={() => setIsKeyModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition shadow-sm"
                  title="Configure Groq or Gemini API Key"
                >
                  {aiConfig.provider === 'groq' ? (
                    <Zap size={14} className="text-emerald-600 fill-emerald-600" />
                  ) : aiConfig.provider === 'gemini' ? (
                    <Sparkles size={14} className="text-blue-600" />
                  ) : (
                    <Shield size={14} className="text-purple-600" />
                  )}
                  <span className="capitalize">{aiConfig.provider === 'groq' ? 'Groq Llama 3.3' : aiConfig.provider === 'gemini' ? 'Gemini AI' : 'Local AI'}</span>
                </button>

                {currentUser && (
                  <div className="flex items-center gap-2 sm:gap-4">
                    <span className="text-sm font-medium text-slate-700 hidden sm:block">
                      {currentUser.role === UserRole.DOCTOR ? `Dr. ${currentUser.name}` : currentUser.name}
                    </span>
                    <button onClick={handleLogout} className="flex items-center gap-1 px-2 sm:px-3 py-2 rounded-full text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition">
                      <LogOut size={16} /> <span className="hidden sm:inline">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* Active Video Call Fullscreen Overlay */}
      {activeVideoSession && currentUser && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col">
          <VideoCall
            session={activeVideoSession}
            currentUser={currentUser}
            onEndCall={handleEndVideoCall}
          />
        </div>
      )}

      <main className={currentView === 'LOGIN' ? 'min-h-screen' : 'h-[calc(100vh-64px)]'}>
        {currentView === 'LOGIN' && (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onOpenKeyModal={() => setIsKeyModalOpen(true)}
          />
        )}
        {currentView === 'PATIENT' && currentUser && (
          <PatientPortal
            user={currentUser}
            patientHistory={cases.filter(c => c.patientId === currentUser.id)}
            appointments={appointments.filter(a => a.patientId === currentUser.id)}
            onSubmitCase={handleNewCase}
            onBookAppointment={handleBookAppointment}
            onStartVideoCall={handleStartVideoCall}
            onLogout={handleLogout}
          />
        )}
        {currentView === 'DOCTOR' && currentUser && (
          <DoctorDashboard
            user={currentUser}
            cases={cases}
            appointments={appointments}
            patients={dynamicPatients}
            stats={stats}
            onUpdateStatus={handleUpdateStatus}
            onUpdateAppointment={handleUpdateAppointment}
            onStartVideoCall={handleStartVideoCall}
            onDeleteCase={handleDeleteCase}
            onResetCases={handleResetCases}
            onLogout={handleLogout}
          />
        )}
      </main>
    </div>
  );
}

export default App;
