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
     * Write the queue state to the state branch
     */
    writeState(state: QueueState, retryOnConflict?: boolean): Promise<void>;
    /**
     * Add a PR to the queue
     */
    addToQueue(pr: QueuedPR): Promise<number>;
    /**
     * Remove a PR from the queue
     */
    removeFromQueue(prNumber: number): Promise<boolean>;
    /**
     * Get the next PR from the queue
     */
    getNextPR(): Promise<QueuedPR | null>;
    /**
     * Set the current PR being processed
     */
    setCurrentPR(current: CurrentPR | null): Promise<void>;
    /**
     * Update current PR status
     */
    updateCurrentStatus(status: CurrentPR['status'], updated_at?: string): Promise<void>;
    /**
     * Complete processing of current PR and add to history
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