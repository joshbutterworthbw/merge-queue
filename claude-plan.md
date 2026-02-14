# GitHub Merge Queue Implementation Plan

## Overview

Build a TypeScript-based GitHub merge queue utility as a **standalone reusable repository** that automatically validates and merges approved PRs sequentially, replacing the current manual "merge-flag" label system. The merge-queue monitors PRs labeled with "ready", validates they meet all requirements (approved, checks passing, not behind master), and merges them sequentially. The merge-queue repo will provide custom GitHub Actions that can be referenced from any repository. Each repo will have its own independent queue, and new repositories can be added without any changes to the merge-queue repo itself.

### Key Design Decision: Trust Existing PR Tests + Auto-Update

**The merge queue does NOT create test branches.** Instead, it validates and updates:
1. The PR's own tests have already passed
2. If PR branch is behind master: automatically update it (merge master into PR)
3. GitHub automatically re-runs tests after the update
4. The PR has required approvals

**Benefits:**
- **Simpler**: No test branch creation or management
- **Better UX**: Engineers don't need to manually update branches
- **Reliable**: Tests run in the same environment as regular PRs
- **Transparent**: Updates visible in PR history

**How it works:** If master changes while PR is in queue, the queue automatically merges master into the PR branch. GitHub detects the new commit and re-runs tests. The queue waits for tests to pass before merging.

### Multi-Repository Architecture (Self-Service)

- **merge-queue repo**: Contains all TypeScript actions and core logic (standalone utility)
  - **No changes needed when adding new repos** - fully self-service
  - State files are dynamically created based on repo name
  - Actions work with any repository via inputs

- **Target repos** (any repo that wants to use the queue):
  - Add 3 minimal workflow files that reference merge-queue actions
  - Pass repo identification via workflow inputs
  - Each repo gets its own independent queue
  - State stored as `{owner}-{repo}-queue.json` in merge-queue's `merge-queue-state` branch

**Example target repos:**
- bloomandwild
- bloomandwild-frontend
- any-other-repo (just add the 3 workflow files)

## Architecture

### Core Components

1. **Queue Manager Workflow** (`queue-manager.yml`)
   - Runs every 5 minutes via cron + on push to master
   - Processes one PR at a time (sequential, not parallel)
   - Validates PR status and merges when conditions are met

2. **Queue Entry Workflow** (`queue-entry.yml`)
   - Triggered when "ready" label is added
   - Validates PR (approved, checks passing, not behind master)
   - Adds PR to queue state

3. **Queue State Storage**
   - JSON file stored in `merge-queue-state` branch
   - Tracks current PR being processed, queue, and history
   - Atomic updates using Git force-with-lease

4. **TypeScript Actions** (3 custom actions)
   - `add-to-queue`: Validates and adds PR to queue
   - `process-queue`: Main queue processor logic
   - `remove-from-queue`: Removes PR from queue

### Queue Flow

```
PR labeled "ready"
  → Validate (approved, checks passing)
  → Add to queue in order
  → Queue manager picks next PR
  → Re-validate conditions still met
  → If branch behind master: Update branch (merge master into PR)
  → Wait for tests to complete (triggered by branch update)
  → If tests pass: Merge PR via GitHub API
  → Process next PR in queue
  → On validation failure: Remove from queue, notify author
```

## Repository Setup Requirements

### merge-queue Must Be a GitHub Repository

For target repos to reference the actions, merge-queue **must** be published as a GitHub repository:

**Options:**
1. **Private GitHub repo** (recommended for organization)
   - Create repo: `github.com/yourorg/merge-queue`
   - Target repos can reference: `uses: yourorg/merge-queue@v1/src/actions/add-to-queue`
   - Requires target repos to have access (same org or granted access)

2. **Public GitHub repo**
   - Same syntax but accessible to anyone
   - Good for open-source or sharing across organizations

**Publishing Process:**
1. Initialize local merge-queue as git repo
2. Push to GitHub: `git remote add origin git@github.com:yourorg/merge-queue.git`
3. Tag releases: `git tag v1.0.0 && git push --tags`
4. Target repos reference tagged versions

**Alternative for Local Development:**
- During development, use relative path: `uses: ./.github/actions/merge-queue`
- Or use `act` to test locally before pushing
- Final deployment requires GitHub repo

## Key Technical Decisions

### 1. State Storage: Git Branch
Store queue as JSON in dedicated `merge-queue-state` branch instead of external DB or GitHub Issues.
- **Pros**: No dependencies, versioned, atomic updates, persistent
- **Cons**: Requires careful concurrency handling

### 2. Sequential Processing
Process one PR at a time with GitHub Actions concurrency controls.
- Prevents race conditions
- Ensures each PR tested against true latest master
- Simpler error handling

### 3. PR Status Validation & Auto-Update
Validate existing PR checks and automatically update branches when behind master.
- Trusts existing test results from PR's own workflow runs
- Checks all required status checks are passing
- If branch is behind master: automatically merge master into PR branch
- GitHub automatically re-runs tests after branch update
- Wait for tests to complete before merging
- If tests fail after update: remove from queue with failure notice
- Engineer can fix issues and re-add "ready" label to re-queue

### 4. Queue Entry Validation
Strict validation before adding to queue and before merging:
- Has "ready" label
- ≥1 approval, no "changes-requested"
- Not in draft state
- All required checks passing
- Branch is not behind master (up-to-date)
- No merge conflicts

### 5. Merge Strategy
Use GitHub API merge with squash (configurable).
- Preserves PR metadata
- Configurable merge method
- Triggers existing post-merge workflows

## Implementation Phases

### Phase 1: Project Setup & Core Modules (Est: First)
- Initialize TypeScript project structure in `/merge-queue/`
- Initialize as Git repository and prepare for GitHub
- Setup package.json, tsconfig.json, build pipeline
- Create core modules:
  - `queue-state.ts`: CRUD operations for queue state (multi-repo aware, dynamic file naming)
  - `github-api.ts`: GitHub API wrapper using Octokit (cross-repo)
  - `types/queue.ts`: TypeScript interfaces
- Initialize empty `merge-queue-state` branch (state files auto-created on first use)
- Write unit tests
- Push to GitHub and create initial release tag (v0.1.0)

### Phase 2: Queue Entry/Exit (Est: Second)
- Build `add-to-queue` action with PR validation
- Build `remove-from-queue` action
- Create `queue-entry.yml` workflow (label trigger)
- Create `queue-remove.yml` workflow (label removal/PR close)
- Implement PR comments for queue status
- Add queue-related labels

### Phase 3: Queue Processor (Est: Third)
- Build `pr-validator.ts` module
  - Check PR approval status
  - Verify all required checks are passing
  - Check if branch is behind master
  - Validate no merge conflicts
- Build `branch-updater.ts` module
  - Merge master into PR branch when behind
  - Detect merge conflicts during update
  - Wait for status checks after update
  - Poll test completion with timeout
- Build `process-queue` action
  - Fetch next PR from queue
  - Re-validate all conditions
  - Update branch if behind master
  - Wait for tests if branch was updated
  - Merge via GitHub API if tests pass
  - Handle validation failures
- Create `queue-manager.yml` workflow
  - Cron trigger (every 5 min)
  - Push to master trigger
  - Concurrency controls

### Phase 4: Merge Logic & Error Handling (Est: Fourth)
- Build `merger.ts` module
  - Pre-merge validation
  - Execute merge via API
  - Verify success
- Implement failure handling
  - Checks no longer passing → remove + notify
  - Tests fail after branch update → remove + notify
  - Merge conflicts during update → remove + notify to resolve manually
  - Transient API failures → retry with backoff
  - Timeout waiting for tests → remove + notify
- Post-merge cleanup (labels, comments)

### Phase 5: Configuration & Documentation (Est: Fifth)
- Create `config/merge-queue-config.yml`
  - Queue behavior settings
  - Entry requirements
  - Test/merge configuration
- Write comprehensive README
- Create architecture documentation
- Add inline code documentation

### Phase 6: Target Repository Setup & Documentation (Est: Sixth)
- Create **template workflow files** for target repos:
  - `merge-queue-manager.yml` (cron + push trigger)
  - `merge-queue-entry.yml` (label trigger)
  - `merge-queue-remove.yml` (remove trigger)
- Document setup process in README
- Create example setup for bloomandwild (first test repo)
- Verify auto-creation of state files
- Test cross-repo action references
- Document PAT/secret configuration

### Phase 7: Testing & Validation (Est: Seventh)
- Unit tests for all modules
- Integration tests with real PRs in both repos
- Edge case testing
  - PR closed while testing
  - Master updated during test
  - State corruption scenarios
  - Both queues running simultaneously
- Manual validation checklist

## File Structure

### merge-queue Repository (Standalone Utility)

```
/Users/josh.butterworth/Documents/src/merge-queue/
├── .github/workflows/
│   ├── build-and-test.yml         # CI for merge-queue repo itself
│   └── release.yml                # Tag releases for actions
├── src/
│   ├── core/
│   │   ├── queue-state.ts         # Queue state CRUD (multi-repo aware)
│   │   ├── github-api.ts          # GitHub API wrapper
│   │   ├── pr-validator.ts        # PR status validation logic
│   │   ├── branch-updater.ts      # Auto-update PR branch with master
│   │   └── merger.ts              # Merge logic
│   ├── actions/
│   │   ├── add-to-queue/
│   │   │   ├── action.yml         # Reusable action
│   │   │   ├── index.ts
│   │   │   └── package.json
│   │   ├── process-queue/
│   │   │   ├── action.yml         # Reusable action
│   │   │   ├── index.ts
│   │   │   └── package.json
│   │   └── remove-from-queue/
│   │       ├── action.yml         # Reusable action
│   │       ├── index.ts
│   │       └── package.json
│   ├── utils/
│   │   ├── logger.ts              # Structured logging
│   │   ├── constants.ts           # Configuration constants
│   │   └── errors.ts              # Custom error types
│   └── types/
│       └── queue.ts               # TypeScript interfaces
├── scripts/
│   ├── build.sh                   # Build all actions
│   └── setup.sh                   # Initialize queue branch for a repo
├── package.json
├── tsconfig.json
├── .nvmrc                         # Node 20.x
└── README.md
```

### Target Repository Integration

#### bloomandwild Repository

```
/Users/josh.butterworth/Documents/src/bloomandwild/
└── .github/workflows/
    ├── merge-queue-manager.yml    # Triggers process-queue action
    ├── merge-queue-entry.yml      # Triggers add-to-queue action (label)
    └── merge-queue-remove.yml     # Triggers remove-from-queue action

    # These workflows call actions from merge-queue repo:
    # uses: josh.butterworth/merge-queue@v1/src/actions/add-to-queue
```

#### bloomandwild-frontend Repository

```
/Users/josh.butterworth/Documents/src/bloomandwild-frontend/
└── .github/workflows/
    ├── merge-queue-manager.yml    # Triggers process-queue action
    ├── merge-queue-entry.yml      # Triggers add-to-queue action (label)
    └── merge-queue-remove.yml     # Triggers remove-from-queue action

    # These workflows call actions from merge-queue repo:
    # uses: josh.butterworth/merge-queue@v1/src/actions/add-to-queue
```

### Queue State Storage (in merge-queue repo)

State files are **automatically created** when a new repository first uses the queue. No manual setup required.

```
merge-queue-state branch:
├── {owner}-{repo}-queue.json      # Dynamically named per repository
├── bloomandwild-bloomandwild-queue.json
├── bloomandwild-frontend-queue.json
└── bloomandwild-any-other-repo-queue.json
```

Naming pattern: `{github-owner}-{repo-name}-queue.json`

## Queue State Schema

Each repository has its own state file in the merge-queue repo's `merge-queue-state` branch. State files are **automatically created** on first use with naming pattern: `{owner}-{repo}-queue.json`

Examples:
- `bloomandwild-bloomandwild-queue.json` for bloomandwild/bloomandwild repo
- `bloomandwild-frontend-queue.json` for bloomandwild/frontend repo

State file structure:

```typescript
interface QueueState {
  version: string;
  updated_at: string;

  current: {
    pr_number: number | null;
    status: "validating" | "updating_branch" | "waiting_for_tests" | "merging" | null;
    started_at: string | null;
    updated_at: string | null;  // When branch was last updated
  } | null;

  queue: Array<{
    pr_number: number;
    added_at: string;
    added_by: string;
    sha: string;
    priority: number;
  }>;

  history: Array<{
    pr_number: number;
    result: "merged" | "failed" | "conflict" | "removed";
    completed_at: string;
    duration_seconds: number;
    error_message?: string;
  }>;

  stats: {
    total_processed: number;
    total_merged: number;
    total_failed: number;
  };
}
```

## Adding New Repositories (Self-Service)

To add the merge queue to any repository:

1. **Copy 3 workflow files** to the target repo's `.github/workflows/`:
   - `merge-queue-entry.yml` (triggered by "ready" label)
   - `merge-queue-manager.yml` (cron + push trigger)
   - `merge-queue-remove.yml` (label removal/PR close)

2. **Configure `MERGE_QUEUE_TOKEN` secret** in the target repo
   - PAT with access to both target repo and merge-queue repo
   - Needed for cross-repo state management

3. **That's it!** No changes needed to merge-queue repo
   - State file automatically created on first use
   - Queue runs independently for this repo

The merge-queue repo is a **zero-configuration utility** - it works with any repository that references its actions.

## Configuration Schema

Configuration passed as inputs to GitHub Actions (allows per-repo customization).

Example workflow file in target repos (`bloomandwild/.github/workflows/merge-queue-entry.yml`):

```yaml
name: Merge Queue Entry
on:
  pull_request:
    types: [labeled]

jobs:
  add-to-queue:
    if: github.event.label.name == 'ready'
    runs-on: ubuntu-latest
    steps:
      - uses: josh.butterworth/merge-queue@v1/src/actions/add-to-queue
        with:
          github-token: ${{ secrets.MERGE_QUEUE_TOKEN }}
          # Note: Repository owner/name automatically detected from github.repository context
          # State file automatically named: {owner}-{repo}-queue.json

          # Queue configuration
          queue-label: 'ready'
          failed-label: 'merge-queue-failed'
          conflict-label: 'merge-queue-conflict'
          processing-label: 'merge-processing'
          updating-label: 'merge-updating'

          # Validation requirements
          required-approvals: 1
          require-all-checks: true
          allow-draft: false
          block-labels: 'do-not-merge,wip'

          # Branch update configuration
          auto-update-branch: true
          update-timeout-minutes: 30  # Max time to wait for tests after update

          # Merge configuration
          merge-method: 'squash'  # or 'merge', 'rebase'
          delete-branch-after-merge: true
```

This approach allows each repo to have different settings while using the same actions.

## Cross-Repository GitHub Actions Setup

### How Target Repos Reference Merge Queue Actions

Target repositories (bloomandwild, bloomandwild-frontend) will reference actions from the merge-queue repo using standard GitHub Actions syntax:

```yaml
# In bloomandwild/.github/workflows/merge-queue-entry.yml
uses: josh.butterworth/merge-queue@v1/src/actions/add-to-queue
```

### Requirements

1. **merge-queue must be a GitHub repository** (not just local directory)
   - Options:
     - Public GitHub repo: `uses: username/merge-queue@v1/...`
     - Private GitHub repo: `uses: username/merge-queue@v1/...` (requires access)
     - Enterprise GitHub: Same syntax

2. **Actions must be published** with tags (e.g., `v1`, `v1.0.0`)
   - Tag releases in merge-queue repo
   - Target repos reference specific versions

3. **GitHub Token Permissions** (in target repos)
   - `contents: write` - Create test branches, update state
   - `pull-requests: write` - Merge PRs, add comments/labels
   - `actions: read` - Check workflow status
   - `checks: read` - Validate PR checks

### Alternative: Local Actions (Development)

During development, you can test locally by:
1. Using path-based actions: `uses: ../merge-queue/src/actions/add-to-queue`
2. Or publishing to GitHub as you develop

## Integration Points

### With Existing Workflows

1. **bloomandwild/pr-run-tests.yml**: Queue validates that this workflow has passed on the PR
2. **bloomandwild-frontend/pr-run-tests.yml**: Queue validates that this workflow has passed on the PR
3. **main.yml**: Respects existing concurrency controls in both repos
4. **labeler.yml**: Can auto-add queue label based on criteria
5. **on-pr-approve.yml**: Could auto-queue on approval (optional)

### Concurrency Handling

Each target repo's queue manager workflow uses concurrency controls:

```yaml
# In bloomandwild/.github/workflows/merge-queue-manager.yml
concurrency:
  group: merge-queue-processor-bloomandwild
  cancel-in-progress: false  # Let it finish processing

# In bloomandwild-frontend/.github/workflows/merge-queue-manager.yml
concurrency:
  group: merge-queue-processor-frontend
  cancel-in-progress: false
```

This ensures:
- Only one queue processor runs per repo at a time
- bloomandwild and frontend queues can run in parallel (independent)
- No state corruption from concurrent updates

## Critical Files to Modify/Create

### In merge-queue Repository

1. **New: /merge-queue/src/core/queue-state.ts**
   - Atomic read/write to state branch (multi-repo aware)
   - Queue operations (add, remove, update)
   - State validation and recovery
   - **Dynamically generates state file names** from repo owner/name
   - Auto-creates state files for new repos on first use

2. **New: /merge-queue/src/actions/add-to-queue/action.yml**
   - Defines reusable action interface
   - Accepts repo-specific inputs
   - Can be called from any target repo

3. **New: /merge-queue/src/actions/process-queue/index.ts**
   - Main queue processing logic
   - Validates PR status and merges
   - Works with any target repo via inputs

4. **New: /merge-queue/src/core/pr-validator.ts**
   - Validates PR approval status
   - Checks all required checks are passing
   - Checks if branch is behind master
   - Detects merge conflicts

5. **New: /merge-queue/src/core/branch-updater.ts**
   - Merges master into PR branch when behind
   - Detects conflicts during merge
   - Waits for status checks to complete after update
   - Handles test failures after update

6. **New: /merge-queue/src/core/github-api.ts**
   - Cross-repo GitHub API wrapper
   - Handles authentication for target repos
   - Manages API rate limits

### In bloomandwild Repository

7. **New: /bloomandwild/.github/workflows/merge-queue-entry.yml**
   - Triggered by "ready" label
   - Calls merge-queue/add-to-queue action
   - Passes bloomandwild-specific config

8. **New: /bloomandwild/.github/workflows/merge-queue-manager.yml**
   - Cron schedule (every 5 min) + push trigger
   - Calls merge-queue/process-queue action
   - Manages bloomandwild queue

9. **Read: /bloomandwild/.github/workflows/pr-run-tests.yml**
   - Understand which checks/statuses need to be validated
   - Identify required status check names for validation

### In bloomandwild-frontend Repository

10. **New: /bloomandwild-frontend/.github/workflows/merge-queue-entry.yml**
    - Same as bloomandwild but for frontend
    - Uses frontend-specific config

11. **New: /bloomandwild-frontend/.github/workflows/merge-queue-manager.yml**
    - Same as bloomandwild but for frontend queue
    - Independent cron and concurrency

## Error Handling Strategy

### Checks No Longer Passing
1. Remove PR from queue immediately
2. Add "merge-queue-failed" label
3. Comment explaining which checks are failing
4. Process next in queue

### Branch Behind Master (Auto-Update)
1. Attempt to merge master into PR branch
2. If successful: Wait for tests to complete
3. If tests pass after update: Proceed to merge
4. If tests fail after update: Remove from queue with failure label
5. If merge conflicts: Handle as conflict (see below)

### Merge Conflicts During Update
1. Remove from queue
2. Add "merge-queue-conflict" label
3. Comment requesting rebase
4. Can re-queue after resolution

### Manual Merge (P1 Incidents / Queue Bypass)
1. Check if PR is still open before attempting merge
2. If PR already merged/closed: Remove from queue, log, continue to next
3. No impact on queue processing - continues with next PR
4. If master updated by manual merge: Queue auto-updates remaining PRs

### Transient Failures (API errors, runner issues)
1. Retry up to 3 times with exponential backoff
2. If still failing, remove from queue with error label
3. Log for manual investigation

### State Corruption
1. Validate state on every read
2. Attempt automatic recovery
3. Fail-safe: Manual intervention via documented procedure

## Visibility & Monitoring

### PR Communication
- **Comments**: Position updates, status changes, results
  - "✅ Added to queue at position 3"
  - "🔄 Processing merge..."
  - "🔄 Updating branch with latest master..."
  - "⏳ Waiting for tests to complete after branch update..."
  - "✅ Tests passed, merging now..."
  - "✅ Merged successfully"
  - "❌ Removed from queue: checks no longer passing"
  - "❌ Removed from queue: tests failed after branch update"
  - "❌ Removed from queue: merge conflict detected during update"

### Labels
Standard labels used across all repositories (configurable via workflow inputs):
- `ready`: User-added label to opt-in to queue (trigger)
- `queued-for-merge`: In queue waiting
- `merge-processing`: Currently being processed
- `merge-updating`: Branch being updated with master
- `merge-queue-failed`: Checks no longer passing or failed after update
- `merge-queue-conflict`: Merge conflict detected during update

Note: While defaults are standardized, each repo can customize label names via workflow configuration.

### Logs
- Detailed structured logging in GitHub Actions
- Key events: queue changes, merges, failures
- Retention: 90 days

## Security Considerations

### GitHub Token Permissions

**In Target Repos (bloomandwild, bloomandwild-frontend):**

The workflow will use `secrets.GITHUB_TOKEN` which needs permissions:
- `contents: write` - Create test branches, update state branch in merge-queue repo
- `pull-requests: write` - Merge PRs, add comments/labels
- `actions: read` - Check workflow status
- `checks: read` - Validate PR checks

**Important:** The default `GITHUB_TOKEN` can only access the repository where the workflow runs. For cross-repo operations:

**Option 1: Personal Access Token (PAT)** - Recommended
- Create PAT with repo access to merge-queue and target repos
- Store as `secrets.MERGE_QUEUE_TOKEN` in each target repo
- Use in workflows: `github-token: ${{ secrets.MERGE_QUEUE_TOKEN }}`
- Grants access to merge-queue repo's state branch

**Option 2: GitHub App**
- More secure, fine-grained permissions
- More complex setup
- Better for production at scale

**For MVP:** Use PAT with minimal required permissions.

### Validation
- Sanitize all user inputs
- Verify PR has required approvals before merge
- Validate state structure before updates
- Prevent bypassing of approval requirements
- Ensure cross-repo token access is properly scoped

## Verification Strategy

### Manual Testing Checklist
After implementation, verify:
- [ ] PR can be added to queue with "ready" label
- [ ] PR validation rejects invalid PRs (no approval, failing checks)
- [ ] Queue processes PRs in FIFO order
- [ ] PRs with passing checks merge automatically
- [ ] PRs with failing checks removed from queue + add label + comment
- [ ] PRs behind master automatically updated (master merged in)
- [ ] Tests re-run automatically after branch update
- [ ] PR merges after tests pass post-update
- [ ] Tests failing after update → PR removed with failure label
- [ ] PR comments show queue position and status updates
- [ ] Labels update correctly throughout lifecycle
- [ ] State persists across workflow runs (check queue.json)
- [ ] Concurrent workflow runs blocked (only one processor runs)
- [ ] Master push triggers next queue item processing
- [ ] PR can be removed from queue manually (remove label)
- [ ] Closed PR automatically removed from queue
- [ ] Merge conflicts during update detected and PR removed from queue
- [ ] **Manual merge bypass**: PR manually merged while in queue → queue detects and skips it
- [ ] **P1 scenario**: Manually merge PR being processed → queue handles gracefully

### Integration Testing (Per Repo)

**In bloomandwild:**
1. Create 3 test PRs with passing tests
2. Label all with "ready"
3. Verify they process sequentially
4. Verify all merge successfully

**In bloomandwild-frontend:**
1. Create 2 test PRs with passing tests
2. Label with "ready"
3. Verify frontend queue processes independently
4. Verify no interference with bloomandwild queue

**Cross-Repo Testing:**
1. Queue PRs in both repos simultaneously
2. Verify each queue processes independently
3. Verify state files remain separate
4. Verify no conflicts or race conditions

### Failure Testing (Both Repos)
1. Create PR with passing tests, add to queue
2. Push commit that breaks tests (while in queue)
3. Verify it's removed with failure label when checks fail
4. Verify next PR processes
5. Test in both bloomandwild and frontend

### Branch Auto-Update Testing
1. Create PR with passing tests
2. Merge another PR to master (making first PR behind)
3. Add first PR to queue
4. Verify queue automatically merges master into PR
5. Verify tests re-run automatically
6. Verify PR merges after tests pass
7. Test in both repos

### Branch Update Conflict Testing
1. Create PR with changes to file X
2. Merge another PR that also changes file X (creates conflict)
3. Add first PR to queue
4. Verify auto-update detects conflict
5. Verify PR removed with conflict label
6. Test in both repos

### Conflict Testing (Both Repos)
1. Create PR with merge conflict
2. Add to queue
3. Verify detected and removed with conflict label
4. Test in both repos

## Success Metrics

Implementation is successful when:
1. PRs automatically merge without manual intervention
2. System handles failures gracefully with clear communication
3. Average queue wait time < 30 minutes
4. Zero state corruption incidents
5. Team can use system without documentation lookup for common tasks

## Rollback Plan

If critical issues arise:
1. Disable `queue-manager.yml` workflow
2. Remove "ready" labels from all PRs
3. Resume manual merge process
4. Fix issues and re-deploy

Queue state preserved in branch for recovery.

## Future Enhancements (Post-MVP)

- **Auto-merge mode** (configuration option): `auto-merge-when-ready: true`
  - Automatically merge any PR meeting criteria without "ready" label
  - Engineers retain control via "do-not-merge" label
  - More aggressive/fully-automated approach
- Priority queue (high/normal/low priority PRs)
- Parallel testing (test multiple PRs simultaneously)
- Batch merging (merge compatible PRs together)
- Analytics dashboard (metrics visualization)
- Slack notifications integration
- Support for additional repositories beyond bloomandwild and frontend
- GitHub App authentication (more secure than PAT)
- Coordinated merges across repos (if frontend+backend need to merge together)

## Summary: Multi-Repository Architecture

This implementation uses a **standalone utility pattern**:

1. **merge-queue repo** = Reusable GitHub Actions library
   - Contains all TypeScript code and logic
   - Published to GitHub with version tags
   - Stores queue state for all target repos
   - **Zero-configuration** - automatically works with any repo that uses it
   - **No updates needed** when adding new repositories

2. **Target repos** (any repo) = Minimal integration
   - Copy 3 small workflow files that call merge-queue actions
   - Configure PAT secret
   - Each repo has independent queue
   - No code duplication
   - Self-service - no merge-queue repo changes needed

3. **Benefits of this approach:**
   - Single source of truth for queue logic
   - Easy to update (change merge-queue, all repos benefit)
   - Independent queues (repos don't block each other)
   - Separate release cycles (repos merge at their own pace)
   - **Self-service scalability** - any team can add their repo without merge-queue changes
   - **Zero-configuration** - state files auto-created, no setup needed
   - Simple and fast (no test re-runs, just validation + merge)
   - Resource-efficient (no additional CI time consumed)

4. **Key files created:**
   - merge-queue: ~16-19 TypeScript files + actions (includes branch updater)
   - bloomandwild: 3 workflow files
   - bloomandwild-frontend: 3 workflow files
   - Total: ~22-25 files

5. **Authentication:**
   - Requires PAT or GitHub App for cross-repo access
   - Store as `MERGE_QUEUE_TOKEN` secret in each target repo

