# JetBrains Git integration, evidence notes

Research target: IntelliJ IDEA Git integration as documented for 2024 to 2026, with notes on WebStorm and PyCharm where the platform is shared. All three IDEs run the same IntelliJ Platform VCS layer, so the Commit tool window, Diff Viewer, Log tab, and conflict tool are the same components with different language defaults.

Evidence base: the current JetBrains help pages, which the site labels 2026.3. Every claim below comes from one of the pages listed in section 10. Where a claim is my inference from documented behavior, the sentence says so.

Version caveat: this UI changed twice in the window the team cares about. The Commit tool window replaced the old modal Commit dialog and the separate Local Changes tab. The Git staging area became an optional mode on top of changelists. Anything the team compares against a 2022 mental model will be wrong on two points: the commit panel is a vertical tool window now, and changelists still exist underneath the staging option.

---

## 1. Tool window and panel architecture

JetBrains splits version control across two tool windows, not one. This split is the single most important structural fact for a competing design, because it separates "what I am about to commit" from "what has already happened."

### 1.1 The Commit tool window

Documented as "the vertical Commit tool window (`Alt+0`), located on the left." It holds pending work.

Tabs inside it:

- **Commit**. The changed file list, commit message, and commit buttons. The docs also call the inner list "the Changes view" and "the Commit window."
- **Stash**. Git stashes. Documented as sitting "next to the Commit tab in the same Commit tool window."
- **Shelf**. IDE-managed shelves for projects where shelving is enabled.

Settings that move or reshape it, all on `Settings | Advanced settings | Version Control`:

- `Enable Commit tool window`. Clearing it folds the commit UI into the Git tool window as a `Local changes` tab in the Log tab. The docs describe the result as "The Commit tool window can become the Local changes tab in the Log tab of the Git tool window."
- `Toggle commit controls`. Shows the file list without commit controls, and reveals a Commit button on demand. The docs call this mode "a window with a list of local changes and switch on the commit controls."
- `Open Diff as Editor Tab`. Clearing it opens diffs in a separate window.
- `Automatically close the Commit tool window in Window/Float mode after committing`.

In-tool-window options, under the vertical ellipsis `Options` menu:

- `View Mode | Window` makes the panel a floating non-modal window that "would look like a dialog, but would still be non-blocking."
- `View Mode | Float` keeps it in front of the IDE.
- `Close Tool Window After Committing`.
- `Show on Double-Click` with a sub-choice of `Diff` or `Source`. This is a real preference, not a fixed behavior: "The double click on the changed file can either open the Diff Viewer or the source file."

The Commit tool window can also be dragged to the bottom tool window bar, where it becomes horizontal. In that orientation the docs mention a `Preview Diff` button (`app-client.expui.general.previewVertically.svg`) for stash inspection.

### 1.2 The Git / Version Control tool window

Documented as the "Version Control window," opened with `Alt+9`, and titled per VCS in the UI as the Git tool window. It holds history and repository state. Its tabs:

- **Console**. "Shows the results of executing VCS-related commands."
- **Log**. "Shows all changes committed to all branches of the local and remote repositories, or to a specific branch or repository." Git and Mercurial only.
- **History**. Added on demand when `Show History` runs. One tab per file, directory, or selection.
- **Repository**. "Shows the changes committed to the repository under the VCS roots within the current project."
- **Incoming**. "Shows the changes committed to the repository by other team members, and not checked out locally."
- **Update Info**. Appears after an update. "It lists all commits that were made since the last sync with the remote."
- **Integrate to branch info view**. Appears after integration when `Run status after update` is set.
- **Local Changes**. Only when the Commit tool window is disabled.

### 1.3 How the Log tab is split

The Log tab is a four-pane layout, documented with a numbered legend image:

1. Branches pane, left. "Shows all local and remote branches."
2. Commits pane, center. The graph and commit list.
3. Changed Files pane, right. "Shows the list of files that were modified within the selected commit."
4. Commit Details pane, "on the right under the Changed Files pane." Toggled by `Show Details`.

This is a three-column master-detail with a stacked detail panel, not a two-pane list. A terminal-first tool that shows only a commit list is dropping the pane that answers "what did this commit touch."

### 1.4 What persists

- Branch filter tabs. The docs tell you to click `+` on the toolbar "to open a new tab matching your filters," which implies each tab keeps its own filter state. Filtering is stateful per tab.
- The Update Info tab opens automatically after an update unless `Automatically open the 'Update info' tab after updating the project` is cleared.
- The Commit tool window keeps its mode, position, and close-after-commit behavior across sessions through settings, not per project.
- The Log tab can stay open while the Commit tool window is closed, and the reverse. Nothing requires both.

---

## 2. Changed files model

### 2.1 Changelists are the base model

"A changelist is a set of local changes that have not yet been committed to a Git repository."

- Exactly one changelist is active at a time. New changes land there automatically.
- The first changelist is named `Changes`. The docs: "Initially, there is a single default changelist called Changes."
- `Unversioned Files` is a second built-in container, documented as "an Unversioned Files changelist that groups newly created files that haven't been added to Git yet." Note the ambiguity in JetBrains' own prose: it is called a changelist in one sentence and a node in another. In the tree it renders as a top-level node, not a user changelist.
- Creating one uses `New Changelist` from the file context menu, with a name and an optional description.
- Setting active is `Ctrl+Space` or `Set Active Changelist`. Moving files is `Move to Another Changelist` (`Alt+Shift+M`) or dragging files between changelists.
- Deleting is `Delete Changelist` from the context menu.

Changelists are IDE-side, not Git-side. They have no repository representation. The practical consequence for a competing tool: JetBrains gives users a grouping layer above files that survives without commits, and it can be switched off in favor of real Git staging.

### 2.2 Staging is an opt-in mode, not the default

`Settings | Version Control | Git` has `Enable staging area`. Turning it on relayouts the Commit tool window, documented with the screenshot `git_staging_area.png`, so staged and unstaged work are visible at once.

Documented consequences:

- "Using the staging area allows you to easily commit changes to the same file separately (including overlapping changes), and see which changes are already staged without switching focus from the editor."
- Existing changelists are preserved: "When you switch from using changelists to the Git staging area, all existing changelists are saved. You can switch between the two modes without losing your changes."
- Staging a whole file: select it and click `+` next to it, or `Ctrl+Alt+A`.
- Staging a chunk: click the editor change marker and choose `Stage`. Staged lines then show "a hollow change marker in the editor."
- Staging below chunk granularity: `Compare HEAD, Staged and Local Versions` from the context menu opens a three-way Diff Viewer where "the left pane shows the repository version, the right pane shows the local version, and the central pane is a fully-functional editor where you can make the changes you want to stage."

The default matters. A JetBrains user's habit is "everything modified is included unless I exclude it," with checkboxes as the exclude mechanism. Git users arriving from a terminal expect the opposite.

### 2.3 Grouping and hierarchy

- Grouping is configurable: by directory or by module. The control is a `Group By` button (`app.actions.groupBy.svg`) in the Changed Files pane and a `Group By` button in the Shelve dialog.
- A flat list is available by disabling grouping.
- `Expand All` and `Collapse All` work in tree view only. Documented shortcuts are `Ctrl+NumPad +` and `Ctrl+NumPad -`; the docs explicitly note the buttons "are only available when tree-view is enabled."
- Directories collapse because the tree is a directory tree, not a path list. There is no documented "collapse single-child directories" behavior, so I will not claim one.
- Ignored files are hidden by default. `Show Ignored Files` under View Options makes them visible.

### 2.4 Per-file indicators: color, not letters

This is a notable divergence from `git status` porcelain output. JetBrains documents file status as color on the filename, with no status letter in the changed-files list. The help page states: "You can check the status of a file in any interface element (for example, the editor or a tool window) by the color used to highlight the filename."

Light theme values from the file status table:

| Status | Color | Meaning as documented |
| --- | --- | --- |
| Added | `#0A7700` | "scheduled for addition to the repository" |
| Added in not active changelist | `#0EAA00` | file in an inactive changelist |
| Changelist conflict | `#FF0000` | file in an inactive changelist modified in the active one |
| Copied | `#0A7700` | metadata marks the file as a copy |
| Deleted | `#616161` | "scheduled for deletion from the repository" |
| Deleted from file system | `#773895` | deleted locally but not scheduled for deletion |
| Have changed descendants | `#8AA4C8` | directory containing modified files, recursive |
| Have immediate changed children | `#3264B4` | parent directory of a modified file |
| Ignored | `#727238` | "intentionally untracked by VCS" |
| Merged | `#7503DC` | merged as a result of an update |
| Merged with conflicts | `#FF0000` | merged with conflicts in the last update |
| Modified | `#0032A0` | "changed since the last synchronization" |
| Modified in not active changelist | `#0047E4` | same, inactive changelist |
| Obsolete | `#7C7C00` | should no longer be in the working copy |
| Renamed | `#007C7C` | renamed since the last update |
| Unversioned | `#993300` | exists locally, not in the repository, not scheduled |
| Up to date | default foreground | unchanged |

Darcula keeps the same status set with different hues: added `#629755`, modified `#6897BB`, merged `#9876AA`, renamed `#3A8484`, conflicts `#D5756C`, unversioned `#D1675A`, ignored `#848504`. High contrast uses saturated values such as `#62CC47` for added and `#ED864A` for deleted.

Two statuses are worth copying because they carry real information: "Deleted from file system" is distinct from "Deleted," and "Changelist conflict" flags a file touched in two changelists. Neither has a `git status` equivalent.

### 2.5 Selection for commit

- Checkboxes on each row, plus row-level selection. The docs say "select the corresponding files or an entire changelist."
- `Ctrl+K` "the entire active changelist will be selected," so the shortcut opens the commit UI with everything checked.
- "You can also select files under the Unversioned Files node. IntelliJ IDEA will stage and commit these files in one step." That one-step add-and-commit is a real convenience to match.
- Unselected changes stay local: "Unselected changes will stay in the current changelist, so that you can commit them separately."
- Conflicts appear as a `Merge Conflicts` node in the Changes view, with a link to resolve them and toolbar actions `Resolve Conflicts` and `Abort Merge`.

---

## 3. Commit flow

### 3.1 The commit message box

- Positioned above the file list. The shortcut set implies it takes focus when `Ctrl+K` runs.
- A history button (`app.vcs.history.svg`) opens "the list of recent commit messages."
- Rules live at `Settings | Version Control | Commit`. The docs mention a quick-fix and a `Reformat` action that "wrap a long line or reformat the message."
- A commit template can be set through `git config --local commit.template <path_to_template_file>`.
- The message box supports `Amend` inline in the gutter commit toolbar too.

### 3.2 Buttons and the split

Documented actions and their default shortcuts:

| Action | Shortcut | Effect |
| --- | --- | --- |
| Commit | `Ctrl+K` / `Cmd K` | commit to local repository |
| Commit and Push | `Ctrl+Alt+K` / `Cmd Opt K` | commit, then open the push review |
| Push | `Ctrl+Shift+K` / `Cmd Shift K` | push existing commits |

The docs present Commit and Commit and Push as the two ways to finish: "click Commit or Commit and Push ... to push the changes to the remote repository immediately after the commit. You will be able to review the current commit as well as all other commits before they are pushed."

The split-button arrangement itself, a primary Commit button with an adjacent dropdown holding Commit and Push, is not described in the help text. What is documented is the shortcut pair and the fact that both are buttons. Treat the exact chevron placement as unverified.

### 3.3 Amend

`Amend` is a checkbox with its own chevron: "If you want to append your local changes to an existing local commit rather than create a new one, select Amend and click [chevron] to choose the commit you want to modify." The chevron exists because amend can target a commit other than HEAD, which goes beyond `git commit --amend`.

Related history-editing actions in the Log context menu, which show how far the IDE leans on amend-style flows: `Fixup`, `Squash Into`, `Squash Commits`, `Drop Commits`, `Edit Commit Message`, `Undo Commit`, `Interactively Rebase from Here`.

### 3.4 Options behind the gear

`Ctrl+O` or the gear icon opens the advanced options popup. Documented groups:

`Author`. "If you are committing changes made by another person, you can specify the author."

`Sign-off commit`. Adds `Signed off by: <username>` at the end of the message. The docs describe the intent as certifying "that the changes you are about to check in have been made by you, or that you take the responsibility for the code you are committing."

`Commit Checks`, run before the commit:

- `Reformat code`
- `Rearrange code`
- `Optimize imports`
- `Cleanup`, with `Choose profile` to pick an inspection profile
- `Update copyright`, with a profile and scope
- `Check malicious dependencies`, which scans "malicious NPM and PyPI dependencies"

`Advanced Commit Checks`:

- `Run advanced checks after a commit is done`. Documented caveat: "if some of the advanced commit checks fail, the changes will be committed anyway." Also "if you want to Commit and Push ... your changes right away, the checks will be done before the commit," and the option "is not available for the modal commit interface."
- `Analyze code`, with an inspection profile
- `Check TODO`, with a configurable filter
- `Run Configuration`, described as "run tests as commit checks"

`After Commit`:

- `Upload files to`, a server access configuration or server group. Only present when the FTP/SFTP/WebDAV plugin is enabled.
- `Always use selected server or group of servers`.

Git hooks: "If there are Git hooks stored in `.git/hooks`, they are executed automatically during commit operations." Per-commit control is a `Run Git hooks` checkbox in commit settings, and a global override `Do not run Git commit hooks` under `Settings | Advanced settings | Version Control. Git`.

### 3.5 Partial commit of one file

Two documented routes.

Route one, chunk checkboxes in the diff:

1. Select the file, click the Diff icon or `Ctrl+D`.
2. "Select the checkbox next to each chunk of modified or newly added code that you want to commit, and leave other changes unselected."
3. For lines: right-click the line and choose `Split Chunks and Include Selected Lines into Commit`, or "hover over the gutter and select or clear the checkbox next to the line you want to include in the commit or exclude from it."
4. `Commit`. Unselected changes stay in the changelist.

Route two, changelist splitting at edit time: click the gutter change marker, then pick a target changelist from the toolbar. The action is `Move Lines to Another Changelist…` in the keymap, exposed as `Move to Another Changelist…` in the chunk context menu.

### 3.6 Inline commit from the editor

Clicking a change marker opens a toolbar with a message field and `Commit this change` (`intellij.platform.vcs.impl.icons.CommitInline.svg`). The field also carries `Amend` (`AmendInline.svg`). This is the fastest path in the product, and it exists because the gutter is always visible.

### 3.7 Push

`Push Commits` dialog contents:

- "all Git repositories (for multi-repository projects)" and "all commits made in the current branch in each repository since the last push."
- Clicking the repository name changes the target or opens `Define remote`.
- Clicking the branch name turns "the label into a text field," and `Edit all targets` edits every branch name at once. "You cannot change the local branch."
- Selecting a commit previews its changes on the right. `Enter` switches "to the editing mode" for the selected file.
- Commits whose author differs from the current user are "marked with an asterisk."
- `Push tags` with `All` or `Current Branch` (`git push --tags` versus `git push --follow-tags`).
- The Push button has a dropdown with `Push` and `Force push`. Force push runs `git push --force-with-lease`. Force push is unavailable when the branch is listed under `Protected branches`.
- `Ctrl+Q` on a commit shows "the commit author, time, hash and the commit message."

`Push Rejected` dialog appears when the branch is behind, unless `Auto-update if push of the current branch was rejected` is set. Options: which repositories to update, `Update all repositories`, `Remember the update method choice and silently update in the future`, then `Rebase` or `Merge`.

If no remote exists, "the Define remote link appears" in the dialog.

---

## 4. Diff viewer

### 4.1 Where it opens

"The Diff Viewer will be opened in a new tab." It is an editor tab by default, not a modal dialog. Two settings move it:

- `Show Diff in Separate Window` from the Diff Viewer's own settings, described in the docs as "Show Diff in Editor Tab: displays the Diff viewer as an editor tab instead of a separate window" and its inverse.
- `Open Diff as Editor Tab` under `Settings | Advanced Settings | Version Control`. Clearing it forces the separate window.

The viewer is a full editor, not a rendering: "The Diff Viewer provides a powerful editor that enables code completion, live templates, and other features." Edits apply live: "The changes that you apply in the Diff Viewer are automatically applied to the files."

### 4.2 Modes

`Side-by-side viewer` and `Unified viewer`, chosen from a toolbar toggle. "The side-by-side mode has two panels, and the unified mode has one panel." Editing is limited to the right panel in side-by-side, or the lower line in unified. "You can edit only local versions of your files. You cannot edit files that have read-only status."

Diff line colors: green for added, blue for modified, gray for deleted. Note this differs from the editor gutter palette, where modified is blue and added is green but the values differ.

### 4.3 Change navigation and per-change actions

Toolbar and shortcut set:

- `Previous Difference` `Shift+F7`, `Next Difference` `F7`. At the last difference, pressing `F7` again can move to the next modified file, controlled by `Go to the next file after reaching last change`.
- `Compare Previous File` `Alt+Left` and `Compare Next File` `Alt+Right`. "These controls are only available if more than one file has been modified locally."
- `Jump to Source` `F4`. "The caret is placed in the same position as in the Diff Viewer."
- `Collapse Unchanged Fragments`. The number of lines that stay uncollapsed is set on `Tools | Diff & Merge`.
- `Ctrl+Shift+Tab` switches panes; "The active pane has the caret."
- `Ctrl+Shift+D` opens "the popup menu of the most commonly used diff commands."
- `Ctrl+Z` and `Ctrl+Shift+Z` undo and redo merge operations, and "Conflicts will be kept in sync with the text."

The per-change gutter control is one button with two behaviors, and this is the detail most worth copying exactly:

- Default click applies the change. The docs call the action `Accept`, rendered with `arrowRight@14x14` and `arrow@14x14` chevrons.
- Holding `Ctrl` turns the arrow into a down chevron, `arrowRightDown` or `arrowLeftDown`, and the action changes to `Append`. Append keeps the original text and adds the incoming change below it instead of replacing.

So JetBrains overloads one affordance with accept versus append, and documents the modifier. The words "Accept" and "Append" are the exact UI strings.

`Revert` is the word used in the editor gutter marker toolbar for discarding a change, alongside `Show Diff`. The docs describe the marker toolbar as opening "together with a frame showing the previous contents of the modified line," so the user sees what is being discarded before clicking.

### 4.4 Whitespace and word-level highlighting

`Ignore Differences` options, quoted:

- `None`. "white spaces are important, and all the differences are highlighted. This option is selected by default."
- `Trim whitespaces`. Trims `("\t", " ")` at line ends and starts. "If two lines differ in trailing whitespaces only, these lines are considered equal."
- `Ignore whitespaces`. Whitespace is ignored "regardless of their location."
- `Ignore whitespaces and empty lines`. Also ignores "all added or removed lines consisting of whitespaces only" and split or join changes such as `a b c` versus `a \n b c`.
- `Ignore imports and formatting`. "changes within import statements and whitespaces are ignored (whitespaces within String literals are respected though)."

`Highlighting Differences` options, quoted: `Words` ("modified words are highlighted"), `Lines`, `Split changes` (splits `A \n B` versus `A X \n B X` into two changes instead of one), `Characters`, and `None` ("the differences are not highlighted at all," recommended for heavily modified files).

Word-level highlight is what JetBrains calls the `By word` mode in the whitespace section. This is the "highlight words" behavior. There is no separate switch for it beyond `Words` in the highlighting list.

### 4.5 Context menus

Middle-of-editor menu: `Annotate`, `Show Whitespaces`, `Show Line Numbers`, `Show Indent Guides`, `Soft-Wrap`, `Highlighting level`.

Both-editors menu: `Annotate`, `Accept/Append`, `Compare with Clipboard`, `Switch to Three-Side Viewer`. The last one "allows you to load a third file and add it to the comparison," which is how an ad hoc three-way view gets built outside a merge.

Right-panel menu: `Go to high-priority problems only` / `Go to next problem`, `Customize highlighting level`, `Show code lens on scrollbar hover`.

Merge-only toolbar entries: `Compare Contents` (documented as Base versus Middle, where "Base refers to the file version that the local and the repository versions originated from" and "Middle refers to the resulting version"), `Apply All Non-Conflicting Changes`, `Apply Non-Conflicting Changes from the Left/Right Side`, `Resolve Simple Conflicts`.

---

## 5. Git log and graph

### 5.1 Commit list contents

"For each commit, the list shows the commit message, the author, and the commit timestamp."

Label colors on branch markers:

- yellow, "marks the current branch head"
- green, "marks local branches"
- violet, "marks remote branches"

Row treatment:

- "Commits to the current branch are displayed against the light blue background, while commits to all other branches are shown against the white background."
- "Commits made by you are marked with bold."
- "The asterisk next to a commit marks commits where the author and the user who committed the changes are different."
- In multi-root projects, "the colored stripe on the left indicates which root the selected commit belongs to," with a hover tip showing the root path.

Columns are configurable: "You can choose whether you want the log to show the author, the date, the commit hash, and the GitHub commit checks performed by your CI system." `Show Root Names` expands a Roots column with full names.

### 5.2 Graph rendering options

Under `Graph Options` (`intellij.platform.vcs.log.impl.icons.new.intelliSort.svg`):

- Sort `By commit date`, the default, or `Topologically`, which shows "incoming commits first, directly below the merge commit."
- `Show First Parent`, to display only the first parent.
- `No Merges`, "to filter out merge commits for a cleaner view of individual changes."
- `Collapse Linear Branches`, which draws "a dotted line ... instead of successive commits." Individual branches can be collapsed by clicking them.
- `Expand Linear Branches` restores them.
- `Long Edges`. When disabled, the default, "long branches are replaced with a down arrow." This is a direct large-repo performance measure.

### 5.3 Filtering and search

- Search field matches "full commit names or messages, or their fragments, revision numbers, or regular expressions." `Ctrl+L` focuses it. `Ctrl+F` is `Go to Hash/Branch/Tag`, which jumps "to the latest commit in that branch."
- `Regex` and `Match Case` toggles, rendered as `.* / Cc` in the toolbar.
- `Branch`, with `All` for every local and remote branch, and support for two-dot range notation: enter `branch1..branch2` to list commits in `branch2` not in `branch1`. Confirmed with `Ctrl+Enter`.
- `User`, with `Select` and type-ahead.
- `Date`, a time frame or one specific date.
- `Paths`, with `Select Folders`, and per-root checkboxes for multi-root projects.

### 5.4 Presentation settings

Under `Presentation Settings` (`app-client.expui.general.show.svg`): `Compact References View`, `Tag Names`, `Long Edges`, `Commit Timestamp`, `References on the Left`, `Show Root Names`, and `Columns`. Highlight toggles: `My Commits` bold, `Merge Commits` greyed out, `Current Branch` blue background, `Not Cherry-Picked Commits` greyed out.

`Compact References View` collapses multiple branch references on one commit into a chip; disabling it lists each reference on its own line.

### 5.5 How commits show their files

Files do not expand inline under a commit. Selecting a commit populates the Changed Files pane, and `Commit Details` sits beneath it. Details include "the commit message, hash, author, the link to the author's email, date, time, GPG signature, root and branches." If a commit sits on more than six branches, "only the first six are displayed, and the Show All link appears."

Two shortcuts make commit-to-commit comparison cheap: select two commits and `Compare Versions`, which opens the Changes tool window with the union of modified files; or `Compare with Local`.

Merge commits get special treatment. For a clean merge, the pane shows "changes that originate from both parents" as separate nodes. For a conflicted merge, `Show Diff` opens "a three-panel diff allowing you to compare the current version with each of its parents, and see how exactly conflicts were resolved." This is a genuinely strong idea: history stores the resolution, and the UI can replay it.

### 5.6 File history and selection history

- `Git | Selected File | Show History` adds a `History` tab with the file's revisions. Selecting a revision shows the diff "instantly" on the right.
- `Git | Current File | Show History for Selection` opens history "for the selected fragment" in a separate window, and "if nothing is selected, the history will be displayed for the current line." This is the "Show History for Selection" the brief asks about. The wording varies slightly: the menu is `Show History for Selection` and the command list names `Git | Current File | Show History for Selection`.
- Directories work too: select one or more directories and `Git | Show History`, which adds a tab filtered to those folders.
- A `Renaming` column "expand[s] it and review the history of the file's renaming."
- View options in History: `Show Commit Timestamp`, `Show Details`, `Show Diff Preview`.
- `Show All Affected Files` (`Alt+Shift+A`) opens `Paths Affected in Revision`.
- `Enable Git Log Indexing` advertises "Fast log filtering and computing precise history," "Displaying all branches in file history," and "Searching across history in Search Everywhere." It is a toggle in the toolbar and in `Settings | Version Control | Confirmation | Log`, which tells you indexing is optional and costs something.

---

## 6. Stash and shelve

### 6.1 The distinction, in JetBrains' own words

- "Stashes are generated by Git, and can be applied from within IntelliJ IDEA, or outside it."
- "Patches with shelved changes are generated by IntelliJ IDEA and are also applied through the IDE."
- "Stashing involves all uncommitted changes, while when you shelve changes, you can select some of the local changes instead of shelving them all."

That third line is the whole design difference. Stash is all-or-nothing and interoperable. Shelf is selective and proprietary.

Both live as tabs in the Commit tool window. `Settings | Version Control | Git | Stash` has `Combine stashes and shelves in one tab`, which produces a single `Stashes and Shelves` view.

### 6.2 Stash flow

`Git | Stash Changes` from the Commit tool window context menu. The Stash dialog asks for:

- Git root, when there are several.
- Branch confirmation: "make sure that the correct branch is checked out."
- `Message`.
- `Keep index`, documented as stashing local changes "and bring the changes staged in the index to your working tree for examination and testing."
- `Create Stash`.

Entries appear in the `Stash` tab. To inspect, "double-click any file from the list to open the diff of stashes," which opens a `Diff` tab comparing the stash to the current code.

Apply and remove are separate words: `Apply` "apply the selected stash and keep it in the list," `Pop` "apply the selected stash and remove it from the list." Context menu also has `Unstash`, which offers `As new branch` plus `Reinstate Index` ("To apply stashed index modifications as well"), then `Apply Stash`. Removal is `Drop` for one and `Clear` for all.

Constraint: "You cannot apply a stash to a dirty working copy, that is a working copy with uncommitted changes." Also "applying a stash after a series of commits results in conflicts."

There is no documented hunk-level stash. The docs never offer selecting hunks inside a stash creation dialog. Partial work is done through changelists or partial commit, or by shelving a subset. A design that offers `stash -p` in the UI would be ahead of JetBrains, not behind it.

### 6.3 Shelve flow

`Shelve Changes` from the context menu opens a dialog with:

- A file list, "All files in the list are selected by default," with checkboxes to deselect.
- `Show Differences` (`Ctrl+D`) to diff a file.
- `Revert`, to "Revert all changes made to the local working copy of the selected files." This one is dangerous in a stash dialog and sits next to the inspect button.
- `Refresh Changes` (`Ctrl+F5`).
- `Group By` directory or module.
- `Expand All` and `Collapse All`.
- A `Changelist` selector, defaulting to the active changelist.
- A summary line: "statistics on the currently selected changelist, such as the number of modified, new and deleted files," plus how many will be shelved.
- A `Commit Message` field that is reused as the shelf name. The docs say "enter the name of the shelf to be created," which is a naming collision worth avoiding.
- A Diff pane comparing the base version against "the version you are about to shelve."
- The `Shelve Changes` button.

Shortcuts: `Shelve Silently` (`Ctrl+Shift+H`) skips the dialog and uses the changelist name as the shelf name. `Save to Shelf` copies changes to a shelf "without resetting local changes."

Drag and drop is first class here: "drag a file or a changelist from the Commit tab to the Shelf tab ... wait for a second until it's activated, and edit the new shelf name after releasing the mouse button."

Unshelve: `Ctrl+Shift+U`, or `Unshelve Silently` with `Ctrl+Alt+U`. The Unshelve dialog takes a target changelist `Name`, a `Comment`, `Set active`, `Track context`, and `Remove successfully applied files from the shelf`. Dragging from Shelf to Commit unshelves; `Ctrl`-drag copies and keeps the shelf.

Constraints and edge cases:

- "You cannot shelve unversioned files."
- Unshelved files that were removed can be recovered from `Recently Deleted` or through the `Already Unshelved` filter plus `Restore`.
- `Import Patches` turns an external patch into a shelf.
- Shelves are stored on disk, under the project by default, and `Change Shelves Location` can move them, optionally with `Move shelves to the new location`. The docs motivate this with "avoid deleting shelves accidentally when cleaning up your working copy."
- `Shelve base revisions of files under distributed version control systems` stores base revisions so a later 3-way merge does not have to search project history for them.

---

## 7. Push, pull, update, and branches

### 7.1 Status bar and the VCS widget

Branch state lives in the main window header, not the status bar, in current builds. The docs describe "the VCS widget" at the top: "in the main window header, click the widget with the name of the branch that is currently checked out."

The widget carries both counters:

- Incoming: a blue arrow (`app.expui.vcs.changesUpdate@12x12.svg`) "next to the branch name" with "the number of incoming commits that have not yet been fetched."
- Outgoing: a green arrow (`app.expui.vcs.changesPush@12x12.svg`) with "the number of outgoing commits."

Two counters in one chip is the whole status model. No ahead/behind slash notation, no separate sync button.

### 7.2 Fetch, update, pull

`Fetch` "downloaded into your local copy. This new data is not integrated into your local files." Entry points: `Git | Fetch`, the fetch icon in the widget, or `Fetch remote changes automatically` under `Settings | Version Control | Git | Update`, which "runs every 20 minutes by default (configurable via the `git.update.incoming.info.time` registry key)."

`Update` on a branch is "a convenient shortcut for fetching and subsequently applying changes to the selected branch," and it "will rebase or merge them into the local branch depending on which update method is selected."

`Pull` opens the `Pull Changes` dialog with remote and branch selectors and `Modify options` for `--rebase`, `--ff-only`, `--no-ff`, `--squash`, `--no-commit`, `--no-verify`. "If you specify a different branch, IntelliJ IDEA will remember your choice."

`Update Project` (`Ctrl+T`) fetches "from all project roots and branches" and merges tracked remote branches. Its dialog offers exactly three strategies, quoted:

- `Merge the incoming changes into the current branch`
- `Rebase the current branch on top of the incoming changes`
- `Reset to the Remote Branch`, which will "drop all local commits and align your branch exactly with the remote version"

The chosen strategy applies "to all roots that are under Git version control." After updating, the Update Info tab opens with commits since the last sync.

Submodule note: if a submodule is on a branch it updates automatically; if detached, the IDE runs `git submodule update`.

### 7.3 Branch popup structure

The widget groups branches into four nodes, quoted:

- `Recent branches`, "up to five recently checked-out branches"
- `Local branches`
- `Remote branches`, "available after the latest fetch"
- `Tags`, which can be checked out, compared with the working tree, merged, pushed, or deleted

"IntelliJ IDEA automatically groups branches by directory and stores them in expandable lists," with `Group by Directory`, `Show Recent Branches`, and `Show Tags` toggles behind the widget's `Settings` gear. Favorites float to the top; "the main branch is marked as a favorite by default." Hovering a branch shows a star to favorite it, or press `Space`. `Ctrl+C` on a hovered branch copies its name.

### 7.4 Checkout dialogs

- `New Branch` from the widget, or `New Branch from '<branch>'` in the Branches pane, or `New Branch` on a commit in the Log. The dialog takes a name and a `Checkout branch` checkbox, and suggests prefixes "based on the names of existing local branches."
- `Checkout and Update` syncs the branch with its remote while switching.
- `Checkout and Rebase onto '<current>'`, `Rebase '<current>' onto '<selected>'`, `Merge '<selected>' into '<current>'`, `Pull into '<current>' Using Rebase`, `Pull into '<current>' Using Merge`, `Update`, `Push`, `Rename`, `Delete`, `New Worktree from '<selected>'`, `Show Diff with Working Tree`, `Compare with '<current>'`.

Conflicting checkout has a distinctive resolution: if a local branch name already exists remotely and resetting would lose commits, the IDE offers `Drop Local Commits` or `Rebase onto Remote`. If uncommitted changes would be overwritten, it offers `Force Checkout` or `Smart Checkout`. "If you click Smart Checkout, IntelliJ IDEA will shelve uncommitted changes, check out the selected branch, and then unshelve the changes." A `Clean working tree using` setting switches this from shelve to stash.

`Rename` offers `Unset upstream branch`, with the documented consequence that the next push creates and tracks a new remote branch.

Deleting a branch shows "a notification ... from which you can restore the deleted branch." Unmerged commits trigger a link to view them, and there is a link to remove the remote branch. Restoration stays available in the Notifications tool window "until you restart IntelliJ IDEA."

### 7.5 Multi-root behavior

`Execute branch operations on all roots` makes checkout, merge, and delete apply "to all roots as if it were a single repository." If one repository fails, "IntelliJ IDEA prevents branches from diverging by suggesting that you roll back this operation in the repositories where it was successful." Checking out on only one root produces a `Branches have diverged` warning in the widget.

---

## 8. Conflict resolution

### 8.1 The entry dialog

When a Git operation produces conflicts, `Files Merged with Conflicts` opens. It offers three choices per file:

- `Accept Yours`, "keep the changes from the currently checked-out branch and discard the changes from the branch you are merging"
- `Accept Theirs`, the inverse
- `Resolve each conflict manually`

Plus `Resolve All Simple Conflicts` to auto-merge non-conflicting changes across all files, and `Resolve Manually` to open the tool.

The dialog tracks progress: "The list of unresolved and resolved conflicts in the Conflicts dialog," and when nothing remains, `Accept and Finish` becomes enabled.

If the dialog is dismissed, a `Merge Conflicts` node remains in the Changes view of the Commit tool window "with a link to resolve them," and the toolbar offers `Resolve Conflicts` and `Abort Merge`.

### 8.2 The merge tool

Double-clicking a conflicted file opens a three-pane view:

- Left pane, "the read-only local copy"
- Right pane, "the read-only version checked in to the repository"
- Center pane, "a fully-functional editor where the results of resolving conflicts are displayed. Initially, the contents of this pane are the same as the base revision of the file."

The center starts at base, not at either side. That is the base/middle distinction the Compare Contents menu documents: "Base refers to the file version that the local and the repository versions originated from (initially displayed in the middle pane), while Middle refers to the resulting version."

Color legend in the merge tool: modified line, deleted lines, newly added lines, conflicting lines.

### 8.3 Actions, with exact wording

- `Apply All Non-Conflicting Changes` (`app.diff.applyNotConflicts.svg`). Can be made automatic with `Automatically apply non-conflicting changes` on `Tools | Diff & Merge`.
- `Apply Non-Conflicting Changes from the Left Side` and `... from the Right Side`.
- `Resolve Simple Conflicts` (`app.diff.magicResolve.svg`), for "simple conflicts (for example, if the beginning and the end of the same line have been modified in different file revisions)." Documented caveat: these are not handled by apply-non-conflicting "since you must make sure that they are resolved properly."
- Per-side accept or ignore, with the Accept arrow (`app.diff.arrow.svg`) and Ignore (`app.diff.remove.svg`) rendered against the left and right versions, with the result checked in the center pane.
- Center-pane context menu: `Resolve using Left` and `Resolve using Right`, which "provide a shortcut to accepting changes from one side and ignoring them from the other side."
- `Compare Contents` (`app-client.expui.vcs.diff.svg`) to compare versions.
- `Apply Changes` commits the resolution for that file and "the next file with conflicts will open."
- `Save and Close` returns "to the list of remaining conflicts."
- `Revert conflict resolution` puts a file back to "its conflicted state."
- `Accept and Finish` ends the merge.
- The center pane's gutter marker toolbar has `Revert` and `Apply all non-conflicting changes` actions; the docs describe using it to "apply all of them simultaneously using the Apply all non-conflicting changes action and then undo the unwanted ones using the Revert action from this toolbar."

There is no documented "accept left / accept right / accept both" button on the conflict block itself in the help text. The mechanics are: accept or ignore radio per side, the Resolve using Left/Right context menu, or editing the center by hand.

### 8.4 Line ending conflicts

If `Warn if CRLF line separators are about to be committed` is on, a Line Separators Warning Dialog appears with `Commit As Is` or `Fix and Commit`, the latter setting `core.autocrlf` to `true` on Windows and `input` on Linux and macOS. Files with explicit Git attributes skip the warning.

---

## 9. Interaction details worth copying

### 9.1 Shortcut set

| Key | Action |
| --- | --- |
| `Alt+0` | Commit tool window |
| `Alt+9` | Git tool window |
| `Ctrl+K` | Commit, and select the whole active changelist |
| `Ctrl+Alt+K` | Commit and Push |
| `Ctrl+Shift+K` | Push |
| `Ctrl+D` | Show diff for selection |
| `F7` / `Shift+F7` | Next / previous difference |
| `F4` | Jump to source from diff |
| `Ctrl+Alt+A` | Add to VCS, and stage in staging mode |
| `Ctrl+Alt+Z` | Rollback |
| `Ctrl+Shift+H` | Shelve silently |
| `Ctrl+Shift+U` | Unshelve |
| `Ctrl+Alt+U` | Unshelve silently |
| `Ctrl+T` | Update Project |
| `Ctrl+F5` | Refresh in log and dialogs |
| `Ctrl+O` | Advanced commit options |
| `Ctrl+Space` | Set active changelist |
| `Alt+Shift+M` | Move to another changelist |
| `Ctrl+L` | Focus the log search field |
| `Ctrl+F` | Go to Hash/Branch/Tag |
| `Ctrl+Shift+D` | Common diff commands popup |
| `Ctrl+Shift+Tab` | Switch diff panes |
| `Ctrl+Shift+F12` | Hide all tool windows |

`Ctrl+K` doing double duty, opening the panel and selecting everything, is a small but consequential choice. It means the "commit everything" path is one keystroke and the "commit some" path is a second action.

### 9.2 Double-click behavior

Double-click is overloaded per surface and configurable in one of them:

- Commit tool window file row: opens the Diff Viewer or the editor, per `Show on Double-Click`.
- Stash tab file: opens the stash diff.
- Conflicted file: opens the merge tool.
- Log changed-files row: opens the diff.

### 9.3 Context menus, the full action surface

Commit tool window file or changelist: `New Changelist`, `Set Active Changelist`, `Move to Another Changelist`, `Rollback`, `Shelve Changes`, `Git | Stash Changes`, `Add to VCS`, `Add to .gitignore`, `Delete Changelist`.

Rollback has its own dialog with `Delete local copies of added files`, which is the documented way to get an accidentally added file back to unversioned. The docs also admit a real gap: "If you have accidentally added a file to Git, there is currently no single action to stop tracking it," and give a workaround involving settings, moving the file out, deleting, and moving it back.

Log commit row: `Copy Revision Number`, `Create Patch`, `Cherry-pick`, `Checkout Revision`, `Show Repository at Revision`, `Compare with Local`, `Reset Current Branch to Here`, `Revert Commit`, `Undo Commit`, `Edit Commit Message`, `Fixup`, `Squash Into`, `Drop Commits`, `Squash Commits`, `Interactively Rebase from Here`, `Push All up to Here`, `Add Commits to Remote Branch`, `Rebase <current> onto Selected Commit`, `Branch <name>` / `Branches`, `New Branch`, `New Tag`, `Go to Child Commit`, `Go to Parent Commit`, `View in browser`.

Log changed-files row: `Show Diff`, `Show Diff in a New Window`, `Compare with Local`, `Compare Before with Local`, `Edit Source`, `Open Repository Version`, `Revert Selected Changes`, `Cherry-Pick Selected Changes`, `Extract Selected Changes to Separate Commit`, `Drop Selected Changes`, `Create Patch`, `Get from Revision`, `History Up to Here`, `Show Changes to Parents`.

`Extract Selected Changes to Separate Commit` and `Drop Selected Changes` are the two that show the panel is a commit editor, not just a viewer. Partial revert puts "changes that revert the selected file ... in the active changelist," which is a clean model: undoing published work produces new pending work rather than rewriting history.

### 9.4 Inline change markers

- Markers appear in the editor gutter and disappear when the file is committed.
- Hover then click opens a toolbar with the previous contents in a frame, plus `Revert` and `Show Diff`.
- "Instead of reverting the whole file, you can copy any part of the contents of this popup and paste it into the editor." Copying out of the preview is a small, useful escape hatch.
- Staged lines show a hollow marker; unstaged show a filled one.
- Deleted lines render as a gray triangle in the gutter with no line to highlight. Light theme uses `#9F9F9F`; Darcula uses `#656E76`.
- Line background colors for inline highlighting, light theme: modified `#C3D6E8`, whitespace-only modified `#EDDCBC`, added `#C9DEC1`. Darcula: `#374752`, `#4C4638`, `#384C38`. High contrast: `#1AABFF`, `#666666`, `#009924`.
- The feature is switchable: `Highlight modified lines in the gutter` under `Version Control | Confirmation | Gutter`.

The distinct color for whitespace-only modifications is unusual and cheap. It lets a reviewer skip noise without enabling a global ignore-whitespace mode.

### 9.5 Drag and drop

Three documented uses: files between changelists, a file or changelist from the Commit tab to the Shelf tab with inline rename on drop, and from Shelf back to Commit to unshelve, with `Ctrl` held to copy instead of move.

### 9.6 Performance behavior on large repos

Documented mechanisms, not benchmarks:

- `Enable Git Log Indexing` is optional, and the docs sell it as the fix for slow filtering: "Fast log filtering and computing precise history."
- `Long Edges` off by default replaces long branches with a down arrow.
- `Collapse Linear Branches` replaces runs of commits with a dotted line.
- `No Merges` and `Show First Parent` cut the graph down.
- The log is filtered server-side by branch, user, date, and path, and each filter combination can live in its own tab.
- Automatic fetch is a 20-minute background task, tunable via a registry key. The default is conservative because fetch on a large repo is not free.
- The Change tool window's grouping can be turned off to get a flat list, which matters when a directory tree is deep.

### 9.7 Two gaps to note before the design review

- The help pages do not describe a spacebar preview of a diff. Selection plus `Ctrl+D`, or double-click, is the documented path. A spacebar preview would be a new idea, not a copied one.
- The help pages do not describe status letters such as `M`, `A`, `D` in the changed-files list. Status is color. If the new tool shows letters, it diverges in a place where JetBrains-trained users have no habit to lean on.

---

## 10. Sources

Pages fetched for this document, in order. All returned HTTP 200.

1. https://www.jetbrains.com/help/idea/version-control-integration.html
2. https://www.jetbrains.com/help/idea/commit-and-push-changes.html.md
3. https://www.jetbrains.com/help/idea/investigate-changes.html.md
4. https://www.jetbrains.com/help/idea/differences-viewer.html.md
5. https://www.jetbrains.com/help/idea/log-tab.html.md
6. https://www.jetbrains.com/help/idea/managing-changelists.html.md
7. https://www.jetbrains.com/help/idea/resolve-conflicts.html.md
8. https://www.jetbrains.com/help/idea/shelving-and-unshelving-changes.html.md
9. https://www.jetbrains.com/help/idea/version-control-tool-window.html.md
10. https://www.jetbrains.com/help/idea/sync-with-a-remote-repository.html.md
11. https://www.jetbrains.com/help/idea/adding-files-to-version-control.html.md
12. https://www.jetbrains.com/help/idea/manage-branches.html.md
13. https://blog.jetbrains.com/idea/?s=commit+tool+window

Requested pages that no longer exist, with what happened instead:

- `https://www.jetbrains.com/help/idea/manage-changes-with-git.html` returned the Getting Started page, not Local Changes content. Replaced with `managing-changelists.html.md`, `commit-and-push-changes.html.md`, and `version-control-tool-window.html.md`, which cover changelists, the Commit tool window, and the tab inventory.
- `https://www.jetbrains.com/help/idea/stash-changes.html` returned the Getting Started page. Replaced with `shelving-and-unshelving-changes.html.md`, which documents both stash and shelf.
- `https://www.jetbrains.com/help/idea/file-status-highlights.html` returned the Getting Started page. The full file status color tables came from `adding-files-to-version-control.html.md` instead.
- `https://www.jetbrains.com/help/idea/merge-conflicts.html` was not fetched separately because `resolve-conflicts.html.md` covers the conflicts dialog and the three-pane tool, and the Conflicts dialog is the documented entry point.
- The blog search page returned only navigation chrome, truncated before results. No blog post is cited, and no claim in this document depends on one.

The `.md` suffix is a JetBrains feature that serves a Markdown version of each help page. It strips the shortcut permutations that make the HTML pages long and noisy. A team reading these pages should use the `.md` form.
