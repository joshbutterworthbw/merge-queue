# Mergify Merge Queue Process

```mermaid
flowchart TB
    subgraph monitor["Monitor PRs"]
        A[Monitor PRs] --> B{Conditions met?}
        B -->|No| A
        B -->|Yes| C[Add PR to queue]
    end

    subgraph queue_loop["Queue processing"]
        C --> D{Items in queue?}
        D -->|No| D
        D -->|Yes| E[Take first PR in queue]
        E --> F[Create draft PR: branch + latest main/master]
        F --> G[Wait for all tests to finish]
        G --> H{Tests pass?}
        
        H -->|Yes| I[Merge the original PR]
        I --> J[Close the draft PR]
        J --> D
        
        H -->|No| K[Dequeue the PR]
        K --> L[Add dequeued label]
        L --> M[Add comment to original PR]
        M --> E
    end

    subgraph conflicts["Conflict handling"]
        N[PR in queue] --> O{Conflicts with another PR in queue?}
        O -->|Yes| P[Dequeue the lower PR]
        P --> Q[Add message explaining what happened]
        O -->|No| N
    end

    subgraph requeue["After dequeued"]
        R[PR was dequeued] --> S{Bot detects changes to PR?}
        S -->|Can re-add| T[Automatically add back to queue]
        S -->|Manual| U[User manually re-adds to queue]
    end
```

## Simplified linear view

```mermaid
flowchart LR
    A[Monitor] --> B[Conditions met?]
    B --> C[Add to queue]
    C --> D[Take first PR]
    D --> E[Create draft PR]
    E --> F[Run tests]
    F --> G{Pass?}
    G -->|Yes| H[Merge + close draft]
    G -->|No| I[Dequeue, label, comment]
    H --> D
    I --> D
```

## Full process (single diagram)

```mermaid
flowchart TB
    Start([Monitor PRs]) --> Cond{Conditions met?}
    Cond -->|No| Start
    Cond -->|Yes| AddQueue[Add PR to queue]
    
    AddQueue --> HasItems{Items in queue?}
    HasItems -->|No| HasItems
    HasItems -->|Yes| TakeFirst[Take first PR in queue]
    
    TakeFirst --> ConflictCheck{Conflicts with another PR in queue?}
    ConflictCheck -->|Yes| DequeueLower[Dequeue lower PR in queue]
    DequeueLower --> MsgConflict[Add message explaining conflict]
    MsgConflict --> HasItems
    
    ConflictCheck -->|No| CreateDraft[Create draft PR: branch + latest main/master]
    CreateDraft --> WaitTests[Wait for all tests to finish]
    WaitTests --> TestResult{Tests pass?}
    
    TestResult -->|Yes| Merge[Merge the original PR]
    Merge --> CloseDraft[Close the draft PR]
    CloseDraft --> HasItems
    
    TestResult -->|No| Dequeue[Dequeue the PR]
    Dequeue --> AddLabel[Add dequeued label]
    AddLabel --> AddComment[Add comment to original PR]
    AddComment --> TakeFirst
    
    Dequeue -.->|Later| Changes{Changes detected on PR?}
    Changes -->|Auto| AddQueue
    Changes -->|Manual| ManualReadd[User manually re-adds to queue]
    ManualReadd --> AddQueue
```

---

**Legend**
- **Happy path:** Conditions met → add to queue → create draft → tests pass → merge.
- **Failure path:** Tests fail → dequeue, label, comment → process next PR.
- **Conflict:** PR conflicts with another in queue → lower PR is dequeued with message.
- **Re-queue:** After dequeued, PR can re-enter via bot (if changes allow) or manual re-add.
