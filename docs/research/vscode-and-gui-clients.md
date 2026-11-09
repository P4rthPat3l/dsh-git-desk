# Git UIs in developer tools: VS Code, GitHub Desktop, GitKraken, Sublime Merge

Evidence gathered from vendor documentation for a product team designing a Git panel in a terminal-first AI coding agent shell. Quoted strings are copied verbatim from the pages listed in section 9. Where the fetched documentation is silent about a behaviour, this file says so instead of filling the gap.

Scope note: VS Code restructured its source control documentation in 2025 and 2026. The pages referenced here are the current ones, so a few long-standing features, notably the internal file list of the multi-file diff editor, are documented only at the level of the action that opens them.

## 1. VS Code Source Control view structure

### Container and badge

The view lives in the Activity Bar and opens with `kb(workbench.view.scm)` or the command id `workbench.view.scm`, listed in the default keybinding reference as **Show Source Control**. The view is described in the interface table as: "Review changed files, choose changes to stage, and commit them."

The icon carries a count. From the staging guide: "The source control icon in the Activity Bar also shows a badge with the number of affected files to give you a quick overview of your uncommitted changes." That badge is the only aggregate count the documentation describes. Per-section counts on the `Changes` and `Staged Changes` headers are not documented on any page fetched.

### Sections

Two sections are defined by staging status: "**Changes**: lists all modified, added, or deleted files that are not yet staged for commit" and "**Staged Changes**: lists files that have been staged and are ready to be committed."

Two more appear in other states.

- **Merge Changes** appears during a stopped merge, rebase, cherry-pick, or stash restore: "Files with conflicts appear in the Source Control view under a **Merge Changes** section." Staging a resolved file moves it "from **Merge Changes** to **Staged Changes**."
- **Source Control Repositories** is a separate view that lists repositories in multi-root or multi-repo workspaces. The 1.66 and 1.67 release notes describe sorting that view by name or by discovery order, with `scm.repositories.sortOrder` and a "View & Sort" menu entry.

There is no separate "Untracked" section in the current docs. Untracked files sit inside **Changes** and are distinguished by decoration. The quickstart states it directly: "`README.md` appears under **Changes**, marked **U** for untracked." The view therefore has three file lists in a normal merge-free state, not five.

**Timeline** is not part of the Source Control view. It sits in the Explorer: "The Timeline view, accessible at the bottom of the File Explorer, is a unified view for visualizing the events history for a file."

### Tree versus list

Change lists can be flat or nested. The toggle is under "**More Actions** (**...**) > **View & Sort** > **View as Tree/List**". In tree mode folders become stageable units: "you can stage entire folders by staging the folder itself."

### Inline actions

Hovering a file in **Changes** reveals a `+` action documented as "**+** (plus) icon" with the tooltip **Stage Changes**. Hovering a file in **Staged Changes** reveals a `-` action with the tooltip **Unstage Changes**. Hovering the **Changes** header itself reveals a `+` that stages everything. Files can also be dragged from **Changes** into **Staged Changes**.

### Per-file decorations

The staging guide describes the markers: "changed files are listed with a "U" (untracked), "M" (modified), or "D" (deleted) icon next to them to indicate the type of change. This change indicator is also shown in the Explorer view and in the editor tab title for modified files."

Tab decorations are configurable through `workbench.editor.decorations.colors` and `workbench.editor.decorations.badges`, whose documented example is "**M** for git modified".

### Why a file can appear in both lists

The docs treat this as a first-class case: "A file can have both staged and unstaged changes." Selecting it in **Staged Changes** shows "the first edit, which is ready to commit"; selecting it in **Changes** shows "the later edit, which is not included in that commit". The view does not merge the two entries, and the same path can therefore appear twice. Any Git panel built for an agent shell has to decide this explicitly, because the agent's edits arrive in bursts between stage operations.

## 2. Staging model and the SCM input box

### Stage and unstage a file

| Action | Surface | Exact label |
|---|---|---|
| Stage one file | hover in **Changes** | `+`, **Stage Changes** |
| Stage one file | context menu | **Stage Changes** |
| Stage all | hover on **Changes** header | `+` |
| Stage a folder | tree view, folder row | folder **Stage Changes** |
| Unstage one file | hover in **Staged Changes** | `-`, **Unstage Changes** |
| Unstage one file | context menu | **Unstage Changes** |

The docs add: "To stage all modified files at once, hover over the **Changes** header and select the **+** (plus) icon."

The Command Palette exposes the family: 'Type "Git: Stage" to see options for staging files.' No page fetched enumerates that submenu beyond the selected-ranges command.

### Stage a selection or a hunk

Partial staging runs through the diff editor, and the unit is the selected line range rather than the hunk:

1. "Select a file in the **Changes** list to open the diff editor."
2. "Select the lines you want to stage."
3. "Use the **Stage** button in the gutter of the diff editor next to your selection to stage only those lines."

Alternates: "right-click the selection and choose **Stage Selected Ranges** or run **Git: Stage Selected Ranges** from the Command Palette." Unstaging the same way: "you can also unstage specific lines or code blocks from the diff editor using the **Unstage** button in the gutter next to your selection."

The docs do not describe a separately labelled "Stage Hunk" action. Hunk staging in VS Code happens through the gutter buttons that sit next to each change block, and through selection when the user drags over lines.

### Discard

Right-click a file in **Changes** and select **Discard Changes**, then "Review the confirmation before continuing."

The effect differs by tracking state.

- Tracked: "discard restores the staged version. If there are no staged edits, this is the version in the current commit. Staged changes are preserved."
- Untracked: "discard removes the file."
- Recovery is weak: "Discarded edits to tracked files are not moved to the Recycle Bin or Trash." Untracked files can be moved there when `git.discardUntrackedChangesToTrash` is on.

The docs also warn that **Revert** in the diff gutter "removes the selected working changes. It is not the same as unstaging them."

### Commit box, commit all, amend, undo

The commit message input box sits at the top of the Source Control view. The quickstart reads "Enter `Add practice README` in the commit message input box at the top of the Source Control view", followed by **Commit**.

Behaviour when nothing is staged is deliberately fuzzy: "The **Commit** button uses your staged changes. If nothing is staged, the behavior depends on your Git settings and VS Code can prompt you to stage changes."

The variants, with their exact menu paths:

| Action | Label and location |
|---|---|
| Commit staged | **Commit** button |
| Commit everything | **More Actions** (**...**) > **Commit** > **Commit All** |
| Amend | **Commit** button dropdown > **Commit (Amend)**, or **More Actions** (**...**) > **Commit Staged (Amend)** |
| Undo local commit | **More Actions** (**...**) > **Commit** > **Undo Last Commit** |

**Undo Last Commit** "removes the commit from local branch history and its changes remain staged so you can edit or commit them again. If you undo the repository's first commit, its files become untracked instead."

### Commit and push, or sync

VS Code keeps commit and upload separate. There is no combined "commit and push" button in the docs. After committing, upload is a second action: "Select **Sync Changes** in the Source Control view" or "Select the sync icon in the Status Bar."

Sync is defined as pull then push: "Sync first pulls changes from the upstream branch, then pushes your outgoing commits. Use sync only when you intend to do both." If the pull conflicts, "sync doesn't proceed to the push."

The Status Bar carries direction counts: "The Status Bar sync indicator shows outgoing (↑) and incoming (↓) commits relative to the upstream branch. For example, `↑2 ↓1` means two outgoing commits and one incoming commit."

### Keyboard and typing affordances

The docs render shortcuts as platform macros such as `kb(workbench.view.scm)`, so exact chords are platform-resolved and are not printed literally on the pages fetched. The stable, quotable command ids are `workbench.view.scm`, `workbench.action.showCommands`, `history.showPrevious`, and `history.showNext`.

Message history is reachable from inside the input: "press `kb(history.showPrevious)` and `kb(history.showNext)` while focused in the commit message input box."

A full editor can replace the input box when `git.useEditorAsCommitInput` is on. The editor tab is named `COMMIT_EDITMSG` and exposes **Commit** and **Cancel** buttons; closing the tab completes the commit.

Optional AI paths exist in the same box: a sparkle icon generates a message from the utility model, and a **Code Review** button in the Source Control view reviews uncommitted changes. Commit attribution is controlled by `git.addAICoAuthor` with values `off`, `chatAndAgent`, and `all`.

## 3. Multi-file diff

### What opens it

Three documented entry points produce a combined view across files.

- From the Source Control Graph: "To review the commit's changes together in a multi-file diff, right-click the commit and select **Open Changes**." A plain click on the commit only expands "its list of changed files"; clicking a file opens that one diff.
- From a comparison: **Compare with...** opens the result "in a multi-file diff. The selected reference is on the left and the commit is on the right."
- From incoming or outgoing entries: "Select an **Incoming Changes** or **Outgoing Changes** entry to inspect its files, or right-click an individual commit and select **Open Changes**."

A related but different action is **Git: Open All Changes...**, added in 1.53, which "Opens all modified and untracked files". That opens working-tree files, not a commit view.

### Contents and binary handling

Binary files stay in the set: "Changed binary files, such as images, remain in the multi-file diff and show **Binary file changed** instead of a text diff. When both file versions are available, select **Open Diff** to open the file in the normal diff editor, such as an image diff or applicable custom editor."

### What the docs do not cover

No page fetched describes the internal layout of the multi-file diff editor: the collapsible file list, per-file toolbars, the scroll behaviour that keeps the file list pinned, or keyboard navigation between files inside it. Treat those as undocumented and verify in the product before copying them. The verifiable contract is narrow: a commit's files can be reviewed together, binary files degrade to a labelled placeholder, and each file keeps a route back to the normal diff editor.

## 4. Diff editor details

### Layout toggle

"By default, the diff editor uses the **Automatic** layout. It shows a side-by-side comparison when there is enough space and switches to inline when the editor is narrow."

The menu is **More Actions** (**...**) > **Diff View**, with three options: **Inline** "shows changes within one editor", **Side by Side** "shows the original file on the left and your changes on the right", and **Automatic**.

The breakpoint is a setting with a number attached: "The default width threshold for the **Automatic** layout is 900 pixels. Configure it with `diffEditor.renderSideBySideInlineBreakpoint`." The lower-level settings are `diffEditor.renderSideBySide` and `diffEditor.useInlineViewWhenSpaceIsLimited`.

### Collapse unchanged regions and move between changes

"For large files, collapse the unchanged sections by selecting the **Collapse Unchanged Regions** button in the diff editor toolbar. This helps you focus on the actual changes. You can also quickly navigate between changes using the **Next Change** and **Previous Change** buttons."

### The diff gutter

"The diff editor includes a gutter with **Stage** and **Revert** buttons next to each change." Selection narrows the target: "If you select specific lines in the diff editor, the buttons operate only on your selection." The gutter can be hidden with `diffEditor.renderGutterMenu`.

### Editor gutter indicators and inline preview

Outside the diff editor, the normal editor marks changes: "Green marks added lines, blue marks modified lines, and a red triangle marks deleted lines. Select an indicator to open an inline diff preview."

Configuration runs through `scm.diffDecorations`, `scm.diffDecorationsGutterAction`, `scm.diffDecorationsGutterPattern`, `scm.diffDecorationsGutterVisibility`, `scm.diffDecorationsGutterWidth`, and `scm.diffDecorationsIgnoreTrimWhitespace`.

### Word-level highlighting

None of the pages fetched document intra-line character highlighting in VS Code's diff editor. Sublime Merge documents the equivalent feature explicitly as "Character Diffs". For VS Code, do not claim it in a spec without checking the product.

### Accessibility

"For screen reader users, VS Code provides the Accessible Diff Viewer, which presents changes in a unified patch format." It opens from **More Actions** (**...**) > **Open Accessible Diff Viewer**, or by the shortcut behind `editor.action.accessibleDiffViewer.next`. Movement inside it uses **Go to Next Difference** and **Go to Previous Difference**.

Related accessibility plumbing exists elsewhere: `alt` on a hover locks it in place for magnifier users, and peek editors close on `Escape` or double-click, with `editor.stablePeek` disabling that.

### Peek versus split diff

Peek is a separate interaction family from the diff editor: "We think there's nothing worse than a big context switch when all you want is to quickly check something. That's why we support peeked editors." For diffs, the inline preview opened from a gutter indicator is the only peek-like diff behaviour on the pages fetched.

## 5. Source Control Graph and Timeline

### What the graph is

"The Source Control Graph in the Source Control view (`kb(workbench.view.scm)`) shows your commit history and branch relationships. When your branch has an upstream branch, the graph also identifies incoming and outgoing commits."

Its toolbar carries remote operations: "Use the graph toolbar to fetch, pull, push, or sync changes."

### Interaction model

- Inspect: "select a commit to expand its list of changed files", then "Select a changed file to open its diff."
- Review together: right-click the commit, **Open Changes**.
- Compare: right-click, **Compare with...**, then pick "a local branch, remote branch, or tag". Shortcuts in the same menu are **Compare with Remote** and **Compare with Merge Base**, the latter comparing against "the base branch that VS Code identifies for the current branch".
- Act on a commit: **Cherry Pick** applies its changes to the current branch; **Checkout (Detached)** checks out the exact revision.

The docs are explicit that inspection is read-only: "Selecting a commit to inspect it doesn't check it out or change your working files." And detached checkout carries a warning: "**Checkout (Detached)** updates your working files and leaves `HEAD` detached from any branch."

### Filtering and labels

Filtering as such is not described. What exists is visibility control and pagination through `scm.graph.showIncomingChanges`, `scm.graph.showOutgoingChanges`, and `scm.graph.pageSize`, which sets "how many commits the graph loads initially and each time you load more". Branch label rendering is not described on any page fetched. GitKraken, by contrast, documents labels and filters in detail; see section 7.

### Timeline for one file

"The Timeline view shows events for the file that is active in the editor. These events can include Git commits and local file saves." It sits in the Explorer, and "A filter action in the Timeline view toolbar enables you to filter between source control events and local file events."

Two-point comparison inside one file: "right-click a Git commit and select **Select for Compare**. Right-click another Git commit for that file and select **Compare with Selected**." The scope is narrow by design: "This compares file revisions, not all files in those commits."

Local history entries are full snapshots: "Each local history entry contains the full contents of the file at the time the entry was created and in certain cases, can provide more semantic information (for example, indicate a refactoring)." Timeline date source is `git.timeline.date`.

## 6. GitHub Desktop

### Layout

The left sidebar has three top-level tabs, **Changes**, **History**, and **Branches**, bound to `Command+1`, `Command+2`, and `Command+B` on macOS, with `Ctrl+1`, `Ctrl+2` and `Ctrl+B` on Windows.

### Changed-files list

"In the "Changes" tab in the left sidebar" each file carries a coloured marker: "The red icon indicates removed files. The yellow icon indicates modified files. The green icon indicates added files."

Selection is checkbox based, and the checkbox column is the commit boundary: "To add all changes in all files to a single commit, keep the checkbox at the top of the list selected. To add all changes in one or more files to a single commit, unselect the checkboxes next to the files you don't want included."

Keyboard reaches the checkboxes: "You can toggle the checkbox with the Spacebar or Enter keys after selecting a file", and `Space` is documented as "Select or deselect all highlighted files".

Stashes have their own entry: "To access stashed changes, click Stashed Changes", or `Control+H` to show and hide them.

### Diff panel

The display control sits top right of the diff view and opens a menu: "To change how the entire diff is displayed, under "Diff display," select **Unified** or **Split**. The Unified view shows changes linearly, while the Split view shows old content on the left side and new content on the right side."

Two more review aids: "To hide whitespace changes so you can focus on more substantive changes, select **Hide Whitespace Changes**", and expansion is manual, "click the arrow above or below the line numbers" to see neighbouring lines, or right-click in the diff and choose **Expand Whole File**. The default diff tab size is 8 and is configurable in the Appearance settings pane.

### Partial staging

Desktop supports line-level partial commits, not hunk-level: "If one file contains multiple changes, but you only want some of those changes to be included in a commit, you can create a partial commit." The mechanism: "To exclude changed lines from your commit, click one or more changed lines so the blue disappears. The lines that are still highlighted in blue will be included in the commit." There is no hunk boundary control, and no staging area: the checkbox plus the blue-line state together define the commit.

### Commit and push

Fields are **Summary** and **Description**, with a co-author control and a Copilot message generator. The button is labelled with the branch: "Under the Description field, click **Commit to BRANCH**." Upload is separate: "To push your local changes to the remote repository, in the repository bar, click **Push origin**." Hooks run automatically, and **Bypass Commit Hooks** sits next to the message field.

Protected branches produce a warning with a **switch branches** path.

### History

"On the **History** tab, click the commit you'd like to review." Each row shows "The commit message", "The time the commit was created", "The committer's username and profile picture (if available)", and "The commit's SHA-1 hash (the unique ID)".

Range selection works: "You can also select a range of multiple consecutive commits using `Command` or `Shift`", and "If there are multiple files in the commit or range of commits, click on an individual file to see the changes made to that file."

### Branch comparison

Comparisons are exposed as commands rather than as a persistent view: `Shift+Command+B` for **Compare to an existing branch**, `Shift+Command+C` for **Compare branches on GitHub**, `Shift+Command+M` for **Merge into current branch**, and `Shift+Command+U` for **Update from default branch**. The page fetched does not describe the comparison view's layout.

### Conflicts

GitHub Desktop has no built-in conflict resolver in the pages fetched, and it says so plainly. When pulling or merging: "Resolve any merge conflicts in your preferred way, using a text editor, the command line, or another tool." The merge action stays blocked: "If there are merge conflicts, GitHub Desktop will warn you above the Merge BRANCH into BRANCH button. You will not be able to merge the branches until you have resolved all conflicts." The same warning and block apply to squash and merge.

### Discarding

Three scopes: **Discard Changes**, **Discard Selected Changes**, **Discard All Changes**, confirmed in a "Confirm Discard Changes" window that lists affected files. Line-level discards exist but are restricted: "Discarding single lines is disabled in a group of changes that adds and removes lines." Recovery differs from VS Code: "Discarded changes are saved in a dated file in the Trash. You can recover discarded changes until the Trash is emptied."

## 7. GitKraken and Sublime Merge

### GitKraken Commit Graph

The graph is the primary surface, described as an interactive map where "Every branch, merge, and commit laid out to explore." Concrete capabilities documented:

- Search over "message, author, file, code changes, or even with natural language using AI".
- Filtering by "author or team", showing or hiding "tags, branches, or stashes", and dimming "the noise of merge commits".
- A context menu on any commit, branch, or tag offering "compare against a base, open diffs, revert, rebase, checkout, and more".
- Visual change size: "surfacing change sizes at a glance so you can spot the big shifts".
- Layout control: "Rearrange columns, choose the metadata that matters (author, date, SHA), and decide whether you want avatars or clean initials", plus compact and full views, light and dark themes.
- Host metadata: the page lists GitHub, GitLab, Jira, Trello, and Azure DevOps, and says you can "filter by labels, sprints, milestones".
- Pull request visibility: "branches with active pull requests are shown".

Compared with VS Code's graph, the additions are filtering, label and metadata filtering from external trackers, and configurable columns.

### GitKraken Merge Tool

"Instead of showing raw conflict markers, GitKraken Desktop opens a side-by-side editor with a live merged output, so you can resolve conflicts cleanly."

Flow: attempt the merge, rebase, or cherry-pick; "Conflicted files appear in the Commit Panel"; click a conflicted file to launch the tool; "Compare "current" vs. "target" changes, select lines or edit directly"; then "Save, mark resolved, and commit."

Two extras beyond VS Code's merge editor. First, **Auto-resolve with AI**: "provides first-pass conflict resolutions with explanations", with the user able to "Accept, tweak lines manually, or reset to manual merge." Second, **Conflict Prevention**, which "detects merge conflicts before you open a pull request", "By scanning your branch against the target", and surfaces "affected files, authors, and actions". External tools are also supported: Beyond Compare, Araxis, P4Merge, Kaleidoscope.

### Sublime Merge

Marketing copy, but specific about interaction:

- Granularity: "Stage Files, Hunks and Lines with no waiting", and "Select one or more lines to split hunks into multiple changes."
- Review surface: "Side by Side Diffs, Syntax Highlighting, Character Diffs."
- Context control: "You can drag the top or bottom of a hunk to interactively show more context lines."
- Transparency: "View the exact Git commands you're using", with movement between the command line and the GUI described as direct.

The documentation adds the detail on context: "Changes are shown in a condensed view by default, similar to `git diff`." Two ways to see more exist, **Context Dragging** and **Full File Toggle**:

- "You can click and drag the top or bottom edge of a diff to add and remove context."
- "Double clicking this edge will increase the context by a few lines."
- "When hovering over the hunk header, you'll notice the full file context toggle button on the left of the header."

Also documented on the site: a command palette, commit editing, blame and file history, submodule management, command line integration, Git Flow integration, and "Instant search over your whole repository, as you type. Search by commit message, author, path and contents."

Sublime Merge's distinctive contribution for a keyboard-driven review loop is that staging granularity goes below the hunk, down to arbitrary line selections that split hunks, and that every context decision is adjustable per hunk rather than set by a global collapse toggle.

## 8. Cross-client patterns by edge case

| State | VS Code | GitHub Desktop | GitKraken | Sublime Merge |
|---|---|---|---|---|
| Empty repo, no commits | **Initialize Repository** button in the Source Control view, fallback **Git: Initialize Repository**. After init, "It has no commits yet, and nothing has been uploaded." | First-repository flow documented, but not the empty-repo panel state on the page fetched | Not documented on pages fetched | Not documented on pages fetched |
| Detached HEAD | **Checkout (Detached)** from a commit's context menu, with a caution that it "leaves `HEAD` detached from any branch"; docs advise creating a branch before committing | Not documented on pages fetched | Not documented on pages fetched | Not documented on pages fetched |
| Merge conflicts | **Merge Changes** section, CodeLens **Accept Current Change**, **Accept Incoming Change**, **Accept Both Changes**, **Compare Changes**, plus a 3-way merge editor with **Incoming**, **Current**, **Result** panels and **Complete Merge** | No resolver. Warns above the merge action and blocks merging until resolved "using a text editor, the command line, or another tool" | Built-in side-by-side **Merge Tool** with live merged output, plus AI auto-resolve and external tools | "Built-in merge tool allows for quick, painless resolution of merge conflicts" |
| Large diffs | **Collapse Unchanged Regions**, **Next Change** and **Previous Change**, Automatic layout switching to inline at 900px | Manual expansion arrows and **Expand Whole File**; whitespace can be hidden | Not documented on pages fetched | Condensed by default "similar to `git diff`", with drag-to-resize context and a full-file toggle |
| Binary files | **Binary file changed** inside a multi-file diff, with **Open Diff** when both versions exist | Not documented on pages fetched | Not documented on pages fetched | Not documented on pages fetched |
| Renamed files | Not documented on pages fetched | Not documented on pages fetched | Not documented on pages fetched | Not documented on pages fetched |
| Submodules | Not documented on pages fetched. The **Source Control Repositories** view covers multiple repositories, not submodules | Not documented on pages fetched | Not documented on pages fetched | "Submodule Management" listed as a feature |
| Abandoning an operation | **Git: Abort Merge**, **Git: Abort Rebase**, **Git: Abort Cherry Pick**, with a caution that aborting removes conflict-resolution work | Not documented on pages fetched | Not documented on pages fetched | Not documented on pages fetched |

Two conflict facts deserve emphasis because they shape any panel design.

First, "current" and "incoming" invert by operation, and VS Code documents the inversion rather than hiding it: "During a rebase, Git's 'ours' and 'theirs' roles are reversed from what you might expect: 'ours' is the new base and 'theirs' is your replayed work. Inspect the changes rather than choosing a side by name."

Second, finishing differs per operation. A merge ends with a commit in the Source Control view; a rebase and a cherry-pick continue in the terminal with `git rebase --continue` or `git cherry-pick --continue`; a stash restore needs no merge commit. VS Code's commit action will also continue an in-progress rebase, which means one button has two meanings depending on hidden state.

## 9. Sources

VS Code documentation, fetched as Markdown variants where the site publishes them.

- https://code.visualstudio.com/docs/sourcecontrol/overview
- https://code.visualstudio.com/docs/sourcecontrol/overview.md
- https://code.visualstudio.com/docs/sourcecontrol/quickstart.md
- https://code.visualstudio.com/docs/sourcecontrol/staging-commits.md
- https://code.visualstudio.com/docs/sourcecontrol/history.md
- https://code.visualstudio.com/docs/sourcecontrol/merge-conflicts.md
- https://code.visualstudio.com/docs/sourcecontrol/repos-remotes.md
- https://code.visualstudio.com/docs/sourcecontrol/branches-worktrees.md
- https://code.visualstudio.com/docs/sourcecontrol/troubleshooting.md
- https://code.visualstudio.com/docs/sourcecontrol/faq.md
- https://code.visualstudio.com/docs/sourcecontrol/github.md
- https://code.visualstudio.com/docs/editing/editingevolved.md
- https://code.visualstudio.com/docs/editing/codebasics.md
- https://code.visualstudio.com/docs/editing/getting-started/userinterface.md
- https://code.visualstudio.com/docs/reference/default-keybindings.md
- https://code.visualstudio.com/llms.txt

VS Code release notes, from the docs source repository. Pages are not served as `.md` on code.visualstudio.com, so the raw files were read instead. Version 1.53 was read in full; 1.52, 1.65, 1.66, 1.67, and 1.68 were read for the sections cited. Versions 1.45 through 1.77 were also checked by text search for multi-diff, Source Control Graph, and Timeline entries, and no multi-diff editor entry was found in any of them.

- https://raw.githubusercontent.com/microsoft/vscode-docs/main/release-notes/v1_53.md
- https://raw.githubusercontent.com/microsoft/vscode-docs/main/release-notes/v1_66.md
- https://raw.githubusercontent.com/microsoft/vscode-docs/main/release-notes/v1_67.md
- https://raw.githubusercontent.com/microsoft/vscode-docs/main/release-notes/v1_68.md
- https://raw.githubusercontent.com/microsoft/vscode-docs/main/release-notes/v1_52.md

GitHub Desktop documentation.

- https://docs.github.com/en/desktop
- https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop
- https://docs.github.com/en/desktop/making-changes-in-a-branch/viewing-the-branch-history-in-github-desktop
- https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/syncing-your-branch-in-github-desktop
- https://docs.github.com/en/desktop/overview/github-desktop-keyboard-shortcuts

GitKraken.

- https://www.gitkraken.com/features
- https://www.gitkraken.com/features/commit-graph
- https://www.gitkraken.com/features/merge-tool

Sublime Merge.

- https://www.sublimemerge.com/
- https://www.sublimemerge.com/docs/
- https://www.sublimemerge.com/docs/diff_context
- https://www.sublimemerge.com/docs/key_bindings

One dead end worth recording: https://code.visualstudio.com/updates/v1_53.md returns 404, and the HTML release notes are truncated by site navigation before the Source Control section, which is why the raw repository files were used.
