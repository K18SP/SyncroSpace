
'use client';
import * as React from 'react';
import { ChatPanel } from '@/components/space/chat-panel';
import { useDocument, useCollection } from 'react-firebase-hooks/firestore';
import { doc, collection, query, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: otherUserId } = React.use(params);
  const [user] = useAuthState(auth);

  const [otherUserSnapshot, otherUserLoading] = useDocument(doc(db, 'users', otherUserId));
  
  const getConversationId = (uid1: string, uid2: string) => {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
  }

  const conversationId = user ? getConversationId(user.uid, otherUserId) : null;
  const otherUserData = otherUserSnapshot?.data();

  // In a real app, you'd fetch both users to pass to ChatPanel
  // For simplicity, we'll just pass the other user for now.
  const participants = otherUserData ? [{ uid: otherUserSnapshot?.id, ...otherUserData }] : [];

  if (!conversationId) {
    return <div className="flex-1 flex items-center justify-center">Loading...</div>;
  }
  
  return (
      <ChatPanel 
          participants={participants as any} 
          spaceId={conversationId} // Using conversationId as the document ID for messages
          spaceName={otherUserData?.name || ''} 
      />
  );
}
