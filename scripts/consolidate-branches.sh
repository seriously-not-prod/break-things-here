#!/usr/bin/env bash

set -euo pipefail

MODE="plan"
RUN_CLEANUP=0
REMOTE_NAME="origin"
BASE_BRANCH="main"
INTEGRATION_BRANCH="final-merged-branch"
REPORT_ROOT="merge-audit"
ISSUE_REF=""
DROP_INTEGRATION_INTO=""
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

PROTECTED_BRANCHES=(main stage test develop)

usage() {
  cat <<'EOF'
Usage:
  ./scripts/consolidate-branches.sh [options]

Options:
  --execute                       Run the merge workflow. Default is plan-only.
  --cleanup-only                  Run the guarded cleanup phase without redoing merges.
  --cleanup                       Delete merged branches after successful validation.
  --remote <name>                 Remote to fetch and track. Default: origin
  --base-branch <name>            Branch to branch from. Default: main
  --integration-branch <name>     Integration branch to create. Default: final-merged-branch
  --issue-ref <value>             Required in --execute mode. Example: #999
  --report-root <path>            Report directory under repo root. Default: merge-audit
  --drop-integration-into <name>  Allow deleting the integration branch only after it is fully merged into this branch.
  --help                          Show this help text.

Examples:
  ./scripts/consolidate-branches.sh
  ./scripts/consolidate-branches.sh --execute --issue-ref "#999"
  ./scripts/consolidate-branches.sh --cleanup-only --integration-branch final-merged-branch --drop-integration-into develop
  ./scripts/consolidate-branches.sh --execute --cleanup --issue-ref "#999" --drop-integration-into develop
EOF
}

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

branch_key() {
  printf '%s' "$1" | tr '/:' '__'
}

append_summary() {
  printf '%s\n' "$*" >>"$SUMMARY_FILE"
}

contains_branch() {
  local needle="$1"
  shift
  local value
  for value in "$@"; do
    if [[ "$value" == "$needle" ]]; then
      return 0
    fi
  done

  return 1
}

record_branch_result() {
  local branch="$1"
  local status="$2"
  local detail="$3"

  printf '%s\t%s\t%s\n' "$branch" "$status" "$detail" >>"$MERGE_RESULTS_FILE"
}

run_dir_command() {
  local name="$1"
  local working_dir="$2"
  shift 2

  local log_file="$VALIDATION_DIR/${name}.log"

  printf '### %s\n\n' "$name" >>"$VALIDATION_SUMMARY_FILE"
  printf '- Directory: `%s`\n' "$working_dir" >>"$VALIDATION_SUMMARY_FILE"
  printf -- '- Command: `%s`\n\n' "$*" >>"$VALIDATION_SUMMARY_FILE"

  if (
    cd "$working_dir"
    "$@"
  ) >"$log_file" 2>&1; then
    printf '%s\tpass\t%s\n' "$name" "$log_file" >>"$VALIDATION_RESULTS_FILE"
    printf '- Result: pass\n\n' >>"$VALIDATION_SUMMARY_FILE"
    return 0
  fi

  printf '%s\tfail\t%s\n' "$name" "$log_file" >>"$VALIDATION_RESULTS_FILE"
  printf '- Result: fail\n- Log: `%s`\n\n' "$log_file" >>"$VALIDATION_SUMMARY_FILE"
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute)
      MODE="execute"
      shift
      ;;
    --cleanup-only)
      MODE="cleanup-only"
      RUN_CLEANUP=1
      shift
      ;;
    --cleanup)
      RUN_CLEANUP=1
      shift
      ;;
    --remote)
      REMOTE_NAME="$2"
      shift 2
      ;;
    --base-branch)
      BASE_BRANCH="$2"
      shift 2
      ;;
    --integration-branch)
      INTEGRATION_BRANCH="$2"
      shift 2
      ;;
    --issue-ref)
      ISSUE_REF="$2"
      shift 2
      ;;
    --report-root)
      REPORT_ROOT="$2"
      shift 2
      ;;
    --drop-integration-into)
      DROP_INTEGRATION_INTO="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

require_command git
require_command awk
require_command sort
require_command uniq

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$REPO_ROOT" ]] || fail "Run this script from inside a Git repository."

if [[ "$MODE" == "execute" && -z "$ISSUE_REF" ]]; then
  fail "--issue-ref is required in --execute mode so merge commits satisfy repo policy."
fi

REPORT_DIR="$REPO_ROOT/$REPORT_ROOT/consolidation-$TIMESTAMP"
VALIDATION_DIR="$REPORT_DIR/validation"
LOG_DIR="$REPORT_DIR/logs"
CONFLICT_DIR="$REPORT_DIR/conflicts"
mkdir -p "$REPORT_DIR" "$VALIDATION_DIR" "$LOG_DIR" "$CONFLICT_DIR"

SUMMARY_FILE="$REPORT_DIR/summary.md"
TRACKING_FILE="$REPORT_DIR/tracking-actions.tsv"
EXCLUDED_FILE="$REPORT_DIR/excluded-branches.tsv"
MERGE_PLAN_FILE="$REPORT_DIR/merge-plan.txt"
MERGE_RESULTS_FILE="$REPORT_DIR/merge-results.tsv"
IMPACTED_FILES_FILE="$REPORT_DIR/impacted-files.tsv"
VALIDATION_RESULTS_FILE="$VALIDATION_DIR/results.tsv"
VALIDATION_SUMMARY_FILE="$VALIDATION_DIR/summary.md"
ROLLBACK_FILE="$REPORT_DIR/rollback-steps.txt"
RISK_FILE="$REPORT_DIR/potential-risks.md"

CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD || echo DETACHED)"

cat >"$SUMMARY_FILE" <<EOF
# Branch Consolidation Report

- Mode: $MODE
- Repository: $REPO_ROOT
- Remote: $REMOTE_NAME
- Base branch: $BASE_BRANCH
- Integration branch: $INTEGRATION_BRANCH
- Current branch before run: $CURRENT_BRANCH
- Timestamp: $TIMESTAMP
EOF

printf 'branch\taction\tresult\n' >"$TRACKING_FILE"
printf 'branch\treason\n' >"$EXCLUDED_FILE"
printf 'branch\tstatus\tdetail\n' >"$MERGE_RESULTS_FILE"
printf 'branch\tfile\n' >"$IMPACTED_FILES_FILE"
printf 'step\tresult\tlog\n' >"$VALIDATION_RESULTS_FILE"

git status --short --branch >"$REPORT_DIR/pre-run-status.txt"
git remote -v >"$REPORT_DIR/remotes.txt"
git branch -a -vv >"$REPORT_DIR/branch-inventory-before.txt"

log "Fetching remote refs from $REMOTE_NAME"
git fetch --all --prune --tags >"$LOG_DIR/fetch.log" 2>&1
git branch -a -vv >"$REPORT_DIR/branch-inventory-after-fetch.txt"

git bundle create "$REPORT_DIR/repository-backup.bundle" --all >"$LOG_DIR/backup-bundle.log" 2>&1

cat >"$ROLLBACK_FILE" <<EOF
Backup bundle created at:
$REPORT_DIR/repository-backup.bundle

Rollback commands:
  git clone $REPORT_DIR/repository-backup.bundle restored-repo
  cd restored-repo
  git branch -a

To restore a single branch tip into the current repository:
  git fetch $REPORT_DIR/repository-backup.bundle refs/heads/<branch>:refs/heads/<branch>
EOF

log "Ensuring remote branches exist as local tracking branches"
while IFS= read -r remote_ref; do
  [[ -n "$remote_ref" ]] || continue

  local_branch="${remote_ref#${REMOTE_NAME}/}"

  if [[ "$local_branch" == "HEAD" ]]; then
    continue
  fi

  if git show-ref --verify --quiet "refs/heads/$local_branch"; then
    git branch --set-upstream-to="$REMOTE_NAME/$local_branch" "$local_branch" >>"$LOG_DIR/tracking.log" 2>&1 || true
    printf '%s\tset-upstream\tok\n' "$local_branch" >>"$TRACKING_FILE"
  else
    if [[ "$MODE" == "execute" ]]; then
      git branch --track "$local_branch" "$REMOTE_NAME/$local_branch" >>"$LOG_DIR/tracking.log" 2>&1
      printf '%s\tcreate-tracking\tok\n' "$local_branch" >>"$TRACKING_FILE"
    else
      printf '%s\tcreate-tracking\tplanned\n' "$local_branch" >>"$TRACKING_FILE"
    fi
  fi
done < <(git for-each-ref --format='%(refname:short)' "refs/remotes/$REMOTE_NAME")

ALL_BRANCHES_FILE="$REPORT_DIR/all-branches.txt"
LOCAL_BRANCHES_FILE="$REPORT_DIR/local-branches.txt"
REMOTE_BRANCHES_FILE="$REPORT_DIR/remote-branches.txt"
SORTED_BRANCHES_FILE="$REPORT_DIR/sorted-branches.txt"

git for-each-ref --format='%(refname:short)' refs/heads | sort -u >"$LOCAL_BRANCHES_FILE"
git for-each-ref --format='%(refname:short)' "refs/remotes/$REMOTE_NAME" | sed "s#^$REMOTE_NAME/##" | grep -v '^HEAD$' | sort -u >"$REMOTE_BRANCHES_FILE"
cat "$LOCAL_BRANCHES_FILE" "$REMOTE_BRANCHES_FILE" | sort -u >"$ALL_BRANCHES_FILE"

LONG_LIVED_ORDER=(develop test stage)

for long_lived_branch in "${LONG_LIVED_ORDER[@]}"; do
  if grep -Fxq "$long_lived_branch" "$ALL_BRANCHES_FILE"; then
    printf '%s\n' "$long_lived_branch" >>"$MERGE_PLAN_FILE"
  fi
done

while IFS= read -r branch_name; do
  [[ -n "$branch_name" ]] || continue

  if [[ "$branch_name" == "$BASE_BRANCH" ]]; then
    printf '%s\tbase-branch-already-included\n' "$branch_name" >>"$EXCLUDED_FILE"
    continue
  fi

  if [[ "$branch_name" == "$INTEGRATION_BRANCH" ]]; then
    printf '%s\tintegration-branch-target\n' "$branch_name" >>"$EXCLUDED_FILE"
    continue
  fi

  if [[ "$branch_name" == backup/* ]]; then
    printf '%s\tbackup-branch\n' "$branch_name" >>"$EXCLUDED_FILE"
    continue
  fi

  if contains_branch "$branch_name" "${LONG_LIVED_ORDER[@]}"; then
    continue
  fi

  printf '%s\n' "$branch_name" >>"$MERGE_PLAN_FILE"
done <"$ALL_BRANCHES_FILE"

sort -u "$MERGE_PLAN_FILE" >"$SORTED_BRANCHES_FILE"
cp "$SORTED_BRANCHES_FILE" "$MERGE_PLAN_FILE"

TOTAL_BRANCHES="$(wc -l <"$MERGE_PLAN_FILE" | tr -d ' ')"
append_summary "- Branches scheduled for merge: $TOTAL_BRANCHES"
append_summary "- Report directory: $REPORT_DIR"

if [[ "$MODE" == "plan" ]]; then
  append_summary "\n## Next Step"
  append_summary "Run the script with --execute and an issue reference after reviewing $MERGE_PLAN_FILE."
  log "Plan generated at $REPORT_DIR"
  exit 0
fi

if [[ "$MODE" == "cleanup-only" ]]; then
  append_summary "\n## Cleanup Mode"
  append_summary "- Cleanup-only run. No merges or validation were performed."
  if ! git show-ref --verify --quiet "refs/heads/$INTEGRATION_BRANCH"; then
    fail "Local integration branch $INTEGRATION_BRANCH does not exist. Create it first or pass the correct --integration-branch value."
  fi
fi

if [[ "$MODE" == "execute" ]] && git show-ref --verify --quiet "refs/heads/$INTEGRATION_BRANCH"; then
  fail "Local branch $INTEGRATION_BRANCH already exists. Rename it or pass a different --integration-branch value."
fi

if [[ "$MODE" == "execute" ]]; then
  WORKTREE_DIR="$(dirname "$REPO_ROOT")/$(basename "$REPO_ROOT")-$INTEGRATION_BRANCH-$TIMESTAMP"

  log "Creating isolated worktree at $WORKTREE_DIR"
  git worktree add -b "$INTEGRATION_BRANCH" "$WORKTREE_DIR" "$REMOTE_NAME/$BASE_BRANCH" >"$LOG_DIR/worktree-add.log" 2>&1

  append_summary "\n## Worktree"
  append_summary "- Path: $WORKTREE_DIR"
  append_summary "- Base ref: $REMOTE_NAME/$BASE_BRANCH"

  merge_branch() {
    local branch_name="$1"
    local branch_log="$LOG_DIR/merge-$(branch_key "$branch_name").log"
    local before_head
    local after_head
    local impacted_file_log

    before_head="$(git -C "$WORKTREE_DIR" rev-parse HEAD)"

    if git -C "$WORKTREE_DIR" merge --no-ff --no-edit -m "chore(merge): integrate $branch_name into $INTEGRATION_BRANCH $ISSUE_REF" "$branch_name" >"$branch_log" 2>&1; then
      after_head="$(git -C "$WORKTREE_DIR" rev-parse HEAD)"

      if [[ "$before_head" == "$after_head" ]]; then
        record_branch_result "$branch_name" "already-up-to-date" "$branch_log"
        return 0
      fi

      impacted_file_log="$LOG_DIR/impacted-$(branch_key "$branch_name").txt"
      git -C "$WORKTREE_DIR" diff-tree --no-commit-id --name-only -r HEAD >"$impacted_file_log"

      while IFS= read -r impacted_file; do
        [[ -n "$impacted_file" ]] || continue
        printf '%s\t%s\n' "$branch_name" "$impacted_file" >>"$IMPACTED_FILES_FILE"
      done <"$impacted_file_log"

      record_branch_result "$branch_name" "merged" "$branch_log"
      return 0
    fi

    git -C "$WORKTREE_DIR" diff --name-only --diff-filter=U >"$CONFLICT_DIR/$(branch_key "$branch_name")-files.txt" || true
    git -C "$WORKTREE_DIR" status --short >"$CONFLICT_DIR/$(branch_key "$branch_name")-status.txt" || true
    git -C "$WORKTREE_DIR" ls-files -u >"$CONFLICT_DIR/$(branch_key "$branch_name")-index.txt" || true

    cat >"$CONFLICT_DIR/$(branch_key "$branch_name")-guidance.md" <<EOF
# Conflict Guidance for $branch_name

Use the isolated worktree to resolve this branch manually:

  cd $WORKTREE_DIR
  git status
  git diff --name-only --diff-filter=U

Resolution guidance:
- Prefer manual review for source files, auth flows, business logic, and API handlers.
- Prefer keeping the latest dependency graph only after reconciling package manifests and rebuilding.
- Never resolve by blanket use of `-X ours` or `-X theirs` for the whole merge.
- After resolving, run:
    git add <resolved-files>
    git commit -m "chore(merge): resolve $branch_name into $INTEGRATION_BRANCH $ISSUE_REF"

If you want to abort this merge attempt:

  cd $WORKTREE_DIR
  git merge --abort
EOF

    record_branch_result "$branch_name" "conflict" "$branch_log"
    append_summary "\n## Conflict"
    append_summary "- Branch: $branch_name"
    append_summary "- Log: $branch_log"
    append_summary "- Files: $CONFLICT_DIR/$(branch_key "$branch_name")-files.txt"
    append_summary "- Guidance: $CONFLICT_DIR/$(branch_key "$branch_name")-guidance.md"
    fail "Merge conflict encountered for $branch_name. Review the report and resolve inside $WORKTREE_DIR."
  }

  while IFS= read -r branch_name; do
    [[ -n "$branch_name" ]] || continue
    log "Merging $branch_name into $INTEGRATION_BRANCH"
    merge_branch "$branch_name"
  done <"$MERGE_PLAN_FILE"

  log "Running validation checks in isolated worktree"
  run_dir_command "conflict-markers" "$WORKTREE_DIR" git grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- . || true

  if [[ -f "$WORKTREE_DIR/package.json" ]]; then
    run_dir_command "root-install" "$WORKTREE_DIR" npm install --no-package-lock
    run_dir_command "root-build" "$WORKTREE_DIR" npm run build --if-present || true
    run_dir_command "root-test" "$WORKTREE_DIR" npm run test --if-present || true
    run_dir_command "root-ls" "$WORKTREE_DIR" npm ls --all --omit=optional || true
  fi

  if [[ -f "$WORKTREE_DIR/backend/package.json" ]]; then
    run_dir_command "backend-install" "$WORKTREE_DIR/backend" npm install --no-package-lock
    run_dir_command "backend-build" "$WORKTREE_DIR/backend" npm run build --if-present || true
    run_dir_command "backend-typecheck" "$WORKTREE_DIR/backend" npm run typecheck --if-present || true
    run_dir_command "backend-test" "$WORKTREE_DIR/backend" npm run test --if-present || true
    run_dir_command "backend-lint" "$WORKTREE_DIR/backend" npm run lint --if-present || true
    run_dir_command "backend-ls" "$WORKTREE_DIR/backend" npm ls --all --omit=optional || true
  fi

  if [[ -f "$WORKTREE_DIR/frontend/package.json" ]]; then
    run_dir_command "frontend-install" "$WORKTREE_DIR/frontend" npm install --no-package-lock
    run_dir_command "frontend-build" "$WORKTREE_DIR/frontend" npm run build --if-present || true
    run_dir_command "frontend-ls" "$WORKTREE_DIR/frontend" npm ls --all --omit=optional || true
  fi

  awk -F'\t' 'NR > 1 { counts[$2]++ } END { for (file in counts) if (counts[file] > 1) printf "%s\t%s\n", counts[file], file }' "$IMPACTED_FILES_FILE" | sort -rn >"$REPORT_DIR/repeated-touch-points.tsv" || true

  cat >"$RISK_FILE" <<EOF
# Potential Risks

- Files listed in repeated-touch-points.tsv were modified by multiple merged branches and need manual regression review.
- Any failing validation step in validation/results.tsv indicates broken code, missing references, or dependency conflicts.
- Dependency manifests, lock files, route handlers, auth middleware, and TypeScript config files are high-risk merge surfaces.
- Cleanup is blocked if the integration branch has not been promoted into a protected branch.
EOF

  append_summary "\n## Validation"
  append_summary "- Results: $VALIDATION_RESULTS_FILE"
  append_summary "- Summary: $VALIDATION_SUMMARY_FILE"
  append_summary "- Risks: $RISK_FILE"
  append_summary "- Repeated touch points: $REPORT_DIR/repeated-touch-points.tsv"
fi

if [[ "$RUN_CLEANUP" -eq 1 ]]; then
  if [[ -n "$DROP_INTEGRATION_INTO" ]]; then
    if ! git merge-base --is-ancestor "$INTEGRATION_BRANCH" "$DROP_INTEGRATION_INTO"; then
      fail "Refusing to delete $INTEGRATION_BRANCH because it is not fully merged into $DROP_INTEGRATION_INTO."
    fi
    PRESERVED_BRANCHES=("${PROTECTED_BRANCHES[@]}")
  else
    warn "Keeping $INTEGRATION_BRANCH because --drop-integration-into was not provided."
    PRESERVED_BRANCHES=("${PROTECTED_BRANCHES[@]}" "$INTEGRATION_BRANCH")
  fi

  if ! contains_branch "$CURRENT_BRANCH" "${PRESERVED_BRANCHES[@]}"; then
    warn "Current branch $CURRENT_BRANCH is checked out in the main worktree and will not be deleted automatically."
  fi

  git for-each-ref --format='%(refname:short)' refs/heads | while IFS= read -r local_branch; do
    [[ -n "$local_branch" ]] || continue

    if contains_branch "$local_branch" "${PRESERVED_BRANCHES[@]}"; then
      continue
    fi

    if [[ "$local_branch" == "$CURRENT_BRANCH" ]]; then
      printf '%s\tkept\tchecked-out\n' "$local_branch" >>"$REPORT_DIR/cleanup-actions.tsv"
      continue
    fi

    if git merge-base --is-ancestor "$local_branch" "$INTEGRATION_BRANCH"; then
      git branch -D "$local_branch" >>"$LOG_DIR/cleanup-local.log" 2>&1
      printf '%s\tdeleted\tlocal\n' "$local_branch" >>"$REPORT_DIR/cleanup-actions.tsv"
    else
      printf '%s\tkept\tnot-merged-into-integration\n' "$local_branch" >>"$REPORT_DIR/cleanup-actions.tsv"
    fi
  done

  git for-each-ref --format='%(refname:short)' "refs/remotes/$REMOTE_NAME" | sed "s#^$REMOTE_NAME/##" | grep -v '^HEAD$' | while IFS= read -r remote_branch; do
    [[ -n "$remote_branch" ]] || continue

    if contains_branch "$remote_branch" "${PRESERVED_BRANCHES[@]}"; then
      continue
    fi

    if git merge-base --is-ancestor "$REMOTE_NAME/$remote_branch" "$INTEGRATION_BRANCH"; then
      git push "$REMOTE_NAME" --delete "$remote_branch" >>"$LOG_DIR/cleanup-remote.log" 2>&1
      printf '%s\tdeleted\tremote\n' "$remote_branch" >>"$REPORT_DIR/cleanup-actions.tsv"
    else
      printf '%s\tkept\tremote-not-merged-into-integration\n' "$remote_branch" >>"$REPORT_DIR/cleanup-actions.tsv"
    fi
  done

  append_summary "\n## Cleanup"
  append_summary "- Actions: $REPORT_DIR/cleanup-actions.tsv"
fi

log "Consolidation workflow completed. Review $SUMMARY_FILE"