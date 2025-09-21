'use client';

import { db } from '@/lib/firebase';
import { collection, doc, onSnapshot, setDoc, addDoc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';

const STUN_SERVERS: RTCIceServer[] = [
  { urls: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
  ]}
];

export type RoomHandles = {
  peerConnection: RTCPeerConnection;
  localStream: MediaStream;
  remoteStream: MediaStream;
  unsubscribeCandidates?: () => void;
  roomRef?: ReturnType<typeof doc>;
  callerCandidatesRef?: ReturnType<typeof collection>;
  calleeCandidatesRef?: ReturnType<typeof collection>;
};

export async function startLocalMedia(constraints: MediaStreamConstraints = { video: true, audio: true }) {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  return stream;
}

export async function createRoom(spaceId: string, roomId: string, localStream: MediaStream): Promise<RoomHandles> {
  const peerConnection = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  const remoteStream = new MediaStream();
  const roomRef = doc(db, `spaces/${spaceId}/rooms/${roomId}`);
  const callerCandidatesRef = collection(roomRef, 'callerCandidates');
  const calleeCandidatesRef = collection(roomRef, 'calleeCandidates');

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = event => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  peerConnection.onicecandidate = async event => {
    if (event.candidate) {
      await addDoc(callerCandidatesRef, event.candidate.toJSON());
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await setDoc(roomRef, { offer: { type: offer.type, sdp: offer.sdp } }, { merge: true });

  const unsubscribe = onSnapshot(roomRef, async snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data?.answer) {
      const answer = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(answer);
    }
  });

  const unsubscribeCandidates = onSnapshot(calleeCandidatesRef, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    });
  });

  return { peerConnection, localStream, remoteStream, unsubscribeCandidates, roomRef, callerCandidatesRef, calleeCandidatesRef };
}

export async function joinRoom(spaceId: string, roomId: string, localStream: MediaStream): Promise<RoomHandles> {
  const peerConnection = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  const remoteStream = new MediaStream();
  const roomRef = doc(db, `spaces/${spaceId}/rooms/${roomId}`);
  const callerCandidatesRef = collection(roomRef, 'callerCandidates');
  const calleeCandidatesRef = collection(roomRef, 'calleeCandidates');

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = event => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  peerConnection.onicecandidate = async event => {
    if (event.candidate) {
      await addDoc(calleeCandidatesRef, event.candidate.toJSON());
    }
  };

  const roomSnapshot = await getDoc(roomRef);
  const roomData = roomSnapshot.data();
  if (!roomData?.offer) {
    throw new Error('Room offer not found');
  }
  await peerConnection.setRemoteDescription(new RTCSessionDescription(roomData.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } });

  const unsubscribeCandidates = onSnapshot(callerCandidatesRef, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    });
  });

  return { peerConnection, localStream, remoteStream, unsubscribeCandidates, roomRef, callerCandidatesRef, calleeCandidatesRef };
}

export async function hangUp(handles: RoomHandles) {
  try {
    handles.peerConnection.getSenders().forEach(sender => sender.track && sender.track.stop());
    handles.peerConnection.close();
  } catch {}
  try {
    handles.unsubscribeCandidates && handles.unsubscribeCandidates();
  } catch {}
  // Clean up room document and ICE candidates to avoid leaks
  try {
    if (handles.roomRef) {
      const callerCandidatesRef = handles.callerCandidatesRef;
      const calleeCandidatesRef = handles.calleeCandidatesRef;
      if (callerCandidatesRef) {
        // Firestore delete of subcollection docs requires listing
        const snap = await (await import('firebase/firestore')).getDocs(callerCandidatesRef);
        const batch = (await import('firebase/firestore')).writeBatch(db);
        snap.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
      }
      if (calleeCandidatesRef) {
        const snap = await (await import('firebase/firestore')).getDocs(calleeCandidatesRef);
        const batch = (await import('firebase/firestore')).writeBatch(db);
        snap.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
      }
      await deleteDoc(handles.roomRef);
    }
  } catch {}
}


