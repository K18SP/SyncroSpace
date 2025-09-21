import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ForgotPasswordForm } from './forgot-password-form';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '../../hooks/use-toast';

// Mock dependencies
jest.mock('firebase/auth');
jest.mock('@/hooks/use-toast');
jest.mock('@/lib/firebase', () => ({
  auth: {},
}));

const mockSendPasswordResetEmail = sendPasswordResetEmail as jest.MockedFunction<typeof sendPasswordResetEmail>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;

describe('ForgotPasswordForm', () => {
  const mockToast = jest.fn();
  const mockDismiss = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseToast.mockReturnValue({ 
      toast: mockToast,
      dismiss: mockDismiss,
      toasts: []
    });
  });

  it('renders the form with email input and submit button', () => {
    render(<ForgotPasswordForm />);
    
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address and we\'ll send you a link to reset your password.')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('shows validation error for invalid email', async () => {
    render(<ForgotPasswordForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole('button', { name: /send reset link/i });
    
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Invalid email address.')).toBeInTheDocument();
    });
  });

  it('shows loading state during submission', async () => {
    mockSendPasswordResetEmail.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(<ForgotPasswordForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole('button', { name: /send reset link/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);
    
    expect(screen.getByText('Sending...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });

  it('handles successful password reset email sending', async () => {
    mockSendPasswordResetEmail.mockResolvedValue();
    
    render(<ForgotPasswordForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole('button', { name: /send reset link/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Check your email',
        description: 'A password reset link has been sent to test@example.com.',
      });
    });
    
    expect(screen.getByText('Email sent successfully!')).toBeInTheDocument();
    expect(screen.getByText('Check your inbox for the password reset link.')).toBeInTheDocument();
  });

  it('handles error during password reset email sending', async () => {
    const mockError = new Error('Firebase error');
    mockSendPasswordResetEmail.mockRejectedValue(mockError);
    
    render(<ForgotPasswordForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole('button', { name: /send reset link/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send password reset email. Please try again.',
      });
    });
  });

  it('shows back to login link', () => {
    render(<ForgotPasswordForm />);
    
    const backLink = screen.getByText('Back to Login');
    expect(backLink).toBeInTheDocument();
    expect(backLink.closest('a')).toHaveAttribute('href', '/login');
  });

  it('allows sending another email after success', async () => {
    mockSendPasswordResetEmail.mockResolvedValue();
    
    render(<ForgotPasswordForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    let submitButton = screen.getByRole('button', { name: /send reset link/i });
    
    // First submission
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Email sent successfully!')).toBeInTheDocument();
    });
    
    // Should be able to send another email
    submitButton = screen.getByRole('button', { name: /send another email/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(2);
    });
  });
});