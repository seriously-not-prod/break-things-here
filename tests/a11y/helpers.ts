/**
 * Shared helpers for axe-core accessibility tests (#815).
 *
 * Provides:
 *   - WCAG tag constants
 *   - Baseline allowlist loader (reads docs/operations/a11y-baseline.md)
 *   - auditor helper that runs axe and filters results
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** WCAG 2.1 Level AA tag set for axe-core */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Impact levels that should block a PR merge */
export const BLOCKING_IMPACTS = ['critical', 'serious'] as const;

/**
 * Parse the a11y baseline allowlist from docs/operations/a11y-baseline.md.
 * Each allowlisted rule ID is listed in a markdown table row like:
 *   | rule-id | description | follow-up issue |
 *
 * Returns a Set of allowlisted axe rule IDs.
 */
export function loadBaselineAllowlist(): Set<string> {
  const baselinePath = path.resolve(
    __dirname,
    '../../docs/operations/a11y-baseline.md',
  );
  const allowlist = new Set<string>();

  if (!fs.existsSync(baselinePath)) {
    return allowlist;
  }

  const content = fs.readFileSync(baselinePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    // Match table rows: | rule-id | ... |
    const match = line.match(/^\|\s*`?([a-z][a-z0-9-]+)`?\s*\|/);
    if (match && match[1] !== 'Rule ID') {
      allowlist.add(match[1]);
    }
  }

  return allowlist;
}

export interface AuditResult {
  /** Violations that block the PR (critical/serious, not in baseline) */
  blocking: Array<{ id: string; impact: string; description: string; nodes: string[] }>;
  /** All violations (including non-blocking) */
  all: Array<{ id: string; impact: string; description: string }>;
}

/**
 * Run an axe-core audit on the current page and return filtered results.
 * Violations in the baseline allowlist are excluded from blocking results.
 */
export async function runAxeAudit(page: Page, pageUrl: string): Promise<AuditResult> {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();

  const allowlist = loadBaselineAllowlist();

  const blocking = results.violations
    .filter(
      (v) =>
        (v.impact === 'critical' || v.impact === 'serious') &&
        !allowlist.has(v.id),
    )
    .map((v) => ({
      id: v.id,
      impact: v.impact ?? 'unknown',
      description: v.description,
      nodes: v.nodes.map((n) => n.html),
    }));

  const all = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? 'unknown',
    description: v.description,
  }));

  return { blocking, all };
}

/**
 * Format blocking violations into a readable summary for test failure output.
 */
export function formatViolations(
  violations: AuditResult['blocking'],
  pagePath: string,
): string {
  if (violations.length === 0) return '';
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.description}\n` +
        v.nodes.map((n) => `    → ${n}`).join('\n'),
    )
    .join('\n\n');
}
