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
 * Make GitHub API request
 */
function githubRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: 'api.github.com',
      path: path,
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Issue-Hierarchy-Validator',
        ...options.headers
      }
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data || '{}'));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end(options.body);
  });
}

/**
 * Make GitHub GraphQL API request
 */
function githubGraphQL(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const requestOptions = {
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Issue-Hierarchy-Validator',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const parsed = JSON.parse(data || '{}');
          if (parsed.errors) {
            reject(new Error(`GraphQL error: ${JSON.stringify(parsed.errors)}`));
          } else {
            resolve(parsed.data);
          }
        } else {
          reject(new Error(`GitHub GraphQL API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end(body);
  });
}

/**
 * Get issue details including labels and parent via GraphQL (supports native sub-issues)
 */
async function getIssue(issueNumber) {
  try {
    const issue = await githubRequest(`/repos/${OWNER}/${REPO}/issues/${issueNumber}`);

    // Use GraphQL to get native sub-issue parent relationship
    let parentIssue = null;
    try {
      const data = await githubGraphQL(`{
        repository(owner: "${OWNER}", name: "${REPO}") {
          issue(number: ${issueNumber}) {
            parent {
              number
            }
          }
        }
      }`);
      parentIssue = data?.repository?.issue?.parent?.number || null;
    } catch {
      // Fall back to timeline API for older-style connected events
      const timeline = await githubRequest(`/repos/${OWNER}/${REPO}/issues/${issueNumber}/timeline`);
      for (const event of timeline) {
        if (event.event === 'connected' && event.source?.issue) {
          const connectedIssue = event.source.issue;
          if (event.subject?.type === 'issue') {
            parentIssue = connectedIssue.number;
            break;
          }
        }
      }
    }

    return {
      number: issue.number,
      title: issue.title,
      labels: issue.labels.map(l => l.name),
      state: issue.state,
      parent: parentIssue
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
