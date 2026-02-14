/**
 * PR validation logic for merge queue
 *
 * Note: Approval requirements are intentionally NOT checked here.
 * GitHub branch protection rules already enforce required approvals,
 * and the merge API call will be rejected if they aren't met.
 * Duplicating that check here just forces users to keep two configs in sync.
 */
import { GitHubAPI } from './github-api';
import { Logger } from '../utils/logger';
import type { QueueConfig, ValidationResult } from '../types/queue';
/**
 * PR Validator class
 */
export declare class PRValidator {
    private api;
    private config;
    private logger?;
    constructor(api: GitHubAPI, config: QueueConfig, logger?: Logger | undefined);
    /**
     * Validate PR meets all merge requirements
     */
    validate(prNumber: number): Promise<ValidationResult>;
    /**
     * Check if all required status checks pass.
     *
     * Checks whose name appears in `config.ignoreChecks` are excluded from
     * evaluation.  This prevents the merge queue's own workflow checks from
     * creating a circular dependency where a previous failed run blocks the
     * PR from being re-queued.
     */
    checkStatusChecks(sha: string): Promise<{
        valid: boolean;
        reason?: string;
    }>;
    /**
     * Check if PR branch is behind base branch
     */
    isBehind(prNumber: number): Promise<boolean>;
}
//# sourceMappingURL=pr-validator.d.ts.map