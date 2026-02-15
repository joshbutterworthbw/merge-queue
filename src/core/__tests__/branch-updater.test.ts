/**
 * Tests for branch updater
 */

import { BranchUpdater } from '../branch-updater';
import { GitHubAPI } from '../github-api';
import { PRValidator } from '../pr-validator';
import type { QueueConfig } from '../../types/queue';
import { DEFAULT_CONFIG } from '../../utils/constants';
import {
  createMockGitHubAPI,
  createMockValidator,
  makePR,
  makeCheck,
  makeUpdateResult,
  type BranchUpdaterAPIMethods,
  type BranchUpdaterValidatorMethods,
} from './mock-helpers';

// Mock dependencies
jest.mock('../github-api');
jest.mock('../pr-validator');

describe('BranchUpdater', () => {
  let mockAPI: jest.Mocked<BranchUpdaterAPIMethods>;
  let mockValidator: jest.Mocked<BranchUpdaterValidatorMethods>;
  let updater: BranchUpdater;
  let config: QueueConfig;

  beforeEach(() => {
    config = { ...DEFAULT_CONFIG };

    mockAPI = createMockGitHubAPI<BranchUpdaterAPIMethods>([
      'updateBranch',
      'getPullRequest',
      'getCommitStatus',
    ]);

    mockValidator = createMockValidator<BranchUpdaterValidatorMethods>([
      'isBehind',
      'checkStatusChecks',
    ]);

    updater = new BranchUpdater(
      mockAPI as unknown as GitHubAPI,
      mockValidator as unknown as PRValidator,
      config
    );
  });

  describe('updateIfBehind', () => {
    it('should return success if branch is up to date', async () => {
      mockValidator.isBehind.mockResolvedValue(false as never);

      const result = await updater.updateIfBehind(123);

      expect(result.success).toBe(true);
      expect(result.conflict).toBe(false);
      expect(mockAPI.updateBranch).not.toHaveBeenCalled();
    });

    it('should update branch if behind', async () => {
      mockValidator.isBehind.mockResolvedValue(true as never);
      mockAPI.updateBranch.mockResolvedValue(makeUpdateResult({ sha: 'new-sha' }) as never);
      mockAPI.getPullRequest.mockResolvedValue(makePR() as never);
      mockValidator.checkStatusChecks.mockResolvedValue({ valid: true } as never);

      const result = await updater.updateIfBehind(123);

      expect(mockAPI.updateBranch).toHaveBeenCalledWith(123);
      expect(result.success).toBe(true);
      expect(result.sha).toBe('new-sha');
    });

    it('should return conflict if update has conflict', async () => {
      mockValidator.isBehind.mockResolvedValue(true as never);
      mockAPI.updateBranch.mockResolvedValue(
        makeUpdateResult({ success: false, conflict: true, error: 'Merge conflict' }) as never
      );

      const result = await updater.updateIfBehind(123);

      expect(result.success).toBe(false);
      expect(result.conflict).toBe(true);
    });

    it('should wait for tests and return success if they pass', async () => {
      // Mock timers to avoid real delays
      jest.useFakeTimers();

      mockValidator.isBehind.mockResolvedValue(true as never);
      mockAPI.updateBranch.mockResolvedValue(makeUpdateResult({ sha: 'new-sha' }) as never);
      mockAPI.getPullRequest.mockResolvedValue(makePR() as never);

      // First call returns pending, second returns valid
      let checkCallCount = 0;
      mockValidator.checkStatusChecks.mockImplementation(async () => {
        checkCallCount++;
        return checkCallCount === 1 ? { valid: false } : { valid: true };
      });

      mockAPI.getCommitStatus.mockResolvedValue([makeCheck('test', 'pending')] as never);

      // Start the update
      const resultPromise = updater.updateIfBehind(123);

      // Fast-forward time to trigger the polling
      await jest.advanceTimersByTimeAsync(30000);

      const result = await resultPromise;

      expect(result.success).toBe(true);

      jest.useRealTimers();
    });

    it('should return failure if tests fail after update', async () => {
      mockValidator.isBehind.mockResolvedValue(true as never);
      mockAPI.updateBranch.mockResolvedValue(makeUpdateResult({ sha: 'new-sha' }) as never);
      mockAPI.getPullRequest.mockResolvedValue(makePR() as never);
      mockValidator.checkStatusChecks.mockResolvedValue({ valid: false } as never);
      mockAPI.getCommitStatus.mockResolvedValue([makeCheck('test', 'failure')] as never);

      const result = await updater.updateIfBehind(123);

      expect(result.success).toBe(false);
      expect(result.error).toContain('failed after branch update');
    });

    it('should return failure if update succeeds but returns no SHA', async () => {
      mockValidator.isBehind.mockResolvedValue(true as never);
      mockAPI.updateBranch.mockResolvedValue(
        makeUpdateResult() as never // success: true, but no sha
      );

      const result = await updater.updateIfBehind(123);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no SHA');
    });
  });

  describe('waitForTests', () => {
    it('should return false if PR is closed', async () => {
      mockAPI.getPullRequest.mockResolvedValue(makePR({ state: 'closed' }) as never);

      const result = await updater.waitForTests(123, 'sha123');

      expect(result).toBe(false);
    });

    it('should return true when all checks pass', async () => {
      mockAPI.getPullRequest.mockResolvedValue(makePR() as never);
      mockValidator.checkStatusChecks.mockResolvedValue({ valid: true } as never);

      const result = await updater.waitForTests(123, 'sha123');

      expect(result).toBe(true);
    });

    it('should return false when checks fail', async () => {
      mockAPI.getPullRequest.mockResolvedValue(makePR() as never);
      mockValidator.checkStatusChecks.mockResolvedValue({ valid: false } as never);
      mockAPI.getCommitStatus.mockResolvedValue([makeCheck('test', 'failure')] as never);

      const result = await updater.waitForTests(123, 'sha123');

      expect(result).toBe(false);
    });
  });
});
