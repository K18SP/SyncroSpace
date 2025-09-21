
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Textarea } from '../ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Clock, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { sendMeetingInvitations } from '@/lib/meeting-notifications';

const formSchema = z.object({
  name: z.string().min(1, 'Space name is required.'),
  description: z.string().optional(),
  isMeeting: z.boolean().default(false),
  date: z.date().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  attendees: z.string().optional(),
}).refine((data) => {
  if (data.isMeeting) {
    if (!data.date || !data.startTime || !data.endTime) {
      return false;
    }
    const start = new Date(`${data.date.toISOString().split('T')[0]}T${data.startTime}`);
    const end = new Date(`${data.date.toISOString().split('T')[0]}T${data.endTime}`);
    return end > start;
  }
  return true;
}, {
  message: "For meetings: date, start time, and end time are required, and end time must be after start time",
  path: ["endTime"],
});

export function CreateSpaceDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [user] = useAuthState(auth);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      isMeeting: false,
      date: new Date(),
      startTime: '',
      endTime: '',
      attendees: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to create a space.',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Create the space
      const spaceData = {
        name: values.name,
        description: values.description,
        creatorId: user.uid,
        members: [user.uid],
        createdAt: serverTimestamp(),
        isMeeting: values.isMeeting,
      };

      const spaceRef = await addDoc(collection(db, 'spaces'), spaceData);

      // If it's a meeting, also create a meeting record and send invitations
      if (values.isMeeting && values.date && values.startTime && values.endTime) {
        const attendeeEmails = values.attendees
          ? values.attendees.split(',').map(email => email.trim()).filter(email => email.length > 0)
          : [];

        const startDateTime = new Date(`${values.date.toISOString().split('T')[0]}T${values.startTime}`);
        const endDateTime = new Date(`${values.date.toISOString().split('T')[0]}T${values.endTime}`);

        // Create meeting document
        const meetingRef = await addDoc(collection(db, 'meetings'), {
          title: values.name,
          description: values.description,
          startTime: serverTimestamp(),
          endTime: serverTimestamp(),
          startDateTime: startDateTime.toISOString(),
          endDateTime: endDateTime.toISOString(),
          creatorId: user.uid,
          creatorName: user.displayName || user.email,
          attendees: attendeeEmails,
          status: 'scheduled',
          spaceId: spaceRef.id,
          createdAt: serverTimestamp(),
        });

        // Add attendees to space members and send invitations
        if (attendeeEmails.length > 0) {
          const userPromises = attendeeEmails.map(async (email) => {
            try {
              const usersQuery = query(collection(db, 'users'), where('email', '==', email));
              const usersSnap = await getDocs(usersQuery);
              
              if (!usersSnap.empty) {
                const invitedUser = usersSnap.docs[0];
                const invitedUid = invitedUser.id;

                // Add user to space members
                await updateDoc(doc(db, 'spaces', spaceRef.id), {
                  members: arrayUnion(invitedUid),
                });

                // Add pending meeting to user's profile
                await updateDoc(doc(db, 'users', invitedUid), {
                  pendingMeetings: arrayUnion({
                    meetingId: meetingRef.id,
                    title: values.name,
                    startDateTime: startDateTime.toISOString(),
                    endDateTime: endDateTime.toISOString(),
                    invitedBy: user.uid,
                    invitedAt: serverTimestamp(),
                    status: 'invited',
                  }),
                });

                // Create notification for the user
                await addDoc(collection(db, 'users', invitedUid, 'notifications'), {
                  title: 'Meeting Invitation',
                  body: `You have been invited to "${values.name}" on ${values.date ? format(values.date, 'PPP') : 'unknown date'} at ${values.startTime ?? 'unknown time'}`,
                  link: `/meeting/${meetingRef.id}`,
                  read: false,
                  type: 'meeting_invite',
                  meetingId: meetingRef.id,
                  meetingTitle: values.name,
                  scheduledTime: startDateTime.toISOString(),
                  invitedBy: user.uid,
                  createdAt: serverTimestamp(),
                });
              }
            } catch (error) {
              console.error(`Error processing attendee ${email}:`, error);
            }
          });

          await Promise.all(userPromises);

          // Send email invitations
          const meetingData = {
            id: meetingRef.id,
            title: values.name,
            description: values.description,
            startDateTime: startDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
            attendees: attendeeEmails,
            creatorId: user.uid,
            creatorName: user.displayName || user.email || 'Unknown',
            status: 'scheduled',
          };

          await sendMeetingInvitations(meetingData);
        }
      }

      toast({
        title: values.isMeeting ? 'Meeting Scheduled' : 'Space Created',
        description: `The "${values.name}" ${values.isMeeting ? 'meeting has been scheduled' : 'space has been created'} successfully.`,
      });
      
      form.reset();
      setOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error creating space',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create a New Space</DialogTitle>
          <DialogDescription>
            Create a virtual space or schedule a meeting. You can invite others and set timing.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="isMeeting"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className="h-4 w-4"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>This is a scheduled meeting</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{form.watch('isMeeting') ? 'Meeting Title' : 'Space Name'}</FormLabel>
                  <FormControl>
                    <Input placeholder={form.watch('isMeeting') ? "e.g., Sprint Planning Meeting" : "e.g., Project Phoenix HQ"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder={form.watch('isMeeting') ? "Meeting agenda, objectives, or details..." : "What is this space for?"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch('isMeeting') && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Meeting Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="time"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="time"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="attendees"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Attendees</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="email1@company.com, email2@company.com"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (form.watch('isMeeting') ? 'Scheduling...' : 'Creating...') : (form.watch('isMeeting') ? 'Schedule Meeting' : 'Create Space')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
