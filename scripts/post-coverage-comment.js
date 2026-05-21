#!/usr/bin/env node
/**
 * post-coverage-comment.js
 *
 * Reads coverage-summary.json files for frontend and backend, optionally
 * compares against a base-branch snapshot, then posts (or updates) a sticky
 * PR comment via the GitHub API.
 *
 * Environment variables (all provided by the CI workflow):
 *   GITHUB_TOKEN            – token with pull-requests:write permission
 *   GITHUB_REPOSITORY       – e.g. "seriously-not-prod/break-things-here"
 *   PR_NUMBER               – pull-request number
 *   FRONTEND_COVERAGE       – path to current frontend coverage-summary.json
 *   BACKEND_COVERAGE        – path to current backend coverage-summary.json
 *   BASE_FRONTEND_COVERAGE  – (optional) base-branch frontend summary path
 *   BASE_BACKEND_COVERAGE   – (optional) base-branch backend summary path
 */

'use strict';

const { readFileSync, existsSync } = require('fs');

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const prNumber = process.env.PR_NUMBER;
const frontendPath = process.env.FRONTEND_COVERAGE || 'coverage/frontend/coverage-summary.json';
const backendPath = process.env.BACKEND_COVERAGE || 'coverage/backend/coverage-summary.json';
const baseFrontendPath = process.env.BASE_FRONTEND_COVERAGE || '';
const baseBackendPath = process.env.BASE_BACKEND_COVERAGE || '';

const COMMENT_MARKER = '<!-- coverage-delta-comment -->';

/** Read a coverage-summary.json and return its `total` block, or null. */
function readSummary(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return raw.total || null;
  } catch (_) {
    return null;
  }
}

/** Format a percentage with optional delta indicator. */
function fmt(pct, basePct) {
  const val = typeof pct === 'number' ? pct.toFixed(2) : 'N/A';
  if (basePct == null || typeof basePct !== 'number') return val + '%';
  const delta = pct - basePct;
  if (Math.abs(delta) < 0.01) return val + '% (=)';
  const sign = delta > 0 ? '+' : '';
  const emoji = delta >= 0 ? '🟢' : '🔴';
  return val + '% ' + emoji + ' ' + sign + delta.toFixed(2) + '%';
}

function pct(obj) {
  return obj && typeof obj.pct === 'number' ? obj.pct : null;
}

/** Build a markdown table row for one workspace. */
function buildRow(label, current, base) {
  if (!current) return '| ' + label + ' | *no data* | – | – | – |\n';
  const b = base || {};
  return (
    '| ' +
    label +
    ' ' +
    '| ' +
    fmt(pct(current.lines), pct(b.lines)) +
    ' ' +
    '| ' +
    fmt(pct(current.statements), pct(b.statements)) +
    ' ' +
    '| ' +
    fmt(pct(current.branches), pct(b.branches)) +
    ' ' +
    '| ' +
    fmt(pct(current.functions), pct(b.functions)) +
    ' |\n'
  );
}

function buildComment(frontendCurrent, backendCurrent, frontendBase, backendBase) {
  const hasBase = frontendBase || backendBase;
  const deltaNote = hasBase
    ? 'Delta shown against the base branch (🟢 increased / 🔴 decreased).'
    : 'No base-branch coverage available for delta comparison.';

  return (
    COMMENT_MARKER +
    '\n' +
    '## 📊 Coverage Report\n\n' +
    deltaNote +
    '\n\n' +
    '| Workspace | Lines | Statements | Branches | Functions |\n' +
    '|-----------|-------|------------|----------|----------|\n' +
    buildRow('Frontend', frontendCurrent, frontendBase) +
    buildRow('Backend', backendCurrent, backendBase) +
    '\n> **Thresholds** (regression-guard floor): Lines ≥25% · Branches ≥20% · Functions ≥20% · Statements ≥25%\n'
  );
}

async function githubRequest(method, path, body) {
  const url = 'https://api.github.com' + path;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('GitHub API ' + method + ' ' + path + ' → ' + res.status + ': ' + text);
  }
  return res.json();
}

async function main() {
  if (!token || !repo || !prNumber) {
    console.error('Missing required env: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER');
    process.exit(1);
  }

  const frontendCurrent = readSummary(frontendPath);
  const backendCurrent = readSummary(backendPath);
  const frontendBase = readSummary(baseFrontendPath);
  const backendBase = readSummary(baseBackendPath);

  const body = buildComment(frontendCurrent, backendCurrent, frontendBase, backendBase);

  // Find existing coverage comment on this PR (update in-place to avoid spam)
  const comments = await githubRequest(
    'GET',
    '/repos/' + repo + '/issues/' + prNumber + '/comments?per_page=100',
  );
  const existing = Array.isArray(comments)
    ? comments.find(function (c) {
        return c.body && c.body.includes(COMMENT_MARKER);
      })
    : null;

  if (existing) {
    await githubRequest('PATCH', '/repos/' + repo + '/issues/comments/' + existing.id, { body });
    console.log('Updated coverage comment #' + existing.id);
  } else {
    const created = await githubRequest(
      'POST',
      '/repos/' + repo + '/issues/' + prNumber + '/comments',
      { body },
    );
    console.log('Created coverage comment #' + created.id);
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
