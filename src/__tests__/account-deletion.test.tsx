import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountDeletion } from '../components/account-deletion/account-deletion';

describe('AccountDeletion', () => {
  it('renders the confirmation dialog', () => {
    render(<AccountDeletion onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /delete account/i })).toBeInTheDocument();
  });

  it('delete button is disabled until DELETE is typed', () => {
    render(<AccountDeletion onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const button = screen.getByRole('button', { name: /permanently delete/i });
    expect(button).toBeDisabled();
  });

  it('delete button is enabled after typing DELETE', async () => {
    render(<AccountDeletion onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/type.*delete/i), 'DELETE');
    const button = screen.getByRole('button', { name: /permanently delete/i });
    expect(button).not.toBeDisabled();
  });

  it('does not enable button for lowercase "delete"', async () => {
    render(<AccountDeletion onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/type.*delete/i), 'delete');
    const button = screen.getByRole('button', { name: /permanently delete/i });
    expect(button).toBeDisabled();
  });

  it('calls onConfirm when confirmed and submitted', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<AccountDeletion onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/type.*delete/i), 'DELETE');
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<AccountDeletion onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel account deletion/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows error message when error prop is provided', () => {
    render(
      <AccountDeletion
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        error="Deletion failed. Please try again."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/deletion failed/i);
  });

  it('shows deleting state when isDeleting is true', async () => {
    render(<AccountDeletion onConfirm={vi.fn()} onCancel={vi.fn()} isDeleting />);
    await userEvent.type(screen.getByLabelText(/type.*delete/i), 'DELETE');
    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled();
  });
});
