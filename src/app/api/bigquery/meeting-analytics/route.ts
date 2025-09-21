import { NextRequest, NextResponse } from 'next/server';

type Meeting = {
  id: string;
  durationMinutes?: number;
  attendees?: string[];
  actionItems?: any[];
  type?: string;
  agenda?: any[];
  title?: string;
};
import { BigQueryAI } from '@/lib/bigquery';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

// API endpoint for meeting analytics enhancement
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    const spaceId = searchParams.get('spaceId');
    
    if (!meetingId && !spaceId) {
      return NextResponse.json({
        success: false,
        error: 'Meeting ID or Space ID is required'
      }, { status: 400 });
    }

    let meetingData;
    
    if (meetingId) {
      // Fetch specific meeting
      const meetingDoc = await getDoc(doc(db, 'meetings', meetingId));
      if (!meetingDoc.exists()) {
        return NextResponse.json({
          success: false,
          error: 'Meeting not found'
        }, { status: 404 });
      }
  const { id: _, ...meetingFields } = meetingDoc.data() as Meeting;
  meetingData = { id: meetingDoc.id, ...meetingFields };
    } else {
      // Fetch meetings from space
      const meetingsSnapshot = await getDocs(query(
        collection(db, 'meetings'),
        where('spaceId', '==', spaceId)
      ));
      
      meetingData = meetingsSnapshot.docs.map(doc => {
        const { id: _discard, ...meetingFields } = doc.data() as Meeting;
        return {
          id: doc.id,
          ...meetingFields
        };
      });
    }

    const results = [];
    
  for (const meeting of Array.isArray(meetingData) ? (meetingData as Meeting[]) : [meetingData as Meeting]) {
      // Score meeting effectiveness
      const effectivenessResult = await BigQueryAI.scoreMeetingEffectiveness({
        duration_minutes: meeting.durationMinutes || 30,
        participant_count: meeting.attendees?.length || 0,
        action_items_count: meeting.actionItems?.length || 0,
        engagement_level: calculateEngagementLevel(meeting)
      });

      // Categorize meeting
      const categorizationResult = await BigQueryAI.categorizeMeeting({
        duration_minutes: meeting.durationMinutes || 30,
        participant_count: meeting.attendees?.length || 0,
        meeting_type: meeting.type || 'general',
        agenda_items: meeting.agenda?.length || 0
      });

      results.push({
        meetingId: meeting.id,
        title: meeting.title,
        effectivenessScore: effectivenessResult.success ? 
          effectivenessResult.data[0]?.effectiveness_score : 5,
        categorization: categorizationResult.success ? {
          isBrainstorming: categorizationResult.data[0]?.is_brainstorming || false,
          isStatusUpdate: categorizationResult.data[0]?.is_status_update || false,
          isDecisionMaking: categorizationResult.data[0]?.is_decision_making || false
        } : {
          isBrainstorming: false,
          isStatusUpdate: false,
          isDecisionMaking: false
        },
        insights: generateMeetingInsights(meeting, effectivenessResult, categorizationResult)
      });
    }

    return NextResponse.json({
      success: true,
      analytics: Array.isArray(meetingData) ? results : results[0],
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Meeting analytics error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to analyze meeting data'
    }, { status: 500 });
  }
}

// API endpoint for batch meeting analysis
export async function POST(request: NextRequest) {
  try {
    const { meetingIds, analysisType = 'comprehensive' } = await request.json();
    
    if (!meetingIds || !Array.isArray(meetingIds)) {
      return NextResponse.json({
        success: false,
        error: 'Meeting IDs array is required'
      }, { status: 400 });
    }

    const results = [];
    
    for (const meetingId of meetingIds) {
      const meetingDoc = await getDoc(doc(db, 'meetings', meetingId));
      if (!meetingDoc.exists()) continue;
      
      const { id: _discard, ...meetingFields } = meetingDoc.data() as Meeting;
      const meeting = { id: meetingDoc.id, ...meetingFields };
      
      let analysisResult;
      
      switch (analysisType) {
        case 'effectiveness':
          analysisResult = await BigQueryAI.scoreMeetingEffectiveness({
            duration_minutes: meeting.durationMinutes || 30,
            participant_count: meeting.attendees?.length || 0,
            action_items_count: meeting.actionItems?.length || 0,
            engagement_level: calculateEngagementLevel(meeting)
          });
          break;
          
        case 'categorization':
          analysisResult = await BigQueryAI.categorizeMeeting({
            duration_minutes: meeting.durationMinutes || 30,
            participant_count: meeting.attendees?.length || 0,
            meeting_type: meeting.type || 'general',
            agenda_items: meeting.agenda?.length || 0
          });
          break;
          
        default: // comprehensive
          const [effectivenessResult, categorizationResult] = await Promise.all([
            BigQueryAI.scoreMeetingEffectiveness({
              duration_minutes: meeting.durationMinutes || 30,
              participant_count: meeting.attendees?.length || 0,
              action_items_count: meeting.actionItems?.length || 0,
              engagement_level: calculateEngagementLevel(meeting)
            }),
            BigQueryAI.categorizeMeeting({
              duration_minutes: meeting.durationMinutes || 30,
              participant_count: meeting.attendees?.length || 0,
              meeting_type: meeting.type || 'general',
              agenda_items: meeting.agenda?.length || 0
            })
          ]);
          
          analysisResult = {
            success: effectivenessResult.success && categorizationResult.success,
            effectiveness: effectivenessResult.data[0]?.effectiveness_score || 5,
            categorization: categorizationResult.data[0] || {}
          };
      }
      
      results.push({
        meetingId: meeting.id,
        title: meeting.title,
        analysis: analysisResult,
        generatedAt: new Date().toISOString()
      });
    }

    return NextResponse.json({
      success: true,
      results,
      totalAnalyzed: results.length,
      analysisType
    });

  } catch (error) {
    console.error('Batch meeting analysis error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to analyze meetings'
    }, { status: 500 });
  }
}

// Helper function to calculate engagement level
function calculateEngagementLevel(meeting: any): number {
  let level = 5; // base level
  
  // Duration factor
  const duration = meeting.durationMinutes || 30;
  if (duration > 60) level += 2;
  if (duration < 15) level -= 2;
  
  // Participant factor
  const participants = meeting.attendees?.length || 0;
  if (participants > 5) level += 1;
  if (participants < 2) level -= 1;
  
  // Action items factor
  const actionItems = meeting.actionItems?.length || 0;
  if (actionItems > 3) level += 2;
  if (actionItems === 0) level -= 1;
  
  return Math.max(1, Math.min(10, level));
}

// Helper function to generate meeting insights
function generateMeetingInsights(meeting: any, effectivenessResult: any, categorizationResult: any): string[] {
  const insights = [];
  
  if (effectivenessResult.success) {
    const score = effectivenessResult.data[0]?.effectiveness_score || 5;
    if (score >= 8) {
      insights.push('High effectiveness meeting - excellent structure and outcomes');
    } else if (score >= 6) {
      insights.push('Good meeting effectiveness - room for minor improvements');
    } else {
      insights.push('Meeting effectiveness could be improved - consider agenda optimization');
    }
  }
  
  if (categorizationResult.success) {
    const cat = categorizationResult.data[0];
    if (cat?.is_brainstorming) {
      insights.push('Meeting identified as brainstorming session - consider creative facilitation techniques');
    }
    if (cat?.is_status_update) {
      insights.push('Status update meeting - ensure clear reporting structure');
    }
    if (cat?.is_decision_making) {
      insights.push('Decision-making meeting - focus on clear outcomes and next steps');
    }
  }
  
  return insights;
}
