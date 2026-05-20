# Accessibility Baseline Allowlist

> **Last updated:** 2026-05-20
>
> This document tracks known WCAG 2.1 AA accessibility violations that are
> currently allowlisted in the axe-core CI workflow (`.github/workflows/a11y.yml`).
> Each entry has a follow-up issue to track remediation.
>
> Violations listed here will NOT block PR merges but will emit warnings in
> the CI output. Remove entries as they are fixed.

## How to use

The CI accessibility tests (`tests/a11y/`) load this file to determine which
axe rule IDs should be excluded from blocking failures. To add a new baseline
entry:

1. Identify the axe rule ID from the CI failure output (e.g., `color-contrast`)
2. Create a follow-up GitHub issue to fix the violation
3. Add a row to the table below with the rule ID, description, and issue link
4. Get the baseline addition reviewed and approved

## Allowlisted Violations

| Rule ID | Description | Impact | Pages Affected | Follow-up Issue |
|---------|-------------|--------|----------------|-----------------|
| `color-contrast` | Elements must meet minimum colour contrast ratio requirements | serious | /login, /events | #TBD |
| `landmark-one-main` | Page must have one main landmark | serious | /rsvp | #TBD |

## Graduated (Fixed) Entries

| Rule ID | Fixed In | Date |
|---------|----------|------|
| *(none yet)* | — | — |

## References

- [axe-core Rule Descriptions](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [NFR §5.3 — Accessibility](../requirements/non-functional-requirements.md)
