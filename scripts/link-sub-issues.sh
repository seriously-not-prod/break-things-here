#!/bin/bash

# Link issues as sub-issues using GitHub GraphQL API
#
# Usage: ./link-sub-issues.sh [OPTIONS] <parent-issue-number> <sub-issue-number> [<sub-issue-number> ...]
#
# Options:
#   --check, -c    Check existing relationships without making changes
#   --force, -f    Force link even if already linked (will fail if different parent)
#   --help, -h     Show this help message
#
# Examples:
#   ./link-sub-issues.sh 1 2 3 4           # Link issues #2, #3, #4 as sub-issues of #1
#   ./link-sub-issues.sh --check 1 2 3 4   # Check if issues are already linked
#   ./link-sub-issues.sh 2 5 6             # Link issues #5, #6 as sub-issues of #2
#   ./link-sub-issues.sh 10 15             # Link issue #15 as sub-issue of #10

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Options
CHECK_ONLY=false
FORCE=false

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS] <parent-issue-number> <sub-issue-number> [<sub-issue-number> ...]"
    echo ""
    echo "Options:"
    echo "  --check, -c    Check existing relationships without making changes"
    echo "  --force, -f    Force link even if already linked (will fail if different parent)"
    echo "  --help, -h     Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 1 2 3 4           # Link issues #2, #3, #4 as sub-issues of #1"
    echo "  $0 --check 1 2 3 4   # Check if issues are already linked"
    echo "  $0 2 5 6             # Link issues #5, #6 as sub-issues of #2"
    exit 0
}

# Parse options
while [[ $# -gt 0 ]]; do
    case $1 in
        --check|-c)
            CHECK_ONLY=true
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --help|-h)
            show_help
            ;;
        -*)
            echo -e "${RED}Error: Unknown option $1${NC}"
            show_help
            ;;
        *)
            break
            ;;
    esac
done

# Validate arguments
if [ $# -lt 2 ]; then
    echo -e "${RED}Error: Insufficient arguments${NC}"
    echo ""
    show_help
fi

# Get repository info from git remote
REPO_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REPO_URL" ]; then
    echo -e "${RED}Error: Not in a git repository or no 'origin' remote found${NC}"
    exit 1
fi

# Extract owner and repo name from URL
# Handles both HTTPS and SSH URLs
REPO_OWNER=$(echo "$REPO_URL" | sed -n 's/.*[:/]\([^/]*\)\/[^/]*\.git$/\1/p' | sed 's/.*[:/]\([^/]*\)\/[^/]*/\1/')
REPO_NAME=$(echo "$REPO_URL" | sed -n 's/.*[:/][^/]*\/\([^/]*\)\.git$/\1/p' | sed 's/\.git$//')

if [ -z "$REPO_OWNER" ] || [ -z "$REPO_NAME" ]; then
    echo -e "${RED}Error: Could not determine repository owner and name${NC}"
    echo "Repository URL: $REPO_URL"
    exit 1
fi

echo -e "${GREEN}Repository: ${REPO_OWNER}/${REPO_NAME}${NC}"
echo ""

# Parse arguments
PARENT_ISSUE=$1
shift
SUB_ISSUES=("$@")

echo -e "${YELLOW}Fetching node ID for parent issue #${PARENT_ISSUE}...${NC}"

# Function to get issue node ID
get_issue_node_id() {
    local issue_number=$1
    local node_id=$(gh api graphql -f query="
query {
  repository(owner: \"$REPO_OWNER\", name: \"$REPO_NAME\") {
    issue(number: $issue_number) { id }
  }
}" --jq '.data.repository.issue.id' 2>/dev/null)
    
    if [ -z "$node_id" ]; then
        echo -e "${RED}Error: Could not find issue #${issue_number}${NC}"
        exit 1
    fi
    
    echo "$node_id"
}

# Function to check if issue has a parent and get sub-issues
check_issue_relationships() {
    local issue_number=$1
    local result=$(gh api graphql -f query="
query {
  repository(owner: \"$REPO_OWNER\", name: \"$REPO_NAME\") {
    issue(number: $issue_number) {
      number
      title
      parent {
        number
        title
      }
      subIssues(first: 100) {
        nodes {
          number
          title
        }
      }
    }
  }
}" 2>/dev/null)
    
    echo "$result"
}

# Function to check if a specific sub-issue is already linked
is_already_linked() {
    local parent_num=$1
    local child_num=$2
    
    local result=$(gh api graphql -f query="
query {
  repository(owner: \"$REPO_OWNER\", name: \"$REPO_NAME\") {
    issue(number: $parent_num) {
      subIssues(first: 100) {
        nodes {
          number
        }
      }
    }
  }
}" --jq ".data.repository.issue.subIssues.nodes[] | select(.number == $child_num) | .number" 2>/dev/null)
    
    [ -n "$result" ]
}

# Get parent issue node ID and relationships
PARENT_NODE_ID=$(get_issue_node_id "$PARENT_ISSUE")
echo -e "${GREEN}Parent issue #${PARENT_ISSUE}: ${PARENT_NODE_ID}${NC}"

# Check parent's existing sub-issues
PARENT_INFO=$(check_issue_relationships "$PARENT_ISSUE")
EXISTING_SUBS=$(echo "$PARENT_INFO" | jq -r '.data.repository.issue.subIssues.nodes[]?.number // empty' 2>/dev/null | tr '\n' ' ')

if [ -n "$EXISTING_SUBS" ]; then
    echo -e "${CYAN}Existing sub-issues: ${EXISTING_SUBS}${NC}"
fi
echo ""

# Process each sub-issue
TOTAL=${#SUB_ISSUES[@]}
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIPPED_COUNT=0
ALREADY_LINKED_COUNT=0

for SUB_ISSUE in "${SUB_ISSUES[@]}"; do
    echo -e "${YELLOW}Processing issue #${SUB_ISSUE}...${NC}"
    
    # Get sub-issue node ID and check relationships
    SUB_NODE_ID=$(get_issue_node_id "$SUB_ISSUE")
    echo "  Node ID: ${SUB_NODE_ID}"
    
    # Check if already linked
    if is_already_linked "$PARENT_ISSUE" "$SUB_ISSUE"; then
        echo -e "  ${BLUE}ℹ️  Already linked to parent #${PARENT_ISSUE}${NC}"
        ((ALREADY_LINKED_COUNT++))
        
        if [ "$CHECK_ONLY" = true ]; then
            echo ""
            continue
        fi
        
        if [ "$FORCE" = false ]; then
            echo -e "  ${YELLOW}⏭️  Skipping (use --force to attempt re-link)${NC}"
            ((SKIPPED_COUNT++))
            echo ""
            continue
        fi
    fi
    
    # Check if sub-issue has a different parent
    SUB_INFO=$(check_issue_relationships "$SUB_ISSUE")
    EXISTING_PARENT=$(echo "$SUB_INFO" | jq -r '.data.repository.issue.parent.number // empty' 2>/dev/null)
    
    if [ -n "$EXISTING_PARENT" ] && [ "$EXISTING_PARENT" != "$PARENT_ISSUE" ]; then
        echo -e "  ${RED}⚠️  Already has different parent: #${EXISTING_PARENT}${NC}"
        
        if [ "$CHECK_ONLY" = true ]; then
            echo ""
            continue
        fi
        
        if [ "$FORCE" = false ]; then
            echo -e "  ${YELLOW}⏭️  Skipping (issue can only have one parent)${NC}"
            ((SKIPPED_COUNT++))
            ((FAIL_COUNT++))
            echo ""
            continue
        fi
    fi
    
    # Check-only mode: just display status
    if [ "$CHECK_ONLY" = true ]; then
        if [ -z "$EXISTING_PARENT" ]; then
            echo -e "  ${GREEN}✓ Ready to link${NC}"
        fi
        echo ""
        continue
    fi
    
    # Link as sub-issue
    RESULT=$(gh api graphql -f query="
mutation {
  addSubIssue(input: {issueId: \"$PARENT_NODE_ID\", subIssueId: \"$SUB_NODE_ID\"}) {
    clientMutationId
  }
}" 2>&1)
    
    if [ $? -eq 0 ]; then
        echo -e "  ${GREEN}✅ Successfully linked #${SUB_ISSUE} as sub-issue of #${PARENT_ISSUE}${NC}"
        ((SUCCESS_COUNT++))
    else
        echo -e "  ${RED}❌ Failed to link #${SUB_ISSUE}${NC}"
        echo "  Error: $RESULT"
        ((FAIL_COUNT++))
    fi
    echo ""
done

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$CHECK_ONLY" = true ]; then
    echo -e "${CYAN}Check Summary${NC}"
else
    echo -e "${GREEN}Summary${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total sub-issues processed: $TOTAL"

if [ "$CHECK_ONLY" = true ]; then
    echo -e "${BLUE}Already linked: $ALREADY_LINKED_COUNT${NC}"
    if [ $((TOTAL - ALREADY_LINKED_COUNT)) -gt 0 ]; then
        echo -e "${GREEN}Ready to link: $((TOTAL - ALREADY_LINKED_COUNT))${NC}"
    fi
else
    if [ $SUCCESS_COUNT -gt 0 ]; then
        echo -e "${GREEN}Successfully linked: $SUCCESS_COUNT${NC}"
    fi
    if [ $ALREADY_LINKED_COUNT -gt 0 ]; then
        echo -e "${BLUE}Already linked: $ALREADY_LINKED_COUNT${NC}"
    fi
    if [ $SKIPPED_COUNT -gt 0 ]; then
        echo -e "${YELLOW}Skipped: $SKIPPED_COUNT${NC}"
    fi
    if [ $FAIL_COUNT -gt 0 ]; then
        echo -e "${RED}Failed: $FAIL_COUNT${NC}"
    fi
fi
echo ""

if [ "$CHECK_ONLY" = true ]; then
    echo -e "${CYAN}ℹ️  Check complete. Use without --check to link issues.${NC}"
    exit 0
elif [ $FAIL_COUNT -eq 0 ] && [ $SUCCESS_COUNT -gt 0 ]; then
    echo -e "${GREEN}🎉 All sub-issue relationships created successfully!${NC}"
    exit 0
elif [ $ALREADY_LINKED_COUNT -eq $TOTAL ]; then
    echo -e "${BLUE}ℹ️  All issues already linked.${NC}"
    exit 0
elif [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Some sub-issue relationships failed to create${NC}"
    exit 1
else
    exit 0
fi
