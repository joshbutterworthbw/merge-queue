/**
 * Tests for the processPR function in process-queue action.
 *
 * Focuses on the staleness re-check retry loop that prevents merging
 * a PR whose branch is behind the base after the base branch advances
 * during CI.
 */

import { processPR } from '../index';
import { GitHubAPI } from '../../../core/github-api';
import { PRValidator } from '../../../core/pr-validator';
import { BranchUpdater } from '../../../core/branch-updater';
import { Logger } from '../../../utils/logger';
import { DEFAULT_CONFIG } from '../../../utils/constants';
import type { QueueConfig, ValidationResult } from '../../../types/queue';
import {
  createMockGitHubAPI,
  createMockValidator,
  createMockBranchUpdater,
  makePR,
  makeUpdateResult,
  type ProcessQueueAPIMethods,
  type ProcessQueueValidatorMethods,
  type ProcessQueueUpdaterMethods,
} from '../../../core/__tests__/mock-helpers';

// Mock dependencies that call GitHub Actions runtime
jest.mock('@actions/core');
jest.mock('../../../core/github-api');
jest.mock('../../../core/pr-validator');
jest.mock('../../../core/branch-updater');

/** Minimal logger mock — silences output during tests */
function createSilentLogger(): Logger {
  const logger = new Logger();
  jest.spyOn(logger, 'info').mockImplementation(() => {});
  jest.spyOn(logger, 'debug').mockImplementation(() => {});
  jest.spyOn(logger, 'warning').mockImplementation(() => {});
  jest.spyOn(logger, 'error').mockImplementation(() => {});
  return logger;
}

/** Build a passing ValidationResult with configurable upToDate */
function makeValidation(overrides: { upToDate?: boolean } = {}): ValidationResult {
  return {
    valid: true,
    checks: {
      approved: true,
      checksPass: true,
      notDraft: true,
      noBlockLabels: true,
      upToDate: overrides.upToDate ?? true,
      noConflicts: true,
    },
  };
}

describe('processPR', () => {
  let mockAPI: jest.Mocked<ProcessQueueAPIMethods>;
  let mockValidator: jest.Mocked<ProcessQueueValidatorMethods>;
  let mockUpdater: jest.Mocked<ProcessQueueUpdaterMethods>;
  let config: QueueConfig;
  let logger: Logger;

  beforeEach(() => {
    config = { ...DEFAULT_CONFIG, maxUpdateRetries: 3 };

    mockAPI = createMockGitHubAPI<ProcessQueueAPIMethods>([
      'addLabels',
      'removeLabel',
      'getPullRequest',
      'mergePullRequest',
      'deleteBranch',
      'addComment',
    ]);

    mockValidator = createMockValidator<ProcessQueueValidatorMethods>([
      'validate',
      'isBehind',
    ]);

    mockUpdater = createMockBranchUpdater<ProcessQueueUpdaterMethods>([
      'updateIfBehind',
    ]);

    logger = createSilentLogger();

    // Default stubs — individual tests override as needed
    mockAPI.addLabels.mockResolvedValue(undefined as never);
    mockAPI.removeLabel.mockResolvedValue(undefined as never);
    mockAPI.addComment.mockResolvedValue(undefined as never);
    mockAPI.getPullRequest.mockResolvedValue(makePR({ head: { sha: 'abc123', ref: 'feature' } }) as never);
    mockAPI.mergePullRequest.mockResolvedValue('merge-sha' as never);
    mockAPI.deleteBranch.mockResolvedValue(undefined as never);
  });

  it('should merge immediately when branch is up to date', async () => {
    mockValidator.validate.mockResolvedValue(makeValidation({ upToDate: true }) as never);
    mockValidator.isBehind.mockResolvedValue(false as never);

    const result = await processPR(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      mockUpdater as unknown as BranchUpdater,
      42,
      config,
      logger
    );

    expect(result).toBe('merged');
    expect(mockUpdater.updateIfBehind).not.toHaveBeenCalled();
    expect(mockAPI.mergePullRequest).toHaveBeenCalledWith(42, 'squash');
  });

  it('should update once and merge when branch is behind', async () => {
    mockValidator.validate.mockResolvedValue(makeValidation({ upToDate: false }) as never);
    mockUpdater.updateIfBehind.mockResolvedValue(makeUpdateResult({ sha: 'new-sha' }) as never);
    // After first update, branch is up to date
    mockValidator.isBehind.mockResolvedValueOnce(false as never) // post-update re-check
      .mockResolvedValueOnce(false as never); // final staleness gate

    const result = await processPR(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      mockUpdater as unknown as BranchUpdater,
      42,
      config,
      logger
    );

    expect(result).toBe('merged');
    expect(mockUpdater.updateIfBehind).toHaveBeenCalledTimes(1);
    expect(mockAPI.mergePullRequest).toHaveBeenCalledWith(42, 'squash');
  });

  it('should re-update when base advances during CI wait', async () => {
    mockValidator.validate.mockResolvedValue(makeValidation({ upToDate: false }) as never);
    mockUpdater.updateIfBehind.mockResolvedValue(makeUpdateResult({ sha: 'new-sha' }) as never);

    // First post-update check: still behind (base advanced)
    // Second post-update check: up to date
    // Final staleness gate: up to date
    mockValidator.isBehind
      .mockResolvedValueOnce(true as never)   // after 1st update — stale again
      .mockResolvedValueOnce(false as never)  // after 2nd update — good
      .mockResolvedValueOnce(false as never); // final gate

    const result = await processPR(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      mockUpdater as unknown as BranchUpdater,
      42,
      config,
      logger
    );

    expect(result).toBe('merged');
    expect(mockUpdater.updateIfBehind).toHaveBeenCalledTimes(2);
    expect(mockAPI.mergePullRequest).toHaveBeenCalledTimes(1);
  });

  it('should fail when max update retries are exceeded', async () => {
    config.maxUpdateRetries = 2;

    mockValidator.validate.mockResolvedValue(makeValidation({ upToDate: false }) as never);
    mockUpdater.updateIfBehind.mockResolvedValue(makeUpdateResult({ sha: 'new-sha' }) as never);

    // Base keeps advancing — always behind
    mockValidator.isBehind.mockResolvedValue(true as never);

    const result = await processPR(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      mockUpdater as unknown as BranchUpdater,
      42,
      config,
      logger
    );

    expect(result).toBe('failed');
    expect(mockUpdater.updateIfBehind).toHaveBeenCalledTimes(2);
    expect(mockAPI.mergePullRequest).not.toHaveBeenCalled();
    // Should apply the failed label
    expect(mockAPI.addLabels).toHaveBeenCalledWith(42, [config.failedLabel]);
  });

  it('should fail on conflict during re-update', async () => {
    mockValidator.validate.mockResolvedValue(makeValidation({ upToDate: false }) as never);

    // First update succeeds but base advances; second update hits conflict
    mockUpdater.updateIfBehind
      .mockResolvedValueOnce(makeUpdateResult({ sha: 'new-sha' }) as never)
      .mockResolvedValueOnce(makeUpdateResult({ success: false, conflict: true, error: 'Merge conflict' }) as never);

    // After first update, branch is stale again
    mockValidator.isBehind.mockResolvedValueOnce(true as never);

    const result = await processPR(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      mockUpdater as unknown as BranchUpdater,
      42,
      config,
      logger
    );

    expect(result).toBe('conflict');
    expect(mockUpdater.updateIfBehind).toHaveBeenCalledTimes(2);
    expect(mockAPI.mergePullRequest).not.toHaveBeenCalled();
    expect(mockAPI.addLabels).toHaveBeenCalledWith(42, [config.conflictLabel]);
  });

  it('should fail when initially up-to-date branch becomes stale before merge', async () => {
    mockValidator.validate.mockResolvedValue(makeValidation({ upToDate: true }) as never);

    // Final staleness gate catches that base advanced
    mockValidator.isBehind.mockResolvedValue(true as never);

    const result = await processPR(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      mockUpdater as unknown as BranchUpdater,
      42,
      config,
      logger
    );

    expect(result).toBe('failed');
    expect(mockUpdater.updateIfBehind).not.toHaveBeenCalled();
    expect(mockAPI.mergePullRequest).not.toHaveBeenCalled();
    expect(mockAPI.addLabels).toHaveBeenCalledWith(42, [config.failedLabel]);
  });

  it('should fail when branch is behind and auto-update is disabled', async () => {
    config.autoUpdateBranch = false;

    mockValidator.validate.mockResolvedValue(makeValidation({ upToDate: false }) as never);

    const result = await processPR(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      mockUpdater as unknown as BranchUpdater,
      42,
      config,
      logger
    );

    expect(result).toBe('failed');
    expect(mockUpdater.updateIfBehind).not.toHaveBeenCalled();
    expect(mockAPI.mergePullRequest).not.toHaveBeenCalled();
  });

  it('should return failed when validation fails', async () => {
    mockValidator.validate.mockResolvedValue({
      valid: false,
      reason: 'PR has no approving reviews',
    } as never);

    const result = await processPR(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      mockUpdater as unknown as BranchUpdater,
      42,
      config,
      logger
    );

    expect(result).toBe('failed');
    expect(mockAPI.mergePullRequest).not.toHaveBeenCalled();
  });

  it('should return failed when tests fail after branch update', async () => {
    mockValidator.validate.mockResolvedValue(makeValidation({ upToDate: false }) as never);
    mockUpdater.updateIfBehind.mockResolvedValue(
      makeUpdateResult({ success: false, error: 'Tests failed after branch update' }) as never
    );

    const result = await processPR(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      mockUpdater as unknown as BranchUpdater,
      42,
      config,
      logger
    );

    expect(result).toBe('failed');
    expect(mockAPI.mergePullRequest).not.toHaveBeenCalled();
  });
});
