/**
 * Queue state management with Git-based persistence
 */
import { Logger } from '../utils/logger';
import type { QueueState, QueuedPR, CurrentPR, HistoryEntry, RepositoryInfo } from '../types/queue';
/**
 * Generate state file name for a repository
 */
export declare function getStateFileName(repo: RepositoryInfo): string;
/**
 * Create an empty queue state
 */
export declare function createEmptyState(): QueueState;
/**
 * Queue state manager with Git-based persistence
 */
export declare class QueueStateManager {
    private mergeQueueRepo;
    private targetRepo;
    private octokit;
    private logger;
    private stateFileName;
    constructor(token: string, mergeQueueRepo: RepositoryInfo, targetRepo: RepositoryInfo, logger?: Logger);
    /**
     * Initialize the state branch if it doesn't exist
     */
    initializeStateBranch(): Promise<void>;
    /**
     * Create the state branch
     */
    private createStateBranch;
    /**
     * Read the queue state from the state branch
     */
    readState(): Promise<QueueState>;
    /**
     * Write the queue state to the state branch.
     *
     * Throws ConcurrencyError on 409 conflict so that callers (atomicUpdate)
     * can re-read fresh state and retry the full mutation.
     */
    writeState(state: QueueState): Promise<void>;
    /**
     * Perform a state mutation atomically using a compare-and-swap loop.
     *
     * Reads the latest state, applies the mutation function, then attempts to
     * write. If a 409 conflict occurs (another process wrote in between), the
     * entire cycle is retried with fresh state — ensuring no updates are lost.
     *
     * @param mutate - Function that receives the latest state and returns a result.
     *                 It should mutate the state object in-place.
     * @param maxRetries - Maximum number of retry attempts (default: 5).
     * @returns The value returned by the mutate function on the successful attempt.
     */
    atomicUpdate<T>(mutate: (state: QueueState) => T, maxRetries?: number): Promise<T>;
    /**
     * Add a PR to the queue (concurrency-safe).
     *
     * Uses atomicUpdate to ensure that concurrent add operations don't
     * overwrite each other — each attempt re-reads the latest state.
     */
    addToQueue(pr: QueuedPR): Promise<number>;
    /**
     * Remove a PR from the queue (concurrency-safe).
     */
    removeFromQueue(prNumber: number): Promise<boolean>;
    /**
     * Get the next PR from the queue
     */
    getNextPR(): Promise<QueuedPR | null>;
    /**
     * Set the current PR being processed (concurrency-safe).
     */
    setCurrentPR(current: CurrentPR | null): Promise<void>;
    /**
     * Update current PR status (concurrency-safe).
     */
    updateCurrentStatus(status: CurrentPR['status'], updated_at?: string): Promise<void>;
    /**
     * Complete processing of current PR and add to history (concurrency-safe).
     */
    completeCurrentPR(entry: HistoryEntry): Promise<void>;
    /**
     * Get queue position for a PR
     */
    getQueuePosition(prNumber: number): Promise<number | null>;
    /**
     * Validate queue state structure
     */
    private validateState;
    /**
     * Sleep for a specified duration
     */
    private sleep;
}
//# sourceMappingURL=queue-state.d.ts.map