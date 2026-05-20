/**
 * Report Builder Service (#812)
 *
 * Executes safe, allowlist-validated dynamic queries for the custom report
 * builder.  ALL column and table references come from internal allowlists —
 * user-supplied names are never interpolated into SQL directly.
 *
 * Domains:  events | guests | budget | tasks | vendors
 * Operators: = | != | > | < | >= | <= | contains | starts_with | is_null | is_not_null
 */
import { getDatabase } from '../../db/database.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReportDomain = 'events' | 'guests' | 'budget' | 'tasks' | 'vendors';

export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'contains'
  | 'starts_with'
  | 'is_null'
  | 'is_not_null';

export interface ReportFilter {
  field: string;
  operator: FilterOperator;
  value?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface BuildReportConfig {
  domain: ReportDomain;
  /** Event ID to scope the query */
  eventId: number;
  /** Requested output fields (subset of domain's allowlist) */
  fields: string[];
  filters?: ReportFilter[];
  groupBy?: string;
  sort?: { field: string; direction: SortDirection };
}

export interface ReportResult {
  domain: ReportDomain;
  columns: string[];
  rows: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Allowlists — ONLY these fields may appear in SELECT / WHERE / GROUP BY / ORDER BY
// ---------------------------------------------------------------------------

interface FieldDef {
  /** SQL expression to SELECT */
  expr: string;
  /** Label shown as column header */
  label: string;
  /** Whether the field can be used in filters / ORDER BY */
  filterable?: boolean;
}

type DomainFields = Record<string, FieldDef>;

const DOMAIN_FIELDS: Record<ReportDomain, DomainFields> = {
  events: {
    id:         { expr: 'e.id',          label: 'ID',           filterable: true },
    name:       { expr: 'e.name',        label: 'Name',         filterable: true },
    event_date: { expr: 'e.event_date',  label: 'Date',         filterable: true },
    location:   { expr: 'e.location',    label: 'Location',     filterable: true },
    status:     { expr: 'e.status',      label: 'Status',       filterable: true },
    capacity:   { expr: 'e.capacity',    label: 'Capacity',     filterable: true },
    created_at: { expr: 'e.created_at',  label: 'Created At',   filterable: true },
  },
  guests: {
    id:                    { expr: 'r.id',                    label: 'ID',            filterable: true },
    guest_name:            { expr: 'r.guest_name',            label: 'Guest Name',    filterable: true },
    email:                 { expr: 'r.email',                 label: 'Email',         filterable: true },
    status:                { expr: 'r.status',                label: 'RSVP Status',   filterable: true },
    checked_in:            { expr: 'r.checked_in',            label: 'Checked In',    filterable: true },
    dietary_requirements:  { expr: 'r.dietary_requirements',  label: 'Dietary',       filterable: true },
    created_at:            { expr: 'r.created_at',            label: 'Submitted At',  filterable: true },
  },
  budget: {
    category_name:      { expr: 'bc.name',                                      label: 'Category',        filterable: true },
    allocated_amount:   { expr: 'bc.allocated_amount::numeric',                 label: 'Allocated ($)',   filterable: true },
    spent:              { expr: 'COALESCE(SUM(ex.amount), 0)::numeric',         label: 'Spent ($)',       filterable: false },
    remaining:          { expr: '(bc.allocated_amount - COALESCE(SUM(ex.amount), 0))::numeric', label: 'Remaining ($)', filterable: false },
    expense_count:      { expr: 'COUNT(ex.id)::int',                            label: 'Expenses',        filterable: false },
  },
  tasks: {
    id:           { expr: 't.id',           label: 'ID',          filterable: true },
    title:        { expr: 't.title',        label: 'Title',       filterable: true },
    status:       { expr: 't.status',       label: 'Status',      filterable: true },
    priority:     { expr: 't.priority',     label: 'Priority',    filterable: true },
    due_date:     { expr: 't.due_date',     label: 'Due Date',    filterable: true },
    assigned_to:  { expr: 't.assigned_to',  label: 'Assigned To', filterable: true },
    created_at:   { expr: 't.created_at',   label: 'Created At',  filterable: true },
  },
  vendors: {
    id:         { expr: 'v.id',        label: 'ID',       filterable: true },
    name:       { expr: 'v.name',      label: 'Name',     filterable: true },
    category:   { expr: 'v.category',  label: 'Category', filterable: true },
    status:     { expr: 'v.status',    label: 'Status',   filterable: true },
    email:      { expr: 'v.email',     label: 'Email',    filterable: true },
    phone:      { expr: 'v.phone',     label: 'Phone',    filterable: true },
    created_at: { expr: 'v.created_at', label: 'Created At', filterable: true },
  },
};

/** FROM clause + any joins needed per domain */
const DOMAIN_FROM: Record<ReportDomain, (eventId: number) => { from: string; baseParam: number[] }> = {
  events: (eid) => ({ from: 'FROM events e', baseParam: [eid] }),
  guests: (eid) => ({ from: 'FROM rsvps r', baseParam: [eid] }),
  budget: (eid) => ({
    from: 'FROM budget_categories bc LEFT JOIN expenses ex ON ex.budget_category_id = bc.id AND ex.event_id = bc.event_id',
    baseParam: [eid],
  }),
  tasks:   (eid) => ({ from: 'FROM tasks t',   baseParam: [eid] }),
  vendors: (eid) => ({ from: 'FROM vendors v', baseParam: [eid] }),
};

/** WHERE clause applied before user filters */
const DOMAIN_BASE_WHERE: Record<ReportDomain, string> = {
  events:  'e.id = $1',
  guests:  'r.event_id = $1',
  budget:  'bc.event_id = $1',
  tasks:   't.event_id = $1',
  vendors: 'v.event_id = $1',
};

/** GROUP BY is required for budget aggregates */
const DOMAIN_REQUIRES_GROUP: Record<ReportDomain, string | null> = {
  events:  null,
  guests:  null,
  budget:  'bc.id, bc.name, bc.allocated_amount',
  tasks:   null,
  vendors: null,
};

const VALID_OPERATORS = new Set<FilterOperator>([
  '=', '!=', '>', '<', '>=', '<=', 'contains', 'starts_with', 'is_null', 'is_not_null',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a custom report query and return labeled columns + raw rows.
 * All SQL construction uses allowlisted expressions — no user strings in SQL.
 */
export async function buildReport(config: BuildReportConfig): Promise<ReportResult> {
  const { domain, eventId, fields, filters = [], groupBy, sort } = config;

  const domainFields = DOMAIN_FIELDS[domain];
  if (!domainFields) throw new Error(`Unknown domain: ${domain}`);

  // Resolve requested fields against the allowlist
  const resolvedFields = fields.length > 0
    ? fields.filter((f) => f in domainFields)
    : Object.keys(domainFields);

  if (resolvedFields.length === 0) throw new Error('No valid fields selected.');

  const selectClauses = resolvedFields.map(
    (f) => `${domainFields[f].expr} AS ${quoteIdent(f)}`,
  );

  const { from, baseParam } = DOMAIN_DOMAIN_FROM(domain, eventId);

  // Build WHERE clause
  const params: unknown[] = [...baseParam];
  const whereClauses: string[] = [DOMAIN_BASE_WHERE[domain]];

  for (const filter of filters) {
    const fieldDef = domainFields[filter.field];
    if (!fieldDef || !fieldDef.filterable) continue; // silently skip invalid fields
    if (!VALID_OPERATORS.has(filter.operator)) continue;

    const sql = buildFilterClause(fieldDef.expr, filter, params);
    if (sql) whereClauses.push(sql);
  }

  // GROUP BY
  const groupByClause = resolveGroupBy(domain, groupBy, domainFields);

  // ORDER BY
  let orderByClause = '';
  if (sort?.field && sort.field in domainFields) {
    const dir = sort.direction === 'desc' ? 'DESC' : 'ASC';
    orderByClause = `ORDER BY ${domainFields[sort.field].expr} ${dir}`;
  }

  const sql = [
    `SELECT ${selectClauses.join(', ')}`,
    from,
    `WHERE ${whereClauses.join(' AND ')}`,
    groupByClause ? `GROUP BY ${groupByClause}` : '',
    orderByClause,
    'LIMIT 5000',
  ]
    .filter(Boolean)
    .join('\n');

  const db = getDatabase();
  const rows = await db.all<Record<string, unknown>>(sql, params);

  return {
    domain,
    columns: resolvedFields.map((f) => domainFields[f].label),
    rows,
  };
}

/**
 * List available fields for a domain (for the UI picker).
 */
export function getDomainFieldMeta(domain: ReportDomain): Array<{ key: string; label: string; filterable: boolean }> {
  const fields = DOMAIN_FIELDS[domain];
  if (!fields) return [];
  return Object.entries(fields).map(([key, def]) => ({
    key,
    label: def.label,
    filterable: def.filterable ?? false,
  }));
}

/** Return all supported domains */
export function getAllDomains(): ReportDomain[] {
  return ['events', 'guests', 'budget', 'tasks', 'vendors'];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve domain FROM clause via explicit switch — avoids dynamic dispatch on user-controlled key. */
function DOMAIN_DOMAIN_FROM(domain: ReportDomain, eventId: number): { from: string; baseParam: number[] } {
  switch (domain) {
    case 'events':  return DOMAIN_FROM.events(eventId);
    case 'guests':  return DOMAIN_FROM.guests(eventId);
    case 'budget':  return DOMAIN_FROM.budget(eventId);
    case 'tasks':   return DOMAIN_FROM.tasks(eventId);
    case 'vendors': return DOMAIN_FROM.vendors(eventId);
  }
}

function resolveGroupBy(domain: ReportDomain, userGroupBy: string | undefined, fields: DomainFields): string {
  const required = DOMAIN_REQUIRES_GROUP[domain];
  if (required) return required; // budget always groups
  if (!userGroupBy || !(userGroupBy in fields)) return '';
  return fields[userGroupBy].expr;
}

/**
 * Build a single WHERE clause fragment for a filter.
 * Pushes parameter values into `params` and returns `$N`-parameterised SQL.
 */
function buildFilterClause(
  expr: string,
  filter: ReportFilter,
  params: unknown[],
): string {
  const { operator, value } = filter;

  if (operator === 'is_null') return `${expr} IS NULL`;
  if (operator === 'is_not_null') return `${expr} IS NOT NULL`;

  if (value === undefined || value === null) return '';

  const idx = params.length + 1;

  switch (operator) {
    case '=':
      params.push(value);
      return `${expr} = $${idx}`;
    case '!=':
      params.push(value);
      return `${expr} != $${idx}`;
    case '>':
      params.push(value);
      return `${expr} > $${idx}`;
    case '<':
      params.push(value);
      return `${expr} < $${idx}`;
    case '>=':
      params.push(value);
      return `${expr} >= $${idx}`;
    case '<=':
      params.push(value);
      return `${expr} <= $${idx}`;
    case 'contains':
      // ILIKE with parameterised pattern — safe because we build the pattern server-side
      params.push(`%${sanitizeLike(value)}%`);
      return `${expr}::text ILIKE $${idx}`;
    case 'starts_with':
      params.push(`${sanitizeLike(value)}%`);
      return `${expr}::text ILIKE $${idx}`;
    default:
      return '';
  }
}

/** Escape LIKE wildcard characters in user-supplied values. */
function sanitizeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

/**
 * Double-quote an identifier for use in SQL.
 * Only alphanumeric + underscore chars accepted; throws on others.
 */
function quoteIdent(name: string): string {
  if (!/^\w+$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}
