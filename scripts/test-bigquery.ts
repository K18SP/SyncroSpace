#!/usr/bin/env tsx

/**
 * BigQuery Test Script
 * 
 * This script tests the BigQuery AI integration by running
 * various AI functions and displaying the results.
 */

import { BigQueryAI, executeBigQuerySQL } from '../src/lib/bigquery';

async function testPersonalizedContent() {
  console.log('🧪 Testing Personalized Content Generation...');
  
  try {
    const result = await BigQueryAI.generatePersonalizedContent(
      'Create a welcome message for a new user',
      {
        userId: 'test_user_123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'admin',
        spacesCount: 3,
        meetingsAttended: 5,
        engagementScore: 75
      }
    );
    
    if (result.success) {
      console.log('✅ Personalized content generated successfully');
      console.log('Content:', result.data[0]?.generated_content || 'Generated content');
    } else {
      console.log('❌ Failed to generate personalized content');
    }
  } catch (error) {
    console.error('❌ Error testing personalized content:', error);
  }
}

async function testExecutiveInsights() {
  console.log('🧪 Testing Executive Insights Generation...');
  
  try {
    const analyticsData = {
      period: 'weekly',
      timestamp: new Date().toISOString(),
      metrics: {
        totalUsers: 150,
        totalSpaces: 25,
        totalMeetings: 75,
        activeUsers: 120,
        activeSpaces: 8
      },
      trends: {
        userGrowth: 12,
        spaceUtilization: [
          { id: 'space1', name: 'Development', utilization: 85 },
          { id: 'space2', name: 'Marketing', utilization: 70 }
        ],
        meetingPatterns: [
          { type: 'standup', count: 20 },
          { type: 'brainstorming', count: 15 },
          { type: 'planning', count: 10 }
        ]
      }
    };

    const result = await BigQueryAI.generateExecutiveInsights([analyticsData]);
    
    if (result.success) {
      console.log('✅ Executive insights generated successfully');
      console.log('Insights:', result.data[0]?.executive_summary || 'Generated insights');
    } else {
      console.log('❌ Failed to generate executive insights');
    }
  } catch (error) {
    console.error('❌ Error testing executive insights:', error);
  }
}

async function testUserForecast() {
  console.log('🧪 Testing User Engagement Forecasting...');
  
  try {
    const historicalData = {
      userId: 'test_user_123',
      engagementScore: 75,
      lastActiveDate: new Date().toISOString(),
      spaceInteractions: 3,
      meetingCount: 5,
      avgMeetingDuration: 30,
      activityPattern: 'moderately_active'
    };

    const result = await BigQueryAI.forecastUserEngagement(
      'test_user_123',
      [historicalData],
      30
    );
    
    if (result.success) {
      console.log('✅ User engagement forecast generated successfully');
      console.log('Forecast:', result.data[0]?.engagement_forecast || 'Generated forecast');
    } else {
      console.log('❌ Failed to generate user forecast');
    }
  } catch (error) {
    console.error('❌ Error testing user forecast:', error);
  }
}

async function testMeetingAnalytics() {
  console.log('🧪 Testing Meeting Analytics...');
  
  try {
    // Test meeting effectiveness scoring
    const effectivenessResult = await BigQueryAI.scoreMeetingEffectiveness({
      duration_minutes: 45,
      participant_count: 6,
      action_items_count: 4,
      engagement_level: 8
    });
    
    if (effectivenessResult.success) {
      console.log('✅ Meeting effectiveness scored successfully');
      console.log('Score:', effectivenessResult.data[0]?.effectiveness_score || 'Generated score');
    } else {
      console.log('❌ Failed to score meeting effectiveness');
    }

    // Test meeting categorization
    const categorizationResult = await BigQueryAI.categorizeMeeting({
      duration_minutes: 45,
      participant_count: 6,
      meeting_type: 'planning',
      agenda_items: 5
    });
    
    if (categorizationResult.success) {
      console.log('✅ Meeting categorization completed successfully');
      console.log('Categorization:', categorizationResult.data[0] || 'Generated categorization');
    } else {
      console.log('❌ Failed to categorize meeting');
    }
  } catch (error) {
    console.error('❌ Error testing meeting analytics:', error);
  }
}

async function testSpaceRecommendations() {
  console.log('🧪 Testing Space Recommendations...');
  
  try {
    const teamData = {
      team_size: 8,
      collaboration_pattern: 'highly_collaborative',
      project_type: 'software_development',
      timezone: 'PST'
    };

    const result = await BigQueryAI.generateSpaceRecommendations(teamData);
    
    if (result.success) {
      console.log('✅ Space recommendations generated successfully');
      console.log('Recommendations:', result.data[0]?.space_recommendations || 'Generated recommendations');
    } else {
      console.log('❌ Failed to generate space recommendations');
    }
  } catch (error) {
    console.error('❌ Error testing space recommendations:', error);
  }
}

async function testBasicQuery() {
  console.log('🧪 Testing Basic BigQuery Connection...');
  
  try {
    const result = await executeBigQuerySQL(`
      SELECT 
        'BigQuery AI Integration' as test_name,
        CURRENT_TIMESTAMP() as test_time,
        '470012' as project_id,
        'syncrospace_analytics' as dataset_id
    `);
    
    if (result.success) {
      console.log('✅ Basic BigQuery connection successful');
      console.log('Test result:', result.data?.[0] ?? {});
    } else {
      console.log('❌ Basic BigQuery connection failed');
    }
  } catch (error) {
    console.error('❌ Error testing basic query:', error);
  }
}

async function main() {
  console.log('🚀 Starting BigQuery AI Integration Tests...');
  console.log('Project ID: 470012');
  console.log('Dataset: syncrospace_analytics');
  console.log('');

  try {
    await testBasicQuery();
    console.log('');
    
    await testPersonalizedContent();
    console.log('');
    
    await testExecutiveInsights();
    console.log('');
    
    await testUserForecast();
    console.log('');
    
    await testMeetingAnalytics();
    console.log('');
    
    await testSpaceRecommendations();
    console.log('');
    
    console.log('🎉 All tests completed!');
    console.log('');
    console.log('If you see any errors above, please check:');
    console.log('1. BigQuery dataset and tables are created');
    console.log('2. AI models are trained and ready');
    console.log('3. API credentials are correct');
    console.log('4. Required permissions are granted');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run the tests
main().catch(console.error);
