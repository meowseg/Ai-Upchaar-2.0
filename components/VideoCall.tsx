import React, { useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Clock, FileText,
  CheckCircle, Stethoscope, AlertTriangle, Maximize2, Minimize2,
  ShieldCheck, ChevronRight, Volume2, VolumeX, Copy, Check, Users, RefreshCw
} from 'lucide-react';
import { ActiveVideoSession, User, UserRole } from '../types';

interface VideoCallProps {
  session: ActiveVideoSession;
  currentUser: User;
  onEndCall: (doctorNotes?: string, prescription?: string) => void;
}

export const VideoCall: React.FC<VideoCallProps> = ({ session, currentUser, onEndCall }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingChannelRef = useRef<BroadcastChannel | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const heartbeatTimerRef = useRef<any>(null);
  const processedSignalIds = useRef<Set<string | number>>(new Set());
  const lastSeenSignalId = useRef<number>(0);
  const handleIncomingSignalRef = useRef<((data: any) => Promise<void>) | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // States
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'INITIALIZING' | 'WAITING_PEER' | 'CONNECTING' | 'CONNECTED'>('INITIALIZING');
  const [peerName, setPeerName] = useState<string>('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [hasCopiedRoom, setHasCopiedRoom] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Doctor clinical notes & prescription states
  const [doctorNotes, setDoctorNotes] = useState('');
  const [prescriptionText, setPrescriptionText] = useState(session.prescription || '');
  const [isRxSaved, setIsRxSaved] = useState(false);

  const isDoctor = currentUser.role === UserRole.DOCTOR;
  const otherRoleName = isDoctor
    ? (session.patientName || 'Patient')
    : (session.doctorName || 'Dr. A. Sharma');

  const cleanRoomCode = (session.roomId || 'upchaar-consultation').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

  // 1. Call duration timer (runs once connected or in-call)
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 2. Broadcast signaling helper (BroadcastChannel + LocalStorage + Serverless DB Signaling API)
  const sendSignal = (data: any) => {
    const payload = {
      ...data,
      senderId: currentUser.id,
      senderRole: currentUser.role,
      senderName: currentUser.name,
      room: cleanRoomCode,
      timestamp: Date.now()
    };

    // 1. BroadcastChannel (instant same-session delivery)
    if (signalingChannelRef.current) {
      try {
        signalingChannelRef.current.postMessage(payload);
      } catch (e) {
        console.warn('BroadcastChannel postMessage error:', e);
      }
    }

    // 2. LocalStorage event (same-profile cross-window fallback)
    try {
      localStorage.setItem(`praansewa_signal_${cleanRoomCode}`, JSON.stringify(payload));
    } catch (e) {}

    // 3. Server HTTP API (/api/signal) for Cross-Browser / Incognito / Cross-Device Signaling
    fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: cleanRoomCode,
        senderId: currentUser.id,
        senderRole: currentUser.role,
        senderName: currentUser.name,
        type: data.type,
        payload: payload
      })
    }).catch(() => {});
  };

  // 3. Initialize Local Media (Camera & Mic) and PeerConnection
  useEffect(() => {
    let isCancelled = false;

    const startLocalMedia = async () => {
      try {
        setConnectionStatus('INITIALIZING');
        setMediaError(null);

        // Request HD camera & mic with optimal constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Initialize WebRTC PeerConnection with Google, Cloudflare & Mozilla STUN servers
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.services.mozilla.com' }
          ]
        });

        peerConnectionRef.current = pc;

        // Add local tracks to PeerConnection
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });

        // Remote track received handler (handles streams array or individual tracks)
        pc.ontrack = (event) => {
          console.log('✅ Remote track received:', event.track.kind, event.streams);
          let streamToDisplay = (event.streams && event.streams[0]) ? event.streams[0] : null;
          if (!streamToDisplay) {
            if (!remoteStreamRef.current) {
              remoteStreamRef.current = new MediaStream();
            }
            remoteStreamRef.current.addTrack(event.track);
            streamToDisplay = remoteStreamRef.current;
          } else {
            remoteStreamRef.current = streamToDisplay;
          }

          setRemoteStream(streamToDisplay);
          setConnectionStatus('CONNECTED');

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = streamToDisplay;
            remoteVideoRef.current.play().catch(e => console.warn('Remote video play error:', e));
          }
        };

        // ICE Candidate generated -> broadcast to peer
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignal({
              type: 'ICE_CANDIDATE',
              candidate: event.candidate.toJSON()
            });
          }
        };

        pc.onconnectionstatechange = () => {
          console.log('WebRTC Connection state:', pc.connectionState);
          if (pc.connectionState === 'connected') {
            setConnectionStatus('CONNECTED');
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            setConnectionStatus('WAITING_PEER');
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('WebRTC ICE state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            setConnectionStatus('CONNECTED');
          }
        };

        // Setup Signaling Channel
        const channel = new BroadcastChannel(`praansewa_call_${cleanRoomCode}`);
        signalingChannelRef.current = channel;

        const handleIncomingSignal = async (data: any) => {
          if (!data) return;

          // Reject signals from self or other rooms
          if (data.senderId && data.senderId === currentUser.id) return;
          if (data.senderRole && data.senderRole === currentUser.role) return;
          if (data.room && data.room.replace(/[^a-zA-Z0-9_-]/g, '') !== cleanRoomCode) return;

          // Deduplicate signals
          const sigKey = data.id 
            ? String(data.id)
            : `${data.type}_${data.senderRole || ''}_${data.timestamp || ''}_${data.sdp ? data.sdp.slice(0, 20) : ''}_${data.candidate?.candidate ? data.candidate.candidate.slice(0, 20) : ''}`;
          if (processedSignalIds.current.has(sigKey)) return;
          processedSignalIds.current.add(sigKey);

          if (data.senderName) {
            setPeerName(data.senderName);
          }

          try {
            if (data.type === 'PING') {
              // Peer is active in room
              if (connectionStatus === 'WAITING_PEER') {
                setConnectionStatus('CONNECTING');
              }

              // Doctor acts as offerer
              if (isDoctor && pc.signalingState === 'stable') {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendSignal({
                  type: 'OFFER',
                  sdp: offer.sdp
                });
              } else if (!isDoctor) {
                // Patient acknowledges doctor's presence
                sendSignal({ type: 'PING_ACK' });
              }
            } else if (data.type === 'PING_ACK') {
              // Received peer acknowledgement
              if (isDoctor && pc.signalingState === 'stable') {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendSignal({
                  type: 'OFFER',
                  sdp: offer.sdp
                });
              }
            } else if (data.type === 'OFFER' && !isDoctor) {
              console.log('Received WebRTC Offer, sending Answer...');
              setConnectionStatus('CONNECTING');
              await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));

              // Process any queued ICE candidates
              while (iceQueueRef.current.length > 0) {
                const c = iceQueueRef.current.shift();
                if (c) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(c));
                  } catch (e) {}
                }
              }

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendSignal({
                type: 'ANSWER',
                sdp: answer.sdp
              });
            } else if (data.type === 'ANSWER' && isDoctor) {
              console.log('Received WebRTC Answer, setting remote description...');
              await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));

              // Process any queued ICE candidates
              while (iceQueueRef.current.length > 0) {
                const c = iceQueueRef.current.shift();
                if (c) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(c));
                  } catch (e) {}
                }
              }

              setConnectionStatus('CONNECTED');
            } else if (data.type === 'ICE_CANDIDATE' && data.candidate) {
              if (pc.remoteDescription && pc.remoteDescription.type) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {}
              } else {
                iceQueueRef.current.push(data.candidate);
              }
            } else if (data.type === 'HANGUP') {
              setConnectionStatus('WAITING_PEER');
              setRemoteStream(null);
            }
          } catch (err) {
            console.warn('Signaling processing error:', err);
          }
        };

        handleIncomingSignalRef.current = handleIncomingSignal;
        channel.onmessage = (e) => handleIncomingSignal(e.data);

        // Storage listener for cross-window / tab fallback
        const handleStorageSignal = (e: StorageEvent) => {
          if (e.key === `praansewa_signal_${cleanRoomCode}` && e.newValue) {
            try {
              const parsed = JSON.parse(e.newValue);
              handleIncomingSignal(parsed);
            } catch (err) {}
          }
        };
        window.addEventListener('storage', handleStorageSignal);

        // Send periodic PING heartbeat so joining peers immediately discover each other
        setConnectionStatus('WAITING_PEER');
        sendSignal({ type: 'PING' });

        heartbeatTimerRef.current = setInterval(() => {
          sendSignal({ type: 'PING' });
        }, 1500);

      } catch (err: any) {
        console.error('Error starting video consultation hardware:', err);
        setMediaError(err.message || 'Unable to access Camera & Microphone. Please ensure permissions are granted.');
      }
    };

    startLocalMedia();

    return () => {
      isCancelled = true;
      handleIncomingSignalRef.current = null;
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (signalingChannelRef.current) signalingChannelRef.current.close();

      sendSignal({ type: 'HANGUP' });

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [cleanRoomCode]);

  // 4. Server Polling Effect for Cross-Browser / Incognito / Cross-Device Signaling
  useEffect(() => {
    let isSubscribed = true;

    const pollServerSignals = async () => {
      if (!handleIncomingSignalRef.current) return;
      try {
        const queryParams = new URLSearchParams({
          room: cleanRoomCode,
          sinceId: String(lastSeenSignalId.current),
          excludeRole: currentUser.role || '',
          excludeId: currentUser.id || ''
        });

        const res = await fetch(`/api/signal?${queryParams.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isSubscribed) return;

        if (data && Array.isArray(data.signals)) {
          for (const item of data.signals) {
            if (item.id && typeof item.id === 'number' && item.id > lastSeenSignalId.current) {
              lastSeenSignalId.current = item.id;
            }
            const sigPayload = item.payload && item.payload.type ? { ...item.payload, id: item.id } : item;
            if (handleIncomingSignalRef.current) {
              await handleIncomingSignalRef.current(sigPayload);
            }
          }
        }

        if (data && typeof data.lastId === 'number' && data.lastId > lastSeenSignalId.current) {
          lastSeenSignalId.current = data.lastId;
        }
      } catch (err) {}
    };

    const pollInterval = setInterval(pollServerSignals, 800);
    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    };
  }, [cleanRoomCode, currentUser.role, currentUser.id]);

  // Keep remote video attached to remoteStream if it changes
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.warn('Remote video play error:', e));
    }
  }, [remoteStream]);

  // Toggle Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(t => {
        t.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  // Toggle Video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(t => {
        t.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  // Copy Room Code
  const handleCopyRoom = () => {
    navigator.clipboard.writeText(cleanRoomCode);
    setHasCopiedRoom(true);
    setTimeout(() => setHasCopiedRoom(false), 2000);
  };

  const handleEndCall = () => {
    onEndCall(doctorNotes, prescriptionText);
  };

  // Quick Prescription Templates for Doctor
  const applyQuickRx = (template: string) => {
    if (template === 'FEVER') {
      setPrescriptionText(
        '1. Tab Paracetamol 650mg - 1 tab thrice daily after meals x 3 days\n' +
        '2. Tab Levocetirizine 5mg - 1 tab at bedtime x 5 days\n' +
        '3. ORS hydration solution - 500ml daily\n' +
        '4. Cold water sponge forehead if temp > 101°F'
      );
    } else if (template === 'GASTRO') {
      setPrescriptionText(
        '1. Tab Pantoprazole 40mg - 1 tab once daily empty stomach x 5 days\n' +
        '2. Cap Probiotics - 1 cap twice daily after food x 5 days\n' +
        '3. Electral ORS in 1 Liter boiled water sip throughout day\n' +
        '4. Soft diet: Khichdi, curd, banana'
      );
    } else if (template === 'INFECTION') {
      setPrescriptionText(
        '1. Tab Amoxicillin-Clav 625mg - 1 tab twice daily after meals x 5 days\n' +
        '2. Tab Paracetamol 650mg - SOS for pain or fever\n' +
        '3. Warm salt water gargle 3 times a day\n' +
        '4. Review after 3 days if symptoms persist'
      );
    }
    setIsRxSaved(false);
  };

  return (
    <div className={`flex flex-col h-full w-full bg-slate-950 text-white relative overflow-hidden ${isFullscreen ? 'fixed inset-0 z-[100]' : ''}`}>
      {/* ───────────────── TOP TELEHEALTH HEADER BAR ───────────────── */}
      <div className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-950">
            <Stethoscope size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm sm:text-base text-white">
                Live Video Teleconsultation
              </h2>
              {session.isEmergency ? (
                <span className="bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                  <AlertTriangle size={10} /> Emergency SOS
                </span>
              ) : (
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                  connectionStatus === 'CONNECTED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'CONNECTED' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'}`} />
                  {connectionStatus === 'CONNECTED' ? 'Live Connected' : 'Waiting for Peer'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span>Patient: <strong className="text-slate-200">{session.patientName || 'Patient'}</strong></span>
              <span>•</span>
              <span>Doctor: <strong className="text-emerald-300">{isDoctor ? currentUser.name : (session.doctorName || 'Dr. A. Sharma')}</strong></span>
              <span>•</span>
              <button
                onClick={handleCopyRoom}
                className="font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer bg-slate-800 px-1.5 py-0.5 rounded text-[11px]"
                title="Click to copy room code"
              >
                <span>Room: {cleanRoomCode}</span>
                {hasCopiedRoom ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              </button>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Duration Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-mono text-emerald-300">
            <Clock size={13} className="text-emerald-400" />
            <span>{formatDuration(callDuration)}</span>
          </div>

          {/* Toggle Clinical Sidebar */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
              isSidebarOpen ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Toggle Clinical Notes Sidebar"
          >
            <FileText size={16} />
            <span className="hidden sm:inline">EHR Notes</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          {/* End Call Button in Header */}
          <button
            onClick={handleEndCall}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-600/30 transition cursor-pointer"
            title="End Consultation"
          >
            <PhoneOff size={15} />
            <span className="hidden sm:inline">End Call</span>
          </button>
        </div>
      </div>

      {/* ───────────────── MAIN TELEHEALTH WORKSPACE ───────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Main Video Call Display Area */}
        <div className="flex-1 w-full h-full relative bg-slate-950 flex flex-col items-center justify-center p-3 sm:p-5">
          {mediaError ? (
            <div className="bg-red-950/80 border border-red-800 text-red-200 p-6 rounded-2xl max-w-md text-center space-y-3">
              <AlertTriangle size={36} className="text-red-400 mx-auto" />
              <h3 className="font-bold text-base text-white">Camera Access Error</h3>
              <p className="text-xs text-red-300">{mediaError}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Reload & Retry Camera
              </button>
            </div>
          ) : (
            <div className="w-full h-full relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl">
              {/* REMOTE PEER VIDEO (Full Screen / Main Window) */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-cover transition-opacity duration-500 ${
                  remoteStream ? 'opacity-100' : 'opacity-0 absolute'
                }`}
              />

              {/* WAITING SCREEN (When Peer Has Not Joined Yet) */}
              {!remoteStream && (
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-dashed border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-pulse">
                    <Users size={32} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white">
                      Waiting for {otherRoleName} to join...
                    </h3>
                    <p className="text-xs text-slate-400">
                      Room code: <span className="font-mono text-emerald-400 font-bold">{cleanRoomCode}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      As soon as the other participant opens the consultation, live HD video will connect automatically.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleCopyRoom}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {hasCopiedRoom ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{hasCopiedRoom ? 'Copied Room Code!' : 'Copy Room Code'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* LOCAL SELF WEBCAM (Picture-in-Picture Floating Window) */}
              <div className="absolute top-4 right-4 w-36 sm:w-52 aspect-video rounded-xl overflow-hidden bg-slate-950 border-2 border-emerald-500/60 shadow-2xl z-20 group">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${isVideoOff ? 'opacity-0' : 'opacity-100'}`}
                />
                {isVideoOff && (
                  <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 text-[10px] font-bold">
                    <VideoOff size={20} className="mb-1 text-slate-500" />
                    <span>Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-1.5 left-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-slate-200">
                  {currentUser.name} (You)
                </div>
              </div>

              {/* CALL CONTROL BAR (Floating Bottom Island) */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-700/80 shadow-2xl z-30">
                {/* Mute/Unmute */}
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-xl transition cursor-pointer ${
                    isMuted ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                  title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                >
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>

                {/* Camera Toggle */}
                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-xl transition cursor-pointer ${
                    isVideoOff ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                  title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
                >
                  {isVideoOff ? <VideoOff size={20} /> : <VideoIcon size={20} />}
                </button>

                {/* End Call Button */}
                <button
                  onClick={handleEndCall}
                  className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-red-600/40 transition cursor-pointer"
                  title="Hang Up and Finish Consultation"
                >
                  <PhoneOff size={18} />
                  <span>Leave Consultation</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ───────────────── CLINICAL EHR SIDE PANEL ───────────────── */}
        {isSidebarOpen && (
          <div className="w-full lg:w-96 bg-slate-900/98 border-t lg:border-t-0 lg:border-l border-slate-800 p-4 flex flex-col max-h-80 lg:max-h-full overflow-y-auto shrink-0 shadow-2xl z-20">
            <div className="border-b border-slate-800 pb-3 mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <FileText size={16} className="text-emerald-400" />
                  Telehealth Clinical EHR
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Consultation: <strong className="text-white">{session.appointmentId || 'Walk-in / Teleconsultation'}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-slate-500 hover:text-white p-1 rounded-lg cursor-pointer"
                title="Collapse Sidebar"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Reported Symptoms */}
            {session.symptoms && session.symptoms.length > 0 && (
              <div className="mb-4 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Reported Symptoms
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {session.symptoms.map((sym, idx) => (
                    <span key={idx} className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs px-2 py-0.5 rounded-md">
                      {sym}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {session.diagnosis && (
              <div className="mb-4 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                <label className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block mb-1">
                  AI Differential Assessment
                </label>
                <p className="text-xs text-slate-300">{session.diagnosis}</p>
              </div>
            )}

            {/* Doctor Controls: Live Prescriptions & Clinical Notes */}
            {isDoctor ? (
              <div className="flex-1 flex flex-col space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Quick Clinical Prescriptions
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => applyQuickRx('FEVER')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] text-emerald-300 font-semibold cursor-pointer"
                    >
                      + Fever & Cold
                    </button>
                    <button
                      onClick={() => applyQuickRx('GASTRO')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] text-teal-300 font-semibold cursor-pointer"
                    >
                      + Gastro / ORS
                    </button>
                    <button
                      onClick={() => applyQuickRx('INFECTION')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] text-purple-300 font-semibold cursor-pointer"
                    >
                      + Antibiotic Course
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Live Digital Prescription
                  </label>
                  <textarea
                    value={prescriptionText}
                    onChange={(e) => {
                      setPrescriptionText(e.target.value);
                      setIsRxSaved(false);
                    }}
                    placeholder="e.g. Tab Paracetamol 650mg TDS x 3 days&#10;Tab Levocetirizine 5mg OD HS x 5 days"
                    rows={4}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Doctor Clinical Notes
                  </label>
                  <textarea
                    value={doctorNotes}
                    onChange={(e) => setDoctorNotes(e.target.value)}
                    placeholder="Patient examined via HD teleconsultation. Stable vitals, alert and oriented. Advised rest."
                    rows={2}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <button
                  onClick={() => setIsRxSaved(true)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    isRxSaved
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-700/30'
                  }`}
                >
                  <CheckCircle size={15} />
                  <span>{isRxSaved ? 'Prescription Recorded to Patient EHR' : 'Save Prescription to Record'}</span>
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/40 space-y-1.5">
                    <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <ShieldCheck size={14} /> Encrypted Telehealth Session
                    </h4>
                    <p className="text-xs text-slate-300">
                      You are in a confidential consultation with <strong>{otherRoleName}</strong>.
                      Your real-time camera and microphone allow the doctor to examine you and give instant prescriptions.
                    </p>
                  </div>

                  {prescriptionText && (
                    <div className="bg-emerald-950/40 border border-emerald-700/50 p-3 rounded-xl">
                      <label className="text-[10px] font-bold text-emerald-300 uppercase block mb-1">
                        Doctor's Live Prescription:
                      </label>
                      <pre className="text-xs font-mono text-white whitespace-pre-wrap">
                        {prescriptionText}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="mt-4 p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-400 shrink-0" />
                  <span>National Medical Emergency: Dial 108 or 112 immediately.</span>
                </div>
              </div>
            )}

            {/* Bottom End Call in Sidebar */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <button
                onClick={handleEndCall}
                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-red-600/30 transition cursor-pointer"
              >
                <PhoneOff size={15} />
                <span>Complete & End Consultation</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
