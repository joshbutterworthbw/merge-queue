/**
 * GitHub API wrapper for merge queue operations
 */
import type { components } from '@octokit/openapi-types';
import { Logger } from '../utils/logger';
import type { RepositoryInfo, MergeMethod, CheckStatus, UpdateResult } from '../types/queue';
type PullRequest = components['schemas']['pull-request'];
type Review = components['schemas']['pull-request-review'];
/**
 * GitHub API client for merge queue operations
 */
export declare class GitHubAPI {
    private repo;
    private octokit;
    private logger;
    constructor(token: string, repo: RepositoryInfo, logger?: Logger);
    /**
     * Get PR details
     */
    getPullRequest(prNumber: number): Promise<PullRequest>;
    /**
     * Get PR reviews
     */
    getPRReviews(prNumber: number): Promise<Review[]>;
    /**
     * Get combined status for a commit
     */
    getCommitStatus(ref: string): Promise<CheckStatus[]>;
    /**
     * Check if PR branch is behind base branch
     */
    isBranchBehind(prNumber: number): Promise<boolean>;
    /**
     * Update PR branch with base branch (merge base into head)
     */
    updateBranch(prNumber: number): Promise<UpdateResult>;
    /**
     * Merge a pull request
     */
    mergePullRequest(prNumber: number, method?: MergeMethod, commitTitle?: string, commitMessage?: string): Promise<string>;
    /**
     * Delete a branch
     */
    deleteBranch(ref: string): Promise<void>;
    /**
     * Add a comment to a PR
     */
    addComment(prNumber: number, body: string): Promise<void>;
    /**
     * Add labels to a PR
     */
    addLabels(prNumber: number, labels: string[]): Promise<void>;
    /**
     * Remove a label from a PR
     */
    removeLabel(prNumber: number, label: string): Promise<void>;
}
export {};
//# sourceMappingURL=github-api.d.ts.map