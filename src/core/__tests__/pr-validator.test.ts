/**
 * Tests for PR validator
 */

import { PRValidator } from '../pr-validator';
import { GitHubAPI } from '../github-api';
import type { QueueConfig } from '../../types/queue';
import { DEFAULT_CONFIG } from '../../utils/constants';

// Mock GitHubAPI
jest.mock('../github-api');

describe('PRValidator', () => {
  let mockAPI: jest.Mocked<GitHubAPI>;
  let validator: PRValidator;
  let config: QueueConfig;

  beforeEach(() => {
    config = { ...DEFAULT_CONFIG };

    mockAPI = {
      getPullRequest: jest.fn(),
      getPRReviews: jest.fn(),
      getCommitStatus: jest.fn(),
      isBranchBehind: jest.fn(),
    } as any;

    validator = new PRValidator(mockAPI, config);
  });

  /** Helper: set up mocks for a PR that passes all checks */
  function mockValidPR() {
    mockAPI.getPullRequest.mockResolvedValue({
      state: 'open',
      draft: false,
      labels: [],
      head: { sha: 'abc123' },
      mergeable: true,
    } as any);

    mockAPI.getPRReviews.mockResolvedValue([
      { user: { login: 'reviewer1' }, state: 'APPROVED' },
    ] as any);

    mockAPI.getCommitStatus.mockResolvedValue([
      { name: 'test', status: 'success' },
    ] as any);

    mockAPI.isBranchBehind.mockResolvedValue(false);
  }

  describe('validate', () => {
    it('should reject closed PRs', async () => {
      mockAPI.getPullRequest.mockResolvedValue({
        state: 'closed',
        draft: false,
        labels: [],
        head: { sha: 'abc123' },
        mergeable: true,
      } as any);

      const result = await validator.validate(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('closed');
    });

    it('should reject draft PRs when not allowed', async () => {
      config.allowDraft = false;

      mockAPI.getPullRequest.mockResolvedValue({
        state: 'open',
        draft: true,
        labels: [],
        head: { sha: 'abc123' },
        mergeable: true,
      } as any);

      const result = await validator.validate(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('draft');
    });

    it('should reject PRs with blocking labels', async () => {
      mockAPI.getPullRequest.mockResolvedValue({
        state: 'open',
        draft: false,
        labels: [{ name: 'do-not-merge' }],
        head: { sha: 'abc123' },
        mergeable: true,
      } as any);

      mockAPI.getPRReviews.mockResolvedValue([
        { user: { login: 'reviewer1' }, state: 'APPROVED' },
      ] as any);

      const result = await validator.validate(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('blocking label');
    });

    it('should reject PRs with merge conflicts', async () => {
      mockAPI.getPullRequest.mockResolvedValue({
        state: 'open',
        draft: false,
        labels: [],
        head: { sha: 'abc123' },
        mergeable: false,
      } as any);

      mockAPI.getPRReviews.mockResolvedValue([
        { user: { login: 'reviewer1' }, state: 'APPROVED' },
      ] as any);

      mockAPI.getCommitStatus.mockResolvedValue([
        { name: 'test', status: 'success' },
      ] as any);

      mockAPI.isBranchBehind.mockResolvedValue(false);

      const result = await validator.validate(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('merge conflicts');
    });

    it('should accept valid PRs', async () => {
      mockValidPR();

      const result = await validator.validate(123);

      expect(result.valid).toBe(true);
      expect(result.checks).toBeDefined();
      expect(result.checks?.approved).toBe(true);
      expect(result.checks?.checksPass).toBe(true);
      expect(result.checks?.noConflicts).toBe(true);
    });
  });

  describe('checkApproval', () => {
    it('should reject PRs with no reviews', async () => {
      mockAPI.getPRReviews.mockResolvedValue([]);

      const result = await validator.checkApproval(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no approving reviews');
    });

    it('should reject PRs with only comment reviews (no approval)', async () => {
      mockAPI.getPRReviews.mockResolvedValue([
        { user: { login: 'reviewer1' }, state: 'COMMENTED' },
      ] as any);

      const result = await validator.checkApproval(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no approving reviews');
    });

    it('should reject PRs with outstanding changes requested', async () => {
      mockAPI.getPRReviews.mockResolvedValue([
        { user: { login: 'reviewer1' }, state: 'APPROVED' },
        { user: { login: 'reviewer2' }, state: 'CHANGES_REQUESTED' },
      ] as any);

      const result = await validator.checkApproval(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('changes requested');
    });

    it('should accept PRs with at least one approval', async () => {
      mockAPI.getPRReviews.mockResolvedValue([
        { user: { login: 'reviewer1' }, state: 'APPROVED' },
      ] as any);

      const result = await validator.checkApproval(123);

      expect(result.valid).toBe(true);
    });

    it('should use latest review per reviewer', async () => {
      // reviewer1 initially requested changes, then approved
      mockAPI.getPRReviews.mockResolvedValue([
        { user: { login: 'reviewer1' }, state: 'CHANGES_REQUESTED' },
        { user: { login: 'reviewer1' }, state: 'APPROVED' },
      ] as any);

      const result = await validator.checkApproval(123);

      expect(result.valid).toBe(true);
    });

    it('should reject when latest review is changes requested even after prior approval', async () => {
      // reviewer1 approved, then re-requested changes
      mockAPI.getPRReviews.mockResolvedValue([
        { user: { login: 'reviewer1' }, state: 'APPROVED' },
        { user: { login: 'reviewer1' }, state: 'CHANGES_REQUESTED' },
      ] as any);

      const result = await validator.checkApproval(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('changes requested');
    });

    it('should accept when one reviewer approves and another has a dismissed review', async () => {
      mockAPI.getPRReviews.mockResolvedValue([
        { user: { login: 'reviewer1' }, state: 'APPROVED' },
        { user: { login: 'reviewer2' }, state: 'DISMISSED' },
      ] as any);

      const result = await validator.checkApproval(123);

      expect(result.valid).toBe(true);
    });

    it('should ignore reviews from users with null login', async () => {
      mockAPI.getPRReviews.mockResolvedValue([
        { user: null, state: 'APPROVED' },
      ] as any);

      const result = await validator.checkApproval(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no approving reviews');
    });

    it('should reject PRs via validate when not approved', async () => {
      mockAPI.getPullRequest.mockResolvedValue({
        state: 'open',
        draft: false,
        labels: [],
        head: { sha: 'abc123' },
        mergeable: true,
      } as any);

      mockAPI.getPRReviews.mockResolvedValue([]);

      const result = await validator.validate(123);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no approving reviews');
      expect(result.checks?.approved).toBe(false);
    });
  });
});
