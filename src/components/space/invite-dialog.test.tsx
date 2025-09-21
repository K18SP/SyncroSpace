import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InviteDialog } from './invite-dialog';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

// Mock dependencies
jest.mock('react-firebase-hooks/auth');
jest.mock('@/hooks/use-toast');
jest.mock('firebase/firestore');
jest.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

const mockUseAuthState = useAuthState as jest.MockedFunction<typeof useAuthState>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockAddDoc = addDoc as jest.MockedFunction<typeof addDoc>;
const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;

describe('InviteDialog', () => {
  const mockUser = { uid: 'test-uid', email: 'inviter@example.com' };
  const mockToast = jest.fn();
  const mockDismiss = jest.fn();

  const defaultProps = {
    spaceId: 'test-space-id',
    spaceName: 'Test Space',
    children: <button>Invite User</button>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthState.mockReturnValue([mockUser, false, undefined] as any);
    mockUseToast.mockReturnValue({
      toast: mockToast,
      dismiss: mockDismiss,
      toasts: []
    });
  });

  it('renders trigger button', () => {
    render(<InviteDialog {...defaultProps} />);
    
    expect(screen.getByText('Invite User')).toBeInTheDocument();
  });

  it('opens dialog when trigger is clicked', () => {
    render(<InviteDialog {...defaultProps} />);
    
    const triggerButton = screen.getByText('Invite User');
    fireEvent.click(triggerButton);
    
    expect(screen.getByText('Invite to Test Space')).toBeInTheDocument();
    expect(screen.getByText('Send an invitation to join this space')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('shows validation error for invalid email', async () => {
    render(<InviteDialog {...defaultProps} />);
    
    const triggerButton = screen.getByText('Invite User');
    fireEvent.click(triggerButton);
    
    const emailInput = screen.getByLabelText(/email/i);
    const sendButton = screen.getByText('Send Invitation');
    
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.click(sendButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email to send an invitation.')).toBeInTheDocument();
    });
  });

  it('shows loading state during invitation sending', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] } as any);
    mockAddDoc.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({} as any), 100)));
    
    render(<InviteDialog {...defaultProps} />);
    
    const triggerButton = screen.getByText('Invite User');
    fireEvent.click(triggerButton);
    
    const emailInput = screen.getByLabelText(/email/i);
    const sendButton = screen.getByText('Send Invitation');
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(sendButton);
    
    expect(screen.getByText('Sending...')).toBeInTheDocument();
    expect(sendButton).toBeDisabled();
  });

  it('handles successful invitation sending to new user', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] } as any);
    mockAddDoc.mockResolvedValue({} as any);
    
    render(<InviteDialog {...defaultProps} />);
    
    const triggerButton = screen.getByText('Invite User');
    fireEvent.click(triggerButton);
    
    const emailInput = screen.getByLabelText(/email/i);
    const sendButton = screen.getByText('Send Invitation');
    
    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } });
    fireEvent.click(sendButton);
    
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Invitation sent',
        description: 'An invitation has been sent to newuser@example.com',
      });
    });
    
    expect(mockAddDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        spaceId: 'test-space-id',
        spaceName: 'Test Space',
        invitedEmail: 'newuser@example.com',
        invitedBy: 'test-uid',
        status: 'pending',
      })
    );
  });

  it('handles existing user invitation', async () => {
    const mockExistingUser = {
      id: 'existing-user-id',
      data: () => ({ email: 'existing@example.com', name: 'John Doe' })
    };
    mockGetDocs.mockResolvedValue({ 
      empty: false, 
      docs: [mockExistingUser] 
    } as any);
    
    render(<InviteDialog {...defaultProps} />);
    
    const triggerButton = screen.getByText('Invite User');
    fireEvent.click(triggerButton);
    
    const emailInput = screen.getByLabelText(/email/i);
    const sendButton = screen.getByText('Send Invitation');
    
    fireEvent.change(emailInput, { target: { value: 'existing@example.com' } });
    fireEvent.click(sendButton);
    
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Invitation sent',
        description: 'An invitation has been sent to existing@example.com',
      });
    });
  });

  it('handles error during invitation sending', async () => {
    mockGetDocs.mockRejectedValue(new Error('Database error'));
    
    render(<InviteDialog {...defaultProps} />);
    
    const triggerButton = screen.getByText('Invite User');
    fireEvent.click(triggerButton);
    
    const emailInput = screen.getByLabelText(/email/i);
    const sendButton = screen.getByText('Send Invitation');
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(sendButton);
    
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send invitation. Please try again.',
      });
    });
  });

  it('closes dialog after successful invitation', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] } as any);
    mockAddDoc.mockResolvedValue({} as any);
    
    render(<InviteDialog {...defaultProps} />);
    
    const triggerButton = screen.getByText('Invite User');
    fireEvent.click(triggerButton);
    
    const emailInput = screen.getByLabelText(/email/i);
    const sendButton = screen.getByText('Send Invitation');
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(sendButton);
    
    await waitFor(() => {
      expect(screen.queryByText('Invite to Test Space')).not.toBeInTheDocument();
    });
  });

  it('requires authentication', () => {
    mockUseAuthState.mockReturnValue([null, false, undefined] as any);
    
    render(<InviteDialog {...defaultProps} />);
    
    const triggerButton = screen.getByText('Invite User');
    fireEvent.click(triggerButton);
    
    const emailInput = screen.getByLabelText(/email/i);
    const sendButton = screen.getByText('Send Invitation');
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(sendButton);
    
    // Should not proceed without user authentication
    expect(mockAddDoc).not.toHaveBeenCalled();
  });
});