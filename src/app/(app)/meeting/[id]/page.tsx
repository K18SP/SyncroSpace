'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Clock, Users, Calendar, MapPin, Video, ArrowLeft } from 'lucide-react';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { doc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import Link from 'next/link';
import { getInitials } from '@/lib/utils';

interface MeetingData {
  id: string;
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees: string[];
  creatorId: string;
  creatorName: string;
  status: string;
  spaceId?: string;
}

export default function MeetingPage() {
  const params = useParams();
  const meetingId = params.id as string;
  const [user] = useAuthState(auth);
  const [isJoining, setIsJoining] = useState(false);
  
  const meetingDocRef = doc(db, 'meetings', meetingId);
  const [meetingData, meetingLoading, meetingError] = useDocumentData(meetingDocRef);

  const isUserInvited = user?.email && meetingData?.attendees?.includes(user.email);
  const isCreator = user?.uid === meetingData?.creatorId;
  const canJoin = isUserInvited || isCreator;

  const startTime = meetingData ? new Date(meetingData.startDateTime) : null;
  const endTime = meetingData ? new Date(meetingData.endDateTime) : null;
  const now = new Date();
  const isMeetingActive = startTime && endTime && now >= startTime && now <= endTime;
  const isMeetingUpcoming = startTime && now < startTime;
  const isMeetingPast = endTime && now > endTime;

  const handleJoinMeeting = async () => {
    if (!meetingData || !user) return;
    
    setIsJoining(true);
    try {
      // If meeting doesn't have a space yet, create one
      let spaceId = meetingData.spaceId;
      
      if (!spaceId) {
        // Create a new space for this meeting
        const { addDoc, collection, serverTimestamp, updateDoc } = await import('firebase/firestore');
        
        const spaceRef = await addDoc(collection(db, 'spaces'), {
          name: meetingData.title,
          description: meetingData.description || 'Meeting Space',
          creatorId: meetingData.creatorId || user.uid,
          members: [user.uid],
          createdAt: serverTimestamp(),
          meetingId: meetingId,
          isMeetingSpace: true,
        });
        
        spaceId = spaceRef.id;
        
        // Update the meeting with the space ID
        await updateDoc(doc(db, 'meetings', meetingId), {
          spaceId: spaceId,
        });
      } else {
        // Ensure current user is a member of the existing space
        const { updateDoc, arrayUnion } = await import('firebase/firestore');
        await updateDoc(doc(db, 'spaces', spaceId), {
          members: arrayUnion(user.uid),
        });
      }
      
      // Redirect to the space
      window.location.href = `/space/${spaceId}`;
    } catch (error) {
      console.error('Error joining meeting:', error);
    } finally {
      setIsJoining(false);
    }
  };

  if (meetingLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (meetingError || !meetingData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Meeting Not Found</h1>
          <p className="text-gray-600 mb-8">The meeting you're looking for doesn't exist or has been removed.</p>
          <Link href="/dashboard">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!canJoin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-8">You don't have permission to view this meeting.</p>
          <Link href="/dashboard">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">{meetingData.title}</CardTitle>
                <CardDescription className="mt-2">
                  {meetingData.description || 'No description provided'}
                </CardDescription>
              </div>
              <Badge 
                variant={isMeetingActive ? "default" : isMeetingUpcoming ? "secondary" : "outline"}
                className="ml-4"
              >
                {isMeetingActive ? 'In Progress' : isMeetingUpcoming ? 'Upcoming' : 'Completed'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  {startTime?.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  {startTime?.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    hour12: true 
                  })} - {endTime?.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    hour12: true 
                  })}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">Virtual Meeting</span>
              </div>
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  {meetingData.attendees?.length || 0} attendees
                </span>
              </div>
            </div>

            {meetingData.attendees && meetingData.attendees.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Attendees</h4>
                <div className="flex flex-wrap gap-2">
                  {meetingData.attendees.map((email: string, index: number) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {getInitials(email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-gray-600">{email}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canJoin && (isMeetingActive || isMeetingUpcoming) && (
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleJoinMeeting}
                  disabled={isJoining}
                  className="w-full"
                  size="lg"
                >
                  <Video className="mr-2 h-4 w-4" />
                  {isJoining ? 'Joining...' : isMeetingActive ? 'Join Meeting' : 'Join When Ready'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
