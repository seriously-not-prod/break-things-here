import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventPlannerApp } from '../components/event-planner/event-planner-app';

const AUTH_STORAGE_KEY = 'festival-planner-auth';

const TEST_USER = {
  id: 'user-001',
  name: 'Alex Carter',
  email: 'alex.carter@festival.local',
  role: 'Admin',
};

describe('EventPlannerApp', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the dashboard with primary navigation and summary cards', () => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(TEST_USER));
    window.history.pushState({}, '', '/dashboard');
    render(<EventPlannerApp />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /events/i })).toBeInTheDocument();
    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Pending Tasks')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', () => {
    window.history.pushState({}, '', '/dashboard');
    render(<EventPlannerApp />);

    expect(screen.getByRole('heading', { name: 'Festival Planner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('submits a public rsvp without requiring login', async () => {
    const user = userEvent.setup();

    window.history.pushState({}, '', '/rsvp/event-001');
    render(<EventPlannerApp />);

    await user.type(screen.getByLabelText('Name'), 'Public Guest');
    await user.type(screen.getByLabelText('Email'), 'guest@example.com');
    await user.selectOptions(screen.getByLabelText('Status'), 'Going');
    await user.click(screen.getByRole('button', { name: 'Submit RSVP' }));

    expect(screen.getByText('Your RSVP has been saved.')).toBeInTheDocument();
    expect(window.localStorage.getItem('festival-event-planner.v1')).toContain('guest@example.com');
  });
});