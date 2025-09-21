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
import { db, auth } from './firebase';

export interface AdminMeetingAction {
  action: 'end_meeting' | 'delete_meeting' | 'remove_attendee';
  meetingId: string;
  adminId: string;
  adminName: string;
  timestamp: any;
  affectedUsers?: string[];
  reason?: string;
}

export interface AdminMeetingResponse {
  success: boolean;
  message: string;
  affectedUsers?: string[];
  adminActions?: AdminMeetingAction[];
}

/**
 * Client-side admin meeting control service using Firebase client SDK
 * This avoids the need for Firebase Admin SDK during build
 */
export class AdminMeetingClientSimpleService {
  
  /**
   * Check if current user is admin
   */
  static async isCurrentUserAdmin(): Promise<boolean> {
    try {
      const user = auth.currentUser;
      if (!user) return false;

      const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', user.uid)));
      
      if (userDoc.empty) {
        return false;
      }

      const userData = userDoc.docs[0].data();
      return userData.role === 'admin';

    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * End a meeting for all attendees - removes from all user dashboards
   */
  static async endMeetingForAllUsers(
    meetingId: string, 
    adminId: string, 
    adminName: string,
    reason?: string
  ): Promise<AdminMeetingResponse> {
    try {
      // Get the meeting document
      const meetingSnapshot = await getDocs(query(collection(db, 'meetings'), where('__name__', '==', meetingId)));
      
      if (meetingSnapshot.empty) {
        return { success: false, message: 'Meeting not found', affectedUsers: [] };
      }

      const meetingData = meetingSnapshot.docs[0].data();
      const spaceId = meetingData.spaceId;
      const attendees = meetingData.attendees || [];
      const creatorId = meetingData.creatorId;

      // Update meeting status to 'ended'
      const meetingRef = doc(db, 'meetings', meetingId);
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
          const userSnapshot = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
          
          if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data();
            const userRef = doc(db, 'users', userId);
            
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
   */
  static async deleteMeetingCompletely(
    meetingId: string, 
    adminId: string, 
    adminName: string,
    reason?: string
  ): Promise<AdminMeetingResponse> {
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
          const userSnapshot = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
          
          if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data();
            const userRef = doc(db, 'users', userId);
            
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
   */
  static async removeAttendeeFromMeeting(
    meetingId: string,
    attendeeEmail: string,
    adminId: string,
    adminName: string,
    reason?: string
  ): Promise<AdminMeetingResponse> {
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
      const updatedAttendees = attendees.filter((email: string) => email !== attendeeEmail);
      
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
          affectedUsers: [attendeeEmail],
          reason
        })
      });

      // Find the user by email and remove from their dashboard
      const userSnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', attendeeEmail)));
      
      if (!userSnapshot.empty) {
        const userData = userSnapshot.docs[0].data();
        const userRef = doc(db, 'users', userSnapshot.docs[0].id);
        
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
}
