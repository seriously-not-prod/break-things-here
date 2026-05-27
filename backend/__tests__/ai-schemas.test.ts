/**
 * Tests: Structured AI Output Schemas — Issue #964
 *
 * Covers:
 * - extractJson: provider-safe JSON extraction and markdown-fence stripping
 * - parseEventSuggestion: event schema validation with required/optional fields
 * - parseTaskSuggestion: task schema validation with required/optional fields
 * - parseRsvpSuggestion: rsvp schema validation with required/optional fields
 * - parseGeneralSuggestion: general context normalisation (JSON + plain-text)
 * - parseRsvpCommunicationDraft: RSVP draft schema validation
 * - parseBudgetInsightOutput: budget insight schema validation
 * - parseTaskBreakdownOutput: task breakdown array schema validation
 * - parseGroundedOutput: workflow-type dispatcher
 * - formatValidationErrors: human-readable error formatting
 * - ParseResult shape: ok/error discrimination and error fields
 */

import { describe, expect, it } from 'vitest';
import {
  extractJson,
  parseEventSuggestion,
  parseTaskSuggestion,
  parseRsvpSuggestion,
  parseGeneralSuggestion,
  parseRsvpCommunicationDraft,
  parseBudgetInsightOutput,
  parseTaskBreakdownOutput,
  parseGroundedOutput,
  formatValidationErrors,
  type SchemaValidationError,
  type ParseResult,
} from '../src/lib/ai-schemas.js';

// ── extractJson ───────────────────────────────────────────────────────────────

describe('extractJson', () => {
  it('parses a plain JSON object string', () => {
    const result = extractJson('{"key":"value"}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ key: 'value' });
  });

  it('strips markdown json code fences before parsing', () => {
    const raw = '```json\n{"title":"Fest"}\n```';
    const result = extractJson(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.title).toBe('Fest');
  });

  it('strips plain code fences (no language specifier)', () => {
    const raw = '```\n{"key":"v"}\n```';
    const result = extractJson(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.key).toBe('v');
  });

  it('returns an error for entirely non-JSON input', () => {
    const result = extractJson('not json at all');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('<root>');
      expect(result.errors[0].message).toContain('not valid JSON');
    }
  });

  it('returns an error for a JSON array (not an object)', () => {
    const result = extractJson('[1, 2, 3]');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain('JSON object');
    }
  });

  it('returns an error for a JSON primitive', () => {
    const result = extractJson('"just a string"');
    expect(result.ok).toBe(false);
  });

  it('returns an error for JSON null', () => {
    const result = extractJson('null');
    expect(result.ok).toBe(false);
  });
});

// ── parseEventSuggestion ──────────────────────────────────────────────────────

describe('parseEventSuggestion', () => {
  it('parses a fully-populated valid event suggestion', () => {
    const raw = JSON.stringify({
      title: 'Summer Fest',
      description: 'A great outdoor event',
      venueType: 'Outdoor amphitheatre',
      promotionalTips: ['Use social media', 'Partner with sponsors', 'Early bird tickets'],
    });

    const result = parseEventSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe('Summer Fest');
      expect(result.data.description).toBe('A great outdoor event');
      expect(result.data.venueType).toBe('Outdoor amphitheatre');
      expect(result.data.promotionalTips).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('parses a minimal valid event suggestion (only required fields)', () => {
    const raw = JSON.stringify({ title: 'Minimal Fest', description: 'Short desc' });
    const result = parseEventSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.venueType).toBe('');
      expect(result.data.promotionalTips).toEqual([]);
    }
  });

  it('strips markdown fences and parses successfully', () => {
    const inner = JSON.stringify({ title: 'Fest', description: 'desc' });
    const result = parseEventSuggestion(`\`\`\`json\n${inner}\n\`\`\``);
    expect(result.ok).toBe(true);
  });

  it('returns an error when title is missing', () => {
    const raw = JSON.stringify({ description: 'No title here', venueType: 'Indoor' });
    const result = parseEventSuggestion(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const titleError = result.errors.find((e) => e.field === 'title');
      expect(titleError).toBeDefined();
      expect(titleError?.message).toContain('non-empty string');
    }
  });

  it('returns an error when description is missing', () => {
    const raw = JSON.stringify({ title: 'Good Title' });
    const result = parseEventSuggestion(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const descError = result.errors.find((e) => e.field === 'description');
      expect(descError).toBeDefined();
    }
  });

  it('returns an error when title is an empty string', () => {
    const raw = JSON.stringify({ title: '', description: 'ok' });
    const result = parseEventSuggestion(raw);
    expect(result.ok).toBe(false);
  });

  it('returns an error when promotionalTips is not an array', () => {
    const raw = JSON.stringify({ title: 'T', description: 'D', promotionalTips: 'not array' });
    const result = parseEventSuggestion(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const tipsError = result.errors.find((e) => e.field === 'promotionalTips');
      expect(tipsError).toBeDefined();
    }
  });

  it('returns an error when promotionalTips contains a non-string element', () => {
    const raw = JSON.stringify({ title: 'T', description: 'D', promotionalTips: ['ok', 42] });
    const result = parseEventSuggestion(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const itemError = result.errors.find((e) => e.field === 'promotionalTips[1]');
      expect(itemError).toBeDefined();
    }
  });

  it('trims whitespace from string fields', () => {
    const raw = JSON.stringify({ title: '  Trimmed  ', description: '  desc  ' });
    const result = parseEventSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe('Trimmed');
      expect(result.data.description).toBe('desc');
    }
  });

  it('returns an error for entirely non-JSON input', () => {
    const result = parseEventSuggestion('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].field).toBe('<root>');
    }
  });
});

// ── parseTaskSuggestion ───────────────────────────────────────────────────────

describe('parseTaskSuggestion', () => {
  it('parses a fully-populated valid task suggestion', () => {
    const raw = JSON.stringify({
      actionTitle: 'Set up stage',
      dueDateRange: '2 weeks before event',
      owner: 'AV team',
      dependencies: ['Venue confirmed', 'Equipment sourced'],
    });

    const result = parseTaskSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.actionTitle).toBe('Set up stage');
      expect(result.data.dueDateRange).toBe('2 weeks before event');
      expect(result.data.owner).toBe('AV team');
      expect(result.data.dependencies).toHaveLength(2);
    }
  });

  it('parses a minimal valid task suggestion (only actionTitle)', () => {
    const raw = JSON.stringify({ actionTitle: 'Book venue' });
    const result = parseTaskSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.dueDateRange).toBe('');
      expect(result.data.owner).toBe('');
      expect(result.data.dependencies).toEqual([]);
    }
  });

  it('returns an error when actionTitle is missing', () => {
    const raw = JSON.stringify({ dueDateRange: 'Next week', owner: 'Team lead' });
    const result = parseTaskSuggestion(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.field === 'actionTitle');
      expect(err).toBeDefined();
    }
  });

  it('returns an error when actionTitle is empty', () => {
    const raw = JSON.stringify({ actionTitle: '   ' });
    const result = parseTaskSuggestion(raw);
    expect(result.ok).toBe(false);
  });

  it('returns an error when dependencies is not an array', () => {
    const raw = JSON.stringify({ actionTitle: 'Task', dependencies: 'dep1' });
    const result = parseTaskSuggestion(raw);
    expect(result.ok).toBe(false);
  });

  it('returns an error when a dependency element is not a string', () => {
    const raw = JSON.stringify({ actionTitle: 'Task', dependencies: ['ok', 123] });
    const result = parseTaskSuggestion(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.field === 'dependencies[1]');
      expect(err).toBeDefined();
    }
  });
});

// ── parseRsvpSuggestion ───────────────────────────────────────────────────────

describe('parseRsvpSuggestion', () => {
  it('parses a fully-populated valid RSVP suggestion', () => {
    const raw = JSON.stringify({
      confirmationMessage: 'You are confirmed!',
      reminderMessage: 'Event in 3 days',
      capacityTip: 'Open a waitlist',
    });

    const result = parseRsvpSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.confirmationMessage).toBe('You are confirmed!');
      expect(result.data.reminderMessage).toBe('Event in 3 days');
      expect(result.data.capacityTip).toBe('Open a waitlist');
    }
  });

  it('parses with only the required confirmationMessage', () => {
    const raw = JSON.stringify({ confirmationMessage: 'Confirmed!' });
    const result = parseRsvpSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.reminderMessage).toBe('');
      expect(result.data.capacityTip).toBe('');
    }
  });

  it('returns an error when confirmationMessage is missing', () => {
    const raw = JSON.stringify({ reminderMessage: 'Reminder', capacityTip: 'tip' });
    const result = parseRsvpSuggestion(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.field === 'confirmationMessage');
      expect(err).toBeDefined();
    }
  });

  it('returns an error when confirmationMessage is empty', () => {
    const raw = JSON.stringify({ confirmationMessage: '' });
    const result = parseRsvpSuggestion(raw);
    expect(result.ok).toBe(false);
  });
});

// ── parseGeneralSuggestion ────────────────────────────────────────────────────

describe('parseGeneralSuggestion', () => {
  it('parses a JSON response with advice and actionItems', () => {
    const raw = JSON.stringify({
      advice: 'Start planning 6 months ahead.',
      actionItems: ['Book venue', 'Set up ticketing'],
    });

    const result = parseGeneralSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.advice).toBe('Start planning 6 months ahead.');
      expect(result.data.actionItems).toHaveLength(2);
    }
  });

  it('normalises plain-text responses (non-JSON) into advice field', () => {
    const raw = 'Start by booking the venue at least 6 months in advance.';
    const result = parseGeneralSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.advice).toBe(raw);
      expect(result.data.actionItems).toEqual([]);
    }
  });

  it('falls back to raw text when JSON lacks advice field', () => {
    const raw = JSON.stringify({ unrelated: 'field' });
    const result = parseGeneralSuggestion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.advice).toBeTruthy();
    }
  });

  it('returns an error for an empty response', () => {
    const result = parseGeneralSuggestion('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.field === 'advice');
      expect(err).toBeDefined();
      expect(err?.message).toContain('empty');
    }
  });

  it('returns an error when actionItems is not an array', () => {
    const raw = JSON.stringify({ advice: 'Good advice', actionItems: 'not array' });
    const result = parseGeneralSuggestion(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.field === 'actionItems');
      expect(err).toBeDefined();
    }
  });

  it('returns an error when an actionItem element is not a string', () => {
    const raw = JSON.stringify({ advice: 'ok', actionItems: ['step 1', 42] });
    const result = parseGeneralSuggestion(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.field === 'actionItems[1]');
      expect(err).toBeDefined();
    }
  });
});

// ── parseRsvpCommunicationDraft ───────────────────────────────────────────────

describe('parseRsvpCommunicationDraft', () => {
  it('parses a fully-populated RSVP communication draft', () => {
    const raw = JSON.stringify({
      reminderVariant: 'Please confirm your attendance.',
      confirmationVariant: 'You are confirmed — see you there!',
      deadlineReminder: 'RSVP deadline is tomorrow!',
    });

    const result = parseRsvpCommunicationDraft(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.reminderVariant).toBe('Please confirm your attendance.');
      expect(result.data.confirmationVariant).toBe('You are confirmed — see you there!');
      expect(result.data.deadlineReminder).toBe('RSVP deadline is tomorrow!');
    }
  });

  it('parses with only the required reminderVariant', () => {
    const raw = JSON.stringify({ reminderVariant: 'Reminder message' });
    const result = parseRsvpCommunicationDraft(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.confirmationVariant).toBe('');
      expect(result.data.deadlineReminder).toBe('');
    }
  });

  it('returns an error when reminderVariant is missing', () => {
    const raw = JSON.stringify({ confirmationVariant: 'ok', deadlineReminder: 'ok' });
    const result = parseRsvpCommunicationDraft(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.field === 'reminderVariant');
      expect(err).toBeDefined();
    }
  });

  it('returns an error when reminderVariant is empty', () => {
    const raw = JSON.stringify({ reminderVariant: '' });
    const result = parseRsvpCommunicationDraft(raw);
    expect(result.ok).toBe(false);
  });

  it('returns an error for non-JSON input', () => {
    const result = parseRsvpCommunicationDraft('plain text response');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].field).toBe('<root>');
    }
  });

  it('strips markdown fences before parsing', () => {
    const inner = JSON.stringify({ reminderVariant: 'Reminder!' });
    const result = parseRsvpCommunicationDraft(`\`\`\`json\n${inner}\n\`\`\``);
    expect(result.ok).toBe(true);
  });
});

// ── parseBudgetInsightOutput ──────────────────────────────────────────────────

describe('parseBudgetInsightOutput', () => {
  const validBudgetOutput = JSON.stringify({
    summary: 'Budget is on track overall.',
    riskLevel: 'low',
    anomalies: ['AV spend unusually high'],
    recommendations: [
      { category: 'AV', insight: 'Overspent by 20%', action: 'Reduce AV scope', priority: 'high' },
      { category: 'Catering', insight: 'On budget', action: 'Keep current plan', priority: 'low' },
      { category: 'Overall', insight: 'Good shape', action: 'Monitor weekly', priority: 'medium' },
    ],
  });

  it('parses a fully valid budget insight output', () => {
    const result = parseBudgetInsightOutput(validBudgetOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary).toBe('Budget is on track overall.');
      expect(result.data.riskLevel).toBe('low');
      expect(result.data.anomalies).toHaveLength(1);
      expect(result.data.recommendations).toHaveLength(3);
    }
  });

  it('defaults riskLevel to medium when the value is invalid', () => {
    const raw = JSON.stringify({
      summary: 'ok',
      riskLevel: 'unknown-level',
      recommendations: [{ insight: 'tip', category: 'Overall', action: 'act', priority: 'high' }],
    });
    const result = parseBudgetInsightOutput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.riskLevel).toBe('medium');
  });

  it('defaults recommendation priority to medium when value is invalid', () => {
    const raw = JSON.stringify({
      summary: 'ok',
      riskLevel: 'high',
      recommendations: [
        { insight: 'tip', category: 'Overall', action: 'act', priority: 'extreme' },
      ],
    });
    const result = parseBudgetInsightOutput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.recommendations[0].priority).toBe('medium');
  });

  it('returns an error when recommendations is not an array', () => {
    const raw = JSON.stringify({ summary: 'ok', riskLevel: 'low', recommendations: 'bad' });
    const result = parseBudgetInsightOutput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.field === 'recommendations');
      expect(err).toBeDefined();
    }
  });

  it('returns an error when no valid recommendations exist', () => {
    const raw = JSON.stringify({
      summary: 'ok',
      riskLevel: 'medium',
      recommendations: [{ category: 'Overall' }], // missing insight
    });
    const result = parseBudgetInsightOutput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain('At least one valid recommendation');
    }
  });

  it('returns an error for non-JSON input', () => {
    const result = parseBudgetInsightOutput('not json');
    expect(result.ok).toBe(false);
  });

  it('filters out anomaly items that are not strings', () => {
    const raw = JSON.stringify({
      summary: 'ok',
      riskLevel: 'medium',
      anomalies: ['valid anomaly', 42, null],
      recommendations: [{ insight: 'tip', category: 'Overall', action: 'act', priority: 'high' }],
    });
    const result = parseBudgetInsightOutput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.anomalies).toEqual(['valid anomaly']);
  });

  it('handles empty anomalies array', () => {
    const raw = JSON.stringify({
      riskLevel: 'low',
      anomalies: [],
      recommendations: [{ insight: 'tip', action: 'act', priority: 'low' }],
    });
    const result = parseBudgetInsightOutput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.anomalies).toEqual([]);
  });
});

// ── parseTaskBreakdownOutput ──────────────────────────────────────────────────

describe('parseTaskBreakdownOutput', () => {
  const validTaskBreakdown = JSON.stringify([
    {
      title: 'Book venue',
      owner: 'Event coordinator',
      dueWindow: '6 months before event',
      dependencies: [],
      priority: 'urgent',
      timelineConstraint: 'Must be done before marketing launch',
    },
    {
      title: 'Set up ticketing',
      owner: 'Marketing team',
      dueWindow: '4 months before event',
      dependencies: ['Book venue'],
      priority: 'high',
      timelineConstraint: 'Depends on confirmed venue date',
    },
  ]);

  it('parses a valid task breakdown array', () => {
    const result = parseTaskBreakdownOutput(validTaskBreakdown);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].title).toBe('Book venue');
      expect(result.data[0].priority).toBe('urgent');
      expect(result.data[1].dependencies).toContain('Book venue');
    }
  });

  it('strips markdown fences before parsing', () => {
    const inner = JSON.stringify([{ title: 'Task A', priority: 'high' }]);
    const result = parseTaskBreakdownOutput(`\`\`\`json\n${inner}\n\`\`\``);
    expect(result.ok).toBe(true);
  });

  it('defaults invalid priority to medium', () => {
    const raw = JSON.stringify([{ title: 'Task A', priority: 'extreme' }]);
    const result = parseTaskBreakdownOutput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0].priority).toBe('medium');
  });

  it('skips items without a title', () => {
    const raw = JSON.stringify([
      { title: 'Valid task', priority: 'low' },
      { priority: 'high' }, // no title
      { title: '', priority: 'medium' }, // empty title
    ]);
    const result = parseTaskBreakdownOutput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(1);
  });

  it('returns an error when the response is not a JSON array', () => {
    const raw = JSON.stringify({ title: 'Not an array' });
    const result = parseTaskBreakdownOutput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain('JSON array');
    }
  });

  it('returns an error when all items are invalid (no titles)', () => {
    const raw = JSON.stringify([{ priority: 'high' }, { owner: 'Team' }]);
    const result = parseTaskBreakdownOutput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain('no valid items');
    }
  });

  it('returns an error for an empty array', () => {
    const result = parseTaskBreakdownOutput('[]');
    expect(result.ok).toBe(false);
  });

  it('returns an error for non-JSON input', () => {
    const result = parseTaskBreakdownOutput('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].field).toBe('<root>');
    }
  });

  it('handles missing optional fields gracefully', () => {
    const raw = JSON.stringify([{ title: 'Minimal task' }]);
    const result = parseTaskBreakdownOutput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].owner).toBe('');
      expect(result.data[0].dueWindow).toBe('');
      expect(result.data[0].dependencies).toEqual([]);
      expect(result.data[0].timelineConstraint).toBe('');
    }
  });
});

// ── parseGroundedOutput (dispatcher) ─────────────────────────────────────────

describe('parseGroundedOutput', () => {
  it('routes event type to parseEventSuggestion', () => {
    const raw = JSON.stringify({ title: 'Routed Event', description: 'Desc' });
    const result = parseGroundedOutput('event', raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('title' in result.data).toBe(true);
    }
  });

  it('routes task type to parseTaskSuggestion', () => {
    const raw = JSON.stringify({ actionTitle: 'Routed task' });
    const result = parseGroundedOutput('task', raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('actionTitle' in result.data).toBe(true);
    }
  });

  it('routes rsvp type to parseRsvpSuggestion', () => {
    const raw = JSON.stringify({ confirmationMessage: 'Routed RSVP msg' });
    const result = parseGroundedOutput('rsvp', raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('confirmationMessage' in result.data).toBe(true);
    }
  });

  it('returns an error result for invalid input on any type', () => {
    const result = parseGroundedOutput('event', 'not json');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ── formatValidationErrors ────────────────────────────────────────────────────

describe('formatValidationErrors', () => {
  it('formats a single error with field, message, and received value', () => {
    const errors: SchemaValidationError[] = [
      { field: 'title', message: 'must be a string', received: 42 },
    ];
    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('[title]');
    expect(formatted).toContain('must be a string');
    expect(formatted).toContain('42');
  });

  it('formats multiple errors separated by semicolons', () => {
    const errors: SchemaValidationError[] = [
      { field: 'title', message: 'required' },
      { field: 'description', message: 'required' },
    ];
    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('[title]');
    expect(formatted).toContain('[description]');
    expect(formatted.split(';')).toHaveLength(2);
  });

  it('omits the received value when it is undefined', () => {
    const errors: SchemaValidationError[] = [{ field: 'foo', message: 'bar' }];
    const formatted = formatValidationErrors(errors);
    expect(formatted).not.toContain('got:');
  });

  it('returns an empty string for an empty errors array', () => {
    expect(formatValidationErrors([])).toBe('');
  });
});

// ── ParseResult type shape ────────────────────────────────────────────────────

describe('ParseResult type shape', () => {
  it('ok result has data and empty errors array', () => {
    const raw = JSON.stringify({ title: 'T', description: 'D' });
    const result: ParseResult<{ title: string; description: string }> = parseEventSuggestion(
      raw,
    ) as ParseResult<{ title: string; description: string }>;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).not.toBeNull();
    }
  });

  it('error result has null data and non-empty errors array', () => {
    const result = parseEventSuggestion('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.data).toBeNull();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('each SchemaValidationError has required field and message properties', () => {
    const result = parseEventSuggestion(JSON.stringify({ description: 'no title' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const err of result.errors) {
        expect(typeof err.field).toBe('string');
        expect(typeof err.message).toBe('string');
      }
    }
  });
});
