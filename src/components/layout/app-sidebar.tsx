'use client';
import * as React from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  MessageSquare,
  Network,
  Settings,
  LifeBuoy,
  Hash,
  KanbanSquare,
  BarChart2,
  Calendar,
  PlusCircle,
  Bell,
  Contact,
  Users,
  Building,
  PenSquare,
  Layers,
  Sparkles,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { Separator } from '../ui/separator';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollection, useDocumentData } from 'react-firebase-hooks/firestore';
import { auth, db } from '@/lib/firebase';
import { doc, query, collection, where, setDoc, serverTimestamp, onSnapshot, documentId } from 'firebase/firestore';
import { CreateSpaceDialog } from '../dashboard/create-space-dialog';

export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams();
  const [user] = useAuthState(auth);
  const userDocRef = user ? doc(db, 'users', user.uid) : null;
  const [userData] = useDocumentData(userDocRef);

  const spacesQuery = user
    ? query(
        collection(db, 'spaces'),
        where('members', 'array-contains', user.uid)
      )
    : null;
  const [spaces, spacesLoading, spacesError] = useCollection(spacesQuery);

  // Also include invited spaces (pending) so employees see them immediately
  const invitedIdsFromUserDoc: string[] = Array.isArray((userData as any)?.pendingSpaces)
    ? (userData as any).pendingSpaces
        .map((p: any) => p?.spaceId)
        .filter((id: any) => typeof id === 'string')
    : [];

  const invitesByEmailQuery = user?.email
    ? query(
        collection(db, 'invites'),
        where('invitedEmail', '==', user.email),
        where('status', '==', 'pending')
      )
    : null;
  const [invitesSnap] = useCollection(invitesByEmailQuery);
  const invitedIdsFromInvites: string[] = invitesSnap?.docs
    ?.map(d => (d.data() as any)?.spaceId)
    ?.filter((id: any) => typeof id === 'string') || [];

  const invitedIds = Array.from(new Set<string>([...invitedIdsFromUserDoc, ...invitedIdsFromInvites]));
  const invitedSpacesQuery = user && invitedIds.length > 0
    ? query(
        collection(db, 'spaces'),
        where(documentId(), 'in', invitedIds.slice(0, 10))
      )
    : null;
  const [invitedSpacesSnap] = useCollection(invitedSpacesQuery);

  // Merge member spaces and invited spaces for display
  const mergedSidebarSpaces = React.useMemo(() => {
    const byId = new Map<string, any>();
    spaces?.docs?.forEach(d => byId.set(d.id, { id: d.id, ...(d.data() as any) }));
    invitedSpacesSnap?.docs?.forEach(d => byId.set(d.id, { id: d.id, ...(d.data() as any) }));
    return Array.from(byId.values());
  }, [spaces, invitedSpacesSnap]);

  // Get all users data to calculate active participants for each space
  const allUsersQuery = user ? query(collection(db, 'users')) : null;
  const [allUsersSnapshot] = useCollection(allUsersQuery);
  const allUsers = allUsersSnapshot?.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)) || [];

  // Calculate active participants for each space and filter out inactive/ended spaces
  const spacesWithActiveParticipants = React.useMemo(() => {
    return mergedSidebarSpaces
      .map(space => {
        // Always filter out users who have this space in their hiddenMeetings array
        // This ensures that users who left the meeting are not counted, regardless of meeting status
        const activeParticipants = space.members?.filter((memberId: string) => {
          const user = allUsers.find(u => u.uid === memberId);
          const hiddenMeetings = user?.hiddenMeetings || [];
          return !hiddenMeetings.includes(space.id);
        }) || [];
        
        return { ...space, activeParticipantCount: activeParticipants.length };
      })
      .filter(space => {
        // Filter out spaces that are in the current user's hiddenMeetings
        const userHiddenMeetings = (userData as any)?.hiddenMeetings || [];
        if (userHiddenMeetings.includes(space.id)) {
          return false;
        }

        // For meeting spaces, check if the meeting is still active
        if (space.isMeeting || space.isMeetingSpace) {
          // If it's a meeting space, check if it has activeMeeting true
          if (!space.activeMeeting) {
            return false;
          }
          
          // Check if meeting has ended (meetingEndsAt is in the past)
          if (space.meetingEndsAt) {
            const now = new Date();
            const meetingEndTime = space.meetingEndsAt.toDate ? space.meetingEndsAt.toDate() : new Date(space.meetingEndsAt);
            if (meetingEndTime < now) {
              return false;
            }
          }
        }

        // Filter out spaces with no active participants (everyone has left)
        if (space.activeParticipantCount === 0) {
          return false;
        }

        // Filter out spaces that haven't been active recently (older than 7 days)
        if (space.lastActivity) {
          const lastActivityDate = new Date(space.lastActivity);
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          if (lastActivityDate < sevenDaysAgo && !space.activeMeeting) {
            return false;
          }
        }

        return true;
      });
  }, [mergedSidebarSpaces, allUsers, userData]);

  // Debug sidebar space visibility
  React.useEffect(() => {
    if (!user) return;
    console.log('[Sidebar] uid', user.uid);
    console.log('[Sidebar] memberSpaces count', spaces?.docs?.length || 0);
    if (spacesError) {
      console.error('[Sidebar] memberSpaces error', spacesError);
    }
    console.log('[Sidebar] invited ids', invitedIds);
    console.log('[Sidebar] invitedSpaces count', invitedSpacesSnap?.docs?.length || 0);
    if (spaces?.docs) console.log('[Sidebar] memberSpaceIds', spaces.docs.map(d => d.id));
    if (invitedSpacesSnap?.docs) console.log('[Sidebar] invitedSpaceIds', invitedSpacesSnap.docs.map(d => d.id));
  }, [user, spaces, invitedSpacesSnap, invitedIds]);

  // Query for unread notifications from the user's notifications subcollection
  const notificationsQuery = user
    ? query(
        collection(db, 'users', user.uid, 'notifications'),
        where('read', '==', false)
      )
    : null;
  const [notifications, notificationsLoading] = useCollection(notificationsQuery);

  // Calculate notification count
  const notificationCount = notifications?.docs?.length || 0;

  // Debug notifications - Add this for debugging
  React.useEffect(() => {
    if (notifications && notifications.docs) {
      console.log('🔔 Sidebar Notifications Debug:', {
        count: notificationCount,
        notifications: notifications.docs.map(doc => ({
          id: doc.id,
          data: doc.data()
        }))
      });
    }
    if (notificationsLoading) {
      console.log('🔄 Loading notifications...');
    }
  }, [notifications, notificationCount, notificationsLoading]);

  // Debug userData and pending invites
  React.useEffect(() => {
    if (userData) {
      console.log('👤 User Data:', userData);
      const pending = (userData as any)?.pendingSpaces;
      if (pending) {
        console.log('📬 Pending spaces:', pending);
      }
    }
  }, [userData]);

  const isActive = (path: string) => {
    return pathname.startsWith(path);
  };

  // Enhanced notification creation for pending space invites
  React.useEffect(() => {
    if (!user || !userData) return;
    
    const pending = (userData as any)?.pendingSpaces as any[] | undefined;
    console.log('🔍 Processing pending invites:', pending);
    
    if (!Array.isArray(pending) || pending.length === 0) return;

    pending.forEach(async (inv: any) => {
      try {
        const notifId = `invite_${inv.spaceId}`;
        console.log('📝 Creating notification:', notifId, inv);
        
        const notificationData = {
          title: 'Space invitation',
          body: `You were invited to join "${inv.spaceName || 'a space'}".`,
          link: `/space/${inv.spaceId}`,
          read: false,
          type: 'space_invite',
          spaceId: inv.spaceId,
          spaceName: inv.spaceName,
          invitedBy: inv.invitedBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        await setDoc(
          doc(db, 'users', user.uid, 'notifications', notifId), 
          notificationData,
          { merge: true }
        );
        
        console.log('✅ Notification created successfully:', notifId);
      } catch (error) {
        console.error('❌ Error creating notification:', error);
      }
    });
  }, [user, userData]);

  // Add real-time listener for notifications (alternative approach)
  React.useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'users', user.uid, 'notifications'),
        where('read', '==', false)
      ),
      (snapshot) => {
        console.log('🔄 Real-time notifications update:', {
          size: snapshot.size,
          docs: snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }))
        });
      },
      (error) => {
        console.error('❌ Error listening to notifications:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Add meeting invitations handler
  React.useEffect(() => {
    if (!user || !userData) return;
    
    const pendingMeetings = (userData as any)?.pendingMeetings as any[] | undefined;
    console.log('🎥 Processing pending meetings:', pendingMeetings);
    
    if (!Array.isArray(pendingMeetings) || pendingMeetings.length === 0) return;

    pendingMeetings.forEach(async (meeting: any) => {
      try {
        const notifId = `meeting_${meeting.meetingId || meeting.id}`;
        console.log('📝 Creating meeting notification:', notifId, meeting);
        
        const notificationData = {
          title: 'Meeting invitation',
          body: `You were invited to join "${meeting.title || 'a meeting'}".`,
          link: `/meeting/${meeting.meetingId || meeting.id}`,
          read: false,
          type: 'meeting_invite',
          meetingId: meeting.meetingId || meeting.id,
          meetingTitle: meeting.title,
          scheduledTime: meeting.scheduledTime,
          invitedBy: meeting.invitedBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        await setDoc(
          doc(db, 'users', user.uid, 'notifications', notifId), 
          notificationData,
          { merge: true }
        );
        
        console.log('✅ Meeting notification created successfully:', notifId);
      } catch (error) {
        console.error('❌ Error creating meeting notification:', error);
      }
    });
  }, [user, userData]);

  const mainMenuItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/notifications', icon: Bell, label: 'Notifications' },
    { href: '/company', icon: Building, label: 'Company' },
    { href: '/board', icon: KanbanSquare, label: 'Board' },
    { href: '/whiteboard', icon: PenSquare, label: 'Whiteboard' },
    { href: '/calendar', icon: Calendar, label: 'Calendar' },
    { href: '/contacts', icon: Contact, label: 'Contacts' },
    { href: '/connect', icon: Network, label: 'Connect' },
    { href: '/chat', icon: MessageSquare, label: 'Chat' },
  ];

  const adminMenuItems = [
    { href: '/analytics', icon: BarChart2, label: 'Analytics' },
    { href: '/users', icon: Users, label: 'Users' },
  ];

  return (
    <Sidebar className="w-56 border-r border-slate-200/50 dark:border-slate-800/50 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl">
      <SidebarHeader className="p-4 border-b border-slate-200/50 dark:border-slate-800/50">
        <Link href="/dashboard" className="flex items-center gap-2 group transition-all duration-300 hover:scale-105">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg blur-lg opacity-60 group-hover:opacity-80 transition-all duration-300"></div>
            <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg shadow-lg group-hover:shadow-xl transition-all duration-300">
              <Layers className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent truncate">
              SyncroSpace
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide truncate">
              Virtual Collaboration
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="p-3 space-y-4">
        {/* Main Navigation */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 px-2 mb-3">
            <div className="w-1 h-3 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
            <Sparkles className="h-3 w-3 text-blue-500" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Workspace
            </span>
          </div>
          <SidebarMenu>
            {mainMenuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(item.href)}
                  className="group relative overflow-hidden rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-blue-50/80 hover:to-purple-50/80 dark:hover:from-blue-950/30 dark:hover:to-purple-950/30 hover:shadow-md hover:scale-[1.01]"
                >
                  <Link href={item.href} className="flex items-center gap-2 px-2 py-2 relative">
                    {isActive(item.href) && (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg"></div>
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b from-blue-500 to-purple-500 rounded-r-full"></div>
                      </>
                    )}
                    <item.icon className={`h-4 w-4 transition-all duration-300 flex-shrink-0 ${
                      isActive(item.href) 
                        ? 'text-blue-600 dark:text-blue-400 scale-110' 
                        : 'text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:scale-110'
                    }`} />
                    <span className={`font-medium transition-colors duration-300 truncate ${
                      isActive(item.href)
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                    }`}>
                      {item.label}
                    </span>
                    {item.label === 'Notifications' && notificationCount > 0 && (
                      <div className="ml-auto relative flex-shrink-0">
                        <div className="absolute inset-0 bg-red-500/20 rounded-full blur-sm animate-pulse"></div>
                        <div className="relative bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-1.5 py-0.5 min-w-[1rem] h-4 rounded-full flex items-center justify-center font-bold shadow-lg">
                          {notificationCount}
                        </div>
                      </div>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>

        {/* Admin Section */}
        {userData?.role === 'admin' && (
          <div className="space-y-1">
            <Separator className="bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700 my-3" />
            <div className="flex items-center gap-2 px-2 mb-3">
              <div className="w-1 h-3 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
              <Users className="h-3 w-3 text-emerald-500" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex-1 truncate">
                Admin Panel
              </span>
              <div className="bg-gradient-to-r from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 text-emerald-700 dark:text-emerald-400 text-xs px-1.5 py-0.5 rounded-full font-bold border border-emerald-200 dark:border-emerald-800">
                Admin
              </div>
            </div>
            <SidebarMenu>
              {adminMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    className="group relative overflow-hidden rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-emerald-50/80 hover:to-teal-50/80 dark:hover:from-emerald-950/30 dark:hover:to-teal-950/30 hover:shadow-md hover:scale-[1.01]"
                  >
                    <Link href={item.href} className="flex items-center gap-2 px-2 py-2 relative">
                      {isActive(item.href) && (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-lg"></div>
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-r-full"></div>
                        </>
                      )}
                      <item.icon className={`h-4 w-4 transition-all duration-300 flex-shrink-0 ${
                        isActive(item.href) 
                          ? 'text-emerald-600 dark:text-emerald-400 scale-110' 
                          : 'text-slate-600 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:scale-110'
                      }`} />
                      <span className={`font-medium transition-colors duration-300 truncate ${
                        isActive(item.href)
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-700 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
                      }`}>
                        {item.label}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        )}

        {/* Spaces Section */}
        <div className="space-y-1">
          <Separator className="bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700 my-3" />
          <div className="flex items-center justify-between px-2 mb-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-1 h-3 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full"></div>
              <Hash className="h-3 w-3 text-indigo-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                Spaces
              </span>
            </div>
            {!spacesLoading && (
              <div className="bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 text-indigo-700 dark:text-indigo-400 text-xs px-1.5 py-0.5 rounded-full font-bold border border-indigo-200 dark:border-indigo-800 flex-shrink-0">
                {spacesWithActiveParticipants.length}
              </div>
            )}
          </div>
          <SidebarMenu>
            {spacesLoading ? (
              <>
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
              </>
            ) : (
              spacesWithActiveParticipants.map(space => {
                const spaceGradients = [
                  'from-pink-500 to-rose-500',
                  'from-blue-500 to-cyan-500',
                  'from-green-500 to-emerald-500',
                  'from-purple-500 to-indigo-500',
                  'from-orange-500 to-amber-500',
                  'from-teal-500 to-green-500',
                  'from-red-500 to-pink-500',
                  'from-violet-500 to-purple-500',
                ];
                const gradientIndex = space.id.charCodeAt(0) % spaceGradients.length;
                
                return (
                  <SidebarMenuItem key={space.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(`/space/${space.id}`)}
                      className="group relative overflow-hidden rounded-lg transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
                    >
                      <Link href={`/space/${space.id}`} className="flex items-center gap-2 px-2 py-2 relative">
                        {isActive(`/space/${space.id}`) && (
                          <>
                            <div className={`absolute inset-0 bg-gradient-to-r ${spaceGradients[gradientIndex]} opacity-10 rounded-lg`}></div>
                            <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b ${spaceGradients[gradientIndex]} rounded-r-full`}></div>
                          </>
                        )}
                        <div className={`relative w-6 h-6 rounded-md bg-gradient-to-r ${spaceGradients[gradientIndex]} flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-300 flex-shrink-0`}>
                          <div className={`absolute inset-0 bg-gradient-to-r ${spaceGradients[gradientIndex]} rounded-md blur-sm opacity-50 group-hover:opacity-70 transition-opacity duration-300`}></div>
                          <span className="relative text-white text-xs font-bold">
                            {space.name?.charAt(0).toUpperCase() || 'S'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`font-medium transition-colors duration-300 truncate block text-sm ${
                            isActive(`/space/${space.id}`)
                              ? 'text-slate-900 dark:text-slate-100'
                              : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'
                          }`}>
                            {space.name || 'Unnamed Space'}
                          </span>
                          {space.activeParticipantCount !== undefined && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">
                              {space.activeParticipantCount} member{space.activeParticipantCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {space.activeMeeting && (
                          <div className="relative flex-shrink-0">
                            <div className="absolute inset-0 bg-green-500/30 rounded-full blur-sm animate-pulse"></div>
                            <div className="relative w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-lg"></div>
                          </div>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })
            )}
            
            {userData?.role === 'admin' && (
              <CreateSpaceDialog>
                <SidebarMenuButton className="group relative overflow-hidden rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-violet-50/80 hover:to-purple-50/80 dark:hover:from-violet-950/30 dark:hover:to-purple-950/30 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-violet-400 dark:hover:border-violet-500 hover:shadow-md hover:scale-[1.01]">
                  <div className="flex items-center gap-2 px-2 py-2 w-full">
                    <div className="relative w-6 h-6 rounded-md bg-gradient-to-r from-violet-500 to-purple-500 flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-300 flex-shrink-0">
                      <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-purple-500 rounded-md blur-sm opacity-50 group-hover:opacity-70 transition-opacity duration-300"></div>
                      <PlusCircle className="relative h-3 w-3 text-white" />
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-300 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors duration-300 truncate text-sm">
                      Create Space
                    </span>
                  </div>
                </SidebarMenuButton>
              </CreateSpaceDialog>
            )}
          </SidebarMenu>
        </div>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-t from-slate-50/50 to-transparent dark:from-slate-900/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive('/account')}
              className="group relative overflow-hidden rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-slate-50/80 hover:to-slate-100/80 dark:hover:from-slate-800/80 dark:hover:to-slate-700/80 hover:shadow-md hover:scale-[1.01]"
            >
              <Link href="/account" className="flex items-center gap-2 px-2 py-3 relative">
                {isActive('/account') && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg"></div>
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-500 rounded-r-full"></div>
                  </>
                )}
                <div className="relative w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-300 ring-2 ring-slate-200 dark:ring-slate-700 group-hover:ring-blue-400 flex-shrink-0">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-sm opacity-50 group-hover:opacity-70 transition-opacity duration-300"></div>
                  <User className="relative h-4 w-4 text-white" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-sm font-semibold truncate transition-colors duration-300 ${
                    isActive('/account')
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}>
                    {userData?.name || 'User'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {userData?.email || 'user@example.com'}
                  </span>
                </div>
                <Settings className={`h-4 w-4 transition-all duration-300 flex-shrink-0 ${
                  isActive('/account')
                    ? 'text-blue-600 dark:text-blue-400 scale-110'
                    : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-hover:scale-110'
                }`} />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              isActive={isActive('/support')} 
              className="group relative overflow-hidden rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-emerald-50/80 hover:to-teal-50/80 dark:hover:from-emerald-950/30 dark:hover:to-teal-950/30 hover:shadow-md hover:scale-[1.01]"
            >
              <Link href="/support" className="flex items-center gap-2 px-2 py-2 relative">
                {isActive('/support') && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-lg"></div>
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-r-full"></div>
                  </>
                )}
                <LifeBuoy className={`h-4 w-4 transition-all duration-300 flex-shrink-0 ${
                  isActive('/support') 
                    ? 'text-emerald-600 dark:text-emerald-400 scale-110' 
                    : 'text-slate-600 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:scale-110'
                }`} />
                <span className={`font-medium transition-colors duration-300 truncate ${
                  isActive('/support')
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-700 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
                }`}>
                  Support
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}