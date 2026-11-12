# Git for DeepSeek Harness: UI brief v5

Status: implemented in 0.12.0 as `dsh-git-desk`. Multi-repository workspaces, repository picking, new-branch creation, session auto-open, bulk stage and unstage, change navigation, native tooltips, horizontal mode tabs, and AI commit actions are included. The interactive mockup in [`mockup/index.html`](../mockup/index.html) remains the design reference. See [`implementation.md`](implementation.md) for the shipped contract, verification, and limits.

## What this is

A Git surface inside DeepSeek Harness that covers review, commit, stash, sync, and history without opening another IDE. The first job is reviewing the agent's changes next to the conversation. The second is the everyday commit and push loop. The third is the history and conflict work that currently sends you to JetBrains.

## Where it lives

The Git workspace is a right-sidebar tab, opened from the **Git changes** card in the right panel's Start guide. It is session-scoped, so it follows the current project and the conversation stays visible. It is not a global panel and does not sit above the Workspace session list.

The right pane is narrow. Changes, History, and Stashes are horizontal tabs at every width, and the body below holds only the file list and the preview. Below 900 pixels the tab uses a compact layout: the list and diff take turns at full width, and a back control returns to the list. The split diff stays the default, with the two arrows in the center gutter. The unified diff is one click away. The normal right pane is a preview at this width; the fullscreen right panel gives the split its intended width. The 1512 by 982 mockup remains the wide reference, and the compact screenshots in [`screenshots/`](screenshots/) show the side-panel layout.

The workspace consumes host theme tokens through local aliases such as `--bg: var(--dsw-alias-bg-base, fallback)`. Production defines no palette of its own. The fallback values exist only so the mockup can run as a standalone file.

## What we studied

Full notes are in [`research/jetbrains-git.md`](research/jetbrains-git.md) (13 sources) and [`research/vscode-and-gui-clients.md`](research/vscode-and-gui-clients.md) (35 sources). The Commit window and Diff viewer references are the JetBrains 2026.3 help pages for comparing file versions and investigating changes.

| Pattern | Source | Decision |
| --- | --- | --- |
| Pending work and history are separate tool windows | JetBrains Commit (`Alt+0`) and Git (`Alt+9`) | One workspace with two modes, Commit and Log. Same split, fewer windows. |
| Changed files are split into Staged and Unstaged, with a file allowed in both | JetBrains Commit window | Staged, Unstaged, and Conflicts sections. Each row carries a per-file stage or unstage icon. A file with both index and worktree edits appears in both and shows `M↕`. |
| Status is color, files are colored, and the row action is `+` or `−` | JetBrains Commit window | Letter plus color on the row, colored file name, and a green `+` or red `−` at the right edge. |
| Diff joins the two sides through a center gutter | JetBrains Diff viewer | Old and new line numbers share a center gutter. The unstaged diff has two arrows per block, one per direction. The staged diff has one. |
| Diff toolbar and revision labels | JetBrains Diff viewer | Second header row with previous and next change, layout, and the change count. A revision bar labels both sides. The whole file is rendered. |
| Commit and Commit and Push as separate actions | JetBrains | Primary button plus caret menu. Push stays explicit. |
| Stash is all-or-nothing; shelve is selective | JetBrains | Stash dialog selects files. Hunk selection is designed but deferred in 0.6.0. |
| Three-pane merge with base in the center | JetBrains, VS Code | Current, result, incoming. The mockup puts result in the center for width reasons; see open question 3. |
| Log is a four-pane master-detail | JetBrains | Two zones: graph list, then commit detail with changed files and the diff. Branches stay a menu, not a permanent column. |
| No commit-and-push button; commit then Sync | VS Code | Rejected. The split button is one gesture and matches JetBrains. |
| Untracked files live in Changes with a U | VS Code | Rejected. Untracked files sit in Unstaged so there is one place for work that is not staged. |
| Conflict blocks the commit, explicitly | GitHub Desktop | Commit is allowed to be pressed and explains the conflict. Blocking silently is worse. |
| Hover-only actions are hard to find | VS Code review | Stage and unstage icons are always visible. The hunk arrow is the action, always visible, with an accessible name and a native tooltip. |

## Information architecture

### Commit mode

```
┌──────────────────────────┬──────────────────────────────────────────────┐
│ list 308                 │ diff, fluid                                  │
│ filter, refresh, menu    │ file head: status, path, +/−, state pill     │
│ Conflicts 1 file         │ diff tools: change nav, layout, count        │
│ Staged 3 files           │ revision bar: HEAD/Staged or Staged/Local    │
│   M  git-service.ts  −   │ full file: every line, no collapsed runs     │
│   M  git-panel.tsx   −   │ center gutter: old# ← → new#                 │
│ Unstaged 6 files         │ changed panes tinted, word highlights        │
│   M  git-panel.tsx   +   │                                              │
│   U  diff-viewer.tsx +   │                                              │
│ commit box               │ footer: change count, encoding, language     │
└──────────────────────────┴──────────────────────────────────────────────┘
```

The commit box is pinned to the bottom of the list column. A third column for the message would cost the diff about 340 pixels. At 308 pixels the list holds a 22px status glyph, a colored name, a directory, and one stage control.

### Log mode

```
┌──────────────────────────┬───────────────────────────────────┐
│ commits, 452             │ commit detail                     │
│ graph lanes + subject    │ subject, body, author, sha, stats │
│ refs in the meta row     │ changed-file chips                │
│ author, sha, time        │ diff of the selected commit file  │
└──────────────────────────┴───────────────────────────────────┘
```

The graph, message, and author share the list. Refs sit in the meta row so a long subject keeps the full width. Selecting a commit never replaces the graph, which keeps spatial memory intact. The diff in Log is read only: it renders the whole file with no hunk arrows, and the revision bar reads parent and commit.

### Overlays

- Stash dialog: file rows with expandable hunks, a name field, keep-index and include-untracked options.
- Merge dialog: three panes, accept current, accept incoming, accept both, then mark resolved.
- Branch dialog: a generated branch name, the base branch, the staged-file summary, and one primary action. It creates the branch and commits the staged files; Push stays the next explicit step.
- Menus: branch, commit split, diff layout, list options, file actions. No command palette in v1.

## Layout numbers

| Element | Value |
| --- | --- |
| Host sidebar | 248 |
| Git header | 54 |
| Status bar | 26 |
| Commit list | 308 |
| Log list | 452 |
| Commit box | about 160 |
| File row | 29 |
| Diff tools | 36 |
| Revision bar | 28 |
| Center gutter | 98 (34 old number, 30 arrow, 34 new number) |
| Diff line | 21 |
| Diff font | 11.5px JetBrains Mono |
| UI font | Inter, 10.5 to 13.5px |
| Radii | 3 for checks, 6 for controls, 10 for dialogs |

The diff column is 956 wide at the reference size. Each side is 429 after the center gutter, which holds about 58 characters of code. Code longer than that clips at the pane edge in the mockup. Production needs a horizontal scroll that keeps both sides and the gutter aligned, or wrapping.

## Semantic color

| Meaning | Token | Fallback | Used for |
| --- | --- | --- | --- |
| Modified | `--dsw-alias-brand-primary` | blue | M, modified file names, modified block chevron |
| Added | `--dsw-alias-state-success-primary` | green | A, additions, the `+` stage action, staged pill |
| Deleted | `--dsw-alias-label-secondary` | gray | D, deleted file names |
| Untracked | `--dsw-alias-state-warn-primary` | amber | U, untracked file names |
| Conflict | `--dsw-alias-state-error-primary` | red | !, conflict blocks, the `−` unstage action |
| Surfaces | `--dsw-alias-bg-*`, `--dsw-alias-border-*` | neutral | panel, elevated, borders |
| Sidebar | `--dsw-specific-sidebar-fill` | near black | host sidebar |

Diff tints are `color-mix` of the semantic token with transparency, so the host theme drives them. Text keeps a 4.5:1 minimum against the panel. The tertiary text token was raised from 3.8:1 to 4.9:1 after the design detector flagged it.

## The diff is the product

- Every diff renders the whole file on both sides. Unchanged lines are ordinary rows. There is no collapsed "unchanged lines" bar.
- The two sections are separate comparisons, not one combined view. The Staged entry compares `HEAD` to `Staged`. The Unstaged entry compares `Staged` to `Local`.
- The Unstaged diff has two arrows on every changed block. The left arrow applies Local to Staged, which stages the block. The right arrow applies Staged to Local, which drops that local hunk and leaves it as the staged version. Both are one-way applications of one side onto the other.
- The Staged diff has one arrow on every block. The right arrow applies HEAD to Staged, which unstages the block.
- A block is visible only in the diff where the two versions differ. Staging a block removes it from the Unstaged diff and adds it to the Staged diff; unstaging does the reverse. The two sections never repeat the same changed block.
- A file with index and worktree changes stays in both sections with `M↕`. Each section shows its own comparison of the whole file.
- The revision bar names the two sides: `HEAD ce68c19a` and `Staged`, or `Staged` and `Local`.
- The toolbar carries previous and next change, layout, and the change count. Whitespace and highlight menus are not in v1; the diff already highlights changed words.
- The Log uses the same renderer with no arrows. The revision bar reads parent and commit.
- Rows are paired. A replaced line sits left and right on the same row, so the eye scans horizontally.
- Word-level changes are highlighted inside paired replacements, not the whole line.
- There are no `@@` hunk headers in the reading surface.
- A conflicted file replaces the diff with the conflict markers in place, a red banner, and one Resolve action in the file head. This is a different reading mode and should not pretend to be a diff.

## Interaction contract

| Action | Result |
| --- | --- |
| Click a file | Select it, remember its section, render its diff, reset change position |
| Cmd/Ctrl-click a file | Add or remove it from the batch selection |
| Shift-click a file | Select the range in that section from the last clicked file |
| Batch bar, two or more files | Stage, unstage, or discard the selection, or clear it |
| Tab, Enter, Space | Move to a row; Enter or Space opens it, Ctrl/Cmd+Space toggles it in the batch, Shift+Space extends the range |
| Compact pane, modified click | Keeps the list and the batch bar on screen |
| Click `+` on an unstaged row | Stage the file, move it to Staged, show its staged diff |
| Click `−` on a staged row | Unstage the file, move it to Unstaged |
| Click a section header | Collapse or expand Staged, Unstaged, or Conflicts |
| Click the left arrow on an unstaged block | Apply Local to Staged. The block leaves the unstaged diff and the staged diff gains it. |
| Click the right arrow on an unstaged block | Apply Staged to Local. The local hunk is dropped and the block leaves the unstaged diff. |
| Click the right arrow in the staged diff | Apply HEAD to Staged. The block leaves the index and returns to the unstaged diff. |
| Previous or next change | Scroll to the next block, keep the reading position |
| Layout menu | Switch between side by side and unified |
| Commit | Block on conflict or empty message; otherwise commit, prepend to Log, clear the box |
| Commit caret | Commit and push, commit with amend, commit with sign-off |
| Push | Push ahead commits, move the origin ref, clear the counter |
| Pull | Fast-forward, clear the behind counter |
| Branch chip | Menu with local and remote branches, filter, checkout |
| Stash | Open the dialog with every file selected, then apply the selection |
| Resolve | Open the merge dialog, accept a side, mark resolved, stage the file |
| Branch + in the commit row | Open the branch dialog with a generated name, base, and staged summary |
| Create branch and commit | Create the branch, commit the staged files on it, enable Push. Nothing is pushed automatically. |
| Escape | Close the menu, then the dialog |

The primary button reads "Commit merge" during a merge and "Commit" otherwise.

## States the mockup demonstrates

- Default: three staged files, six unstaged entries including untracked files, one conflict, and `git-panel.tsx` in both sections with `M↕`.
- `git-panel.tsx` in Unstaged shows the whole file and three worktree blocks, each with a left and a right arrow.
- The Staged entry of the same file shows the staged import block with only the right arrow.
- Staging one block from the unstaged diff removes it from that diff and adds it to the staged diff. The rest of the file stays actionable.
- Commit blocked by an unresolved conflict, with the error toast and the jump to the conflicted file.
- Resolved conflict moving the file into Staged and unblocking the commit.
- The branch dialog with a generated name and the staged summary, then the commit on the new branch with Push enabled.
- Stash selection, including a hunk checkbox and a live count.
- Log with a merge lane, refs, tags, a selected commit, and a read-only full-file diff.
- Light theme across every surface.

States not in the mockup and required before release: empty repository, no changes, detached HEAD, loading and fetch failures, binary and renamed files, very large diffs, operation in progress, and push rejection.

## Decisions

DEC-001. The first surface is a right-sidebar tab, opened from the Start guide. Reason: Git belongs to the current project, the conversation stays visible, and the global panel rail is the wrong place because it sits above the Workspace session list. The compact layout handles the narrow pane, and the fullscreen right panel provides width for a split review.

DEC-002. Use JetBrains' Staged and Unstaged sections with per-file `+` and `−` actions, not checkboxes. Reason: it matches the reference, keeps the row about the file, and lets one file appear in both sections when its index and worktree differ.

DEC-003. A file can be in both sections and shows `M↕`. Reason: partial staging is a real state, and hiding it makes the list lie about what a commit will contain.

DEC-004. Stash supports file and hunk selection. Reason: you asked for it, and JetBrains does not do it. `git stash push -- <paths>` covers files; hunk selection needs `git stash -p` with controlled input or a patch-based equivalent.

DEC-005. Keep Commit and Commit and Push in one split button. Reason: it matches JetBrains and removes a second trip to the toolbar.

DEC-006. Show a status letter as well as color, and color the file name by status. Reason: matches JetBrains and stays readable for color-blind users.

DEC-007. Side by side is the default diff. Reason: the primary task is comparing old and new.

DEC-008. The diff uses a center gutter and one arrow per changed block. The arrow points to the destination pane: left stages, right unstages. Reason: it is the reference's interaction model, and a block can only move one way at a time.

DEC-009. No `@@` hunk headers and no collapsed unchanged runs. Reason: the whole file is the context. Hunk identity stays in the data model for staging.

DEC-010. No modal for the commit message. Reason: it belongs to the Commit surface.

DEC-011. Message generation is an explicit sparkle action, never automatic. The sparkle menu has two rows: write the message, or create a branch and commit. Reason: silent model calls in a commit box are a trust problem.

DEC-012. An unresolved conflict blocks commit, but the button still explains why. Reason: disabled buttons that do not say why are a dead end.

DEC-013. The graph is not a permanent third column. Reason: at 1512 it would leave the diff under 700 pixels.

DEC-014. Every color is a host token or a `color-mix` of one. Reason: the plugin must not become a second design system.

DEC-015. Staged and Unstaged show different diffs, not the same file twice. Reason: the staged entry is the index, the unstaged entry is the worktree. Showing one diff for both hides what a commit will contain.

DEC-016. There is no include checkbox and no All toggle. Reason: a second selection state on the same block is confusing. The arrow is the action.

DEC-017. Every diff shows the entire file, with no collapsed fragments. Reason: when reviewing an agent change, the surrounding code is the evidence. The user should not hunt for context.

DEC-018. The unstaged diff is `Staged` to `Local` and has two arrows per block. The left arrow applies Local to Staged; the right arrow applies Staged to Local. The staged diff is `HEAD` to `Staged` and has one right arrow. Reason: the two sections must stay separate comparisons, and each direction applies one side onto the other. A combined view that tints staged blocks into the unstaged diff is rejected.

DEC-019. A branch and commit shortcut generates the branch name from the message and the staged diff. It creates the branch, commits, and stops before Push. Reason: the user asked for the branch step to disappear, but pushing is still their call.

DEC-020. Sync controls and counters appear once, in the header toolbar: fetch, pull with the behind count, push with the ahead count. The branch chip and the status bar carry no duplicate counters. Reason: three copies of the same number read as three different facts.

DEC-021. No custom hover tooltips and no new keyboard shortcuts in v1. Icon-only controls use the native `title` tooltip, which cannot be clipped by the narrow pane and needs no overlay code. Reason: the user asked for shortcuts to stay untouched, and an unbound key is better than a colliding one.

DEC-022. Multi-select uses modifier clicks, not checkboxes. Cmd-click, Ctrl-click, or Ctrl/Cmd+Space toggles a file; Shift-click or Shift+Space selects a range in one section; a batch bar appears at two or more files with Stage, Unstage, Discard, and Clear. In the compact layout a modifier click keeps the list on screen so the bar stays reachable. Reason: DEC-002 keeps the row about the file, and a checkbox on every row is a second selection state that also has to explain conflicts and files in both sections. The row and section controls stay for one file.

## Not in v1

Submodules, worktrees UI, interactive rebase, per-line staging, blame, signed-commit setup, pull requests, multiple repositories in one panel, LFS, binary diff rendering, and file history as its own view. Each is a deliberate gap, not an oversight.

## Open questions

1. Placement: right-sidebar tab, opened from the Start guide. Confirmed in 0.7.0.
2. Hunk-level stash changes behavior beyond JetBrains. Confirm it is wanted in v1, because it is the riskiest plumbing.
3. Merge layout: current, result, incoming in the center (mockup) versus current, base, incoming with result below (JetBrains). The JetBrains layout needs more vertical space but shows the common ancestor.
4. Commit message generation: reuse the current session agent, or a dedicated short prompt with no tools. Reusing the session is cheaper and keeps context.
5. Branch-name generation: derive it from the message only, as the mockup does, or ask the session agent for a name from the diff. The mockup keeps it deterministic and editable.
6. The right arrow in Unstaged drops local work. Decided: a confirmation dialog names the action, and the host refuses the write without `confirm: true`.
6. Fetch and push credentials: rely on the user's existing credential helper and never prompt inside the panel.
7. Design system confirmation: the mockup maps every color to `--dsw-alias-*` and `--dsw-specific-*` with fallbacks. A screenshot of the live harness next to this panel would confirm the row heights, radii, and type sizes before implementation.

## Phases

| Phase | Outcome | Validation |
| --- | --- | --- |
| 0 | Approve the mockup and these decisions | Your review |
| 1 | Host Git service: status, diff, stage, commit, stash, fetch, pull, push, log | Unit tests against fixture repositories; every command runs with color off and prompts disabled |
| 2 | Read-only panel: Staged and Unstaged list, full-file arrow diff, Log, theme tokens, locale | Open a real repo, compare against `git status` and `git diff` |
| 3 | Write path: per-file staging, two-way block arrows, commit, branch and commit, stash, sync | End-to-end in a scratch clone, including reject and conflict paths |
| 4 | Merge dialog and conflict resolution | Conflict fixture; accept each side; commit the merge |
| 5 | Keyboard, empty and error states, large repository pass | 10k-file repository, 5k-commit log, binary files |

## Risks

- Git process control. Every call needs a fixed environment (`GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`), a timeout, cancellation, and no shell interpolation. Hooks can hang a commit; show the hook output instead of swallowing it.
- Partial staging correctness. `git apply --cached` with reconstructed patches fails on context drift. Stage blocks against the exact blob the diff came from, and refresh status after every write.
- Block moving and Git state. The mockup moves a block between the staged and unstaged diffs. Production must map each block to a stable id, rebuild both diffs after every write, and keep files that are staged and unstaged at once.
- The right arrow in Unstaged drops the local hunk. The plugin requires a confirmation, and the Host refuses the write without an explicit confirmation flag.
- Full-file rendering. Every diff now carries both complete versions. Large files need virtualization, and the client should not diff more than the open file. The host can return the three versions and let the client align them; correctness of the alignment is the test target.
- Parsing. Porcelain v2 for status, `--no-color` and a fixed diff format for display, and binary detection before rendering. Never parse human-oriented output.
- Large repositories. Status and log need paging and cancellation. Diff rendering needs virtualization above a few thousand lines.
- Sync. Push and pull are the only operations that touch the network and other people's work. No auto-sync, no force, and a clear result line.
- Theme drift. Tokens are the only styling dependency. The mockup's fallback palette is an approximation, not a second system.
- Accessibility. Focus order, Escape handling, a 4.5:1 text floor, and a non-color status cue are release criteria, not polish.
