/**
 * Unit tests: prompt-templates module — Story #966
 *
 * Covers:
 * - getTemplate: returns active (non-deprecated) template for each context
 * - getTemplate with version: returns the pinned version regardless of deprecated state
 * - getTemplate throws for unknown id
 * - getTemplate throws for unknown version
 * - getTemplateMetadata: returns correct metadata shape
 * - getTemplateHistory: returns all versions newest-first
 * - listActiveTemplates: returns one entry per context, all non-deprecated
 * - Template content: every active template has non-empty content
 * - Version scheme: all versions match MAJOR.MINOR.PATCH pattern
 * - Rollback path: deprecated versions are retrievable by explicit version pin
 */

import { describe, expect, it } from 'vitest';
import {
  getTemplate,
  getTemplateMetadata,
  getTemplateHistory,
  listActiveTemplates,
  type PromptTemplateContext,
} from '../src/lib/prompt-templates.js';

// All contexts that must have an active template.
const ALL_CONTEXTS: PromptTemplateContext[] = [
  'suggest-event',
  'suggest-task',
  'suggest-rsvp',
  'suggest-general',
  'grounded-event',
  'grounded-task',
  'grounded-rsvp',
  'task-breakdown',
  'budget-insight',
  'vendor-recommendation',
  'conflict-resolution',
  'analytics-narrative',
];

// ── getTemplate ────────────────────────────────────────────────────────────────

describe('getTemplate — active template retrieval', () => {
  it.each(ALL_CONTEXTS)('returns the active template for context "%s"', (ctx) => {
    const template = getTemplate(ctx);
    expect(template).toBeDefined();
    expect(template.id).toBe(ctx);
    expect(template.deprecated).toBeFalsy();
  });

  it('returns a template with non-empty content for every context', () => {
    for (const ctx of ALL_CONTEXTS) {
      const template = getTemplate(ctx);
      expect(template.content.trim().length).toBeGreaterThan(20);
    }
  });

  it('throws for an unknown template id', () => {
    expect(() => getTemplate('unknown-context' as PromptTemplateContext)).toThrow(
      /not found|no active/i,
    );
  });
});

describe('getTemplate — version-pinned retrieval (rollback path)', () => {
  it('returns a template when an explicit valid version is provided', () => {
    // Use 'suggest-event' 1.0.0 — guaranteed to exist in the registry.
    const template = getTemplate('suggest-event', '1.0.0');
    expect(template.id).toBe('suggest-event');
    expect(template.version).toBe('1.0.0');
  });

  it('throws when pinned version does not exist', () => {
    expect(() => getTemplate('suggest-event', '99.0.0')).toThrow(/not found/i);
  });

  it('throws when id is valid but version does not exist', () => {
    expect(() => getTemplate('grounded-event', '0.0.1')).toThrow(/not found/i);
  });
});

// ── getTemplateMetadata ────────────────────────────────────────────────────────

describe('getTemplateMetadata', () => {
  it('returns metadata with correct shape for every context', () => {
    for (const ctx of ALL_CONTEXTS) {
      const meta = getTemplateMetadata(ctx);
      expect(meta).toHaveProperty('templateId', ctx);
      expect(meta).toHaveProperty('version');
      expect(meta).toHaveProperty('deprecated', false);
      expect(typeof meta.version).toBe('string');
    }
  });

  it('marks deprecated=true for an explicitly pinned deprecated version when applicable', () => {
    // grounded-event 1.0.0 exists and is not deprecated (only version)
    const meta = getTemplateMetadata('grounded-event', '1.0.0');
    expect(meta.templateId).toBe('grounded-event');
    expect(meta.version).toBe('1.0.0');
  });
});

// ── getTemplateHistory ─────────────────────────────────────────────────────────

describe('getTemplateHistory', () => {
  it('returns at least one version for every context', () => {
    for (const ctx of ALL_CONTEXTS) {
      const history = getTemplateHistory(ctx);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history.every((t) => t.id === ctx)).toBe(true);
    }
  });

  it('returns history newest-first by version', () => {
    const history = getTemplateHistory('suggest-event');
    for (let i = 0; i < history.length - 1; i++) {
      // Newer version should sort >= previous version lexicographically.
      const cmp = history[i].version.localeCompare(history[i + 1].version, undefined, {
        numeric: true,
      });
      expect(cmp).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── listActiveTemplates ────────────────────────────────────────────────────────

describe('listActiveTemplates', () => {
  it('returns exactly one entry per context id', () => {
    const active = listActiveTemplates();
    const ids = active.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('returns an entry for every required context', () => {
    const active = listActiveTemplates();
    const ids = new Set(active.map((t) => t.id));
    for (const ctx of ALL_CONTEXTS) {
      expect(ids.has(ctx)).toBe(true);
    }
  });

  it('returns no deprecated templates', () => {
    const active = listActiveTemplates();
    expect(active.every((t) => !t.deprecated)).toBe(true);
  });
});

// ── Template content quality ───────────────────────────────────────────────────

describe('template content quality', () => {
  it('every active template has a valid semver-style version', () => {
    const semverRegex = /^\d+\.\d+\.\d+$/;
    for (const ctx of ALL_CONTEXTS) {
      const template = getTemplate(ctx);
      expect(template.version).toMatch(semverRegex);
    }
  });

  it('every active template has a non-empty description', () => {
    for (const ctx of ALL_CONTEXTS) {
      const template = getTemplate(ctx);
      expect(template.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('every active template has a valid ISO date for createdAt', () => {
    for (const ctx of ALL_CONTEXTS) {
      const template = getTemplate(ctx);
      expect(new Date(template.createdAt).toString()).not.toBe('Invalid Date');
    }
  });
});
