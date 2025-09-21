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
  updateDoc
} from 'firebase/firestore';
import { db } from './firebase';

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface ParticipantConnection {
  participantId: string;
  peerConnection: RTCPeerConnection;
  localStream: MediaStream;
  remoteStream: MediaStream;
  isConnected: boolean;
  isInitiator: boolean;
}

export interface MeshRoomHandles {
  roomId: string;
  spaceId: string;
  localStream: MediaStream;
  connections: Map<string, ParticipantConnection>;
  participants: Map<string, any>;
  unsubscribe: () => void;
}

export class WebRTCMeshManager {
  private roomId: string;
  private spaceId: string;
  private localStream: MediaStream;
  private connections: Map<string, ParticipantConnection> = new Map();
  private participants: Map<string, any> = new Map();
  private currentUserId: string;
  private unsubscribe: (() => void) | null = null;
  private roomRef: any;
  private participantsRef: any;

  constructor(spaceId: string, roomId: string, localStream: MediaStream, currentUserId: string) {
    this.spaceId = spaceId;
    this.roomId = roomId;
    this.localStream = localStream;
    this.currentUserId = currentUserId;
    this.roomRef = doc(db, `spaces/${spaceId}/rooms/${roomId}`);
    this.participantsRef = collection(this.roomRef, 'participants');
  }

  async initialize(): Promise<MeshRoomHandles> {
    try {
      // Add current user to participants
      await this.addParticipant(this.currentUserId);
      
      // Listen for other participants
      this.unsubscribe = onSnapshot(this.participantsRef, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          const participantData = change.doc.data();
          const participantId = change.doc.id;
          
          if (change.type === 'added' && participantId !== this.currentUserId) {
            console.log(`New participant detected: ${participantId}`);
            await this.handleParticipantJoined(participantId, participantData);
          } else if (change.type === 'removed') {
            console.log(`Participant left: ${participantId}`);
            await this.handleParticipantLeft(participantId);
          }
        });
      }, (error) => {
        console.error('Error listening to participants:', error);
      });

      return {
        roomId: this.roomId,
        spaceId: this.spaceId,
        localStream: this.localStream,
        connections: this.connections,
        participants: this.participants,
        unsubscribe: () => this.cleanup()
      };
    } catch (error) {
      console.error('Failed to initialize mesh room:', error);
      throw new Error('Failed to initialize video meeting. Please check your internet connection and try again.');
    }
  }

  private async addParticipant(userId: string) {
    const participantRef = doc(this.participantsRef, userId);
    await updateDoc(participantRef, {
      userId,
      joinedAt: serverTimestamp(),
      isOnline: true
    }).catch(() => {
      // If document doesn't exist, create it
      addDoc(this.participantsRef, {
        userId,
        joinedAt: serverTimestamp(),
        isOnline: true
      });
    });
  }

  private async handleParticipantJoined(participantId: string, participantData: any) {
    console.log(`Participant ${participantId} joined`);
    
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
      const connection = this.connections.get(participantId);
      if (connection) {
        connection.isConnected = peerConnection.connectionState === 'connected';
      }
    };

    // Store connection
    this.connections.set(participantId, {
      participantId,
      peerConnection,
      localStream: this.localStream,
      remoteStream,
      isConnected: false,
      isInitiator: true
    });

    this.participants.set(participantId, participantData);

    // Create offer
    await this.createOffer(participantId);
  }

  private async handleParticipantLeft(participantId: string) {
    console.log(`Participant ${participantId} left`);
    
    const connection = this.connections.get(participantId);
    if (connection) {
      connection.peerConnection.close();
      this.connections.delete(participantId);
    }
    
    this.participants.delete(participantId);
  }

  private async createOffer(participantId: string) {
    const connection = this.connections.get(participantId);
    if (!connection) return;

    try {
      const offer = await connection.peerConnection.createOffer();
      await connection.peerConnection.setLocalDescription(offer);
      
      // Store offer in Firestore
      const offerRef = doc(this.roomRef, 'offers', `${this.currentUserId}_${participantId}`);
      await updateDoc(offerRef, {
        from: this.currentUserId,
        to: participantId,
        offer: { type: offer.type, sdp: offer.sdp },
        createdAt: serverTimestamp()
      }).catch(() => {
        addDoc(collection(this.roomRef, 'offers'), {
          from: this.currentUserId,
          to: participantId,
          offer: { type: offer.type, sdp: offer.sdp },
          createdAt: serverTimestamp()
        });
      });

      // Listen for answer
      this.listenForAnswer(participantId);
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  private async listenForAnswer(participantId: string) {
    const answerQuery = query(
      collection(this.roomRef, 'answers'),
      where('from', '==', participantId),
      where('to', '==', this.currentUserId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(answerQuery, async (snapshot) => {
      if (!snapshot.empty) {
        const answerData = snapshot.docs[0].data();
        const connection = this.connections.get(participantId);
        
        if (connection && !connection.peerConnection.currentRemoteDescription) {
          try {
            await connection.peerConnection.setRemoteDescription(
              new RTCSessionDescription(answerData.answer)
            );
            unsubscribe();
          } catch (error) {
            console.error('Error setting remote description:', error);
          }
        }
      }
    });
  }

  private async handleOffer(participantId: string, offer: RTCSessionDescription) {
    const connection = this.connections.get(participantId);
    if (!connection) return;

    try {
      await connection.peerConnection.setRemoteDescription(offer);
      const answer = await connection.peerConnection.createAnswer();
      await connection.peerConnection.setLocalDescription(answer);

      // Store answer in Firestore
      const answerRef = doc(this.roomRef, 'answers', `${this.currentUserId}_${participantId}`);
      await updateDoc(answerRef, {
        from: this.currentUserId,
        to: participantId,
        answer: { type: answer.type, sdp: answer.sdp },
        createdAt: serverTimestamp()
      }).catch(() => {
        addDoc(collection(this.roomRef, 'answers'), {
          from: this.currentUserId,
          to: participantId,
          answer: { type: answer.type, sdp: answer.sdp },
          createdAt: serverTimestamp()
        });
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  private async sendIceCandidate(participantId: string, candidate: RTCIceCandidate) {
    const candidateRef = doc(this.roomRef, 'candidates', `${this.currentUserId}_${participantId}_${Date.now()}`);
    await addDoc(collection(this.roomRef, 'candidates'), {
      from: this.currentUserId,
      to: participantId,
      candidate: candidate.toJSON(),
      createdAt: serverTimestamp()
    });
  }

  private async listenForIceCandidates(participantId: string) {
    const candidatesQuery = query(
      collection(this.roomRef, 'candidates'),
      where('from', '==', participantId),
      where('to', '==', this.currentUserId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(candidatesQuery, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const candidateData = change.doc.data();
          const connection = this.connections.get(participantId);
          
          if (connection) {
            try {
              await connection.peerConnection.addIceCandidate(
                new RTCIceCandidate(candidateData.candidate)
              );
            } catch (error) {
              console.error('Error adding ICE candidate:', error);
            }
          }
        }
      });
    });
  }

  async leave() {
    // Mark user as offline
    const participantRef = doc(this.participantsRef, this.currentUserId);
    await updateDoc(participantRef, {
      isOnline: false,
      leftAt: serverTimestamp()
    });

    // Close all connections
    this.connections.forEach(connection => {
      connection.peerConnection.close();
    });
    this.connections.clear();
    this.participants.clear();

    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private cleanup() {
    this.leave();
  }

  getRemoteStreams(): MediaStream[] {
    return Array.from(this.connections.values())
      .map(connection => connection.remoteStream)
      .filter(stream => stream.getTracks().length > 0);
  }

  getParticipantCount(): number {
    return this.connections.size;
  }

  isParticipantConnected(participantId: string): boolean {
    const connection = this.connections.get(participantId);
    return connection ? connection.isConnected : false;
  }
}

export async function createMeshRoom(
  spaceId: string, 
  roomId: string, 
  localStream: MediaStream, 
  currentUserId: string
): Promise<MeshRoomHandles> {
  const manager = new WebRTCMeshManager(spaceId, roomId, localStream, currentUserId);
  return await manager.initialize();
}
