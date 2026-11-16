---
id: FEAT-003
title: Merge and rebase
status: active
implementation_status: implemented
version: 0.25.0
owners: [Parth Patel]
created: 2026-11-15
last_updated: 2026-11-16
last_verified_commit: none
---

# Merge and rebase

One sentence: merge a branch into the current branch, rebase the current branch onto another, and finish or abandon either one from the Git panel.

## 1. Snapshot

| Field | Value |
| --- | --- |
| Surface | The branch row actions pane, the operation banner above the tabs, the merge and rebase dialogs, the abort and skip confirms, and the conflict resolve controls |
| Actors | Developer using the harness |
| Entry point | The branch chip in the panel header, then the ⋯ button on a branch row |
| Primary outcome | Start, resolve, and finish or abandon a merge or rebase without a terminal |
| State | Implemented in the working tree. Typecheck, build, and 87 tests pass. Not committed, so `last_verified_commit` stays `none`. |
| Parent | [FEAT-001-git-integration.md](FEAT-001-git-integration.md) |

## 2. Problem and outcome

The panel can check out branches, pull with a fast-forward, and resolve a conflicted file by whole side, but it cannot start a merge or a rebase. When either is already running, it shows a conflict and refuses every history action, and it has no Continue or Abort. The user has to leave the panel.

The outcome is a complete loop. Start the operation from a branch row, resolve in Changes, then continue or abort. A rebase can also skip the stopped commit. The same banner works for an operation started in a terminal, where a page reload loses the branch names.

## 3. Scope

In scope:

- Merge a local or remote branch into the current branch.
- Rebase the current branch onto a local or remote branch.
- Continue and Abort for a merge and a rebase. Skip for a rebase.
- A preview of the commits a rebase will replay and how many are already pushed.
- An operation banner that shows while a merge or rebase is in progress, including one started outside the panel, in every tab.

Out of scope: interactive rebase, squash merge, choosing a merge strategy, `--onto`, rebase with autostash, per-hunk conflict editing (FEAT-001 defers the three-pane editor), abort for a pending revert or cherry-pick, automatic fetch before a remote merge or rebase, and force push.

## 4. Terms

- Current branch: the branch HEAD is on.
- Source: the branch chosen in the menu.
- Merge: `git merge --no-edit [--no-ff] <source>` into the current branch.
- Rebase: `git rebase <source>` for the current branch.
- Operation in progress: `status.merging` or `status.rebasing`.
- Preview: the `rebasePreview` read that returns the replay and pushed commit counts.
- Stopped commit: the commit a rebase is paused on, exposed as `status.operationCommit` while the rebase state directories exist.

## 5. Control flow

1. The user opens the branch chip and presses ⋯ on a branch other than the current one. The actions pane shows Checkout, Merge into the current branch, and Rebase the current branch onto the source. Every row states why it is disabled when it cannot run.
2. Merge opens the merge dialog. Rebase first reads `rebasePreview`; the dialog then shows the replay count, the upstream count, and any dirty-tree warning.
3. The client sends `merge` or `rebase` with the source name. The host re-reads status, applies its guards, then runs Git.
4. A command that finishes without a conflict applies the fresh status, closes the dialog, and shows a toast. A refusal stays in the dialog with Git's message.
5. A conflict is not an error. The host returns normally with `merging` or `rebasing` true and the conflicted paths. The client remembers the source, switches to Changes, and renders the banner above the tabs.
6. The user resolves each file with the branch-named Take controls or in the editor, then stages it. Continue is disabled while any file is unresolved. Skip for a rebase and Abort confirm because they destroy work; Continue does not.
7. Continue finishes the operation or stops again on the next commit. The banner stays, the status updates, and the client shows the next conflict. Skip drops the stopped commit and either finishes or stops again. Abort restores the branch, the index, and the files.
8. If the panel did not start the operation, it shows a generic banner from status alone. The client clears the remembered source when a status read reports neither `merging` nor `rebasing`.

## 6. Contracts

New endpoints in [rpc.ts](../../src/host/lib/rpc.ts), each requiring `workspaceId` and, for an explicit repository, `repo`:

| Endpoint | Payload | Git command |
| --- | --- | --- |
| `merge` | `branch`, `noFastForward` | `git merge --no-edit --ff <branch>`, with `--no-ff` when requested |
| `rebase` | `branch` | `git rebase <branch>` |
| `rebasePreview` | `branch` | `git rev-list --count <branch>..HEAD`, plus the same read with `--not <upstream>` |
| `operationContinue` | none | `git merge --continue` or `git rebase --continue` with `GIT_EDITOR=true` and `GIT_SEQUENCE_EDITOR=true` |
| `operationAbort` | none | `git merge --abort` or `git rebase --abort` |
| `rebaseSkip` | none | `git rebase --skip` with `GIT_EDITOR=true` and `GIT_SEQUENCE_EDITOR=true` |

[contract.ts](../../src/contract.ts) changes:

- `OperationResult` gains `conflicted?: string[]` when a command stops on conflicts, and `skipped?: string` for the commit a rebase skipped.
- `RebasePreview` is `{ commits: number; pushed: number; upstream: string | null }`.
- `StatusSnapshot` gains `operationCommit?: string | null`, read from `REBASE_HEAD` only while a rebase state directory exists.
- `StatusSnapshot` does not gain the operation source. The client keeps the source for an operation it starts, so a reload drops the branch names by design.

Rebase detection in [git.ts](../../src/host/lib/git.ts) reads the two state directories with `git rev-parse --path-format=absolute --git-path rebase-merge --git-path rebase-apply` and stats them. `REBASE_HEAD` is not the signal: Git leaves it behind after a successful rebase.

`RunOptions` in [exec.ts](../../src/host/lib/exec.ts) gains `env?: Record<string, string | undefined>`, merged into the command environment. The continue and skip commands use it to suppress editors.

## 7. Business rules

- Refuse a new merge or rebase with `git/operation-in-progress` when a merge, rebase, revert, or cherry-pick is already running. Continue, Abort, and Skip are the exceptions.
- Refuse on a detached HEAD with `git/detached`.
- Refuse when the source is the current branch or cannot resolve, with `git/branch-invalid`.
- Refuse a rebase when the working tree has any entry, including an untracked file, with `git/dirty-tree`. Git refuses too, and autostash is out of scope.
- A merge runs on a dirty tree only if Git accepts it. Otherwise the dialog shows Git's message.
- Merge defaults to fast-forward. The host passes `--ff`, so a repository's `merge.ff=false` setting does not break the dialog's promise. The dialog checkbox adds `--no-ff`.
- A remote source uses its full name, such as `origin/main`, and creates no local branch. Neither operation fetches; the dialog says so.
- Continue refuses while any file is still conflicted, with `git/conflict`. It uses the message Git prepared.
- A rebase stops again if a later commit conflicts. The banner stays and the client shows the next conflict.
- Abort or Continue with neither operation running fails with `git/no-operation`. Skip requires a rebase.
- A failed abort is a `git/merge-abort-failed` or `git/rebase-abort-failed` error with Git's text. The client shows it and re-reads status, so a banner for an operation that already ended clears.
- The preview counts the commits in `<source>..HEAD`. The pushed count is the total minus the commits `<source>..HEAD --not <upstream>`. No upstream means zero pushed commits.
- The client keeps the operation source only for an operation it starts. A terminal start or reload shows "Merge in progress" or "Rebase in progress".
- The banner is above the tabs in Changes, History, and Stashes. Continue is disabled while any file is conflicted; the host refuses it anyway.
- While a merge or rebase runs, the commit box is hidden and an operation footer points at the banner. Branch rows, the branch actions, and New branch are disabled with the reason visible.
- The conflict controls name the two branches. A caption states `ours` and `theirs`; during a rebase the caption shows that `ours` is the branch replayed onto and `theirs` is the user's work.
- Abort and Skip open a confirm. Cancel sends no request. The Skip confirm names the stopped commit when status carries `operationCommit`; the toast names the skipped commit from the response.
- A completed merge or rebase shows the result in a toast and clears the remembered operation. A merge started outside the panel finishes with "Merge finished" instead of naming branches.

## 8. Acceptance criteria

| ID | Criterion | Test |
| --- | --- | --- |
| AC-122 | Merging a branch that is ahead fast-forwards the current branch, creates no merge commit even when `merge.ff=false`, and returns clean status. | host, [merge.test.mjs](../../tests/merge.test.mjs) |
| AC-123 | Merging a diverged branch with no conflict creates a two-parent commit. | host |
| AC-124 | `noFastForward` creates a merge commit even when a fast-forward is possible. | host |
| AC-125 | A merge with a conflict returns normally with `merging: true` and the conflicted paths. The files hold conflict markers. | host |
| AC-102 | Continue after resolving and staging every file creates the merge commit and clears `merging`. Continue with a conflict left throws `git/conflict`. | host |
| AC-103 | Abort after a conflicted merge restores HEAD, the index, and the files. | host |
| AC-104 | Rebase of a diverged branch replays its commits on the source and leaves a linear history with the source as ancestor. | host |
| AC-105 | A rebase with a conflict returns `rebasing: true` with the conflicted path and the stopped commit, even after the conflict is staged and before Continue. | host |
| AC-106 | Continue finishes the rebase. Skip drops the stopped commit. Abort restores the branch to its original commit. | host |
| AC-107 | Merge or rebase of the current branch, a missing branch, or from a detached HEAD fails with the named code and runs no Git write command. | host |
| AC-108 | A rebase with a modified or staged file fails with `git/dirty-tree` and leaves the file untouched. | host |
| AC-109 | Merge or rebase is refused while a merge, rebase, revert, or cherry-pick is in progress. Continue and Abort are not. | host |
| AC-110 | A remote source such as `origin/main` merges and rebases without creating a local branch. | host |
| AC-111 | The branch menu offers Checkout, Merge, and Rebase for each branch except the current one, and disables the rows and actions while an operation is in progress, with the reason visible. | client, [client.test.mjs](../../tests/client.test.mjs) |
| AC-112 | The merge dialog has the merge commit checkbox. The rebase dialog warns when replayed commits are already pushed. Cancel sends no merge or rebase request. | client |
| AC-113 | While `merging` or `rebasing` is true the banner names the operation, counts unresolved files, and offers Continue and Abort, plus Skip for a rebase. Continue is disabled while a conflict remains. | client |
| AC-114 | A conflicting merge or rebase switches the panel to Changes and shows the banner. Abort confirms, then hides it. | client |
| AC-115 | Every new string has EN and ZH entries, and the new icon-only controls have both an `aria-label` and a `title`. | client, string parity test |
| AC-126 | The preview returns the replay count, the pushed count, and the upstream, including zero pushed without an upstream. | host |
| AC-127 | While an operation runs the commit box is hidden and a finish hint points at the banner. No plain commit control is offered. | client |
| AC-128 | Abort and Skip open a confirm. Cancel sends no request. The Skip confirm names the stopped commit when status provides it. | client |
| AC-129 | The resolve controls name both branches, the caption states ours and theirs, and during a rebase the two sides are shown swapped. | client |
| AC-130 | An operation the panel did not start shows a generic banner. Continue and Abort still work and a rebase still offers Skip. | client |

The earlier plan used AC-098 through AC-101 for the four merge cases. Those numbers already belong to FEAT-001, so the cases moved to AC-122 through AC-125. AC-102 through AC-115 keep their numbers.

## 9. Failure behavior

- Git refuses a start or a continue: the error stays in the operating dialog for a start and in the panel error strip for a continue. The status re-reads after a failed continue, abort, or skip.
- A rebase or merge is already running when the panel opens: the banner appears from status alone. Continue and Abort work; Skip appears for a rebase. The branch names are unknown.
- Abort fails because the operation already ended: the host returns Git's text with the abort failure code. The client shows it, re-reads status, and the banner clears.
- A rebase stops again: the banner stays, the unresolved count updates, and the client shows "Rebase stopped again at the next commit."
- The commit box is absent while an operation runs, so a normal commit cannot finish a rebase. The host would still refuse to finish a rebase with a plain commit because `rebase --continue` is required.
- A status read after a successful rebase does not report `rebasing`: the rebase state directories are gone even though `REBASE_HEAD` may remain.

## 10. Implementation map

Existing, verified:

- [contract.ts](../../src/contract.ts): `OperationResult.conflicted`, `OperationResult.skipped`, `RebasePreview`, `StatusSnapshot.operationCommit`.
- [exec.ts](../../src/host/lib/exec.ts): `RunOptions.env`; `createRuntime` merges it into the command environment.
- [git.ts](../../src/host/lib/git.ts): `readStatus` rebase-directory detection and `operationCommit`; `merge`, `rebase`, `rebasePreview`, `operationContinue`, `operationAbort`, `rebaseSkip`; `branchArgument`, `branchTip`, `mergeOrRebase`, `operationFailure`.
- [rpc.ts](../../src/host/lib/rpc.ts): six endpoint cases.
- [main.ts](../../src/client/main.ts): `GitMethods` entries; `ActiveOperation`, `OperationSides`, `OperationDialog`; `BranchMenu` actions pane; `MergeDialog`, `RebaseDialog`; `OperationBanner`; `ChangesView` operation footer and labels; `DiffView` branch-named resolve controls; `GitPanel` handlers and operation memory; EN and ZH strings; new CSS.
- Tests: [merge.test.mjs](../../tests/merge.test.mjs) covers AC-102 through AC-110, AC-122 through AC-126. [client.test.mjs](../../tests/client.test.mjs) covers AC-111 through AC-115 and AC-127 through AC-130. [git-fixture.mjs](../../tests/git-fixture.mjs) passes the command environment through the test runtime.

Generated, rebuilt with `npm run build`:

- `client.js` and `dist/` for the host.

## 11. Risks

- Rebasing pushed commits rewrites shared history. The dialog warns, but the panel has no force push. A rejected push shows Git's message.
- During a rebase `ours` is the branch being rebased onto. The resolve controls use branch names and a caption to show the swap, but the underlying Git terms stay in the protocol.
- `REBASE_HEAD` survives a successful rebase. The host uses the rebase-merge and rebase-apply directories instead; the stopped commit is exposed only while those directories exist.
- The rebase-apply directory can also belong to `git am`, which this panel does not support. An `am` in progress would show a rebase banner and Continue would fail with Git's message.
- The pushed-commit preview uses local refs. A stale remote-tracking ref can make the warning wrong until the next fetch.
- The replay count comes from `rev-list`; a merge commit in the replayed range is counted but flattened by a non-interactive rebase.
- The merge commit message is the one Git prepares. The panel hides the commit box during the operation, so it cannot edit that message.
- Continue and Skip rely on `GIT_EDITOR=true`. The runtime now passes custom environment variables; a future runtime change must keep them.

## 12. Open questions

None for this change. Force push, interactive rebase, and abort for a revert or cherry-pick remain out of scope.

## 13. Changelog

- 2026-11-15: plan written. Nothing implemented.
- 2026-11-16: bumped the package and this document to 0.25.0 for the merge and rebase release.
- 2026-11-16: approved the list, activity, and dialog prototype. Implemented the host endpoints, the preview read, rebase-directory detection, the branch actions pane, both dialogs, the operation banner, the commit box replacement, the confirm flows, the branch-named resolve controls, the generic banner for an operation started outside the panel, and EN and ZH strings. Added host and client tests and rebuilt `client.js` and `dist/`. AC-098 through AC-101 moved to AC-122 through AC-125 because FEAT-001 already uses the earlier numbers. Verified with `npm run typecheck`, `npm run build`, and `npm test` (87 passing) in the working tree; `last_verified_commit` remains `none` until the change is committed.
