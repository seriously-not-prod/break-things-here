import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventPlannerApp } from '../components/event-planner/event-planner-app';

describe('EventPlannerApp', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/dashboard');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the dashboard with primary navigation and summary cards', () => {
    render(<EventPlannerApp />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /events/i })).toBeInTheDocument();
    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Pending Tasks')).toBeInTheDocument();
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