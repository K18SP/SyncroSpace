
'use client';

import { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PlusCircle, Clock, MapPin, CheckCircle, Calendar as CalendarIcon } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { CreateSpaceDialog } from '@/components/dashboard/create-space-dialog';
import { forceCleanupCompletedMeetings } from '@/lib/meeting-notifications';


function GoogleIcon() {
    return (
      <svg viewBox="0 0 48 48" className="h-4 w-4">
        <path
          fill="#FFC107"
          d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
        ></path>
        <path
          fill="#FF3D00"
          d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
        ></path>
        <path
          fill="#4CAF50"
          d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.657-3.356-11.303-7.962l-6.571,4.819C9.656,39.663,16.318,44,24,44z"
        ></path>
        <path
          fill="#1976D2"
          d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C43.021,36.251,44,30.413,44,24C44,22.659,43.862,21.35,43.611,20.083z"
        ></path>
      </svg>
    );
  }

const initialEvents = [
    {
      date: new Date(new Date().setDate(new Date().getDate() + 1)),
      title: 'Project Phoenix - Sprint Planning',
      time: '10:00 AM - 11:00 AM',
      location: '#general space',
      attendees: ['https://i.pravatar.cc/150?u=a042581f4e29026704d', 'https://i.pravatar.cc/150?u=a042581f4e29026704e', 'https://i.pravatar.cc/150?u=a042581f4e29026704f'],
      tag: 'Meeting',
      source: 'syncrospace',
    },
    {
      date: new Date(new Date().setDate(new Date().getDate() + 1)),
      title: 'Q3 Design Review',
      time: '2:00 PM - 3:30 PM',
      location: '#design-team space',
      attendees: ['https://i.pravatar.cc/150?u=a042581f4e29026704f', 'https://i.pravatar.cc/150?u=a042581f4e29026704a'],
      tag: 'Design',
      source: 'syncrospace',
    },
     {
      date: new Date(new Date().setDate(new Date().getDate() + 3)),
      title: 'New Feature Launch',
      time: 'All Day',
      location: 'Production',
      attendees: [],
      tag: 'Deadline',
      source: 'syncrospace',
    }
  ];

const googleEvents = [
    {
        date: new Date(new Date().setDate(new Date().getDate() + 2)),
        title: 'Focus Time: Project X',
        time: '9:00 AM - 12:00 PM',
        location: 'Google Calendar',
        attendees: [],
        tag: 'Focus',
        source: 'google'
    },
    {
        date: new Date(new Date().setDate(new Date().getDate() + 4)),
        title: 'Dentist Appointment',
        time: '3:00 PM - 4:00 PM',
        location: 'Google Calendar',
        attendees: [],
        tag: 'Personal',
        source: 'google'
    }
];

export default function CalendarPage() {
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [isGoogleConnected, setIsGoogleConnected] = useState(false);
    const { toast } = useToast();
    const [user] = useAuthState(auth);
    const [refreshKey, setRefreshKey] = useState(0);

    // Fetch meetings from database
    const meetingsQuery = user && user.email ? query(
        collection(db, 'meetings'),
        where('attendees', 'array-contains', user.email)
    ) : null;
    const [meetingsSnapshot, meetingsLoading, meetingsError] = useCollection(meetingsQuery);

    // Simple refresh mechanism to update meeting status
    useEffect(() => {
        const interval = setInterval(() => {
            setRefreshKey(prev => prev + 1);
        }, 60000); // Update every minute

        return () => clearInterval(interval);
    }, []);

    const handleConnectGoogle = () => {
        setIsGoogleConnected(true);
        toast({
            title: 'Google Calendar Connected',
            description: 'Your Google Calendar events are now visible.',
        })
    }

    const handleForceCleanup = async () => {
        try {
            await forceCleanupCompletedMeetings(user?.email || undefined);
            toast({
                title: 'Cleanup Complete',
                description: 'Completed meetings have been cleaned up.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Cleanup Failed',
                description: 'Error cleaning up completed meetings.',
            });
        }
    }

    // Convert meetings from database to calendar events
    const dbMeetings = meetingsSnapshot?.docs.map(doc => {
        const data = doc.data();
        console.log('📅 Meeting data:', data);
        
        const now = new Date(); // Calculate current time directly
        const startTime = new Date(data.startDateTime);
        const endTime = new Date(data.endDateTime);
        
        // Determine meeting status based on current time
        let tag = 'Meeting';
        if (now >= startTime && now <= endTime) {
            tag = 'Ongoing';
        } else if (now > endTime) {
            tag = 'Completed';
        } else if (now < startTime) {
            tag = 'Upcoming';
        }
        
        return {
            id: doc.id,
            date: startTime,
            title: data.title,
            time: `${startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
            location: 'Virtual Meeting',
            attendees: data.attendees || [],
            tag: tag,
            source: 'syncrospace',
            description: data.description,
            status: data.status,
        };
    }).sort((a, b) => a.date.getTime() - b.date.getTime()) || [];

    console.log('📅 Total meetings found:', dbMeetings.length);
    console.log('📅 User email:', user?.email);

    const allEvents = isGoogleConnected ? [...dbMeetings, ...initialEvents, ...googleEvents] : [...dbMeetings, ...initialEvents];
    
    const selectedDayEvents = allEvents.filter(event => 
        date && event.date.toDateString() === date.toDateString()
    );

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-8">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Team Calendar</h1>
                    <p className="text-muted-foreground">
                        View and manage team events, meetings, and deadlines.
                    </p>
                </div>
                <div className="flex gap-2">
                    {isGoogleConnected ? (
                         <Button variant="outline" disabled>
                            <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                            Google Calendar Connected
                        </Button>
                    ) : (
                        <Button onClick={handleConnectGoogle} variant="outline">
                            <GoogleIcon />
                            <span className="ml-2">Connect Google Calendar</span>
                        </Button>
                    )}
                    <CreateSpaceDialog>
                        <Button>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            Create Space / Schedule Meeting
                        </Button>
                    </CreateSpaceDialog>
                    <Button onClick={handleForceCleanup} variant="outline">
                        <Clock className="mr-2 h-4 w-4" />
                        Cleanup Completed Meetings
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2">
                    <Card>
                        <CardContent className="p-0">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={setDate}
                                className="w-full p-4"
                                classNames={{
                                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                                    day_today: "bg-accent text-accent-foreground",
                                  }}
                            />
                        </CardContent>
                    </Card>
                </div>
                <div className="md:col-span-1 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Upcoming Events</CardTitle>
                            <CardDescription>
                                {date ? date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'No date selected'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {selectedDayEvents.length > 0 ? (
                                <ul className="space-y-4">
                                    {selectedDayEvents.map((event, index) => (
                                        <li key={index} className="space-y-2 rounded-lg border p-4">
                                            <div className="flex justify-between items-start">
                                                <h3 className="font-semibold">{event.title}</h3>
                                                <Badge 
                                                    variant={
                                                        event.tag === 'Deadline' ? 'destructive' : 
                                                        event.tag === 'Ongoing' ? 'default' : 
                                                        event.tag === 'Completed' ? 'outline' : 
                                                        'secondary'
                                                    }
                                                    className={
                                                        event.tag === 'Ongoing' ? 'bg-green-500 hover:bg-green-600 text-white' : ''
                                                    }
                                                >
                                                    {event.tag}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center text-sm text-muted-foreground">
                                                {event.source === 'google' ? <GoogleIcon /> : <Clock className="h-4 w-4" />}
                                                <span className="ml-2">{event.time}</span>
                                            </div>
                                            <p className="flex items-center text-sm text-muted-foreground"><MapPin className="mr-2 h-4 w-4" /> {event.location}</p>
                                            {event.attendees.length > 0 && (
                                                <div className="flex items-center gap-2 pt-2">
                                                    <div className="flex -space-x-2 overflow-hidden">
                                                        {event.attendees.map((attendee: string, i: number) => (
                                                            <Avatar key={i} className="inline-block border-2 border-background h-8 w-8">
                                                                <AvatarImage src={attendee} />
                                                                <AvatarFallback>{getInitials('User')}</AvatarFallback>
                                                            </Avatar>
                                                        ))}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">
                                                        {event.attendees.length} attendees
                                                    </span>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-center text-muted-foreground py-8">
                                    <p>No events scheduled for this day.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
