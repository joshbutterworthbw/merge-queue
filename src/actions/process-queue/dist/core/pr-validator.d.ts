/**
 * PR validation logic for merge queue
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
     * Check if PR has required approvals
     */
    checkApprovals(prNumber: number): Promise<boolean>;
    /**
     * Check if all required status checks pass
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