/**
 * Shared typed mock factories for core tests.
 *
 * These helpers replace the `as any` pattern used previously.
 * Each factory returns a properly typed partial mock — mock methods
 * are type-checked against the real class signatures so that
 * refactors break tests at compile time rather than silently.
 *
 * The `as unknown as FullType` cast is applied once at the call site
 * (the class constructor), making the intent explicit.
 */

import type { GitHubAPI } from '../github-api';
import type { PRValidator } from '../pr-validator';
import type { BranchUpdater } from '../branch-updater';
import type { CheckStatus, UpdateResult } from '../../types/queue';

/* ------------------------------------------------------------------ */
/*  GitHubAPI partial mocks                                           */
/* ------------------------------------------------------------------ */

/** Methods used by BranchUpdater tests */
export type BranchUpdaterAPIMethods = Pick<
  GitHubAPI,
  'updateBranch' | 'getPullRequest' | 'getCommitStatus'
>;

/** Methods used by PRValidator tests */
export type ValidatorAPIMethods = Pick<
  GitHubAPI,
  'getPullRequest' | 'getPRReviews' | 'getCommitStatus' | 'isBranchBehind'
>;

export function createMockGitHubAPI<T extends Partial<GitHubAPI>>(
  methods: (keyof T)[]
): jest.Mocked<T> {
  const mock: Record<string, jest.Mock> = {};
  for (const m of methods) {
    mock[m as string] = jest.fn();
  }
  return mock as jest.Mocked<T>;
}

/* ------------------------------------------------------------------ */
/*  PRValidator partial mocks                                         */
/* ------------------------------------------------------------------ */

/** Methods used by BranchUpdater tests */
export type BranchUpdaterValidatorMethods = Pick<PRValidator, 'isBehind' | 'checkStatusChecks'>;

export function createMockValidator<T extends Partial<PRValidator>>(
  methods: (keyof T)[]
): jest.Mocked<T> {
  const mock: Record<string, jest.Mock> = {};
  for (const m of methods) {
    mock[m as string] = jest.fn();
  }
  return mock as jest.Mocked<T>;
}

/* ------------------------------------------------------------------ */
/*  Minimal PullRequest-like fixture                                  */
/* ------------------------------------------------------------------ */

/** The subset of PullRequest fields used across tests */
export interface PRFixture {
  state: string;
  draft?: boolean;
  labels?: { name?: string }[];
  head?: { sha: string; ref?: string };
  base?: { ref?: string };
  mergeable?: boolean | null;
  user?: { login: string } | null;
}

/**
 * Build a minimal PR fixture with sensible defaults.
 * Overrides are merged shallowly.
 */
export function makePR(overrides: Partial<PRFixture> = {}): PRFixture {
  return {
    state: 'open',
    draft: false,
    labels: [],
    head: { sha: 'abc123' },
    mergeable: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  CheckStatus fixture                                               */
/* ------------------------------------------------------------------ */

export function makeCheck(name: string, status: CheckStatus['status']): CheckStatus {
  return { name, status };
}

/* ------------------------------------------------------------------ */
/*  UpdateResult fixture                                              */
/* ------------------------------------------------------------------ */

export function makeUpdateResult(overrides: Partial<UpdateResult> = {}): UpdateResult {
  return {
    success: true,
    conflict: false,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  ProcessQueue partial mocks                                        */
/* ------------------------------------------------------------------ */

/** GitHubAPI methods used by processPR tests */
export type ProcessQueueAPIMethods = Pick<
  GitHubAPI,
  | 'addLabels'
  | 'removeLabel'
  | 'getPullRequest'
  | 'mergePullRequest'
  | 'deleteBranch'
  | 'addComment'
>;

/** PRValidator methods used by processPR tests */
export type ProcessQueueValidatorMethods = Pick<PRValidator, 'validate' | 'isBehind'>;

/** BranchUpdater methods used by processPR tests */
export type ProcessQueueUpdaterMethods = Pick<BranchUpdater, 'updateIfBehind'>;

export function createMockBranchUpdater<T extends Partial<BranchUpdater>>(
  methods: (keyof T)[]
): jest.Mocked<T> {
  const mock: Record<string, jest.Mock> = {};
  for (const m of methods) {
    mock[m as string] = jest.fn();
  }
  return mock as jest.Mocked<T>;
}
