'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  PlusCircle, 
  Users, 
  ArrowRight, 
  Video, 
  Calendar, 
  Clock, 
  MapPin, 
  Star, 
  Bookmark, 
  Zap,
  TrendingUp,
  Activity,
  ChevronRight,
  PlayCircle,
  MessageSquare,
  BarChart3,
  AlertCircle,
  X
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { AiSuggestionCard } from '@/components/dashboard/ai-suggestion-card';
import { CreateSpaceDialog } from '@/components/dashboard/create-space-dialog';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, doc, query, where, DocumentData, setDoc, serverTimestamp, documentId, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { updateDoc, doc as fsDoc, arrayRemove, arrayUnion } from 'firebase/firestore';

// -----------------------------
// Interfaces
// -----------------------------
interface SpaceData {
  id: string;
  name: string;
  description?: string;
  image?: string;
  members?: string[];
  activeMeeting?: boolean;
  category?: string;
  lastActivity?: string;
  createdAt?: string;
  isBookmarked?: boolean;
  rating?: number;
  location?: string;
  isRealSpace?: boolean;
}

// -----------------------------
// Gradient utility
// -----------------------------
function getSpaceGradient(id: string, category?: string): string {
  const gradients: { [key: string]: string } = {
    Design: 'from-pink-500 via-rose-500 to-red-500',
    Strategy: 'from-blue-500 via-indigo-500 to-purple-500',
    Development: 'from-green-500 via-emerald-500 to-teal-500',
    Marketing: 'from-orange-500 via-amber-500 to-yellow-500',
    'Customer Success': 'from-cyan-500 via-sky-500 to-blue-500',
    Research: 'from-violet-500 via-purple-500 to-indigo-500',
  };
  
  if (category && gradients[category]) {
    return gradients[category];
  }
  
  const fallbackGradients = [
    'from-indigo-500 via-blue-500 to-cyan-500',
    'from-fuchsia-500 via-pink-500 to-rose-500',
    'from-teal-500 via-green-500 to-emerald-500',
    'from-amber-500 via-yellow-500 to-orange-500',
    'from-purple-500 via-violet-500 to-indigo-500',
    'from-red-500 via-pink-500 to-rose-500',
  ];
  
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return fallbackGradients[hash % fallbackGradients.length];
}

// -----------------------------
// EndMeeting Button Component with Role-Based Logic
// -----------------------------
function EndMeetingButton({ 
  spaceId, 
  isActive, 
  userRole, 
  userId 
}: { 
  spaceId: string; 
  isActive: boolean; 
  userRole?: string;
  userId?: string;
}) {
  const [isEnding, setIsEnding] = React.useState(false);
  const isAdmin = userRole === 'admin';

  const handleEnd = async () => {
    if (!isActive || !userId) return;
    
    setIsEnding(true);
    try {
      if (isAdmin) {
        // Admin ends meeting for everyone - remove all users from the space
        // First, get the current space data to get all members
        const spaceDocRef = fsDoc(db, 'spaces', spaceId);
        const spaceDocSnap = await getDoc(spaceDocRef);
        const spaceData = spaceDocSnap.data();
        const allMembers = spaceData?.members || [];
        
        // Remove all members from the space
        await updateDoc(spaceDocRef, { 
          activeMeeting: false, 
          meetingEndsAt: null,
          lastActivity: new Date().toISOString(),
          endedBy: userId,
          endedAt: serverTimestamp(),
          members: [], // Remove all members
        });
        
        // Also remove this space from all users' pendingSpaces and clear hiddenMeetings
        const userUpdatePromises = allMembers.map(async (memberId: string) => {
          try {
            const userDocRef = fsDoc(db, 'users', memberId);
            const userDocSnap = await getDoc(userDocRef);
            const userData = userDocSnap.data();
            
            // Remove from pendingSpaces
            const currentPendingSpaces = userData?.pendingSpaces || [];
            const updatedPendingSpaces = currentPendingSpaces.filter((p: any) => p?.spaceId !== spaceId);
            
            // Remove from hiddenMeetings
            const currentHiddenMeetings = userData?.hiddenMeetings || [];
            const updatedHiddenMeetings = currentHiddenMeetings.filter((hiddenSpaceId: string) => hiddenSpaceId !== spaceId);
            
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
      } else {
        // Employee hides this meeting from their dashboard's Active Meetings
        const userDocRef = fsDoc(db, 'users', userId);
        await updateDoc(userDocRef, {
          hiddenMeetings: arrayUnion(spaceId),
          lastUpdated: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error ending/leaving meeting:', error);
    } finally {
      setIsEnding(false);
    }
  };

  if (!isActive) return null;

  return (
    <Button 
      variant="destructive"
      size="sm" 
      className="w-full bg-red-600 hover:bg-red-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200"
      onClick={handleEnd} 
      disabled={isEnding}
    >
      {isEnding 
        ? (isAdmin ? 'Ending Meeting...' : 'Leaving Meeting...')
        : (isAdmin ? 'End Meeting' : 'Leave Meeting')
      }
    </Button>
  );
}

// -----------------------------
// SpaceCard Component
// -----------------------------
function SpaceCard({ 
  space, 
  isActiveMeeting, 
  formatLastActivity, 
  getSpaceGradient,
  userRole,
  userId,
  isHiddenForUser = false
}: {
  space: SpaceData;
  isActiveMeeting: boolean;
  formatLastActivity: (dateString?: string) => string;
  getSpaceGradient: (id: string, category?: string) => string;
  userRole?: string;
  userId?: string;
  isHiddenForUser?: boolean;
}) {
  // Don't show active meeting state if user has hidden this meeting
  const showAsActive = isActiveMeeting && !isHiddenForUser;

  return (
    <Card className={`group hover:shadow-xl transition-all duration-300 relative overflow-hidden border-0 shadow-md ${
      showAsActive ? 'hover:shadow-blue-100/50 dark:hover:shadow-blue-900/20' : 'hover:shadow-purple-100/50 dark:hover:shadow-purple-900/20'
    }`}>
      <CardHeader className="p-0">
        {space.image ? (
          <div className="relative overflow-hidden">
            <Image
              src={space.image}
              alt={space.name}
              width={400}
              height={200}
              className="w-full h-36 object-cover rounded-t-lg group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
          </div>
        ) : (
          <div className={`w-full h-36 bg-gradient-to-r ${getSpaceGradient(space.id, space.category)} rounded-t-lg flex items-center justify-center group-hover:scale-105 transition-transform duration-300`}>
            {showAsActive ? (
              <Video className="w-10 h-10 text-white opacity-80" />
            ) : (
              <Bookmark className="w-10 h-10 text-white opacity-80" />
            )}
          </div>
        )}
        {/* Active Meeting Badge - only show if not hidden for user */}
        {showAsActive && (
          <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 animate-pulse">
            <div className="w-2 h-2 bg-white rounded-full"></div>
            LIVE
          </div>
        )}
        {!space.isRealSpace && (
          <div className="absolute top-2 right-2 bg-amber-500 text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Demo
          </div>
        )}
      </CardHeader>
      <CardContent className="p-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 line-clamp-1">{space.name}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2 leading-relaxed">{space.description || 'No description provided.'}</p>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">  
          <div className="flex items-center space-x-1">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{space.location || 'Virtual'}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>{formatLastActivity(space.lastActivity)}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex flex-col gap-3">
        {/* Join/Open Space Button */}
        <Link href={`/space/${space.id}`} className="w-full">
          <Button 
            className={`w-full border-0 shadow-md hover:shadow-lg transition-all duration-200 ${
              showAsActive 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-transparent border-purple-200 text-purple-600 hover:bg-purple-50 hover:border-purple-300 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/50'
            }`}
            variant={showAsActive ? 'default' : 'outline'}
            disabled={!space.isRealSpace}
          >
            {showAsActive ? (
              <>Join Meeting <PlayCircle className="ml-2 w-4 h-4" /></>
            ) : (
              <>Open Space <ChevronRight className="ml-2 w-4 h-4" /></>
            )}
          </Button>
        </Link>
        
        {/* End/Leave Meeting Button */}
        <EndMeetingButton 
          spaceId={space.id} 
          isActive={showAsActive}
          userRole={userRole}
          userId={userId}
        />
      </CardFooter>
    </Card>
  );
}

export default function DashboardPage() {
  const [showAllSpaces, setShowAllSpaces] = React.useState(false);
  const [user, userLoading] = useAuthState(auth);
  const userDocRef = user ? doc(db, 'users', user.uid) : null;
  const [userData, userDataLoading, userDataError] = useDocumentData(userDocRef);

  // Get user's hidden meetings
  const userHiddenMeetings: string[] = (userData as any)?.hiddenMeetings || [];

  // Query only spaces where the current user is a member
  const spacesQuery = user ? query(
    collection(db, 'spaces'),
    where('members', 'array-contains', user.uid)
  ) : null;
  const [allSpaces, spacesLoading, spacesError] = useCollection(spacesQuery);

  // Additionally, fetch invited spaces referenced in pendingSpaces so they show up immediately
  const invitedSpaceIdsFromUserDoc: string[] = Array.isArray((userData as any)?.pendingSpaces)
    ? (userData as any).pendingSpaces
        .map((p: any) => p?.spaceId)
        .filter((id: any) => typeof id === 'string')
    : [];

  // Also fetch invites by email as a fallback discovery mechanism
  const invitesByEmailQuery = user?.email ? query(
    collection(db, 'invites'),
    where('invitedEmail', '==', user.email),
    where('status', '==', 'pending')
  ) : null;
  const [invitesSnap] = useCollection(invitesByEmailQuery);
  const invitedSpaceIdsFromInvites: string[] = invitesSnap?.docs
    ?.map(d => (d.data() as any)?.spaceId)
    ?.filter((id: any) => typeof id === 'string') || [];

  const invitedSpaceIdsSet = new Set<string>([
    ...invitedSpaceIdsFromUserDoc,
    ...invitedSpaceIdsFromInvites,
  ]);
  const invitedSpaceIds = Array.from(invitedSpaceIdsSet);

  const invitedSpacesQuery = user && invitedSpaceIds.length > 0
    ? query(
        collection(db, 'spaces'),
        where(documentId(), 'in', invitedSpaceIds.slice(0, 10))
      )
    : null;
  const [invitedSpacesSnap] = useCollection(invitedSpacesQuery);

  // All users snapshot for team member counts (unconditional hook call)
  const [allUsersSnap] = useCollection(collection(db, 'users'));
  const allUsers = allUsersSnap?.docs.map(d => ({ uid: d.id, ...(d.data() as any) })) || [];

  // Process spaces and users before any early returns to keep hook order stable
  const memberSpaces: SpaceData[] = allSpaces?.docs?.map(doc => ({
    id: doc.id,
    ...doc.data(),
    isRealSpace: true
  } as SpaceData)) || [];

  const invitedSpaces: SpaceData[] = invitedSpacesSnap?.docs?.map(doc => ({
    id: doc.id,
    ...doc.data(),
    isRealSpace: true
  } as SpaceData)) || [];

  const mergedById = new Map<string, SpaceData>();
  memberSpaces.forEach(s => mergedById.set(s.id, s));
  invitedSpaces.forEach(s => mergedById.set(s.id, s));
  const realSpaces: SpaceData[] = Array.from(mergedById.values());
  const spacesToShow = realSpaces.length > 0 ? realSpaces : [];

  const activeSpaces = spacesToShow.filter(space => {
    const hasActiveMeeting = space.activeMeeting;
    const isHiddenByUser = userHiddenMeetings.includes(space.id);
    const isAdmin = (userData as any)?.role === 'admin';
    return hasActiveMeeting && (!isHiddenByUser || isAdmin);
  });

  const recentSpaces = spacesToShow.filter(space => {
    const isHiddenByUser = userHiddenMeetings.includes(space.id);
    const isAdmin = (userData as any)?.role === 'admin';
    return !isHiddenByUser || isAdmin;
  }).slice(0, 4);

  // Compute team member count as unique users who are currently not hiding the space
  const teamMemberIdSet = React.useMemo(() => {
    const set = new Set<string>();
    spacesToShow.forEach(space => {
      const memberIds = (space as any).members || [];
      memberIds.forEach((memberId: string) => {
        const member = allUsers.find(u => u.uid === memberId);
        const hiddenMeetings: string[] = member?.hiddenMeetings || [];
        if (!hiddenMeetings.includes((space as any).id)) {
          set.add(memberId);
        }
      });
    });
    return set;
  }, [spacesToShow, allUsers]);
  const teamMembersCount = teamMemberIdSet.size;

  // Debug: log query states when no spaces appear
  React.useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line no-console
    console.log('[Dashboard] uid', user.uid);
    // eslint-disable-next-line no-console
    console.log('[Dashboard] memberSpaces count', allSpaces?.docs?.length || 0);
    if (spacesError) {
      // eslint-disable-next-line no-console
      console.error('[Dashboard] memberSpaces error', spacesError);
    }
    // eslint-disable-next-line no-console
    console.log('[Dashboard] invited ids', invitedSpaceIds);
    // eslint-disable-next-line no-console
    console.log('[Dashboard] invitedSpaces count', invitedSpacesSnap?.docs?.length || 0);
    if (allSpaces?.docs) {
      // eslint-disable-next-line no-console
      console.log('[Dashboard] memberSpaceIds', allSpaces.docs.map(d => d.id));
    }
    if (invitedSpacesSnap?.docs) {
      // eslint-disable-next-line no-console
      console.log('[Dashboard] invitedSpaceIds', invitedSpacesSnap.docs.map(d => d.id));
    }
  }, [user, allSpaces, invitedSpacesSnap, invitedSpaceIds]);

  const loading = userLoading || spacesLoading || userDataLoading;

  // Create a user-owned notification for each pending invitation, idempotently
  React.useEffect(() => {
    if (!user || !userData) return;
    const pending = (userData as any)?.pendingSpaces as any[] | undefined;
    if (!Array.isArray(pending) || pending.length === 0) return;

    pending.forEach(async (inv: any) => {
      try {
        const notifId = `invite_${inv.spaceId}`;
        await setDoc(doc(db, 'users', user.uid, 'notifications', notifId), {
          title: 'Space invitation',
          body: `You were invited to ${inv.spaceName || 'a space'}.`,
          link: `/space/${inv.spaceId}`,
          read: false,
          type: 'space_invite',
          spaceId: inv.spaceId,
          createdAt: serverTimestamp(),
        }, { merge: true });
      } catch (e) {
        // best-effort; ignore if rules or other errors block it
      }
    });
  }, [user, userData]);

  if (userLoading) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-center h-96">
          <div className="animate-pulse space-y-4 text-center">
            <Skeleton className="h-12 w-64 mx-auto" />
            <Skeleton className="h-6 w-48 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl mx-auto flex items-center justify-center shadow-2xl">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
              Welcome to Your Dashboard
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              Connect with your team and manage your virtual workspaces. Please log in to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formatLastActivity = (dateString?: string) => {
    if (!dateString) return 'No recent activity';
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Active now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  // Helper function to check if a space is hidden for the current user
  const isSpaceHiddenForUser = (spaceId: string) => {
    return userHiddenMeetings.includes(spaceId) && (userData as any)?.role !== 'admin';
  };

  // Show empty state if no real spaces exist
  if (!spacesLoading && realSpaces.length === 0) {
    return (
      <div className="w-full space-y-6">
        {/* Header Section */}
        <header className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur-xl opacity-20"></div>
                  <h1 className="relative text-3xl lg:text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                    Welcome back, {userData?.name?.split(' ')[0] || 'Kushal'}!
                  </h1>
                </div>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-base lg:text-lg max-w-2xl leading-relaxed">
                Ready to get started? Create your first virtual workspace to collaborate with your team.
              </p>
            </div>
            
            {/* Pending invitations banner */}
            {Array.isArray((userData as any)?.pendingSpaces) && (userData as any).pendingSpaces.length > 0 && (
              <div className="w-full lg:w-auto">
                <Card className="border-0 shadow-md bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">You have pending space invitations</CardTitle>
                    <CardDescription className="text-xs">Open the invited space to join the meeting.</CardDescription>
                  </CardHeader>
                  <CardContent className="py-0 pb-3">
                    <div className="flex flex-wrap gap-2">
                      {(userData as any).pendingSpaces.slice(0, 3).map((inv: any, idx: number) => (
                        <Link key={idx} href={`/space/${inv.spaceId}`} className="text-xs underline">
                          {inv.spaceName || 'Space'}
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            {/* Fallback hint when no pendingSpaces but invites by email exist */}
            {invitedSpaceIds.length > 0 && (
              <div className="w-full lg:w-auto">
                <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">Invited spaces detected</CardTitle>
                    <CardDescription className="text-xs">We found invitations for your email. Please wait a moment or refresh.</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            )}
            {userData?.role === 'admin' && (
              <CreateSpaceDialog>
                <Button size="lg" className="group relative overflow-hidden bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 shadow-xl hover:shadow-2xl transition-all duration-300 border-0 text-white font-semibold px-6 py-2.5">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
                  <PlusCircle className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                  <span className="relative">Create Space / Schedule Meeting</span>
                  <div className="absolute inset-0 rounded-lg bg-white/20 opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                </Button>
              </CreateSpaceDialog>
            )}
          </div>
        </header>

        {/* Empty State */}
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-3xl blur-2xl opacity-20"></div>
            <div className="relative w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-500 rounded-3xl flex items-center justify-center shadow-2xl">
              <Users className="w-12 h-12 text-white" />
            </div>
          </div>
          
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              No Spaces Yet
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-md">
              You haven't joined any spaces yet. {userData?.role === 'admin' ? 'Create your first space or ask an admin to add you to existing spaces.' : 'Ask an admin to create spaces and add you as a member.'}
            </p>
          </div>

          {userData?.role === 'admin' && (
            <CreateSpaceDialog>
              <Button size="lg" className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300">
                <PlusCircle className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                Create Your First Space / Schedule Meeting
              </Button>
            </CreateSpaceDialog>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header Section */}
      <header className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur-xl opacity-20"></div>
                <h1 className="relative text-3xl lg:text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  Welcome back, {userData?.name?.split(' ')[0] || 'Kushal'}!
                </h1>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-base lg:text-lg max-w-2xl leading-relaxed">
              Ready to dive into your virtual workspaces? You have{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {activeSpaces.length} active meeting{activeSpaces.length !== 1 ? 's' : ''}
              </span>{' '}
              and{' '}
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                {spacesToShow.length} total spaces
              </span>{' '}
              to explore.
            </p>
          </div>
          
          {userData?.role === 'admin' && (
            <CreateSpaceDialog>
              <Button size="lg" className="group relative overflow-hidden bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 shadow-xl hover:shadow-2xl transition-all duration-300 border-0 text-white font-semibold px-6 py-2.5">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
                <PlusCircle className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                <span className="relative">Create Space / Schedule Meeting</span>
                <div className="absolute inset-0 rounded-lg bg-white/20 opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
              </Button>
            </CreateSpaceDialog>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/20 border-blue-200/50 dark:border-blue-800/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600 dark:text-blue-400 text-sm font-medium">Total Spaces</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{spacesToShow.length}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-600 dark:text-emerald-400 text-sm font-medium">Active Now</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{activeSpaces.length}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center">
                  <Activity className="w-5 h-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/20 dark:to-purple-900/20 border-purple-200/50 dark:border-purple-800/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-600 dark:text-purple-400 text-sm font-medium">Team Members</p>
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{teamMembersCount}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/20 border-amber-200/50 dark:border-amber-800/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-600 dark:text-amber-400 text-sm font-medium">Avg. Rating</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                    {spacesToShow.length > 0 ? 
                      (spacesToShow.reduce((acc, space) => acc + (space.rating || 4.5), 0) / spacesToShow.length).toFixed(1) : 
                      '4.5'
                    }
                  </p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-amber-500 to-amber-600 rounded-lg flex items-center justify-center">
                  <Star className="w-5 h-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </header>

      {/* Active Meetings Section */}
      {activeSpaces.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Active Meetings</h2>
            {spacesToShow.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllSpaces(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-500 flex items-center transition-colors"
              >
                View All Spaces <ArrowRight className="ml-1 w-4 h-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {(showAllSpaces ? activeSpaces : activeSpaces.slice(0, 4)).map(space => (
              <SpaceCard
                key={space.id}
                space={space}
                isActiveMeeting={!!space.activeMeeting}
                formatLastActivity={formatLastActivity}
                getSpaceGradient={getSpaceGradient}
                userRole={(userData as any)?.role}
                userId={user?.uid}
                isHiddenForUser={isSpaceHiddenForUser(space.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent Spaces Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Your Recent Spaces</h2>
          {spacesToShow.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllSpaces(true)}
              className="text-sm font-medium text-blue-600 hover:text-blue-500 flex items-center transition-colors"
            >
              View All Spaces <ArrowRight className="ml-1 w-4 h-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {recentSpaces.map(space => (
            <SpaceCard 
              key={space.id} 
              space={space} 
              isActiveMeeting={!!space.activeMeeting}
              formatLastActivity={formatLastActivity}
              getSpaceGradient={getSpaceGradient}
              userRole={(userData as any)?.role}
              userId={user?.uid}
              isHiddenForUser={isSpaceHiddenForUser(space.id)}
            />
          ))}
        </div>
      </section>

      {/* AI Suggestions Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">AI-Powered Suggestions</h2>
          <span className="text-sm font-medium text-slate-500 flex items-center">
            Explore More <ArrowRight className="ml-1 w-4 h-4" />
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AiSuggestionCard />
          <AiSuggestionCard />
          <AiSuggestionCard />
        </div>
      </section>

      {/* View All Spaces Modal */}
      {showAllSpaces && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAllSpaces(false)}
          />
          <div className="absolute inset-x-0 bottom-0 md:inset-0 md:m-auto md:max-w-5xl md:max-h-[80vh] md:rounded-2xl bg-white dark:bg-slate-950 shadow-2xl border border-slate-200/60 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
              <h3 className="text-lg font-semibold">All Spaces</h3>
              <button
                type="button"
                onClick={() => setShowAllSpaces(false)}
                className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-auto max-h-[70vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {spacesToShow.map(space => (
                  <SpaceCard
                    key={space.id}
                    space={space}
                    isActiveMeeting={!!space.activeMeeting}
                    formatLastActivity={formatLastActivity}
                    getSpaceGradient={getSpaceGradient}
                    userRole={(userData as any)?.role}
                    userId={user?.uid}
                    isHiddenForUser={isSpaceHiddenForUser(space.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}