# Implementation notes

The Git bundle is implemented and installed in the `web` profile. The host half is active. The client half is a right-sidebar tab type, contributed to the Host client graph and loaded on the next window reload.

Both halves are TypeScript. `src/host/` compiles with `tsc` to `dist/`, which is the package entry; `src/client/` is bundled by esbuild to `client.js` in the harness module-loader format. The wire shapes the two halves exchange live in `src/contract.ts`. `npm run typecheck` checks both projects, `npm test` loads the built bundle in jsdom and the compiled host entry in Node, and `npm run build` produces `dist/` and `client.js`. The built output is committed because the profile links this folder and the harness imports it without a build step.

## Package

The package name is `dsh-git-desk`. The source folder stays `dsh-git`. The bundle row id, the insert name, and the client module id are `dsh-git-desk`. The right-sidebar slot keys stay `dsh-git`, so the UI keys and stored layout preferences did not change.

## What exists

| Path | Role |
| --- | --- |
| `package.json` | Bundle manifest, `dsh.client`, locale and icon exports |
| `cordis.patch.yml` | One host row, `dsh-git-desk` |
| `src/contract.ts` | Wire shapes shared by both halves |
| `src/host/index.ts` | Host entry, `/git-rpc` route registration |
| `src/host/lib/types.ts` | Host service contracts: subprocess, workspace registry, connection, web server |
| `src/host/lib/exec.ts` | `ctx.subprocess` runner, timeout, cancellation, error mapping |
| `src/host/lib/parse.ts` | Porcelain v2, numstat, zero-context hunks, full-file rows, log, stash |
| `src/host/lib/git.ts` | Status, versions, diff, block edits, commit, branch, sync, log, stash, conflicts, history actions |
| `src/host/lib/rpc.ts` | Endpoint dispatch, payload narrowing, workspace resolution |
| `src/host/lib/http.ts` | Authenticated `/git-rpc` envelope over `ctx.connection.admit` |
| `src/host/lib/ai.ts` | One `ctx.llm` call over the staged patch; model comes from `agentDefaultModel` |
| `dist/` | Compiled host output; the package entry is `dist/host/index.js` |
| `src/client/main.ts` | Right-sidebar tab body and title, Start-guide card, compact and wide layouts, split and unified diff, commit menu, dialogs, locales, styles |
| `src/client/harness.ts` | The client services the harness injects |
| `client.js` | Built client bundle in the module-loader format |
| `scripts/build.mjs` | esbuild bundle and loader wrapper |
| `tests/host.test.mjs`, `tests/client.test.mjs` | Host entry and route, bundle registration and first render |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title and description |
| `icon.png` | Plugin Manager icon, approved periwinkle artwork at 512 × 512 pixels, below DSH's 256 KiB limit |

## Placement

The Git surface is a right-sidebar tab type, not a global panel.

- `ctx.sidebarRightTabs.register` contributes the type, the guide card, and the tab title.
- `sidebar.right.pane.tab` supplies the body under the definition id `dsh-git`.
- `sidebar.right.pane.tab.title` supplies the chip content.
- The Start guide lists a **Git changes** card. Picking it opens the tab in the right pane.
- The body reads the current session's workspace from `useSessions` and the workspace registry. The panel is tied to the session, so each project opens its own repository.
- The type does not contribute to `sidebar.panellist`, so no Git item appears above the Workspace session list.

The right pane is narrow. Changes, History, and Stashes are styled with native segmented tabs (`--dsw-alias-bg-module-platform`, `--dsw-radius-lg`). The body strictly maintains a two-panel architecture: Panel 1 on the left is the navigator/action area (Changes list + commit box, or History commit list + changed files summary, or Stashes list), and Panel 2 on the right is the full-height Diff Preview for the selected file. Below 900 pixels the panel switches to a compact layout: the list and diff take turns at full width, and a back control returns to the list. The split diff stays the default; the unified diff is one click away. The normal right pane is a preview at this width, and the fullscreen right panel gives the split its intended width. The wide and compact layout preferences are stored separately.

The diff toolbar carries two arrows and the count of changes in the file, `2/5`. The arrows move to the previous or next change and align both panes on the same row. The count follows manual scrolling. In unified view the arrows move the single pane. Every icon-only control sets `title` to its accessible name, so the native tooltip and the accessibility tree show the same text.

In History, selecting a commit automatically selects the first changed file and loads its diff in the preview panel. Root and orphan commits diff cleanly against an empty parent tree. Commit hash parsing in `git log` output strips record newlines so selecting any commit in the list resolves reliably without invalid-commit errors.

The sparkle button in the commit row opens two AI actions. **Write a commit message** fills the message field. **Create a branch and commit** fills it and opens the branch dialog with the generated name. The host sends the staged patch and the last five subjects to `ctx.llm` with the provider and model from `agentDefaultModel.currentSelection()`. The reply is cleaned to one `type(scope): summary` line. Nothing is sent unless the user clicks one of the rows.

Each file row has one hover action, `+` to stage or `−` to unstage. Each section header carries one icon for the whole section: `+` on Unstaged and `−` on Staged, with the tooltip `Stage all` or `Unstage all`. Both send one request with every path in the section. Conflicted files are never included. A rename also sends its original path, so one action never leaves half of a rename staged. The action is disabled while another file operation runs.

The Changes list also supports multi-select. Cmd-click on macOS, Ctrl-click elsewhere, or Ctrl/Cmd+Space toggles a file; Shift-click or Shift+Space selects the filtered range in one section; a plain click collapses to one file. Changing the filter clears the batch. At two or more files a bar above the list shows the count and offers Stage, Unstage, Discard, and Clear. Stage and Unstage send one request with `entryPaths`, Discard sends one request with the unique entry paths and `confirm: true`. A successful action clears the batch and closes the diff. Conflicted files never join a batch, and a modified click on one is ignored. In the compact layout a modified click sets a batch mode that keeps the list mounted, so the bar stays reachable; a plain click returns to the diff. The row and section controls and the diff trash control keep their single-file behavior.

## Architecture

The browser never runs Git. It calls `ctx.connection.rpc.call('/git-rpc', endpoint, payload)`. The host registers a prefix route on `ctx.webServer` and admits the request through `ctx.connection.admit`, so the same signed browser cookie protects Git data. Only an owner Peer reaches a handler.

The host resolves the workspace from `ctx.workspaceRegistry.get(workspaceId)`. The first `status` call discovers repositories: the workspace root if it is inside a repository, plus repositories up to two levels below, skipping `node_modules` and hidden directories and stopping at 40. The client picks one, stores it per workspace, and sends its absolute root as `repo` on every later call. The host resolves that root with `git rev-parse --show-toplevel` and rejects a relative path or a root outside the workspace, so a stale or forged root cannot reach another repository. The repository that encloses the workspace is the one exception; a workspace subdirectory still shows its repository. Git runs through `ctx.subprocess` with an argv array, no shell, `LC_ALL=C`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, and a wall clock. Local commands time out after 30 seconds, network commands after 180 seconds.

Every write returns a fresh status snapshot. The client renders only from that snapshot, then reloads the current diff.

## Diff model

- Unstaged compares the index to the working tree. Labels are `Staged` and `Local`. Each block has two arrows. The left arrow stages the local block. The right arrow replaces the local block with the staged version and asks for confirmation first.
- Staged compares `HEAD` to the index. Labels are `HEAD` and `Staged`. Each block has one right arrow, which unstages the block.
- The full file is read on both sides. Unchanged lines are ordinary rows. Nothing is collapsed.
- Git computes the hunk boundaries with `-U0`; the host expands them into full-file rows and pairs removed and added lines inside each hunk.
- A block write rebuilds the index blob from the exact versions the diff came from, then uses `git hash-object -w` and `git update-index --cacheinfo`. The request carries the hashes of both sides, so a stale file is rejected instead of overwritten.
- Binary files show a size delta and no block controls.
- Conflict files show the working tree text with the markers highlighted, plus `Accept ours` and `Accept theirs`. Committing is blocked while any conflict remains.

## Endpoints

| Endpoint | Payload | Result |
| --- | --- | --- |
| `status` | `workspaceId`, optional `repo` | Status snapshot, the repository list, or `repo: false` |
| `init` | `workspaceId` | Status after `git init`, plus the repository list |
| `diff` | `workspaceId`, `repo`, `path`, `side`, optional `commit`, `parent` | Full-file diff |
| `stage`, `unstage` | `workspaceId`, `repo`, `paths` | Status |
| `discard` | `workspaceId`, `repo`, `paths`, `confirm` | Status; tracked files return to `HEAD`, untracked files are deleted |
| `applyBlocks` | `workspaceId`, `repo`, `path`, `side`, `blocks`, `baseHash`, `targetHash`, `confirm` | Status |
| `commit` | `workspaceId`, `repo`, `message`, `amend`, `noVerify` | Hash, output, status; `--no-verify` when `noVerify` is true |
| `createBranch` | `workspaceId`, `repo`, `name` | Output, status |
| `createBranchAndCommit` | `workspaceId`, `repo`, `name`, `message`, `noVerify` | Hash, output, status; the commit passes `--no-verify` when asked |
| `push`, `pull`, `fetch` | `workspaceId`, `repo` | Output, status; `pull` adds `autoStash` (`restored` or `conflict`) when it carried local changes |
| `log` | `workspaceId`, `repo` | Up to 100 commits |
| `commitDetail` | `workspaceId`, `repo`, `hash` | Commit and changed files |
| `undoCommit` | `workspaceId`, `repo`, `hash` | Soft reset to the parent; the undone message and status |
| `revertCommit` | `workspaceId`, `repo`, `hash` | Staged inverse change, message, and status; `conflicted` when the revert stops |
| `cherryPickCommit` | `workspaceId`, `repo`, `hash` | New commit hash, output, status |
| `resetToCommit` | `workspaceId`, `repo`, `hash`, `mode`, `confirm` | Output and status |
| `branches` | `workspaceId`, `repo` | Local and remote branches |
| `checkout` | `workspaceId`, `repo`, `branch`, `remote` | Output, status |
| `stashList`, `stashPush`, `stashApply`, `stashDrop` | Selection | Stashes and status |
| `resolve` | `workspaceId`, `repo`, `path`, `side` | Status |
| `aiMessage` | `workspaceId`, `repo`, optional `model: { provider, model }`, optional `instruction` | `{ message, provider, model }`, where `message` is a title plus an optional body |
| `preferences` | none, no workspace needed | `{ instruction, groups: [{ id, label, models: [{ id, name }] }] }` |

## Verified

Host core, against a temporary repository:

- Status groups, counts, untracked line counts.
- Full-file rows and two blocks for a modified plus added line.
- Stage one unstaged block, verify the index blob, leave the other block in Unstaged.
- Unstage the staged block, verify the index returns to `HEAD`.
- Revert one block with a required confirmation, verify the working tree.
- Commit, log, commit detail, branch and commit.
- Stash with a path, list, apply.
- Merge conflict, conflict diff, resolve ours, clear the conflict group.

The same run reported `git core: all checks passed`.

Add and delete block cases:

- A deleted file staged by its block removes the index entry instead of writing an empty file.
- An untracked file staged by its block keeps the trailing newline and writes the exact blob.
- A staged new file unstaged by its block removes the index entry and returns to Untracked.

The run reported `add/delete block cases passed`.

Full RPC to Git test:

- The real `src/host/lib/rpc.ts` and `src/host/lib/http.ts` stack served status, diff, block stage, untracked stage, commit, and log against a temporary repository.
- A `../etc/passwd` path returned `git/invalid-path`.

The run reported `e2e host channel: all checks passed`.

Review regression cases:

- Unstage before the first commit.
- Unstage a staged whole-file deletion and keep the trailing newline.
- List files inside an untracked directory with `-uall`.
- Preserve the executable bit when staging an untracked file by block.
- Refuse block actions on an untracked symlink and on a non-UTF-8 file.
- Refuse block actions on a rename.

The run reported `review regression cases passed`.

Commit hooks, against a temporary repository:

- A failing pre-commit hook refused a normal commit and left the staged change in place.
- Skip hooks committed through the failing hook.
- Branch and commit passed skip hooks through.

The run reported three passing cases in `tests/commit.test.mjs`.

Not verified live: the two Skip hooks checkboxes. The panel was not rendered in this session.

Pull auto-stash, against local remote repositories:

- A blocked tracked change is stashed, the pull fast-forwards, and the stash pops with the index intact.
- A change the update does not touch creates no stash.
- An untracked file the update would overwrite is stashed and kept when the pop cannot restore it.
- A conflicting pop keeps the stash and returns `autoStash: 'conflict'`.
- A failed retry restores the temporary stash and reports the pull error.
- A failed retry and a failed restore keep the stash and name it in the error.
- A mixed tracked and untracked stash restores the tracked part and keeps the whole stash.
- A stash created while the pull runs is never popped.
- A divergent pull leaves the working tree and the stash list unchanged.

The run reported nine passing cases in `tests/pull.test.mjs`.

Not verified live: the switch to Changes and the persistent conflict notice. The panel was not rendered in this session; the host result is covered by the tests.

Discard, against temporary repositories:

- A modified tracked file returns to `HEAD`.
- A file with staged and unstaged changes loses both.
- A staged rename returns the old path and removes the new one.
- An untracked file is deleted, and a literal `*` in the name does not widen the delete.
- A missing confirmation is refused.
- A repository without a commit removes the staged file from the index and disk.
- A staged new file in a repository with a commit is deleted.
- A merge in progress refuses the discard.
- An untracked nested repository is left in place and reported.
- Selecting an untracked path that reuses a rename's old path leaves the rename alone.
- A rename whose old path holds another file is refused.

The run reported eleven passing cases in `tests/discard.test.mjs`.

Not verified live: the trash control and its confirmation dialog. The panel was not rendered in this session; the host path is covered by the tests.

HTTP envelope test:

- Authenticated owner call returns the expected `server-response`.
- Non-owner call returns `git/forbidden`.
- Method mismatch returns 400, wrong method returns 405.

The run reported `http route: all checks passed`.

Multi-repository and branch run:

- A workspace with sibling `alpha` and `beta` repositories discovered both, each with its own changes and branch.
- The selected root resolved to itself. `/etc`, a file path, and a repository outside the workspace were rejected.
- A branch was created from `HEAD` with nothing staged, and a remote branch checkout created a local tracking branch.
- The repository list was sorted with the workspace root first.

The run reported `multi-repo: all checks passed`.

A rename probe used `git mv` in a temporary repository:

- Status reported the staged rename with its original path.
- Unstaging both paths returned the change to the working tree.
- Staging both paths restored the rename, with no half-staged file left over.

The run reported `rename stage all and unstage all checks passed`.

Client bundle, using the real `client.js` and React 19 in Chromium:

- The tab type `dsh-git` with kind `git` registers, with one guide entry.
- The body and title register under `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title`.
- File list, conflict, staged and unstaged groups render.
- Staged diff has one arrow per block. Unstaged diff has two.
- Stage, revert with confirmation, resolve, commit, branch default name, checkout confirmation, log, log diff, stash, and light theme run without console errors.
- A 620-pixel run uses the compact layout: horizontal mode bar, list and diff take turns, back control returns, split default. A 1280-pixel run uses the split diff.
- The repository picker lists two repositories, selecting the second scopes the branch chip, and the panel requests the second root.
- A workspace with no repository shows Initialize, and the click loads the panel.
- The branch menu has a search field and a New branch row. Creating `feature/new` checks it out without a commit.
- Stage all sends one request with every unstaged path, and Unstage all returns them in one request. Conflicted files stay out of both.
- The Git tab opens on demand from the Start guide or tab strip, without automatic opening on session start.
- Previous and next change move the panes to the expected rows, the count updates, and the arrows disable at the first and last change. The same holds in unified view.
- Icon-only controls carry a `title` that matches their accessible name.

The navigation run reported `change navigation and tooltip checks passed`.

A model stub exercised the AI path in a temporary repository:

- `aiMessage` returned one cleaned line from the staged patch, with the patch and recent subjects in the prompt.
- A context without `llm` or without a selected model failed with `git/ai-unavailable`.
- An empty index failed with `git/nothing-staged`. A blank reply failed with `git/ai-empty`, and a provider error surfaced its message.

The run reported `ai commit message checks passed`. The client suite reported `ai commit actions checks passed` for the menu rows, the filled field, and the branch dialog payload.

The run reported `slot records [{"name":"sidebar.right.pane.tab","key":"dsh-git"},{"name":"sidebar.right.pane.tab.title","key":"dsh-git"}]` and `errors []`.

Not verified live: the running app was booted before the rename and this change, so it still serves the old bundle. Restart the app once to load `dsh-git-desk` 0.12.0. The live auto-open after that restart is the remaining check; the harness covers the same effect with a stub service.

## Known limits

- Hunk-level stash is file-level only. The stash dialog selects files.
- AI actions use the Composer model unless the Git settings page stores an override. A deployment without the `llm` service or without a selected model shows the host error in the banner.
- The model override and the commit instructions are stored in this browser (`dsh-git.preferences.v1`), not in the profile, so they do not follow the user to another machine.
- The list and diff divider is also per browser (`dsh-git.split`). It clamps itself when the panel narrows, so a stored 720px becomes 620px at the 900px compact breakpoint. The drag writes the column width without a React render and commits once on release, because the diff renders the whole file.
- The commit instruction replaces only the style paragraph of the prompt. The reply keeps a one-line `type(scope): summary` title because the log reads the first line; the body under it is kept and passed to `git commit -F -`.
- The AI action sends up to 60,000 characters of the staged patch. Larger patches are truncated before the call.
- Commit messages and branch names are not generated by a model. The branch name is prefilled from the message or the first staged file.
- Conflict resolution is whole-side (`ours` or `theirs`) plus the working tree marker view. There is no three-pane merge editor.
- Block arrows are hidden on a rename and the host refuses a block write for one. The file-level stage and unstage buttons handle a rename. The staged diff of a rename still reads the new path, so an unchanged rename can look like a whole-file addition.
- CRLF and filter attributes are not normalized during block writes. A repository with `core.autocrlf` can produce a stale-block error instead of a corrupt write.
- A symlink, a non-UTF-8 text file, or a text file larger than 5 MB is treated as binary. The file-level stage and unstage buttons work; block actions refuse.
- An aborted browser request does not cancel the host Git process. Local reads finish on their own; network commands have their own timeout.
- The log graph draws one lane per commit and vertical rails. Merge diagonals are not drawn.
- Diffs above 2,000 rows are not virtualized. Full-file rendering is the priority; very large files may take longer than the 100 ms target.
- Amend requires a staged change because the host enforces the same staged-file rule for every commit.
- Repository discovery scans two levels below the workspace, skips `node_modules` and hidden directories, and stops at 40. A repository deeper than that needs a narrower workspace.
- Initializing at the workspace root while repositories exist is offered only behind a warning: the nested repositories become untracked folders.
- A per-session `workingDirectory` override or a DSH worktree outside the workspace is not followed.
- History actions refuse a merge, rebase, revert, or cherry-pick in progress. A revert is left pending until it is committed, so the History menu stays blocked until the user commits or aborts that revert outside the panel. The panel does not yet offer Continue or Abort for a cherry-pick or a revert.
- Undo is limited to HEAD. Revert and cherry-pick refuse merge commits. There is no drop, squash, fixup, edit-message, tag, or per-file revert, and no interactive rebase.
- Status is polled every 8 seconds while the panel is visible, plus after every write and on window focus. There is no Host filesystem watch.
- Pull is fast-forward only. When the stashed changes cannot be restored cleanly, the stash is kept instead of guessing a merge. When an untracked file would be overwritten, every untracked file joins the stash so the pull can proceed; an untracked collision keeps its local content in the stash while the checked-out version stays in the working tree.
- Discard has no local undo. It is refused for a conflicted file, while a merge, rebase, revert, or cherry-pick is in progress, and for a rename whose old path holds another file. An untracked nested repository is not deleted; the error asks for its removal outside the panel.
- Skip hooks is off by default, is not persisted, and only bypasses `pre-commit` and `commit-msg` through `--no-verify`. Other hooks are unaffected.
- A pull's temporary stash is popped only when `refs/stash` still matches the hash saved after stashing. A stash created during a slow pull stays untouched; after a failed retry the pull throws, and after a successful retry it keeps the stash and returns `autoStash: 'conflict'`. A mixed tracked and untracked stash restores the tracked part before the untracked collision keeps the whole stash.

## Verified, 0.16.0 preferences and key bindings

- `npm run typecheck` and `npm run build` passed.
- `npx impeccable detect --json client.js` returned `[]`.
- A key scan read both locale dictionaries: 190 keys each, no missing key, and every `t('...')` literal in `client.js` is defined. `diff.staged` is duplicated in both dictionaries from an earlier release; the copies hold the same text.
- A scratch script against `src/host/lib/ai.ts` with a stub context passed five checks: the Composer model is used with no override, a missing model is refused, an explicit pair overrides the Composer selection, an instruction replaces the style paragraph while the format rules stay, and `preferences` groups providers and skips one that refuses `listModels`.
- `cleanMessage` was checked on a plain title, a title with a body, a fenced reply with a `Commit message:` label, runs of blank lines, a missing title, and a reply longer than the 2,000 character cap.

Not verified live: the settings section and the shortcut recorder were not seen in the running page. This session has no window capture, so the placement of the section, the select rendering, and the recorded binding need one look after a page reload.

## Verified, 0.16.0 panel toggle

`sidebarRight.hide` is a no-op once the column is collapsed, while `sidebarRight.active()` still reports the tab that was hidden. The toggle therefore tests `isExpanded()` before it hides; otherwise the second press did nothing. A stub check drove the toggle open, closed, and open again against a fake sidebar.

## Verified, 0.17.0 divider

- A stub run against `client.js` extracted the split store: the default is 320, a write persists, a repeated value does not notify, the minimum is 220, a wide value survives for a wide panel, and a non-numeric value falls back to the default.
- `node --check client.js` passed and `npx impeccable detect --json client.js` returned `[]`.

Not verified live: dragging the divider, the arrow-key step, the reset, and the auto-growing commit field. The panel was not rendered in this session. The field writes `height:auto`, measures `scrollHeight` plus its border, and applies `min(content, 45% of the panel height)` with `overflow-y` set to match; the empty field stays at its CSS `min-height`.

## Verified, 0.18.0 history commit actions

Host rules, against a temporary repository, through the real `src/host/lib/git.ts` functions and a local Git runtime. The run reported `32 passed, 0 failed`. It covered:

- Undo moves HEAD to the parent, keeps the message, leaves the change staged, and reports no pending operation.
- Undo refuses a pending revert, a detached HEAD, the first commit, and a pushed HEAD, while accepting a local-only commit and restoring its change staged.
- Revert stages the inverse change, generates `Revert "<subject>"` with the commit line, reports `reverting: true`, and refuses a dirty index, a merge commit, and a second history action while pending.
- Committing the generated message finishes the revert and clears `reverting`.
- Cherry-pick commits immediately, returns the new head, refuses an applied commit and a merge commit, aborts a conflicting pick, and leaves the branch, the working tree, and the sequencer state unchanged after the abort.
- Reset soft leaves the change staged, hard discards it, an unknown mode and a missing confirmation are refused, and a detached HEAD is refused.
- `commitDetail` still reads a merge commit with two parents.

Client menu logic, extracted from `client.js` with stubbed translations: `25 passed, 0 failed`. It covered every availability reason: detached, not HEAD, no parent, pushed, merge, contained, staged, conflicted, operation in progress, and a missing snapshot.

Component render, using `CommitActionsMenu` and `ResetDialog` extracted from `client.js` under React server rendering with the real EN strings: `12 passed, 0 failed`. The menu renders all five rows, the hash and subject, disabled rows with their reason, and the busy state. The reset dialog renders all three modes, the soft hint, the target hash, and an inline error, and hides the hard warning until Hard is selected.

A module smoke test loaded `client.js` with a stubbed loader and React and applied the plugin. The five slot registrations appeared, and the module reported `client module loads and registers`.

Static checks: `npm run typecheck` passed over both projects, and `npm run build` produced `dist/` and `client.js`. The stylesheet balanced 318 braces over 39,574 characters. Both locale dictionaries hold 231 keys with no miss, and every literal `t('...')` key resolves. `npx impeccable detect --json client.js` returned `[]`.

Not verified live: the menu, the confirms, the reset dialog, and the switch to Changes with a filled message. The running page still serves the bundle from before this change, and this session did not render the panel.

## Open the tab

1. Reload the window once. In the desktop app, `Ctrl+R` reloads the current page. Use a hard reload if the old sidebar entry is still visible.
2. The tab opens when a session starts. It is closeable for that session; the Start guide card and the tab strip's add control open it again.
3. The first open discovers the repositories under the session's workspace. Pick one in the header if there is more than one. With none, the panel offers Initialize.

## Verified, 0.18.1 open in editor

The diff header now carries an Open in editor button. It builds the file address with `fileAddressFor`, the same helper as the harness workspace-path util, and calls `ctx.sidebarRight.openResource(address, { params: { line } })`. The line is the working-tree line of the first change in the diff. The History diff and per-line buttons are not included.

Static checks: `node --check client.js` passed. The diff renders the button only when the view is not binary and the caller passed an open callback; the History call site passes none.

Live verification, 2026-11-10: with `client.js` selected in Changes, the button opened a new editor tab at line 11, the first change, with the landing band. The first version of the patch read `repoRoot` inside `ChangesView`, where it is not defined, and the click threw. The handler now lives in `GitPanel` as `openInEditor` and reaches `DiffView` through `ChangesView` as the `onOpen` prop. The address is built from `repoRoot` and the Session working directory, which are both in `GitPanel` scope.

## Verified, 0.19.0 TypeScript port

Both halves moved to strict TypeScript with no behavior change. `src/host/` compiles to `dist/` and `src/client/` is bundled to `client.js`; the wire shapes live in `src/contract.ts`. `npm run typecheck` reports no errors over either project, `npm test` passes five tests (host entry contract, one prefix route, bundle exports, tab type and slot registrations with four commands, and a jsdom render of the panel root), and the profile resolves the package to `dist/host/index.js` with the expected four injected services. The port also removed two latent defects: a duplicate `diff.staged` key in both dictionaries, and reads of a per-commit-file `status` field the host never sends.

## Verified, 0.23.0 multi-select batch actions

Batch selection lives in `ChangesView` as a set of `side` plus NUL plus path keys, a range anchor, and a `batchMode` flag. `batchMode` keeps the list mounted in the compact layout, so a modified click does not replace it with the diff. `activate` ignores modifier clicks on conflicts, and the cleanup effect drops only the keys the status snapshot no longer holds. The parent `GitPanel` owns the requests: `batchToggle` sends `stage` or `unstage` with every selected path and returns success, and `discardMany` sends one `discard` with the unique paths and `confirm: true`. A successful action clears the batch and the open diff, and the row focus moves to the first file. Changing the filter clears the batch. Keyboard gestures use the same `activate` path: Enter or Space is a plain click, Ctrl/Cmd+Space toggles, and Shift+Space extends the range.

Verification: `npm run typecheck` reports no errors, `npm run build` writes `client.js` at 147,960 bytes, and `npm test` reports 47 tests passing, 0 failing. The eight new cases in `tests/client.test.mjs` cover the second pick opening the bar, Shift range selection with a filter reset, Stage and Unstage payloads and post-action cleanup (including a rename), the batch discard confirmation with a conflict click keeping the picks, the bar naming and disabled states, compact mode with a stubbed `ResizeObserver`, and Ctrl+Space keyboard toggling. The running page was not exercised, because the installed profile is a copy and needs a rebuild plus a window reload.
