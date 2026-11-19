
import React, { useState, useRef, useEffect } from 'react';
import {
    Users, AlertTriangle, Truck, Activity, CheckCircle, XCircle,
    FileText, Search, Clock, Play, Pause, MapPin, Brain, LogOut, Save, ShieldAlert,
    Edit2, Package, User, Phone, Briefcase, Camera, Loader2, Upload, Leaf, Plus, Star, Sparkles, Zap, Heart, Info,
    Video, Navigation,
    MessageSquare, Stethoscope, Trash2, RotateCcw
} from 'lucide-react';
import { MedicalCase, CaseSeverity, CaseStatus, PatientProfile, User as UserType, HomeRemedy, HealthTip, WellnessActivity, Season, Appointment, ActiveVideoSession } from '../types';
import PredictiveAlerts from './PredictiveAlerts';
import TipCommentsModal from './TipCommentsModal';
import { MOCK_REMEDIES, MOCK_HEALTH_TIPS, MOCK_WELLNESS_ACTIVITIES } from '../services/mockData';
import {
    getTipCommentCounts,
    subscribeToTipComments,
    getTipReactions,
    subscribeToTipReactions,
    reactToTip,
    TIP_EMOJIS
} from '../services/tipCommentsService';


// Declare Leaflet global for TypeScript
declare const L: any;

interface DoctorDashboardProps {
    user: UserType; // Current logged in doctor
    cases: MedicalCase[];
    appointments?: Appointment[];
    patients?: PatientProfile[];
    stats: any;
    onUpdateStatus: (caseId: string, status: CaseStatus, prescription?: string, notes?: string) => void;
    onUpdateAppointment?: (updatedAppt: Appointment) => void;
    onStartVideoCall?: (session: ActiveVideoSession) => void;
    onDeleteCase?: (caseId: string) => void;
    onResetCases?: () => void;
    onLogout: () => void;
}

const DoctorDashboard: React.FC<DoctorDashboardProps> = ({
    user,
    // Keep original props
    cases: initialCases, // Rename prop to initialCases
    appointments = [],
    patients = [],
    stats,
    onUpdateStatus,
    onUpdateAppointment,
    onStartVideoCall,
    onDeleteCase,
    onResetCases,
    onLogout
}) => {
    const [cases, setCases] = useState<MedicalCase[]>(initialCases);
    const [currentView, setCurrentView] = useState<'ACTIVE_CASES' | 'PREDICTIVE' | 'PROFILE' | 'WELLNESS_MGMT' | 'IVR_MONITORING' | 'APPOINTMENTS'>('ACTIVE_CASES');
    const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'PENDING' | 'COMPLETED'>('ALL');
    const [appointmentFilter, setAppointmentFilter] = useState<'ALL' | 'VIDEO' | 'IN_PERSON'>('ALL');
    const [incomingEmergency, setIncomingEmergency] = useState<{
        patientName: string;
        patientId: string;
        roomId: string;
        timestamp: string;
    } | null>(null);
    const [manualRoomInput, setManualRoomInput] = useState('');

    // Cross-tab & Cross-Device Emergency Call Listener
    useEffect(() => {
        // 1. Check existing emergency in localStorage on mount
        try {
            const savedEmg = localStorage.getItem('upchaar_last_emergency');
            if (savedEmg) {
                const parsed = JSON.parse(savedEmg);
                if (parsed && parsed.timestamp && (Date.now() - new Date(parsed.timestamp).getTime() < 300000)) {
                    setIncomingEmergency(parsed);
                }
            }
        } catch (e) {}

        // 2. BroadcastChannel for instant same-browser cross-tab delivery
        let bc: BroadcastChannel | null = null;
        try {
            bc = new BroadcastChannel('upchaar_emergency_channel');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'EMERGENCY_CALL') {
                    setIncomingEmergency(e.data);
                }
            };
        } catch (err) {}

        // 3. Storage event for cross-window delivery
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'upchaar_last_emergency' && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    setIncomingEmergency(data);
                } catch (err) {}
            }
        };
        window.addEventListener('storage', handleStorage);

        // 4. Server API polling (/api/emergency) so doctor sees incoming calls across separate devices/networks
        const checkServerEmergency = async () => {
            try {
                const res = await fetch('/api/emergency');
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.emergency) {
                        setIncomingEmergency(data.emergency);
                    }
                }
            } catch (err) {}
        };

        checkServerEmergency();
        const emgInterval = setInterval(checkServerEmergency, 3000);

        return () => {
            if (bc) bc.close();
            window.removeEventListener('storage', handleStorage);
            clearInterval(emgInterval);
        };
    }, []);

    // Sync cases from parent props whenever updated
    useEffect(() => {
        if (Array.isArray(initialCases) && initialCases.length > 0) {
            setCases(initialCases);
        }
    }, [initialCases]);

    // Safe filteredCases derivation ensuring cases is always an array
    const currentCases = Array.isArray(cases) ? cases : (Array.isArray(initialCases) ? initialCases : []);
    const filteredCases = currentCases.filter(c => {
        if (filter === 'ALL') return true;
        if (filter === 'CRITICAL') return c.severity === CaseSeverity.CRITICAL;
        if (filter === 'PENDING') return c.status === CaseStatus.PENDING_APPROVAL || c.status === CaseStatus.OPEN;
        if (filter === 'COMPLETED') return c.status === CaseStatus.APPROVED || c.status === CaseStatus.COMPLETED;
        return true;
    });

    const [selectedCase, setSelectedCase] = useState<MedicalCase | null>(cases[0] || null);

    const handleDeleteCaseClick = (caseId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (onDeleteCase) {
            onDeleteCase(caseId);
            if (selectedCase?.id === caseId) {
                const remaining = filteredCases.filter(c => c.id !== caseId);
                setSelectedCase(remaining[0] || null);
            }
        }
    };


    useEffect(() => {
        if (!selectedCase && filteredCases.length > 0) {
            setSelectedCase(filteredCases[0]);
        }
    }, [filteredCases, selectedCase]);

    // State for Wellness Management (Add-On Only)
    const [wellnessTab, setWellnessTab] = useState<'REMEDIES' | 'TIPS' | 'ACTIVITIES'>('REMEDIES');
    const [showAddModal, setShowAddModal] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    // Local states for new content (Simulating a new collection: wellness_content)
    const [authoredRemedies, setAuthoredRemedies] = useState<HomeRemedy[]>([]);
    const [authoredTips, setAuthoredTips] = useState<HealthTip[]>([]);
    const [authoredActivities, setAuthoredActivities] = useState<WellnessActivity[]>([]);
    const [selectedTipForComments, setSelectedTipForComments] = useState<HealthTip | null>(null);
    const [, setCommentCountsVersion] = useState(0);
    const [, setReactionCountsVersion] = useState(0);

    // Live real-time sync for comments and emoji reactions across dashboard & patient portal
    useEffect(() => {
        const unsubComments = subscribeToTipComments(() => {
            setCommentCountsVersion(v => v + 1);
        });
        const unsubReactions = subscribeToTipReactions(() => {
            setReactionCountsVersion(v => v + 1);
        });
        return () => {
            unsubComments();
            unsubReactions();
        };
    }, []);


    // Wellness Form States
    const [remedyForm, setRemedyForm] = useState({ title: '', ailment: 'Cough', season: Season.ALL, steps: '', safety: '' });
    const [tipForm, setTipForm] = useState({ title: '', content: '', category: 'IMMUNITY' as any });
    const [activityForm, setActivityForm] = useState({ title: '', type: 'YOGA' as any, level: 'BEGINNER' as any, concern: 'IMMUNITY' as any, duration: '', steps: '' });

    // State for Case Details (Frozen clinical functionality)
    const [prescriptionEdit, setPrescriptionEdit] = useState('');
    const [doctorNotes, setDoctorNotes] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // Profile State
    const [profilePhoto, setProfilePhoto] = useState<string>(user.profilePhotoUrl || '');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);

    // PART 2: LIVE MEDICINE DELIVERY MAP
    const deliveryMapRef = useRef<any>(null);
    const deliveryMapContainerRef = useRef<HTMLDivElement>(null);
    const deliveryMarkersRef = useRef<any>(null);
    const [currentEta, setCurrentEta] = useState<string>('Calculating...');

    useEffect(() => {
        if (selectedCase) {
            // Pre-populate prescription editor with AI care suggestions if available
            const initialText = selectedCase.careSuggestions
                ? `AI SUGGESTIONS:\n${selectedCase.careSuggestions}\n\nPROPOSED PRESCRIPTION:\n${selectedCase.prescription || ''}`
                : (selectedCase.prescription || '');

            setPrescriptionEdit(initialText);
            setDoctorNotes(selectedCase.doctorNotes || '');
            setIsPlaying(false);
        }
    }, [selectedCase]);

    // Handle Delivery Map Initialization and Live Tracking
    useEffect(() => {
        let interval: any;

        // Safety check for container, Leaflet library availability, and case selection
        if (typeof window === 'undefined' || !(window as any).L) return;
        const L = (window as any).L;

        if (selectedCase && deliveryMapContainerRef.current) {
            try {
                // Safely parse coordinates from object or JSON string with bulletproof fallbacks
                let rawLoc: any = selectedCase.patientLocation;
                if (typeof rawLoc === 'string') {
                    try { rawLoc = JSON.parse(rawLoc); } catch (e) { rawLoc = null; }
                }

                const parsedLat = Number(rawLoc?.lat);
                const parsedLng = Number(rawLoc?.lng);

                const validLat = (!isNaN(parsedLat) && parsedLat !== 0) ? parsedLat : 30.9010;
                const validLng = (!isNaN(parsedLng) && parsedLng !== 0) ? parsedLng : 75.8573;

                const dest = { lat: validLat, lng: validLng };
                const start = { lat: dest.lat + 0.015, lng: dest.lng - 0.01 };

                // Cleanup previous map instance to prevent "Map already initialized" error
                if (deliveryMapRef.current) {
                    try { deliveryMapRef.current.remove(); } catch (e) {}
                    deliveryMapRef.current = null;
                }

                // Initialize fresh map instance for the selected case
                deliveryMapRef.current = L.map(deliveryMapContainerRef.current, {
                    zoomControl: false,
                    attributionControl: false,
                    dragging: true,
                    scrollWheelZoom: false,
                    touchZoom: true
                }).setView([dest.lat, dest.lng], 14);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(deliveryMapRef.current);
                deliveryMarkersRef.current = L.layerGroup().addTo(deliveryMapRef.current);

                const updateTracking = () => {
                    try {
                        if (!deliveryMarkersRef.current || !deliveryMapRef.current) return;
                        deliveryMarkersRef.current.clearLayers();

                        // 1. Patient Marker (Always Visible)
                        const patientIcon = L.divIcon({
                            className: 'custom-div-icon',
                            html: `<div class="text-blue-600 drop-shadow-md"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" stroke="white" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg></div>`,
                            iconSize: [28, 28],
                            iconAnchor: [14, 28]
                        });
                        L.marker([dest.lat, dest.lng], { icon: patientIcon }).addTo(deliveryMarkersRef.current);

                        // 2. Conditional Delivery Tracking (Only if Approved)
                        if (selectedCase.status === 'APPROVED') {
                            const cycleTime = 120000; // 2 minute simulation loop
                            const progress = (Date.now() % cycleTime) / cycleTime;
                            const currentLat = start.lat + (dest.lat - start.lat) * progress;
                            const currentLng = start.lng + (dest.lng - start.lng) * progress;

                            const agentIcon = L.divIcon({
                                className: 'custom-div-icon',
                                html: `<div class="p-1.5 bg-white rounded-full border-2 border-emerald-500 shadow-xl animate-bounce text-emerald-600"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div>`,
                                iconSize: [32, 32],
                                iconAnchor: [16, 16]
                            });
                            L.marker([currentLat, currentLng], { icon: agentIcon }).addTo(deliveryMarkersRef.current);

                            // Route Line
                            L.polyline([[currentLat, currentLng], [dest.lat, dest.lng]], {
                                color: '#10b981',
                                weight: 4,
                                dashArray: '8, 12',
                                opacity: 0.7
                            }).addTo(deliveryMarkersRef.current);

                            // Dynamic ETA Update
                            const remainingMins = Math.ceil(20 * (1 - progress));
                            setCurrentEta(`${remainingMins} min`);

                            deliveryMapRef.current.panTo([currentLat, currentLng], { animate: true });
                        } else {
                            setCurrentEta('Pending Approval');
                            deliveryMapRef.current.setView([dest.lat, dest.lng], 14);
                        }
                    } catch (e) {
                        console.warn('Map tracking update error:', e);
                    }
                };

                // Start tracking logic
                updateTracking();
                if (selectedCase.status === 'APPROVED') {
                    interval = setInterval(updateTracking, 3000);
                }

                // Critical: Handle blank map issues caused by container resizing or re-rendering
                setTimeout(() => {
                    if (deliveryMapRef.current) {
                        try { deliveryMapRef.current.invalidateSize(); } catch (e) {}
                    }
                }, 400);

                return () => {
                    if (interval) clearInterval(interval);
                    if (deliveryMapRef.current) {
                        try { deliveryMapRef.current.remove(); } catch (e) {}
                        deliveryMapRef.current = null;
                    }
                };
            } catch (mapInitErr) {
                console.warn('Leaflet map caught gracefully to prevent crash:', mapInitErr);
            }
        }
    }, [selectedCase?.id, selectedCase?.status]); // Re-run when patient selection or status changes

    useEffect(() => {
        if (selectedCase) {
            const updated = cases.find(c => c.id === selectedCase.id);
            if (updated) setSelectedCase(updated);
        }
    }, [cases]);

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleAudioEnded = () => {
        setIsPlaying(false);
    };

    const handleApproveClick = () => {
        setShowConfirmModal(true);
    };

    const confirmDispatch = () => {
        if (selectedCase) {
            onUpdateStatus(selectedCase.id, CaseStatus.APPROVED, prescriptionEdit, doctorNotes);
            setShowConfirmModal(false);
        }
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 2 * 1024 * 1024) { alert("File size too large."); return; }
            if (!['image/jpeg', 'image/png'].includes(file.type)) { alert("Only JPG/PNG supported."); return; }
            setIsUploading(true);
            const reader = new FileReader();
            reader.onload = (event) => {
                setTimeout(() => {
                    if (event.target?.result) setProfilePhoto(event.target.result as string);
                    setIsUploading(false);
                }, 1500);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleWellnessPublish = () => {
        setIsPublishing(true);
        // Simulate API call to /api/wellness/*
        setTimeout(() => {
            if (wellnessTab === 'REMEDIES') {
                setAuthoredRemedies(prev => [{
                    id: `R-${Date.now()}`,
                    title: remedyForm.title,
                    ailment: remedyForm.ailment,
                    season: remedyForm.season,
                    ingredients: [],
                    steps: remedyForm.steps.split('\n').filter(s => s.trim()),
                    safetyNotes: remedyForm.safety,
                    doctorVerified: true,
                    doctorName: user.name,
                    rating: 5,
                    ratingCount: 0
                }, ...prev]);
            } else if (wellnessTab === 'TIPS') {
                setAuthoredTips(prev => [{
                    id: `T-${Date.now()}`,
                    doctorId: user.id,
                    doctorName: user.name,
                    title: tipForm.title,
                    content: tipForm.content,
                    category: tipForm.category,
                    timestamp: new Date().toISOString(),
                    likes: 0
                }, ...prev]);
            } else if (wellnessTab === 'ACTIVITIES') {
                setAuthoredActivities(prev => [{
                    id: `A-${Date.now()}`,
                    title: activityForm.title,
                    type: activityForm.type,
                    benefit: `Doctor-verified routine for ${activityForm.concern}`,
                    level: activityForm.level,
                    ageGroup: 'ALL',
                    concern: activityForm.concern,
                    duration: activityForm.duration,
                    steps: activityForm.steps.split('\n').filter(s => s.trim())
                }, ...prev]);
            }
            setIsPublishing(false);
            setShowAddModal(false);
            // Reset forms
            setRemedyForm({ title: '', ailment: 'Cough', season: Season.ALL, steps: '', safety: '' });
            setTipForm({ title: '', content: '', category: 'IMMUNITY' });
            setActivityForm({ title: '', type: 'YOGA', level: 'BEGINNER', concern: 'IMMUNITY', duration: '', steps: '' });
        }, 1000);
    };

    const highlightSymptoms = (text: string) => {
        const symptoms = ['fever', 'cough', 'pain', 'headache', 'rash', 'breath', 'bleeding', 'chest', 'sweating', 'vomiting', 'itching'];
        const severity = ['high', 'severe', 'critical', 'emergency', 'unconscious', 'collapse'];
        const allKeywords = [...symptoms, ...severity];
        const parts = text.split(new RegExp(`(${allKeywords.join('|')})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) => {
                    const lowerPart = part.toLowerCase();
                    if (severity.some(k => k === lowerPart)) return <span key={i} className="bg-red-200 text-red-900 font-extrabold px-1 rounded border border-red-300">{part}</span>;
                    if (symptoms.some(k => k === lowerPart)) return <span key={i} className="bg-yellow-100 text-yellow-800 font-bold px-1 rounded">{part}</span>;
                    return <span key={i}>{part}</span>;
                })}
            </span>
        );
    };

    const HeaderAvatar = () => (
        <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
                <p className="text-sm font-bold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.specialization}</p>
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-slate-100 overflow-hidden bg-slate-200 flex items-center justify-center text-slate-600 font-bold relative">
                {profilePhoto ? <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" /> : <span>{user.name.charAt(4)}</span>}
            </div>
        </div>
    );

    // Added explicit resize listener to handle Tailwind CDN issues with dynamic hidden classes
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const Sidebar = () => (
        <div
            className="w-16 md:w-20 bg-slate-900 flex-col items-center py-6 gap-6 shrink-0 z-20 h-full"
            style={{ display: isMobile ? 'none' : 'flex' }}
        >
            <button
                onClick={() => setCurrentView('ACTIVE_CASES')}
                className={`p-3 rounded-xl transition ${currentView === 'ACTIVE_CASES' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Active Cases"
            >
                <Activity size={24} />
            </button>
            <button
                onClick={() => setCurrentView('APPOINTMENTS')}
                className={`p-3 rounded-xl transition relative ${currentView === 'APPOINTMENTS' ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Scheduled Consultations & Video Calls"
            >
                <Video size={24} />
                {appointments.filter(a => a.consultationType === 'ONLINE_VIDEO' && a.status === 'SCHEDULED').length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
                )}
            </button>
            <button
                onClick={() => setCurrentView('PREDICTIVE')}
                className={`p-3 rounded-xl transition ${currentView === 'PREDICTIVE' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Predictive Health"
            >
                <Brain size={24} />
            </button>
            <button
                onClick={() => setCurrentView('WELLNESS_MGMT')}
                className={`p-3 rounded-xl transition ${currentView === 'WELLNESS_MGMT' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Wellness Hub Content"
            >
                <Leaf size={24} />
            </button>
            <button
                onClick={() => setCurrentView('PROFILE')}
                className={`p-3 rounded-xl transition ${currentView === 'PROFILE' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Doctor Profile"
            >
                <User size={24} />
            </button>
        </div>
    );

    const MobileBottomNav = () => (
        <div
            className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 justify-around items-center p-3 pb-safe z-50 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]"
            style={{ display: isMobile ? 'flex' : 'none' }}
        >
            <button
                onClick={() => setCurrentView('ACTIVE_CASES')}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${currentView === 'ACTIVE_CASES' ? 'text-emerald-600 -translate-y-1' : 'text-slate-400 hover:text-emerald-500'}`}
            >
                <div className={`p-2 rounded-xl ${currentView === 'ACTIVE_CASES' ? 'bg-emerald-100 shadow-sm' : ''}`}><Activity size={20} /></div>
                <span className="text-[10px] font-bold">Queue</span>
            </button>
            <button
                onClick={() => setCurrentView('APPOINTMENTS')}
                className={`flex flex-col items-center gap-1 transition-all duration-300 relative ${currentView === 'APPOINTMENTS' ? 'text-teal-600 -translate-y-1' : 'text-slate-400 hover:text-teal-500'}`}
            >
                <div className={`p-2 rounded-xl ${currentView === 'APPOINTMENTS' ? 'bg-teal-100 shadow-sm' : ''}`}><Video size={20} /></div>
                <span className="text-[10px] font-bold">Calls</span>
                {appointments.filter(a => a.consultationType === 'ONLINE_VIDEO' && a.status === 'SCHEDULED').length > 0 && (
                    <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                )}
            </button>
            <button
                onClick={() => setCurrentView('PREDICTIVE')}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${currentView === 'PREDICTIVE' ? 'text-purple-600 -translate-y-1' : 'text-slate-400 hover:text-purple-500'}`}
            >
                <div className={`p-2 rounded-xl ${currentView === 'PREDICTIVE' ? 'bg-purple-100 shadow-sm' : ''}`}><Brain size={20} /></div>
                <span className="text-[10px] font-bold">Predictive</span>
            </button>
            <button
                onClick={() => setCurrentView('WELLNESS_MGMT')}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${currentView === 'WELLNESS_MGMT' ? 'text-amber-600 -translate-y-1' : 'text-slate-400 hover:text-amber-500'}`}
            >
                <div className={`p-2 rounded-xl ${currentView === 'WELLNESS_MGMT' ? 'bg-amber-100 shadow-sm' : ''}`}><Leaf size={20} /></div>
                <span className="text-[10px] font-bold">Wellness</span>
            </button>
            <button
                onClick={() => setCurrentView('PROFILE')}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${currentView === 'PROFILE' ? 'text-blue-600 -translate-y-1' : 'text-slate-400 hover:text-blue-500'}`}
            >
                <div className={`p-2 rounded-xl ${currentView === 'PROFILE' ? 'bg-blue-100 shadow-sm' : ''}`}><User size={20} /></div>
                <span className="text-[10px] font-bold">Profile</span>
            </button>
        </div>
    );

    // --- NEW ADD-ON MODULE: Wellness Content Dashboard ---
    const renderWellnessMgmt = () => (
        <div className="h-full flex flex-col md:flex-row bg-slate-50 overflow-hidden">
            <div className="hidden md:flex h-full"><Sidebar /></div>
            <div className="flex-1 overflow-hidden flex flex-col pb-20 md:pb-0">
                <div className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-2">
                        <button className="md:hidden p-1.5 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full transition" onClick={() => setCurrentView('ACTIVE_CASES')}>
                            <svg xmlns="http://www.w0.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        </button>
                        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                            <Leaf size={20} className="text-amber-600" /> Wellness Content Dashboard
                        </h2>
                    </div>
                    <HeaderAvatar />
                </div>

                <div className="bg-white border-b border-slate-100 flex items-center px-4 sm:px-6 gap-4 sm:gap-8 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    {['REMEDIES', 'TIPS', 'ACTIVITIES'].map((t: any) => (
                        <button
                            key={t}
                            onClick={() => setWellnessTab(t)}
                            className={`py-4 text-sm font-bold border-b-2 transition shrink-0 ${wellnessTab === t ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                        >
                            {t === 'ACTIVITIES' ? 'Yoga & Exercises' : t === 'TIPS' ? 'Health Tips' : 'Seasonal Remedies'}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">Preventive Care Management</h3>
                            <p className="text-xs text-slate-500">Authoritative content for patient education and health prevention.</p>
                        </div>
                        <button onClick={() => setShowAddModal(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-slate-800 transition w-full sm:w-auto shrink-0">
                            <Plus size={16} /> Create New
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
                        {/* View Authored & Mock Data Combined */}
                        {wellnessTab === 'REMEDIES' && [...authoredRemedies, ...MOCK_REMEDIES].map((r: any, index) => (
                            <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-amber-400 transition group animate-in zoom-in-95 fade-in duration-300" style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}>
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] font-bold text-amber-600 uppercase bg-amber-50 px-2 py-0.5 rounded-full">{r.season} • {r.ailment}</span>
                                    <div className="flex items-center gap-1 text-amber-500 text-xs font-bold"><Star size={12} fill="currentColor" /> {r.rating || 5}</div>
                                </div>
                                <h4 className="font-bold text-slate-800 mb-1">{r.title}</h4>
                                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">{r.steps[0] || 'Verification pending.'}</p>
                                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                    <span className="text-[10px] text-slate-400">Dr. {r.doctorName}</span>
                                    <span className="text-[10px] text-amber-600 font-bold uppercase cursor-pointer">Edit Content</span>
                                </div>
                            </div>
                        ))}
                        {wellnessTab === 'TIPS' && (
                            <div className="col-span-full bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 border border-blue-200/80 p-4 rounded-2xl flex items-center justify-between gap-4 shadow-2xs">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                                        <Stethoscope size={18} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                            Patient Questions &amp; Interactive Tips
                                            <span className="text-[10px] bg-blue-100 text-blue-700 font-extrabold px-2 py-0.5 rounded-full uppercase">
                                                Instagram Style Q&amp;A
                                            </span>
                                        </h4>
                                        <p className="text-xs text-slate-600 mt-0.5">
                                            Patients ask questions on your tips. Click <strong>"Comments"</strong> on any tip to reply back with verified doctor advice and AI clinical assistance.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {wellnessTab === 'TIPS' && [...authoredTips, ...MOCK_HEALTH_TIPS].map((t: any, index) => {
                            const counts = getTipCommentCounts(t.id);
                            const reactions = getTipReactions(t.id, user.id);

                            return (
                                <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-blue-400 transition group animate-in zoom-in-95 fade-in duration-300 flex flex-col justify-between" style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}>
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded-full">{t.category}</span>
                                            <span className="text-[10px] text-slate-400">{new Date(t.timestamp).toLocaleDateString()}</span>
                                        </div>
                                        <h4 className="font-bold text-slate-800 mb-1">{t.title}</h4>
                                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-4">{t.content}</p>
                                    </div>
                                    <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                                        {/* Author & Live Reactions Summary */}
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="text-slate-400 font-medium">Verified by {t.doctorName}</span>
                                            <span className="text-slate-600 font-bold flex items-center gap-1.5">
                                                <span className="text-rose-500 flex items-center gap-0.5">
                                                    <Heart size={12} className="fill-rose-500" />
                                                </span>
                                                <span>{reactions.total} Reactions</span>
                                            </span>
                                        </div>

                                        {/* Live Real-time Emoji Reactions Bar */}
                                        <div className="flex items-center flex-wrap gap-1.5 py-0.5">
                                            {TIP_EMOJIS.map(emoji => {
                                                const count = reactions.counts[emoji] || 0;
                                                const isUserReacted = reactions.userEmoji === emoji;
                                                return (
                                                    <button
                                                        key={emoji}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            reactToTip(t.id, emoji, user.id);
                                                        }}
                                                        title={`React with ${emoji} (Current: ${count})`}
                                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all transform active:scale-95 ${
                                                            isUserReacted
                                                                ? 'bg-rose-50 border border-rose-300 text-rose-700 shadow-xs ring-1 ring-rose-300 scale-105'
                                                                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:border-slate-300'
                                                        }`}
                                                    >
                                                        <span className="text-sm leading-none">{emoji}</span>
                                                        <span className={`text-[11px] ${isUserReacted ? 'font-bold text-rose-700' : 'text-slate-500'}`}>
                                                            {count}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Comments & Real-Time Question Counting Button */}
                                        <button
                                            onClick={() => setSelectedTipForComments(t)}
                                            className="w-full flex items-center justify-between px-3.5 py-2 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold transition group/btn shadow-2xs mt-1"
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <MessageSquare size={13} className="text-blue-600" />
                                                <span>Comments ({counts.total})</span>
                                            </span>
                                            {counts.unansweredQuestions > 0 ? (
                                                <span className="bg-amber-500 text-white text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-2xs animate-pulse flex items-center gap-1">
                                                    <span>{counts.unansweredQuestions} {counts.unansweredQuestions === 1 ? 'Question' : 'Questions'}</span>
                                                </span>
                                            ) : counts.answeredQuestions > 0 ? (
                                                <span className="bg-emerald-600 text-white text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-2xs flex items-center gap-1">
                                                    <CheckCircle size={10} /> All Answered
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-blue-600 group-hover/btn:translate-x-0.5 transition-transform flex items-center gap-0.5 font-bold">
                                                    Reply &rarr;
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {wellnessTab === 'ACTIVITIES' && [...authoredActivities, ...MOCK_WELLNESS_ACTIVITIES].map((a: any, index) => (
                            <div key={a.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-emerald-400 transition group animate-in zoom-in-95 fade-in duration-300" style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}>
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-full">{a.type} • {a.concern || 'ALL'}</span>
                                    <span className="text-[10px] text-slate-400">{a.duration}</span>
                                </div>
                                <h4 className="font-bold text-slate-800 mb-1">{a.title}</h4>
                                <p className="text-xs text-slate-500 italic mb-4">{a.benefit}</p>
                                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                    <span className="text-[10px] text-slate-400">{a.ageGroup} Level</span>
                                    <span className="text-[10px] text-emerald-600 font-bold uppercase">{a.level}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- Wellness Content Creator Modal --- */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold">Add {wellnessTab.charAt(0) + wellnessTab.slice(1).toLowerCase()} Entry</h3>
                                <p className="text-slate-400 text-xs mt-1"> This will be visible to all regional patients instantly.</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="hover:text-red-400 transition"><XCircle /></button>
                        </div>
                        <div className="p-8 overflow-y-auto space-y-6 max-h-[80vh]">
                            {wellnessTab === 'REMEDIES' && (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div><label className="text-xs font-bold text-slate-400 uppercase">Season</label><select value={remedyForm.season} onChange={e => setRemedyForm({ ...remedyForm, season: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none"><option value={Season.SUMMER}>Summer</option><option value={Season.WINTER}>Winter</option><option value={Season.MONSOON}>Monsoon</option><option value={Season.ALL}>All Seasons</option></select></div>
                                        <div><label className="text-xs font-bold text-slate-400 uppercase">Primary Ailment</label><select value={remedyForm.ailment} onChange={e => setRemedyForm({ ...remedyForm, ailment: e.target.value })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none"><option>Cough & Cold</option><option>Indigestion</option><option>Dehydration</option><option>Fatigue</option><option>Muscle Pain</option></select></div>
                                    </div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase">Remedy Headline</label><input value={remedyForm.title} onChange={e => setRemedyForm({ ...remedyForm, title: e.target.value })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none" placeholder="e.g. Traditional Ginger Decoction" /></div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase">Preparation Steps (New line for each step)</label><textarea value={remedyForm.steps} onChange={e => setRemedyForm({ ...remedyForm, steps: e.target.value })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm min-h-[100px] outline-none" placeholder="1. Boil water..." /></div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase">Critical Safety Notes (Optional)</label><input value={remedyForm.safety} onChange={e => setRemedyForm({ ...remedyForm, safety: e.target.value })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none" placeholder="Not for children under 5." /></div>
                                </>
                            )}
                            {wellnessTab === 'TIPS' && (
                                <>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase">Focus Category</label><select value={tipForm.category} onChange={e => setTipForm({ ...tipForm, category: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none"><option>IMMUNITY</option><option>DIET</option><option>HYDRATION</option><option>SLEEP</option><option>HYGIENE</option></select></div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase">Tip Headline</label><input value={tipForm.title} onChange={e => setTipForm({ ...tipForm, title: e.target.value })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none" placeholder="e.g. Importance of Early Sleep" /></div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase">Daily Tip Advice</label><textarea value={tipForm.content} onChange={e => setTipForm({ ...tipForm, content: e.target.value })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm min-h-[120px] outline-none" placeholder="Provide actionable advice for patients..." /></div>
                                </>
                            )}
                            {wellnessTab === 'ACTIVITIES' && (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div><label className="text-xs font-bold text-slate-400 uppercase">Type</label><select value={activityForm.type} onChange={e => setActivityForm({ ...activityForm, type: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none"><option>YOGA</option><option>EXERCISE</option><option>BREATHING</option></select></div>
                                        <div><label className="text-xs font-bold text-slate-400 uppercase">Health Concern</label><select value={activityForm.concern} onChange={e => setActivityForm({ ...activityForm, concern: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none"><option>IMMUNITY</option><option>STRESS</option><option>BACK_PAIN</option><option>WEAKNESS</option><option>ALL</option></select></div>
                                    </div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase">Activity Title</label><input value={activityForm.title} onChange={e => setActivityForm({ ...activityForm, title: e.target.value })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none" placeholder="e.g. Surya Namaskar" /></div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div><label className="text-xs font-bold text-slate-400 uppercase">Duration</label><input value={activityForm.duration} onChange={e => setActivityForm({ ...activityForm, duration: e.target.value })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none" placeholder="e.g. 10 mins" /></div>
                                        <div><label className="text-xs font-bold text-slate-400 uppercase">Difficulty Level</label><select value={activityForm.level} onChange={e => setActivityForm({ ...activityForm, level: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm outline-none"><option>BEGINNER</option><option>INTERMEDIATE</option><option>ADVANCED</option></select></div>
                                    </div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase">Instructions (New line for each step)</label><textarea value={activityForm.steps} onChange={(e) => setActivityForm({ ...activityForm, steps: e.target.value })} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mt-1 text-sm min-h-[100px] outline-none" placeholder="1. Deep inhale..." /></div>
                                </>
                            )}
                            <button
                                onClick={handleWellnessPublish}
                                disabled={isPublishing}
                                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isPublishing ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                                Verify & Publish Entry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Instagram-Style Comments Sheet for Doctor */}
            {selectedTipForComments && (
                <TipCommentsModal
                    tip={selectedTipForComments}
                    isOpen={!!selectedTipForComments}
                    onClose={() => setSelectedTipForComments(null)}
                    currentUser={user}
                />
            )}
            <MobileBottomNav />
        </div>
    );







    const EmergencyBanner = () => {
        if (!incomingEmergency) return null;
        return (
            <div className="bg-red-600 text-white px-4 py-3 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 z-50 animate-pulse border-b-2 border-red-700">
                <div className="flex items-center gap-2 text-sm font-bold">
                    <AlertTriangle size={22} className="animate-bounce shrink-0 text-amber-300" />
                    <span>🚨 INCOMING EMERGENCY CALL from <strong className="underline decoration-white underline-offset-2">{incomingEmergency.patientName}</strong>!</span>
                    <span className="text-xs bg-red-800 px-2.5 py-1 rounded font-mono border border-red-500">Room: {incomingEmergency.roomId}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const callRoom = incomingEmergency.roomId;
                            const callPatId = incomingEmergency.patientId;
                            const callPatName = incomingEmergency.patientName;
                            setIncomingEmergency(null);
                            localStorage.removeItem('upchaar_last_emergency');
                            fetch('/api/emergency', { method: 'DELETE' }).catch(() => {});

                            if (onStartVideoCall) {
                                onStartVideoCall({
                                    roomId: callRoom,
                                    patientId: callPatId,
                                    patientName: callPatName,
                                    doctorId: user.id,
                                    doctorName: user.name,
                                    isEmergency: true
                                });
                            }
                        }}
                        className="px-4 py-2 bg-white hover:bg-emerald-50 text-emerald-700 rounded-lg text-xs font-black shadow-lg transition cursor-pointer flex items-center gap-1.5 ring-2 ring-white"
                    >
                        <Video size={16} className="text-emerald-600" /> Answer Video Call
                    </button>
                    <button
                        onClick={() => {
                            setIncomingEmergency(null);
                            localStorage.removeItem('upchaar_last_emergency');
                            fetch('/api/emergency', { method: 'DELETE' }).catch(() => {});
                        }}
                        className="px-3 py-2 bg-red-800 hover:bg-red-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        );
    };

    const renderAppointments = () => {
        const filteredAppts = appointments.filter(a => {
            if (appointmentFilter === 'VIDEO') return a.consultationType === 'ONLINE_VIDEO';
            if (appointmentFilter === 'IN_PERSON') return a.consultationType === 'IN_PERSON';
            return true;
        });

        const videoCount = appointments.filter(a => a.consultationType === 'ONLINE_VIDEO').length;
        const pendingCount = appointments.filter(a => a.status === 'SCHEDULED').length;

        return (
            <div className="h-full flex flex-col md:flex-row bg-slate-50 overflow-hidden">
                <div className="hidden md:flex h-full"><Sidebar /></div>
                <div className="flex-1 overflow-hidden flex flex-col">
                    <EmergencyBanner />
                    {/* Header */}
                    <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Video className="text-teal-600" size={24} />
                                Teleconsultations & Appointments
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Manage scheduled patient video appointments and clinic visits
                            </p>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                                <input
                                    type="text"
                                    placeholder="Enter Room Code..."
                                    value={manualRoomInput}
                                    onChange={(e) => setManualRoomInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && manualRoomInput.trim() && onStartVideoCall) {
                                            onStartVideoCall({
                                                roomId: manualRoomInput.trim(),
                                                patientId: 'P-MANUAL',
                                                patientName: 'Manual Teleconsultation',
                                                doctorId: user.id,
                                                doctorName: user.name,
                                                isEmergency: false
                                            });
                                        }
                                    }}
                                    className="px-2.5 py-1 text-xs bg-white rounded-lg border border-slate-200 outline-none w-36 font-mono text-slate-800 placeholder-slate-400"
                                />
                                <button
                                    onClick={() => {
                                        if (manualRoomInput.trim() && onStartVideoCall) {
                                            onStartVideoCall({
                                                roomId: manualRoomInput.trim(),
                                                patientId: 'P-MANUAL',
                                                patientName: 'Manual Teleconsultation',
                                                doctorId: user.id,
                                                doctorName: user.name,
                                                isEmergency: false
                                            });
                                        }
                                    }}
                                    disabled={!manualRoomInput.trim()}
                                    className="px-3 py-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                    <Video size={13} /> Join Call
                                </button>
                            </div>
                            <HeaderAvatar />
                        </div>
                    </div>

                    {/* Stats & Filter Bar */}
                    <div className="p-4 md:p-6 pb-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase">Total Scheduled</p>
                                    <p className="text-2xl font-black text-slate-800">{appointments.length}</p>
                                </div>
                                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><FileText size={20} /></div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-teal-600 uppercase">Video Teleconsultations</p>
                                    <p className="text-2xl font-black text-teal-700">{videoCount}</p>
                                </div>
                                <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl"><Video size={20} /></div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-amber-600 uppercase">Pending Calls</p>
                                    <p className="text-2xl font-black text-amber-700">{pendingCount}</p>
                                </div>
                                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl"><Clock size={20} /></div>
                            </div>
                        </div>

                        {/* Filter tabs */}
                        <div className="flex gap-2 border-b border-slate-200 pb-2">
                            {(['ALL', 'VIDEO', 'IN_PERSON'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setAppointmentFilter(tab)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                        appointmentFilter === tab
                                            ? 'bg-teal-600 text-white shadow-sm'
                                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    {tab === 'ALL' ? 'All Bookings' : tab === 'VIDEO' ? '📹 Video Calls' : '🏥 In-Person Visits'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Appointments List */}
                    <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-24 md:pb-6 space-y-3">
                        {filteredAppts.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                                <Video className="mx-auto text-slate-300 mb-2" size={40} />
                                <h4 className="font-bold text-slate-700">No scheduled appointments found</h4>
                                <p className="text-xs text-slate-400 mt-1">When patients book a video call or clinic visit, it appears here instantly.</p>
                            </div>
                        ) : (
                            filteredAppts.map(apt => (
                                <div
                                    key={apt.id}
                                    className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-teal-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                                            apt.consultationType === 'ONLINE_VIDEO' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {apt.consultationType === 'ONLINE_VIDEO' ? <Video size={22} /> : <Stethoscope size={22} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-base text-slate-800">{apt.patientName}</h4>
                                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                                    apt.consultationType === 'ONLINE_VIDEO'
                                                        ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                                        : 'bg-slate-100 text-slate-700'
                                                }`}>
                                                    {apt.consultationType === 'ONLINE_VIDEO' ? 'Video Teleconsultation' : 'In-Person'}
                                                </span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                    apt.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                    {apt.status}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Date: <strong className="text-slate-700">{new Date(apt.date).toLocaleDateString()}</strong> • Time: <strong className="text-teal-700">{apt.timeSlot || '10:00 AM - 10:30 AM'}</strong> • Facility: <strong>{apt.hospitalName || 'Online'}</strong>
                                            </p>
                                            {apt.meetingRoomId && (
                                                <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                                                    Meeting Room: <span className="text-teal-600 font-bold">{apt.meetingRoomId}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                        {apt.consultationType === 'ONLINE_VIDEO' && apt.status !== 'COMPLETED' && (
                                            <button
                                                onClick={() => {
                                                    if (onStartVideoCall) {
                                                        onStartVideoCall({
                                                            roomId: apt.meetingRoomId || `room-${apt.id}`,
                                                            appointmentId: apt.id,
                                                            patientId: apt.patientId,
                                                            patientName: apt.patientName,
                                                            doctorId: user.id,
                                                            doctorName: user.name,
                                                            isEmergency: false
                                                        });
                                                    }
                                                }}
                                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
                                            >
                                                <Video size={16} /> Start Video Call
                                            </button>
                                        )}

                                        {apt.status !== 'COMPLETED' ? (
                                            <button
                                                onClick={() => {
                                                    if (onUpdateAppointment) {
                                                        onUpdateAppointment({ ...apt, status: 'COMPLETED' });
                                                    }
                                                }}
                                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                                                title="Mark as Completed"
                                            >
                                                <CheckCircle size={14} className="inline mr-1 text-emerald-600" /> Done
                                            </button>
                                        ) : (
                                            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-xl">
                                                <CheckCircle size={14} /> Completed
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <MobileBottomNav />
            </div>
        );
    };

    // --- EXISTING DASHBOARDS (FROZEN CLINICAL FUNCTIONALITY) ---
    if (currentView === 'APPOINTMENTS') return renderAppointments();
    if (currentView === 'WELLNESS_MGMT') return renderWellnessMgmt();

    if (currentView === 'PREDICTIVE') {
        return (
            <div className="h-full flex flex-col md:flex-row bg-slate-50 overflow-hidden">
                <div className="hidden md:flex h-full"><Sidebar /></div>
                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center gap-2">
                            <button className="md:hidden p-1.5 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full transition" onClick={() => setCurrentView('ACTIVE_CASES')}>
                                <svg xmlns="http://www.w0.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                            </button>
                            <h2 className="font-semibold text-slate-800">Analytics Dashboard</h2>
                        </div>
                        <HeaderAvatar />
                    </div>
                    <div className="flex-1 overflow-y-auto pb-20 md:pb-0 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <PredictiveAlerts patients={patients} />
                    </div>
                </div>
                <MobileBottomNav />
            </div>
        );
    }

    if (currentView === 'PROFILE') {
        return (
            <div className="h-full flex flex-col md:flex-row bg-slate-50 overflow-hidden">
                <div className="hidden md:flex h-full"><Sidebar /></div>
                <div className="flex-1 overflow-hidden flex flex-col pb-20 md:pb-0">
                    <div className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center gap-2">
                            <button className="md:hidden p-1.5 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full transition" onClick={() => setCurrentView('ACTIVE_CASES')}>
                                <svg xmlns="http://www.w0.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                            </button>
                            <h2 className="font-semibold text-slate-800">My Profile</h2>
                        </div>
                        <HeaderAvatar />
                    </div>
                    <div className="flex-1 p-8 overflow-y-auto bg-slate-50 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-gradient-to-r from-slate-800 to-slate-900 h-32 relative">
                                <div className="absolute top-4 right-4"><span className="bg-white/10 text-white text-xs font-bold px-2 py-1 rounded border border-white/20 backdrop-blur-sm">VERIFIED DOCTOR</span></div>
                            </div>
                            <div className="px-8 pb-8">
                                <div className="relative -mt-16 mb-6 inline-block group">
                                    <div className="w-32 h-32 rounded-full bg-white p-1 shadow-xl relative overflow-hidden">
                                        <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center text-4xl font-bold text-slate-500 border-4 border-white overflow-hidden relative">
                                            {profilePhoto ? <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" /> : user.name.charAt(4)}
                                            {isUploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10"><Loader2 className="w-8 h-8 text-white animate-spin" /></div>}
                                        </div>
                                    </div>
                                    <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-1 right-1 p-2 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition border-2 border-white"><Camera size={16} /></button>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg, image/png" onChange={handlePhotoSelect} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
                                    <div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1"><User size={12} /> Full Name</label><p className="text-xl font-bold text-slate-900">{user.name}</p></div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1"><Activity size={12} /> Doctor ID</label><p className="text-lg font-mono text-slate-700 bg-slate-100 inline-block px-2 rounded">{user.id}</p></div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1"><Briefcase size={12} /> Specialization</label><div className="flex items-center gap-2"><span className="bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-sm font-bold border border-emerald-200">{user.specialization}</span></div></div>
                                    <div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1"><Phone size={12} /> Mobile Number</label><p className="text-lg text-slate-700 font-medium">{user.mobileNumber || 'Not Registered'}</p></div>
                                    <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1"><MapPin size={12} /> Hospital / Clinic</label><div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center gap-3"><div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 shadow-sm border border-slate-100"><Truck size={20} /></div><div><p className="text-slate-800 font-semibold">{user.hospital}</p><p className="text-xs text-slate-500">Authorized Medical Center</p></div></div></div>
                                </div>
                                <div className="mt-10 pt-6 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400"><span>Account Status: <span className="text-emerald-600 font-bold">Active</span></span><span>Last Login: {new Date().toLocaleDateString()}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
                <MobileBottomNav />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50 md:flex-row overflow-hidden relative animate-in fade-in duration-500">
            <Sidebar />
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <EmergencyBanner />
                <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
                    <div className="w-full md:w-1/3 lg:w-1/4 bg-white border-r border-slate-200 flex flex-col h-full z-10 pb-20 md:pb-0">
                <div className="p-4 border-b border-slate-200 shrink-0 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex justify-between items-center mb-4 md:hidden">
                        <span className="font-bold text-slate-900 text-lg tracking-tight">{user.name}</span>
                        <div className="flex gap-2 items-center">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                                <span className="text-xs font-bold text-slate-600">{user.name.charAt(4)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">Patient Queue</h2>
                        {onResetCases && (
                            <button
                                onClick={onResetCases}
                                title="Reset queue to clean mock cases (clears stale test sessions)"
                                className="text-[11px] font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 px-2 py-1 rounded-lg transition flex items-center gap-1 shadow-2xs"
                            >
                                <RotateCcw size={12} /> Reset Queue
                            </button>
                        )}
                    </div>
                    <div className="mt-3 flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                        <button onClick={() => setFilter('ALL')} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filter === 'ALL' ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All ({cases.length})</button>
                        <button onClick={() => setFilter('PENDING')} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filter === 'PENDING' ? 'bg-amber-500 text-white shadow-md' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>Pending ({cases.filter(c => c.status === CaseStatus.PENDING_APPROVAL || c.status === CaseStatus.OPEN).length})</button>
                        <button onClick={() => setFilter('CRITICAL')} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filter === 'CRITICAL' ? 'bg-red-500 text-white shadow-md' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}>Critical ({cases.filter(c => c.severity === CaseSeverity.CRITICAL).length})</button>
                        <button onClick={() => setFilter('COMPLETED')} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filter === 'COMPLETED' ? 'bg-emerald-600 text-white shadow-md' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>Completed ({cases.filter(c => c.status === CaseStatus.APPROVED || c.status === CaseStatus.COMPLETED).length})</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto pb-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    {filteredCases.length === 0 ? (<div className="p-8 text-center text-slate-400 text-sm animate-in fade-in zoom-in-95 duration-300">No cases found</div>) : (
                        filteredCases.map((c, index) => {
                            const patient = patients.find(p => p.id === c.patientId);
                            return (
                                <div key={c.id} onClick={() => setSelectedCase(c)} className={`p-4 border-b border-slate-100 cursor-pointer transition-all duration-300 animate-in fade-in slide-in-from-right-4 hover:bg-slate-50 group relative ${selectedCase?.id === c.id ? 'bg-emerald-50 border-emerald-200 shadow-inner' : ''}`} style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-slate-800 line-clamp-1 flex-1 pr-2">{c.patientName}</span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-xs font-medium text-slate-400">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            {onDeleteCase && (
                                                <button
                                                    onClick={(e) => handleDeleteCaseClick(c.id, e)}
                                                    title="Dismiss case from queue"
                                                    className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-600 rounded transition"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 mb-2 font-mono bg-slate-50 inline-flex px-2 py-0.5 rounded border border-slate-100">
                                        <span>{c.patientId}</span><span>•</span><span>{patient?.age || '45'} Yrs</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-black uppercase tracking-widest shadow-sm shrink-0 ${c.severity === 'CRITICAL' ? 'bg-red-500 text-white ring-2 ring-red-100' :
                                            c.severity === 'MODERATE' ? 'bg-amber-100 text-amber-800' :
                                                c.severity === 'MILD' ? 'bg-emerald-100 text-emerald-800' :
                                                    'bg-slate-100 text-slate-600'
                                            }`}>{c.severity}</span>
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border shrink-0 bg-blue-50 text-blue-700 border-blue-100">{c.mode || 'ONLINE'}</span>
                                        {c.status === 'APPROVED' && <span className="text-[10px] text-emerald-600 font-bold ml-auto flex items-center gap-1 shrink-0"><CheckCircle size={10} />Sent</span>}
                                    </div>
                                    <p className="text-xs text-slate-600 line-clamp-1 italic">{c.aiDiagnosis}</p>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 absolute md:relative inset-0 bg-slate-50 z-20 md:z-auto ${selectedCase ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
                <div className="h-16 bg-white border-b border-slate-200 flex items-center px-4 md:px-6 justify-between shrink-0 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex gap-4 md:gap-6 items-center">
                        <button className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-800 bg-slate-100 rounded-full" onClick={() => setSelectedCase(null)}>
                            <svg xmlns="http://www.w0.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        </button>
                        <div className="flex items-center gap-2"><div className="p-1.5 bg-red-100 text-red-600 rounded-lg"><AlertTriangle size={16} /></div><div><p className="text-[10px] font-bold text-slate-500 uppercase">Critical</p><p className="text-sm font-black leading-none">{stats.criticalPending}</p></div></div>
                        <div className="hidden sm:flex items-center gap-2"><div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg"><Truck size={16} /></div><div><p className="text-[10px] font-bold text-slate-500 uppercase">Deliveries</p><p className="text-sm font-black leading-none">{stats.deliveriesInProgress}</p></div></div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden lg:flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                            <input
                                type="text"
                                placeholder="Join Room by Code..."
                                value={manualRoomInput}
                                onChange={(e) => setManualRoomInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && manualRoomInput.trim() && onStartVideoCall) {
                                        onStartVideoCall({
                                            roomId: manualRoomInput.trim(),
                                            patientId: 'P-MANUAL',
                                            patientName: 'Manual Teleconsultation',
                                            doctorId: user.id,
                                            doctorName: user.name,
                                            isEmergency: false
                                        });
                                    }
                                }}
                                className="px-2.5 py-1 text-xs bg-white rounded-lg border border-slate-200 outline-none w-36 font-mono text-slate-800 placeholder-slate-400"
                            />
                            <button
                                onClick={() => {
                                    if (manualRoomInput.trim() && onStartVideoCall) {
                                        onStartVideoCall({
                                            roomId: manualRoomInput.trim(),
                                            patientId: 'P-MANUAL',
                                            patientName: 'Manual Teleconsultation',
                                            doctorId: user.id,
                                            doctorName: user.name,
                                            isEmergency: false
                                        });
                                    }
                                }}
                                disabled={!manualRoomInput.trim()}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                title="Directly join room by code"
                            >
                                <Video size={13} /> Join Call
                            </button>
                        </div>
                        <div className="hidden md:block"><HeaderAvatar /></div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50 pb-20 md:pb-6 relative smooth-scroll">
                    {selectedCase ? (
                        <div className="max-w-6xl mx-auto h-full flex flex-col gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 shrink-0 transition-all hover:shadow-md">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
                                    <div className="flex items-center gap-3 md:gap-4"><div className="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-slate-100 rounded-full flex items-center justify-center text-lg md:text-xl font-bold text-slate-500">{selectedCase.patientName?.charAt(0) || 'P'}</div><div><h1 className="text-lg md:text-xl font-bold text-slate-800">{selectedCase.patientName}</h1><p className="text-slate-500 text-[10px] md:text-sm flex flex-wrap items-center gap-x-2 gap-y-1 mt-1"><span className="bg-slate-100 px-1.5 md:px-2 py-0.5 rounded text-slate-600 font-mono">{selectedCase.id}</span><span className="hidden md:inline">•</span><span className="font-semibold">{patients.find(p => p.id === selectedCase.patientId)?.age || 'Unknown'} Yrs</span><span className="hidden md:inline">•</span><span className="capitalize">{patients.find(p => p.id === selectedCase.patientId)?.gender?.substring(0, 1) || 'N/A'}</span><span className="hidden md:inline">•</span><span className="flex items-center gap-1 w-full md:w-auto mt-1 md:mt-0"><MapPin size={10} className="md:w-3 md:h-3" /> {selectedCase.patientLocation?.address || 'Location Unknown'}</span></p></div></div>
                                    <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto max-w-full">
                                        {selectedCase.severity === CaseSeverity.CRITICAL && (
                                            <div className="flex items-center gap-1 md:gap-2 bg-red-100 text-red-700 px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[10px] md:text-xs font-bold animate-pulse ring-2 ring-red-500/20 shrink-0">
                                                <ShieldAlert size={12} className="md:w-3.5 md:h-3.5" /> ESCALATED TO DOCTOR
                                            </div>
                                        )}
                                        <div className="text-left md:text-right shrink-0"><span className={`inline-flex items-center gap-1 md:gap-1.5 px-2.5 py-1 md:px-3 rounded-full text-[10px] md:text-sm font-medium ${selectedCase.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : selectedCase.status === 'OPEN' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{selectedCase.status === 'APPROVED' ? <CheckCircle size={12} className="md:w-3.5 md:h-3.5" /> : <Clock size={12} className="md:w-3.5 md:h-3.5" />}{selectedCase.status.replace('_', ' ')}</span></div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 grid md:grid-cols-2 gap-4 min-h-0">
                                <div className="flex flex-col gap-4 overflow-hidden">
                                    {selectedCase.audioUrl && (
                                        <div className="bg-slate-900 rounded-xl p-4 text-white shadow-lg shrink-0">
                                            <div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Voice Recording</span><span className="text-xs font-mono text-emerald-400">00:45 / 00:45</span></div>
                                            <div className="flex items-center gap-4"><button onClick={toggleAudio} className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center hover:bg-emerald-400 transition">{isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current ml-1" />}</button><div className="flex-1"><div className="h-10 flex items-center gap-0.5 opacity-50">{[...Array(20)].map((_, i) => (<div key={i} className="flex-1 bg-white rounded-full" style={{ height: `${Math.random() * 100}%` }}></div>))}</div></div></div>
                                            <audio key={selectedCase.audioUrl} ref={audioRef} src={selectedCase.audioUrl} onEnded={handleAudioEnded} className="hidden" />
                                        </div>
                                    )}
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden">
                                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center"><h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2"><FileText size={16} /> Transcript</h3><span className="text-xs text-slate-400">AI-Transcribed • {selectedCase.audioUrl ? 'Audio-to-Text' : 'Chat Log'}</span></div>
                                        <div className="p-4 overflow-y-auto flex-1 space-y-4">{selectedCase.transcript && Array.isArray(selectedCase.transcript) && selectedCase.transcript.length > 0 ? (selectedCase.transcript.map((msg, idx) => (<div key={idx} className={`flex ${msg.role === 'model' ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[85%] p-3 rounded-lg text-sm ${msg.role === 'model' ? 'bg-slate-100 text-slate-700 rounded-tl-none' : 'bg-blue-50 text-blue-900 border border-blue-100 rounded-tr-none'}`}><span className="block text-[10px] font-bold mb-1 opacity-50 uppercase">{msg.role === 'model' ? 'AI Assistant' : 'Patient'}</span>{highlightSymptoms(msg.text)}</div></div>))) : (<p className="text-slate-400 text-center italic text-sm mt-10">No transcript available.</p>)}</div>

                                        {selectedCase.severity === CaseSeverity.CRITICAL && (
                                            <div className="p-4 bg-red-50 border-t border-red-100 flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-red-700 text-xs font-bold">
                                                    <ShieldAlert size={16} /> Critical Priority Interaction Needed
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (onStartVideoCall && selectedCase) {
                                                                onStartVideoCall({
                                                                    roomId: `case-${selectedCase.id}`,
                                                                    patientId: selectedCase.patientId,
                                                                    patientName: selectedCase.patientName,
                                                                    doctorId: user.id,
                                                                    doctorName: user.name,
                                                                    isEmergency: selectedCase.severity === CaseSeverity.CRITICAL,
                                                                    symptoms: selectedCase.symptoms,
                                                                    diagnosis: selectedCase.aiDiagnosis,
                                                                    prescription: selectedCase.prescription
                                                                });
                                                            }
                                                        }}
                                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer"
                                                        title="Launch Video Teleconsultation"
                                                    >
                                                        <Video size={14} /> Start Video Call
                                                    </button>
                                                    <a
                                                        href={`tel:${selectedCase.patientId?.replace(/^P-/, '') || '9460877984'}`}
                                                        className="px-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition flex items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer"
                                                        title="Direct Phone Call to Patient"
                                                    >
                                                        <Phone size={14} /> Direct Call
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-4 overflow-hidden">
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden">
                                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center"><h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2"><Brain size={16} className="text-purple-600" /> Clinical Assessment</h3><span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${selectedCase.severity === 'CRITICAL' ? 'bg-red-600 text-white' :
                                            selectedCase.severity === 'MODERATE' ? 'bg-amber-100 text-amber-700' :
                                                'bg-emerald-100 text-emerald-700'
                                            }`}>{selectedCase.severity}</span></div>
                                        <div className="p-4 space-y-4 overflow-y-auto flex-1">
                                            <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                                                <label className="text-xs font-bold text-purple-400 uppercase block mb-1">AI Diagnosis & Predicted Severity</label>
                                                <p className="text-purple-900 font-medium text-sm mb-2">{selectedCase.aiDiagnosis}</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1 flex-1 bg-purple-200 rounded-full overflow-hidden">
                                                        <div className={`h-full ${selectedCase.severity === 'CRITICAL' ? 'w-full bg-red-500' :
                                                            selectedCase.severity === 'MODERATE' ? 'w-2/3 bg-amber-500' :
                                                                selectedCase.severity === 'MILD' ? 'w-1/3 bg-emerald-500' : 'w-5 bg-slate-400'
                                                            }`}></div>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-purple-600">{selectedCase.severity} CONDITION</span>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1 mb-2">
                                                    <Edit2 size={12} /> Prescription Editor (Includes AI Suggestions)
                                                </label>
                                                <textarea
                                                    value={prescriptionEdit}
                                                    onChange={(e) => setPrescriptionEdit(e.target.value)}
                                                    disabled={selectedCase.status === 'APPROVED'}
                                                    className={`w-full border rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none min-h-[160px] font-mono placeholder-slate-400 ${selectedCase.status === 'APPROVED' ? 'bg-slate-700 border-slate-600 opacity-75' : 'bg-slate-800 border-slate-700'}`}
                                                    placeholder="Enter medicines and care instructions..."
                                                />
                                                <p className="mt-2 text-[10px] text-slate-400 italic flex items-center gap-1">
                                                    <ShieldAlert size={10} /> Clinical Decision Support: AI recommendations are advisory. Doctor is final authority.
                                                </p>
                                            </div>

                                            {selectedCase.status === 'APPROVED' ? (
                                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                                                    <h4 className="text-sm font-bold text-emerald-800 mb-2 flex items-center gap-2"><Truck size={14} /> Delivery Tracking</h4>

                                                    {/* PART 2: LIVE DELIVERY MAP (PATIENT QUEUE) */}
                                                    <div className="rounded-xl border border-emerald-200 overflow-hidden h-40 bg-white mb-3 relative group">
                                                        <div ref={deliveryMapContainerRef} className="absolute inset-0 z-0"></div>
                                                        <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded text-[10px] shadow-sm font-bold flex items-center gap-1 text-emerald-600 z-10 animate-pulse">
                                                            <Navigation size={10} /> LIVE TRACKING
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between text-[10px] font-medium text-emerald-600 relative mb-2"><div className="absolute top-2 left-0 w-full h-0.5 bg-emerald-200 -z-10"></div><div className="flex flex-col items-center gap-1 bg-emerald-50 px-1"><div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white">✓</div><span>Approved</span></div><div className="flex flex-col items-center gap-1 bg-emerald-50 px-1"><div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white animate-pulse">●</div><span>Out for Delivery</span></div><div className="flex flex-col items-center gap-1 bg-emerald-50 px-1 opacity-50"><div className="w-4 h-4 rounded-full bg-emerald-200"></div><span>Delivered</span></div></div>
                                                    <div className="mt-3 text-xs text-emerald-700 flex justify-between"><span>Approved at: {new Date(selectedCase.approvalTimestamp || Date.now()).toLocaleTimeString()}</span><span>ETA: {currentEta}</span></div>
                                                </div>
                                            ) : (
                                                <div className="rounded-lg border border-slate-200 overflow-hidden relative h-32 bg-slate-100 group shadow-inner">
                                                    {/* MAP CONTAINER FOR PENDING CASES (Verify Address State) */}
                                                    <div ref={deliveryMapContainerRef} className="absolute inset-0 z-0 opacity-40 grayscale hover:grayscale-0 transition-all duration-500"></div>
                                                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 gap-1 z-10 pointer-events-none drop-shadow-sm"><MapPin size={24} className="mb-1" /><span className="text-xs font-bold uppercase tracking-wider">Verify Location</span></div>
                                                    <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded text-[10px] shadow-sm font-medium flex items-center gap-1 text-slate-600 z-10 border border-slate-200"><Clock size={10} /> Est. Delivery: 20-40 mins</div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex flex-col sm:flex-row gap-3">
                                            <button onClick={handleApproveClick} disabled={selectedCase.status === CaseStatus.APPROVED} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20 text-sm md:text-base"><CheckCircle size={18} />{selectedCase.status === CaseStatus.APPROVED ? 'Approved & Locked' : 'Approve & Dispatch'}</button>
                                            <button onClick={() => onUpdateStatus(selectedCase.id, CaseStatus.REJECTED)} disabled={selectedCase.status === CaseStatus.APPROVED} className="w-full sm:w-auto px-4 py-2 sm:py-0 border border-red-200 text-red-600 bg-white rounded-lg hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base">Reject</button>
                                            {onDeleteCase && (
                                                <button
                                                    onClick={() => handleDeleteCaseClick(selectedCase.id)}
                                                    className="w-full sm:w-auto px-4 py-2 sm:py-0 border border-slate-200 text-slate-600 bg-white rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition text-sm md:text-base flex items-center justify-center gap-1.5"
                                                    title="Dismiss / remove case from queue"
                                                >
                                                    <Trash2 size={16} /> Dismiss Case
                                                </button>
                                            )}
                                        </div>

                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400"><Search className="w-16 h-16 mb-4 opacity-10" /><p className="text-lg font-medium text-slate-500">No Case Selected</p><p className="text-sm">Select a patient from the queue to review details.</p></div>
                    )}
                </div>
            </div>
            </div>
            </div>
            {showConfirmModal && selectedCase && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-emerald-600 p-4 text-white"><h3 className="text-lg font-bold flex items-center gap-2"><Truck className="w-5 h-5" /> Confirm Dispatch</h3></div>
                        <div className="p-6"><p className="text-slate-600 mb-4">You are about to approve the prescription for <strong>{selectedCase.patientName}</strong>.</p><div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm text-slate-700 mb-4 max-h-32 overflow-y-auto"><span className="block text-xs font-bold text-slate-400 uppercase mb-1">Prescription Summary:</span><pre className="whitespace-pre-wrap font-sans">{prescriptionEdit}</pre></div><div className="flex items-center gap-3 text-sm text-slate-600 mb-6"><MapPin size={16} /><span>Deliver to: {selectedCase.patientLocation?.address}</span></div><div className="flex gap-3"><button onClick={() => setShowConfirmModal(false)} className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">Cancel</button><button onClick={confirmDispatch} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium shadow-lg shadow-emerald-600/20">Confirm & Send</button></div></div>
                    </div>
                </div>
            )}
            <MobileBottomNav />
        </div>
    );
};

export default DoctorDashboard;
