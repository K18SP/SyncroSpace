import { NextRequest, NextResponse } from 'next/server';
import { BigQueryAI, DataSync } from '@/lib/bigquery';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

// API endpoint for generating personalized marketing content
export async function POST(request: NextRequest) {
  try {
    const { userId, contentType, userData } = await request.json();
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }
    
    let prompt = '';
    switch (contentType) {
      case 'welcome':
        prompt = 'Create a personalized welcome message for a new user';
        break;
      case 'feature_recommendation':
        prompt = 'Recommend features based on user activity patterns';
        break;
      case 'space_suggestion':
        prompt = 'Suggest relevant spaces based on user role and interests';
        break;
      case 'engagement_boost':
        prompt = 'Create content to boost user engagement';
        break;
      default:
        prompt = 'Create personalized content for the user';
    }

    // Use provided userData or fetch from Firebase
    let finalUserData = userData;
    
    if (!finalUserData) {
      try {
        const userDoc = await getDocs(query(
          collection(db, 'users'),
          where('uid', '==', userId)
        ));
        
        if (!userDoc.empty) {
          const user = userDoc.docs[0].data();
          finalUserData = {
            name: user.name || 'User',
            email: user.email || '',
            role: user.role || 'user',
            lastActive: user.lastActive || new Date().toISOString(),
            spacesCount: user.spacesCount || 0,
            meetingsAttended: user.meetingsAttended || 0,
            engagementScore: 75 // Default score
          };
        }
      } catch (firebaseError) {
        console.error('Firebase data fetch error:', firebaseError);
        // Use fallback data
        finalUserData = {
          name: 'User',
          email: '',
          role: 'user',
          lastActive: new Date().toISOString(),
          spacesCount: 0,
          meetingsAttended: 0,
          engagementScore: 75
        };
      }
    }

    const result = await BigQueryAI.generatePersonalizedContent(prompt, finalUserData);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        content: result.data[0]?.generated_content || 'Generated content',
        contentType
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to generate personalized content'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Personalized content error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate personalized content'
    }, { status: 500 });
  }
}

// API endpoint for executive insights
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const insightType = searchParams.get('type') || 'weekly';
    
    // Fetch data from Firebase
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const spacesSnapshot = await getDocs(collection(db, 'spaces'));
    const meetingsSnapshot = await getDocs(collection(db, 'meetings'));
    
    const analyticsData = {
      users: usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      spaces: spacesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      meetings: meetingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      timestamp: new Date().toISOString(),
      type: insightType
    };

    const result = await BigQueryAI.generateExecutiveInsights([analyticsData]);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        insights: result.data[0]?.executive_summary || 'Executive insights generated',
        data: analyticsData
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
