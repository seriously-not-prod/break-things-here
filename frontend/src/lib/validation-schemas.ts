import { z } from 'zod';

// ── Auth schemas ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export const registerSchema = z
  .object({
    displayName: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must include an uppercase letter')
      .regex(/[0-9]/, 'Must include a number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ── Event schemas ────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  'Birthday',
  'Wedding',
  'Corporate',
  'Concert',
  'Conference',
  'Festival',
  'Sports',
  'Charity',
  'Music',
  'Food',
  'Other',
] as const;

const EVENT_STATUSES = [
  'Draft',
  'Planning',
  'Confirmed',
  'Active',
  'Completed',
  'Cancelled',
] as const;

export const createEventSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(200),
  date: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional(),
  location: z.string().min(2, 'Location is required').max(300),
  description: z.string().max(5000).optional(),
  eventType: z.enum(EVENT_TYPES),
  status: z.enum(EVENT_STATUSES).default('Draft'),
  isPublic: z.boolean().default(false),
  capacity: z.number().int().positive().optional(),
  rsvpDeadline: z.string().optional(),
  tags: z.string().optional(),
  currencyCode: z.string().length(3).default('USD'),
});

export const updateEventSchema = createEventSchema.partial();

// ── Guest / RSVP schemas ────────────────────────────────────────────────────

const RSVP_STATUSES = ['Pending', 'Going', 'Maybe', 'Not Going', 'Declined'] as const;

export const addGuestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().max(30).optional(),
  guests: z.number().int().min(1).max(20).default(1),
  dietaryRestriction: z.string().max(200).optional(),
  accessibilityNeeds: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export const updateRsvpSchema = z.object({
  status: z.enum(RSVP_STATUSES),
  notes: z.string().max(1000).optional(),
  checkedIn: z.boolean().optional(),
});

// ── Task schemas ────────────────────────────────────────────────────────────

const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
const TASK_STATUSES = ['Pending', 'In Progress', 'Blocked', 'Complete', 'Cancelled'] as const;

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300),
  description: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
  priority: z.enum(TASK_PRIORITIES).default('Medium'),
  status: z.enum(TASK_STATUSES).default('Pending'),
  dueDate: z.string().optional(),
  assigneeUserId: z.number().int().optional(),
  estimatedHours: z.number().nonnegative().optional(),
});

// ── Budget / Expense schemas ─────────────────────────────────────────────────

export const createExpenseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300),
  amount: z.number().positive('Amount must be greater than 0'),
  categoryId: z.number().int().optional(),
  vendorName: z.string().max(200).optional(),
  currencyCode: z.string().length(3).default('USD'),
  notes: z.string().max(2000).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'overdue', 'cancelled']).default('pending'),
});

// ── Vendor schemas ───────────────────────────────────────────────────────────

export const createVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(300),
  category: z.string().min(1, 'Category is required').max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional().or(z.literal('')),
  status: z
    .enum(['Contacted', 'Quote Received', 'Booked', 'Confirmed', 'Cancelled'])
    .default('Contacted'),
  quotedAmount: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

// ── Inferred TypeScript types ────────────────────────────────────────────────

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type CreateEventFormValues = z.infer<typeof createEventSchema>;
export type UpdateEventFormValues = z.infer<typeof updateEventSchema>;
export type AddGuestFormValues = z.infer<typeof addGuestSchema>;
export type UpdateRsvpFormValues = z.infer<typeof updateRsvpSchema>;
export type CreateTaskFormValues = z.infer<typeof createTaskSchema>;
export type CreateExpenseFormValues = z.infer<typeof createExpenseSchema>;
export type CreateVendorFormValues = z.infer<typeof createVendorSchema>;
