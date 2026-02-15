/**
 * Process Queue Action
 * Main queue processor that validates, updates, and merges PRs.
 *
 * Uses GitHub labels as the source of truth instead of a state file:
 * - `queued-for-merge` label = PR is waiting in the queue
 * - `merge-processing` label = PR is currently being processed
 */
import { GitHubAPI } from '../../core/github-api';
import { PRValidator } from '../../core/pr-validator';
import { BranchUpdater } from '../../core/branch-updater';
import { createLogger } from '../../utils/logger';
import { getConfig } from '../../utils/action-helpers';
import type { MergeResult } from '../../types/queue';
/**
 * Process a single PR from the queue
 */
export declare function processPR(api: GitHubAPI, validator: PRValidator, updater: BranchUpdater, prNumber: number, config: ReturnType<typeof getConfig>, logger: ReturnType<typeof createLogger>): Promise<MergeResult>;
//# sourceMappingURL=index.d.ts.map