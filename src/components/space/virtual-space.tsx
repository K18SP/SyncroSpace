
'use client';
import { useState, useEffect, useRef } from 'react';
import { Avatar } from './avatar';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { Button } from '../ui/button';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, CircleDot, Dot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Avatar as UiAvatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '../ui/card';
import { cn } from '@/lib/utils';
import { doc, setDoc, onSnapshot, DocumentData, addDoc, collection, serverTimestamp, updateDoc, getDoc, arrayRemove } from 'firebase/firestore';
import officeMapData from '@/../map.json';
import { summarizeMeeting } from '@/ai/flows/summarize-meeting';
import { useRouter } from 'next/navigation';
import { createRoom, joinRoom, hangUp, startLocalMedia, RoomHandles } from '@/lib/webrtc';

const GRID_SIZE = 32;
const STEP = GRID_SIZE;
const SHOW_MAP = false; // Hide background tile map

interface Participant {
    uid: string;
    name: string;
    photoURL?: string;
    phoneNumber?: string;
    status?: string;
    x?: number;
    y?: number;
  hiddenMeetings?: string[];
}

const isPositionValid = (pos: { x: number; y: number }) => {
    // Center of the avatar
    const avatarCenterX = pos.x + GRID_SIZE / 2;
    const avatarCenterY = pos.y + GRID_SIZE / 2;

    const tileX = Math.floor(avatarCenterX / GRID_SIZE);
    const tileY = Math.floor(avatarCenterY / GRID_SIZE);

  for (const layer of officeMapData.layers) {
    // Use a dedicated collision layer, e.g., named 'Tile Layer 8'
    if (
      layer.type === 'tilelayer' &&
      layer.name === 'Tile Layer 8' &&
      typeof layer.width === 'number' &&
      typeof layer.height === 'number' &&
      Array.isArray((layer as any).data)
    ) {
      const data = (layer as any).data as number[];
      const width = layer.width as number;
      const height = layer.height as number;
      if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) {
        return false;
      }
      const tileIndex = tileY * width + tileX;
      if (tileIndex >= 0 && tileIndex < data.length) {
        const tileGid = data[tileIndex];
        if (tileGid !== 0) {
          return false; // Collision detected
        }
      }
    }
  }
    return true; // No collision
};


function MapRenderer() {
    return null;
}

export function VirtualSpace({ participants: initialParticipants, spaceId }: { participants: Participant[], spaceId: string }) {
  const [user] = useAuthState(auth);
  const router = useRouter();
  const [position, setPosition] = useState({ x: GRID_SIZE * 10, y: GRID_SIZE * 10 });
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [liveParticipants, setLiveParticipants] = useState<Participant[]>(initialParticipants);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isTogetherMode, setIsTogetherMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const roomHandlesRef = useRef<RoomHandles | null>(null);
  // Holds a dummy (black) video track we may use to keep the sender alive while the real camera is off.
  const offVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    if (initialParticipants.length === 0) return;

    const unsubscribes = initialParticipants.map(p => {
        const userDocRef = doc(db, 'users', p.uid);
        return onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
                const updatedParticipant = { uid: doc.id, ...doc.data() } as Participant;
                setLiveParticipants(prev => {
                    const index = prev.findIndex(part => part.uid === updatedParticipant.uid);
                    
                    // Check if this participant has left the current space (added to hiddenMeetings)
                    const hiddenMeetings = updatedParticipant.hiddenMeetings || [];
                    const hasLeftThisSpace = hiddenMeetings.includes(spaceId);
                    
                    if (hasLeftThisSpace) {
                        // Remove participant if they've left this space
                        return prev.filter(part => part.uid !== updatedParticipant.uid);
                    }
                    
                    if (index > -1) {
                        const newParticipants = [...prev];
                        newParticipants[index] = { ...newParticipants[index], ...updatedParticipant};
                        return newParticipants;
                    }
                    return [...prev, updatedParticipant];
                });
            }
        });
    });

    return () => unsubscribes.forEach(unsub => unsub());

  }, [initialParticipants.map(p => p.uid).join(','), spaceId]); 


  useEffect(() => {
    let stream: MediaStream;
    const initMedia = async () => {
      try {
        stream = await startLocalMedia({ video: true, audio: true });
        setLocalStream(stream);
        setHasCameraPermission(true);
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({ variant: 'destructive', title: 'Camera Access Denied', description: 'Please enable camera and mic in browser settings.' });
      }
    };
    initMedia();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }, [toast]);

  const startOrJoinCall = async () => {
    if (!localStream) {
      toast({ variant: 'destructive', title: 'Media not ready' });
      return;
    }
    try {
      const roomId = 'default';
      const roomPath = doc(db, `spaces/${spaceId}/rooms/${roomId}`);
      const snap = await getDoc(roomPath);
      let handles: RoomHandles;
      if (snap.exists()) {
        handles = await joinRoom(spaceId, roomId, localStream);
      } else {
        handles = await createRoom(spaceId, roomId, localStream);
      }
      roomHandlesRef.current = handles;
      setRemoteStream(handles.remoteStream);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = handles.remoteStream;
      setIsInCall(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Call failed', description: e?.message || 'Unable to start call' });
    }
  };

  const endCall = async () => {
    try {
      if (roomHandlesRef.current) await hangUp(roomHandlesRef.current);
      setIsInCall(false);
      setRemoteStream(null);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    } catch {}
  };
  
  const updatePositionInDb = async (newPos: {x: number, y: number}) => {
    if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, { x: newPos.x, y: newPos.y }, { merge: true });
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (isTogetherMode) return;
        if (!containerRef.current) return;
      
      const mapWidth = officeMapData.width * GRID_SIZE;
      const mapHeight = officeMapData.height * GRID_SIZE;
      const avatarSize = 48;

      setPosition((prev) => {
        let newPos = {...prev};
        switch (e.key) {
          case 'ArrowUp':
            newPos.y = Math.max(0, prev.y - STEP);
            break;
          case 'ArrowDown':
            newPos.y = Math.min(mapHeight - avatarSize, prev.y + STEP);
            break;
          case 'ArrowLeft':
            newPos.x = Math.max(0, prev.x - STEP);
            break;
          case 'ArrowRight':
            newPos.x = Math.min(mapWidth - avatarSize, prev.x + STEP);
            break;
          default:
            return prev;
        }
        
        if ((newPos.x !== prev.x || newPos.y !== prev.y) && isPositionValid(newPos)) {
            updatePositionInDb(newPos);
            return newPos;
        }
        
        return prev;
      });
    };
    
    const currentRef = containerRef.current;
    currentRef?.focus();
    currentRef?.addEventListener('keydown', handleKeyDown);
    return () => {
      currentRef?.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTogetherMode, user]);
  
  const startRecording = () => {
    if (!localStream) {
        toast({ variant: 'destructive', title: 'Media stream not available.' });
        return;
    }
    const audioChunks: Blob[] = [];
    mediaRecorderRef.current = new MediaRecorder(localStream);
    mediaRecorderRef.current.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        toast({ title: 'Recording stopped', description: 'Generating meeting summary...' });
        try {
            const result = await summarizeMeeting({ audioDataUri: base64Audio });
            const messagesCollection = collection(db, `spaces/${spaceId}/messages`);
            await addDoc(messagesCollection, {
                uid: 'ai-assistant',
                name: 'AI Assistant',
                isSummary: true,
                summary: result.summary,
                actionItems: result.actionItems,
                transcript: result.transcript,
                timestamp: serverTimestamp(),
            });
            toast({ title: 'Meeting Summary Ready', description: 'The summary has been posted to the chat.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Summarization Failed', description: error.message });
        }
      };
    };
    mediaRecorderRef.current.start();
    setIsRecording(true);
    toast({ title: 'Recording Started', description: 'The meeting is now being recorded.' });
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };
  
  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleToggleCamera = async () => {
    if (!localStream) return;
    const pc = roomHandlesRef.current?.peerConnection;

  const currentVideoTracks = localStream.getVideoTracks();
  const videoSenders = pc?.getSenders().filter(s => s.track && s.track.kind === 'video') || [];

    if (!isCameraOff) {
      // Turn camera OFF: stop and remove video tracks to release hardware
      currentVideoTracks.forEach(track => {
        try { track.stop(); } catch {}
        localStream.removeTrack(track);
      });
      // Replace outgoing sender track with a dummy black canvas track to avoid renegotiation
      if (videoSenders.length > 0) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 640; canvas.height = 360;
          const ctx = canvas.getContext('2d');
          if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          const dummyStream = (canvas as HTMLCanvasElement).captureStream?.(5) as MediaStream | undefined;
          const dummyTrack = dummyStream?.getVideoTracks()[0] || null;
          if (dummyTrack) {
            offVideoTrackRef.current = dummyTrack;
            for (const sender of videoSenders) {
              try { await sender.replaceTrack(dummyTrack); } catch {}
            }
            // Keep transceivers in sendrecv so the pipeline stays stable
            pc?.getTransceivers()?.forEach(tx => {
              const setDir = (tx as any).setDirection?.bind(tx);
              if (tx.receiver?.track?.kind === 'video' || tx.sender?.track?.kind === 'video') {
                try { setDir ? setDir('sendrecv') : (tx as any).direction = 'sendrecv'; } catch {}
              }
            });
          } else {
            // Fallback: if we couldn't create a dummy track, just stop sending
            for (const sender of videoSenders) {
              try { await sender.replaceTrack(null); } catch {}
            }
            pc?.getTransceivers()?.forEach(tx => {
              const setDir = (tx as any).setDirection?.bind(tx);
              if (tx.receiver?.track?.kind === 'video' || tx.sender?.track?.kind === 'video') {
                try { setDir ? setDir('recvonly') : (tx as any).direction = 'recvonly'; } catch {}
              }
            });
          }
        } catch {}
      }
      // Update local preview
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsCameraOff(true);
      return;
    }

    // Turn camera ON: reacquire and attach a new video track
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('No video track available');
      }
      // Attach to local stream
      localStream.addTrack(newVideoTrack);
      setLocalStream(localStream);
      if (videoRef.current) videoRef.current.srcObject = localStream;
      // Send to remote peer
      if (pc) {
        const existingVideoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (existingVideoSender) {
          await existingVideoSender.replaceTrack(newVideoTrack);
        } else {
          try { pc.addTrack(newVideoTrack, localStream); } catch {}
        }
        // Ensure transceivers are set to sendrecv
        pc.getTransceivers()?.forEach(tx => {
          const setDir = (tx as any).setDirection?.bind(tx);
          if (tx.receiver?.track?.kind === 'video' || tx.sender?.track?.kind === 'video') {
            try { setDir ? setDir('sendrecv') : (tx as any).direction = 'sendrecv'; } catch {}
          }
        });
        // Stop and clear any previously installed dummy track
        if (offVideoTrackRef.current) {
          try { offVideoTrackRef.current.stop(); } catch {}
          offVideoTrackRef.current = null;
        }
      }
      setIsCameraOff(false);
    } catch (e) {
      console.error('Failed to re-enable camera:', e);
      toast({ variant: 'destructive', title: 'Camera error', description: 'Could not access camera. Check permissions.' });
    }
  }

  const handleToggleMic = () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsMicMuted(!audioTrack.enabled);
        }
    }
  };

  const handleLeave = async () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Remove user from the space and clean up their data
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const spaceDocRef = doc(db, 'spaces', spaceId);
        
        // Get current user data
        const userDocSnap = await getDoc(userDocRef);
        const userData = userDocSnap.data();
        
        // Remove from pendingSpaces
        const currentPendingSpaces = userData?.pendingSpaces || [];
        const updatedPendingSpaces = currentPendingSpaces.filter((p: any) => p?.spaceId !== spaceId);
        
        // Remove from hiddenMeetings
        const currentHiddenMeetings = userData?.hiddenMeetings || [];
        const updatedHiddenMeetings = currentHiddenMeetings.filter((hiddenSpaceId: string) => hiddenSpaceId !== spaceId);
        
        // Update user document
        await updateDoc(userDocRef, {
          pendingSpaces: updatedPendingSpaces,
          hiddenMeetings: updatedHiddenMeetings,
          lastUpdated: serverTimestamp(),
        });
        
        // Remove user from space's members array
        await updateDoc(spaceDocRef, {
          members: arrayRemove(user.uid),
          lastActivity: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error leaving space:', error);
      }
    }
    
    router.push('/dashboard');
  }
  
  const player = liveParticipants.find(p => p.uid === user?.uid);
  const otherParticipants = liveParticipants.filter(p => p.uid !== user?.uid);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-auto bg-background focus:outline-none"
      tabIndex={0}
    >
        <div className="relative">
            {SHOW_MAP && <MapRenderer />}

            {isTogetherMode ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-8">
                    <h2 className="text-2xl font-bold mb-8">Together Mode</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {liveParticipants.map(p => (
                            <Card key={p.uid} className="overflow-hidden shadow-lg">
                                <CardContent className="p-0 aspect-video flex items-center justify-center bg-muted">
                                <UiAvatar className="h-24 w-24 border-4 border-background">
                                    <AvatarImage src={p.photoURL} alt={p.name} />
                                    <AvatarFallback>{p.name?.charAt(0).toUpperCase()}</AvatarFallback>
                                </UiAvatar>
                                </CardContent>
                                <div className="p-2 text-center text-sm font-medium bg-background/80">
                                    {p.name}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {otherParticipants.map(p => (
                        p.phoneNumber ? (
                        <a key={p.uid} href={`tel:${p.phoneNumber}`}>
                            <Avatar x={p.x || 0} y={p.y || 0} name={p.name} status={p.status} src={p.photoURL} />
                        </a>
                        ) : (
                        <Avatar key={p.uid} x={p.x || 0} y={p.y || 0} name={p.name} status={p.status} src={p.photoURL} />
                        )
                    ))}
                    {player && (
                        <Avatar
                            x={player.x || position.x}
                            y={player.y || position.y}
                            name={player.name}
                            isPlayer
                            src={player.photoURL}
                            status={player.status}
                        />
                    )}
                </>
            )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col items-center">
            
            <div className="flex gap-4 mb-4">
              <div className={cn(
                  "relative w-48 h-36 transition-all duration-300",
                  isTogetherMode && "w-0 h-0 opacity-0"
              )}>
                  <video 
                      ref={videoRef} 
                      className="w-full h-full rounded-md bg-background object-cover" 
                      autoPlay 
                      muted 
                  />
                  {(isCameraOff || hasCameraPermission === false) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background rounded-md border">
                          <VideoOff className="h-8 w-8 text-muted-foreground" />
                          <span className="mt-2 text-sm text-muted-foreground">Camera is off</span>
                      </div>
                  )}
              </div>
              <div className={cn(
                  "relative w-48 h-36 transition-all duration-300",
                  isTogetherMode && "w-0 h-0 opacity-0"
              )}>
                  <video 
                      ref={remoteVideoRef} 
                      className="w-full h-full rounded-md bg-background object-cover" 
                      autoPlay 
                  />
                  {!remoteStream && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background rounded-md border">
                          <Users className="h-8 w-8 text-muted-foreground" />
                          <span className="mt-2 text-sm text-muted-foreground">Waiting for others…</span>
                      </div>
                  )}
              </div>
            </div>

             { hasCameraPermission === false && (
                <Alert variant="destructive" className="max-w-md mb-4">
                    <AlertTitle>Camera Access Required</AlertTitle>
                    <AlertDescription>
                        Please allow camera and microphone access in your browser settings to join the meeting.
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex items-center gap-4 rounded-full bg-background/80 p-3 shadow-lg backdrop-blur-sm">
                {!isInCall ? (
                  <Button variant="default" className="rounded-full h-12" onClick={startOrJoinCall}>
                    Start Call
                  </Button>
                ) : (
                  <Button variant="destructive" size="icon" className="rounded-full h-12 w-12" onClick={endCall}>
                    <PhoneOff />
                  </Button>
                )}
                <Button variant={isMicMuted ? "destructive" : "outline"} size="icon" className="rounded-full h-12 w-12" onClick={handleToggleMic}>
                    {isMicMuted ? <MicOff /> : <Mic />}
                </Button>
                <Button variant={isCameraOff ? "destructive" : "outline"} size="icon" className="rounded-full h-12 w-12" onClick={handleToggleCamera}>
                    {isCameraOff ? <VideoOff /> : <Video />}
                </Button>
                <Button variant={isTogetherMode ? "secondary" : "outline"} size="icon" className="rounded-full h-12 w-12" onClick={() => setIsTogetherMode(!isTogetherMode)}>
                    <Users />
                </Button>
                 <Button variant={isRecording ? "destructive" : "outline"} size="icon" className="rounded-full h-12 w-12" onClick={handleToggleRecording}>
                    {isRecording ? <Dot className="animate-pulse" /> : <CircleDot />}
                </Button>
                <Button variant="outline" className="rounded-full h-12" onClick={handleLeave}>
                    Leave Meeting
                </Button>
            </div>
        </div>
    </div>
  );
}
