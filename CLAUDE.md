# Claude Code Instructions for Merge Queue Project

## Project Overview

This is a TypeScript-based GitHub merge queue utility that automatically validates and merges approved PRs sequentially. It's designed as a standalone reusable repository that provides custom GitHub Actions for any repository to use.

## Key Architecture Principles

1. **Standalone Utility Pattern**: This repo provides reusable GitHub Actions that other repositories reference
2. **Multi-Repository Support**: Automatically supports any repository without code changes - state files are dynamically created
3. **Sequential Processing**: Process one PR at a time to ensure each is tested against the latest master
4. **Trust & Auto-Update**: Trust existing PR tests, auto-update branches when behind master
5. **Zero-Configuration**: State files auto-created, no manual setup needed for new repos

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js 20.x
- **GitHub API**: Octokit
- **Actions**: Custom GitHub Actions (composite actions)
- **State Storage**: JSON files in `merge-queue-state` branch

## File Structure

```
/src/
  /core/           # Core business logic
  /actions/        # GitHub Action definitions (add-to-queue, process-queue, remove-from-queue)
  /utils/          # Logging, constants, errors
  /types/          # TypeScript interfaces
```

## Development Guidelines

### Code Style
- Use TypeScript strict mode
- Prefer explicit types over `any`
- Use async/await over promises
- Follow existing naming conventions

### Security
- Never commit secrets or tokens
- Validate all inputs from GitHub events
- Use GitHub's GITHUB_TOKEN or PAT securely
- Implement proper error handling for API calls

### Testing
- Write unit tests for all core modules
- Test edge cases (conflicts, failures, race conditions)
- Validate cross-repo scenarios

## Important Workflows

### Queue Flow
1. PR labeled "ready" → validate → add to queue
2. Queue manager (cron/push) → process next PR
3. Validate conditions → update branch if behind → wait for tests → merge

### Branch Auto-Update Strategy
- If PR branch is behind master: automatically merge master into PR branch
- GitHub auto-runs tests after update
- Wait for tests to complete
- Merge if tests pass, remove from queue if they fail

## State Management

- State stored in `merge-queue-state` branch
- File naming: `{owner}-{repo}-queue.json`
- Auto-created on first use per repository
- Use atomic updates with force-with-lease

## Common Tasks

### Adding New Features
- Read existing code in `/src/core/` to understand patterns
- Add new modules in appropriate directory
- Update types in `/src/types/queue.ts` if needed
- Add unit tests

### Modifying Actions
- Actions are in `/src/actions/*/`
- Each action has `action.yml` (definition) and `index.ts` (implementation)
- Remember: these are referenced by other repos, so breaking changes affect consumers

### Debugging
- Check GitHub Actions logs in target repositories
- Examine state files in `merge-queue-state` branch
- Use structured logging (logger.ts)

## Documentation References

- Implementation plan: `claude-plan.md`
- Architecture decisions: See ADR files
- GitHub Actions docs: https://docs.github.com/en/actions

## Git Workflow

- Main branch: `main` or `master`
- Use conventional commits
- Tag releases for actions: `v1.0.0`, `v1.1.0`, etc.
- State branch: `merge-queue-state` (managed by actions, don't modify manually)

## Notes

- This is a reusable utility - changes here affect all consuming repositories
- Target repos reference actions like: `uses: org/merge-queue@v1/src/actions/add-to-queue`
- Each consuming repo needs a PAT stored as `MERGE_QUEUE_TOKEN` secret
