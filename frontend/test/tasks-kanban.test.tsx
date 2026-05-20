import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TasksKanbanPage from '../src/components/tasks/tasks-kanban-page';
import * as tasksService from '../src/services/tasks-service';
import type { Task } from '../src/services/tasks-service';

// Mock the tasks service
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
    title: 'Set up stage',
    notes: null,
    description: null,
    assignee_name: 'Alice Smith',
    assigned_user_id: 10,
    due_date: '2026-06-01',
    status: 'Pending',
    priority: 'High',
    estimated_hours: 2,
    created_by: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    event_id: 42,
    title: 'Order catering',
    notes: null,
    description: null,
    assignee_name: 'Bob Jones',
    assigned_user_id: 11,
    due_date: '2026-06-02',
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
    title: 'Book security',
    notes: null,
    description: null,
    assignee_name: null,
    assigned_user_id: null,
    due_date: null,
    status: 'Blocked',
    priority: 'Low',
    estimated_hours: null,
    created_by: 1,
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
  },
  {
    id: 4,
    event_id: 42,
    title: 'Print flyers',
    notes: null,
    description: null,
    assignee_name: 'Carol White',
    assigned_user_id: 12,
    due_date: '2026-05-01',
    status: 'Complete',
    priority: 'Low',
    estimated_hours: 1,
    created_by: 1,
    created_at: '2026-01-04T00:00:00Z',
    updated_at: '2026-01-04T00:00:00Z',
  },
];

function renderBoard(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/events/42/tasks']}>
      <Routes>
        <Route path="/events/:id/tasks" element={<TasksKanbanPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TasksKanbanPage', () => {
  beforeEach(() => {
    vi.mocked(tasksService.listTasks).mockResolvedValue(mockTasks);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all four kanban columns', async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /pending column/i })).toBeTruthy();
    });
    expect(screen.getByRole('region', { name: /in progress column/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /blocked column/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /complete column/i })).toBeTruthy();
  }, 15000);

  it('shows correct task counts per column', async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    // Each column Paper has role="region" aria-label "X column (Y tasks)"
    expect(screen.getByRole('region', { name: /pending column \(1 tasks?\)/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /in progress column \(1 tasks?\)/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /blocked column \(1 tasks?\)/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /complete column \(1 tasks?\)/i })).toBeTruthy();
  });

  it('renders task titles inside the board', async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText('Set up stage')).toBeTruthy();
      expect(screen.getByText('Order catering')).toBeTruthy();
      expect(screen.getByText('Book security')).toBeTruthy();
      expect(screen.getByText('Print flyers')).toBeTruthy();
    });
  });

  it('shows an Add button in each column', async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    const addButtons = screen.getAllByText('Add');
    expect(addButtons.length).toBeGreaterThanOrEqual(4);
  });

  it('opens the add task dialog when clicking Add in a column', async () => {
    const user = userEvent.setup();
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    const addButtons = screen.getAllByText('Add');
    await user.click(addButtons[0]);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Add Task')).toBeTruthy();
  });

  it('calls createTask when the add task form is submitted', async () => {
    const newTask: Task = {
      ...mockTasks[0],
      id: 99,
      title: 'New Task',
      status: 'Pending',
      priority: 'Urgent',
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
    await user.type(titleInput, 'New Task');

    await user.click(within(dialog).getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: /urgent/i }));

    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(tasksService.createTask).toHaveBeenCalledWith(
        '42',
        expect.objectContaining({ title: 'New Task', status: 'Pending', priority: 'Urgent' }),
      );
    });
  }, 15000);

  it('offers Urgent in the priority picker', async () => {
    const user = userEvent.setup();
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    const addButtons = screen.getAllByText('Add');
    await user.click(addButtons[0]);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getAllByRole('combobox')[0]);

    expect(await screen.findByRole('option', { name: /urgent/i })).toBeTruthy();
  });

  it('shows loading spinner initially', () => {
    vi.mocked(tasksService.listTasks).mockReturnValue(new Promise(() => undefined));
    renderBoard();
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(tasksService.listTasks).mockRejectedValue(new Error('Network error'));
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText(/failed to load tasks/i)).toBeTruthy();
    });
  });
});
