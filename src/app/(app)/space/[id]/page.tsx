'use client';

import * as React from 'react';
import { VirtualSpace } from '@/components/space/virtual-space';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatPanel } from '@/components/space/chat-panel';
import { Hash, Users, UserPlus } from 'lucide-react';
import { useDocument, useCollection } from 'react-firebase-hooks/firestore';
import { doc, collection, query, where, updateDoc, serverTimestamp, Timestamp, getDoc, getDocs, deleteDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { InviteDialog } from '@/components/space/invite-dialog';
import { Button } from '@/components/ui/button';

export default function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [user] = useAuthState(auth);
  const spaceRef = doc(db, 'spaces', id);
  const [spaceSnapshot, spaceLoading, spaceError] = useDocument(spaceRef);
  
  const spaceData = spaceSnapshot?.data();
  const memberIds = spaceData?.members || [];
  const isAdmin = !!user && user.uid === spaceData?.creatorId;
  const isMember = !!user && memberIds.includes(user.uid);

  // Fetch all users who are members of this space
  const usersRef = collection(db, 'users');
  // Firestore 'in' queries are limited to 30 elements.
  // For larger spaces, you'd need a more complex solution like fetching users individually or restructuring data.
  const usersQuery = memberIds.length > 0 ? query(usersRef, where('uid', 'in', memberIds.slice(0, 30))) : null;
  const [usersSnapshot, usersLoading, usersError] = useCollection(usersQuery);

  // Get all member data
  const allMembers = usersSnapshot?.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)) || [];
  
  // Filter out participants who have left this meeting (added this space to their hiddenMeetings)
  const activeParticipants = React.useMemo(() => {
    // Always filter out users who have this space in their hiddenMeetings array
    // This ensures that users who left the meeting are not counted, regardless of meeting status
    return allMembers.filter(member => {
      const hiddenMeetings = member.hiddenMeetings || [];
      return !hiddenMeetings.includes(id);
    });
  }, [allMembers, id]);
  
  const loading = spaceLoading || (memberIds.length > 0 && usersLoading);
  
  // Explicit join action for non-members
  const joinSpace = React.useCallback(async () => {
    try {
      if (!user || !spaceSnapshot?.exists()) return;
      await updateDoc(spaceRef, { members: arrayUnion(user.uid) });
    } catch (e) {
      console.error('Failed to join space:', e);
    }
  }, [user, spaceSnapshot, spaceRef]);
  
  // Helpers to start/end meeting
  const endMeeting = React.useCallback(async () => {
    try {
      // Get current space data to get all members
      const spaceDocSnap = await getDoc(doc(db, 'spaces', id));
      const spaceData = spaceDocSnap.data();
      const allMembers = spaceData?.members || [];
      
      // Remove all members from the space
      await updateDoc(doc(db, 'spaces', id), {
        activeMeeting: false,
        meetingEndsAt: null,
        lastActivity: new Date().toISOString(),
        endedAt: serverTimestamp(),
        members: [], // Remove all members
      });
      
      // Also remove this space from all users' pendingSpaces and clear hiddenMeetings
      const userUpdatePromises = allMembers.map(async (memberId: string) => {
        try {
          const userDocRef = doc(db, 'users', memberId);
          const userDocSnap = await getDoc(userDocRef);
          const userData = userDocSnap.data();
          
          // Remove from pendingSpaces
          const currentPendingSpaces = userData?.pendingSpaces || [];
          const updatedPendingSpaces = currentPendingSpaces.filter((p: any) => p?.spaceId !== id);
          
          // Remove from hiddenMeetings
          const currentHiddenMeetings = userData?.hiddenMeetings || [];
          const updatedHiddenMeetings = currentHiddenMeetings.filter((hiddenSpaceId: string) => hiddenSpaceId !== id);
          
          await updateDoc(userDocRef, {
            pendingSpaces: updatedPendingSpaces,
            hiddenMeetings: updatedHiddenMeetings,
            lastUpdated: serverTimestamp(),
          });
        } catch (error) {
          console.error(`Error updating user ${memberId}:`, error);
        }
      });
      
      await Promise.all(userUpdatePromises);

      // If current user is admin, delete the meeting document(s) tied to this space
      if (user && user.uid === spaceData?.creatorId) {
        const meetingsRef = collection(db, 'meetings');
        const meetingQuery = query(meetingsRef, where('spaceId', '==', id));
        const meetingSnaps = await getDocs(meetingQuery);
        const deletePromises: Promise<any>[] = [];
        meetingSnaps.forEach(s => {
          deletePromises.push(deleteDoc(doc(db, 'meetings', s.id)));
        });
        await Promise.all(deletePromises);

        // Optionally delete the space itself after cleanup
        // await deleteDoc(doc(db, 'spaces', id));
      }
    } catch {}
  }, [id]);

  const startMeetingIfNeeded = React.useCallback(async () => {
    try {
      // Default 30 minutes duration
      const defaultDurationMinutes = 30;
      const endsAtMs = Date.now() + defaultDurationMinutes * 60 * 1000;
      await updateDoc(doc(db, 'spaces', id), {
        activeMeeting: true,
        meetingEndsAt: Timestamp.fromDate(new Date(endsAtMs)),
        lastActivity: new Date().toISOString(),
      });

      // Clear hiddenMeetings for all members when starting a new meeting
      // This allows users who previously left to rejoin the new meeting
      const memberIds = spaceData?.members || [];
      const clearHiddenMeetingsPromises = memberIds.map(async (memberId: string) => {
        try {
          const userDocRef = doc(db, 'users', memberId);
          const userDocSnap = await getDoc(userDocRef);
          const userData = userDocSnap.data();
          const currentHiddenMeetings = userData?.hiddenMeetings || [];
          
          // Remove this space from hiddenMeetings if it exists
          const updatedHiddenMeetings = currentHiddenMeetings.filter((spaceId: string) => spaceId !== id);
          
          if (updatedHiddenMeetings.length !== currentHiddenMeetings.length) {
            await updateDoc(userDocRef, {
              hiddenMeetings: updatedHiddenMeetings,
              lastUpdated: serverTimestamp(),
            });
          }
        } catch (error) {
          console.error(`Error clearing hiddenMeetings for user ${memberId}:`, error);
        }
      });
      
      await Promise.all(clearHiddenMeetingsPromises);
    } catch {}
  }, [id, spaceData?.members]);

  // Set meeting active and schedule auto end
  React.useEffect(() => {
    if (!spaceSnapshot?.exists()) return;
    const data: any = spaceSnapshot.data();

    // If meeting already ended by time, enforce end
    const endsAt: Timestamp | undefined = data?.meetingEndsAt as any;
    if (data?.activeMeeting && endsAt && endsAt.toDate().getTime() <= Date.now()) {
      endMeeting();
      return;
    }

    // Start meeting if not active
    if (!data?.activeMeeting) {
      startMeetingIfNeeded();
    }

    // Setup timer to auto-end at endsAt
    let timer: any;
    if (data?.activeMeeting && endsAt) {
      const ms = Math.max(0, endsAt.toDate().getTime() - Date.now());
      timer = setTimeout(() => {
        endMeeting();
      }, ms);
    }

    return () => {
      if (timer) clearTimeout(timer);
    }
  }, [spaceSnapshot, endMeeting, startMeetingIfNeeded]);
  
  return (
    <div className="grid h-[calc(100vh-theme(spacing.14))] grid-cols-1 lg:grid-cols-[1fr_350px]">
      <div className="flex flex-col bg-background">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-6">
          {loading ? (
            <Skeleton className="h-6 w-48" />
          ) : spaceSnapshot?.exists() ? (
            <>
                <h1 className="flex items-center gap-2 text-lg font-semibold">
                <Hash className="h-5 w-5" />
                <span>{spaceData?.name}</span>
                </h1>
                <InviteDialog spaceId={id} spaceName={spaceData?.name || ''}>
                    <Button variant="outline" size="sm">
                        <UserPlus className="mr-2 h-4 w-4" />
                        Invite
                    </Button>
                </InviteDialog>
                {!isMember && !!user && (
                  <Button variant="default" size="sm" className="ml-2" onClick={joinSpace}>
                    Join Space
                  </Button>
                )}
                {isAdmin && (
                  <Button variant="destructive" size="sm" className="ml-2" onClick={endMeeting}>
                    End Meeting
                  </Button>
                )}
            </>
          ) : (
             <h1 className="flex items-center gap-2 text-lg font-semibold text-destructive">
                Space not found
            </h1>
          )}
          <div className="ml-auto flex items-center gap-2">
            {loading ? (
                <Skeleton className="h-8 w-24" />
            ) : (
                <>
                    <div className="flex -space-x-2 overflow-hidden">
                    {activeParticipants.slice(0, 3).map(p => (
                        <Avatar key={p.uid} className="inline-block border-2 border-background h-8 w-8">
                            <AvatarImage src={p.photoURL} />
                            <AvatarFallback>{p.name?.[0]}</AvatarFallback>
                        </Avatar>
                    ))}
                    </div>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {activeParticipants.length}
                    </span>
                </>
            )}
          </div>
        </header>
        <div className="flex-1 relative">
             {spaceSnapshot?.exists() ? (
                <VirtualSpace participants={activeParticipants} spaceId={id} />
             ) : (
                <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">This space does not exist or you do not have permission to view it.</p>
                </div>
            )}
        </div>
      </div>
      <div className="flex flex-col border-l bg-muted/40 w-80 min-w-80">
        <ChatPanel 
            participants={activeParticipants} 
            spaceId={id}
            spaceName={spaceData?.name || ''}
            canRead={isAdmin || isMember}
        />
      </div>
    </div>
  );
}