/**
 * Report Builder Zod schema (#812)
 * Shared between form validation and API request shaping.
 */
import { z } from 'zod';

export const REPORT_DOMAINS = ['events', 'guests', 'budget', 'tasks', 'vendors'] as const;
export type ReportDomain = (typeof REPORT_DOMAINS)[number];

export const FILTER_OPERATORS = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'contains',
  'starts_with',
  'is_null',
  'is_not_null',
] as const;

export const FREQUENCIES = ['one_off', 'daily', 'weekly', 'monthly'] as const;
export const OUTPUT_FORMATS = ['json', 'csv', 'xlsx'] as const;

export const filterSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  operator: z.enum(FILTER_OPERATORS),
  value: z.string().optional(),
});

export const sortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});

export const reportBuilderSchema = z.object({
  name: z.string().min(1, 'Report name is required').max(120),
  domain: z.enum(REPORT_DOMAINS, { message: 'Please select a domain' }),
  fields: z.array(z.string()).min(1, 'Select at least one field'),
  filters: z.array(filterSchema).default([]),
  groupBy: z.string().optional(),
  sort: sortSchema.optional(),
  format: z.enum(OUTPUT_FORMATS).default('json'),
  frequency: z.enum(FREQUENCIES).default('one_off'),
  recipients: z.array(z.string().email('Invalid email')).default([]),
});

export type ReportBuilderValues = z.infer<typeof reportBuilderSchema>;
