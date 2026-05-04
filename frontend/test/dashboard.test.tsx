/**
 * Dashboard component tests — issues #372 #373 #374 #375
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Must mock before importing the component that uses them
vi.mock('../src/contexts/auth-context', async () => {
  const actual = await vi.importActual<typeof import('../src/contexts/auth-context')>(
    '../src/contexts/auth-context',
  );
  return { ...actual, useAuth: vi.fn() };
});

vi.mock('../src/services/dashboard-service', () => ({
  fetchDashboardData: vi.fn(),
}));

import Dashboard from '../src/components/dashboard/Dashboard';
import * as authContext from '../src/contexts/auth-context';
import * as dashboardService from '../src/services/dashboard-service';
import type { DashboardData } from '../src/services/dashboard-service';

const mockUser = {
  id: 1,
  email: 'organizer@test.com',
  displayName: 'Alex Organizer',
  roleId: 2,
  roleName: 'Organizer',
};

const mockData: DashboardData = {
  events: [
    {
      id: 1,
      title: 'Summer Music Festival',
      location: 'Riverside Park',
      event_date: '2026-08-10',
      capacity: 1000,
      status: 'Active',
      created_by_name: 'Alex Organizer',
    },
    {
      id: 2,
      title: 'Winter Gala',
      location: 'Grand Ballroom',
      event_date: '2026-12-20',
      capacity: 200,
      status: 'Draft',
      created_by_name: 'Alex Organizer',
    },
  ],
  tasks: [
    {
      id: 1,
      event_id: 1,
      title: 'Book sound crew',
      notes: null,
      assignee_name: null,
      due_date: '2026-07-01',
      status: 'Complete',
      priority: 'High',
    },
    {
      id: 2,
      event_id: 1,
      title: 'Design stage layout',
      notes: null,
      assignee_name: null,
      due_date: '2026-07-15',
      status: 'In Progress',
      priority: 'Medium',
    },
    {
      id: 3,
      event_id: 1,
      title: 'Arrange catering',
      notes: null,
      assignee_name: null,
      due_date: null,
      status: 'Pending',
      priority: 'Medium',
    },
  ],
  rsvps: [
    { id: 1, event_id: 1, name: 'Alice', email: 'alice@test.com', guests: 2, status: 'Going' },
    { id: 2, event_id: 1, name: 'Bob', email: 'bob@test.com', guests: 1, status: 'Pending' },
    { id: 3, event_id: 1, name: 'Carol', email: 'carol@test.com', guests: 3, status: 'Declined' },
  ],
};

function renderDashboard(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: mockUser,
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
  });

  describe('loading state', () => {
    it('renders skeleton placeholders while fetching data', () => {
      // fetchDashboardData returns a promise that never resolves — simulates loading
      vi.mocked(dashboardService.fetchDashboardData).mockReturnValue(new Promise(() => undefined));

      renderDashboard();

      const skeletons = document.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows the welcome greeting immediately (before data loads)', () => {
      vi.mocked(dashboardService.fetchDashboardData).mockReturnValue(new Promise(() => undefined));

      renderDashboard();

      expect(screen.getByText(/Welcome back, Alex/i)).toBeInTheDocument();
    });
  });

  describe('populated state', () => {
    it('renders event titles after data loads', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockResolvedValue(mockData);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
      });
    });

    it('renders KPI card panel section headings', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockResolvedValue(mockData);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Active Events')).toBeInTheDocument();
        expect(screen.getByText('Total Guests')).toBeInTheDocument();
        expect(screen.getByText('Tasks Completed')).toBeInTheDocument();
        expect(screen.getByText('Total Budget')).toBeInTheDocument();
      });
    });

    it('displays panel headings for all sections', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockResolvedValue(mockData);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
        expect(screen.getByText('RSVP Breakdown')).toBeInTheDocument();
        expect(screen.getByText('Task Summary')).toBeInTheDocument();
        expect(screen.getByText('Budget Overview')).toBeInTheDocument();
        expect(screen.getByText('Quick Access')).toBeInTheDocument();
      });
    });

    it('shows the budget placeholder message', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockResolvedValue(mockData);

      renderDashboard();

      await waitFor(() => {
        expect(
          screen.getByText(/Budget tracking module is coming soon/i),
        ).toBeInTheDocument();
      });
    });

    it('shows coming soon chips in quick access', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockResolvedValue(mockData);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Gallery')).toBeInTheDocument();
        expect(screen.getByText('Check-in')).toBeInTheDocument();
        expect(screen.getByText('Seating')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('shows empty message when no events are returned', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockResolvedValue({
        events: [],
        tasks: [],
        rsvps: [],
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('No events scheduled yet.')).toBeInTheDocument();
      });
    });

    it('shows empty message when no tasks are returned', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockResolvedValue({
        events: mockData.events,
        tasks: [],
        rsvps: mockData.rsvps,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('No tasks yet.')).toBeInTheDocument();
      });
    });

    it('shows empty message when no RSVPs are returned', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockResolvedValue({
        events: mockData.events,
        tasks: mockData.tasks,
        rsvps: [],
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('No RSVPs received yet.')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows an alert when the API call fails', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockRejectedValue(
        new Error('Network error'),
      );

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows a generic message for non-Error rejections', async () => {
      vi.mocked(dashboardService.fetchDashboardData).mockRejectedValue('server down');

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(
          screen.getByText('Failed to load dashboard data.'),
        ).toBeInTheDocument();
      });
    });
  });
});
