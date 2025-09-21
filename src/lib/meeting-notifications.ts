import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { sendEmailNotification, createMeetingReminderEmail, createMeetingInvitationEmail } from './email';

export interface MeetingData {
  id: string;
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees: string[];
  creatorId: string;
  creatorName: string;
  status: string;
  remindersSent?: boolean;
  spaceId?: string;
}

// Check for meetings that need 10-minute reminders
export const checkMeetingReminders = async (userEmail?: string): Promise<void> => {
  try {
    if (!userEmail) {
      console.log('No user email provided for meeting reminders check');
      return;
    }

    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
    
    // Query meetings where user is an attendee (simplified to avoid index requirement)
    const meetingsQuery = query(
      collection(db, 'meetings'),
      where('attendees', 'array-contains', userEmail),
      where('status', '==', 'scheduled')
    );
    
    const meetingsSnapshot = await getDocs(meetingsQuery);
    
    if (meetingsSnapshot.empty) {
      console.log('📅 No meetings found for user:', userEmail);
      return;
    }
    
    for (const meetingDoc of meetingsSnapshot.docs) {
      const meetingData = meetingDoc.data() as MeetingData;
      
      // Check if we've already sent reminders for this meeting
      if (meetingData.remindersSent) {
        continue;
      }

      // Check if meeting is starting in the next 10 minutes
      const meetingStartTime = new Date(meetingData.startDateTime);
      if (meetingStartTime < now || meetingStartTime > tenMinutesFromNow) {
        continue;
      }
      
      // Send reminder emails to all attendees
      const reminderPromises = meetingData.attendees.map(async (attendeeEmail) => {
        const reminderEmail = createMeetingReminderEmail(
          attendeeEmail,
          meetingData.title,
          meetingData.startDateTime,
          meetingData.endDateTime,
          meetingData.description
        );
        
        return sendEmailNotification(reminderEmail);
      });
      
      await Promise.all(reminderPromises);
      
      // Mark reminders as sent
      await updateDoc(doc(db, 'meetings', meetingDoc.id), {
        remindersSent: true,
        reminderSentAt: serverTimestamp(),
      });
      
      console.log(`📧 Sent 10-minute reminders for meeting: ${meetingData.title}`);
    }
  } catch (error) {
    console.error('Error checking meeting reminders:', error);
  }
};

// Send meeting invitation emails
export const sendMeetingInvitations = async (meetingData: MeetingData): Promise<void> => {
  try {
    const invitationPromises = meetingData.attendees.map(async (attendeeEmail) => {
      const invitationEmail = createMeetingInvitationEmail(
        attendeeEmail,
        meetingData.title,
        meetingData.startDateTime,
        meetingData.endDateTime,
        meetingData.creatorName,
        meetingData.description
      );
      
      return sendEmailNotification(invitationEmail);
    });
    
    await Promise.all(invitationPromises);
    console.log(`📧 Sent meeting invitations for: ${meetingData.title}`);
  } catch (error) {
    console.error('Error sending meeting invitations:', error);
  }
};

// Start the reminder checking service
export const startMeetingReminderService = (userEmail?: string): void => {
  // Check every minute for meetings that need reminders
  setInterval(() => {
    checkMeetingReminders(userEmail);
    cleanupCompletedMeetings(userEmail); // Also clean up completed meetings
  }, 60 * 1000);
  
  // Also check immediately when the service starts
  checkMeetingReminders(userEmail);
  cleanupCompletedMeetings(userEmail);
  
  console.log('🕐 Meeting reminder service started');
};

// Clean up completed meetings (delete them from database)
export const cleanupCompletedMeetings = async (userEmail?: string): Promise<void> => {
  try {
    if (!userEmail) {
      console.log('🧹 No user email provided for cleanup');
      return;
    }

    // Check if user is admin
    const usersQuery = query(collection(db, 'users'), where('email', '==', userEmail));
    const usersSnapshot = await getDocs(usersQuery);
    
    if (usersSnapshot.empty) {
      console.log('🧹 User not found, skipping cleanup');
      return;
    }
    
    const userData = usersSnapshot.docs[0].data();
    if (userData.role !== 'admin') {
      console.log('🧹 User is not admin, skipping cleanup');
      return;
    }

    const now = new Date();
    console.log('🧹 Starting cleanup at:', now.toISOString());
    
    // Query all scheduled meetings (simplified to avoid index requirement)
    const meetingsQuery = query(
      collection(db, 'meetings'),
      where('status', '==', 'scheduled')
    );
    
    const meetingsSnapshot = await getDocs(meetingsQuery);
    
    if (meetingsSnapshot.empty) {
      console.log('📅 No scheduled meetings found');
      return;
    }
    
    console.log(`📅 Found ${meetingsSnapshot.docs.length} scheduled meetings to check`);
    
    // Filter and delete completed meetings
    const completedMeetings = meetingsSnapshot.docs.filter(meetingDoc => {
      const meetingData = meetingDoc.data() as MeetingData;
      const endTime = new Date(meetingData.endDateTime);
      const isCompleted = endTime <= now;
      
      console.log(`📅 Meeting "${meetingData.title}":`, {
        endTime: endTime.toISOString(),
        now: now.toISOString(),
        isCompleted: isCompleted
      });
      
      return isCompleted;
    });
    
    if (completedMeetings.length === 0) {
      console.log('📅 No completed meetings found to delete');
      return;
    }
    
    console.log(`🗑️ Found ${completedMeetings.length} completed meetings to delete`);
    
    // Delete completed meetings
    const deletePromises = completedMeetings.map(async (meetingDoc) => {
      const meetingData = meetingDoc.data() as MeetingData;
      
      try {
        // Delete the meeting document
        await deleteDoc(doc(db, 'meetings', meetingDoc.id));
        
        // Also clean up the associated space if it exists and is a meeting space
        if (meetingData.spaceId) {
          const spaceDocRef = doc(db, 'spaces', meetingData.spaceId);
          const spaceDoc = await getDoc(spaceDocRef);
          
          if (spaceDoc.exists() && spaceDoc.data().isMeeting) {
            // Delete the meeting space as well
            await deleteDoc(spaceDocRef);
            console.log(`🗑️ Deleted meeting space: ${meetingData.spaceId}`);
          }
        }
        
        console.log(`🗑️ Deleted completed meeting: ${meetingData.title}`);
      } catch (error) {
        console.error(`Error deleting meeting ${meetingDoc.id}:`, error);
      }
    });
    
    await Promise.all(deletePromises);
    console.log(`🗑️ Cleaned up ${completedMeetings.length} completed meetings`);
  } catch (error) {
    console.error('Error cleaning up completed meetings:', error);
  }
};

// Manual cleanup function for immediate testing
export const forceCleanupCompletedMeetings = async (userEmail?: string): Promise<void> => {
  console.log('🧹 Force cleanup triggered');
  await cleanupCompletedMeetings(userEmail);
};

// Utility function to schedule a one-time reminder check
export const scheduleReminderCheck = (delayMinutes: number, userEmail?: string): void => {
  const delayMs = delayMinutes * 60 * 1000;
  setTimeout(() => checkMeetingReminders(userEmail), delayMs);
};
