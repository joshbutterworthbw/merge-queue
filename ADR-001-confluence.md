h1. ADR-001: Automated PR Merge Queue

*Status:* Proposed
*Date:* 2026-02-07
*Decision Makers:* [Your Manager Name], Engineering Team
*Author:* Josh Butterworth

h2. Context

h3. Current Problem

Engineers currently use a manual "merge-flag" label system to coordinate PR merges. This process has several pain points:

# *Manual overhead* - Engineers must monitor PRs and manually click merge after approval and tests pass
# *Context switching* - Engineers must check back periodically to see if their PR is ready to merge

h3. Business Impact

* Developer time wasted on merge coordination (estimated 10-15 min per PR)
* Increased cycle time from PR approval to production

h2. Decision

Build a lightweight *automated merge queue* as a reusable GitHub Actions utility that:

# *Monitors PRs labelled "ready"* - Engineers opt-in by adding a label
# *Validates requirements* - Checks approval, passing tests, and branch up-to-date status
# *Merges sequentially* - Processes one PR at a time, maintaining existing safety pattern
# *Self-service* - Any repository can adopt it without coordination

h3. Why This Approach

*Simplicity is the core design principle:*

|| What We're NOT Building || What We ARE Building ||
| ❌ Complex test orchestration system | ✅ Simple status validator + branch updater |
| ❌ External database or service | ✅ Git-based state storage |
| ❌ Custom infrastructure | ✅ Standard GitHub Actions |
| ❌ New authentication system | ✅ GitHub's existing token system |
| ❌ Central configuration service | ✅ Per-repo workflow files |
| ❌ Test branches | ✅ Updates existing PR branches |

*The entire system is:*
* ~15-18 TypeScript files (~2000-3000 lines of code)
* 3 small workflow files per repository
* No new infrastructure or services
* No external dependencies beyond GitHub

*Design choice: Opt-in with "ready" label*
* Engineers explicitly signal when PR is ready to merge (maintains control)
* Preserves existing workflow pattern (deliberate merge timing)
* Could evolve to auto-merge mode in future (configuration option)
* Conservative approach for MVP reduces risk

h2. Technical Design

h3. Architecture Overview

{code}
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
{code}

h3. How It Works

# *Engineer creates PR* → Existing tests run automatically (unchanged)
# *Engineer gets approval* → Standard review process (unchanged)
# *Engineer adds "ready" label* → Opts into merge queue
# *Queue validates* → Checks approval, tests passing
# *Queue updates if needed* → If behind master, automatically merges master into PR
# *Tests re-run* → GitHub automatically triggers tests after branch update
# *Queue merges* → Automatic merge via GitHub API once tests pass
# *Next PR processes* → Sequential processing continues (maintaining existing pattern)

h3. Key Technical Decisions

h4. 1. Trust Existing PR Tests + Auto-Update Branches

*Decision:* Validate that PR tests already passed, and automatically update PR branches when they fall behind master.

*Rationale:*
* Simpler implementation (no test branch creation/management)
* Better UX (engineers don't manually update branches)
* Resource-efficient (uses existing PR test infrastructure)
* Same test environment as regular PRs
* Transparent (updates visible in PR history)

*How it works:* If master changes whilst PR is queued, the queue automatically merges master into the PR branch. GitHub detects the new commit and automatically re-runs tests. The queue waits for tests to pass before merging.

*Trade-off:* Slightly more complexity than just validating, but much better developer experience.

h4. 2. Git-Based State Storage

*Decision:* Store queue state as JSON files in a dedicated git branch.

*Rationale:*
* No external database or service to manage
* Version controlled and auditable
* Atomic updates via git's force-with-lease
* Persistent across workflow runs
* Zero infrastructure cost

*Trade-off:* Requires careful concurrency handling (mitigated by workflow-level locks).

h4. 3. Self-Service Multi-Repository

*Decision:* Any repo can adopt by copying 3 workflow files, no changes to merge-queue repo needed.

*Rationale:*
* Teams can adopt independently
* No bottleneck on merge-queue maintainers
* Scales to unlimited repositories
* State files auto-created on first use

h2. Security Analysis

h3. Security Principles

# *Least Privilege* - Only necessary permissions granted
# *No New Trust Boundaries* - Uses existing GitHub authentication
# *No Credential Storage* - Leverages GitHub's secret management
# *Audit Trail* - All actions logged in GitHub Actions and git history
# *Validation Before Action* - Multiple checks before merging

h3. Security Controls

|| Concern || Mitigation ||
| *Unauthorised merges* | Only merges PRs with required approvals and passing checks. Cannot bypass existing branch protection rules. |
| *Token compromise* | Uses GitHub's secret management. Token scoped to specific repos. Can be rotated without code changes. |
| *Malicious PRs* | Validates same requirements as manual merge: approval + passing tests. No relaxation of standards. |
| *State tampering* | State stored in git with full audit trail. Atomic updates prevent race conditions. |
| *Privilege escalation* | Runs with same permissions as engineer's manual merge. No elevated access. |
| *Supply chain* | TypeScript dependencies audited. Actions pinned to specific versions. No runtime downloads. |

h3. Token Permissions Required

The system uses a GitHub Personal Access Token (PAT) with minimal required permissions:

{code:yaml}
Required permissions:
- contents: write     # Create state file commits, update PR branches
- pull-requests: write # Merge PRs, add comments/labels
- actions: read       # Check workflow status
- checks: read        # Validate PR checks

Scope: Specific repositories only
{code}

*What the token does:*
* Updates PR branches (merges master into PR)
* Merges PRs via API
* Adds comments and labels
* Reads workflow and check status
* Commits to state branch

*Important:* The token cannot:
* Bypass branch protection rules
* Override required status checks
* Approve PRs
* Push directly to protected branches
* Access other organisation resources

*Note on branch updates:* The queue pushes commits to PR branches (to merge master), which engineers could already do manually. This is the same permission level as the engineer opening the PR.

h3. What This Does NOT Change

* *Branch protection rules* - Still enforced
* *Required reviews* - Still required
* *Required status checks* - Still required
* *Code review process* - Unchanged
* *Test requirements* - Unchanged
* *Approval authority* - Unchanged

The merge queue only *automates the manual merge click* after all existing requirements are met.

h3. Security Best Practices

# *Regular token rotation* - Documented procedure for rotating PAT
# *Audit logs* - All actions visible in GitHub Actions logs
# *Failure alerts* - Failed merges generate PR comments
# *Version pinning* - Target repos pin to specific merge-queue versions
# *Monitoring* - Queue state visible in git history

h2. Alternatives Considered

h3. 1. Remove Manual Opt-In (Auto-Merge on Criteria)

*Approach:* Automatically merge any PR that meets criteria (approved, tests passing, up-to-date) without requiring a "ready" label.

*Pros:*
* Fully automated - zero manual intervention
* Faster cycle time - PRs merge immediately when ready
* No label management needed
* More "continuous deployment" philosophy

*Cons:*
* *Breaking change* - Removes explicit engineer control over merge timing
* Engineers may want PRs approved but not merged yet (waiting for coordination, feature flags, etc.)
* Multiple PRs could merge simultaneously (loses sequential safety)
* Less predictable - harder to know when a merge will happen
* Could surprise engineers ("my PR merged whilst I was at lunch")

*Decision:* Maintain opt-in with "ready" label for MVP.

*Rationale:*
* Preserves existing workflow pattern (explicit merge intent)
* Engineers retain control over timing
* Sequential processing maintains safety
* Can reconsider as future enhancement with a config option: {{auto-merge-when-ready: true}}

This could be a *Phase 2 feature* where repositories can choose between:
* *Conservative mode* (current plan): Require "ready" label, sequential processing
* *Aggressive mode* (future): Auto-merge any PR meeting criteria

h3. 2. Use Existing Tools (GitHub Merge Queue, Mergify)

*Pros:*
* No development effort
* Maintained by vendor

*Cons:*
* GitHub Merge Queue re-runs tests (expensive, slower)
* Mergify is external SaaS ($$$, data sharing concerns)
* Less control over behaviour
* Harder to customise for our workflow

*Decision:* Build in-house for simplicity and control.

h3. 3. Build Complex Test Orchestration

*Pros:*
* Could catch integration issues earlier
* More thorough validation

*Cons:*
* Much more complex (5-10x code)
* Requires test branch management
* Slower (waiting for tests)
* Higher CI costs
* More failure modes

*Decision:* Trust existing PR tests for simplicity.

h3. 4. Use External Service/Database

*Pros:*
* More traditional architecture
* Easier concurrency handling

*Cons:*
* New infrastructure to manage
* Additional costs
* New security boundary
* More operational complexity

*Decision:* Use git for state storage.

h2. Consequences

h3. Positive

# *Developer productivity* - Eliminates manual merge monitoring and branch updates
# *Faster cycle time* - PRs merge as soon as ready, branches auto-updated
# *Maintains sequential safety* - Preserves existing pattern of one PR at a time
# *Consistent process* - Standardised across all repositories
# *Low maintenance* - Simple system, few failure modes
# *Self-service* - Teams adopt independently
# *Zero infrastructure* - Runs entirely on GitHub Actions
# *Auditable* - Full history in GitHub logs and git
# *Transparent* - Branch updates visible in PR history

h3. Negative

# *Additional commits* - Auto-updates create merge commits in PR history (acceptable trade-off)
# *Sequential processing* - Only one PR merges at a time per repo (intentional for safety)
# *GitHub dependency* - Relies on GitHub Actions availability (already a dependency)
# *Token management* - Requires PAT configuration per repo (one-time setup)
# *Test re-runs* - Branch updates trigger test re-runs (uses CI time, but necessary)

h3. Risks & Mitigations

|| Risk || Likelihood || Impact || Mitigation ||
| Queue gets stuck | Low | Medium | Workflow timeout (30 min), manual state reset procedure |
| State corruption | Very Low | Medium | State validation on every read, documented recovery |
| Token compromise | Low | High | Scoped permissions, rotation procedure, audit logs |
| Bug merges bad code | Very Low | High | Same validation as manual merge, rollback via git revert |
| Manual merge during P1 | Low | None | Queue detects PR already merged, skips to next. No impact. |

h2. Implementation Plan

h3. Phase 1: MVP (Weeks 1-2)
* Build core modules (validator, merger, state manager)
* Create GitHub Actions
* Deploy to 1 test repository
* Validate with real PRs

h3. Phase 2: Rollout (Week 3)
* Deploy to bloomandwild and bloomandwild-frontend
* Monitor for issues
* Document setup process

h3. Phase 3: Self-Service (Week 4)
* Create documentation for other teams
* Announce availability
* Support teams adopting it

h3. Success Metrics

* *Time to merge* - Reduce from approval to merge by 50%
* *Developer satisfaction* - Survey: "saves time, less tedious"
* *Adoption* - 5+ repositories using within 3 months
* *Reliability* - 99%+ success rate for valid PRs

h2. Emergency Scenarios & Manual Override

h3. P1 Incidents - Bypassing the Queue

{panel:title=Critical Point|borderStyle=solid|borderColor=#ccc|titleBGColor=#dff0d8|bgColor=#f9f9f9}
You can always manually merge a PR, even if the queue is running.
{panel}

The queue never blocks emergency deployments. When a PR is manually merged:

# *Queue detects PR is already closed* when it tries to process it
# *Queue skips it* and continues with next PR in queue
# *No disruption* - queue keeps running normally
# *Master updates propagate* - remaining queued PRs auto-update from the manual merge

*Example scenario:*
* PR #100 is in the queue at position 3
* P1 incident requires immediate hotfix
* Engineer manually merges PR #100 (bypassing queue)
* (/) Merge succeeds immediately
* (/) Queue later tries to process PR #100, sees it's closed, removes from queue, continues
* (/) No queue disruption

h3. Temporarily Disabling the Queue

If needed, disable the queue temporarily:

# *Pause processing*: Disable {{queue-manager.yml}} workflow in GitHub Actions settings
# *Manual merges work*: All PRs can still be merged manually
# *Re-enable when ready*: Turn workflow back on
# *State preserved*: Queue continues where it left off

h3. Recovery from Issues

If critical issues arise:
# Disable {{queue-manager.yml}} workflow
# Remove "ready" labels from all PRs (optional)
# Resume manual merge process
# Fix issues and re-deploy queue

Queue state preserved in git branch for recovery.

h2. Approval

*Approvers:*
* [ ] Engineering Manager - [Name]
* [ ] Security Team - [Name]
* [ ] Platform Team - [Name]

*Open Questions:*
# Should we pilot with one repo first or multiple?
# Do we need additional security review before rollout?
# Who will maintain the merge-queue repo long-term?
# Do we want to consider "auto-merge mode" (no label required) as an option, or stick with opt-in "ready" label?

*Addressed Concerns:*
* (/) P1 incidents: Manual merges always work, queue handles gracefully
* (/) Security: No new permissions beyond what engineers have
* (/) Simplicity: ~2000-3000 lines of code, no infrastructure

h2. References

* [GitHub Actions Documentation|https://docs.github.com/en/actions]
* [Octokit API Library|https://github.com/octokit/rest.js]
* Technical Plan: {{claude-plan.md}}

----

*Next Steps if Approved:*
# Begin Phase 1 implementation
# Schedule security review checkpoint after MVP
# Identify first test repository
