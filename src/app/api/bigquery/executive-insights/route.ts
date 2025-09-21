import { NextRequest, NextResponse } from 'next/server';
import { BigQueryAI } from '@/lib/bigquery';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

// API endpoint for executive insights dashboard
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'weekly';
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }

    // Fetch comprehensive analytics data
    let analyticsData;
    
    try {
      // First, get the current user's data to determine if they're admin
      const userDoc = await getDocs(query(
        collection(db, 'users'),
        where('uid', '==', userId)
      ));
      
      const currentUser = userDoc.empty ? null : userDoc.docs[0].data();
      const isAdmin = currentUser?.role === 'admin';
      
      const [usersSnapshot, meetingsSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'meetings'))
      ]);

      // For non-admin users, only show spaces they have access to
      let spacesSnapshot;
      if (isAdmin) {
        // Admin sees all spaces
        spacesSnapshot = await getDocs(collection(db, 'spaces'));
      } else {
        // Non-admin users see only spaces they're members of
        spacesSnapshot = await getDocs(query(
          collection(db, 'spaces'),
          where('members', 'array-contains', userId)
        ));
      }

      analyticsData = {
        period,
        timestamp: new Date().toISOString(),
        userRole: currentUser?.role || 'user',
        isAdmin,
        metrics: {
          totalUsers: isAdmin ? usersSnapshot.docs.length : 1, // Non-admin only sees themselves
          totalSpaces: spacesSnapshot.docs.length,
          totalMeetings: meetingsSnapshot.docs.length,
          activeUsers: usersSnapshot.docs.filter(doc => {
            const data = doc.data();
            const lastActive = data.lastActive ? new Date(data.lastActive) : new Date(0);
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return lastActive > weekAgo;
          }).length,
          activeSpaces: spacesSnapshot.docs.filter(doc => doc.data().activeMeeting).length,
        },
        trends: {
          userGrowth: usersSnapshot.docs.filter(doc => {
            const createdAt = doc.data().createdAt ? new Date(doc.data().createdAt) : new Date(0);
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return createdAt > weekAgo;
          }).length,
          spaceUtilization: spacesSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            memberCount: doc.data().members?.length || 0,
            activeMeeting: doc.data().activeMeeting || false,
            lastActivity: doc.data().lastActivity
          })),
          meetingPatterns: meetingsSnapshot.docs.map(doc => ({
            id: doc.id,
            title: doc.data().title,
            duration: doc.data().durationMinutes || 0,
            participantCount: doc.data().attendees?.length || 0,
            createdAt: doc.data().createdAt
          }))
        }
      };
    } catch (firebaseError) {
      console.error('Firebase data fetch error:', firebaseError);
      // Provide fallback data if Firebase fails
      analyticsData = {
        period,
        timestamp: new Date().toISOString(),
        userRole: 'user',
        isAdmin: false,
        metrics: {
          totalUsers: 0,
          totalSpaces: 0,
          totalMeetings: 0,
          activeUsers: 0,
          activeSpaces: 0,
        },
        trends: {
          userGrowth: 0,
          spaceUtilization: [],
          meetingPatterns: []
        }
      };
    }

    const result = await BigQueryAI.generateExecutiveInsights([analyticsData]);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        insights: result.data[0]?.executive_summary || 'Executive insights generated successfully',
        analytics: analyticsData,
        generatedAt: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to generate executive insights'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Executive insights error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate executive insights'
    }, { status: 500 });
  }
}

// API endpoint for updating executive insights
export async function POST(request: NextRequest) {
  try {
    const { analyticsData, insightType = 'weekly' } = await request.json();
    
    const result = await BigQueryAI.generateExecutiveInsights([analyticsData]);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        insights: result.data[0]?.executive_summary || 'Executive insights generated',
        type: insightType,
        generatedAt: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to generate executive insights'
      }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to generate executive insights'
    }, { status: 500 });
  }
}
