
import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Mic, MapPin, Loader2, Camera, ShieldCheck, LogOut,
  MessageSquare, Video, Phone, Star, Activity, ArrowLeft, History,
  Home, Volume2, Calendar, Truck, UserPlus, Image as ImageIcon,
  CreditCard, Banknote, Navigation, Smartphone, CheckCircle,
  Leaf, Sun, Snowflake, CloudRain, Zap, Heart, Info, ThumbsUp,
  ExternalLink, Smile, Search, Pill, FlaskConical, Ambulance, Building, Clock, VolumeX, Stethoscope
} from 'lucide-react';
import { Message, CaseSeverity, MedicalCase, CaseStatus, User, Appointment, Hospital, Season, HomeRemedy, HealthTip, WellnessActivity, ActiveVideoSession } from '../types';
import { startNewChat, analyzeCase, TriageResult, getRealNearbyHospitals, searchIndianLocation, reverseGeocodeLocality } from '../services/geminiService';
import { UniversalChatSession } from '../services/aiService';
import { playRealisticVoice, stopRealisticVoice, setVoiceStateListener } from '../services/voiceService';

import { MOCK_REMEDIES, MOCK_HEALTH_TIPS, MOCK_WELLNESS_ACTIVITIES } from '../services/mockData';
import TipCommentsModal from './TipCommentsModal';
import {
  getTipCommentCounts,
  subscribeToTipComments,
  getTipReactions,
  subscribeToTipReactions,
  reactToTip,
  TIP_EMOJIS
} from '../services/tipCommentsService';
import Logo from './Logo';


// Declare Leaflet global for TypeScript
declare const L: any;

interface PatientPortalProps {
  user: User;
  patientHistory?: MedicalCase[];
  appointments?: Appointment[];
  onSubmitCase: (newCase: MedicalCase) => void;
  onBookAppointment: (appt: Appointment) => void;
  onStartVideoCall?: (session: ActiveVideoSession) => void;
  onLogout: () => void;
}

const FULL_EMOJI_LIST = [
  '❤️', '😘', '👍', '😂', '😑', '🔥', '😍', '🙃', '🤣',
  '🙄', '😐', '😞', '😅', '😶', '✨', '🫠', '😶', '😮',
  '🤤', '🫣', '🥹', '😁', '❣️', '😔', '😬', '🎉', '🌦️',
  '💯', '👎', '😠', '🙏', '🤯', '😓', '🎊', '😰', '🙌'
];

type ViewState = 'HOME' | 'CONSULT_CHAT' | 'CONSULT_VOICE' | 'TRIAGE_RESULT' | 'FEEDBACK' | 'HISTORY' | 'BOOK_APPOINTMENT' | 'LOCATE_NEARBY' | 'DOCTOR_CONNECT' | 'HOME_REMEDIES' | 'WELLNESS_HUB' | 'DOCTOR_TIPS';

const PatientPortal: React.FC<PatientPortalProps> = ({ user, patientHistory = [], appointments = [], onSubmitCase, onBookAppointment, onStartVideoCall, onLogout }) => {
  const [currentView, setCurrentView] = useState<ViewState>('HOME');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatSession, setChatSession] = useState<UniversalChatSession | null>(null);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [patientManualRoom, setPatientManualRoom] = useState('');

  // Doctor Tips Interaction State
  const [tipReactions, setTipReactions] = useState<Record<string, string>>({});
  const [tipComments, setTipComments] = useState<Record<string, Array<{ id: string, text: string, author: string, time: string }>>>({
    'T-001': [
      { id: 'c1', text: 'This is very helpful! I will try to get some sun tomorrow morning.', author: 'Ramesh Kumar', time: '2 hours ago' },
      { id: 'c2', text: 'Does it have to be direct sunlight or works through a window?', author: 'Sunita Devi', time: '1 hour ago' },
      { id: 'c3', text: 'Dr. Sharma, can I get sunlight in the evening instead?', author: 'Vikram Singh', time: '45 mins ago' },
      { id: 'c4', text: 'I started doing this and my energy levels are much better.', author: 'Anita Kaur', time: '15 mins ago' }
    ],
    'T-002': [
      { id: 'c5', text: 'I started doing this last week and my acidity is completely gone. Thank you doctor!', author: 'Gurpreet Singh', time: '5 hours ago' },
      { id: 'c6', text: 'Is 7 PM a good time for dinner?', author: 'Balwinder Singh', time: '3 hours ago' },
      { id: 'c7', text: 'Tried it yesterday, definitely slept better!', author: 'Priya Sharma', time: 'Just now' }
    ],
    'T-003': [
      { id: 'c8', text: 'I always forget to drink water, keeping a pot nearby is a great idea.', author: 'Ramesh Kumar', time: '1 day ago' },
      { id: 'c9', text: 'Should the water be cold or room temperature?', author: 'Sunita Devi', time: '12 hours ago' }
    ]
  });
  const [activeTipComments, setActiveTipComments] = useState<string | null>(null);
  const [activeReactionDrawer, setActiveReactionDrawer] = useState<string | null>(null);
  const [activeExpandedEmojiPicker, setActiveExpandedEmojiPicker] = useState<string | null>(null);
  const [, setCommentCountsVersion] = useState(0);
  const [, setReactionsVersion] = useState(0);

  // Live real-time sync comments & emoji reactions between Doctor Dashboard & Patient Portal
  useEffect(() => {
    const unsubComments = subscribeToTipComments(() => {
      setCommentCountsVersion(v => v + 1);
    });
    const unsubReactions = subscribeToTipReactions(() => {
      setReactionsVersion(v => v + 1);
    });
    return () => {
      unsubComments();
      unsubReactions();
    };
  }, []);

  const [commentInput, setCommentInput] = useState('');
  const [showCommentEmojiPicker, setShowCommentEmojiPicker] = useState(false);

  const [selectedRemedy, setSelectedRemedy] = useState<HomeRemedy | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<WellnessActivity | null>(null);
  const [remedySeasonFilter, setRemedySeasonFilter] = useState<'AUTO' | 'ALL' | 'SUMMER' | 'MONSOON' | 'WINTER'>('AUTO');
  const [wellnessCategoryFilter, setWellnessCategoryFilter] = useState<'ALL' | 'ELDERLY' | 'ADULTS'>('ALL');

  // Remedy UI interactions state
  const [likedRemedies, setLikedRemedies] = useState<Record<string, boolean>>({});
  const [remedyLikeCounts, setRemedyLikeCounts] = useState<Record<string, number>>({});
  const [ratingInputFor, setRatingInputFor] = useState<string | null>(null);
  const [ratedRemedies, setRatedRemedies] = useState<Record<string, number>>({});

  const getInitialLikes = (id: string) => {
    return 100 + (id.length * 7);
  };

  const handleLikeRemedy = (id: string) => {
    if (likedRemedies[id]) return;
    setLikedRemedies(prev => ({ ...prev, [id]: true }));
    setRemedyLikeCounts(prev => ({
      ...prev,
      [id]: (prev[id] !== undefined ? prev[id] : getInitialLikes(id)) + 1
    }));
  };

  const handleSubmitRating = (id: string, rating: number) => {
    setRatedRemedies(prev => ({ ...prev, [id]: rating }));
    setRatingInputFor(id);

    // Auto-hide the success message after 2.5 seconds
    setTimeout(() => {
      setRatingInputFor(prev => prev === id ? null : prev);
    }, 2500);
  };
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const [apptDate, setApptDate] = useState('');
  const [apptTimeSlot, setApptTimeSlot] = useState('10:00 AM - 10:30 AM');
  const [consultationType, setConsultationType] = useState<'ONLINE_VIDEO' | 'IN_PERSON'>('ONLINE_VIDEO');
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [apptDoctor, setApptDoctor] = useState('Dr. A. Sharma (General Physician)');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CARD' | 'CASH'>('UPI');
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null); // Added this missing state

  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [nearbyHospitals, setNearbyHospitals] = useState<Hospital[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [detectedPlaceName, setDetectedPlaceName] = useState<string>('');
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [facilityTypeFilter, setFacilityTypeFilter] = useState<'ALL' | 'HOSPITAL' | 'CLINIC' | 'PHARMACY' | 'PATHOLOGY_LAB' | 'AMBULANCE_HUB' | 'AYURVEDA'>('ALL');
  const [isVoiceSpeaking, setIsVoiceSpeaking] = useState(false);
  const [speechInputLang, setSpeechInputLang] = useState('hi-IN');

  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersGroupRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentView === 'LOCATE_NEARBY' && mapContainerRef.current && !mapRef.current) {
      if (typeof window === 'undefined' || !(window as any).L) return;
      const L = (window as any).L;

      const userLat = Number(userLocation?.lat);
      const userLng = Number(userLocation?.lng);
      const defaultPos: [number, number] = (!isNaN(userLat) && !isNaN(userLng) && userLat !== 0)
        ? [userLat, userLng]
        : [26.5786, 74.8698];

      try {
        mapRef.current = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false
        }).setView(defaultPos, 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
        markersGroupRef.current = L.layerGroup().addTo(mapRef.current);

        if (nearbyHospitals.length > 0) {
          updateMapMarkers(nearbyHospitals, userLocation || undefined);
        } else {
          detectLocation();
        }
      } catch (e) {
        console.warn('Patient portal Leaflet map caught:', e);
      }
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [currentView]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const updateMapMarkers = (hospitals: Hospital[], userLoc?: { lat: number, lng: number }) => {
    if (!markersGroupRef.current || !mapRef.current) return;
    markersGroupRef.current.clearLayers();

    if (userLoc && !isNaN(userLoc.lat) && !isNaN(userLoc.lng)) {
      const userIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      L.marker([userLoc.lat, userLoc.lng], { icon: userIcon }).addTo(markersGroupRef.current);
    }

    hospitals.forEach(h => {
      const hLat = Number(h.lat);
      const hLng = Number(h.lng);

      if (!isNaN(hLat) && !isNaN(hLng)) {
        const hospitalIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div class="text-red-500"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="white" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 24]
        });

        L.marker([hLat, hLng], { icon: hospitalIcon })
          .bindPopup(`<b>${h.name}</b><br>${h.address}`)
          .addTo(markersGroupRef.current);
      }
    });
  };

  const getCurrentSeason = (): Season => {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 5) return Season.SUMMER;
    if (month >= 6 && month <= 8) return Season.MONSOON;
    return Season.WINTER;
  };

  const currentSeason = getCurrentSeason();

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isTimerActive && timeLeft === 0) {
      setIsTimerActive(false);
      alert('Activity Session Completed! Great Job!');
    }
    return () => clearInterval(interval);
  }, [isTimerActive, timeLeft]);

  const startTimer = () => {
    if (!selectedActivity) return;
    const match = selectedActivity.duration.match(/\d+/);
    const minutes = match ? parseInt(match[0], 10) : 5;
    setTimeLeft(minutes * 60);
    setIsTimerActive(true);
  };

  const getSeasonIcon = (season: Season) => {
    switch (season) {
      case Season.SUMMER: return <Sun className="text-orange-500" />;
      case Season.WINTER: return <Snowflake className="text-blue-500" />;
      case Season.MONSOON: return <CloudRain className="text-emerald-500" />;
      default: return <Sun />;
    }
  };

  useEffect(() => {
    setVoiceStateListener(setIsVoiceSpeaking);
    return () => {
      stopRealisticVoice();
    };
  }, []);

  const speakResponse = async (text: string) => {
    try {
      await playRealisticVoice(text);
    } catch (e) {
      console.warn("Speech playback error", e);
    }
  };

  const initChat = (speak: boolean = false) => {
    setChatSession(startNewChat());
    const greetingText = "Namaste, main PraanSewa AI Doctor assistant hoon. Bataiye, aapko kya takleef hai? Aap kisi bhi bhasha mein bata sakte hain.";

    setMessages([{
      id: '1',
      role: 'model',
      text: greetingText,
      timestamp: new Date()
    }]);
    setTriageResult(null);

    if (speak) {
      speakResponse(greetingText);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'hi-IN';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        handleSend(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [chatSession, speechInputLang]);

  const startListening = (customLang?: string) => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = customLang || speechInputLang;
      } catch (e) { }
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch (e) { }
    } else {
      alert("Voice input is not supported in this browser. Please type your message.");
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const base64 = await convertFileToBase64(file);
        handleSend('', base64);
      } catch (error) {
        console.error("Error converting file to base64", error);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async (text: string, imageBase64?: string) => {
    if ((!text.trim() && !imageBase64) || !chatSession) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text,
      timestamp: new Date(),
      image: imageBase64
    };

    const exitPhrases = ['thank you', 'thanks', 'shukriya', 'dhanyavaad', 'dhanyavad', 'ji haa', 'ji haan', 'haan ji', 'theek hai', 'thik hai', 'confirm'];
    const lowerText = text.toLowerCase().trim();
    const isExitPhrase = exitPhrases.some(phrase => lowerText === phrase || lowerText.includes(phrase)) && messages.length >= 3;

    setMessages(prev => [...prev, userMsg]);
    setInputText('');

    if (isExitPhrase) {
      analyzeAndTriage([...messages, userMsg]);
      return;
    }

    setIsLoading(true);

    try {
      const callWithRetry = async (retries = 4, delay = 4000): Promise<any> => {
        try {
          if (imageBase64) {
            const data = imageBase64.split(',')[1];
            const mimeType = imageBase64.substring(imageBase64.indexOf(':') + 1, imageBase64.indexOf(';'));
            return await chatSession.sendMessage({
              message: [{ text: text }, { inlineData: { mimeType, data } }]
            });
          } else {
            return await chatSession.sendMessage({ message: text });
          }
        } catch (e: any) {
          const errStr = (e?.message || '') + JSON.stringify(e || '').toLowerCase();
          const isQuota = errStr.includes('429') || errStr.includes('quota') || errStr.includes('exhausted') || errStr.includes('resource');
          const isOverloaded = errStr.includes('503') || errStr.includes('overloaded') || errStr.includes('busy');

          if (retries > 0 && (isQuota || isOverloaded)) {
            const jitter = Math.random() * 1000;
            await new Promise(r => setTimeout(r, delay + jitter));
            return callWithRetry(retries - 1, delay * 1.5);
          }
          throw e;
        }
      };

      const result = await callWithRetry();
      const responseText = result.text || "Hum samajh nahi paaye, kripya phir se kahein.";

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMsg]);

      if (currentView === 'CONSULT_VOICE') {
        speakResponse(responseText);
      }
    } catch (error: any) {
      console.error(error);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Kshama karein, system thoda busy hai. Kripya 1 minute baad phir se koshish karein.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeAndTriage = async (customTranscript?: Message[]) => {
    setIsLoading(true);
    const transcriptToAnalyze = customTranscript || messages;
    const fullTranscript = transcriptToAnalyze.map(m => `${m.role}: ${m.text}`).join('\n');
    try {
      const result = await analyzeCase(fullTranscript);
      setTriageResult(result);
      if (result.severity === CaseSeverity.CRITICAL) {
        saveCase(true, 'VIDEO', transcriptToAnalyze, result);
        if (onStartVideoCall) {
          onStartVideoCall({
            roomId: `crit-${Date.now().toString().slice(-6)}`,
            patientId: user.id,
            patientName: user.name,
            doctorId: 'DR101',
            doctorName: 'Dr. A. Sharma',
            isEmergency: true,
            symptoms: transcriptToAnalyze.filter(m => m.role === 'user').map(m => m.text),
            diagnosis: result.diagnosis
          });
        } else {
          setCurrentView('DOCTOR_CONNECT');
          setTimeout(() => {
            setCurrentView('FEEDBACK');
          }, 4000);
        }
      } else {
        setCurrentView('TRIAGE_RESULT');
      }
    } catch (e) {
      console.error("Triage error", e);
      alert("System busy. Kripya 'Finish' button phir se dabayein thodi der baad.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalSubmit = (needsMedicine: boolean, escalatedMode?: 'VIDEO' | 'VOICE') => {
    if (escalatedMode === 'VIDEO' && onStartVideoCall) {
      const caseRoomId = `case-${Date.now().toString().slice(-6)}`;
      saveCase(needsMedicine, escalatedMode, messages, triageResult || undefined);
      onStartVideoCall({
        roomId: caseRoomId,
        patientId: user.id,
        patientName: user.name,
        doctorId: 'DR101',
        doctorName: 'Dr. A. Sharma (General Physician)',
        isEmergency: triageResult?.severity === CaseSeverity.CRITICAL,
        symptoms: messages.filter(m => m.role === 'user').map(m => m.text),
        diagnosis: triageResult?.diagnosis
      });
      return;
    }

    if (escalatedMode) {
      setCurrentView('DOCTOR_CONNECT');
      setTimeout(() => {
        saveCase(needsMedicine, escalatedMode, messages, triageResult || undefined);
        setCurrentView('FEEDBACK');
      }, 3000);
    } else {
      saveCase(needsMedicine, undefined, messages, triageResult || undefined);
      setCurrentView('FEEDBACK');
    }
  };

  const saveCase = (
    needsMedicine: boolean,
    escalatedMode?: 'VIDEO' | 'VOICE',
    customMessages?: Message[],
    explicitTriage?: TriageResult
  ) => {
    const triage = explicitTriage || triageResult;
    const msgs = customMessages || messages;
    const images = msgs.filter(m => m.image).map(m => m.image!);
    const fullText = msgs.map(m => m.text).join('\n');

    // Extract phone number from transcript if patient mentioned it
    const phoneMatch = fullText.match(/\b[6-9]\d{9}\b/);
    const phone = phoneMatch ? phoneMatch[0] : (user.mobileNumber || '');

    // Extract address from transcript if patient mentioned it
    let detectedAddress = 'Current Location';
    const lines = fullText.split('\n');
    for (const line of lines) {
      if (/kishangarh|ajmer|village|colony|mohalla|plot|ward|gali|house|nagar|pur/i.test(line) && !line.startsWith('model:')) {
        detectedAddress = line.replace(/user:\s*/i, '').trim();
        break;
      }
    }

    const userMsgs = msgs.filter(m => m.role === 'user').map(m => m.text);
    const symptomsList = userMsgs.length > 0 ? userMsgs.slice(0, 3) : ['High Fever', 'Cough'];

    const newCase: MedicalCase = {
      id: `CS-${Date.now()}`,
      patientId: user.id,
      patientName: user.name + (phone ? ` (${phone})` : ''),
      timestamp: new Date().toISOString(),
      mode: 'ONLINE',
      symptoms: symptomsList,
      aiDiagnosis: triage?.diagnosis || 'Acute High Fever & Respiratory Symptoms',
      severity: triage?.severity || CaseSeverity.CRITICAL,
      careSuggestions: triage?.careSuggestions || 'Immediate medical attention required for high fever',
      status: (triage?.severity === CaseSeverity.CRITICAL || escalatedMode) ? CaseStatus.OPEN : (needsMedicine ? CaseStatus.PENDING_APPROVAL : CaseStatus.COMPLETED),
      transcript: msgs,
      prescription: triage?.suggestedPrescription || 'Paracetamol 500mg (1 tab TDS)\nConsult duty doctor immediately',
      homeRemedies: triage?.homeRemedies || ['Ginger & honey paste', 'Cold water sponge compress'],
      doctorNotes: (escalatedMode ? `Patient requested immediate ${escalatedMode} escalation.` : '') + (phone ? ` Contact: ${phone}.` : '') + (detectedAddress !== 'Current Location' ? ` Village/Address: ${detectedAddress}` : ''),
      deliveryEta: needsMedicine ? 'Pending Dispatch (20 min)' : undefined,
      images: images,
      patientLocation: userLocation 
        ? { ...userLocation, address: detectedAddress } 
        : { lat: 26.5786, lng: 74.8698, address: detectedAddress }
    };

    onSubmitCase(newCase);
  };

  const handleLocationSearch = async (queryToSearch?: string) => {
    const q = queryToSearch || locationSearchQuery;
    if (!q.trim()) return;
    setIsSearchingLocation(true);
    setLocationLoading(true);
    try {
      const result = await searchIndianLocation(q);
      if (result) {
        const loc = { lat: result.lat, lng: result.lng };
        setUserLocation(loc);
        setDetectedPlaceName(result.displayName);

        const realFacilities = await getRealNearbyHospitals(loc.lat, loc.lng);
        const withDistance = realFacilities.map(hospital => ({
          ...hospital,
          distance: `${calculateDistance(loc.lat, loc.lng, hospital.lat, hospital.lng).toFixed(1)} km`
        }));

        setNearbyHospitals(withDistance);

        if (mapRef.current) {
          mapRef.current.flyTo([loc.lat, loc.lng], 13);
          updateMapMarkers(withDistance, loc);
        }
      } else {
        alert(`Could not find "${q}". Please search with City, Town, or Village name (e.g. Kishangarh, Ajmer).`);
      }
    } catch (e) {
      console.error("Location search failed", e);
    } finally {
      setIsSearchingLocation(false);
      setLocationLoading(false);
    }
  };

  const detectLocation = () => {
    setLocationLoading(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          if (isNaN(lat) || isNaN(lng)) {
            alert("Unable to fetch accurate coordinates.");
            setLocationLoading(false);
            return;
          }

          const loc = { lat, lng };
          setUserLocation(loc);

          try {
            const locality = await reverseGeocodeLocality(lat, lng);
            setDetectedPlaceName(locality.fullAddress || `${locality.name}, ${locality.district}`);

            const realFacilities = await getRealNearbyHospitals(lat, lng);

            const withDistance = realFacilities.map(hospital => ({
              ...hospital,
              distance: `${calculateDistance(lat, lng, hospital.lat, hospital.lng).toFixed(1)} km`
            }));

            setNearbyHospitals(withDistance);

            if (mapRef.current) {
              mapRef.current.flyTo([lat, lng], 13);
              updateMapMarkers(withDistance, loc);
            }
          } catch (err) {
            console.error("Nearby Search Error:", err);
            setNearbyHospitals([]);
          }

          setLocationLoading(false);
        },
        async (err) => {
          console.warn("GPS permission not granted or unavailable, defaulting to user search...", err);
          // If browser GPS is denied, auto-search for user's registered locality (e.g. Kishangarh, Ajmer)
          await handleLocationSearch('Kishangarh, Ajmer');
          setLocationLoading(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } else {
      handleLocationSearch('Kishangarh, Ajmer');
    }
  };

  const openBookingForHospital = (hospital: Hospital) => {
    setSelectedHospital(hospital);
    setCurrentView('BOOK_APPOINTMENT');
  };

  const handleBookingSubmit = () => {
    setIsPaymentProcessing(true);
    setTimeout(() => {
      setIsPaymentProcessing(false);
      const isVideo = consultationType === 'ONLINE_VIDEO';
      const newAppt: Appointment = {
        id: `APT-${Date.now()}`,
        patientId: user.id,
        patientName: user.name,
        doctorId: 'DR101',
        doctorName: apptDoctor,
        hospitalName: selectedHospital?.name || (isVideo ? 'PraanSewa Telemedicine' : 'Civil Hospital'),
        hospitalAddress: selectedHospital?.address || (isVideo ? 'Encrypted Video Room' : 'OPD Counter 3'),
        date: apptDate || new Date(Date.now() + 86400000).toISOString(),
        timeSlot: apptTimeSlot,
        consultationType: consultationType,
        meetingRoomId: isVideo ? `upchaar-${Date.now().toString().slice(-6)}` : undefined,
        reason: isVideo ? 'Scheduled Video Consultation' : 'General Consultation',
        status: 'SCHEDULED',
        paymentStatus: paymentMethod === 'CASH' ? 'PAY_AT_CLINIC' : 'PAID',
        amount: selectedHospital?.consultationFee || (isVideo ? 150 : 200)
      };
      onBookAppointment(newAppt);
      setSelectedHospital(null);
      setApptDate('');
      setCurrentView('HOME');
      alert(paymentMethod === 'CASH'
        ? "Appointment Confirmed! Pay at clinic."
        : isVideo
          ? `Video Consultation Scheduled for ${apptTimeSlot}! Join link created in your Dashboard.`
          : "Payment Successful! Clinic Appointment Confirmed."
      );
    }, 1500);
  };

  const submitFeedback = () => {
    setCurrentView('HOME');
    setFeedbackRating(0);
    setFeedbackComment('');
  };

  const renderHome = () => (
    <div className="flex flex-col h-full bg-slate-50 p-4 sm:p-6 lg:p-8 overflow-y-auto overflow-x-hidden">
      {/* Welcome Hero Banner */}
      <div className="mb-6 md:mb-8 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-2xl md:rounded-3xl p-5 md:p-8 text-white shadow-lg shadow-emerald-700/10 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500 relative overflow-hidden shrink-0">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-white rounded-2xl flex items-center justify-center shrink-0 border border-white/30 shadow-md p-2">
            <Logo className="w-full h-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-emerald-100 backdrop-blur-sm">
                Rural Health Access
              </span>
              <span className="text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200">
                AI Triage 24/7
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1 text-white">
              Namaste, {user.name}
            </h1>
            <p className="text-emerald-100 text-xs md:text-sm mt-0.5">
              Healthcare for Every Village • Instant AI Doctor & Village Clinic Network
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-20">
          <button 
            onClick={async () => {
              const patientSlug = (user.name || 'patient').toLowerCase().replace(/[^a-z0-9]/g, '') || 'patient';
              const emgRoomId = `emg-${patientSlug}`;
              try {
                const emgPayload = {
                  type: 'EMERGENCY_CALL',
                  patientId: user.id,
                  patientName: user.name,
                  roomId: emgRoomId,
                  timestamp: new Date().toISOString()
                };
                const bc = new BroadcastChannel('upchaar_emergency_channel');
                bc.postMessage(emgPayload);
                bc.close();
                localStorage.setItem('upchaar_last_emergency', JSON.stringify(emgPayload));
                
                fetch('/api/video/emergency-request', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ doctorId: 'DR101', patientName: user.name, roomId: emgRoomId })
                }).catch(() => {});

                fetch('/api/emergency', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ patientId: user.id, patientName: user.name, roomId: emgRoomId })
                }).catch(() => {});
              } catch (err) {}

              if (onStartVideoCall) {
                onStartVideoCall({
                  roomId: emgRoomId,
                  patientId: user.id,
                  patientName: user.name,
                  doctorId: 'DR101',
                  doctorName: 'Emergency Medical Officer',
                  isEmergency: true,
                  symptoms: ['Acute Emergency Video SOS Request'],
                  diagnosis: 'Emergency Medical Consultation Requested'
                });
              } else {
                alert("🚨 Emergency signal sent to Doctor!");
              }
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full shadow-lg animate-pulse flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Ambulance size={20} /> SOS Emergency Call
          </button>

          {/* Direct Manual Room Join for Patient */}
          <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
            <input
              type="text"
              placeholder="Join room code..."
              value={patientManualRoom}
              onChange={(e) => setPatientManualRoom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && patientManualRoom.trim() && onStartVideoCall) {
                  onStartVideoCall({
                    roomId: patientManualRoom.trim(),
                    patientId: user.id,
                    patientName: user.name,
                    doctorId: 'DR101',
                    doctorName: 'Dr. A. Sharma',
                    isEmergency: false
                  });
                }
              }}
              className="px-2.5 py-1 text-xs bg-white/20 placeholder-white/60 text-white rounded-lg outline-none w-32 font-mono"
            />
            <button
              onClick={() => {
                if (patientManualRoom.trim() && onStartVideoCall) {
                  onStartVideoCall({
                    roomId: patientManualRoom.trim(),
                    patientId: user.id,
                    patientName: user.name,
                    doctorId: 'DR101',
                    doctorName: 'Dr. A. Sharma',
                    isEmergency: false
                  });
                }
              }}
              disabled={!patientManualRoom.trim()}
              className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
            >
              <Video size={12} /> Join
            </button>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 self-start md:self-auto">
          <div className="px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold flex items-center gap-2 text-white">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse"></span>
            <span>Online Clinic Support</span>
          </div>
        </div>

        {/* Decorative circular blur in background */}
        <div className="absolute -right-8 -bottom-10 w-44 h-44 rounded-full bg-white/5 pointer-events-none"></div>
      </div>

      {/* Primary 4 Actions - Responsive 4 Columns on Laptop/Desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 mb-8 shrink-0">
        <button
          onClick={() => { initChat(false); setCurrentView('CONSULT_CHAT'); }}
          className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col items-center sm:items-start text-center sm:text-left gap-3 hover:border-emerald-500 hover:shadow-lg hover:-translate-y-0.5 transition-all group animate-in zoom-in-95 fade-in duration-300"
          style={{ animationDelay: '75ms', animationFillMode: 'both' }}
        >
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">
            <MessageSquare size={24} />
          </div>
          <div>
            <span className="font-bold text-slate-800 text-sm sm:text-base block">Chat AI</span>
            <span className="text-xs text-slate-400 hidden sm:block mt-0.5">Clinical symptom check</span>
          </div>
        </button>

        <button
          onClick={() => { initChat(true); setCurrentView('CONSULT_VOICE'); }}
          className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col items-center sm:items-start text-center sm:text-left gap-3 hover:border-blue-500 hover:shadow-lg hover:-translate-y-0.5 transition-all group animate-in zoom-in-95 fade-in duration-300"
          style={{ animationDelay: '150ms', animationFillMode: 'both' }}
        >
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
            <Mic size={24} />
          </div>
          <div>
            <span className="font-bold text-slate-800 text-sm sm:text-base block">Voice AI</span>
            <span className="text-xs text-slate-400 hidden sm:block mt-0.5">Speak in Hindi / Regional</span>
          </div>
        </button>

        <button
          onClick={() => setCurrentView('LOCATE_NEARBY')}
          className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col items-center sm:items-start text-center sm:text-left gap-3 hover:border-amber-500 hover:shadow-lg hover:-translate-y-0.5 transition-all group animate-in zoom-in-95 fade-in duration-300"
          style={{ animationDelay: '225ms', animationFillMode: 'both' }}
        >
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm">
            <MapPin size={24} />
          </div>
          <div>
            <span className="font-bold text-slate-800 text-sm sm:text-base block">Nearby Help</span>
            <span className="text-xs text-slate-400 hidden sm:block mt-0.5">Find clinics & hospitals</span>
          </div>
        </button>

        <button
          onClick={() => {
            setSelectedHospital(null);
            setCurrentView('BOOK_APPOINTMENT');
          }}
          className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col items-center sm:items-start text-center sm:text-left gap-3 hover:border-purple-500 hover:shadow-lg hover:-translate-y-0.5 transition-all group animate-in zoom-in-95 fade-in duration-300"
          style={{ animationDelay: '300ms', animationFillMode: 'both' }}
        >
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-sm">
            <Calendar size={24} />
          </div>
          <div>
            <span className="font-bold text-slate-800 text-sm sm:text-base block">Book Appt</span>
            <span className="text-xs text-slate-400 hidden sm:block mt-0.5">Consult rural specialists</span>
          </div>
        </button>
      </div>

      {/* Two-Column Responsive Split on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Side: Wellness & Preventive Healthcare (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between ml-1">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Leaf size={14} className="text-emerald-600" />
              Wellness & Support
            </h3>
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              Ayurvedic & Lifestyle Guidance
            </span>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setCurrentView('HOME_REMEDIES')}
              className="w-full bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-4 hover:border-amber-400 hover:shadow-md transition-all group text-left animate-in slide-in-from-right-4 fade-in duration-500"
              style={{ animationDelay: '450ms', animationFillMode: 'both' }}
            >
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 group-hover:scale-110 transition shrink-0">
                <Leaf size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-800 text-sm sm:text-base group-hover:text-amber-700 transition">
                    Seasonal Home Remedies
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                    {currentSeason}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Doctor-verified natural care & herbs for local ailments
                </p>
              </div>
              <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-amber-100 transition shrink-0">
                {getSeasonIcon(currentSeason)}
              </div>
            </button>

            <button
              onClick={() => setCurrentView('WELLNESS_HUB')}
              className="w-full bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-4 hover:border-emerald-400 hover:shadow-md transition-all group text-left animate-in slide-in-from-right-4 fade-in duration-500"
              style={{ animationDelay: '525ms', animationFillMode: 'both' }}
            >
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:scale-110 transition shrink-0">
                <Zap size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-800 text-sm sm:text-base group-hover:text-emerald-700 transition">
                  Yoga & Immunity Routines
                </h4>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Guided pranayama and strength exercises for rural wellness
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-600 px-3 py-1 bg-emerald-50 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition">
                Start
              </span>
            </button>

            <button
              onClick={() => setCurrentView('DOCTOR_TIPS')}
              className="w-full bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-4 hover:border-blue-400 hover:shadow-md transition-all group text-left animate-in slide-in-from-right-4 fade-in duration-500"
              style={{ animationDelay: '600ms', animationFillMode: 'both' }}
            >
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition shrink-0">
                <Heart size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-800 text-sm sm:text-base group-hover:text-blue-700 transition">
                  Doctor's Daily Health Tips
                </h4>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Professional hygiene, nutrition, and lifestyle advice
                </p>
              </div>
              <span className="text-xs font-semibold text-blue-600 px-3 py-1 bg-blue-50 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition">
                Read
              </span>
            </button>
          </div>
        </div>

        {/* Right Side: Recent Activity & Health Record (5 cols) */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
              <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                <History size={16} className="text-emerald-600" />
                Recent Health Activity
              </h3>
              <button
                onClick={() => setCurrentView('HISTORY')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-bold transition"
              >
                View Full Log
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {appointments.slice(0, 2).map(apt => (
                <div key={apt.id} className="p-3.5 bg-purple-50/70 rounded-xl border border-purple-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider bg-purple-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      {apt.consultationType === 'ONLINE_VIDEO' ? <Video size={10} /> : <Stethoscope size={10} />}
                      {apt.consultationType === 'ONLINE_VIDEO' ? 'Video Call' : 'Clinic Visit'}
                    </span>
                    <span className="text-xs text-purple-600 font-medium">
                      {new Date(apt.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 mt-1">{apt.doctorName}</p>
                  <p className="text-xs text-slate-500">{apt.reason || 'General Consultation'} • <span className="font-semibold text-slate-700">{apt.timeSlot || '10:00 AM'}</span></p>

                  {apt.consultationType === 'ONLINE_VIDEO' && apt.status !== 'COMPLETED' && (
                    <div className="mt-2.5 pt-2 border-t border-purple-200/60 flex items-center justify-between">
                      <span className="text-[10px] text-purple-700 font-bold">Room: {apt.meetingRoomId || 'Ready'}</span>
                      <button
                        onClick={() => {
                          if (onStartVideoCall) {
                            onStartVideoCall({
                              roomId: apt.meetingRoomId || `room-${apt.id}`,
                              appointmentId: apt.id,
                              patientId: user.id,
                              patientName: user.name,
                              doctorId: apt.doctorId,
                              doctorName: apt.doctorName,
                              isEmergency: false
                            });
                          }
                        }}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                      >
                        <Video size={12} /> Join Call
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {patientHistory.slice(0, 3).map(c => (
                <div key={c.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{c.aiDiagnosis || 'Symptom Triage'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(c.timestamp).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                    c.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {c.status.replace('_', ' ')}
                  </span>
                </div>
              ))}

              {patientHistory.length === 0 && appointments.length === 0 && (
                <div className="text-center py-8">
                  <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-600">No medical consultations yet</p>
                  <p className="text-xs text-slate-400 mt-0.5">Use Chat AI or Voice AI to start your first triage.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHomeRemedies = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
        <button onClick={() => setCurrentView('HOME')}><ArrowLeft size={24} className="text-slate-500" /></button>
        <h2 className="font-bold text-slate-800">Home Remedies</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Current Season</p>
            <p className="text-lg font-bold text-slate-800 capitalize">{currentSeason.toLowerCase()}</p>
          </div>
          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center shadow-inner">
            {getSeasonIcon(currentSeason)}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { key: 'AUTO', label: `Current (${currentSeason})` },
            { key: 'ALL', label: 'All Seasons' },
            { key: 'MONSOON', label: 'Monsoon' },
            { key: 'SUMMER', label: 'Summer' },
            { key: 'WINTER', label: 'Winter' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setRemedySeasonFilter(tab.key as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                remedySeasonFilter === tab.key
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-amber-50 hover:text-amber-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_REMEDIES.filter(r => {
            if (remedySeasonFilter === 'ALL') return true;
            if (remedySeasonFilter === 'AUTO') return r.season === currentSeason || r.season === Season.ALL;
            return r.season === remedySeasonFilter || r.season === Season.ALL;
          }).map((remedy, index) => (
            <div
              key={remedy.id}
              onClick={() => setSelectedRemedy(remedy)}
              className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 hover:border-amber-400 cursor-pointer transition group animate-in zoom-in-95 fade-in duration-300 flex flex-col justify-between"
              style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'both' }}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-slate-800 group-hover:text-amber-700 transition">{remedy.title}</h4>
                  <div className="flex items-center gap-1 text-amber-500 text-xs font-bold">
                    <Star size={12} fill="currentColor" /> {remedy.rating}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-3">{remedy.ailment}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold flex items-center gap-1">
                  <ShieldCheck size={10} className="text-emerald-500" /> Verified by {remedy.doctorName}
                </span>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">View Recipe →</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedRemedy && (
        <div className="absolute inset-0 bg-white z-[60] flex flex-col animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500 bg-white">
            <button onClick={() => setSelectedRemedy(null)}><ArrowLeft size={24} className="text-slate-500" /></button>
            <h2 className="font-bold text-slate-800">Preparation Guide</h2>
            <div className="w-6"></div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="max-w-3xl mx-auto w-full">
            <div className="bg-amber-50 rounded-3xl p-6 text-center mb-8">
              <Leaf className="w-12 h-12 text-amber-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-slate-800 mb-1">{selectedRemedy.title}</h3>
              <p className="text-amber-700 text-sm font-medium">{selectedRemedy.ailment}</p>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span> Ingredients
                </h4>
                <ul className="grid grid-cols-1 gap-2">
                  {selectedRemedy.ingredients.map((item, idx) => (
                    <li
                      key={idx}
                      className="bg-slate-50 p-3 rounded-xl text-sm text-slate-700 border border-slate-100 flex items-center gap-3 animate-in zoom-in-95 fade-in duration-300"
                      style={{ animationDelay: `${(idx + 1) * 75}ms`, animationFillMode: 'both' }}
                    >
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div> {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span> Steps to Prepare
                </h4>
                <div className="space-y-4">
                  {selectedRemedy.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex gap-4 animate-in zoom-in-95 fade-in duration-300"
                      style={{ animationDelay: `${(idx + selectedRemedy.ingredients.length + 1) * 75}ms`, animationFillMode: 'both' }}
                    >
                      <span className="flex-shrink-0 w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <p className="text-sm text-slate-600 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="pt-8 border-t border-slate-100 pb-8 animate-in zoom-in-95 fade-in duration-300"
                style={{ animationDelay: `${(selectedRemedy.ingredients.length + selectedRemedy.steps.length + 1) * 75}ms`, animationFillMode: 'both' }}
              >
                <p className="text-center text-xs text-slate-400 mb-4 font-bold uppercase tracking-widest">Was this helpful?</p>
                <div className="flex flex-col items-center gap-4">
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => handleLikeRemedy(selectedRemedy.id)}
                      className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 ${likedRemedies[selectedRemedy.id]
                        ? 'bg-emerald-100 text-emerald-700 scale-105'
                        : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95'
                        }`}
                    >
                      <ThumbsUp size={16} className={likedRemedies[selectedRemedy.id] ? "fill-emerald-700 animate-bounce" : ""} />
                      {likedRemedies[selectedRemedy.id] ? 'Liked!' : 'Yes'}
                      <span className="ml-1 text-xs opacity-80">
                        ({remedyLikeCounts[selectedRemedy.id] !== undefined ? remedyLikeCounts[selectedRemedy.id] : getInitialLikes(selectedRemedy.id)})
                      </span>
                    </button>
                    <button
                      onClick={() => setRatingInputFor(ratingInputFor === selectedRemedy.id ? null : selectedRemedy.id)}
                      className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 ${ratedRemedies[selectedRemedy.id]
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700 active:scale-95'
                        }`}
                    >
                      <Star size={16} className={ratedRemedies[selectedRemedy.id] ? "fill-amber-500" : ""} />
                      {ratedRemedies[selectedRemedy.id] ? `Rated ${ratedRemedies[selectedRemedy.id]}` : 'Rate'}
                    </button>
                  </div>

                  {/* Rating Input Area */}
                  {ratingInputFor === selectedRemedy.id && !ratedRemedies[selectedRemedy.id] && (
                    <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-2xl shadow-lg border border-slate-100 animate-in slide-in-from-bottom-2 fade-in duration-300 w-full max-w-[240px]">
                      <p className="text-sm font-bold text-slate-700">How would you rate this?</p>
                      <div className="flex gap-2" onMouseLeave={() => setHoverRating(null)}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            onClick={() => handleSubmitRating(selectedRemedy.id, star)}
                            onMouseEnter={() => setHoverRating(star)}
                            className={`transition-all duration-200 focus:outline-none ${star <= (hoverRating || 0) ? 'text-amber-400 scale-125' : 'text-slate-300 hover:text-amber-400 border-none'}`}
                          >
                            <Star size={28} className={star <= (hoverRating || 0) ? "fill-amber-400" : ""} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {ratedRemedies[selectedRemedy.id] && ratingInputFor === selectedRemedy.id && (
                    <div className="text-sm font-bold text-emerald-600 flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                      <CheckCircle size={16} className="text-emerald-500" /> Thank you for rating!
                    </div>
                  )}
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderWellnessHub = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
        <button onClick={() => setCurrentView('HOME')}><ArrowLeft size={24} className="text-slate-500" /></button>
        <h2 className="font-bold text-slate-800">Yoga & Strength</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="bg-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200 relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="font-bold text-lg mb-1">Morning Routine</h3>
            <p className="text-emerald-50 text-xs">Start your day with these doctor-recommended light activities to build immunity.</p>
          </div>
          <Activity className="absolute -right-4 -bottom-4 w-24 h-24 text-emerald-500 opacity-20" />
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          {(['ALL', 'ELDERLY', 'ADULTS'] as const).map(tag => (
            <button
              key={tag}
              onClick={() => setWellnessCategoryFilter(tag)}
              className={`px-3 py-2 rounded-xl text-[10px] font-bold transition uppercase tracking-widest ${
                wellnessCategoryFilter === tag
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-400 border border-slate-100 hover:border-emerald-400 hover:text-emerald-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_WELLNESS_ACTIVITIES.filter(act => {
            if (wellnessCategoryFilter === 'ALL') return true;
            if (wellnessCategoryFilter === 'ELDERLY') return act.ageGroup.toUpperCase().includes('SENIOR') || act.ageGroup.toUpperCase().includes('ALL') || act.level === 'BEGINNER';
            if (wellnessCategoryFilter === 'ADULTS') return act.ageGroup.toUpperCase().includes('ADULT') || act.ageGroup.toUpperCase().includes('ALL');
            return true;
          }).map((activity, index) => (
            <div
              key={activity.id}
              onClick={() => setSelectedActivity(activity)}
              className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 hover:border-emerald-400 cursor-pointer transition flex items-center gap-4 animate-in zoom-in-95 fade-in duration-300"
              style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'both' }}
            >
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-emerald-600 flex-shrink-0">
                {activity.type === 'BREATHING' ? <Volume2 className="rotate-90" /> : <Zap />}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-800 text-sm">{activity.title}</h4>
                  <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold uppercase">{activity.duration}</span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-1">{activity.benefit}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedActivity && (
        <div className="absolute inset-0 bg-white z-[60] flex flex-col animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500 bg-white">
            <button onClick={() => setSelectedActivity(null)}><ArrowLeft size={24} className="text-slate-500" /></button>
            <h2 className="font-bold text-slate-800">Activity Guide</h2>
            <div className="w-6"></div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="max-w-3xl mx-auto w-full">
            <div className="bg-emerald-50 rounded-3xl p-6 text-center mb-8">
              <Zap className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-slate-800 mb-1">{selectedActivity.title}</h3>
              <p className="text-emerald-700 text-sm font-medium">{selectedActivity.benefit}</p>
              <div className="mt-4 flex justify-center gap-2">
                <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold text-emerald-600 border border-emerald-100">{selectedActivity.level}</span>
                <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold text-emerald-600 border border-emerald-100">{selectedActivity.ageGroup}</span>
              </div>
            </div>

            <div className="space-y-6">
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full"></span> Step-by-Step
              </h4>
              <div className="space-y-8">
                {selectedActivity.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex gap-4 relative animate-in zoom-in-95 fade-in duration-300"
                    style={{ animationDelay: `${idx * 75}ms`, animationFillMode: 'both' }}
                  >
                    {idx < selectedActivity.steps.length - 1 && (
                      <div className="absolute top-8 left-3.5 w-0.5 h-full bg-slate-100"></div>
                    )}
                    <span className="flex-shrink-0 w-8 h-8 bg-white border-2 border-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center text-xs font-bold z-10">
                      {idx + 1}
                    </span>
                    <p className="text-sm text-slate-600 leading-relaxed pt-1.5">{step}</p>
                  </div>
                ))}
              </div>

              <div
                className="pt-10 animate-in zoom-in-95 fade-in duration-300"
                style={{ animationDelay: `${selectedActivity.steps.length * 75}ms`, animationFillMode: 'both' }}
              >
                {!isTimerActive ? (
                  <button
                    onClick={startTimer}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-100"
                  >
                    Start Session (Timer)
                  </button>
                ) : (
                  <div className="bg-emerald-50 rounded-2xl p-6 text-center shadow-inner border border-emerald-100">
                    <h3 className="text-4xl font-black text-emerald-600 mb-2 font-mono">
                      {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </h3>
                    <p className="text-emerald-700 text-sm font-medium mb-6 animate-pulse">Session in progress...</p>
                    <button
                      onClick={() => setIsTimerActive(false)}
                      className="w-full py-3 bg-red-100 text-red-600 rounded-xl font-bold hover:bg-red-200 transition border border-red-200"
                    >
                      Stop / Pause Session
                    </button>
                  </div>
                )}
                <p className="text-center text-[10px] text-slate-400 mt-4 italic px-4">Stop immediately if you feel any pain or dizziness.</p>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // --- REACTION & COMMENTS HANDLERS ---
  const handleReaction = (tipId: string, emoji: string) => {
    reactToTip(tipId, emoji, user.id);
    setActiveReactionDrawer(null);
  };

  const renderCommentsSheet = () => {
    if (!activeTipComments) return null;
    const tip = MOCK_HEALTH_TIPS.find(t => t.id === activeTipComments);
    if (!tip) return null;

    return (
      <TipCommentsModal
        tip={tip}
        isOpen={!!activeTipComments}
        onClose={() => setActiveTipComments(null)}
        currentUser={user}
      />
    );
  };

  const renderExpandedEmojiSheet = () => {
    if (!activeExpandedEmojiPicker) return null;

    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="absolute inset-0" onClick={() => setActiveExpandedEmojiPicker(null)} />
        <div className="bg-slate-900 w-full max-h-[85vh] rounded-t-3xl shadow-2xl relative flex flex-col animate-in slide-in-from-bottom-full duration-300">
          <div className="flex justify-center p-3 shrink-0">
            <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
          </div>
          <div className="px-4 pb-3 shrink-0">
            <div className="bg-slate-800 rounded-full py-2 px-4 flex items-center justify-center relative">
              <span className="text-white text-lg">😀</span>
            </div>
            <h3 className="font-bold text-slate-100 mt-4 px-1 text-sm">Frequently used</h3>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-8">
            <div className="grid grid-cols-9 gap-y-6 gap-x-2 justify-items-center">
              {FULL_EMOJI_LIST.map((emoji, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReaction(activeExpandedEmojiPicker, emoji);
                    setActiveExpandedEmojiPicker(null);
                  }}
                  className="text-[26px] hover:scale-125 transition-transform duration-200"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDoctorTips = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
        <button onClick={() => setCurrentView('HOME')}><ArrowLeft size={24} className="text-slate-500" /></button>
        <h2 className="font-bold text-slate-800">Doctor's Health Tips</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-4 mb-2">
          <Info className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-xs text-blue-700 font-medium leading-relaxed">Trusted advice from our rural healthcare network. Tips are updated daily based on local health conditions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MOCK_HEALTH_TIPS.map((tip, index) => (
          <div
            key={tip.id}
            className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 group animate-in zoom-in-95 fade-in duration-300 flex flex-col justify-between"
            style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'both' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border-2 border-slate-50 group-hover:border-blue-200 transition">
                {tip.doctorName.charAt(4)}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-slate-800 text-sm">{tip.doctorName}</h4>
                <p className="text-[10px] text-slate-400">{new Date(tip.timestamp).toLocaleDateString()}</p>
              </div>
              <span className="text-[9px] bg-blue-50 px-2 py-0.5 rounded text-blue-600 font-bold uppercase tracking-wider">{tip.category}</span>
            </div>
            <h5 className="font-bold text-slate-800 mb-2">{tip.title}</h5>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">{tip.content}</p>
            <div className="flex items-center justify-between pt-4 border-t border-slate-50 relative">

              {/* ANIMAITED REACTION BUTTON */}
              <div
                className="relative flex items-center"
                onMouseEnter={() => setActiveReactionDrawer(tip.id)}
                onMouseLeave={() => {
                  // Wait a short bit before closing to allow smooth movement
                  setTimeout(() => {
                    setActiveReactionDrawer(prev => prev === tip.id ? null : prev);
                  }, 150);
                }}
              >
                {activeReactionDrawer === tip.id && (
                  <div
                    className="absolute bottom-[calc(100%+8px)] left-0 bg-slate-800 border border-slate-700 shadow-xl rounded-full px-3 py-2 flex items-center gap-2 animate-in zoom-in-95 duration-200 origin-bottom-left z-20"
                    // Prevent closing when moving over the popover itself
                    onMouseEnter={() => setActiveReactionDrawer(tip.id)}
                  >
                    {['👍🏼', '❤️', '😄', '😲', '😟', '🙏🏼', '💯', '🙌🏼'].map((emoji, i) => (
                      <button
                        key={emoji}
                        onClick={(e) => { e.stopPropagation(); handleReaction(tip.id, emoji); }}
                        className="text-[28px] hover:scale-125 transition-transform duration-200 animate-in slide-in-from-bottom-2 fade-in leading-none"
                        style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
                      >
                        {emoji}
                      </button>
                    ))}

                    <div className="w-4 h-4 bg-slate-800 absolute -bottom-1.5 left-6 rotate-45 rounded-sm" />
                    {/* Invisible bridge to prevent hover loss when moving mouse up */}
                    <div className="absolute -bottom-3 left-0 right-0 h-4 bg-transparent" />
                  </div>
                )}
                <button
                  className={`flex items-center gap-1.5 text-xs font-bold transition relative group py-1 ${getTipReactions(tip.id, user.id).userEmoji ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                  onClick={() => {
                    const reactions = getTipReactions(tip.id, user.id);
                    if (!reactions.userEmoji && activeReactionDrawer !== tip.id) {
                      setActiveReactionDrawer(tip.id);
                    } else {
                      handleReaction(tip.id, reactions.userEmoji ? reactions.userEmoji : '❤️');
                    }
                  }}
                >
                  {(() => {
                    const reactions = getTipReactions(tip.id, user.id);
                    const totalCount = reactions.total;

                    // Sort emojis by count descending to display top reacted emojis
                    const sortedEmojis = TIP_EMOJIS
                      .filter(emoji => (reactions.counts[emoji] || 0) > 0)
                      .sort((a, b) => (reactions.counts[b] || 0) - (reactions.counts[a] || 0));

                    const topArr = sortedEmojis.slice(0, 3);
                    const remaining = Math.max(0, totalCount - topArr.reduce((sum, e) => sum + (reactions.counts[e] || 0), 0));

                    if (totalCount === 0) {
                      return <Heart size={16} className="text-slate-400 group-hover:fill-rose-100 group-hover:text-rose-500 transition-colors" />;
                    }

                    return (
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1">
                          {topArr.map((emoji, idx) => (
                            <span key={idx} className="text-base relative z-10 bg-slate-50 rounded-full ring-2 ring-slate-50">{emoji}</span>
                          ))}
                        </div>
                        <span className="font-bold text-slate-700">{totalCount}</span>
                        {reactions.userEmoji && (
                          <span className="text-[10px] text-rose-600 bg-rose-50 border border-rose-200 px-1 rounded-full font-bold ml-0.5">You: {reactions.userEmoji}</span>
                        )}
                      </div>
                    );
                  })()}
                </button>
              </div>

              {/* COMMENT BUTTON */}
              <button
                onClick={() => setActiveTipComments(tip.id)}
                className="text-xs font-bold text-slate-500 hover:text-blue-600 transition flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full"
              >
                <MessageSquare size={14} /> Comment {getTipCommentCounts(tip.id).total > 0 ? `(${getTipCommentCounts(tip.id).total})` : ''}
              </button>

            </div>
          </div>
        ))}
        </div>
      </div>
      {renderCommentsSheet()}
      {renderExpandedEmojiSheet()}
    </div>
  );

  const renderConsultation = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 p-3 flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-4 duration-500">
        <button onClick={() => setCurrentView('HOME')} className="text-slate-500 hover:text-slate-800">
          <ArrowLeft size={20} />
        </button>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5">
            <Logo className="w-5 h-5" />
            <span className="font-bold text-slate-800 text-sm">PraanSewa AI Assistant</span>
          </div>
          <span className="text-[10px] text-emerald-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Language Adaptive
          </span>
        </div>
        <button
          onClick={() => analyzeAndTriage()}
          disabled={messages.length < 2 || isLoading}
          className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-full hover:bg-emerald-700 disabled:opacity-50 transition"
        >
          Finish
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl w-full mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-3.5 text-sm shadow-sm whitespace-pre-line group relative ${
              msg.role === 'user'
                ? 'bg-emerald-600 text-white rounded-br-none'
                : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
            }`}>
              {msg.image && (
                <img src={msg.image} alt="uploaded" className="w-full h-auto rounded-lg mb-2 border border-white/20" />
              )}
              <div className="leading-relaxed">{msg.text}</div>

              {/* REALISTIC VOICE PLAYBACK BUTTON ON AI MESSAGES */}
              {msg.role === 'model' && (
                <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      if (isVoiceSpeaking) {
                        stopRealisticVoice();
                      } else {
                        playRealisticVoice(msg.text);
                      }
                    }}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition active:scale-95 border border-emerald-200"
                  >
                    {isVoiceSpeaking ? (
                      <>
                        <VolumeX size={12} className="text-red-500" />
                        <span>Stop Voice</span>
                      </>
                    ) : (
                      <>
                        <Volume2 size={12} className="text-emerald-600" />
                        <span>Listen (Human Voice)</span>
                      </>
                    )}
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
              <span className="text-[10px] text-slate-400 font-medium">System Processing...</span>
            </div>
          </div>
        )}
        {messages.length >= 2 && !isLoading && (
          <div className="flex justify-center my-3 animate-in fade-in zoom-in-95">
            <button
              onClick={() => analyzeAndTriage()}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-full text-xs font-bold shadow-lg shadow-emerald-600/25 transition active:scale-95 border border-emerald-500/30"
            >
              <CheckCircle size={15} />
              Finish & Send Case to Doctor's Queue
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="max-w-4xl mx-auto w-full">
        {currentView === 'CONSULT_VOICE' ? (
          <div className="flex flex-col items-center gap-3 py-3">
            {/* MULTILINGUAL LANGUAGE SELECTION PILLS */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full px-1 pb-1">
              {[
                { code: 'hi-IN', label: '🇮🇳 हिन्दी (Hindi)' },
                { code: 'en-IN', label: '🇬🇧 English' },
                { code: 'pa-IN', label: '🇮🇳 ਪੰਜਾਬੀ (Punjabi)' },
                { code: 'gu-IN', label: '🇮🇳 ગુજરાતી (Gujarati)' },
                { code: 'mr-IN', label: '🇮🇳 मराठी (Marathi)' },
                { code: 'bn-IN', label: '🇮🇳 বাংলা (Bengali)' },
                { code: 'ta-IN', label: '🇮🇳 தமிழ் (Tamil)' },
                { code: 'te-IN', label: '🇮🇳 తెలుగు (Telugu)' },
              ].map(lang => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setSpeechInputLang(lang.code);
                    if (recognitionRef.current) {
                      try { recognitionRef.current.lang = lang.code; } catch (e) {}
                    }
                  }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition active:scale-95 ${
                    speechInputLang === lang.code
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            {/* LIVE VOICE EQUALIZER / SPEAKING STATUS */}
            {isVoiceSpeaking && (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm animate-pulse">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                <span>AI Doctor Speaking (Human Neural Voice)...</span>
                <button
                  onClick={() => stopRealisticVoice()}
                  className="ml-2 text-red-600 hover:text-red-800 bg-white px-2 py-0.5 rounded-md text-[10px] border border-red-200 font-bold"
                >
                  Stop
                </button>
              </div>
            )}

            <div className="flex items-center gap-4">
              <button
                onClick={isListening ? () => recognitionRef.current?.stop() : () => startListening()}
                disabled={isLoading}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-red-500 shadow-xl shadow-red-500/50 scale-110 ring-4 ring-red-200 animate-pulse'
                    : isVoiceSpeaking
                    ? 'bg-emerald-500 shadow-lg shadow-emerald-500/40 ring-4 ring-emerald-100'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-lg hover:scale-105 active:scale-95'
                } disabled:opacity-50 text-white`}
              >
                <Mic size={28} />
              </button>
            </div>
            
            <p className="text-xs text-slate-500 font-medium text-center">
              {isListening
                ? `🎙️ Listening in ${speechInputLang.split('-')[0].toUpperCase()}... (Speak freely)`
                : isVoiceSpeaking
                ? '🔊 Listening to AI Doctor voice...'
                : isLoading
                ? '⚡ Processing clinical advice...'
                : 'Tap microphone to speak (Multi-lingual supported)'}
            </p>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageSelect}
              disabled={isLoading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="p-3 text-slate-400 hover:bg-slate-100 rounded-full transition disabled:opacity-30"
            >
              <ImageIcon size={20} />
            </button>
            <div className="flex-1 bg-slate-100 rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-emerald-500">
              <textarea
                value={inputText}
                disabled={isLoading}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(inputText);
                  }
                }}
                placeholder="Describe symptoms here..."
                className="w-full bg-transparent border-0 focus:ring-0 text-sm resize-none max-h-20"
                rows={1}
              />
            </div>
            <button
              onClick={() => handleSend(inputText)}
              disabled={!inputText.trim() || isLoading}
              className="p-3 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );

  const renderTriageResult = () => {
    if (!triageResult) return null;
    const isSerious = triageResult.severity === CaseSeverity.MODERATE || triageResult.severity === CaseSeverity.CRITICAL;

    return (
      <div className="flex flex-col h-full bg-slate-50 overflow-y-auto animate-in slide-in-from-bottom-8 duration-700">
        <div className="p-4 sm:p-6 lg:p-8 max-w-2xl w-full mx-auto">
          <div className={`p-6 rounded-2xl shadow-sm border mb-6 text-center ${isSerious ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
            }`}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isSerious ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
              }`}>
              <Activity size={32} />
            </div>
            <h2 className={`text-xl font-bold mb-2 ${isSerious ? 'text-red-800' : 'text-emerald-800'}`}>
              {isSerious ? 'Doctor Consultation Recommended' : 'Mild Condition Detected'}
            </h2>
            <p className="text-slate-600 text-sm">
              {triageResult.diagnosis}
            </p>
            <div className="mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Severity Level: {triageResult.severity}
            </div>
          </div>

          {!isSerious && triageResult.homeRemedies && triageResult.homeRemedies.length > 0 && (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">🌿 Home Remedies</h3>
              <ul className="space-y-2">
                {triageResult.homeRemedies.map((remedy, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0"></span>
                    {remedy}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            {isSerious ? (
              <>
                <button
                  onClick={() => handleFinalSubmit(true, 'VIDEO')}
                  className="w-full py-4 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3 hover:bg-emerald-700 transition"
                >
                  <Video size={20} /> Connect to Doctor (Video)
                </button>
                <button
                  onClick={() => handleFinalSubmit(true, 'VOICE')}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-3 hover:bg-blue-700 transition"
                >
                  <Phone size={20} /> Voice Call Doctor
                </button>
                <button
                  onClick={() => setCurrentView('BOOK_APPOINTMENT')}
                  className="w-full py-4 bg-white text-slate-700 border border-slate-200 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-slate-50 transition"
                >
                  <Calendar size={20} /> Book Appointment
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleFinalSubmit(true)}
                  className="w-full py-4 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3 hover:bg-emerald-700 transition"
                >
                  <Truck size={20} /> Request Medicine Delivery
                </button>
                <button
                  onClick={() => handleFinalSubmit(false)}
                  className="w-full py-4 bg-white text-slate-600 border border-slate-200 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-slate-50 transition"
                >
                  I'll use Home Remedies
                </button>
              </>
            )}
            {/* Back to Home Button triggers Feedback flow as per objective */}
            <button
              onClick={() => setCurrentView('FEEDBACK')}
              className="w-full py-4 bg-white text-slate-700 border border-slate-200 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-slate-50 transition"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderLocateNearby = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
        <button onClick={() => setCurrentView('HOME')}><ArrowLeft size={24} className="text-slate-500" /></button>
        <h2 className="font-bold text-slate-800">Nearby Healthcare</h2>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 z-0"></div>

        <div className="z-10 p-3 sm:p-4 h-full flex flex-col pointer-events-none md:w-[460px]">
          {/* SEARCH & GPS CONTROL BAR */}
          <div className="space-y-2 pointer-events-auto mb-2 md:mb-3 animate-in zoom-in-95 fade-in duration-500">
            <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-1.5">
              <button
                onClick={detectLocation}
                disabled={locationLoading}
                title="Use Current Device GPS"
                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl transition flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20"
              >
                {locationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation size={18} />}
              </button>
              
              <input
                type="text"
                value={locationSearchQuery}
                onChange={e => setLocationSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLocationSearch();
                  }
                }}
                placeholder="Search City, Village, or Pincode..."
                className="flex-1 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              <button
                onClick={() => handleLocationSearch()}
                disabled={isSearchingLocation || !locationSearchQuery.trim()}
                className="p-2.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl transition flex items-center justify-center shrink-0 disabled:opacity-40"
              >
                {isSearchingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search size={16} />}
              </button>
            </div>

            {/* QUICK LOCATION PILLS */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {['Kishangarh', 'Ajmer', 'Jaipur', 'Pushkar'].map((city) => (
                <button
                  key={city}
                  onClick={() => {
                    setLocationSearchQuery(city);
                    handleLocationSearch(city);
                  }}
                  className="px-2.5 py-1 bg-white/90 backdrop-blur-sm border border-slate-200 hover:border-emerald-500 text-[10px] font-bold text-slate-700 rounded-full shadow-sm whitespace-nowrap transition active:scale-95"
                >
                  📍 {city}
                </button>
              ))}
            </div>

            {detectedPlaceName && (
              <div className="bg-emerald-50/95 backdrop-blur-sm border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 shadow-sm animate-in fade-in slide-in-from-top-2">
                <MapPin size={13} className="text-emerald-600 shrink-0" />
                <span className="truncate">{detectedPlaceName}</span>
              </div>
            )}
          </div>

          {nearbyHospitals.length > 0 && (
            <div
              className="bg-white rounded-t-3xl md:rounded-2xl shadow-[0_-10px_30px_-5px_rgba(0,0,0,0.15)] md:shadow-2xl max-h-[65%] md:max-h-[calc(100%-140px)] overflow-hidden flex flex-col pointer-events-auto -mx-3 sm:-mx-4 md:mx-0 animate-in slide-in-from-bottom-8 md:slide-in-from-left-4 fade-in duration-500 border border-slate-200"
            >
              {/* DRAWER HEADER & CATEGORY TABS */}
              <div className="p-3 sm:p-4 border-b border-slate-100 bg-white sticky top-0 z-10 space-y-2.5">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                      <span>Nearby Healthcare Facilities</span>
                      <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                        {nearbyHospitals.length} Found
                      </span>
                    </h3>
                    <p className="text-[10px] sm:text-xs text-slate-500">Real-time GPS medical directory & emergency services</p>
                  </div>
                </div>

                {/* FACILITY CATEGORY PILLS */}
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {[
                    { key: 'ALL', label: 'All (12+)', icon: '🏥' },
                    { key: 'HOSPITAL', label: 'Hospitals', icon: '🏛️' },
                    { key: 'CLINIC', label: 'Clinics & PHC', icon: '🩺' },
                    { key: 'PHARMACY', label: '24x7 Medicos', icon: '💊' },
                    { key: 'PATHOLOGY_LAB', label: 'Diagnostic Labs', icon: '🧪' },
                    { key: 'AMBULANCE_HUB', label: '108 Ambulance', icon: '🚑' },
                    { key: 'AYURVEDA', label: 'Ayush & Herbal', icon: '🍃' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setFacilityTypeFilter(tab.key as any)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 active:scale-95 ${
                        facilityTypeFilter === tab.key
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/60'
                      }`}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* FACILITIES LIST */}
              <div className="p-3 space-y-3 overflow-y-auto flex-1 bg-slate-50">
                {nearbyHospitals
                  .filter(h => {
                    if (facilityTypeFilter === 'ALL') return true;
                    return h.type === facilityTypeFilter;
                  })
                  .map((hospital, index) => {
                    const isHospitalOrClinic = hospital.type === 'HOSPITAL' || hospital.type === 'CLINIC';
                    const isPharmacy = hospital.type === 'PHARMACY';
                    const isLab = hospital.type === 'PATHOLOGY_LAB';
                    const isAmbulance = hospital.type === 'AMBULANCE_HUB';
                    const isAyurveda = hospital.type === 'AYURVEDA';

                    const badgeColor = isHospitalOrClinic
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : isPharmacy
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : isLab
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : isAmbulance
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-teal-50 text-teal-700 border-teal-200';

                    const typeIcon = isHospitalOrClinic ? (
                      <Building size={12} />
                    ) : isPharmacy ? (
                      <Pill size={12} />
                    ) : isLab ? (
                      <FlaskConical size={12} />
                    ) : isAmbulance ? (
                      <Ambulance size={12} />
                    ) : (
                      <Leaf size={12} />
                    );

                    return (
                      <div
                        key={hospital.id}
                        className="bg-white p-3.5 border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-300 transition group animate-in zoom-in-95 fade-in duration-300"
                        style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
                      >
                        {/* CARD HEADER */}
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold border flex items-center gap-1 uppercase tracking-wider ${badgeColor}`}>
                            {typeIcon} {hospital.type?.replace('_', ' ') || 'FACILITY'}
                          </span>
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                            {hospital.timings || 'Open 24x7'}
                          </span>
                        </div>

                        {/* FACILITY NAME & ADDRESS */}
                        <h4 className="font-bold text-slate-900 text-sm group-hover:text-emerald-700 transition leading-tight">
                          {hospital.name}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 flex items-center gap-1">
                          <MapPin size={11} className="text-slate-400 shrink-0" />
                          <span>{hospital.address}</span>
                        </p>

                        {/* DISTANCE & FEES ROW */}
                        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px]">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono font-bold flex items-center gap-1">
                            📍 {hospital.distance || '0.0 km'}
                          </span>
                          {hospital.travelTime && (
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                              <Clock size={11} /> {hospital.travelTime}
                            </span>
                          )}
                          <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-md font-bold">
                            {hospital.consultationFee === 0 ? 'FREE OPD / GOVT' : `OPD Fee: ₹${hospital.consultationFee}`}
                          </span>
                        </div>

                        {/* TAGS */}
                        {hospital.tags && hospital.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {hospital.tags.map((tag, tIdx) => (
                              <span key={tIdx} className="text-[9px] bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                                ✓ {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* ACTION BUTTONS */}
                        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
                          {hospital.phone && (
                            <a
                              href={`tel:${hospital.phone.replace(/[^0-9+]/g, '')}`}
                              className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 border border-slate-200"
                            >
                              <Phone size={13} className="text-emerald-600" />
                              <span>Call Facility</span>
                            </a>
                          )}

                          {hospital.url && (
                            <a
                              href={hospital.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 border border-blue-200"
                            >
                              <Navigation size={13} className="text-blue-600" />
                              <span>Directions</span>
                            </a>
                          )}

                          {isHospitalOrClinic && (
                            <button
                              onClick={() => openBookingForHospital(hospital)}
                              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20"
                            >
                              <Calendar size={13} />
                              <span>Book Appt</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          {userLocation && nearbyHospitals.length === 0 && !locationLoading && (
            <div
              className="mt-auto bg-white p-6 rounded-t-2xl shadow-lg pointer-events-auto -mx-4 text-center animate-in slide-in-from-bottom-8 fade-in duration-500"
              style={{ animationDelay: '500ms', animationFillMode: 'both' }}
            >
              <MapPin className="mx-auto text-slate-300 mb-2" size={32} />
              <p className="text-sm font-bold text-slate-800">No facilities found within 10km.</p>
              <p className="text-xs text-slate-500">Try zooming out or moving to a different area.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderBooking = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
        <button onClick={() => setCurrentView('HOME')}><ArrowLeft size={24} className="text-slate-500" /></button>
        <h2 className="font-bold text-slate-800">Book Appointment</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="max-w-2xl mx-auto w-full">
        <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm animate-in zoom-in-95 fade-in duration-300" style={{ animationDelay: '75ms', animationFillMode: 'both' }}>
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-2">Hospital / Clinic</h3>
          <p className="text-lg font-bold text-slate-800">{selectedHospital ? selectedHospital.name : 'Online Consultation'}</p>
          <p className="text-sm text-slate-500">{selectedHospital ? selectedHospital.address : 'Video Call'}</p>
        </div>

        {/* Consultation Mode Selection */}
        <div className="mb-6 animate-in zoom-in-95 fade-in duration-300" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Consultation Mode</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConsultationType('ONLINE_VIDEO')}
              className={`p-3.5 rounded-xl border flex flex-col items-center text-center gap-1.5 transition cursor-pointer ${
                consultationType === 'ONLINE_VIDEO'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <Video size={24} className={consultationType === 'ONLINE_VIDEO' ? 'text-emerald-600' : 'text-slate-400'} />
              <span className="text-sm font-bold">Online Video Call</span>
              <span className="text-[10px] text-slate-500">Live Doctor Teleconsultation (HD)</span>
            </button>
            <button
              type="button"
              onClick={() => setConsultationType('IN_PERSON')}
              className={`p-3.5 rounded-xl border flex flex-col items-center text-center gap-1.5 transition cursor-pointer ${
                consultationType === 'IN_PERSON'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <Stethoscope size={24} className={consultationType === 'IN_PERSON' ? 'text-emerald-600' : 'text-slate-400'} />
              <span className="text-sm font-bold">In-Person Visit</span>
              <span className="text-[10px] text-slate-500">Clinic / Hospital Desk Appointment</span>
            </button>
          </div>
        </div>

        <div className="mb-6 animate-in zoom-in-95 fade-in duration-300" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Select Doctor</label>
          <select
            value={apptDoctor}
            onChange={(e) => setApptDoctor(e.target.value)}
            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option>Dr. A. Sharma (General Physician)</option>
            <option>Dr. P. Kaur (Cardiologist)</option>
            <option>Dr. R. Singh (Pediatrician)</option>
          </select>
        </div>
        <div className="mb-6 animate-in zoom-in-95 fade-in duration-300" style={{ animationDelay: '225ms', animationFillMode: 'both' }}>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Select Date</label>
          <input
            type="date"
            value={apptDate}
            onChange={(e) => setApptDate(e.target.value)}
            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* Time Slot Selection */}
        <div className="mb-6 animate-in zoom-in-95 fade-in duration-300" style={{ animationDelay: '260ms', animationFillMode: 'both' }}>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Select Time Slot</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              '09:30 AM - 10:00 AM',
              '10:30 AM - 11:00 AM',
              '11:30 AM - 12:00 PM',
              '02:00 PM - 02:30 PM',
              '03:30 PM - 04:00 PM',
              '05:00 PM - 05:30 PM',
              '06:30 PM - 07:00 PM'
            ].map(slot => (
              <button
                key={slot}
                type="button"
                onClick={() => setApptTimeSlot(slot)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  apptTimeSlot === slot
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 animate-in zoom-in-95 fade-in duration-300" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
          <label className="block text-sm font-semibold text-slate-700 mb-3">Payment Method</label>
          <div className="space-y-3">
            <button
              onClick={() => setPaymentMethod('UPI')}
              className={`w-full flex items-center p-3 border rounded-xl transition ${paymentMethod === 'UPI' ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'border-slate-200 bg-white'}`}
            >
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mr-3">
                <Smartphone size={20} className="text-slate-600" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-sm">UPI / GPay / PhonePe</p>
                <p className="text-xs text-slate-500">Fast & Secure</p>
              </div>
              <div className="text-right">
                {paymentMethod === 'UPI' && <CheckCircle size={20} className="text-emerald-600" />}
              </div>
            </button>
            <button
              onClick={() => setPaymentMethod('CARD')}
              className={`w-full flex items-center p-3 border rounded-xl transition ${paymentMethod === 'CARD' ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'border-slate-200 bg-white'}`}
            >
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mr-3">
                <CreditCard size={20} className="text-slate-600" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-sm">Debit / Credit Card</p>
                <p className="text-xs text-slate-500">Visa, MasterCard, RuPay</p>
              </div>
              <div className="text-right">
                {paymentMethod === 'CARD' && <CheckCircle size={20} className="text-emerald-600" />}
              </div>
            </button>
            <button
              onClick={() => setPaymentMethod('CASH')}
              className={`w-full flex items-center p-3 border rounded-xl transition ${paymentMethod === 'CASH' ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'border-slate-200 bg-white'}`}
            >
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mr-3">
                <Banknote size={20} className="text-slate-600" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-sm">Pay at Clinic</p>
                <p className="text-xs text-slate-500">Cash counter payment</p>
              </div>
              <div className="text-right">
                {paymentMethod === 'CASH' && <CheckCircle size={20} className="text-emerald-600" />}
              </div>
            </button>
          </div>
        </div>

        <div className="flex flex-col animate-in zoom-in-95 fade-in duration-300" style={{ animationDelay: '375ms', animationFillMode: 'both' }}>
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-sm font-medium text-slate-600">Total Consultation Fee</span>
            <span className="text-xl font-bold text-slate-900">₹{selectedHospital?.consultationFee || (consultationType === 'ONLINE_VIDEO' ? 150 : 200)}</span>
          </div>

          <button
            onClick={handleBookingSubmit}
            disabled={!apptDate || isPaymentProcessing}
            className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20"
          >
            {isPaymentProcessing ? (
              <>
                <Loader2 className="animate-spin" /> Processing...
              </>
            ) : (
              <>
                {paymentMethod === 'CASH' ? 'Confirm Booking' : `Pay ₹${selectedHospital?.consultationFee || (consultationType === 'ONLINE_VIDEO' ? 150 : 200)} & Confirm`}
              </>
            )}
          </button>
        </div>
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-3">
        <button onClick={() => setCurrentView('HOME')}><ArrowLeft size={24} className="text-slate-500" /></button>
        <h2 className="font-bold text-slate-800">My Medical History</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto w-full space-y-6">

        {appointments.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 ml-1">Upcoming Appointments</h3>
            <div className="space-y-3">
              {appointments.map(apt => (
                <div key={apt.id} className="bg-white p-4 rounded-xl shadow-sm border border-l-4 border-purple-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800">{apt.doctorName}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                          {apt.consultationType === 'ONLINE_VIDEO' ? <Video size={10} /> : <Stethoscope size={10} />}
                          {apt.consultationType === 'ONLINE_VIDEO' ? 'Online Video' : 'In-Person'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {new Date(apt.date).toLocaleDateString()} • {apt.timeSlot || 'Scheduled Time'} • {apt.hospitalName || 'Online'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded-full block mb-1">{apt.status}</span>
                      {apt.paymentStatus === 'PAID' && <span className="text-[10px] text-green-600 font-bold flex items-center justify-end gap-1"><CheckCircle size={10} /> Paid ₹{apt.amount}</span>}
                      {apt.paymentStatus === 'PAY_AT_CLINIC' && <span className="text-[10px] text-amber-600 font-bold">Pay at Clinic</span>}
                    </div>
                  </div>

                  {apt.consultationType === 'ONLINE_VIDEO' && apt.status !== 'COMPLETED' && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-mono">Room ID: <strong className="text-emerald-700">{apt.meetingRoomId || 'Ready'}</strong></span>
                      <button
                        onClick={() => {
                          if (onStartVideoCall) {
                            onStartVideoCall({
                              roomId: apt.meetingRoomId || `room-${apt.id}`,
                              appointmentId: apt.id,
                              patientId: user.id,
                              patientName: user.name,
                              doctorId: apt.doctorId,
                              doctorName: apt.doctorName,
                              isEmergency: false
                            });
                          }
                        }}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                      >
                        <Video size={14} /> Join Video Consultation
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 ml-1">Past Consultations</h3>
          <div className="space-y-3">
            {patientHistory.map(c => (
              <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-slate-800">{c.aiDiagnosis}</h3>
                    <p className="text-xs text-slate-500">{new Date(c.timestamp).toLocaleString()}</p>
                  </div>
                  <span className={`px-2 py-1 text-[10px] rounded-full font-bold uppercase ${c.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                    {c.severity}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-3 line-clamp-2">{c.transcript[0]?.text}</p>
                {c.prescription && (
                  <div className="bg-emerald-50 p-2 rounded border border-emerald-100 text-xs text-emerald-800 font-medium flex items-start gap-2">
                    <span>💊</span>
                    <span>{c.prescription}</span>
                  </div>
                )}
              </div>
            ))}
            {patientHistory.length === 0 && (
              <div className="text-center text-slate-400 py-8 italic bg-slate-100 rounded-xl border border-dashed border-slate-300">No past consultations found.</div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );

  const renderFeedback = () => (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-slate-50 text-center">
      <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 max-w-sm w-full">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-4">
          <ShieldCheck size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Case Recorded</h2>
        <p className="text-slate-500 mb-6 text-sm">
          Your interaction has been saved. Help us improve by rating your experience.
        </p>

        <div className="flex justify-center gap-2 mb-6" onMouseLeave={() => setHoverRating(null)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setFeedbackRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              className={`p-1 transition-all hover:scale-110 ${feedbackRating >= star || (hoverRating !== null && hoverRating >= star) ? 'text-amber-400 fill-current' : 'text-slate-300'}`}
            >
              <Star size={32} fill={feedbackRating >= star || (hoverRating !== null && hoverRating >= star) ? "currentColor" : "none"} />
            </button>
          ))}
        </div>

        <textarea
          placeholder="Optional comments..."
          value={feedbackComment}
          onChange={(e) => setFeedbackComment(e.target.value)}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={3}
        />

        <button
          onClick={submitFeedback}
          className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
        >
          Submit Feedback
        </button>

        <button
          onClick={() => setCurrentView('HOME')}
          className="w-full py-3 mt-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition"
        >
          Back to Home
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-0 md:p-3 bg-slate-100/60 overflow-hidden">
      <div className="h-full w-full max-w-7xl bg-white shadow-xl md:rounded-2xl overflow-hidden border-0 md:border md:border-slate-200/80 relative flex flex-col">
        <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-blue-500 w-full shrink-0"></div>

        {currentView === 'HOME' && renderHome()}
        {(currentView === 'CONSULT_CHAT' || currentView === 'CONSULT_VOICE') && renderConsultation()}
        {currentView === 'TRIAGE_RESULT' && renderTriageResult()}
        {currentView === 'BOOK_APPOINTMENT' && renderBooking()}
        {currentView === 'LOCATE_NEARBY' && renderLocateNearby()}
        {currentView === 'DOCTOR_CONNECT' && (
          <div className="flex flex-col h-full bg-slate-900 items-center justify-center text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-900/20 animate-pulse"></div>
            <Video size={48} className="text-white z-10 animate-bounce" />
            <p className="mt-4 font-bold text-lg z-10">Connecting to Doctor...</p>
            <p className="text-xs text-white/60 uppercase tracking-widest mt-2">Critical Priority Escalation</p>
          </div>
        )}
        {currentView === 'HISTORY' && renderHistory()}
        {currentView === 'FEEDBACK' && renderFeedback()}

        {currentView === 'HOME_REMEDIES' && renderHomeRemedies()}
        {currentView === 'WELLNESS_HUB' && renderWellnessHub()}
        {currentView === 'DOCTOR_TIPS' && renderDoctorTips()}

        {currentView === 'HOME' && (
          <div className="absolute top-4 right-4 md:hidden">
            <button onClick={onLogout} className="p-2 bg-slate-100 rounded-full hover:bg-red-50 hover:text-red-600 transition">
              <LogOut size={18} />
            </button>
          </div>
        )}

        <div className="hidden"><Truck /><UserPlus /></div>
      </div>
    </div>
  );
};

export default PatientPortal;
