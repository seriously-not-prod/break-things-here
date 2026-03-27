#!/bin/bash
#
# Setup script for git hooks
# This script installs the git hooks from .git-hooks/ to .git/hooks/
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Git Hooks Setup ===${NC}"
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}ERROR: Not a git repository!${NC}"
    echo "Please run this script from the repository root."
    exit 1
fi

# Check if .git-hooks directory exists
if [ ! -d ".git-hooks" ]; then
    echo -e "${RED}ERROR: .git-hooks directory not found!${NC}"
    exit 1
fi

# Create .git/hooks directory if it doesn't exist
mkdir -p .git/hooks

# Install commit-msg hook
if [ -f ".git-hooks/commit-msg" ]; then
    cp .git-hooks/commit-msg .git/hooks/commit-msg
    chmod +x .git/hooks/commit-msg
    echo -e "${GREEN}✓${NC} Installed commit-msg hook"
else
    echo -e "${YELLOW}⚠${NC} commit-msg hook not found in .git-hooks/"
fi

# Count installed hooks
installed_count=0
if [ -x ".git/hooks/commit-msg" ]; then
    ((installed_count++))
fi

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo "Installed $installed_count hook(s)"
echo ""
echo "The following validations are now active:"
echo "  • Commit messages must reference a GitHub issue (#123)"
echo "  • Conventional Commits format enforced"
echo "  • Subject line length checked (≤72 chars)"
echo "  • Imperative mood validated"
echo "  • No trailing period in subject"
echo ""
echo -e "${BLUE}To bypass hooks (not recommended):${NC}"
echo "  git commit --no-verify -m \"message\""
echo ""
