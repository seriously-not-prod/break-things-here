import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../contexts/auth-context', async () => {
  const actual = await vi.importActual<typeof import('../contexts/auth-context')>(
    '../contexts/auth-context',
  );

  return { ...actual, useAuth: vi.fn() };
});

vi.mock('../services/dashboard-service', () => ({
  fetchDashboardData: vi.fn(),
}));

vi.mock('../components/dashboard/budget-overview-panel', () => ({
  BudgetOverviewPanel: () => <div>Budget panel content</div>,
}));

vi.mock('../components/analytics/global-analytics-widget', () => ({
  GlobalAnalyticsWidget: () => <div>Analytics widget content</div>,
}));

import Dashboard from '../components/dashboard/Dashboard';
import * as authContext from '../contexts/auth-context';
import * as dashboardService from '../services/dashboard-service';

describe('Dashboard loading state', () => {
  beforeEach(() => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: {
        id: 1,
        email: 'organizer@test.com',
        displayName: 'Alex Organizer',
        roleId: 2,
        roleName: 'Organizer',
      },
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      loadCurrentUser: vi.fn(),
      sessionTimedOut: false,
      clearSessionTimeout: vi.fn(),
      authSource: 'backend',
    });
  });

  it('renders loading skeletons and the accessible loading list while data is pending', () => {
    vi.mocked(dashboardService.fetchDashboardData).mockReturnValue(new Promise(() => undefined));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(screen.getByText(/welcome back, alex/i)).toBeTruthy();
    expect(screen.getByRole('list', { name: /loading upcoming events/i })).toBeTruthy();
    expect(document.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
  });
});
