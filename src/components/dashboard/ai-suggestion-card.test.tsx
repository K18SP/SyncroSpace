import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AiSuggestionCard } from './ai-suggestion-card';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { suggestChannel } from '../../ai/flows/suggest-channel';

// Mock dependencies
jest.mock('react-firebase-hooks/auth');
jest.mock('react-firebase-hooks/firestore');
jest.mock('@/ai/flows/suggest-channel');
jest.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

const mockUseAuthState = useAuthState as jest.MockedFunction<typeof useAuthState>;
const mockUseDocumentData = useDocumentData as jest.MockedFunction<typeof useDocumentData>;
const mockSuggestChannel = suggestChannel as jest.MockedFunction<typeof suggestChannel>;

describe('AiSuggestionCard', () => {
  const mockUser = { uid: 'test-uid' };
  const mockUserData = {
    name: 'John Doe',
    jobTitle: 'Software Engineer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthState.mockReturnValue([mockUser, false, undefined] as any);
    mockUseDocumentData.mockReturnValue([mockUserData, false, undefined] as any);
  });

  it('renders the AI suggestion card with initial state', () => {
    render(<AiSuggestionCard />);
    
    expect(screen.getByText('AI-Powered Suggestions')).toBeInTheDocument();
    expect(screen.getByText('Get personalized workspace recommendations')).toBeInTheDocument();
    expect(screen.getByText('Generate Suggestion')).toBeInTheDocument();
  });

  it('shows loading state when user data is loading', () => {
    mockUseDocumentData.mockReturnValue([undefined, true, undefined] as any);
    
    render(<AiSuggestionCard />);
    
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('handles successful suggestion generation', async () => {
    const mockSuggestion = {
      channelName: 'Design Sprint',
      channelDescription: 'Collaborative design sessions for rapid prototyping',
      reason: 'Based on your role as Software Engineer, this channel would help with design collaboration',
    };
    
    mockSuggestChannel.mockResolvedValue(mockSuggestion);
    
    render(<AiSuggestionCard />);
    
    const generateButton = screen.getByText('Generate Suggestion');
    fireEvent.click(generateButton);
    
    expect(screen.getByText('Generating...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Design Sprint')).toBeInTheDocument();
      expect(screen.getByText('Collaborative design sessions for rapid prototyping')).toBeInTheDocument();
    });
  });

  it('handles error when user data is not available', async () => {
    mockUseDocumentData.mockReturnValue([null, false, undefined] as any);
    
    render(<AiSuggestionCard />);
    
    const generateButton = screen.getByText('Generate Suggestion');
    fireEvent.click(generateButton);
    
    await waitFor(() => {
      expect(screen.getByText('Could not load user profile.')).toBeInTheDocument();
    });
  });

  it('handles API error during suggestion generation', async () => {
    mockSuggestChannel.mockRejectedValue(new Error('API Error'));
    
    render(<AiSuggestionCard />);
    
    const generateButton = screen.getByText('Generate Suggestion');
    fireEvent.click(generateButton);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to get suggestion. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows refresh button after successful suggestion', async () => {
    const mockSuggestion = {
      channelName: 'Design Sprint',
      channelDescription: 'Collaborative design sessions for rapid prototyping',
      reason: 'Based on your role as Software Engineer, this channel would help with design collaboration',
    };
    
    mockSuggestChannel.mockResolvedValue(mockSuggestion);
    
    render(<AiSuggestionCard />);
    
    const generateButton = screen.getByText('Generate Suggestion');
    fireEvent.click(generateButton);
    
    await waitFor(() => {
      expect(screen.getByText('Get Another Suggestion')).toBeInTheDocument();
    });
  });
});