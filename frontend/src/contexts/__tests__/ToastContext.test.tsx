import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast, useToastStack } from '../ToastContext';

// ============================================
// Helper: component that calls showToast
// ============================================

function ShowToastButton({ message, type }: { message: string; type?: 'success' | 'error' | 'info' }) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(message, type)}>
      Show Toast
    </button>
  );
}

function ToastList() {
  const { toasts, dismissToast } = useToastStack();
  return (
    <ul>
      {toasts.map((t) => (
        <li key={t.id} data-testid={`toast-${t.type}`}>
          {t.message}
          <button onClick={() => dismissToast(t.id)}>Dismiss</button>
        </li>
      ))}
    </ul>
  );
}

function ToastTestHarness({ message = 'Hello', type }: { message?: string; type?: 'success' | 'error' | 'info' }) {
  return (
    <ToastProvider>
      <ShowToastButton message={message} type={type} />
      <ToastList />
    </ToastProvider>
  );
}

// ============================================
// Tests
// ============================================

describe('ToastContext', () => {
  it('starts with no toasts', () => {
    render(<ToastTestHarness />);
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('showToast adds a toast with the correct message', async () => {
    const user = userEvent.setup();
    render(<ToastTestHarness message="Campaign saved!" type="success" />);

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));

    expect(screen.getByText('Campaign saved!')).toBeInTheDocument();
  });

  it('showToast stores the correct type', async () => {
    const user = userEvent.setup();
    render(<ToastTestHarness message="Error occurred" type="error" />);

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));

    expect(screen.getByTestId('toast-error')).toBeInTheDocument();
  });

  it('defaults to type "info" when no type is provided', async () => {
    const user = userEvent.setup();
    render(<ToastTestHarness message="Info message" />);

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));

    expect(screen.getByTestId('toast-info')).toBeInTheDocument();
  });

  it('can show multiple toasts', async () => {
    const user = userEvent.setup();
    render(<ToastTestHarness message="Toast" />);

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('dismissToast removes a specific toast', async () => {
    const user = userEvent.setup();
    render(<ToastTestHarness message="Dismissible" />);

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('Dismissible')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Dismissible')).not.toBeInTheDocument();
  });
});

// ============================================
// useToast outside provider
// ============================================

describe('useToast outside provider', () => {
  it('throws an error when used outside <ToastProvider>', () => {
    // Suppress React's console.error for this expected throw
    const originalError = console.error;
    console.error = () => {};

    function BadComponent() {
      useToast();
      return null;
    }

    expect(() => render(<BadComponent />)).toThrow(
      'useToast must be used inside <ToastProvider>'
    );

    console.error = originalError;
  });
});
