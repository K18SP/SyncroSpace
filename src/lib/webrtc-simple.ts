import { 
  collection, 
  doc, 
  addDoc, 
  onSnapshot, 
  getDocs, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  deleteDoc,
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { db } from './firebase';

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export interface SimpleRoomHandles {
  roomId: string;
  spaceId: string;
  localStream: MediaStream;
  remoteStreams: MediaStream[];
  participants: Map<string, any>;
  unsubscribe: () => void;
}

export class SimpleWebRTCManager {
  private roomId: string;
  private spaceId: string;
  private localStream: MediaStream;
  private currentUserId: string;
  private connections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: MediaStream[] = [];
  private participants: Map<string, any> = new Map();
  private unsubscribe: (() => void) | null = null;
  private onStreamsChanged: (() => void) | null = null;

  constructor(spaceId: string, roomId: string, localStream: MediaStream, currentUserId: string) {
    this.spaceId = spaceId;
    this.roomId = roomId;
    this.localStream = localStream;
    this.currentUserId = currentUserId;
  }

  async initialize(): Promise<SimpleRoomHandles> {
    try {
      console.log('Initializing simple WebRTC manager...');
      
      // Set up Firestore listener for participants
      const participantsRef = collection(db, `spaces/${this.spaceId}/rooms/${this.roomId}/participants`);
      
      this.unsubscribe = onSnapshot(participantsRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const participantData = change.doc.data();
          const participantId = change.doc.id;
          
          if (change.type === 'added' && participantId !== this.currentUserId) {
            console.log(`Participant ${participantId} joined`);
            this.handleParticipantJoined(participantId, participantData);
          } else if (change.type === 'removed') {
            console.log(`Participant ${participantId} left`);
            this.handleParticipantLeft(participantId);
          }
        });
      });

      // Add current user to participants
      await this.addCurrentUser();
      
      return {
        roomId: this.roomId,
        spaceId: this.spaceId,
        localStream: this.localStream,
        remoteStreams: this.remoteStreams,
        participants: this.participants,
        unsubscribe: () => this.cleanup()
      };
    } catch (error) {
      console.error('Failed to initialize simple WebRTC:', error);
      throw new Error('Failed to initialize video meeting. Please check your internet connection and try again.');
    }
  }

  getRemoteStreams(): MediaStream[] {
    return this.remoteStreams;
  }

  getParticipantCount(): number {
    return this.participants.size;
  }

  setOnStreamsChanged(callback: () => void) {
    this.onStreamsChanged = callback;
  }

  private async addCurrentUser() {
    const participantRef = doc(db, `spaces/${this.spaceId}/rooms/${this.roomId}/participants/${this.currentUserId}`);
    await setDoc(participantRef, {
      userId: this.currentUserId,
      name: 'You',
      isOnline: true,
      joinedAt: serverTimestamp()
    });
    
    this.participants.set(this.currentUserId, {
      userId: this.currentUserId,
      name: 'You',
      isOnline: true
    });
  }

  private async handleParticipantJoined(participantId: string, participantData: any) {
    console.log(`Setting up peer connection with ${participantId}`);
    
    // Create peer connection
    const peerConnection = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    const remoteStream = new MediaStream();

    // Add local stream tracks
    this.localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, this.localStream);
    });

    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
      console.log(`Received track from ${participantId}`);
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });
      this.remoteStreams.push(remoteStream);
      
      // Notify that streams have changed
      if (this.onStreamsChanged) {
        this.onStreamsChanged();
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        await this.sendIceCandidate(participantId, event.candidate);
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state with ${participantId}: ${peerConnection.connectionState}`);
    };

    // Store connection
    this.connections.set(participantId, peerConnection);
    this.participants.set(participantId, participantData);

    // Create offer
    await this.createOffer(participantId);
  }

  private async handleParticipantLeft(participantId: string) {
    console.log(`Cleaning up connection with ${participantId}`);
    const connection = this.connections.get(participantId);
    if (connection) {
      connection.close();
      this.connections.delete(participantId);
    }
    this.participants.delete(participantId);
    
    // Remove remote stream
    this.remoteStreams = this.remoteStreams.filter(stream => {
      return stream.getTracks().length > 0;
    });
    
    // Notify that streams have changed
    if (this.onStreamsChanged) {
      this.onStreamsChanged();
    }
  }

  private async createOffer(participantId: string) {
    const connection = this.connections.get(participantId);
    if (!connection) return;

    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      
      // Store offer in Firestore
      const offerRef = doc(db, `spaces/${this.spaceId}/rooms/${this.roomId}/offers/${participantId}`);
      await setDoc(offerRef, {
        from: this.currentUserId,
        to: participantId,
        offer: offer,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to create offer:', error);
    }
  }

  private async sendIceCandidate(participantId: string, candidate: RTCIceCandidate) {
    try {
      const candidateRef = doc(db, `spaces/${this.spaceId}/rooms/${this.roomId}/candidates/${participantId}`);
      await addDoc(collection(db, `spaces/${this.spaceId}/rooms/${this.roomId}/candidates`), {
        from: this.currentUserId,
        to: participantId,
        candidate: candidate.toJSON(),
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to send ICE candidate:', error);
    }
  }

  private cleanup() {
    this.connections.forEach(connection => {
      connection.close();
    });
    this.connections.clear();
    this.remoteStreams = [];
    this.participants.clear();

    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

export async function createSimpleRoom(
  spaceId: string, 
  roomId: string, 
  localStream: MediaStream, 
  currentUserId: string
): Promise<SimpleRoomHandles> {
  const manager = new SimpleWebRTCManager(spaceId, roomId, localStream, currentUserId);
  return await manager.initialize();
}
