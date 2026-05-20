import {
  AdminPanelSettingsRounded,
  CalendarMonthRounded,
  CampaignRounded,
  CheckCircleRounded,
  ChecklistRounded,
  CloseRounded,
  DashboardRounded,
  EventRounded,
  HowToRegRounded,
  KeyboardBackspaceRounded,
  LogoutRounded,
  MenuRounded,
  ScheduleRounded,
} from '@mui/icons-material';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import { AuthProvider, useAuth } from '../../contexts/auth-context';
import { seededUsers } from '../../data/event-planner-seed';
import { useEventPlannerStore } from '../../hooks/use-event-planner-store';
import { ProtectedRoute } from '../protected-route/protected-route';
import {
  EventDraft,
  PlannerActivity,
  PlannerEvent,
  PlannerRsvp,
  PlannerTask,
  PlannerUser,
  RsvpDraft,
  RsvpStatus,
  TaskDraft,
} from '../../types/event-planner';
import {
  formatDisplayDate,
  formatRelativeTimestamp,
  getDashboardStats,
  groupEventsByMonth,
  sortEventsByDate,
  validateEventDraft,
  validateRsvpDraft,
  validateTaskDraft,
  ValidationErrors,
} from '../../utils/event-planner';
import './event-planner.css';

interface NavigationItem {
  icon: typeof DashboardRounded;
  label: string;
  to: string;
}

interface PlannerOutletContext {
  activities: PlannerActivity[];
  events: PlannerEvent[];
  rsvps: PlannerRsvp[];
  tasks: PlannerTask[];
  users: PlannerUser[];
  loading: boolean;
  error: string | null;
  createEvent: (draft: EventDraft) => Promise<PlannerEvent>;
  updateEvent: (id: string, updates: Partial<EventDraft>) => Promise<void>;
  createTask: (draft: TaskDraft) => Promise<PlannerTask>;
  toggleTask: (taskId: string) => Promise<void>;
  submitRsvp: (draft: RsvpDraft) => Promise<PlannerRsvp>;
  updateRsvpStatus: (rsvpId: string, status: RsvpStatus) => Promise<void>;
  notify: (message: string) => void;
  refreshData: () => Promise<void>;
}

interface SummaryCardProps {
  accent: 'amber' | 'teal' | 'blue' | 'slate';
  icon: ReactNode;
  label: string;
  value: string | number;
}

interface PageHeaderProps {
  actions?: ReactNode;
  description: string;
  title: string;
}

interface SectionCardProps {
  children: ReactNode;
  title: string;
}

const navigationItems: NavigationItem[] = [
  { icon: DashboardRounded, label: 'Dashboard', to: '/dashboard' },
  { icon: EventRounded, label: 'Events', to: '/events' },
  { icon: CampaignRounded, label: 'Create Event', to: '/events/new' },
  { icon: ChecklistRounded, label: 'Tasks', to: '/tasks' },
  { icon: HowToRegRounded, label: 'RSVPs', to: '/rsvps' },
  { icon: CalendarMonthRounded, label: 'Calendar View', to: '/calendar' },
  { icon: AdminPanelSettingsRounded, label: 'Admin Settings', to: '/admin' },
];

function usePlannerContext(): PlannerOutletContext {
  return useOutletContext<PlannerOutletContext>();
}

function SummaryCard(props: SummaryCardProps): React.JSX.Element {
  return (
    <article className={`planner-summary-card planner-summary-card--${props.accent}`}>
      <span className="planner-summary-card__icon">{props.icon}</span>
      <span className="planner-summary-card__label">{props.label}</span>
      <strong className="planner-summary-card__value">{props.value}</strong>
    </article>
  );
}

function SectionCard(props: SectionCardProps): React.JSX.Element {
  return (
    <section className="planner-section-card">
      <header className="planner-section-card__header">
        <h2>{props.title}</h2>
      </header>
      {props.children}
    </section>
  );
}

function PageHeader(props: PageHeaderProps): React.JSX.Element {
  return (
    <header className="planner-page-header">
      <div>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
      {props.actions ? <div className="planner-page-header__actions">{props.actions}</div> : null}
    </header>
  );
}

function StatusBadge(props: { status: string }): React.JSX.Element {
  const tone = props.status.toLowerCase().replace(/\s+/g, '-');
  return <span className={`planner-status planner-status--${tone}`}>{props.status}</span>;
}

function PlannerLayout(props: {
  notify: (message: string) => void;
  users: PlannerUser[];
}): React.JSX.Element {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const title = useMemo((): string => {
    const matchingItem = navigationItems.find((item: NavigationItem) => {
      return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    });
    return matchingItem?.label ?? 'Festival Planner';
  }, [location.pathname]);

  const handleLogout = (): void => {
    logout();
    navigate('/');
  };

  return (
    <div className={`planner-shell${sidebarOpen ? ' planner-shell--sidebar-open' : ''}`}>
      <aside className="planner-sidebar">
        <div className="planner-sidebar__brand">
          <span className="planner-brand-mark">FE</span>
          <div>
            <strong>Festival Planner</strong>
            <span>Operations workspace</span>
          </div>
          <button
            className="planner-sidebar__close"
            onClick={(): void => setSidebarOpen(false)}
            type="button"
          >
            <CloseRounded />
          </button>
        </div>
        <nav className="planner-sidebar__nav" aria-label="Primary navigation">
          {navigationItems.map((item: NavigationItem) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }): string => {
                  return `planner-nav-link${isActive ? ' planner-nav-link--active' : ''}`;
                }}
              >
                <Icon fontSize="small" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="planner-sidebar__team">
          <h2>Sample Users</h2>
          <ul>
            {props.users.map((plannerUser: PlannerUser) => {
              return (
                <li key={plannerUser.id}>
                  <strong>{plannerUser.name}</strong>
                  <span>{plannerUser.role}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="planner-sidebar__user">
          <div className="planner-sidebar__user-info">
            <div className="planner-sidebar__user-avatar">{user?.name.charAt(0).toUpperCase()}</div>
            <div>
              <strong>{user?.name}</strong>
              <span>{user?.role}</span>
            </div>
          </div>
          <button
            className="planner-sidebar__logout"
            onClick={handleLogout}
            type="button"
            title="Logout"
          >
            <LogoutRounded fontSize="small" />
          </button>
        </div>
      </aside>
      <div className="planner-shell__overlay" onClick={(): void => setSidebarOpen(false)} />
      <main className="planner-main">
        <header className="planner-topbar">
          <div className="planner-topbar__left">
            <button
              className="planner-menu-button"
              onClick={(): void => setSidebarOpen(true)}
              type="button"
            >
              <MenuRounded />
            </button>
            <div>
              <span className="planner-topbar__eyebrow">Festival & Event Planner</span>
              <strong>{title}</strong>
            </div>
          </div>
          <div className="planner-topbar__right">
            <span>{formatDisplayDate(new Date().toISOString())}</span>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

function DashboardPage(): React.JSX.Element {
  const context = usePlannerContext();
  const navigate = useNavigate();
  const stats = getDashboardStats(context.events, context.tasks, context.rsvps);

  return (
    <div className="planner-page">
      <PageHeader
        title="Dashboard"
        description="A working summary of current event operations, task load, and recent RSVP activity."
        actions={
          <>
            <button
              className="planner-button planner-button--secondary"
              onClick={(): void => navigate('/events')}
              type="button"
            >
              View Events
            </button>
            <button
              className="planner-button"
              onClick={(): void => navigate('/events/new')}
              type="button"
            >
              Create Event
            </button>
          </>
        }
      />
      <div className="planner-summary-grid">
        <SummaryCard
          accent="amber"
          icon={<EventRounded />}
          label="Total Events"
          value={stats.totalEvents}
        />
        <SummaryCard
          accent="teal"
          icon={<ScheduleRounded />}
          label="Active Events"
          value={stats.activeEvents}
        />
        <SummaryCard
          accent="blue"
          icon={<HowToRegRounded />}
          label="Recent RSVPs"
          value={stats.recentRsvps.length}
        />
        <SummaryCard
          accent="slate"
          icon={<ChecklistRounded />}
          label="Pending Tasks"
          value={stats.pendingTasks}
        />
      </div>
      <div className="planner-two-column-grid">
        <SectionCard title="Upcoming Events">
          <ul className="planner-list">
            {stats.upcomingEvents.map((event: PlannerEvent) => {
              return (
                <li key={event.id} className="planner-list__item">
                  <div>
                    <Link to={`/events/${event.id}`}>{event.title}</Link>
                    <p>
                      {formatDisplayDate(event.date)} · {event.location}
                    </p>
                  </div>
                  <StatusBadge status={event.status} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
        <SectionCard title="Recent RSVP Activity">
          <ul className="planner-list">
            {stats.recentRsvps.map((rsvp: PlannerRsvp) => {
              const event = context.events.find((item: PlannerEvent) => item.id === rsvp.eventId);
              return (
                <li key={rsvp.id} className="planner-list__item planner-list__item--compact">
                  <div>
                    <strong>{rsvp.name}</strong>
                    <p>
                      {event?.title ?? 'Unknown event'} · {formatRelativeTimestamp(rsvp.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={rsvp.status} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function EventsPage(): React.JSX.Element {
  const context = usePlannerContext();

  return (
    <div className="planner-page">
      <PageHeader
        title="Events"
        description="Browse active, draft, and completed events with direct access to detail and edit screens."
        actions={
          <Link className="planner-button" to="/events/new">
            Create Event
          </Link>
        }
      />
      <div className="planner-card-grid">
        {sortEventsByDate(context.events).map((event: PlannerEvent) => {
          return (
            <article key={event.id} className="planner-event-card">
              <header>
                <StatusBadge status={event.status} />
                <h2>{event.title}</h2>
              </header>
              <p>{event.description}</p>
              <dl>
                <div>
                  <dt>Date</dt>
                  <dd>{formatDisplayDate(event.date)}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{event.location}</dd>
                </div>
              </dl>
              <footer>
                <Link
                  className="planner-button planner-button--secondary"
                  to={`/events/${event.id}`}
                >
                  View Details
                </Link>
                <Link
                  className="planner-button planner-button--ghost"
                  to={`/events/${event.id}/edit`}
                >
                  Edit
                </Link>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function EventEditorPage(): React.JSX.Element {
  const context = usePlannerContext();
  const navigate = useNavigate();
  const params = useParams();
  const existingEvent = context.events.find((event: PlannerEvent) => event.id === params.eventId);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [draft, setDraft] = useState<EventDraft>(() => {
    return existingEvent
      ? {
          title: existingEvent.title,
          date: existingEvent.date,
          location: existingEvent.location,
          description: existingEvent.description,
          status: existingEvent.status,
        }
      : {
          title: '',
          date: '',
          location: '',
          description: '',
          status: 'Draft',
        };
  });

  function updateField<K extends keyof EventDraft>(key: K, value: EventDraft[K]): void {
    setDraft((current: EventDraft) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validationErrors = validateEventDraft(draft);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      if (existingEvent) {
        await context.updateEvent(existingEvent.id, draft);
        context.notify('Event updated successfully.');
        navigate(`/events/${existingEvent.id}`);
        return;
      }

      const createdEvent = await context.createEvent(draft);
      context.notify('Event created successfully.');
      navigate(`/events/${createdEvent.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Operation failed';
      context.notify(`Error: ${message}`);
      console.error('Error saving event:', error);
    }
  }

  return (
    <div className="planner-page">
      <PageHeader
        title={existingEvent ? 'Edit Event' : 'Create Event'}
        description="Use the shared event form with validation for title, date, location, description, and status."
      />
      <form className="planner-form-card" onSubmit={handleSubmit} noValidate>
        <label>
          <span>Title</span>
          <input
            value={draft.title}
            onChange={(event): void => updateField('title', event.target.value)}
          />
          {errors.title ? <small>{errors.title}</small> : null}
        </label>
        <div className="planner-form-grid">
          <label>
            <span>Date</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event): void => updateField('date', event.target.value)}
            />
            {errors.date ? <small>{errors.date}</small> : null}
          </label>
          <label>
            <span>Status</span>
            <select
              value={draft.status}
              onChange={(event): void =>
                updateField('status', event.target.value as EventDraft['status'])
              }
            >
              <option value="Draft">Draft</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
            </select>
          </label>
        </div>
        <label>
          <span>Location</span>
          <input
            value={draft.location}
            onChange={(event): void => updateField('location', event.target.value)}
          />
          {errors.location ? <small>{errors.location}</small> : null}
        </label>
        <label>
          <span>Description</span>
          <textarea
            value={draft.description}
            onChange={(event): void => updateField('description', event.target.value)}
            rows={6}
          />
          {errors.description ? <small>{errors.description}</small> : null}
        </label>
        <div className="planner-form-actions">
          <button
            className="planner-button planner-button--secondary"
            onClick={(): void => navigate(-1)}
            type="button"
          >
            Cancel
          </button>
          <button className="planner-button" type="submit">
            {existingEvent ? 'Save Changes' : 'Create Event'}
          </button>
        </div>
      </form>
    </div>
  );
}

function EventDetailsPage(): React.JSX.Element {
  const context = usePlannerContext();
  const params = useParams();
  const navigate = useNavigate();
  const event = context.events.find((item: PlannerEvent) => item.id === params.eventId);
  const eventTasks = context.tasks.filter((task: PlannerTask) => task.eventId === params.eventId);
  const eventRsvps = context.rsvps.filter((rsvp: PlannerRsvp) => rsvp.eventId === params.eventId);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({
    eventId: params.eventId ?? '',
    title: '',
    description: '',
    assignee: '',
    dueDate: '',
  });
  const [taskErrors, setTaskErrors] = useState<ValidationErrors>({});

  if (!event) {
    return <Navigate replace to="/events" />;
  }

  async function handleTaskSubmit(eventForm: React.FormEvent<HTMLFormElement>): Promise<void> {
    eventForm.preventDefault();
    const validationErrors = validateTaskDraft(taskDraft);
    setTaskErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      await context.createTask(taskDraft);
      context.notify('Task created for this event.');
      setTaskDraft({
        eventId: params.eventId ?? '',
        title: '',
        description: '',
        assignee: '',
        dueDate: '',
      });
    } catch (error) {
      context.notify('Error creating task');
      console.error('Error creating task:', error);
    }
  }

  return (
    <div className="planner-page">
      <PageHeader
        title={event.title}
        description={`${formatDisplayDate(event.date)} · ${event.location}`}
        actions={
          <>
            <Link className="planner-button planner-button--secondary" to={`/rsvp/${event.id}`}>
              Public RSVP Form
            </Link>
            <button
              className="planner-button"
              onClick={(): void => navigate(`/events/${event.id}/edit`)}
              type="button"
            >
              Edit Event
            </button>
          </>
        }
      />
      <div className="planner-two-column-grid">
        <SectionCard title="Event Summary">
          <div className="planner-detail-block">
            <StatusBadge status={event.status} />
            <p>{event.description}</p>
            <div className="planner-meta-grid">
              <span>
                <ScheduleRounded fontSize="small" /> {formatDisplayDate(event.date)}
              </span>
              <span>
                <EventRounded fontSize="small" /> {event.location}
              </span>
              <span>
                <ChecklistRounded fontSize="small" /> {eventTasks.length} total tasks
              </span>
              <span>
                <HowToRegRounded fontSize="small" /> {eventRsvps.length} RSVPs
              </span>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Recent RSVP List">
          <ul className="planner-list">
            {eventRsvps.map((rsvp: PlannerRsvp) => {
              return (
                <li key={rsvp.id} className="planner-list__item planner-list__item--compact">
                  <div>
                    <strong>{rsvp.name}</strong>
                    <p>{rsvp.email}</p>
                  </div>
                  <StatusBadge status={rsvp.status} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
      <div className="planner-two-column-grid">
        <SectionCard title="Add Task For This Event">
          <form className="planner-inline-form" onSubmit={handleTaskSubmit} noValidate>
            <label>
              <span>Task Title</span>
              <input
                value={taskDraft.title}
                onChange={(eventForm): void =>
                  setTaskDraft({ ...taskDraft, title: eventForm.target.value })
                }
              />
              {taskErrors.title ? <small>{taskErrors.title}</small> : null}
            </label>
            <div className="planner-form-grid">
              <label>
                <span>Assignee</span>
                <input
                  value={taskDraft.assignee}
                  onChange={(eventForm): void =>
                    setTaskDraft({ ...taskDraft, assignee: eventForm.target.value })
                  }
                />
                {taskErrors.assignee ? <small>{taskErrors.assignee}</small> : null}
              </label>
              <label>
                <span>Due Date</span>
                <input
                  type="date"
                  value={taskDraft.dueDate}
                  onChange={(eventForm): void =>
                    setTaskDraft({ ...taskDraft, dueDate: eventForm.target.value })
                  }
                />
                {taskErrors.dueDate ? <small>{taskErrors.dueDate}</small> : null}
              </label>
            </div>
            <label>
              <span>Description</span>
              <textarea
                rows={3}
                value={taskDraft.description}
                onChange={(eventForm): void =>
                  setTaskDraft({ ...taskDraft, description: eventForm.target.value })
                }
              />
            </label>
            <div className="planner-form-actions">
              <button className="planner-button" type="submit">
                Add Task
              </button>
            </div>
          </form>
        </SectionCard>
        <SectionCard title="Task List">
          <ul className="planner-list">
            {eventTasks.map((task: PlannerTask) => {
              return (
                <li key={task.id} className="planner-list__item">
                  <div>
                    <strong>{task.title}</strong>
                    <p>
                      {task.assignee} · due{' '}
                      {task.dueDate ? formatDisplayDate(task.dueDate) : 'No due date'}
                    </p>
                  </div>
                  <button
                    className="planner-button planner-button--ghost"
                    onClick={(): void => void context.toggleTask(task.id)}
                    type="button"
                  >
                    {task.status === 'Complete' ? 'Reopen' : 'Complete'}
                  </button>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function TasksPage(): React.JSX.Element {
  const context = usePlannerContext();
  const [draft, setDraft] = useState<TaskDraft>({
    eventId: context.events[0]?.id ?? '',
    title: '',
    description: '',
    assignee: '',
    dueDate: '',
  });
  const [errors, setErrors] = useState<ValidationErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validationErrors = validateTaskDraft(draft);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      await context.createTask(draft);
      context.notify('Task created successfully.');
      setDraft({ eventId: draft.eventId, title: '', description: '', assignee: '', dueDate: '' });
    } catch (error) {
      context.notify('Error creating task');
      console.error('Error creating task:', error);
    }
  }

  return (
    <div className="planner-page">
      <PageHeader
        title="Tasks"
        description="Track basic event activity with assignable tasks and completion toggles."
      />
      <div className="planner-two-column-grid">
        <SectionCard title="Create Task">
          <form className="planner-inline-form" onSubmit={handleSubmit} noValidate>
            <label>
              <span>Event</span>
              <select
                value={draft.eventId}
                onChange={(event): void => setDraft({ ...draft, eventId: event.target.value })}
              >
                {context.events.map((item: PlannerEvent) => {
                  return (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <span>Task Title</span>
              <input
                value={draft.title}
                onChange={(event): void => setDraft({ ...draft, title: event.target.value })}
              />
              {errors.title ? <small>{errors.title}</small> : null}
            </label>
            <div className="planner-form-grid">
              <label>
                <span>Assignee</span>
                <input
                  value={draft.assignee}
                  onChange={(event): void => setDraft({ ...draft, assignee: event.target.value })}
                />
                {errors.assignee ? <small>{errors.assignee}</small> : null}
              </label>
              <label>
                <span>Due Date</span>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(event): void => setDraft({ ...draft, dueDate: event.target.value })}
                />
                {errors.dueDate ? <small>{errors.dueDate}</small> : null}
              </label>
            </div>
            <label>
              <span>Description</span>
              <textarea
                rows={4}
                value={draft.description}
                onChange={(event): void => setDraft({ ...draft, description: event.target.value })}
              />
            </label>
            <div className="planner-form-actions">
              <button className="planner-button" type="submit">
                Add Task
              </button>
            </div>
          </form>
        </SectionCard>
        <SectionCard title="All Tasks">
          <ul className="planner-list">
            {context.tasks.map((task: PlannerTask) => {
              const event = context.events.find((item: PlannerEvent) => item.id === task.eventId);
              return (
                <li key={task.id} className="planner-list__item">
                  <div>
                    <strong>{task.title}</strong>
                    <p>
                      {event?.title ?? 'Unknown event'} · {task.assignee} · due{' '}
                      {task.dueDate ? formatDisplayDate(task.dueDate) : 'No due date'}
                    </p>
                  </div>
                  <button
                    className="planner-button planner-button--ghost"
                    onClick={(): void => void context.toggleTask(task.id)}
                    type="button"
                  >
                    {task.status === 'Complete' ? 'Completed' : 'Mark Complete'}
                  </button>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function RsvpsPage(): React.JSX.Element {
  const context = usePlannerContext();
  const [draft, setDraft] = useState<RsvpDraft>({
    eventId: context.events[0]?.id ?? '',
    name: '',
    email: '',
    guests: 1,
    status: 'Pending',
  });
  const [errors, setErrors] = useState<ValidationErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validationErrors = validateRsvpDraft(draft);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      await context.submitRsvp(draft);
      context.notify('RSVP saved successfully.');
      setDraft({ eventId: draft.eventId, name: '', email: '', guests: 1, status: 'Pending' });
    } catch (error) {
      context.notify('Error saving RSVP');
      console.error('Error saving RSVP:', error);
    }
  }

  return (
    <div className="planner-page">
      <PageHeader
        title="RSVPs"
        description="Manage guest RSVP records and share public forms for each event."
      />
      <div className="planner-two-column-grid">
        <SectionCard title="Manual RSVP Entry">
          <form className="planner-inline-form" onSubmit={handleSubmit} noValidate>
            <label>
              <span>Event</span>
              <select
                value={draft.eventId}
                onChange={(event): void => setDraft({ ...draft, eventId: event.target.value })}
              >
                {context.events.map((item: PlannerEvent) => {
                  return (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  );
                })}
              </select>
              {errors.eventId ? <small>{errors.eventId}</small> : null}
            </label>
            <div className="planner-form-grid">
              <label>
                <span>Name</span>
                <input
                  value={draft.name}
                  onChange={(event): void => setDraft({ ...draft, name: event.target.value })}
                />
                {errors.name ? <small>{errors.name}</small> : null}
              </label>
              <label>
                <span>Email</span>
                <input
                  value={draft.email}
                  onChange={(event): void => setDraft({ ...draft, email: event.target.value })}
                />
                {errors.email ? <small>{errors.email}</small> : null}
              </label>
            </div>
            <div className="planner-form-grid">
              <label>
                <span>Guests</span>
                <input
                  type="number"
                  min="1"
                  value={draft.guests}
                  onChange={(event): void =>
                    setDraft({ ...draft, guests: parseInt(event.target.value) || 1 })
                  }
                />
              </label>
              <label>
                <span>Status</span>
                <select
                  value={draft.status}
                  onChange={(event): void =>
                    setDraft({ ...draft, status: event.target.value as RsvpStatus })
                  }
                >
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Declined">Declined</option>
                </select>
              </label>
            </div>
            <div className="planner-form-actions">
              <button className="planner-button" type="submit">
                Save RSVP
              </button>
            </div>
          </form>
        </SectionCard>
        <SectionCard title="RSVP List">
          <div className="planner-table-wrapper">
            <table className="planner-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Event</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {context.rsvps.map((rsvp: PlannerRsvp) => {
                  const event = context.events.find(
                    (item: PlannerEvent) => item.id === rsvp.eventId,
                  );
                  return (
                    <tr key={rsvp.id}>
                      <td>
                        <strong>{rsvp.name}</strong>
                        <span>{rsvp.email}</span>
                      </td>
                      <td>{event?.title ?? 'Unknown event'}</td>
                      <td>
                        <select
                          className="planner-status-select"
                          value={rsvp.status}
                          onChange={(event): void =>
                            void context.updateRsvpStatus(rsvp.id, event.target.value as RsvpStatus)
                          }
                        >
                          <option value="Pending">Pending</option>
                          <option value="Confirmed">Confirmed</option>
                          <option value="Declined">Declined</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function CalendarPage(): React.JSX.Element {
  const context = usePlannerContext();
  const groupedEvents = groupEventsByMonth(context.events);

  return (
    <div className="planner-page">
      <PageHeader
        title="Calendar View"
        description="A simple calendar-style grouping of events by month."
      />
      <div className="planner-calendar-stack">
        {groupedEvents.map((group) => {
          return (
            <SectionCard key={group.month} title={group.month}>
              <ul className="planner-list">
                {group.events.map((event: PlannerEvent) => {
                  return (
                    <li key={event.id} className="planner-list__item">
                      <div>
                        <Link to={`/events/${event.id}`}>{event.title}</Link>
                        <p>
                          {formatDisplayDate(event.date)} · {event.location}
                        </p>
                      </div>
                      <StatusBadge status={event.status} />
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}

function AdminPage(): React.JSX.Element {
  const context = usePlannerContext();

  return (
    <div className="planner-page">
      <PageHeader
        title="Admin Settings"
        description="A minimal system-control view with overview metrics, sample users, all events, and recent activity logs."
      />
      <div className="planner-summary-grid">
        <SummaryCard
          accent="amber"
          icon={<AdminPanelSettingsRounded />}
          label="System Users"
          value={context.users.length}
        />
        <SummaryCard
          accent="teal"
          icon={<EventRounded />}
          label="All Events"
          value={context.events.length}
        />
        <SummaryCard
          accent="blue"
          icon={<HowToRegRounded />}
          label="All RSVPs"
          value={context.rsvps.length}
        />
        <SummaryCard
          accent="slate"
          icon={<ChecklistRounded />}
          label="Open Tasks"
          value={context.tasks.filter((task: PlannerTask) => task.status === 'Pending').length}
        />
      </div>
      <div className="planner-two-column-grid">
        <SectionCard title="Sample Users">
          <ul className="planner-list">
            {context.users.map((user: PlannerUser) => {
              return (
                <li key={user.id} className="planner-list__item planner-list__item--compact">
                  <div>
                    <strong>{user.name}</strong>
                    <p>{user.email}</p>
                  </div>
                  <StatusBadge status={user.role} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
        <SectionCard title="Recent Activity">
          <ul className="planner-list">
            {context.activities.slice(0, 6).map((activity: PlannerActivity) => {
              return (
                <li key={activity.id} className="planner-list__item planner-list__item--compact">
                  <div>
                    <strong>{activity.message}</strong>
                    <p>{formatRelativeTimestamp(activity.createdAt)}</p>
                  </div>
                  <StatusBadge status={activity.kind} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
      <SectionCard title="All Events">
        <div className="planner-table-wrapper">
          <table className="planner-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Date</th>
                <th>Status</th>
                <th>Tasks</th>
              </tr>
            </thead>
            <tbody>
              {context.events.map((event: PlannerEvent) => {
                const taskCount = context.tasks.filter(
                  (task: PlannerTask) => task.eventId === event.id,
                ).length;
                return (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      <span>{event.location}</span>
                    </td>
                    <td>{formatDisplayDate(event.date)}</td>
                    <td>
                      <StatusBadge status={event.status} />
                    </td>
                    <td>{taskCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function PublicRsvpPage(): React.JSX.Element {
  const context = usePlannerContext();
  const navigate = useNavigate();
  const params = useParams();
  const event = context.events.find((item: PlannerEvent) => item.id === params.eventId);
  const [draft, setDraft] = useState<RsvpDraft>({
    eventId: params.eventId ?? '',
    name: '',
    email: '',
    guests: 1,
    status: 'Pending',
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitted, setSubmitted] = useState<boolean>(false);

  // Show loading while data is being fetched
  if (context.loading) {
    return <div>Loading...</div>;
  }

  // After loading, if event not found, redirect
  if (!event) {
    return <Navigate replace to="/dashboard" />;
  }

  async function handleSubmit(eventForm: React.FormEvent<HTMLFormElement>): Promise<void> {
    eventForm.preventDefault();
    const validationErrors = validateRsvpDraft(draft);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      await context.submitRsvp(draft);
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting RSVP:', error);
    }
  }

  return (
    <div className="planner-public-page">
      <div className="planner-public-page__panel">
        <button
          className="planner-link-button"
          onClick={(): void => navigate('/rsvps')}
          type="button"
        >
          <KeyboardBackspaceRounded fontSize="small" /> Back to planner
        </button>
        <StatusBadge status={event.status} />
        <h1>{event.title}</h1>
        <p>{event.description}</p>
        <ul className="planner-public-meta">
          <li>{formatDisplayDate(event.date)}</li>
          <li>{event.location}</li>
        </ul>
      </div>
      <div className="planner-public-page__form-card">
        <h2>RSVP</h2>
        <p>
          No login is required. Submit or update a response with your name, email, and attendance
          status.
        </p>
        {submitted ? (
          <div className="planner-success-box">
            <CheckCircleRounded />
            <div>
              <strong>Your RSVP has been saved.</strong>
              <p>You can submit the same email again later to update your response.</p>
            </div>
          </div>
        ) : (
          <form className="planner-inline-form" onSubmit={handleSubmit} noValidate>
            <label>
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(eventForm): void => setDraft({ ...draft, name: eventForm.target.value })}
              />
              {errors.name ? <small>{errors.name}</small> : null}
            </label>
            <label>
              <span>Email</span>
              <input
                value={draft.email}
                onChange={(eventForm): void =>
                  setDraft({ ...draft, email: eventForm.target.value })
                }
              />
              {errors.email ? <small>{errors.email}</small> : null}
            </label>
            <div className="planner-form-grid">
              <label>
                <span>Guests</span>
                <input
                  type="number"
                  min="1"
                  value={draft.guests}
                  onChange={(eventForm): void =>
                    setDraft({ ...draft, guests: parseInt(eventForm.target.value) || 1 })
                  }
                />
              </label>
              <label>
                <span>Status</span>
                <select
                  value={draft.status}
                  onChange={(eventForm): void =>
                    setDraft({ ...draft, status: eventForm.target.value as RsvpStatus })
                  }
                >
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Declined">Declined</option>
                </select>
              </label>
            </div>
            <div className="planner-form-actions">
              <button className="planner-button" type="submit">
                Submit RSVP
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Toast(props: { message: string | null }): React.JSX.Element | null {
  if (!props.message) {
    return null;
  }

  return <div className="planner-toast">{props.message}</div>;
}

function PlannerRoutes(props: { notify: (message: string) => void }): React.JSX.Element {
  const store = useEventPlannerStore();
  const outletContext: PlannerOutletContext = {
    ...store,
    users: seededUsers,
    notify: props.notify,
  };

  return (
    <Routes>
      <Route element={<Outlet context={outletContext} />}>
        <Route path="/rsvp/:eventId" element={<PublicRsvpPage />} />
      </Route>
      <Route
        element={
          <ProtectedRoute>
            <PlannerLayout notify={props.notify} users={seededUsers} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate replace to="/dashboard" />} />
        <Route element={<Outlet context={outletContext} />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/new" element={<EventEditorPage />} />
          <Route path="/events/:eventId" element={<EventDetailsPage />} />
          <Route path="/events/:eventId/edit" element={<EventEditorPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/rsvps" element={<RsvpsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

export function EventPlannerApp(): React.JSX.Element {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  return (
    <AuthProvider>
      <BrowserRouter>
        <PlannerRoutes notify={(message: string): void => setToastMessage(message)} />
        <Toast message={toastMessage} />
      </BrowserRouter>
    </AuthProvider>
  );
}
