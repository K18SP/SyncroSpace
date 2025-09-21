import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp,
  arrayRemove,
  arrayUnion 
} from 'firebase/firestore';
import { db } from './firebase';

export interface AdminMeetingAction {
  action: 'end_meeting' | 'delete_meeting' | 'remove_attendee';
  meetingId: string;
  adminId: string;
  adminName: string;
  timestamp: any;
  affectedUsers?: string[];
  reason?: string;
}

export interface MeetingStatus {
  id: string;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled' | 'deleted';
  endedBy?: string;
  endedAt?: any;
  deletedBy?: string;
  deletedAt?: any;
  adminActions?: AdminMeetingAction[];
}

/**
 * Admin service for controlling meetings across the platform
 */
export class AdminMeetingControlService {
  
  /**
   * End a meeting for all attendees - removes from all user dashboards
   * This is an admin-only action that affects all invited users
   */
  static async endMeetingForAllUsers(
    meetingId: string, 
    adminId: string, 
    adminName: string,
    reason?: string
  ): Promise<{ success: boolean; message: string; affectedUsers: string[] }> {
    try {
      // Get the meeting document
      const meetingRef = doc(db, 'meetings', meetingId);
      const meetingSnapshot = await getDocs(query(collection(db, 'meetings'), where('__name__', '==', meetingId)));
      
      if (meetingSnapshot.empty) {
        return { success: false, message: 'Meeting not found', affectedUsers: [] };
      }

      const meetingData = meetingSnapshot.docs[0].data();
      const spaceId = meetingData.spaceId;
      const attendees = meetingData.attendees || [];
      const creatorId = meetingData.creatorId;

      // Update meeting status to 'ended'
      await updateDoc(meetingRef, {
        status: 'ended',
        endedBy: adminId,
        endedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        adminActions: arrayUnion({
          action: 'end_meeting',
          meetingId,
          adminId,
          adminName,
          timestamp: serverTimestamp(),
          affectedUsers: attendees,
          reason
        })
      });

      // If there's an associated space, end the meeting there too
      if (spaceId) {
        const spaceRef = doc(db, 'spaces', spaceId);
        await updateDoc(spaceRef, {
          activeMeeting: false,
          meetingEndsAt: null,
          lastActivity: new Date().toISOString(),
          endedBy: adminId,
          endedAt: serverTimestamp(),
          members: [], // Remove all members from the space
        });
      }

      // Remove meeting from all users' dashboards
      const affectedUsers: string[] = [];
      
      // Get all users who have this meeting in their pendingSpaces or are attendees
      const allUserIds = [...attendees, creatorId];
      const uniqueUserIds = [...new Set(allUserIds)];

      for (const userId of uniqueUserIds) {
        try {
          const userRef = doc(db, 'users', userId);
          const userSnapshot = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
          
          if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data();
            
            // Remove from pendingSpaces
            const currentPendingSpaces = userData.pendingSpaces || [];
            const updatedPendingSpaces = currentPendingSpaces.filter((p: any) => p?.spaceId !== spaceId);
            
            // Add to hiddenMeetings to remove from dashboard
            const currentHiddenMeetings = userData.hiddenMeetings || [];
            const updatedHiddenMeetings = spaceId ? [...currentHiddenMeetings, spaceId] : currentHiddenMeetings;
            
            await updateDoc(userRef, {
              pendingSpaces: updatedPendingSpaces,
              hiddenMeetings: updatedHiddenMeetings,
              lastUpdated: serverTimestamp(),
            });
            
            affectedUsers.push(userId);
          }
        } catch (error) {
          console.error(`Error updating user ${userId}:`, error);
        }
      }

      return {
        success: true,
        message: `Meeting ended successfully. Removed from ${affectedUsers.length} users' dashboards.`,
        affectedUsers
      };

    } catch (error) {
      console.error('Error ending meeting for all users:', error);
      return { success: false, message: 'Failed to end meeting', affectedUsers: [] };
    }
  }

  /**
   * Delete a meeting completely from the database
   * This is an admin-only action that removes the meeting entirely
   */
  static async deleteMeetingCompletely(
    meetingId: string, 
    adminId: string, 
    adminName: string,
    reason?: string
  ): Promise<{ success: boolean; message: string; affectedUsers: string[] }> {
    try {
      // Get the meeting document first
      const meetingSnapshot = await getDocs(query(collection(db, 'meetings'), where('__name__', '==', meetingId)));
      
      if (meetingSnapshot.empty) {
        return { success: false, message: 'Meeting not found', affectedUsers: [] };
      }

      const meetingData = meetingSnapshot.docs[0].data();
      const spaceId = meetingData.spaceId;
      const attendees = meetingData.attendees || [];
      const creatorId = meetingData.creatorId;

      // Remove meeting from all users' dashboards first
      const affectedUsers: string[] = [];
      const allUserIds = [...attendees, creatorId];
      const uniqueUserIds = [...new Set(allUserIds)];

      for (const userId of uniqueUserIds) {
        try {
          const userRef = doc(db, 'users', userId);
          const userSnapshot = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
          
          if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data();
            
            // Remove from pendingSpaces
            const currentPendingSpaces = userData.pendingSpaces || [];
            const updatedPendingSpaces = currentPendingSpaces.filter((p: any) => p?.spaceId !== spaceId);
            
            // Add to hiddenMeetings
            const currentHiddenMeetings = userData.hiddenMeetings || [];
            const updatedHiddenMeetings = spaceId ? [...currentHiddenMeetings, spaceId] : currentHiddenMeetings;
            
            await updateDoc(userRef, {
              pendingSpaces: updatedPendingSpaces,
              hiddenMeetings: updatedHiddenMeetings,
              lastUpdated: serverTimestamp(),
            });
            
            affectedUsers.push(userId);
          }
        } catch (error) {
          console.error(`Error updating user ${userId}:`, error);
        }
      }

      // Delete the meeting document
      await deleteDoc(doc(db, 'meetings', meetingId));

      // If there's an associated space, also delete it
      if (spaceId) {
        await deleteDoc(doc(db, 'spaces', spaceId));
      }

      return {
        success: true,
        message: `Meeting deleted completely. Removed from ${affectedUsers.length} users' dashboards.`,
        affectedUsers
      };

    } catch (error) {
      console.error('Error deleting meeting completely:', error);
      return { success: false, message: 'Failed to delete meeting', affectedUsers: [] };
    }
  }

  /**
   * Remove a specific attendee from a meeting
   * This only affects the specified user's dashboard
   */
  static async removeAttendeeFromMeeting(
    meetingId: string,
    attendeeId: string,
    adminId: string,
    adminName: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get the meeting document
      const meetingSnapshot = await getDocs(query(collection(db, 'meetings'), where('__name__', '==', meetingId)));
      
      if (meetingSnapshot.empty) {
        return { success: false, message: 'Meeting not found' };
      }

      const meetingData = meetingSnapshot.docs[0].data();
      const spaceId = meetingData.spaceId;
      const attendees = meetingData.attendees || [];

      // Remove attendee from meeting attendees list
      const updatedAttendees = attendees.filter((email: string) => email !== attendeeId);
      
      const meetingRef = doc(db, 'meetings', meetingId);
      await updateDoc(meetingRef, {
        attendees: updatedAttendees,
        lastUpdated: serverTimestamp(),
        adminActions: arrayUnion({
          action: 'remove_attendee',
          meetingId,
          adminId,
          adminName,
          timestamp: serverTimestamp(),
          affectedUsers: [attendeeId],
          reason
        })
      });

      // Remove from user's dashboard
      const userRef = doc(db, 'users', attendeeId);
      const userSnapshot = await getDocs(query(collection(db, 'users'), where('__name__', '==', attendeeId)));
      
      if (!userSnapshot.empty) {
        const userData = userSnapshot.docs[0].data();
        
        // Remove from pendingSpaces
        const currentPendingSpaces = userData.pendingSpaces || [];
        const updatedPendingSpaces = currentPendingSpaces.filter((p: any) => p?.spaceId !== spaceId);
        
        // Add to hiddenMeetings
        const currentHiddenMeetings = userData.hiddenMeetings || [];
        const updatedHiddenMeetings = spaceId ? [...currentHiddenMeetings, spaceId] : currentHiddenMeetings;
        
        await updateDoc(userRef, {
          pendingSpaces: updatedPendingSpaces,
          hiddenMeetings: updatedHiddenMeetings,
          lastUpdated: serverTimestamp(),
        });
      }

      return {
        success: true,
        message: `Attendee removed from meeting successfully.`
      };

    } catch (error) {
      console.error('Error removing attendee from meeting:', error);
      return { success: false, message: 'Failed to remove attendee from meeting' };
    }
  }

  /**
   * Get all meetings with admin actions for audit trail
   */
  static async getMeetingAdminActions(meetingId: string): Promise<AdminMeetingAction[]> {
    try {
      const meetingSnapshot = await getDocs(query(collection(db, 'meetings'), where('__name__', '==', meetingId)));
      
      if (meetingSnapshot.empty) {
        return [];
      }

      const meetingData = meetingSnapshot.docs[0].data();
      return meetingData.adminActions || [];

    } catch (error) {
      console.error('Error getting meeting admin actions:', error);
      return [];
    }
  }

  /**
   * Check if a user is an admin
   */
  static async isUserAdmin(userId: string): Promise<boolean> {
    try {
      const userSnapshot = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
      
      if (userSnapshot.empty) {
        return false;
      }

      const userData = userSnapshot.docs[0].data();
      return userData.role === 'admin';

    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }
}
