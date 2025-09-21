'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Clock, Trash2, Users, Calendar } from 'lucide-react';
import { AdminMeetingClientSimpleService } from '@/lib/admin-meeting-client-simple';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Meeting {
  id: string;
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees: string[];
  creatorName: string;
  status: string;
  spaceId?: string;
}

interface AdminMeetingControlsProps {
  meetings: Meeting[];
  onMeetingUpdate?: () => void;
}

export function AdminMeetingControls({ meetings, onMeetingUpdate }: AdminMeetingControlsProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminReason, setAdminReason] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const checkAdminStatus = async () => {
      const adminStatus = await AdminMeetingClientSimpleService.isCurrentUserAdmin();
      setIsAdmin(adminStatus);
    };
    checkAdminStatus();
  }, []);

  const handleEndMeeting = async (meetingId: string) => {
    setLoading(meetingId);
    try {
      // Get current user info
      const user = auth.currentUser;
      if (!user) {
        toast({
          title: "Error",
          description: "User not authenticated",
          variant: "destructive",
        });
        return;
      }

      const result = await AdminMeetingClientSimpleService.endMeetingForAllUsers(
        meetingId,
        user.uid,
        user.displayName || user.email || 'Admin',
        adminReason || 'Meeting ended by admin'
      );
      
      if (result.success) {
        toast({
          title: "Meeting Ended",
          description: result.message,
        });
        setAdminReason('');
        onMeetingUpdate?.();
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to end meeting",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    setLoading(meetingId);
    try {
      // Get current user info
      const user = auth.currentUser;
      if (!user) {
        toast({
          title: "Error",
          description: "User not authenticated",
          variant: "destructive",
        });
        return;
      }

      const result = await AdminMeetingClientSimpleService.deleteMeetingCompletely(
        meetingId,
        user.uid,
        user.displayName || user.email || 'Admin',
        adminReason || 'Meeting deleted by admin'
      );
      
      if (result.success) {
        toast({
          title: "Meeting Deleted",
          description: result.message,
        });
        setAdminReason('');
        onMeetingUpdate?.();
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete meeting",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  if (!isAdmin) {
    return null;
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      scheduled: { variant: 'default' as const, label: 'Scheduled' },
      active: { variant: 'default' as const, label: 'Active' },
      ended: { variant: 'secondary' as const, label: 'Ended' },
      cancelled: { variant: 'destructive' as const, label: 'Cancelled' },
      deleted: { variant: 'destructive' as const, label: 'Deleted' },
    };
    
    const statusInfo = statusMap[status as keyof typeof statusMap] || { variant: 'default' as const, label: status };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          <CardTitle>Admin Meeting Controls</CardTitle>
        </div>
        <CardDescription>
          Manage meetings across the platform. End meetings to remove them from all user dashboards, 
          or delete meetings completely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="admin-reason">Reason for actions (optional)</Label>
          <Input
            id="admin-reason"
            value={adminReason}
            onChange={(e) => setAdminReason(e.target.value)}
            placeholder="Enter reason for admin actions..."
          />
        </div>

        <div className="space-y-3">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h4 className="font-medium">{meeting.title}</h4>
                  {meeting.description && (
                    <p className="text-sm text-gray-600">{meeting.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDateTime(meeting.startDateTime)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {meeting.attendees?.length || 0} attendees
                    </div>
                    <div>by {meeting.creatorName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(meeting.status)}
                </div>
              </div>

              <div className="flex gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      disabled={loading === meeting.id || meeting.status === 'ended' || meeting.status === 'deleted'}
                    >
                      <Clock className="mr-2 h-3 w-3" />
                      End Meeting
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>End Meeting for All</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will end the meeting "{meeting.title}" for all attendees and remove it from their dashboards.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleEndMeeting(meeting.id)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        End Meeting
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      disabled={loading === meeting.id || meeting.status === 'deleted'}
                    >
                      <Trash2 className="mr-2 h-3 w-3" />
                      Delete Meeting
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Meeting Completely</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the meeting "{meeting.title}" and remove it from all users' dashboards.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteMeeting(meeting.id)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete Meeting
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}

          {meetings.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No meetings found to manage.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
