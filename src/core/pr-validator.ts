/**
 * PR validation logic for merge queue
 *
 * Note: Approval requirements are intentionally NOT checked here.
 * GitHub branch protection rules already enforce required approvals,
 * and the merge API call will be rejected if they aren't met.
 * Duplicating that check here just forces users to keep two configs in sync.
 */

import { GitHubAPI } from './github-api';
import { Logger, createLogger } from '../utils/logger';
import type { QueueConfig, ValidationResult } from '../types/queue';

/**
 * PR Validator class
 */
export class PRValidator {
  constructor(
    private api: GitHubAPI,
    private config: QueueConfig,
    private logger?: Logger
  ) {
    this.logger = logger || createLogger({ component: 'PRValidator' });
  }

  /**
   * Validate PR meets all merge requirements
   */
  async validate(prNumber: number): Promise<ValidationResult> {
    this.logger?.info('Validating PR', { prNumber });

    try {
      const pr = await this.api.getPullRequest(prNumber);

      // Check if PR is still open
      if (pr.state !== 'open') {
        return {
          valid: false,
          reason: `PR is ${pr.state}`,
        };
      }

      // Check if draft
      if (pr.draft && !this.config.allowDraft) {
        return {
          valid: false,
          reason: 'PR is in draft state',
          checks: {
            checksPass: false,
            notDraft: false,
            noBlockLabels: false,
            upToDate: false,
            noConflicts: false,
          },
        };
      }
      const notDraft = true;

      // Check for blocking labels (filter undefined label names for type safety)
      const prLabels = pr.labels
        .map(l => l.name)
        .filter((name): name is string => name != null);
      const blockingLabels = this.config.blockLabels.filter(label =>
        prLabels.includes(label)
      );

      if (blockingLabels.length > 0) {
        return {
          valid: false,
          reason: `PR has blocking label: ${blockingLabels.join(', ')}`,
          checks: {
            checksPass: false,
            notDraft,
            noBlockLabels: false,
            upToDate: false,
            noConflicts: false,
          },
        };
      }
      const noBlockLabels = true;

      // Check status checks
      const checksPass = await this.checkStatusChecks(pr.head.sha);
      if (!checksPass.valid) {
        return {
          valid: false,
          reason: checksPass.reason,
          checks: {
            checksPass: false,
            notDraft,
            noBlockLabels,
            upToDate: false,
            noConflicts: false,
          },
        };
      }

      // Check if branch is up to date (not behind base)
      const upToDate = !(await this.api.isBranchBehind(prNumber));

      // Check if mergeable (no conflicts)
      const noConflicts = pr.mergeable !== false;
      if (!noConflicts) {
        return {
          valid: false,
          reason: 'PR has merge conflicts',
          checks: {
            checksPass: true,
            notDraft,
            noBlockLabels,
            upToDate,
            noConflicts: false,
          },
        };
      }

      this.logger?.info('PR validation passed', { prNumber });

      return {
        valid: true,
        checks: {
          checksPass: true,
          notDraft,
          noBlockLabels,
          upToDate,
          noConflicts,
        },
      };
    } catch (error) {
      this.logger?.error('PR validation error', error as Error, { prNumber });
      throw error;
    }
  }

  /**
   * Check if all required status checks pass.
   *
   * Checks whose name appears in `config.ignoreChecks` are excluded from
   * evaluation.  This prevents the merge queue's own workflow checks from
   * creating a circular dependency where a previous failed run blocks the
   * PR from being re-queued.
   */
  async checkStatusChecks(
    sha: string
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!this.config.requireAllChecks) {
      return { valid: true };
    }

    const allChecks = await this.api.getCommitStatus(sha);

    // Exclude checks the user has explicitly asked to ignore
    const ignored = this.config.ignoreChecks;
    const checks =
      ignored.length > 0
        ? allChecks.filter(c => !ignored.includes(c.name))
        : allChecks;

    if (ignored.length > 0) {
      const skipped = allChecks.length - checks.length;
      if (skipped > 0) {
        this.logger?.debug('Ignored checks during validation', {
          sha,
          skippedCount: skipped,
          ignoredNames: ignored,
        });
      }
    }

    // Filter for failed checks
    const failedChecks = checks.filter(
      c => c.status === 'failure' || c.status === 'cancelled'
    );

    if (failedChecks.length > 0) {
      return {
        valid: false,
        reason: `Failed checks: ${failedChecks.map(c => c.name).join(', ')}`,
      };
    }

    // Filter for pending checks
    const pendingChecks = checks.filter(c => c.status === 'pending');

    if (pendingChecks.length > 0) {
      return {
        valid: false,
        reason: `Pending checks: ${pendingChecks.map(c => c.name).join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Check if PR branch is behind base branch
   */
  async isBehind(prNumber: number): Promise<boolean> {
    return this.api.isBranchBehind(prNumber);
  }
}
