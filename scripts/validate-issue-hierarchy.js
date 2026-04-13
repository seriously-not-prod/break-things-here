#!/usr/bin/env node

/**
 * Issue Hierarchy Validation Script
 * 
 * Validates that issues follow the required parent-child hierarchy:
 * Theme (standalone) → User Story → Task → Sub-Task
 * 
 * Usage:
 *   node validate-issue-hierarchy.js <issue-numbers>
 *   Example: node validate-issue-hierarchy.js 123 456 789
 * 
 * Environment Variables:
 *   GITHUB_TOKEN - GitHub personal access token or GITHUB_TOKEN from Actions
 *   GITHUB_REPOSITORY - Repository in format owner/repo (auto-set in Actions)
 */

const https = require('https');

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'seriously-not-prod/break-things-here';
const [OWNER, REPO] = GITHUB_REPOSITORY.split('/');

/**
 * Make GitHub GraphQL API request
 */
function graphqlRequest(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const requestOptions = {
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Issue-Hierarchy-Validator',
      }
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data || '{}'));
        } else {
          reject(new Error(`GitHub GraphQL error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Label hierarchy rules
const HIERARCHY = {
  'theme': { parent: null, label: 'theme' },
  'user-story': { parent: 'theme', label: 'user-story' },
  'task': { parent: 'user-story', label: 'task' },
  'sub-task': { parent: 'task', label: 'sub-task' }
};

// Labels that don't require parent validation
const STANDALONE_LABELS = ['bug', 'defect', 'security-issue', 'feature-request', 'theme'];

/**
 * Get issue details including labels and parent using GraphQL.
 * Uses `issue.parent` (sub-issues API) which is set by addSubIssue mutations
 * and creates `parent_issue_added` timeline events — not `connected` events.
 */
async function getIssue(issueNumber) {
  try {
    // Query both issue and pullRequest — GitHub uses the same number space for both
    const query = `{
      repository(owner: "${OWNER}", name: "${REPO}") {
        issue(number: ${issueNumber}) {
          number
          title
          state
          labels(first: 20) { nodes { name } }
          parent { number }
        }
        pullRequest(number: ${issueNumber}) {
          number
          title
          state
          merged
        }
      }
    }`;

    const response = await graphqlRequest(query);
    const issue = response?.data?.repository?.issue;
    const pr = response?.data?.repository?.pullRequest;

    // If the number belongs to a PR (not an issue), skip hierarchy validation
    if (!issue && pr) {
      const prState = pr.merged ? 'merged' : pr.state?.toLowerCase();
      return {
        number: pr.number,
        title: pr.title,
        labels: [],
        state: prState || 'closed',
        parent: null,
        isPullRequest: true,
      };
    }

    if (!issue) {
      throw new Error(`Issue #${issueNumber} not found`);
    }

    return {
      number: issue.number,
      title: issue.title,
      labels: issue.labels.nodes.map(l => l.name),
      state: issue.state.toLowerCase(),
      parent: issue.parent?.number ?? null,
      isPullRequest: false,
    };
  } catch (error) {
    throw new Error(`Failed to fetch issue #${issueNumber}: ${error.message}`);
  }
}

/**
 * Validate issue hierarchy
 */
function validateIssueHierarchy(issue, parentIssue) {
  const errors = [];
  const warnings = [];
  
  // Find the hierarchy label
  const hierarchyLabel = issue.labels.find(l => Object.keys(HIERARCHY).includes(l));
  
  if (!hierarchyLabel) {
    // No hierarchy label - might be bug, defect, etc.
    const hasStandaloneLabel = issue.labels.some(l => STANDALONE_LABELS.includes(l));
    if (!hasStandaloneLabel) {
      warnings.push(`Issue #${issue.number} has no hierarchy label (theme, user-story, task, sub-task)`);
    }
    return { valid: true, errors, warnings };
  }
  
  const rules = HIERARCHY[hierarchyLabel];
  
  // Check if issue requires a parent
  if (rules.parent !== null) {
    if (!issue.parent) {
      errors.push(
        `Issue #${issue.number} (${hierarchyLabel}) must be a sub-issue of a ${rules.parent} issue.\n` +
        `  → Create this issue using "Create sub-issue" from the parent ${rules.parent}.`
      );
      return { valid: false, errors, warnings };
    }
    
    // Validate parent has correct label
    if (parentIssue) {
      const parentHasCorrectLabel = parentIssue.labels.includes(rules.parent);
      if (!parentHasCorrectLabel) {
        errors.push(
          `Issue #${issue.number} (${hierarchyLabel}) has parent #${parentIssue.number}, ` +
          `but parent must have label "${rules.parent}". Parent has labels: ${parentIssue.labels.join(', ')}`
        );
        return { valid: false, errors, warnings };
      }
    }
  } else {
    // Theme should not have a parent
    if (issue.parent) {
      warnings.push(
        `Issue #${issue.number} (theme) should be standalone but has parent #${issue.parent}`
      );
    }
  }
  
  return { valid: true, errors, warnings };
}

/**
 * Main validation function
 */
async function validateIssues(issueNumbers) {
  if (!GITHUB_TOKEN) {
    console.error('❌ Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }
  
  console.log('🔍 Validating issue hierarchy...\n');
  console.log(`Repository: ${GITHUB_REPOSITORY}`);
  console.log(`Issues to validate: ${issueNumbers.join(', ')}\n`);
  
  let allValid = true;
  const results = [];
  
  for (const issueNumber of issueNumbers) {
    try {
      console.log(`Checking issue #${issueNumber}...`);
      const issue = await getIssue(issueNumber);
      
      // Skip pull requests — they are not subject to issue hierarchy rules
      if (issue.isPullRequest) {
        console.log(`  ℹ️  #${issueNumber} is a Pull Request — skipping hierarchy check`);
        results.push({ issue, valid: true, errors: [], warnings: ['Is a Pull Request, not an issue'] });
        continue;
      }

      // Check if issue is closed
      if (issue.state === 'closed') {
        console.log(`  ⚠️  Issue #${issueNumber} is closed`);
        results.push({ issue, valid: true, errors: [], warnings: ['Issue is closed'] });
        continue;
      }
      
      // Get parent issue details if exists
      let parentIssue = null;
      if (issue.parent) {
        parentIssue = await getIssue(issue.parent);
      }
      
      // Validate hierarchy
      const validation = validateIssueHierarchy(issue, parentIssue);
      results.push({ issue, ...validation });
      
      if (!validation.valid) {
        allValid = false;
        console.log(`  ❌ FAILED`);
        validation.errors.forEach(err => console.log(`     ${err}`));
      } else {
        console.log(`  ✅ Valid`);
      }
      
      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warn => console.log(`  ⚠️  ${warn}`));
      }
      
      console.log('');
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}\n`);
      allValid = false;
      results.push({ 
        issue: { number: issueNumber }, 
        valid: false, 
        errors: [error.message],
        warnings: []
      });
    }
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Summary:');
  console.log('═══════════════════════════════════════════════════════════');
  
  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.filter(r => !r.valid).length;
  
  console.log(`✅ Valid issues: ${validCount}`);
  console.log(`❌ Invalid issues: ${invalidCount}`);
  
  if (!allValid) {
    console.log('\n❌ Validation failed! Issues do not follow proper hierarchy.\n');
    console.log('Required hierarchy:');
    console.log('  Theme (standalone)');
    console.log('  └── User Story (sub-issue of Theme)');
    console.log('      └── Task (sub-issue of User Story)');
    console.log('          └── Sub-Task (sub-issue of Task)\n');
    console.log('How to fix:');
    console.log('  1. Navigate to the parent issue');
    console.log('  2. Click "Create sub-issue" at the bottom');
    console.log('  3. Or click dropdown → "Add existing issue"\n');
    process.exit(1);
  } else {
    console.log('\n✅ All issues follow proper hierarchy!\n');
    process.exit(0);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node validate-issue-hierarchy.js <issue-numbers>');
  console.error('Example: node validate-issue-hierarchy.js 123 456 789');
  process.exit(1);
}

const issueNumbers = args.map(arg => parseInt(arg, 10)).filter(n => !isNaN(n));

if (issueNumbers.length === 0) {
  console.error('Error: No valid issue numbers provided');
  process.exit(1);
}

// Run validation
validateIssues(issueNumbers).catch(error => {
  console.error(`\n❌ Unexpected error: ${error.message}`);
  process.exit(1);
});
