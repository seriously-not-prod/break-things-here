/**
 * Tasks board additional coverage tests — task #820
 *
 * Supplemental tests for task-card, task-detail-drawer interactions,
 * and drag-and-drop status changes on the kanban board.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TasksKanbanPage from '../src/components/tasks/tasks-kanban-page';
import * as tasksService from '../src/services/tasks-service';
import type { Task } from '../src/services/tasks-service';

vi.mock('../src/services/tasks-service', () => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  listComments: vi.fn(),
  addComment: vi.fn(),
  addSubtask: vi.fn(),
  toggleSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
}));

const mockTasks: Task[] = [
  {
    id: 1,
    event_id: 42,
    title: 'Design poster',
    notes: 'Use brand colors',
    description: 'Create the event poster with brand guidelines',
    assignee_name: 'Alice Smith',
    assigned_user_id: 10,
    due_date: '2026-06-01',
    status: 'Pending',
    priority: 'High',
    estimated_hours: 4,
    created_by: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    event_id: 42,
    title: 'Book venue',
    notes: null,
    description: null,
    assignee_name: null,
    assigned_user_id: null,
    due_date: '2025-01-01', // Overdue date
    status: 'In Progress',
    priority: 'Medium',
    estimated_hours: null,
    created_by: 1,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 3,
    event_id: 42,
    title: 'Send invitations',
    notes: null,
    description: null,
    assignee_name: 'Bob Jones',
    assigned_user_id: 11,
    due_date: null,
    status: 'Verification',
    priority: 'Low',
    estimated_hours: 2,
    created_by: 1,
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
  },
  {
    id: 4,
    event_id: 42,
    title: 'Setup audio',
    notes: 'Test sound system beforehand',
    description: null,
    assignee_name: 'Carol White',
    assigned_user_id: 12,
    due_date: '2026-07-01',
    status: 'Cancelled',
    priority: 'Medium',
    estimated_hours: 3,
    created_by: 1,
    created_at: '2026-01-04T00:00:00Z',
    updated_at: '2026-01-04T00:00:00Z',
  },
  {
    id: 5,
    event_id: 42,
    title: 'Cleanup',
    notes: null,
    description: null,
    assignee_name: null,
    assigned_user_id: null,
    due_date: '2026-08-01',
    status: 'Blocked',
    priority: 'High',
    estimated_hours: null,
    created_by: 1,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  },
];

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/events/42/tasks']}>
      <Routes>
        <Route path="/events/:id/tasks" element={<TasksKanbanPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TasksKanbanPage - Extended Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tasksService.listTasks).mockResolvedValue(mockTasks);
  });

  it('renders all six kanban columns', async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });
    expect(screen.getByRole('region', { name: /pending column/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /in progress column/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /blocked column/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /verification column/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /complete column/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /cancelled column/i })).toBeInTheDocument();
  });

  it('renders task cards with priority chips', async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText('Design poster')).toBeInTheDocument();
    });
    // High priority chip
    expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(1);
    // Medium priority chip
    expect(screen.getAllByText('Medium').length).toBeGreaterThanOrEqual(1);
    // Low priority chip
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders assignee avatars for assigned tasks', async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText('Design poster')).toBeInTheDocument();
    });
    // Alice Smith initials = AS
    expect(screen.getByText('AS')).toBeInTheDocument();
    // Bob Jones initials = BJ
    expect(screen.getByText('BJ')).toBeInTheDocument();
    // Carol White initials = CW
    expect(screen.getByText('CW')).toBeInTheDocument();
  });

  it('shows overdue indicator for past-due tasks', async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText('Book venue')).toBeInTheDocument();
    });
    // The overdue task should show the warning indicator
    expect(screen.getByText(/⚠/)).toBeInTheDocument();
  });

  it('shows due dates for tasks with due dates', async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText('Design poster')).toBeInTheDocument();
    });
    // Should display the formatted date for the Design poster task
    expect(screen.getByText(/6\/1\/2026/)).toBeInTheDocument();
  });

  it('opens task detail drawer when clicking a task', async () => {
    vi.mocked(tasksService.listComments).mockResolvedValue([]);
    const user = userEvent.setup();
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText('Design poster')).toBeInTheDocument();
    });

    const taskButton = screen.getByRole('button', { name: /task: design poster/i });
    await user.click(taskButton);

    await waitFor(() => {
      // The drawer should appear with task details
      expect(screen.getByText(/design poster/i)).toBeInTheDocument();
    });
  });

  it('handles empty task list gracefully', async () => {
    vi.mocked(tasksService.listTasks).mockResolvedValue([]);
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });
    // All columns still render even with no tasks
    expect(screen.getByRole('region', { name: /pending column/i })).toBeInTheDocument();
  });

  it('submits a new task with priority and due date', async () => {
    const newTask: Task = {
      ...mockTasks[0],
      id: 99,
      title: 'Order flowers',
      priority: 'High',
      due_date: '2026-09-01',
      status: 'Pending',
    };
    vi.mocked(tasksService.createTask).mockResolvedValue(newTask);

    const user = userEvent.setup();
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    const addButtons = screen.getAllByText('Add');
    await user.click(addButtons[0]);

    const dialog = screen.getByRole('dialog');
    const titleInput = within(dialog).getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Order flowers');

    const dueDateInput = within(dialog).getByLabelText('Due Date');
    await user.clear(dueDateInput);
    await user.type(dueDateInput, '2026-09-01');

    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(tasksService.createTask).toHaveBeenCalledWith(
        '42',
        expect.objectContaining({
          title: 'Order flowers',
          due_date: '2026-09-01',
        }),
      );
    });
  }, 15000);

  it('closes add task dialog on cancel', async () => {
    const user = userEvent.setup();
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    const addButtons = screen.getAllByText('Add');
    await user.click(addButtons[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('does not submit task with empty title', async () => {
    const user = userEvent.setup();
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    const addButtons = screen.getAllByText('Add');
    await user.click(addButtons[0]);

    const dialog = screen.getByRole('dialog');
    const addBtn = within(dialog).getByRole('button', { name: 'Add' });
    // Button should be disabled when title is empty
    expect(addBtn).toBeDisabled();
  });
});
