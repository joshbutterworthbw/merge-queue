# ADR-001: Automated PR Merge Queue

**Status:** Proposed
**Date:** 2026-02-07
**Decision Makers:** [Your Manager Name], Engineering Team
**Author:** Josh Butterworth

## Context

### Current Problem

Engineers currently use a manual "merge-flag" label system to coordinate PR merges. This process has several pain points:

1. **Manual overhead** - Engineers must monitor PRs and manually click merge after approval and tests pass
2. **Context switching** - Engineers must check back periodically to see if their PR is ready to merge

### Business Impact

- Developer time wasted on merge coordination (estimated 10-15 min per PR)
- Increased cycle time from PR approval to production

## Decision

Build a lightweight **automated merge queue** as a reusable GitHub Actions utility that:

1. **Monitors PRs labeled "ready"** - Engineers opt-in by adding a label
2. **Validates requirements** - Checks approval, passing tests, and branch up-to-date status
3. **Merges sequentially** - Processes one PR at a time, maintaining existing safety pattern
4. **Self-service** - Any repository can adopt it without coordination

### Why This Approach

**Simplicity is the core design principle:**

| What We're NOT Building | What We ARE Building |
|-------------------------|---------------------|
| ❌ Complex test orchestration system | ✅ Simple status validator + branch updater |
| ❌ External database or service | ✅ Git-based state storage |
| ❌ Custom infrastructure | ✅ Standard GitHub Actions |
| ❌ New authentication system | ✅ GitHub's existing token system |
| ❌ Central configuration service | ✅ Per-repo workflow files |
| ❌ Test branches | ✅ Updates existing PR branches |

**The entire system is:**
- ~15-18 TypeScript files (~2000-3000 lines of code)
- 3 small workflow files per repository
- No new infrastructure or services
- No external dependencies beyond GitHub

**Design choice: Opt-in with "ready" label**
- Engineers explicitly signal when PR is ready to merge (maintains control)
- Preserves existing workflow pattern (deliberate merge timing)
- Could evolve to auto-merge mode in future (configuration option)
- Conservative approach for MVP reduces risk

## Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  merge-queue Repository (Reusable Utility)                  │
│  - TypeScript actions (add, process, remove)                │
│  - Core modules (validator, merger, state manager)          │
│  - Stores queue state in git branch                         │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ Referenced via GitHub Actions
                              │
┌─────────────────────────────┴───────────────────────────────┐
│  Target Repositories (bloomandwild, frontend, etc.)         │
│  - 3 workflow files reference merge-queue actions           │
│  - Each repo has independent queue                          │
│  - Zero changes to merge-queue when adding new repos        │
└─────────────────────────────────────────────────────────────┘
```

### How It Works

1. **Engineer creates PR** → Existing tests run automatically (unchanged)
2. **Engineer gets approval** → Standard review process (unchanged)
3. **Engineer adds "ready" label** → Opts into merge queue
4. **Queue validates** → Checks approval, tests passing
5. **Queue updates if needed** → If behind master, automatically merges master into PR
6. **Tests re-run** → GitHub automatically triggers tests after branch update
7. **Queue merges** → Automatic merge via GitHub API once tests pass
8. **Next PR processes** → Sequential processing continues (maintaining existing pattern)

### Key Technical Decisions

#### 1. Trust Existing PR Tests + Auto-Update Branches

**Decision:** Validate that PR tests already passed, and automatically update PR branches when they fall behind master.

**Rationale:**
- Simpler implementation (no test branch creation/management)
- Better UX (engineers don't manually update branches)
- Resource-efficient (uses existing PR test infrastructure)
- Same test environment as regular PRs
- Transparent (updates visible in PR history)

**How it works:** If master changes while PR is queued, the queue automatically merges master into the PR branch. GitHub detects the new commit and automatically re-runs tests. The queue waits for tests to pass before merging.

**Trade-off:** Slightly more complexity than just validating, but much better developer experience.

#### 2. Git-Based State Storage

**Decision:** Store queue state as JSON files in a dedicated git branch.

**Rationale:**
- No external database or service to manage
- Version controlled and auditable
- Atomic updates via git's force-with-lease
- Persistent across workflow runs
- Zero infrastructure cost

**Trade-off:** Requires careful concurrency handling (mitigated by workflow-level locks).

#### 3. Self-Service Multi-Repository

**Decision:** Any repo can adopt by copying 3 workflow files, no changes to merge-queue repo needed.

**Rationale:**
- Teams can adopt independently
- No bottleneck on merge-queue maintainers
- Scales to unlimited repositories
- State files auto-created on first use

## Security Analysis

### Security Principles

1. **Least Privilege** - Only necessary permissions granted
2. **No New Trust Boundaries** - Uses existing GitHub authentication
3. **No Credential Storage** - Leverages GitHub's secret management
4. **Audit Trail** - All actions logged in GitHub Actions and git history
5. **Validation Before Action** - Multiple checks before merging

### Security Controls

| Concern | Mitigation |
|---------|-----------|
| **Unauthorized merges** | Only merges PRs with required approvals and passing checks. Cannot bypass existing branch protection rules. |
| **Token compromise** | Uses GitHub's secret management. Token scoped to specific repos. Can be rotated without code changes. |
| **Malicious PRs** | Validates same requirements as manual merge: approval + passing tests. No relaxation of standards. |
| **State tampering** | State stored in git with full audit trail. Atomic updates prevent race conditions. |
| **Privilege escalation** | Runs with same permissions as engineer's manual merge. No elevated access. |
| **Supply chain** | TypeScript dependencies audited. Actions pinned to specific versions. No runtime downloads. |

### Token Permissions Required

The system uses a GitHub Personal Access Token (PAT) with minimal required permissions:

```yaml
Required permissions:
- contents: write     # Create state file commits, update PR branches
- pull-requests: write # Merge PRs, add comments/labels
- actions: read       # Check workflow status
- checks: read        # Validate PR checks

Scope: Specific repositories only
```

**What the token does:**
- Updates PR branches (merges master into PR)
- Merges PRs via API
- Adds comments and labels
- Reads workflow and check status
- Commits to state branch

**Important:** The token cannot:
- Bypass branch protection rules
- Override required status checks
- Approve PRs
- Push directly to protected branches
- Access other organization resources

**Note on branch updates:** The queue pushes commits to PR branches (to merge master), which engineers could already do manually. This is the same permission level as the engineer opening the PR.

### What This Does NOT Change

- **Branch protection rules** - Still enforced
- **Required reviews** - Still required
- **Required status checks** - Still required
- **Code review process** - Unchanged
- **Test requirements** - Unchanged
- **Approval authority** - Unchanged

The merge queue only **automates the manual merge click** after all existing requirements are met.

### Security Best Practices

1. **Regular token rotation** - Documented procedure for rotating PAT
2. **Audit logs** - All actions visible in GitHub Actions logs
3. **Failure alerts** - Failed merges generate PR comments
4. **Version pinning** - Target repos pin to specific merge-queue versions
5. **Monitoring** - Queue state visible in git history

## Alternatives Considered

### 1. Remove Manual Opt-In (Auto-Merge on Criteria)

**Approach:** Automatically merge any PR that meets criteria (approved, tests passing, up-to-date) without requiring a "ready" label.

**Pros:**
- Fully automated - zero manual intervention
- Faster cycle time - PRs merge immediately when ready
- No label management needed
- More "continuous deployment" philosophy

**Cons:**
- **Breaking change** - Removes explicit engineer control over merge timing
- Engineers may want PRs approved but not merged yet (waiting for coordination, feature flags, etc.)
- Multiple PRs could merge simultaneously (loses sequential safety)
- Less predictable - harder to know when a merge will happen
- Could surprise engineers ("my PR merged while I was at lunch")

**Decision:** Maintain opt-in with "ready" label for MVP.

**Rationale:**
- Preserves existing workflow pattern (explicit merge intent)
- Engineers retain control over timing
- Sequential processing maintains safety
- Can reconsider as future enhancement with a config option: `auto-merge-when-ready: true`

This could be a **Phase 2 feature** where repositories can choose between:
- **Conservative mode** (current plan): Require "ready" label, sequential processing
- **Aggressive mode** (future): Auto-merge any PR meeting criteria

### 2. Use Existing Tools (GitHub Merge Queue, Mergify)

**Pros:**
- No development effort
- Maintained by vendor

**Cons:**
- GitHub Merge Queue re-runs tests (expensive, slower)
- Mergify is external SaaS ($$$, data sharing concerns)
- Less control over behavior
- Harder to customize for our workflow

**Decision:** Build in-house for simplicity and control.

### 2. Build Complex Test Orchestration

**Pros:**
- Could catch integration issues earlier
- More thorough validation

**Cons:**
- Much more complex (5-10x code)
- Requires test branch management
- Slower (waiting for tests)
- Higher CI costs
- More failure modes

**Decision:** Trust existing PR tests for simplicity.

### 3. Use External Service/Database

**Pros:**
- More traditional architecture
- Easier concurrency handling

**Cons:**
- New infrastructure to manage
- Additional costs
- New security boundary
- More operational complexity

**Decision:** Use git for state storage.

## Consequences

### Positive

1. **Developer productivity** - Eliminates manual merge monitoring and branch updates
2. **Faster cycle time** - PRs merge as soon as ready, branches auto-updated
3. **Maintains sequential safety** - Preserves existing pattern of one PR at a time
4. **Consistent process** - Standardized across all repositories
5. **Low maintenance** - Simple system, few failure modes
6. **Self-service** - Teams adopt independently
7. **Zero infrastructure** - Runs entirely on GitHub Actions
8. **Auditable** - Full history in GitHub logs and git
9. **Transparent** - Branch updates visible in PR history

### Negative

1. **Additional commits** - Auto-updates create merge commits in PR history (acceptable trade-off)
2. **Sequential processing** - Only one PR merges at a time per repo (intentional for safety)
3. **GitHub dependency** - Relies on GitHub Actions availability (already a dependency)
4. **Token management** - Requires PAT configuration per repo (one-time setup)
5. **Test re-runs** - Branch updates trigger test re-runs (uses CI time, but necessary)

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Queue gets stuck | Low | Medium | Workflow timeout (30 min), manual state reset procedure |
| State corruption | Very Low | Medium | State validation on every read, documented recovery |
| Token compromise | Low | High | Scoped permissions, rotation procedure, audit logs |
| Bug merges bad code | Very Low | High | Same validation as manual merge, rollback via git revert |
| Manual merge during P1 | Low | None | Queue detects PR already merged, skips to next. No impact. |

## Implementation Plan

### Phase 1: MVP (Weeks 1-2)
- Build core modules (validator, merger, state manager)
- Create GitHub Actions
- Deploy to 1 test repository
- Validate with real PRs

### Phase 2: Rollout (Week 3)
- Deploy to bloomandwild and bloomandwild-frontend
- Monitor for issues
- Document setup process

### Phase 3: Self-Service (Week 4)
- Create documentation for other teams
- Announce availability
- Support teams adopting it

### Success Metrics

- **Time to merge** - Reduce from approval to merge by 50%
- **Developer satisfaction** - Survey: "saves time, less tedious"
- **Adoption** - 5+ repositories using within 3 months
- **Reliability** - 99%+ success rate for valid PRs

## Emergency Scenarios & Manual Override

### P1 Incidents - Bypassing the Queue

**Critical point: You can always manually merge a PR, even if the queue is running.**

The queue never blocks emergency deployments. When a PR is manually merged:

1. **Queue detects PR is already closed** when it tries to process it
2. **Queue skips it** and continues with next PR in queue
3. **No disruption** - queue keeps running normally
4. **Master updates propagate** - remaining queued PRs auto-update from the manual merge

**Example scenario:**
- PR #100 is in the queue at position 3
- P1 incident requires immediate hotfix
- Engineer manually merges PR #100 (bypassing queue)
- ✅ Merge succeeds immediately
- ✅ Queue later tries to process PR #100, sees it's closed, removes from queue, continues
- ✅ No queue disruption

### Temporarily Disabling the Queue

If needed, disable the queue temporarily:

1. **Pause processing**: Disable `queue-manager.yml` workflow in GitHub Actions settings
2. **Manual merges work**: All PRs can still be merged manually
3. **Re-enable when ready**: Turn workflow back on
4. **State preserved**: Queue continues where it left off

### Recovery from Issues

If critical issues arise:
1. Disable `queue-manager.yml` workflow
2. Remove "ready" labels from all PRs (optional)
3. Resume manual merge process
4. Fix issues and re-deploy queue

Queue state preserved in git branch for recovery.

## Approval

**Approvers:**
- [ ] Engineering Manager - [Name]
- [ ] Security Team - [Name]
- [ ] Platform Team - [Name]

**Open Questions:**
1. Should we pilot with one repo first or multiple?
2. Do we need additional security review before rollout?
3. Who will maintain the merge-queue repo long-term?
4. Do we want to consider "auto-merge mode" (no label required) as an option, or stick with opt-in "ready" label?

**Addressed Concerns:**
- ✅ P1 incidents: Manual merges always work, queue handles gracefully
- ✅ Security: No new permissions beyond what engineers have
- ✅ Simplicity: ~2000-3000 lines of code, no infrastructure

## References

- GitHub Actions Documentation: https://docs.github.com/en/actions
- Octokit API Library: https://github.com/octokit/rest.js
- Technical Plan: `claude-plan.md`

---

**Next Steps if Approved:**
1. Begin Phase 1 implementation
2. Schedule security review checkpoint after MVP
3. Identify first test repository
