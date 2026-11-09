window.__ModuleLoader__.load({
  id: 'dsh-git-desk',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useMemo, useCallback } = React;

    const NS = 'git';
    const GIT_TAB_ID = 'dsh-git';

    const EN = {
      'panel': 'Git',
      'mode.changes': 'Changes',
      'mode.log': 'History',
      'mode.stash': 'Stashes',
      'guide.title': 'Git changes',
      'guide.description': 'Review, stage, commit, and sync the workspace repository.',
      'section.conflicts': 'Conflicts',
      'section.staged': 'Staged',
      'section.unstaged': 'Unstaged',
      'section.stagedCount': '{count} staged',
      'section.unstagedCount': '{count} changed',
      'section.conflictCount': '{count} unresolved',
      'empty.noChanges': 'No changes',
      'empty.noChangesHint': 'The working tree matches the last commit.',
      'empty.selectFile': 'Select a file to review it',
      'empty.selectFileHint': 'The full file is shown on both sides. Nothing is collapsed.',
      'empty.noRepo': 'Not a Git repository',
      'empty.noRepoHint': 'This workspace is not a repository yet.',
      'empty.init': 'Initialize repository',
      'empty.noWorkspace': 'No workspace is open',
      'empty.noWorkspaceHint': 'Open a workspace, then return to Git.',
      'empty.noHistory': 'No commits yet',
      'empty.noHistoryHint': 'The first commit will appear here.',
      'empty.noStashes': 'No stashes',
      'empty.noStashesHint': 'Park work here before switching tasks.',
      'action.stageFile': 'Stage file',
      'action.unstageFile': 'Unstage file',
      'action.stageAll': 'Stage all',
      'action.unstageAll': 'Unstage all',
      'ai.action': 'AI actions',
      'ai.write': 'Write a commit message',
      'ai.branch': 'Create a branch and commit',
      'ai.written': 'Message written with {model}',
      'action.stageBlock': 'Stage block',
      'action.unstageBlock': 'Unstage block',
      'action.revertBlock': 'Revert block to the staged version',
      'action.refresh': 'Refresh',
      'action.back': 'Back to changes',
      'action.prevChange': 'Previous change',
      'action.nextChange': 'Next change',
      'action.close': 'Close',
      'action.cancel': 'Cancel',
      'action.confirm': 'Confirm',
      'action.commit': 'Commit',
      'action.committing': 'Committing',
      'action.branch': 'Branch',
      'action.createBranch': 'Create branch and commit',
      'action.checkout': 'Checkout',
      'action.fetch': 'Fetch',
      'action.pull': 'Pull',
      'action.push': 'Push',
      'action.apply': 'Apply',
      'action.pop': 'Pop',
      'action.drop': 'Drop',
      'action.stash': 'Stash changes',
      'action.acceptOurs': 'Accept ours',
      'action.acceptTheirs': 'Accept theirs',
      'action.retry': 'Retry',
      'action.init': 'Initialize',
      'action.newBranch': 'New branch',
      'action.createAndSwitch': 'Create and switch',
      'repo.title': 'Repositories',
      'repo.current': 'Current repository',
      'repo.workspace': 'Workspace folder',
      'repo.pick': 'Switch repository',
      'repo.none': 'No repository found',
      'repo.initRoot': 'New repository at the workspace root',
      'repo.initRootTitle': 'Initialize at the workspace root?',
      'repo.initRootBody': 'The workspace contains {count} repositories. A repository at the workspace root treats each of them as an untracked folder. Pick one of the repositories instead.',
      'repo.initRootConfirm': 'Initialize anyway',
      'action.revert': 'Revert block',
      'diff.split': 'Split',
      'diff.unified': 'Unified',
      'diff.head': 'HEAD',
      'diff.staged': 'Staged',
      'diff.local': 'Local',
      'diff.parent': 'Parent',
      'diff.commit': 'Commit',
      'diff.binary': 'Binary file changed',
      'diff.binaryHint': '{before} to {after}',
      'diff.conflictBanner': 'This file has unresolved conflicts. Commit is blocked until you resolve it.',
      'diff.loading': 'Loading diff',
      'diff.noChanges': 'No changes in this file',
      'diff.fullFile': 'Full file',
      'diff.layout': 'Diff layout',
      'diff.changes': 'Changes in this file',
      'diff.lines': '{count} lines',
      'commit.placeholder': 'Describe the change',
      'commit.hintStage': 'Stage a file to commit.',
      'commit.hintConflict': 'Resolve conflicts before committing.',
      'commit.hintMessage': 'Write a commit message.',
      'commit.done': 'Committed {hash}',
      'commit.amend': 'Amend last commit',
      'branch.title': 'Branch and commit',
      'branch.name': 'Branch name',
      'branch.nameHint': 'Created from the current HEAD, then the staged changes are committed.',
      'branch.message': 'Commit message',
      'branch.created': 'Created {branch} and committed',
      'branch.current': 'Current branch',
      'branch.local': 'Local branches',
      'branch.loading': 'Loading branches',
      'branch.none': 'No branches',
      'branch.new': 'New branch',
      'branch.newTitle': 'New branch',
      'branch.newHint': 'Created from the current HEAD and checked out. No commit is made.',
      'branch.search': 'Search branches',
      'branch.remote': 'Remote branches',
      'branch.createdOnly': 'Created {branch}',
      'branch.noneMatch': 'No branch matches',
      'stash.title': 'Stash changes',
      'stash.message': 'Stash message',
      'stash.select': 'Files to stash',
      'stash.selectHint': 'Only the selected files are stashed. Untracked files are included.',
      'stash.default': 'WIP',
      'stash.nothing': 'No files to stash.',
      'stash.created': 'Stashed {count} files',
      'stash.applied': 'Applied {ref}',
      'stash.popped': 'Popped {ref}',
      'stash.dropped': 'Dropped {ref}',
      'stash.dropTitle': 'Drop stash',
      'stash.dropBody': 'This deletes {ref} permanently. The changes are not applied.',
      'sync.fetched': 'Fetched',
      'sync.pulled': 'Pulled',
      'sync.pushed': 'Pushed',
      'sync.ahead': '{count} ahead',
      'sync.behind': '{count} behind',
      'sync.noUpstream': 'This branch has no upstream. Push sets one.',
      'sync.none': 'Up to date',
      'log.title': 'History',
      'log.loading': 'Loading history',
      'log.select': 'Select a commit',
      'log.files': 'Changed files',
      'log.noFiles': 'No file changes',
      'log.author': 'Author',
      'log.date': 'Date',
      'log.parent': 'Parent',
      'log.message': 'Message',
      'status.loading': 'Reading repository',
      'status.detached': 'Detached HEAD',
      'error.title': 'Git action failed',
      'error.notInstalled': 'Git is not installed',
      'error.notInstalledHint': 'Install Git and make it available on PATH, then refresh.',
      'confirm.revertTitle': 'Revert this block?',
      'confirm.revertBody': 'The local block is replaced by the staged version. This working tree change is lost.',
      'confirm.checkoutTitle': 'Switch branch?',
      'confirm.checkoutBody': 'Local changes are carried over when Git can keep them, otherwise the checkout is refused.',
      'confirm.yesRevert': 'Revert block',
      'confirm.yesCheckout': 'Switch branch',
      'meta.binary': 'binary',
      'meta.blocks': '{count} blocks',
      'meta.add': '{count} added',
      'meta.del': '{count} deleted',
      'filter.placeholder': 'Filter files...',
      'filter.empty': 'No files match "{filter}"',
      'action.copyHash': 'Copy commit hash',
      'action.copied': 'Copied!',
      'diff.unstaged': 'Unstaged',
      'diff.staged': 'Staged',
      'stash.selectAll': 'Select all',
      'stash.deselectAll': 'Deselect all',
    };

    const ZH = {
      'panel': 'Git',
      'mode.changes': '更改',
      'mode.log': '历史',
      'mode.stash': '贮藏',
      'guide.title': 'Git 更改',
      'guide.description': '查看、暂存、提交并同步工作区仓库。',
      'section.conflicts': '冲突',
      'section.staged': '已暂存',
      'section.unstaged': '未暂存',
      'section.stagedCount': '已暂存 {count}',
      'section.unstagedCount': '已更改 {count}',
      'section.conflictCount': '未解决 {count}',
      'empty.noChanges': '没有更改',
      'empty.noChangesHint': '工作区与最近一次提交一致。',
      'empty.selectFile': '选择一个文件查看更改',
      'empty.selectFileHint': '两侧都显示完整文件，不会折叠。',
      'empty.noRepo': '不是 Git 仓库',
      'empty.noRepoHint': '当前工作区还不是仓库。',
      'empty.init': '初始化仓库',
      'empty.noWorkspace': '没有打开的工作区',
      'empty.noWorkspaceHint': '打开一个工作区，然后回到 Git。',
      'empty.noHistory': '还没有提交',
      'empty.noHistoryHint': '第一次提交会出现在这里。',
      'empty.noStashes': '没有贮藏',
      'empty.noStashesHint': '切换任务前可以把工作放在这里。',
      'action.stageFile': '暂存文件',
      'action.unstageFile': '取消暂存文件',
      'action.stageAll': '全部暂存',
      'action.unstageAll': '全部取消暂存',
      'ai.action': 'AI 操作',
      'ai.write': '生成提交信息',
      'ai.branch': '创建分支并提交',
      'ai.written': '已由 {model} 生成提交信息',
      'action.stageBlock': '暂存区块',
      'action.unstageBlock': '取消暂存区块',
      'action.revertBlock': '将区块还原为已暂存版本',
      'action.refresh': '刷新',
      'action.back': '返回更改',
      'action.prevChange': '上一个更改',
      'action.nextChange': '下一个更改',
      'action.close': '关闭',
      'action.cancel': '取消',
      'action.confirm': '确认',
      'action.commit': '提交',
      'action.committing': '正在提交',
      'action.branch': '分支',
      'action.createBranch': '创建分支并提交',
      'action.checkout': '切换',
      'action.fetch': '获取',
      'action.pull': '拉取',
      'action.push': '推送',
      'action.apply': '应用',
      'action.pop': '弹出',
      'action.drop': '删除',
      'action.stash': '贮藏更改',
      'action.acceptOurs': '采用本地',
      'action.acceptTheirs': '采用远端',
      'action.retry': '重试',
      'action.init': '初始化',
      'action.newBranch': '新建分支',
      'action.createAndSwitch': '创建并切换',
      'repo.title': '仓库',
      'repo.current': '当前仓库',
      'repo.workspace': '工作区目录',
      'repo.pick': '切换仓库',
      'repo.none': '未找到仓库',
      'repo.initRoot': '在工作区根目录新建仓库',
      'repo.initRootTitle': '在根目录初始化？',
      'repo.initRootBody': '工作区包含 {count} 个仓库。在根目录初始化会把它们当成未跟踪目录。请改用仓库选择器。',
      'repo.initRootConfirm': '仍要初始化',
      'action.revert': '还原区块',
      'diff.split': '并排',
      'diff.unified': '统一',
      'diff.head': 'HEAD',
      'diff.staged': '已暂存',
      'diff.local': '本地',
      'diff.parent': '父提交',
      'diff.commit': '提交',
      'diff.binary': '二进制文件已更改',
      'diff.binaryHint': '{before} 到 {after}',
      'diff.conflictBanner': '此文件有未解决的冲突。解决前无法提交。',
      'diff.loading': '正在读取差异',
      'diff.noChanges': '此文件没有更改',
      'diff.fullFile': '完整文件',
      'diff.layout': '差异布局',
      'diff.changes': '此文件中的更改',
      'diff.lines': '{count} 行',
      'commit.placeholder': '描述这次更改',
      'commit.hintStage': '先暂存一个文件。',
      'commit.hintConflict': '请先解决冲突。',
      'commit.hintMessage': '写一条提交信息。',
      'commit.done': '已提交 {hash}',
      'commit.amend': '修补上次提交',
      'branch.title': '分支并提交',
      'branch.name': '分支名',
      'branch.nameHint': '从当前 HEAD 创建分支，然后提交已暂存的更改。',
      'branch.message': '提交信息',
      'branch.created': '已创建 {branch} 并提交',
      'branch.current': '当前分支',
      'branch.local': '本地分支',
      'branch.loading': '正在读取分支',
      'branch.none': '没有分支',
      'branch.new': '新建分支',
      'branch.newTitle': '新建分支',
      'branch.newHint': '从当前 HEAD 创建并切换，不产生提交。',
      'branch.search': '搜索分支',
      'branch.remote': '远端分支',
      'branch.createdOnly': '已创建 {branch}',
      'branch.noneMatch': '没有匹配的分支',
      'stash.title': '贮藏更改',
      'stash.message': '贮藏信息',
      'stash.select': '要贮藏的文件',
      'stash.selectHint': '只贮藏选中的文件。未跟踪文件也会包含。',
      'stash.default': 'WIP',
      'stash.nothing': '没有可贮藏的文件。',
      'stash.created': '已贮藏 {count} 个文件',
      'stash.applied': '已应用 {ref}',
      'stash.popped': '已弹出 {ref}',
      'stash.dropped': '已删除 {ref}',
      'stash.dropTitle': '删除贮藏',
      'stash.dropBody': '这会永久删除 {ref}，且不会应用其中的更改。',
      'sync.fetched': '已获取',
      'sync.pulled': '已拉取',
      'sync.pushed': '已推送',
      'sync.ahead': '领先 {count}',
      'sync.behind': '落后 {count}',
      'sync.noUpstream': '此分支没有上游，推送时会设置。',
      'sync.none': '已是最新',
      'log.title': '历史',
      'log.loading': '正在读取历史',
      'log.select': '选择一个提交',
      'log.files': '更改的文件',
      'log.noFiles': '没有文件更改',
      'log.author': '作者',
      'log.date': '日期',
      'log.parent': '父提交',
      'log.message': '信息',
      'status.loading': '正在读取仓库',
      'status.detached': '游离 HEAD',
      'error.title': 'Git 操作失败',
      'error.notInstalled': '未安装 Git',
      'error.notInstalledHint': '安装 Git 并确保它在 PATH 中，然后刷新。',
      'confirm.revertTitle': '还原这个区块？',
      'confirm.revertBody': '本地区块会被已暂存版本替换，这部分工作区更改会丢失。',
      'confirm.checkoutTitle': '切换分支？',
      'confirm.checkoutBody': '如果 Git 能保留，本地更改会带到新分支，否则会拒绝切换。',
      'confirm.yesRevert': '还原区块',
      'confirm.yesCheckout': '切换分支',
      'meta.binary': '二进制',
      'meta.blocks': '{count} 个区块',
      'meta.add': '新增 {count}',
      'meta.del': '删除 {count}',
      'filter.placeholder': '过滤文件...',
      'filter.empty': '没有文件匹配 "{filter}"',
      'action.copyHash': '复制提交哈希',
      'action.copied': '已复制！',
      'diff.unstaged': '未暂存',
      'diff.staged': '已暂存',
      'stash.selectAll': '全选',
      'stash.deselectAll': '全不选',
    };

    const STORE_LAYOUT = 'dsh-git.layout';
    const STORE_LAYOUT_COMPACT = 'dsh-git.layout.compact';
    const STORE_REPO = 'dsh-git.repo.';

    function readStore(key, fallback) {
      try {
        return window.localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    }

    function writeStore(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // A blocked storage area only loses the preference.
      }
    }

    function cx(...names) {
      return names.filter(Boolean).join(' ');
    }

    function splitPath(value) {
      const index = value.lastIndexOf('/');
      return index === -1
        ? { dir: '', base: value }
        : { dir: value.slice(0, index + 1), base: value.slice(index + 1) };
    }

    function shortHash(value) {
      return typeof value === 'string' ? value.slice(0, 7) : '';
    }

    function plural(t, key, count) {
      return t(key, { count });
    }

    function statusClass(letter) {
      switch (letter) {
        case 'A':
          return 'is-added';
        case 'D':
          return 'is-deleted';
        case 'R':
          return 'is-renamed';
        case 'U':
          return 'is-untracked';
        case 'C':
          return 'is-conflict';
        default:
          return 'is-modified';
      }
    }

    function slugify(value) {
      return String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    }

    function defaultBranchName(message, firstPath) {
      const fromMessage = slugify(message);
      if (fromMessage !== '') return fromMessage;
      const base = firstPath ? splitPath(firstPath).base.replace(/\.[^.]+$/, '') : 'changes';
      const slug = slugify(base) || 'changes';
      return `${slug}-changes`.slice(0, 60);
    }

    function tokenize(value) {
      return value.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? [];
    }

    function wordParts(left, right) {
      if (left === right) return null;
      if (left.length > 2000 || right.length > 2000) return null;
      const a = tokenize(left);
      const b = tokenize(right);
      let prefix = 0;
      while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
      let suffix = 0;
      while (
        suffix < a.length - prefix &&
        suffix < b.length - prefix &&
        a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
      ) {
        suffix += 1;
      }
      return {
        lPre: a.slice(0, prefix).join(''),
        lMid: a.slice(prefix, a.length - suffix).join(''),
        lSuf: suffix === 0 ? '' : a.slice(a.length - suffix).join(''),
        rPre: b.slice(0, prefix).join(''),
        rMid: b.slice(prefix, b.length - suffix).join(''),
        rSuf: suffix === 0 ? '' : b.slice(b.length - suffix).join(''),
      };
    }

    function renderParts(prefix, middle, suffix) {
      if (middle === '') return h(React.Fragment, null, prefix, suffix);
      return h(React.Fragment, null, prefix, h('span', { className: 'gitp-word' }, middle), suffix);
    }

    function relativeDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value ?? '';
      const seconds = Math.round((date.getTime() - Date.now()) / 1000);
      const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
      const minutes = Math.round(seconds / 60);
      if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
      const hours = Math.round(minutes / 60);
      if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
      const days = Math.round(hours / 24);
      if (Math.abs(days) < 30) return formatter.format(days, 'day');
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function computeLanes(commits) {
      const lanes = [];
      const rows = [];
      for (const commit of commits) {
        let lane = lanes.indexOf(commit.hash);
        if (lane === -1) {
          lane = lanes.length;
          lanes.push(commit.hash);
        }
        const parents = commit.parents ?? [];
        lanes[lane] = parents[0] ?? null;
        for (let index = 1; index < parents.length; index += 1) {
          lanes.splice(lane + index, 0, parents[index]);
        }
        while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
        rows.push({ ...commit, lane, laneCount: Math.max(1, lanes.length) });
      }
      return rows;
    }

    function errorMessage(error) {
      if (error === null || error === undefined) return '';
      return error.message || String(error);
    }

    function Icon({ path, size = 16, viewBox = '0 0 24 24', className, filled = false }) {
      return h(
        'svg',
        {
          className,
          width: size,
          height: size,
          viewBox,
          fill: filled ? 'currentColor' : 'none',
          stroke: filled ? 'none' : 'currentColor',
          strokeWidth: filled ? 0 : 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: path }),
      );
    }

    const paths = {
      branch:
        'M6 3v12a3 3 0 0 0 3 3h6M6 9h6a3 3 0 0 0 3-3V3M6 3.5a1 1 0 1 0 0-.1M18 3.5a1 1 0 1 0 0-.1M18 21a1 1 0 1 0 0-.1',
      changes: 'M4 6h16M4 12h10M4 18h13M18 9l3 3-3 3',
      history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
      stash: 'M4 8h16M6 8v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M10 12h4',
      plus: 'M12 5v14M5 12h14',
      minus: 'M5 12h14',
      left: 'M19 12H5m0 0l6-6m-6 6l6 6',
      right: 'M5 12h14m0 0l-6-6m6 6l-6 6',
      refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
      fetch: 'M6 15a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.6-1.1A3.5 3.5 0 0 1 17 15M12 11v7m0 0l-3-3m3 3l3-3',
      pull: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
      push: 'M12 20V9m0 0l-4 4m4-4l4 4M5 4h14',
      close: 'M6 6l12 12M18 6L6 18',
      chevron: 'M6 9l6 6 6-6',
      chevronUp: 'M6 15l6-6 6 6',
      sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z',
      file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7zM14 3v4h4',
      warning: 'M12 3l9 16H3zM12 9v5M12 17v.5',
      check: 'M5 12l5 5L20 7',
      folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
      split: 'M4 5h16v14H4zM12 5v14',
      unified: 'M4 5h16M4 9h16M4 13h16M4 17h16',
      search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
      copy: 'M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.242a2 2 0 0 0-.602-1.43L16.08 2.5a2 2 0 0 0-1.43-.5H10a2 2 0 0 0-2 2zM4 8H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1',
      checkAlt: 'M20 6L9 17l-5-5',
    };

    const ROW = 20;

    function GitMark({ size = 20 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M12 3v18', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
        h('path', {
          d: 'M12 12c0-4 3-6 7-6h1',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 12, cy: 3.5, r: 2.3, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 12, r: 2.3, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 20.5, r: 2.3, fill: 'currentColor' }),
      );
    }

    function GitIcon({ size = 20 }) {
      return h(GitMark, { size });
    }

    function Styles() {
      return h('style', { dangerouslySetInnerHTML: { __html: CSS } });
    }

    const CSS = `
.gitp-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;width:100%;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif);font-size:12.5px;line-height:1.4;-webkit-font-smoothing:antialiased}
.gitp-root *{box-sizing:border-box}
.gitp-root button,.gitp-root input,.gitp-root textarea{font:inherit;color:inherit}
.gitp-root :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.gitp-root ::-webkit-scrollbar{width:7px;height:7px}
.gitp-root ::-webkit-scrollbar-track{background:transparent}
.gitp-root ::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}
.gitp-root ::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary)}
.gitp-head{display:flex;align-items:center;gap:8px;height:42px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;background:var(--dsw-alias-bg-layer-1)}
.gitp-head-left{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.gitp-head-right{display:flex;align-items:center;gap:3px;flex:none}
.gitp-repo{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}
.gitp-branch{display:inline-flex;align-items:center;gap:6px;height:28px;max-width:240px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,6px);background:var(--dsw-alias-bg-layer-2);cursor:pointer;min-width:0;color:var(--dsw-alias-label-primary);transition:all 120ms ease}
.gitp-branch:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.gitp-branch:disabled{opacity:.45;cursor:default}
.gitp-branch-name{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-branch .gitp-chevron{opacity:.6;flex:none;display:flex;align-items:center}
.gitp-repo-pick{max-width:160px}
.gitp-toolbtn,.gitp-iconbtn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;min-width:28px;padding:0 7px;border:1px solid transparent;border-radius:var(--dsw-radius-md,6px);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums;flex:none;transition:all 120ms ease}
.gitp-iconbtn{width:28px;padding:0}
.gitp-toolbtn:hover:not(:disabled),.gitp-iconbtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gitp-toolbtn:disabled,.gitp-iconbtn:disabled{opacity:.35;cursor:default}
.gitp-iconbtn.is-active{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-active)}
.gitp-toolbtn.has-count{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 25%,transparent)}
.gitp-toolbtn.has-count:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.gitp-toolbtn-num{font-weight:600;font-size:11px}
.gitp-rail{display:flex;align-items:stretch;height:36px;padding:0 8px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);flex:none;gap:2px;overflow-x:auto}
.gitp-rail-item{position:relative;display:inline-flex;align-items:center;gap:6px;height:100%;padding:0 10px;border:0;border-radius:4px 4px 0 0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;white-space:nowrap;transition:color 120ms ease,background 120ms ease}
.gitp-rail-item:hover:not(.is-active){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.gitp-rail-item.is-active{color:var(--dsw-alias-label-primary);font-weight:600}
.gitp-rail-item.is-active::after{content:'';position:absolute;bottom:-1px;left:8px;right:8px;height:2px;background:var(--dsw-alias-brand-primary);border-radius:2px 2px 0 0}
.gitp-rail-item.is-active svg{color:var(--dsw-alias-brand-primary)}
.gitp-rail-label{white-space:nowrap}
.gitp-rail-count{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:9px;font-size:10px;font-weight:600;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;margin-left:2px}
.gitp-rail-item.is-active .gitp-rail-count{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary)}
.gitp-body{display:flex;flex-direction:column;flex:1;min-height:0}
.gitp-content{display:flex;flex:1;min-width:0;min-height:0}
.gitp-changes{display:flex;flex:1;min-width:0;min-height:0}
.gitp-listcol{display:flex;flex-direction:column;width:310px;flex:none;min-height:0;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.gitp-filter-box{display:flex;align-items:center;gap:6px;margin:6px 8px 4px;padding:0 8px;height:28px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);transition:border-color 140ms ease,box-shadow 140ms ease}
.gitp-filter-box:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.gitp-filter-box input{flex:1;min-width:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;outline:none;padding:0}
.gitp-filter-box input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.75}
.gitp-filter-clear{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}
.gitp-filter-clear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gitp-filelist{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 6px 8px}
.gitp-section-head{display:flex;align-items:center;gap:6px;height:26px;padding:0 6px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);user-select:none;cursor:pointer;border-radius:4px;margin-top:5px;transition:background 120ms ease,color 120ms ease}
.gitp-section-head:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.gitp-section-head.is-conflict{color:var(--dsw-alias-state-error-primary)}
.gitp-section-chev{width:12px;height:12px;color:var(--dsw-alias-label-secondary);transition:transform 140ms ease;flex:none}
.gitp-section-chev.is-collapsed{transform:rotate(-90deg)}
.gitp-section-title{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.gitp-section-count{font-size:10px;font-weight:600;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;background:var(--dsw-alias-bg-layer-2);padding:1px 5px;border-radius:8px}
.gitp-section-action{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin-right:-2px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;transition:all 120ms ease}
.gitp-section-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gitp-section-action:disabled{opacity:.35;cursor:default}
.gitp-filerow{display:flex;align-items:center;gap:7px;width:100%;height:28px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm,4px);background:transparent;cursor:pointer;text-align:left;color:var(--dsw-alias-label-primary);transition:background 120ms ease;user-select:none}
.gitp-filerow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-filerow.is-selected{background:var(--dsw-alias-interactive-bg-active);font-weight:500}
.gitp-status{display:inline-flex;align-items:center;justify-content:center;width:16px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;font-weight:700;flex:none}
.gitp-status.is-modified{color:var(--dsw-alias-brand-primary)}
.gitp-status.is-added{color:var(--dsw-alias-state-success-primary)}
.gitp-status.is-deleted{color:var(--dsw-alias-state-error-primary)}
.gitp-status.is-renamed{color:var(--dsw-alias-state-warn-primary)}
.gitp-status.is-untracked{color:var(--dsw-alias-state-warn-primary)}
.gitp-status.is-conflict{color:var(--dsw-alias-state-error-primary)}
.gitp-filename{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.gitp-filedir{color:var(--dsw-alias-label-secondary);font-size:11px;margin-right:1px}
.gitp-both-tag{display:inline-flex;align-items:center;margin-left:5px;padding:0 4px;height:14px;border-radius:3px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary);vertical-align:middle}
.gitp-delta{display:inline-flex;gap:4px;flex:none;font-size:10.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-variant-numeric:tabular-nums}
.gitp-add{color:var(--dsw-alias-state-success-primary)}
.gitp-del{color:var(--dsw-alias-state-error-primary)}
.gitp-rowaction{opacity:0;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;transition:all 120ms ease}
.gitp-filerow:hover .gitp-rowaction,.gitp-filerow:focus-within .gitp-rowaction,.gitp-rowaction:focus-visible{opacity:1}
.gitp-rowaction:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gitp-rowaction:disabled{opacity:.3;cursor:default}
.gitp-commitbox{position:relative;flex:none;border-top:1px solid var(--dsw-alias-border-l1);padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-base)}
.gitp-commitbox textarea{width:100%;height:68px;resize:vertical;min-height:52px;max-height:160px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.45;transition:border-color 140ms ease,box-shadow 140ms ease}
.gitp-commitbox textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}
.gitp-commit-status-line{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.gitp-commit-status-line.has-conflict{color:var(--dsw-alias-state-error-primary)}
.gitp-commit-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.gitp-amend{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;margin-right:auto;user-select:none}
.gitp-amend input{width:13px;height:13px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.gitp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px;font-weight:500;flex:none;transition:all 120ms ease;user-select:none}
.gitp-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.gitp-btn:disabled{opacity:.45;cursor:default}
.gitp-btn.is-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}
.gitp-btn.is-primary:hover:not(:disabled){filter:brightness(1.08)}
.gitp-btn.is-danger{background:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);color:#fff}
.gitp-btn.is-small{height:26px;padding:0 9px;font-size:11.5px}
.gitp-btn.is-icon{width:28px;min-width:28px;padding:0}
.gitp-diffcol{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;background:var(--dsw-alias-bg-base)}
.gitp-diff{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.gitp-diff-head{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}
.gitp-diff-title{display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gitp-diff-path{display:flex;align-items:baseline;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px}
.gitp-diff-dir{color:var(--dsw-alias-label-secondary);font-size:11px}
.gitp-diff-base{font-weight:600;color:var(--dsw-alias-label-primary)}
.gitp-diff-pill{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;flex:none}
.gitp-diff-pill.is-staged{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);color:var(--dsw-alias-state-success-primary)}
.gitp-diff-pill.is-unstaged{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary)}
.gitp-diff-pill.is-conflict{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent);color:var(--dsw-alias-state-error-primary)}
.gitp-diff-pill.is-commit{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.gitp-diff-stats{display:inline-flex;gap:6px;flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;font-variant-numeric:tabular-nums}
.gitp-change-nav{display:flex;align-items:center;gap:2px;flex:none}
.gitp-change-nav .gitp-iconbtn{width:24px;height:24px}
.gitp-change-count{min-width:28px;text-align:center;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.gitp-diff-actions{display:flex;align-items:center;gap:6px;flex:none}
.gitp-seg{display:inline-flex;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,6px);padding:2px;height:28px}
.gitp-seg button{display:inline-flex;align-items:center;justify-content:center;height:100%;padding:0 8px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:all 120ms ease}
.gitp-seg button:hover:not(.is-active){color:var(--dsw-alias-label-primary)}
.gitp-seg button.is-active{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px rgba(0,0,0,0.15)}
.gitp-conflict-banner{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-base));color:var(--dsw-alias-state-error-primary);font-size:11.5px;flex:none}
.gitp-conflict-banner span{flex:1;min-width:0;line-height:1.4}
.gitp-pane-heads{display:flex;flex:none;height:24px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);font-size:10px;color:var(--dsw-alias-label-secondary);letter-spacing:.04em}
.gitp-pane-head{display:flex;align-items:center;flex:1;min-width:0;padding:0 10px;font-weight:600;text-transform:uppercase}
.gitp-pane-head-gutter{width:48px;flex:none;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.gitp-panes{display:flex;flex:1;min-height:0;position:relative}
.gitp-pane{flex:1;min-width:0;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11.5px;line-height:20px}
.gitp-gutter{position:relative;width:48px;flex:none;overflow:hidden;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);z-index:1}
.gitp-gutter-inner{position:absolute;top:0;left:0;right:0;will-change:transform}
.gitp-arrows{position:absolute;left:0;right:0;height:20px;display:flex;align-items:center;justify-content:center;gap:3px}
.gitp-arrow{display:inline-flex;align-items:center;justify-content:center;width:20px;height:18px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:all 120ms ease}
.gitp-arrow:hover:not(:disabled){color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,var(--dsw-alias-bg-layer-2))}
.gitp-arrow:disabled{opacity:.3;cursor:default}
.gitp-arrow.is-revert:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,var(--dsw-alias-bg-layer-2))}
.gitp-line{display:flex;width:max-content;min-width:100%;height:20px;line-height:20px;white-space:pre}
.gitp-ln{position:sticky;left:0;width:44px;flex:none;padding-right:8px;text-align:right;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);user-select:none;font-size:10.5px;z-index:1}
.gitp-code{display:block;width:max-content;padding:0 14px 0 8px;white-space:pre;flex:none}
.gitp-line.is-add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}
.gitp-line.is-del{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.gitp-line.is-add .gitp-ln{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,var(--dsw-alias-bg-base));color:var(--dsw-alias-state-success-primary);font-weight:500}
.gitp-line.is-del .gitp-ln{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,var(--dsw-alias-bg-base));color:var(--dsw-alias-state-error-primary);font-weight:500}
.gitp-line.is-blank{background:color-mix(in srgb,var(--dsw-alias-label-secondary) 4%,transparent)}
.gitp-line.is-blank .gitp-ln{background:var(--dsw-alias-bg-base)}
.gitp-line.is-add .gitp-word,.gitp-urow.is-add .gitp-word{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 32%,transparent);border-radius:2px}
.gitp-line.is-del .gitp-word,.gitp-urow.is-del .gitp-word{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,transparent);border-radius:2px}
.gitp-unified{flex:1;min-height:0;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11.5px;line-height:20px}
.gitp-urow{display:flex;width:max-content;min-width:100%;height:20px;line-height:20px;white-space:pre}
.gitp-uarrows{position:sticky;left:0;width:50px;flex:none;display:flex;align-items:center;justify-content:center;gap:3px;background:var(--dsw-alias-bg-base);z-index:2}
.gitp-urow.is-add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}
.gitp-urow.is-del{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.gitp-urow.is-conflict-marker{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent);color:var(--dsw-alias-state-error-primary);font-weight:600}
.gitp-uno{width:38px;flex:none;text-align:right;padding-right:7px;color:var(--dsw-alias-label-secondary);font-size:10.5px;user-select:none}
.gitp-ucontent{width:max-content;padding:0 14px 0 8px;white-space:pre;flex:none}
.gitp-diff-foot{display:flex;align-items:center;gap:12px;height:24px;padding:0 12px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:none}
.gitp-diff-foot-spacer{flex:1}
.gitp-diff-legend{display:inline-flex;align-items:center;gap:4px}
.gitp-diff-dot{width:7px;height:7px;border-radius:50%}
.gitp-diff-dot.is-add{background:var(--dsw-alias-state-success-primary)}
.gitp-diff-dot.is-del{background:var(--dsw-alias-state-error-primary)}
.gitp-binary{display:flex;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:var(--dsw-alias-label-secondary);padding:40px;text-align:center}
.gitp-binary-title{color:var(--dsw-alias-label-primary);font-weight:600;font-size:13px}
.gitp-loglist{flex:1 1 50%;min-height:140px;overflow:auto;padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.gitp-commitrow{display:flex;align-items:flex-start;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:var(--dsw-radius-sm,4px);background:transparent;cursor:pointer;text-align:left;transition:background 120ms ease;user-select:none}
.gitp-commitrow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-commitrow.is-selected{background:var(--dsw-alias-interactive-bg-active)}
.gitp-graph{position:relative;flex:none;height:32px;margin-top:2px}
.gitp-graph-line{position:absolute;top:0;bottom:-4px;width:1px;background:var(--dsw-alias-border-l2)}
.gitp-graph-dot{position:absolute;top:6px;width:7px;height:7px;margin-left:-3px;border-radius:50%;background:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px var(--dsw-alias-bg-base)}
.gitp-graph-dot.g1{background:var(--dsw-alias-state-success-primary)}
.gitp-graph-dot.g2{background:#a78bfa}
.gitp-graph-dot.g3{background:var(--dsw-alias-state-warn-primary)}
.gitp-commitmain{flex:1;min-width:0;padding-top:1px}
.gitp-commit-subject{font-size:12px;font-weight:500;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-commit-meta{display:flex;gap:6px;align-items:center;font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.gitp-refs{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.gitp-ref{display:inline-flex;align-items:center;height:16px;padding:0 5px;border-radius:3px;font-size:9.5px;font-weight:500;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-ref.is-head{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}
.gitp-logdetail-summary{flex:1 1 50%;min-height:140px;overflow:auto;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base)}
.gitp-detail-head{padding:10px 12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.gitp-detail-subject{font-size:13px;font-weight:600;line-height:1.35;margin-bottom:5px;word-break:break-word}
.gitp-detail-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary);align-items:center}
.gitp-detail-hash-btn{display:inline-flex;align-items:center;gap:4px;padding:1px 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;cursor:pointer;transition:all 120ms ease}
.gitp-detail-hash-btn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.gitp-detail-body{padding:8px 12px 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}
.gitp-detail-section-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px 4px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.gitp-detail-files{display:flex;flex-direction:column;padding:2px 6px 8px;gap:1px;flex:none}
.gitp-detail-file{display:flex;align-items:center;gap:7px;height:26px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm,4px);background:transparent;cursor:pointer;text-align:left;font-size:12px;color:var(--dsw-alias-label-primary);transition:background 120ms ease}
.gitp-detail-file:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-detail-file.is-selected{background:var(--dsw-alias-interactive-bg-active);font-weight:500}
.gitp-stash{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;background:var(--dsw-alias-bg-base)}
.gitp-stash-head{display:flex;align-items:center;justify-content:space-between;gap:8px;height:40px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}
.gitp-stash-title{font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px}
.gitp-stashlist{flex:1;min-height:0;overflow:auto;padding:8px}
.gitp-stashrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,6px);margin-bottom:6px;background:var(--dsw-alias-bg-layer-1);transition:border-color 140ms ease,background 140ms ease}
.gitp-stashrow:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.gitp-stash-main{flex:1;min-width:0}
.gitp-stash-msg{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-stash-meta{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.gitp-stash-ref{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10.5px;font-weight:600}
.gitp-stash-actions{display:flex;gap:4px;flex:none}
.gitp-stash-btn-danger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent)!important;color:var(--dsw-alias-state-error-primary)!important;border-color:var(--dsw-alias-state-error-primary)!important}
.gitp-modal-layer{position:absolute;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);padding:16px;animation:gitp-fade-in 140ms ease-out}
@keyframes gitp-fade-in{from{opacity:0}to{opacity:1}}
.gitp-modal{width:440px;max-width:100%;max-height:calc(100% - 32px);overflow-y:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,10px);box-shadow:0 16px 48px rgba(0,0,0,0.4),0 2px 8px rgba(0,0,0,0.2);padding:18px;animation:gitp-scale-in 140ms ease-out}
@keyframes gitp-scale-in{from{transform:scale(0.97);opacity:0}to{transform:scale(1);opacity:1}}
.gitp-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.gitp-modal-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.gitp-modal-sub{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5;margin-bottom:12px}
.gitp-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.gitp-field label{font-size:11px;color:var(--dsw-alias-label-secondary);font-weight:600}
.gitp-field input,.gitp-field textarea{width:100%;height:30px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;transition:border-color 140ms ease,box-shadow 140ms ease}
.gitp-field textarea{height:68px;padding:7px 8px;resize:vertical;line-height:1.45}
.gitp-field input:focus,.gitp-field textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}
.gitp-field-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.4}
.gitp-modal-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:16px}
.gitp-modal-error{font-size:11.5px;color:var(--dsw-alias-state-error-primary);line-height:1.45;margin-bottom:8px;word-break:break-word}
.gitp-filechecks{max-height:180px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:4px;margin-bottom:10px;background:var(--dsw-alias-bg-layer-1)}
.gitp-check{display:flex;align-items:center;gap:7px;height:26px;padding:0 6px;font-size:12px;cursor:pointer;border-radius:4px}
.gitp-check:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-check input{width:13px;height:13px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.gitp-check-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px}
.gitp-popover-layer{position:absolute;inset:0;z-index:40}
.gitp-popover{position:absolute;top:46px;left:12px;width:280px;max-height:340px;overflow:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);box-shadow:0 14px 40px rgba(0,0,0,0.35),0 2px 8px rgba(0,0,0,0.2);padding:5px;z-index:50;animation:gitp-pop-in 120ms ease-out}
@keyframes gitp-pop-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.gitp-popover.is-wide{width:320px;max-height:400px}
.gitp-ai-wrap{position:relative;display:inline-flex;flex:none}
.gitp-popover.is-menu{top:auto;left:auto;right:0;bottom:calc(100% + 6px);width:230px;max-height:200px;z-index:50}
.gitp-search{width:100%;height:28px;margin:2px 0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 8px;font-size:12px;outline:none;box-sizing:border-box;transition:border-color 140ms ease}
.gitp-search:focus{border-color:var(--dsw-alias-brand-primary)}
.gitp-popover-list{display:flex;flex-direction:column;gap:1px;max-height:250px;overflow:auto}
.gitp-popover-sep{height:1px;background:var(--dsw-alias-border-l1);margin:4px 2px}
.gitp-popover-title{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);padding:5px 7px 3px;font-weight:600}
.gitp-popover-row{display:flex;align-items:center;gap:7px;width:100%;height:28px;padding:0 8px;border:0;border-radius:5px;background:transparent;cursor:pointer;text-align:left;font-size:12px;color:var(--dsw-alias-label-primary);transition:background 120ms ease}
.gitp-popover-row:hover:not(:disabled),.gitp-popover-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-popover-row:disabled{opacity:.45;cursor:default}
.gitp-popover-row .gitp-checkmark{margin-left:auto;color:var(--dsw-alias-brand-primary)}
.gitp-popover-row-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-center{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:32px;text-align:center;color:var(--dsw-alias-label-secondary)}
.gitp-center-title{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.gitp-center-hint{max-width:360px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.gitp-center-icon{color:var(--dsw-alias-state-idle-primary,var(--dsw-alias-label-secondary));margin-bottom:4px;opacity:.8}
.gitp-spinner{width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:gitp-spin .8s linear infinite;display:inline-block;flex:none}
@keyframes gitp-spin{to{transform:rotate(360deg)}}
.gitp-error{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-base));color:var(--dsw-alias-state-error-primary);font-size:12px;flex:none}
.gitp-error-text{flex:1;min-width:0;line-height:1.45;word-break:break-word}
.gitp-error .gitp-iconbtn{color:inherit;width:22px;height:22px}
.gitp-toast{position:absolute;right:12px;bottom:12px;z-index:60;max-width:60%;padding:7px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,6px);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 8px 24px rgba(0,0,0,0.25);font-size:12px;line-height:1.4;animation:gitp-toast-in 140ms ease-out}
@keyframes gitp-toast-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.gitp-toast.is-error{color:var(--dsw-alias-state-error-primary)}
.gitp-tab-title{margin-left:6px}
@media (max-width:900px){.gitp-listcol{width:280px}}
.gitp-root.is-compact .gitp-head{padding:0 8px;gap:6px}
.gitp-root.is-compact .gitp-repo{display:none}
.gitp-root.is-compact .gitp-branch{max-width:180px}
.gitp-root.is-compact .gitp-content{flex-direction:column;min-height:0}
.gitp-root.is-compact .gitp-changes{flex-direction:column}
.gitp-root.is-compact .gitp-listcol{width:100%;flex:1;min-height:0;border-right:0}
.gitp-root.is-compact .gitp-diffcol{width:100%;flex:1;min-height:0;height:auto}
.gitp-root.is-compact .gitp-diff-head{gap:6px;padding:0 8px}
.gitp-root.is-compact .gitp-diff-path{font-size:12px}
.gitp-root.is-compact .gitp-commitbox{padding:8px}
.gitp-root.is-compact .gitp-toast{max-width:80%}
`;

    function Empty({ icon, title, hint, action }) {
      return h(
        'div',
        { className: 'gitp-center' },
        icon ? h('div', { className: 'gitp-center-icon' }, icon) : null,
        h('div', { className: 'gitp-center-title' }, title),
        hint ? h('div', { className: 'gitp-center-hint' }, hint) : null,
        action ?? null,
      );
    }

    function Spinner() {
      return h('span', { className: 'gitp-spinner', 'aria-hidden': 'true' });
    }

    function IconButton({ label, icon, onClick, disabled, active }) {
      return h(
        'button',
        {
          type: 'button',
          className: cx('gitp-iconbtn', active && 'is-active'),
          onClick,
          disabled,
          'aria-label': label,
          title: label,
        },
        h(Icon, { path: icon }),
      );
    }

    function SyncButton({ label, icon, count, onClick, disabled, busy }) {
      return h(
        'button',
        {
          type: 'button',
          className: cx('gitp-toolbtn', count > 0 && 'has-count'),
          onClick,
          disabled: disabled || busy,
          'aria-label': count > 0 ? `${label}, ${count}` : label,
          title: count > 0 ? `${label} (${count})` : label,
        },
        busy ? h(Spinner) : h(Icon, { path: icon, size: 14 }),
        count > 0 ? h('span', { className: 'gitp-toolbtn-num' }, count > 99 ? '99+' : String(count)) : null,
      );
    }

    function Modal({ title, onClose, children, danger }) {
      const card = useRef(null);
      const closeRef = useRef(onClose);
      closeRef.current = onClose;
      useEffect(() => {
        const previous = document.activeElement;
        const node = card.current;
        const focusable = node?.querySelector('input, textarea, select, button');
        focusable?.focus();
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeRef.current();
            return;
          }
          if (event.key !== 'Tab' || node === null) return;
          const items = [...node.querySelectorAll('button, input, textarea, select, [href], [tabindex]:not([tabindex="-1"])')].filter(
            (item) => !item.disabled && item.offsetParent !== null,
          );
          if (items.length === 0) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        };
        document.addEventListener('keydown', onKey, true);
        return () => {
          document.removeEventListener('keydown', onKey, true);
          if (previous && typeof previous.focus === 'function') previous.focus();
        };
      }, []);
      return h(
        'div',
        {
          className: 'gitp-modal-layer',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) closeRef.current();
          },
        },
        h(
          'div',
          {
            className: cx('gitp-modal', danger && 'is-danger'),
            ref: card,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
          },
          h(
            'div',
            { className: 'gitp-modal-head' },
            h('div', { className: 'gitp-modal-title' }, title),
            h(IconButton, { label: 'Close', icon: paths.close, onClick: onClose }),
          ),
          children,
        ),
      );
    }

    function ConfirmDialog({ title, body, confirmLabel, cancelLabel, danger, busy, onConfirm, onClose }) {
      return h(
        Modal,
        { title, onClose, danger },
        h('div', { className: 'gitp-modal-sub' }, body),
        h(
          'div',
          { className: 'gitp-modal-actions' },
          h('button', { type: 'button', className: 'gitp-btn', onClick: onClose, disabled: busy }, cancelLabel),
          h(
            'button',
            {
              type: 'button',
              className: cx('gitp-btn', danger ? 'is-danger' : 'is-primary'),
              onClick: onConfirm,
              disabled: busy,
            },
            busy ? h(Spinner) : null,
            confirmLabel,
          ),
        ),
      );
    }

    function BranchDialog({ t, defaultName, defaultMessage, busy, error, onCreate, onClose }) {
      const [name, setName] = useState(defaultName);
      const [message, setMessage] = useState(defaultMessage);
      const canSubmit = name.trim() !== '' && message.trim() !== '' && !busy;
      return h(
        Modal,
        { title: t('branch.title'), onClose },
        h(
          'div',
          { className: 'gitp-field' },
          h('label', { htmlFor: 'gitp-branch-name' }, t('branch.name')),
          h('input', {
            id: 'gitp-branch-name',
            value: name,
            onChange: (event) => setName(event.target.value),
            spellCheck: false,
            autoComplete: 'off',
          }),
          h('div', { className: 'gitp-field-hint' }, t('branch.nameHint')),
        ),
        h(
          'div',
          { className: 'gitp-field' },
          h('label', { htmlFor: 'gitp-branch-message' }, t('branch.message')),
          h('textarea', {
            id: 'gitp-branch-message',
            value: message,
            onChange: (event) => setMessage(event.target.value),
          }),
        ),
        error ? h('div', { className: 'gitp-modal-error' }, error) : null,
        h(
          'div',
          { className: 'gitp-modal-actions' },
          h('button', { type: 'button', className: 'gitp-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-btn is-primary',
              disabled: !canSubmit,
              onClick: () => onCreate({ name: name.trim(), message: message.trim() }),
            },
            busy ? h(Spinner) : null,
            t('action.createBranch'),
          ),
        ),
      );
    }

    function StashDialog({ t, files, busy, error, onCreate, onClose }) {
      const [selected, setSelected] = useState(() => new Set(files.map((file) => file.path)));
      const [message, setMessage] = useState('');
      const toggle = (path) => {
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
      };
      return h(
        Modal,
        { title: t('stash.title'), onClose },
        h('div', { className: 'gitp-modal-sub' }, t('stash.selectHint')),
        files.length > 1
          ? h(
              'div',
              { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' } },
              h(
                'button',
                {
                  type: 'button',
                  style: {
                    border: 0,
                    background: 'transparent',
                    color: 'var(--dsw-alias-brand-primary)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '0 4px',
                    fontWeight: 500,
                  },
                  onClick: () =>
                    setSelected(selected.size === files.length ? new Set() : new Set(files.map((f) => f.path))),
                },
                selected.size === files.length ? t('stash.deselectAll') : t('stash.selectAll'),
              ),
            )
          : null,
        files.length === 0
          ? h('div', { className: 'gitp-modal-sub' }, t('stash.nothing'))
          : h(
              'div',
              { className: 'gitp-filechecks' },
              files.map((file) =>
                h(
                  'label',
                  { className: 'gitp-check', key: file.path },
                  h('input', {
                    type: 'checkbox',
                    checked: selected.has(file.path),
                    onChange: () => toggle(file.path),
                  }),
                  h('span', { className: 'gitp-check-path' }, file.path),
                ),
              ),
            ),
        h(
          'div',
          { className: 'gitp-field' },
          h('label', { htmlFor: 'gitp-stash-message' }, t('stash.message')),
          h('input', {
            id: 'gitp-stash-message',
            value: message,
            onChange: (event) => setMessage(event.target.value),
            placeholder: t('stash.default'),
          }),
        ),
        error ? h('div', { className: 'gitp-modal-error' }, error) : null,
        h(
          'div',
          { className: 'gitp-modal-actions' },
          h('button', { type: 'button', className: 'gitp-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-btn is-primary',
              disabled: busy || selected.size === 0,
              onClick: () =>
                onCreate({
                  paths: [...selected],
                  message: message.trim(),
                }),
            },
            busy ? h(Spinner) : null,
            t('action.stash'),
          ),
        ),
      );
    }

    function FileRow({ entry, side, selected, busy, t, onSelect, onToggle }) {
      const path = splitPath(entry.path);
      const add = side === 'staged' ? entry.stagedAdd : entry.add;
      const del = side === 'staged' ? entry.stagedDel : entry.del;
      const actionLabel = side === 'staged' ? t('action.unstageFile') : t('action.stageFile');
      return h(
        'div',
        {
          className: cx('gitp-filerow', selected && 'is-selected'),
          role: 'button',
          tabIndex: 0,
          'aria-current': selected ? 'true' : undefined,
          onClick: () => onSelect(),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect();
            }
          },
        },
        h('span', { className: cx('gitp-status', statusClass(entry.letter)) }, entry.letter),
        h(
          'span',
          { className: 'gitp-filename' },
          path.dir ? h('span', { className: 'gitp-filedir' }, path.dir) : null,
          path.base,
          entry.both ? h('span', { className: 'gitp-both-tag', title: 'Partially staged' }, 'partial') : null,
        ),
        entry.binary
          ? h('span', { className: 'gitp-delta' }, t('meta.binary'))
          : h(
              'span',
              { className: 'gitp-delta' },
              add > 0 ? h('span', { className: 'gitp-add' }, `+${add}`) : null,
              del > 0 ? h('span', { className: 'gitp-del' }, `−${del}`) : null,
            ),
        side === 'conflict'
          ? null
          : h(
              'button',
              {
                type: 'button',
                className: 'gitp-rowaction',
                'aria-label': actionLabel,
                title: actionLabel,
                disabled: busy,
                onClick: (event) => {
                  event.stopPropagation();
                  onToggle();
                },
              },
              h(Icon, { path: side === 'staged' ? paths.minus : paths.plus, size: 14 }),
            ),
      );
    }

    function ChangesView({
      t,
      snapshot,
      conflicts,
      staged,
      unstaged,
      selection,
      onSelect,
      busy,
      fileBusy,
      onToggleFile,
      onToggleAll,
      diff,
      diffLoading,
      layout,
      onLayout,
      onRefresh,
      onBlock,
      onResolve,
      message,
      onMessage,
      onCommit,
      onBranch,
      canCommit,
      commitBusy,
      aiBusy,
      aiMenuOpen,
      onAiToggle,
      onAiClose,
      onAiWrite,
      onAiBranch,
      selectionKey,
      amend,
      onAmend,
      canAmend,
      compact,
      onBack,
    }) {
      const [filter, setFilter] = useState('');
      const [collapsed, setCollapsed] = useState({ conflicts: false, staged: false, unstaged: false });
      const toggleSection = (key) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

      const needle = filter.trim().toLowerCase();
      const match = (item) => needle === '' || item.path.toLowerCase().includes(needle);
      const filteredConflicts = useMemo(() => conflicts.filter(match), [conflicts, needle]);
      const filteredStaged = useMemo(() => staged.filter(match), [staged, needle]);
      const filteredUnstaged = useMemo(() => unstaged.filter(match), [unstaged, needle]);

      const stagedStats = useMemo(() => {
        let add = 0;
        let del = 0;
        for (const e of staged) {
          add += e.stagedAdd ?? 0;
          del += e.stagedDel ?? 0;
        }
        return { add, del };
      }, [staged]);

      const showList = !compact || selection === null;
      const showDiff = !compact || selection !== null;

      const totalMatching = filteredConflicts.length + filteredStaged.length + filteredUnstaged.length;
      const totalRaw = conflicts.length + staged.length + unstaged.length;

      return h(
        'div',
        { className: 'gitp-changes' },
        showList
          ? h(
          'div',
          { className: 'gitp-listcol' },
          totalRaw > 0
            ? h(
                'div',
                { className: 'gitp-filter-box' },
                h(Icon, { path: paths.search, size: 13 }),
                h('input', {
                  type: 'text',
                  value: filter,
                  onChange: (event) => setFilter(event.target.value),
                  placeholder: t('filter.placeholder'),
                  'aria-label': t('filter.placeholder'),
                  spellCheck: false,
                }),
                filter
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'gitp-filter-clear',
                        onClick: () => setFilter(''),
                        'aria-label': 'Clear filter',
                      },
                      h(Icon, { path: paths.close, size: 10 }),
                    )
                  : null,
              )
            : null,
          h(
            'div',
            { className: 'gitp-filelist' },
            filteredConflicts.length > 0
              ? h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    {
                      className: 'gitp-section-head is-conflict',
                      onClick: () => toggleSection('conflicts'),
                      role: 'button',
                      tabIndex: 0,
                    },
                    h(Icon, {
                      path: paths.chevron,
                      size: 11,
                      className: cx('gitp-section-chev', collapsed.conflicts && 'is-collapsed'),
                    }),
                    h('span', { className: 'gitp-section-title' }, t('section.conflicts')),
                    h('span', { className: 'gitp-section-count' }, String(filteredConflicts.length)),
                  ),
                  !collapsed.conflicts
                    ? filteredConflicts.map((entry) =>
                        h(FileRow, {
                          key: `conflict:${entry.path}`,
                          entry,
                          side: 'conflict',
                          selected: selection?.side === 'conflict' && selection.path === entry.path,
                          busy: fileBusy,
                          t,
                          onSelect: () => onSelect({ side: 'conflict', path: entry.path, renamed: false }),
                          onToggle: () => {},
                        }),
                      )
                    : null,
                )
              : null,
            filteredStaged.length > 0
              ? h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    {
                      className: 'gitp-section-head',
                      onClick: () => toggleSection('staged'),
                      role: 'button',
                      tabIndex: 0,
                    },
                    h(Icon, {
                      path: paths.chevron,
                      size: 11,
                      className: cx('gitp-section-chev', collapsed.staged && 'is-collapsed'),
                    }),
                    h('span', { className: 'gitp-section-title' }, t('section.staged')),
                    h('span', { className: 'gitp-section-count' }, String(filteredStaged.length)),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'gitp-section-action',
                        'aria-label': t('action.unstageAll'),
                        title: t('action.unstageAll'),
                        disabled: fileBusy,
                        onClick: (event) => {
                          event.stopPropagation();
                          onToggleAll('staged');
                        },
                      },
                      h(Icon, { path: paths.minus, size: 14 }),
                    ),
                  ),
                  !collapsed.staged
                    ? filteredStaged.map((entry) =>
                        h(FileRow, {
                          key: `staged:${entry.path}`,
                          entry,
                          side: 'staged',
                          selected: selection?.side === 'staged' && selection.path === entry.path,
                          busy: fileBusy,
                          t,
                          onSelect: () =>
                            onSelect({ side: 'staged', path: entry.path, renamed: entry.kind === 'renamed' }),
                          onToggle: () => onToggleFile(entry, 'staged'),
                        }),
                      )
                    : null,
                )
              : null,
            filteredUnstaged.length > 0
              ? h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    {
                      className: 'gitp-section-head',
                      onClick: () => toggleSection('unstaged'),
                      role: 'button',
                      tabIndex: 0,
                    },
                    h(Icon, {
                      path: paths.chevron,
                      size: 11,
                      className: cx('gitp-section-chev', collapsed.unstaged && 'is-collapsed'),
                    }),
                    h('span', { className: 'gitp-section-title' }, t('section.unstaged')),
                    h('span', { className: 'gitp-section-count' }, String(filteredUnstaged.length)),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'gitp-section-action',
                        'aria-label': t('action.stageAll'),
                        title: t('action.stageAll'),
                        disabled: fileBusy,
                        onClick: (event) => {
                          event.stopPropagation();
                          onToggleAll('unstaged');
                        },
                      },
                      h(Icon, { path: paths.plus, size: 14 }),
                    ),
                  ),
                  !collapsed.unstaged
                    ? filteredUnstaged.map((entry) =>
                        h(FileRow, {
                          key: `unstaged:${entry.path}`,
                          entry,
                          side: 'unstaged',
                          selected: selection?.side === 'unstaged' && selection.path === entry.path,
                          busy: fileBusy,
                          t,
                          onSelect: () =>
                            onSelect({ side: 'unstaged', path: entry.path, renamed: entry.kind === 'renamed' }),
                          onToggle: () => onToggleFile(entry, 'unstaged'),
                        }),
                      )
                    : null,
                )
              : null,
            needle !== '' && totalMatching === 0
              ? h('div', { className: 'gitp-center', style: { padding: '24px' } }, t('filter.empty', { filter }))
              : null,
            totalRaw === 0
              ? h(Empty, {
                  icon: h(Icon, { path: paths.check, size: 28 }),
                  title: t('empty.noChanges'),
                  hint: t('empty.noChangesHint'),
                  action: h(
                    'button',
                    { type: 'button', className: 'gitp-btn is-small', onClick: onRefresh, disabled: busy },
                    t('action.refresh'),
                  ),
                })
              : null,
          ),
          h(
            'div',
            { className: 'gitp-commitbox' },
            h('textarea', {
              value: message,
              onChange: (event) => onMessage(event.target.value),
              onKeyDown: (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  if (canCommit && !commitBusy) onCommit();
                }
              },
              placeholder: t('commit.placeholder') + ' (Cmd+Enter)',
              'aria-label': t('commit.placeholder'),
            }),
            h(
              'div',
              { className: cx('gitp-commit-status-line', conflicts.length > 0 && 'has-conflict') },
              conflicts.length > 0
                ? h('span', null, t('commit.hintConflict'))
                : staged.length > 0
                  ? h('span', null, `${staged.length} staged (+${stagedStats.add} −${stagedStats.del})`)
                  : h('span', null, t('commit.hintStage')),
            ),
            h(
              'div',
              { className: 'gitp-commit-actions' },
              canAmend
                ? h(
                    'label',
                    { className: 'gitp-amend' },
                    h('input', {
                      type: 'checkbox',
                      checked: amend,
                      onChange: (event) => onAmend(event.target.checked),
                    }),
                    t('commit.amend'),
                  )
                : null,
              h(
                'div',
                { className: 'gitp-ai-wrap' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitp-btn is-small is-icon',
                    'aria-label': t('ai.action'),
                    'aria-haspopup': 'menu',
                    'aria-expanded': aiMenuOpen === true,
                    title: t('ai.action'),
                    disabled: commitBusy || aiBusy || staged.length === 0,
                    onClick: onAiToggle,
                  },
                  aiBusy ? h(Spinner) : h(Icon, { path: paths.sparkles, size: 13 }),
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'gitp-btn is-small',
                  onClick: onBranch,
                  disabled: commitBusy || conflicts.length > 0 || staged.length === 0,
                  'aria-label': t('action.branch'),
                },
                h(Icon, { path: paths.branch, size: 13 }),
                t('action.branch'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'gitp-btn is-primary is-small',
                  onClick: onCommit,
                  disabled: !canCommit || commitBusy,
                },
                commitBusy ? h(Spinner) : null,
                commitBusy ? t('action.committing') : t('action.commit'),
              ),
            ),
            aiMenuOpen
              ? h(AiMenu, {
                  t,
                  busy: aiBusy,
                  canUse: staged.length > 0,
                  canBranch: staged.length > 0 && conflicts.length === 0,
                  onWrite: onAiWrite,
                  onBranch: onAiBranch,
                  onClose: onAiClose,
                })
              : null,
          ),
        )
          : null,
        showDiff
          ? h(
          'div',
          { className: 'gitp-diffcol' },
          selection
            ? h(DiffView, {
                t,
                diff,
                loading: diffLoading,
                layout,
                onLayout,
                onBlock,
                onResolve,
                busy: fileBusy,
                selectionKey,
                renamed: selection.renamed === true,
                compact,
                onBack,
              })
            : h(Empty, {
                icon: h(Icon, { path: paths.file, size: 28 }),
                title: t('empty.selectFile'),
                hint: t('empty.selectFileHint'),
              }),
        )
          : null,
      );
    }

    function DiffView({ t, diff, loading, layout, onLayout, onBlock, onResolve, busy, selectionKey, renamed, compact, onBack }) {
      const bodyRef = useRef(null);
      const [changeNav, setChangeNav] = useState({ index: -1, canPrev: false, canNext: false });
      const blocks = useMemo(() => {
        if (diff === null) return [];
        return [...(diff.blocks ?? [])].sort((left, right) => left.row - right.row);
      }, [diff]);

      const scrollers = () => {
        const root = bodyRef.current;
        if (root === null) return [];
        const panes = root.querySelectorAll('.gitp-pane');
        if (panes.length > 0) return [...panes];
        const unified = root.querySelector('.gitp-unified');
        return unified === null ? [] : [unified];
      };

      const readNav = (top) => {
        let index = -1;
        for (let i = 0; i < blocks.length; i += 1) if (blocks[i].row * ROW <= top + 40) index = i;
        return {
          index,
          canPrev: index > 0,
          canNext: blocks.some((block) => block.row * ROW > top + 40),
        };
      };

      useEffect(() => {
        const root = bodyRef.current;
        if (root === null) return undefined;
        let frame = 0;
        const sync = () => {
          const first = scrollers()[0];
          setChangeNav(readNav(first === undefined ? 0 : first.scrollTop));
        };
        const onScroll = () => {
          if (frame !== 0) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            sync();
          });
        };
        root.addEventListener('scroll', onScroll, true);
        sync();
        return () => {
          root.removeEventListener('scroll', onScroll, true);
          if (frame !== 0) cancelAnimationFrame(frame);
        };
      }, [diff, layout]);

      const jumpToChange = (direction) => {
        const first = scrollers()[0];
        const top = first === undefined ? 0 : first.scrollTop;
        let target = null;
        if (direction > 0) {
          target = blocks.find((block) => block.row * ROW > top + 40) ?? null;
        } else {
          for (const block of blocks) if (block.row * ROW <= top + 40) target = block;
          target = target === null ? null : blocks[blocks.indexOf(target) - 1] ?? null;
        }
        if (target === null) return;
        const next = Math.max(0, target.row * ROW - 40);
        const elements = scrollers();
        for (const element of elements) element.scrollTop = next;
        const actual = elements[0] === undefined ? next : elements[0].scrollTop;
        setChangeNav(readNav(actual));
      };

      if (loading && diff === null) {
        return h(
          'div',
          { className: 'gitp-diff' },
          h(
            'div',
            { className: 'gitp-center' },
            h(Spinner),
            h('div', { className: 'gitp-center-hint' }, t('diff.loading')),
          ),
        );
      }
      if (diff === null) {
        return h(
          'div',
          { className: 'gitp-diff' },
          h(Empty, {
            icon: h(Icon, { path: paths.file, size: 28 }),
            title: t('empty.selectFile'),
            hint: t('empty.selectFileHint'),
          }),
        );
      }
      const path = splitPath(diff.path);
      const labels = {
        left:
          diff.labels.left === 'HEAD'
            ? t('diff.head')
            : diff.labels.left === 'Staged'
              ? t('diff.staged')
              : diff.labels.left === 'Local'
                ? t('diff.local')
                : diff.labels.left === 'Parent'
                  ? t('diff.parent')
                  : diff.labels.left,
        right:
          diff.labels.right === 'Staged'
            ? t('diff.staged')
            : diff.labels.right === 'Local'
              ? t('diff.local')
              : diff.labels.right === 'Commit'
                ? t('diff.commit')
                : diff.labels.right === 'Incoming'
                  ? t('action.acceptTheirs')
                  : diff.labels.right,
      };
      return h(
        'div',
        { className: 'gitp-diff', ref: bodyRef },
        h(
          'div',
          { className: 'gitp-diff-head' },
          compact && onBack
            ? h(IconButton, {
                label: t('action.back'),
                icon: paths.left,
                onClick: onBack,
              })
            : null,
          h(
            'div',
            { className: 'gitp-diff-title' },
            h('span', { className: cx('gitp-status', statusClass(diff.status ?? (diff.conflict ? 'C' : 'M'))) }, diff.status ?? (diff.conflict ? 'C' : 'M')),
            h(
              'div',
              { className: 'gitp-diff-path' },
              path.dir ? h('span', { className: 'gitp-diff-dir' }, path.dir) : null,
              h('span', { className: 'gitp-diff-base' }, path.base),
            ),
            diff.conflict
              ? h('span', { className: 'gitp-diff-pill is-conflict' }, t('section.conflicts'))
              : diff.side === 'staged'
                ? h('span', { className: 'gitp-diff-pill is-staged' }, t('diff.staged'))
                : diff.side === 'unstaged'
                  ? h('span', { className: 'gitp-diff-pill is-unstaged' }, t('diff.unstaged'))
                  : diff.side === 'log'
                    ? h('span', { className: 'gitp-diff-pill is-commit' }, t('diff.commit'))
                    : null,
          ),
          diff.conflict
            ? h('span', { className: 'gitp-diff-stats gitp-del' }, t('section.conflicts'))
            : diff.binary
              ? h('span', { className: 'gitp-diff-stats' }, t('diff.binary'))
              : h(
                  'span',
                  { className: 'gitp-diff-stats' },
                  h('span', { className: 'gitp-add' }, `+${diff.add ?? 0}`),
                  h('span', { className: 'gitp-del' }, `−${diff.del ?? 0}`),
                ),
          blocks.length > 0 && !diff.conflict && !diff.binary
            ? h(
                'div',
                { className: 'gitp-change-nav', role: 'group', 'aria-label': t('diff.changes') },
                h(IconButton, {
                  label: t('action.prevChange'),
                  icon: paths.chevronUp,
                  onClick: () => jumpToChange(-1),
                  disabled: !changeNav.canPrev,
                }),
                h('span', { className: 'gitp-change-count' }, `${Math.max(0, changeNav.index) + 1}/${blocks.length}`),
                h(IconButton, {
                  label: t('action.nextChange'),
                  icon: paths.chevron,
                  onClick: () => jumpToChange(1),
                  disabled: !changeNav.canNext,
                }),
              )
            : null,
          h(
            'div',
            { className: 'gitp-diff-actions' },
            diff.conflict
              ? null
              : h(
                  'div',
                  { className: 'gitp-seg', role: 'group', 'aria-label': t('diff.layout') },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: layout === 'split' ? 'is-active' : '',
                      'aria-pressed': layout === 'split',
                      'aria-label': t('diff.split'),
                      title: t('diff.split'),
                      onClick: () => onLayout('split'),
                    },
                    h(Icon, { path: paths.split, size: 13 }),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: layout === 'unified' ? 'is-active' : '',
                      'aria-pressed': layout === 'unified',
                      'aria-label': t('diff.unified'),
                      title: t('diff.unified'),
                      onClick: () => onLayout('unified'),
                    },
                    h(Icon, { path: paths.unified, size: 13 }),
                  ),
                ),
          ),
        ),
        diff.conflict
          ? h(
              'div',
              { className: 'gitp-conflict-banner' },
              h(Icon, { path: paths.warning, size: 14 }),
              h('span', null, t('diff.conflictBanner')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'gitp-btn is-small',
                  onClick: () => onResolve('ours'),
                  disabled: busy,
                },
                t('action.acceptOurs'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'gitp-btn is-small',
                  onClick: () => onResolve('theirs'),
                  disabled: busy,
                },
                t('action.acceptTheirs'),
              ),
            )
          : null,
        diff.binary
          ? h(
              'div',
              { className: 'gitp-binary' },
              h('div', { className: 'gitp-binary-title' }, t('diff.binary')),
              h(
                'div',
                null,
                t('diff.binaryHint', {
                  before: diff.leftSize ?? 0,
                  after: diff.rightSize ?? 0,
                }),
              ),
            )
          : diff.conflict
            ? h(ConflictDiff, { diff })
            : layout === 'unified'
              ? h(UnifiedDiff, { t, diff, onBlock, busy, selectionKey, renamed })
              : h(SplitDiff, { t, diff, labels, onBlock, busy, selectionKey, renamed }),
        !diff.binary && !diff.conflict
          ? h(
              'div',
              { className: 'gitp-diff-foot' },
              h('span', { className: 'gitp-diff-legend' }, h('span', { className: 'gitp-diff-dot is-add' }), 'Added'),
              h('span', { className: 'gitp-diff-legend' }, h('span', { className: 'gitp-diff-dot is-del' }), 'Removed'),
              h('span', null, `${blocks.length} change${blocks.length === 1 ? '' : 's'}`),
              h('span', { className: 'gitp-diff-foot-spacer' }),
              h('span', null, 'UTF-8'),
              h('span', null, 'LF'),
            )
          : null,
      );
    }

    function ConflictDiff({ diff }) {
      return h(
        'div',
        { className: 'gitp-unified' },
        diff.right.map((text, index) =>
          h(
            'div',
            {
              className: cx('gitp-urow', /^(<{7}|={7}|>{7})/.test(text) && 'is-conflict-marker'),
              key: index,
            },
            h('span', { className: 'gitp-uno' }, index + 1),
            h('span', { className: 'gitp-ucontent' }, text || '\u00a0'),
          ),
        ),
      );
    }

    function SplitDiff({ t, diff, labels, onBlock, busy, selectionKey, renamed }) {
      const leftRef = useRef(null);
      const rightRef = useRef(null);
      const gutterRef = useRef(null);

      const moveGutter = (top) => {
        if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-top}px)`;
      };

      const onScroll = (source) => {
        const top = source.scrollTop;
        if (leftRef.current && leftRef.current !== source) leftRef.current.scrollTop = top;
        if (rightRef.current && rightRef.current !== source) rightRef.current.scrollTop = top;
        moveGutter(top);
      };

      useEffect(() => {
        const first = diff.blocks[0];
        if (!first || first.row <= 10) return;
        const top = Math.max(0, first.row * ROW - 80);
        if (leftRef.current) leftRef.current.scrollTop = top;
        if (rightRef.current) rightRef.current.scrollTop = top;
        moveGutter(top);
      }, [selectionKey]);

      const parts = useMemo(() => {
        const map = new Map();
        for (const row of diff.rows) {
          if (row.k !== 'mod') continue;
          const left = diff.left[row.l - 1] ?? '';
          const right = diff.right[row.r - 1] ?? '';
          map.set(row, wordParts(left, right));
        }
        return map;
      }, [diff]);

      const blocksByRow = useMemo(() => {
        const map = new Map();
        for (const block of diff.blocks) map.set(block.row, block);
        return map;
      }, [diff]);

      const actions = (block) => {
        if (renamed) return [];
        const stage = { action: 'unstaged', icon: paths.left, label: t('action.stageBlock'), revert: false };
        const revert = { action: 'revert', icon: paths.right, label: t('action.revertBlock'), revert: true };
        if (diff.side === 'unstaged') return diff.leftMissing ? [stage] : [stage, revert];
        if (diff.side === 'staged') {
          return [{ action: 'staged', icon: paths.right, label: t('action.unstageBlock'), revert: false }];
        }
        return [];
      };

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'gitp-pane-heads' },
          h('div', { className: 'gitp-pane-head' }, labels.left),
          h('div', { className: 'gitp-pane-head-gutter' }),
          h('div', { className: 'gitp-pane-head' }, labels.right),
        ),
        h(
          'div',
          { className: 'gitp-panes' },
          h(
            'div',
            {
              className: 'gitp-pane',
              ref: leftRef,
              tabIndex: 0,
              role: 'region',
              'aria-label': labels.left,
              onScroll: (event) => onScroll(event.currentTarget),
            },
            diff.rows.map((row, index) => {
              const text = row.l ? diff.left[row.l - 1] ?? '' : '';
              const kind = row.k === 'add' ? 'blank' : row.k === 'mod' ? 'del' : row.k;
              const part = parts.get(row);
              return h(
                'div',
                { className: cx('gitp-line', kind !== 'ctx' && `is-${kind}`), key: `l${index}` },
                h('span', { className: 'gitp-ln' }, row.l ?? ''),
                h(
                  'span',
                  { className: 'gitp-code' },
                  row.l === null
                    ? '\u00a0'
                    : part
                      ? renderParts(part.lPre, part.lMid, part.lSuf)
                      : text || '\u00a0',
                ),
              );
            }),
          ),
          h(
            'div',
            { className: 'gitp-gutter', 'aria-hidden': false },
            h(
              'div',
              { className: 'gitp-gutter-inner', ref: gutterRef },
              diff.blocks.map((block) => {
                const list = actions(block);
                if (list.length === 0) return null;
                return h(
                  'div',
                  { className: 'gitp-arrows', key: block.id, style: { top: block.row * ROW } },
                  list.map((item) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        className: cx('gitp-arrow', item.revert && 'is-revert'),
                        key: item.action,
                        'aria-label': item.label,
                        title: item.label,
                        disabled: busy,
                        onClick: () => onBlock(block, item.action),
                      },
                      h(Icon, { path: item.icon, size: 12 }),
                    ),
                  ),
                );
              }),
            ),
          ),
          h(
            'div',
            {
              className: 'gitp-pane',
              ref: rightRef,
              tabIndex: 0,
              role: 'region',
              'aria-label': labels.right,
              onScroll: (event) => onScroll(event.currentTarget),
            },
            diff.rows.map((row, index) => {
              const text = row.r ? diff.right[row.r - 1] ?? '' : '';
              const kind = row.k === 'del' ? 'blank' : row.k === 'mod' ? 'add' : row.k;
              const part = parts.get(row);
              return h(
                'div',
                { className: cx('gitp-line', kind !== 'ctx' && `is-${kind}`), key: `r${index}` },
                h('span', { className: 'gitp-ln' }, row.r ?? ''),
                h(
                  'span',
                  { className: 'gitp-code' },
                  row.r === null
                    ? '\u00a0'
                    : part
                      ? renderParts(part.rPre, part.rMid, part.rSuf)
                      : text || '\u00a0',
                ),
              );
            }),
          ),
        ),
      );
    }

    function UnifiedDiff({ t, diff, onBlock, busy, selectionKey, renamed }) {
      const lines = useMemo(() => {
        const blockByRow = new Map();
        for (const block of diff.blocks) blockByRow.set(block.row, block);
        const result = [];
        diff.rows.forEach((row, index) => {
          const block = blockByRow.get(index);
          if (row.k === 'ctx') {
            result.push({ l: row.l, r: row.r, text: diff.left[row.l - 1] ?? '', kind: 'ctx', block });
          } else if (row.k === 'mod') {
            result.push({ l: row.l, r: null, text: diff.left[row.l - 1] ?? '', kind: 'del', block });
            result.push({ l: null, r: row.r, text: diff.right[row.r - 1] ?? '', kind: 'add' });
          } else if (row.k === 'del') {
            result.push({ l: row.l, r: null, text: diff.left[row.l - 1] ?? '', kind: 'del', block });
          } else {
            result.push({ l: null, r: row.r, text: diff.right[row.r - 1] ?? '', kind: 'add', block });
          }
        });
        return result;
      }, [diff]);
      const scroller = useRef(null);
      useEffect(() => {
        const first = lines.find((line) => line.block !== undefined);
        if (!first || lines.indexOf(first) <= 10 || scroller.current === null) return;
        scroller.current.scrollTop = Math.max(0, lines.indexOf(first) * ROW - 80);
      }, [selectionKey]);
      const actions = (block) => {
        if (renamed) return [];
        const stage = { action: 'unstaged', icon: paths.left, label: t('action.stageBlock'), revert: false };
        const revert = { action: 'revert', icon: paths.right, label: t('action.revertBlock'), revert: true };
        if (diff.side === 'unstaged') return diff.leftMissing ? [stage] : [stage, revert];
        if (diff.side === 'staged') {
          return [{ action: 'staged', icon: paths.right, label: t('action.unstageBlock'), revert: false }];
        }
        return [];
      };
      return h(
        'div',
        { className: 'gitp-unified', ref: scroller, tabIndex: 0, role: 'region', 'aria-label': t('diff.unified') },
        lines.map((line, index) => {
          const list = line.block ? actions(line.block) : [];
          return h(
            'div',
            { className: cx('gitp-urow', line.kind !== 'ctx' && `is-${line.kind}`), key: index },
            h(
              'span',
              { className: 'gitp-uarrows' },
              list.map((item) =>
                h(
                  'button',
                  {
                    type: 'button',
                    className: cx('gitp-arrow', item.revert && 'is-revert'),
                    key: item.action,
                    'aria-label': item.label,
                    title: item.label,
                    disabled: busy,
                    onClick: () => onBlock(line.block, item.action),
                  },
                  h(Icon, { path: item.icon, size: 12 }),
                ),
              ),
            ),
            h('span', { className: 'gitp-uno' }, line.l ?? ''),
            h('span', { className: 'gitp-uno' }, line.r ?? ''),
            h('span', { className: 'gitp-ucontent' }, line.text || '\u00a0'),
          );
        }),
      );
    }

    function AiMenu({ t, busy, canUse, canBranch, onWrite, onBranch, onClose }) {
      const closeRef = useRef(onClose);
      closeRef.current = onClose;
      const menuRef = useRef(null);
      useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          closeRef.current();
        };
        const onDown = (event) => {
          const target = event.target;
          if (menuRef.current !== null && menuRef.current.contains(target)) return;
          if (target instanceof Element && target.closest('.gitp-ai-wrap') !== null) return;
          closeRef.current();
        };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('mousedown', onDown, true);
        return () => {
          document.removeEventListener('keydown', onKey, true);
          document.removeEventListener('mousedown', onDown, true);
        };
      }, []);
      const row = (key, icon, label, disabled, onClick) =>
        h(
          'button',
          {
            type: 'button',
            key,
            className: 'gitp-popover-row',
            role: 'menuitem',
            disabled,
            onClick,
          },
          h(Icon, { path: icon, size: 13 }),
          h('span', { className: 'gitp-popover-row-text' }, label),
        );
      return h(
        'div',
        { className: 'gitp-popover is-menu', ref: menuRef, role: 'menu', 'aria-label': t('ai.action') },
        row('write', paths.sparkles, t('ai.write'), !canUse || busy, onWrite),
        row('branch', paths.branch, t('ai.branch'), !canBranch || busy, onBranch),
      );
    }

    function Header({
      t,
      workspaceTitle,
      branch,
      repo,
      ahead,
      behind,
      upstream,
      onBranchMenu,
      onRepoMenu,
      repos,
      repoRoot,
      onSync,
      busy,
      onRefresh,
      syncing,
    }) {
      const branchName =
        branch?.name ?? (branch?.oid ? shortHash(branch.oid) : repo === false ? t('empty.noRepo') : t('status.detached'));
      const currentRepo = repos.find((item) => item.root === repoRoot) ?? null;
      const showRepoPicker =
        repos.length > 1 ||
        (repos.length === 1 && repos[0].name !== '.' && !repos[0].name.startsWith('..'));
      const repoLabel =
        currentRepo === null
          ? t('repo.none')
          : currentRepo.name === '.'
            ? t('repo.workspace')
            : currentRepo.label ?? currentRepo.name;
      return h(
        'div',
        { className: 'gitp-head' },
        h(
          'div',
          { className: 'gitp-head-left' },
          h('span', { className: 'gitp-repo' }, workspaceTitle),
          showRepoPicker
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'gitp-branch gitp-repo-pick',
                  onClick: onRepoMenu,
                  'aria-haspopup': 'listbox',
                  'aria-label': t('repo.pick'),
                  title: t('repo.pick'),
                },
                h(Icon, { path: paths.folder, size: 13 }),
                h('span', { className: 'gitp-branch-name' }, repoLabel),
                h('span', { className: 'gitp-chevron' }, h(Icon, { path: paths.chevron, size: 11 })),
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-branch',
              onClick: onBranchMenu,
              disabled: repo === false,
              'aria-haspopup': 'listbox',
              'aria-label': t('branch.title'),
              title: t('branch.title'),
            },
            h(Icon, { path: paths.branch, size: 13 }),
            h('span', { className: 'gitp-branch-name' }, branchName),
            h('span', { className: 'gitp-chevron' }, h(Icon, { path: paths.chevron, size: 11 })),
          ),
        ),
        h(
          'div',
          { className: 'gitp-head-right' },
          h(SyncButton, {
            label: t('action.fetch'),
            icon: paths.fetch,
            count: 0,
            onClick: () => onSync('fetch'),
            busy: syncing === 'fetch',
            disabled: busy,
          }),
          h(SyncButton, {
            label: t('action.pull'),
            icon: paths.pull,
            count: behind,
            onClick: () => onSync('pull'),
            busy: syncing === 'pull',
            disabled: busy || upstream === null,
          }),
          h(SyncButton, {
            label: t('action.push'),
            icon: paths.push,
            count: ahead,
            onClick: () => onSync('push'),
            busy: syncing === 'push',
            disabled: busy,
          }),
          h(IconButton, {
            label: t('action.refresh'),
            icon: paths.refresh,
            onClick: onRefresh,
            disabled: busy,
          }),
        ),
      );
    }

    function ModeRail({ t, mode, onMode, counts }) {
      const items = [
        { id: 'changes', label: t('mode.changes'), icon: paths.changes, count: counts.changes },
        { id: 'log', label: t('mode.log'), icon: paths.history, count: 0 },
        { id: 'stash', label: t('mode.stash'), icon: paths.stash, count: 0 },
      ];
      return h(
        'nav',
        { className: 'gitp-rail', 'aria-label': t('panel') },
        items.map((item) =>
          h(
            'button',
            {
              type: 'button',
              key: item.id,
              className: cx('gitp-rail-item', mode === item.id && 'is-active'),
              onClick: () => onMode(item.id),
              'aria-label': item.count > 0 ? `${item.label}, ${item.count}` : item.label,
              'aria-current': mode === item.id ? 'page' : undefined,
            },
            h(Icon, { path: item.icon, size: 15 }),
            h('span', { className: 'gitp-rail-label' }, item.label),
            item.count > 0 ? h('span', { className: 'gitp-rail-count' }, String(item.count)) : null,
          ),
        ),
      );
    }

    function RepoMenu({ t, repos, current, onPick, onInitRoot, onClose }) {
      const menuRef = useRef(null);
      const closeRef = useRef(onClose);
      closeRef.current = onClose;
      useEffect(() => {
        menuRef.current?.querySelector('button:not(:disabled)')?.focus();
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          closeRef.current();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, []);
      const canInit = !repos.some((item) => item.name === '.' || item.name.startsWith('..'));
      return h(
        'div',
        {
          className: 'gitp-popover-layer',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) closeRef.current();
          },
        },
        h(
          'div',
          { className: 'gitp-popover is-wide', ref: menuRef, role: 'listbox', 'aria-label': t('repo.title') },
          h('div', { className: 'gitp-popover-title' }, t('repo.title')),
          h(
            'div',
            { className: 'gitp-popover-list' },
            repos.map((item) =>
              h(
                'button',
                {
                  type: 'button',
                  key: item.root,
                  className: 'gitp-popover-row',
                  role: 'option',
                  'aria-selected': item.root === current,
                  disabled: item.root === current,
                  onClick: () => onPick(item.root),
                },
                h(Icon, { path: paths.folder, size: 13 }),
                h('span', { className: 'gitp-popover-row-text' }, item.name === '.' ? t('repo.workspace') : item.label ?? item.name),
                item.root === current ? h(Icon, { path: paths.check, size: 13, className: 'gitp-checkmark' }) : null,
              ),
            ),
          ),
          canInit
            ? h(
                React.Fragment,
                null,
                h('div', { className: 'gitp-popover-sep' }),
                h(
                  'button',
                  { type: 'button', className: 'gitp-popover-row', onClick: onInitRoot },
                  h(Icon, { path: paths.plus, size: 13 }),
                  h('span', { className: 'gitp-popover-row-text' }, t('repo.initRoot')),
                ),
              )
            : null,
        ),
      );
    }

    function BranchMenu({ t, branches, loading, busy, onCheckout, onNew, onClose }) {
      const menuRef = useRef(null);
      const closeRef = useRef(onClose);
      closeRef.current = onClose;
      const [query, setQuery] = useState('');
      useEffect(() => {
        menuRef.current?.querySelector('input')?.focus();
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          closeRef.current();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, []);
      const needle = query.trim().toLowerCase();
      const local = branches.filter((item) => !item.remote);
      const localNames = new Set(local.map((item) => item.name));
      const remotes = branches.filter((item) => {
        if (!item.remote) return false;
        const short = item.name.split('/').slice(1).join('/');
        return short !== '' && !localNames.has(short);
      });
      const match = (item) => needle === '' || item.name.toLowerCase().includes(needle);
      const filteredLocal = local.filter(match);
      const filteredRemote = remotes.filter(match);
      const rows = (items, remote) =>
        items.map((item) =>
          h(
            'button',
            {
              type: 'button',
              key: `${remote ? 'r' : 'l'}:${item.name}`,
              className: 'gitp-popover-row',
              role: 'option',
              'aria-selected': item.current === true,
              disabled: busy || item.current === true,
              onClick: () => onCheckout(item.name, remote),
            },
            h(Icon, { path: paths.branch, size: 13 }),
            h('span', { className: 'gitp-popover-row-text' }, item.name),
            item.current ? h(Icon, { path: paths.check, size: 13, className: 'gitp-checkmark' }) : null,
          ),
        );
      return h(
        'div',
        {
          className: 'gitp-popover-layer',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) closeRef.current();
          },
        },
        h(
          'div',
          { className: 'gitp-popover is-wide', ref: menuRef, role: 'listbox', 'aria-label': t('branch.local') },
          h('input', {
            className: 'gitp-search',
            value: query,
            placeholder: t('branch.search'),
            onChange: (event) => setQuery(event.target.value),
            'aria-label': t('branch.search'),
          }),
          h(
            'button',
            { type: 'button', className: 'gitp-popover-row', disabled: busy, onClick: onNew },
            h(Icon, { path: paths.plus, size: 13 }),
            h('span', { className: 'gitp-popover-row-text' }, t('branch.new')),
          ),
          h('div', { className: 'gitp-popover-sep' }),
          loading ? h('div', { className: 'gitp-modal-sub' }, t('branch.loading')) : null,
          !loading && filteredLocal.length === 0 && filteredRemote.length === 0
            ? h('div', { className: 'gitp-modal-sub' }, needle === '' ? t('branch.none') : t('branch.noneMatch'))
            : null,
          filteredLocal.length > 0
            ? h(
                React.Fragment,
                null,
                h('div', { className: 'gitp-popover-title' }, t('branch.local')),
                h('div', { className: 'gitp-popover-list' }, rows(filteredLocal, false)),
              )
            : null,
          filteredRemote.length > 0
            ? h(
                React.Fragment,
                null,
                h('div', { className: 'gitp-popover-title' }, t('branch.remote')),
                h('div', { className: 'gitp-popover-list' }, rows(filteredRemote, true)),
              )
            : null,
        ),
      );
    }

    function NewBranchDialog({ t, busy, error, onCreate, onClose }) {
      const [name, setName] = useState('');
      return h(
        Modal,
        { title: t('branch.newTitle'), onClose },
        h(
          'div',
          { className: 'gitp-field' },
          h('label', { htmlFor: 'gitp-new-branch' }, t('branch.name')),
          h('input', {
            id: 'gitp-new-branch',
            value: name,
            onChange: (event) => setName(event.target.value),
            spellCheck: false,
            autoComplete: 'off',
          }),
          h('div', { className: 'gitp-field-hint' }, t('branch.newHint')),
        ),
        error ? h('div', { className: 'gitp-modal-error' }, error.message ?? String(error)) : null,
        h(
          'div',
          { className: 'gitp-modal-actions' },
          h('button', { type: 'button', className: 'gitp-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-btn is-primary',
              disabled: busy || name.trim() === '',
              onClick: () => onCreate({ name: name.trim() }),
            },
            busy ? h(Spinner) : null,
            t('action.createAndSwitch'),
          ),
        ),
      );
    }

    function LogView({ call, workspaceId, repo, t, refreshToken, compact, layout, onLayout }) {
      const [commits, setCommits] = useState(null);
      const [selected, setSelected] = useState(null);
      const [detail, setDetail] = useState(null);
      const [file, setFile] = useState(null);
      const [diff, setDiff] = useState(null);
      const [loading, setLoading] = useState(false);
      const [detailLoading, setDetailLoading] = useState(false);
      const [diffLoading, setDiffLoading] = useState(false);
      const [error, setError] = useState(null);
      const [copiedHash, setCopiedHash] = useState(false);
      const repoRef = useRef(repo);

      const copyHash = (hash) => {
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(hash).catch(() => {});
          setCopiedHash(true);
          setTimeout(() => setCopiedHash(false), 2000);
        }
      };

      useEffect(() => {
        if (repoRef.current === repo) return;
        repoRef.current = repo;
        setSelected(null);
        setDetail(null);
        setFile(null);
        setDiff(null);
      }, [repo]);

      useEffect(() => {
        let active = true;
        const controller = new AbortController();
        setLoading(true);
        call('log', { workspaceId, repo }, controller.signal)
          .then((result) => {
            if (!active) return;
            const rows = computeLanes(result.commits ?? []);
            setCommits(rows);
            if (rows.length > 0) setSelected((current) => current ?? rows[0].hash);
          })
          .catch((event) => {
            if (active && event.name !== 'AbortError') setError(event);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
        return () => {
          active = false;
          controller.abort();
        };
      }, [workspaceId, repo, refreshToken]);

      useEffect(() => {
        if (!selected) {
          setDetail(null);
          return;
        }
        let active = true;
        const controller = new AbortController();
        setDetailLoading(true);
        call('commitDetail', { workspaceId, repo, hash: selected }, controller.signal)
          .then((result) => {
            if (active) {
              setDetail(result);
              if (!compact && Array.isArray(result.files) && result.files.length > 0) {
                setFile((current) => (current && result.files.some((f) => f.path === current) ? current : result.files[0].path));
              } else if (compact) {
                setFile(null);
              }
              setDiff(null);
            }
          })
          .catch((event) => {
            if (active && event.name !== 'AbortError') setError(event);
          })
          .finally(() => {
            if (active) setDetailLoading(false);
          });
        return () => {
          active = false;
          controller.abort();
        };
      }, [workspaceId, repo, selected, compact]);

      useEffect(() => {
        if (!file || !detail) {
          setDiff(null);
          return;
        }
        let active = true;
        const controller = new AbortController();
        setDiffLoading(true);
        call(
          'diff',
          {
            workspaceId,
            repo,
            path: file,
            side: 'log',
            commit: detail.hash,
            parent: detail.parents?.[0],
          },
          controller.signal,
        )
          .then((result) => {
            if (active) setDiff(result);
          })
          .catch((event) => {
            if (active && event.name !== 'AbortError') setError(event);
          })
          .finally(() => {
            if (active) setDiffLoading(false);
          });
        return () => {
          active = false;
          controller.abort();
        };
      }, [workspaceId, repo, file, detail]);

      if (loading && commits === null) {
        return h(Empty, { icon: h(Spinner), title: t('log.loading') });
      }
      if (commits === null && error !== null) {
        return h(Empty, {
          icon: h(Icon, { path: paths.warning, size: 28 }),
          title: t('error.title'),
          hint: errorMessage(error),
        });
      }
      if (commits !== null && commits.length === 0) {
        return h(Empty, {
          icon: h(Icon, { path: paths.history, size: 28 }),
          title: t('empty.noHistory'),
          hint: t('empty.noHistoryHint'),
        });
      }

      const showList = !compact || !file;
      const showDiff = !compact || Boolean(file);

      return h(
        'div',
        { className: 'gitp-changes' },
        showList
          ? h(
              'div',
              { className: 'gitp-listcol' },
              h(
                'div',
                { className: 'gitp-loglist' },
                error ? h('div', { className: 'gitp-modal-error', style: { padding: '6px 10px' } }, errorMessage(error)) : null,
                (commits ?? []).map((commit) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      key: commit.hash,
                      className: cx('gitp-commitrow', selected === commit.hash && 'is-selected'),
                      onClick: () => setSelected(commit.hash),
                    },
                    h(
                      'span',
                      { className: 'gitp-graph', style: { width: Math.max(14, commit.laneCount * 10 + 8) } },
                      h('span', {
                        className: 'gitp-graph-line',
                        style: { left: 6 + commit.lane * 10 },
                      }),
                      h('span', {
                        className: cx('gitp-graph-dot', commit.lane % 4 ? `g${commit.lane % 4}` : ''),
                        style: { left: 6 + commit.lane * 10 },
                      }),
                    ),
                    h(
                      'span',
                      { className: 'gitp-commitmain' },
                      h('div', { className: 'gitp-commit-subject' }, commit.subject),
                      h(
                        'div',
                        { className: 'gitp-commit-meta' },
                        h('span', null, commit.author),
                        h('span', null, '·'),
                        h('span', null, relativeDate(commit.date)),
                      ),
                      commit.refs.length > 0
                        ? h(
                            'div',
                            { className: 'gitp-refs' },
                            commit.refs.map((ref) =>
                              h(
                                'span',
                                {
                                  key: ref,
                                  className: cx('gitp-ref', ref.startsWith('HEAD') && 'is-head'),
                                },
                                ref.replace(/^HEAD -> /, ''),
                              ),
                            ),
                          )
                        : null,
                    ),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'gitp-logdetail-summary' },
                detailLoading && detail === null
                  ? h('div', { className: 'gitp-center', style: { padding: '24px' } }, h(Spinner))
                  : detail === null
                    ? h(Empty, { title: t('log.select') })
                    : h(
                        React.Fragment,
                        null,
                        h(
                          'div',
                          { className: 'gitp-detail-head' },
                          h('div', { className: 'gitp-detail-subject' }, detail.subject),
                          h(
                            'div',
                            { className: 'gitp-detail-meta' },
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'gitp-detail-hash-btn',
                                onClick: () => copyHash(detail.hash),
                                title: copiedHash ? t('action.copied') : t('action.copyHash'),
                              },
                              shortHash(detail.hash),
                              h(Icon, { path: copiedHash ? paths.check : paths.copy, size: 11 }),
                            ),
                            h('span', null, detail.author),
                            h('span', null, relativeDate(detail.date)),
                          ),
                        ),
                        detail.body ? h('div', { className: 'gitp-detail-body' }, detail.body) : null,
                        h(
                          'div',
                          { className: 'gitp-detail-section-head' },
                          h('span', null, t('log.files')),
                          h('span', { className: 'gitp-section-count' }, String(detail.files?.length ?? 0)),
                        ),
                        h(
                          'div',
                          { className: 'gitp-detail-files' },
                          !detail.files || detail.files.length === 0
                            ? h('div', { className: 'gitp-modal-sub', style: { padding: '8px 12px' } }, t('log.noFiles'))
                            : detail.files.map((item) => {
                                const filePath = splitPath(item.path);
                                return h(
                                  'button',
                                  {
                                    type: 'button',
                                    key: item.path,
                                    className: cx('gitp-detail-file', file === item.path && 'is-selected'),
                                    onClick: () => setFile(item.path),
                                  },
                                  h('span', { className: cx('gitp-status', statusClass(item.status ?? 'M')) }, item.status ?? 'M'),
                                  h(
                                    'span',
                                    { className: 'gitp-filename' },
                                    filePath.dir ? h('span', { className: 'gitp-filedir' }, filePath.dir) : null,
                                    filePath.base,
                                  ),
                                  item.binary
                                    ? h('span', { className: 'gitp-delta' }, t('meta.binary'))
                                    : h(
                                        'span',
                                        { className: 'gitp-delta' },
                                        item.add > 0 ? h('span', { className: 'gitp-add' }, `+${item.add}`) : null,
                                        item.del > 0 ? h('span', { className: 'gitp-del' }, `−${item.del}`) : null,
                                      ),
                                );
                              }),
                        ),
                      ),
              ),
            )
          : null,
        showDiff
          ? h(
              'div',
              { className: 'gitp-diffcol' },
              file
                ? h(DiffView, {
                    t,
                    diff,
                    loading: diffLoading,
                    layout,
                    onLayout,
                    onBlock: () => {},
                    busy: true,
                    selectionKey: `${detail?.hash ?? ''}:${file}`,
                    compact,
                    onBack: compact ? () => setFile(null) : undefined,
                  })
                : h(Empty, {
                    icon: h(Icon, { path: paths.changes, size: 28 }),
                    title: t('empty.selectFile'),
                    hint: t('empty.selectFileHint'),
                  }),
            )
          : null,
      );
    }

    function StashView({ call, workspaceId, repo, t, snapshot, onStatus, refreshToken }) {
      const [stashes, setStashes] = useState(null);
      const [error, setError] = useState(null);
      const [dialogOpen, setDialogOpen] = useState(false);
      const [busy, setBusy] = useState(null);
      const [dialogError, setDialogError] = useState(null);
      const [dropTarget, setDropTarget] = useState(null);
      const [toast, setToast] = useState(null);
      const repoRef = useRef(repo);

      useEffect(() => {
        if (repoRef.current === repo) return;
        repoRef.current = repo;
        setStashes(null);
      }, [repo]);

      const load = useCallback(
        async (signal) => {
          try {
            const result = await call('stashList', { workspaceId, repo }, signal);
            setStashes(result.stashes ?? []);
            setError(null);
          } catch (event) {
            if (event.name !== 'AbortError') setError(event);
          }
        },
        [workspaceId, repo, call],
      );

      useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
      }, [load, refreshToken]);

      useEffect(() => {
        if (toast === null) return;
        const id = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(id);
      }, [toast]);

      const files = (snapshot?.entries ?? []).filter((entry) => entry.unstaged && !entry.conflicted);

      async function create({ paths, message }) {
        setBusy('create');
        setDialogError(null);
        try {
          const result = await call('stashPush', {
            workspaceId,
            repo,
            paths,
            message,
            includeUntracked: paths.some((path) => files.find((file) => file.path === path)?.untracked),
          });
          onStatus(result.status);
          setStashes(result.stashes ?? []);
          setDialogOpen(false);
          setToast(t('stash.created', { count: paths.length }));
        } catch (event) {
          setDialogError(event);
        } finally {
          setBusy(null);
        }
      }

      async function act(kind, ref, pop) {
        setBusy(kind + ref);
        setError(null);
        try {
          const result = await call(kind === 'drop' ? 'stashDrop' : 'stashApply', {
            workspaceId,
            repo,
            ref,
            pop,
          });
          onStatus(result.status);
          setStashes(result.stashes ?? []);
          if (kind === 'drop') setToast(t('stash.dropped', { ref }));
          else setToast(t(pop ? 'stash.popped' : 'stash.applied', { ref }));
          setDropTarget(null);
        } catch (event) {
          setError(event);
        } finally {
          setBusy(null);
        }
      }

      return h(
        'div',
        { className: 'gitp-stash' },
        h(
          'div',
          { className: 'gitp-stash-head' },
          h(
            'div',
            { className: 'gitp-stash-title' },
            h(Icon, { path: paths.stash, size: 14 }),
            h('span', null, t('mode.stash')),
            stashes?.length ? h('span', { className: 'gitp-section-count' }, String(stashes.length)) : null,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-btn is-small is-primary',
              onClick: () => setDialogOpen(true),
              disabled: files.length === 0,
            },
            h(Icon, { path: paths.plus, size: 12 }),
            t('action.stash'),
          ),
        ),
        error ? h('div', { className: 'gitp-error' }, h('span', { className: 'gitp-error-text' }, errorMessage(error))) : null,
        stashes === null
          ? h('div', { className: 'gitp-center' }, h(Spinner))
          : stashes.length === 0
            ? h(Empty, {
                icon: h(Icon, { path: paths.stash, size: 28 }),
                title: t('empty.noStashes'),
                hint: t('empty.noStashesHint'),
                action:
                  files.length > 0
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'gitp-btn is-primary is-small',
                          onClick: () => setDialogOpen(true),
                        },
                        h(Icon, { path: paths.plus, size: 12 }),
                        t('action.stash'),
                      )
                    : null,
              })
            : h(
                'div',
                { className: 'gitp-stashlist' },
                stashes.map((stash) =>
                  h(
                    'div',
                    { className: 'gitp-stashrow', key: stash.ref },
                    h(
                      'div',
                      { className: 'gitp-stash-main' },
                      h('div', { className: 'gitp-stash-msg' }, stash.message || 'WIP'),
                      h(
                        'div',
                        { className: 'gitp-stash-meta' },
                        h('span', { className: 'gitp-stash-ref' }, stash.ref),
                        h('span', null, '·'),
                        h('span', null, shortHash(stash.hash)),
                      ),
                    ),
                    h(
                      'div',
                      { className: 'gitp-stash-actions' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'gitp-btn is-small',
                          onClick: () => act('apply', stash.ref, false),
                          disabled: busy !== null,
                          title: 'Apply changes and keep stash',
                        },
                        busy === 'apply' + stash.ref ? h(Spinner) : null,
                        t('action.apply'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'gitp-btn is-small',
                          onClick: () => act('apply', stash.ref, true),
                          disabled: busy !== null,
                          title: 'Apply changes and delete stash',
                        },
                        busy === 'apply' + stash.ref ? h(Spinner) : null,
                        t('action.pop'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'gitp-btn is-small gitp-stash-btn-danger',
                          onClick: () => setDropTarget(stash.ref),
                          disabled: busy !== null,
                          title: 'Delete stash',
                        },
                        t('action.drop'),
                      ),
                    ),
                  ),
                ),
              ),
        dialogOpen
          ? h(StashDialog, {
              t,
              files,
              busy: busy === 'create',
              error: dialogError,
              onCreate: create,
              onClose: () => {
                setDialogOpen(false);
                setDialogError(null);
              },
            })
          : null,
        dropTarget
          ? h(ConfirmDialog, {
              title: t('stash.dropTitle'),
              body: t('stash.dropBody', { ref: dropTarget }),
              confirmLabel: t('action.drop'),
              cancelLabel: t('action.cancel'),
              danger: true,
              busy: busy === 'drop' + dropTarget,
              onConfirm: () => act('drop', dropTarget),
              onClose: () => setDropTarget(null),
            })
          : null,
        toast ? h('div', { className: 'gitp-toast', role: 'status', 'aria-live': 'polite' }, toast) : null,
      );
    }

    function GitPanel({ call, t, useWorkspaces, useSessions, sessionId }) {
      const workspaces = useWorkspaces((state) => state.items);
      const session = useSessions((state) => state.byId[sessionId]);
      const workspace =
        workspaces.find((item) => item.sessionIds?.includes(sessionId)) ??
        workspaces.find(
          (item) =>
            session?.cwd !== undefined &&
            (session.cwd === item.path || session.cwd.startsWith(`${item.path}/`)),
        ) ??
        null;
      const rootRef = useRef(null);
      const [compact, setCompact] = useState(false);
      const [snapshot, setSnapshot] = useState(null);
      const [statusLoading, setStatusLoading] = useState(false);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(null);
      const [syncing, setSyncing] = useState(null);
      const [mode, setMode] = useState('changes');
      const [message, setMessage] = useState('');
      const [amend, setAmend] = useState(false);
      const [selection, setSelection] = useState(null);
      const [diff, setDiff] = useState(null);
      const [diffLoading, setDiffLoading] = useState(false);
      const [diffNonce, setDiffNonce] = useState(0);
      const [layout, setLayout] = useState(() => (readStore(STORE_LAYOUT, 'split') === 'unified' ? 'unified' : 'split'));
      const [compactLayout, setCompactLayout] = useState(() => (readStore(STORE_LAYOUT_COMPACT, 'split') === 'unified' ? 'unified' : 'split'));
      const [branchOpen, setBranchOpen] = useState(false);
      const [aiOpen, setAiOpen] = useState(false);
      const [aiBusy, setAiBusy] = useState(false);
      const [branchError, setBranchError] = useState(null);
      const [branchMenu, setBranchMenu] = useState(null);
      const [branchBusy, setBranchBusy] = useState(false);
      const [confirm, setConfirm] = useState(null);
      const [toast, setToast] = useState(null);
      const [refreshToken, setRefreshToken] = useState(0);
      const [repos, setRepos] = useState([]);
      const [repoRoot, setRepoRoot] = useState(null);
      const [repoNonce, setRepoNonce] = useState(0);
      const [repoMenu, setRepoMenu] = useState(false);
      const [newBranchOpen, setNewBranchOpen] = useState(false);
      const epoch = useRef(0);
      const failedRepo = useRef(null);

      useEffect(() => {
        const node = rootRef.current;
        if (node === null || typeof ResizeObserver === 'undefined') return;
        let frame = 0;
        const observer = new ResizeObserver((entries) => {
          if (frame) cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            frame = 0;
            const width = entries[0]?.contentRect.width ?? 0;
            setCompact(width > 0 && width < 900);
          });
        });
        observer.observe(node);
        return () => {
          observer.disconnect();
          if (frame) cancelAnimationFrame(frame);
        };
      }, [workspace?.workspaceId]);

      const applyStatus = useCallback((next) => {
        if (!next || !Array.isArray(next.entries)) return;
        epoch.current += 1;
        setSnapshot(next);
      }, []);

      const loadStatus = useCallback(
        async (signal, quiet) => {
          if (!workspace || repoRoot === null) return;
          const current = ++epoch.current;
          if (!quiet) setStatusLoading(true);
          try {
            const next = await call(
              'status',
              { workspaceId: workspace.workspaceId, repo: repoRoot },
              signal,
            );
            if (current === epoch.current) {
              failedRepo.current = null;
              setSnapshot(next);
              if (Array.isArray(next.repos) && next.repos.length > 0) setRepos(next.repos);
              setError(null);
            }
          } catch (event) {
            if (event.name === 'AbortError' || current !== epoch.current) return;
            if (event.code === 'git/not-repo' || event.code === 'git/repo-invalid') {
              if (failedRepo.current === repoRoot) {
                setError(event);
                return;
              }
              failedRepo.current = repoRoot;
              writeStore(STORE_REPO + workspace.workspaceId, '');
              setRepoRoot(null);
              setSnapshot(null);
              setError(null);
              setRepoNonce((value) => value + 1);
              return;
            }
            setError(event);
          } finally {
            if (current === epoch.current) setStatusLoading(false);
          }
        },
        [workspace?.workspaceId, repoRoot, call],
      );

      const prevWsId = useRef(null);
      useEffect(() => {
        if (!workspace?.workspaceId) return;
        const wsId = workspace.workspaceId;
        if (prevWsId.current !== wsId) {
          prevWsId.current = wsId;
          setRepos([]);
          setRepoRoot(null);
          setSnapshot(null);
        }
        const controller = new AbortController();
        (async () => {
          try {
            const next = await call('status', { workspaceId: wsId }, controller.signal);
            if (controller.signal.aborted) return;
            const list = Array.isArray(next.repos) ? next.repos : [];
            setRepos(list);
            const stored = readStore(STORE_REPO + wsId, '');
            const pick = list.find((item) => item.root === stored) ?? list[0] ?? null;
            if (pick) {
              setRepoRoot(pick.root);
              writeStore(STORE_REPO + wsId, pick.root);
            } else {
              setSnapshot(next);
            }
          } catch (event) {
            if (event.name !== 'AbortError') setError(event);
          }
        })();
        return () => controller.abort();
      }, [workspace?.workspaceId, call, repoNonce]);

      useEffect(() => {
        if (repoRoot === null) return;
        const controller = new AbortController();
        loadStatus(controller.signal, false);
        return () => controller.abort();
      }, [repoRoot, loadStatus]);

      useEffect(() => {
        if (!workspace || repoRoot === null) return;
        const id = setInterval(() => {
          if (document.visibilityState === 'visible') loadStatus(undefined, true);
        }, 8000);
        return () => clearInterval(id);
      }, [workspace?.workspaceId, repoRoot, loadStatus]);

      useEffect(() => {
        const onFocus = () => loadStatus(undefined, true);
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
      }, [loadStatus]);

      useEffect(() => {
        if (toast === null) return;
        const id = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(id);
      }, [toast]);

      const conflicts = snapshot?.entries?.filter((entry) => entry.conflicted) ?? [];
      const staged = snapshot?.entries?.filter((entry) => entry.staged && !entry.conflicted) ?? [];
      const unstaged = snapshot?.entries?.filter((entry) => entry.unstaged && !entry.conflicted) ?? [];
      const canCommit =
        staged.length > 0 && conflicts.length === 0 && message.trim() !== '' && snapshot?.repo !== false;
      const selectionKey = selection ? `${selection.side}:${selection.path}:${selection.commit ?? ''}` : '';

      const selectionExists =
        selection === null
          ? true
          : selection.side === 'staged'
            ? snapshot?.entries?.some((entry) => entry.path === selection.path && entry.staged && !entry.conflicted)
            : selection.side === 'unstaged'
              ? snapshot?.entries?.some((entry) => entry.path === selection.path && entry.unstaged && !entry.conflicted)
              : selection.side === 'conflict'
                ? snapshot?.entries?.some((entry) => entry.path === selection.path && entry.conflicted)
                : true;

      useEffect(() => {
        if (snapshot !== null && selection !== null && !selectionExists) setSelection(null);
      }, [snapshot, selectionKey]);

      useEffect(() => {
        if (!workspace || selection === null) {
          setDiff(null);
          return;
        }
        const controller = new AbortController();
        setDiffLoading(true);
        call(
          'diff',
          { workspaceId: workspace.workspaceId, repo: repoRoot, path: selection.path, side: selection.side },
          controller.signal,
        )
          .then((result) => {
            if (!controller.signal.aborted) setDiff(result);
          })
          .catch((event) => {
            if (!controller.signal.aborted && event.name !== 'AbortError') setError(event);
          })
          .finally(() => {
            if (!controller.signal.aborted) setDiffLoading(false);
          });
        return () => controller.abort();
      }, [workspace?.workspaceId, repoRoot, selectionKey, diffNonce, call]);

      function bumpDiff() {
        setDiffNonce((value) => value + 1);
      }

      function selectFile(next) {
        if (selection !== null && selection.side === next.side && selection.path === next.path) return;
        setDiff(null);
        setSelection(next);
      }

      function entryPaths(entries) {
        const paths = new Set();
        for (const entry of entries) {
          paths.add(entry.path);
          if (entry.from) paths.add(entry.from);
        }
        return [...paths];
      }

      async function toggleFile(entry, side) {
        if (busy !== null) return;
        setBusy('file');
        setError(null);
        try {
          const result = await call(side === 'staged' ? 'unstage' : 'stage', {
            workspaceId: workspace.workspaceId,
            repo: repoRoot,
            paths: entryPaths([entry]),
          });
          applyStatus(result);
          if (selection?.path === entry.path && selection.side === side) setSelection(null);
          bumpDiff();
        } catch (event) {
          setError(event);
        } finally {
          setBusy(null);
        }
      }

      async function toggleAll(side) {
        const entries = side === 'staged' ? staged : unstaged;
        if (busy !== null || entries.length === 0) return;
        setBusy('file');
        setError(null);
        try {
          const result = await call(side === 'staged' ? 'unstage' : 'stage', {
            workspaceId: workspace.workspaceId,
            repo: repoRoot,
            paths: entryPaths(entries),
          });
          applyStatus(result);
          bumpDiff();
        } catch (event) {
          setError(event);
        } finally {
          setBusy(null);
        }
      }

      async function blockAction(block, action) {
        if (busy !== null || diff === null) return;
        if (action === 'revert') {
          setConfirm({
            title: t('confirm.revertTitle'),
            body: t('confirm.revertBody'),
            confirmLabel: t('confirm.yesRevert'),
            danger: true,
            run: () => performBlock(block, 'revert'),
          });
          return;
        }
        await performBlock(block, action);
      }

      async function performBlock(block, action) {
        setBusy('block');
        setError(null);
        try {
          const result = await call('applyBlocks', {
            workspaceId: workspace.workspaceId,
            repo: repoRoot,
            path: diff.path,
            side: action,
            blocks: [block],
            baseHash: diff.baseHash,
            targetHash: diff.targetHash,
            confirm: true,
          });
          applyStatus(result);
          bumpDiff();
        } catch (event) {
          setError(event);
          if (event.code === 'git/stale') bumpDiff();
        } finally {
          setBusy(null);
          setConfirm(null);
        }
      }

      async function resolve(side) {
        if (!selection || busy !== null) return;
        setBusy('resolve');
        setError(null);
        try {
          const result = await call('resolve', {
            workspaceId: workspace.workspaceId,
            repo: repoRoot,
            path: selection.path,
            side,
          });
          applyStatus(result);
          setSelection(null);
          bumpDiff();
        } catch (event) {
          setError(event);
        } finally {
          setBusy(null);
        }
      }

      async function doCommit() {
        if (!canCommit || busy !== null) return;
        setBusy('commit');
        setError(null);
        try {
          const result = await call('commit', {
            workspaceId: workspace.workspaceId,
            repo: repoRoot,
            message,
            amend,
          });
          applyStatus(result.status);
          setMessage('');
          setAmend(false);
          setToast(t('commit.done', { hash: shortHash(result.hash) }));
          bumpDiff();
        } catch (event) {
          setError(event);
        } finally {
          setBusy(null);
        }
      }

      function openBranch() {
        if (staged.length === 0 || conflicts.length > 0) return;
        setBranchError(null);
        setBranchOpen(true);
      }

      async function requestAiMessage() {
        if (aiBusy || staged.length === 0) return null;
        setAiBusy(true);
        setError(null);
        try {
          const result = await call('aiMessage', {
            workspaceId: workspace.workspaceId,
            repo: repoRoot,
          });
          if (typeof result?.model === 'string' && result.model !== '') {
            setToast(t('ai.written', { model: result.model }));
          }
          return typeof result?.message === 'string' && result.message !== '' ? result.message : null;
        } catch (event) {
          setError(event);
          return null;
        } finally {
          setAiBusy(false);
        }
      }

      async function aiWrite() {
        setAiOpen(false);
        const generated = await requestAiMessage();
        if (generated !== null) setMessage(generated);
      }

      async function aiBranchAndCommit() {
        setAiOpen(false);
        if (staged.length === 0 || conflicts.length > 0) return;
        const generated = await requestAiMessage();
        if (generated === null) return;
        setMessage(generated);
        setBranchError(null);
        setBranchOpen(true);
      }

      async function createBranch({ name, message: branchMessage }) {
        setBranchBusy(true);
        setBranchError(null);
        try {
          const result = await call('createBranchAndCommit', {
            workspaceId: workspace.workspaceId,
            repo: repoRoot,
            name,
            message: branchMessage,
          });
          applyStatus(result.status);
          setMessage('');
          setBranchOpen(false);
          setToast(t('branch.created', { branch: name }));
          bumpDiff();
        } catch (event) {
          setBranchError(errorMessage(event));
        } finally {
          setBranchBusy(false);
        }
      }

      async function sync(kind) {
        if (busy !== null) return;
        setBusy('sync');
        setSyncing(kind);
        setError(null);
        try {
          const result = await call(kind, { workspaceId: workspace.workspaceId, repo: repoRoot });
          applyStatus(result.status);
          setToast(t(kind === 'fetch' ? 'sync.fetched' : kind === 'pull' ? 'sync.pulled' : 'sync.pushed'));
        } catch (event) {
          setError(event);
        } finally {
          setBusy(null);
          setSyncing(null);
        }
      }

      async function openBranchMenu() {
        if (snapshot?.repo === false) return;
        if (branchMenu !== null) {
          setBranchMenu(null);
          return;
        }
        setBranchMenu({ branches: [], loading: true });
        try {
          const result = await call('branches', { workspaceId: workspace.workspaceId, repo: repoRoot });
          setBranchMenu({ branches: result.branches ?? [], loading: false });
        } catch (event) {
          setBranchMenu(null);
          setError(event);
        }
      }

      function requestCheckout(name, remote) {
        setBranchMenu(null);
        if ((snapshot?.entries?.length ?? 0) > 0) {
          setConfirm({
            title: t('confirm.checkoutTitle'),
            body: t('confirm.checkoutBody'),
            confirmLabel: t('confirm.yesCheckout'),
            danger: false,
            run: () => checkout(name, remote),
          });
          return;
        }
        void checkout(name, remote);
      }

      async function checkout(name, remote) {
        setConfirm(null);
        setBranchBusy(true);
        setError(null);
        try {
          const result = await call('checkout', { workspaceId: workspace.workspaceId, repo: repoRoot, branch: name, remote: remote === true });
          applyStatus(result.status);
          setBranchMenu(null);
          setSelection(null);
          bumpDiff();
        } catch (event) {
          setBranchMenu(null);
          setError(event);
        } finally {
          setBranchBusy(false);
        }
      }

      async function initRepo() {
        if (busy !== null) return;
        setBusy('init');
        setError(null);
        try {
          const result = await call('init', { workspaceId: workspace.workspaceId });
          if (Array.isArray(result.repos)) setRepos(result.repos);
          const root = result.selected ?? result.root ?? null;
          if (typeof root === 'string' && root !== '') {
            writeStore(STORE_REPO + workspace.workspaceId, root);
            setRepoRoot(root);
          }
          applyStatus(result);
        } catch (event) {
          setError(event);
        } finally {
          setBusy(null);
        }
      }

      function selectRepo(next) {
        setRepoMenu(false);
        if (next === repoRoot) return;
        writeStore(STORE_REPO + workspace.workspaceId, next);
        setRepoRoot(next);
        setSnapshot(null);
        setSelection(null);
        setDiff(null);
        setBranchMenu(null);
      }

      function askInitAtRoot() {
        setRepoMenu(false);
        setConfirm({
          title: t('repo.initRootTitle'),
          body: t('repo.initRootBody', { count: repos.length }),
          confirmLabel: t('repo.initRootConfirm'),
          danger: true,
          run: () => {
            setConfirm(null);
            void initRepo();
          },
        });
      }

      async function createNewBranch({ name }) {
        if (repoRoot === null) return;
        setBranchBusy(true);
        setBranchError(null);
        try {
          const result = await call('createBranch', {
            workspaceId: workspace.workspaceId,
            repo: repoRoot,
            name,
          });
          applyStatus(result.status);
          setNewBranchOpen(false);
          setToast(t('branch.createdOnly', { branch: name }));
          bumpDiff();
        } catch (event) {
          setBranchError(errorMessage(event));
        } finally {
          setBranchBusy(false);
        }
      }

      const effectiveLayout = compact ? compactLayout : layout;

      function changeLayout(next) {
        if (compact) {
          setCompactLayout(next);
          writeStore(STORE_LAYOUT_COMPACT, next);
        } else {
          setLayout(next);
          writeStore(STORE_LAYOUT, next);
        }
      }

      if (workspace === null) {
        return h('div', { className: 'gitp-root' }, h(Styles), h(Empty, {
          icon: h(Icon, { path: paths.branch, size: 28 }),
          title: t('empty.noWorkspace'),
          hint: t('empty.noWorkspaceHint'),
        }));
      }

      const branch = snapshot?.branch ?? null;
      const ahead = branch?.ahead ?? 0;
      const behind = branch?.behind ?? 0;
      const statusError = error;
      const firstStaged = staged[0]?.path;
      const branchDefault = defaultBranchName(message, firstStaged);
      const branchMessageDefault = message;

      return h(
        'div',
        { className: cx('gitp-root', compact && 'is-compact'), ref: rootRef },
        h(Styles),
        h(Header, {
          t,
          workspaceTitle: workspace.title,
          branch,
          repo: snapshot?.repo !== false,
          ahead,
          behind,
          upstream: branch?.upstream ?? null,
          onBranchMenu: openBranchMenu,
          onRepoMenu: () => setRepoMenu(true),
          repos,
          repoRoot,
          onSync: sync,
          busy: busy !== null,
          onRefresh: () => {
            loadStatus(undefined, false);
            if (selection) bumpDiff();
            setRefreshToken((value) => value + 1);
          },
          syncing,
        }),
        statusError
          ? h(
              'div',
              { className: 'gitp-error', role: 'alert' },
              h(Icon, { path: paths.warning, size: 14 }),
              h('span', { className: 'gitp-error-text' }, errorMessage(statusError)),
              h(IconButton, {
                label: t('action.close'),
                icon: paths.close,
                onClick: () => setError(null),
              }),
            )
          : null,
        h(
          'div',
          { className: 'gitp-body' },
          h(ModeRail, {
            t,
            mode,
            onMode: setMode,
            counts: { changes: (snapshot?.entries?.length ?? 0) },
          }),
          h(
            'div',
            { className: 'gitp-content' },
            snapshot === null
              ? h(Empty, {
                  icon: h(Spinner),
                  title: t('status.loading'),
                })
              : snapshot.repo === false
                ? h(Empty, {
                    icon: h(Icon, { path: paths.branch, size: 28 }),
                    title: t('empty.noRepo'),
                    hint: t('empty.noRepoHint'),
                    action: h(
                      'button',
                      {
                        type: 'button',
                        className: 'gitp-btn is-primary',
                        onClick: initRepo,
                        disabled: busy !== null,
                      },
                      busy === 'init' ? h(Spinner) : null,
                      t('empty.init'),
                    ),
                  })
                : mode === 'log'
                  ? h(LogView, {
                      call,
                      workspaceId: workspace.workspaceId,
                      repo: repoRoot,
                      t,
                      refreshToken,
                      compact,
                      layout: effectiveLayout,
                      onLayout: changeLayout,
                    })
                  : mode === 'stash'
                    ? h(StashView, {
                        call,
                        workspaceId: workspace.workspaceId,
                        repo: repoRoot,
                        t,
                        snapshot,
                        onStatus: applyStatus,
                        refreshToken,
                      })
                    : h(ChangesView, {
                        t,
                        snapshot,
                        conflicts,
                        staged,
                        unstaged,
                        selection,
                        onSelect: selectFile,
                        busy: busy !== null,
                        fileBusy: busy !== null,
                        onToggleFile: toggleFile,
                        onToggleAll: toggleAll,
                        diff,
                        diffLoading,
                        layout: effectiveLayout,
                        onLayout: changeLayout,
                        onRefresh: () => {
                          bumpDiff();
                          loadStatus(undefined, false);
                        },
                        onBlock: blockAction,
                        onResolve: resolve,
                        message,
                        onMessage: setMessage,
                        onCommit: doCommit,
                        onBranch: openBranch,
                        canCommit,
                        commitBusy: busy === 'commit',
                        aiBusy,
                        aiMenuOpen: aiOpen,
                        onAiToggle: () => setAiOpen((value) => !value),
                        onAiClose: () => setAiOpen(false),
                        onAiWrite: aiWrite,
                        onAiBranch: aiBranchAndCommit,
                        selectionKey,
                        amend,
                        onAmend: setAmend,
                        canAmend: snapshot.branch?.initial !== true,
                        compact,
                        onBack: () => setSelection(null),
                      }),
          ),
        ),
        branchMenu
          ? h(BranchMenu, {
              t,
              branches: branchMenu.branches,
              loading: branchMenu.loading === true,
              busy: branchBusy,
              onCheckout: requestCheckout,
              onNew: () => {
                setBranchMenu(null);
                setBranchError(null);
                setNewBranchOpen(true);
              },
              onClose: () => setBranchMenu(null),
            })
          : null,
        repoMenu
          ? h(RepoMenu, {
              t,
              repos,
              current: repoRoot,
              onPick: selectRepo,
              onInitRoot: askInitAtRoot,
              onClose: () => setRepoMenu(false),
            })
          : null,
        newBranchOpen
          ? h(NewBranchDialog, {
              t,
              busy: branchBusy,
              error: branchError,
              onCreate: createNewBranch,
              onClose: () => {
                setNewBranchOpen(false);
                setBranchError(null);
              },
            })
          : null,
        branchOpen
          ? h(BranchDialog, {
              t,
              defaultName: branchDefault,
              defaultMessage: branchMessageDefault,
              busy: branchBusy,
              error: branchError,
              onCreate: createBranch,
              onClose: () => {
                setBranchOpen(false);
                setBranchError(null);
              },
            })
          : null,
        confirm
          ? h(ConfirmDialog, {
              title: confirm.title,
              body: confirm.body,
              confirmLabel: confirm.confirmLabel,
              cancelLabel: t('action.cancel'),
              danger: confirm.danger,
              busy: busy === 'block' || branchBusy,
              onConfirm: () => confirm.run(),
              onClose: () => setConfirm(null),
            })
          : null,
        toast ? h('div', { className: 'gitp-toast', role: 'status', 'aria-live': 'polite' }, toast) : null,
      );
    }

    function GitTabTitle({ t }) {
      return h(
        React.Fragment,
        null,
        h(GitMark, { size: 14 }),
        h('span', { className: 'gitp-tab-title' }, t('panel')),
      );
    }

    return {
      inject: ['connection', 'slots', 'locale', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.locale.register(NS, 'en', EN);
        ctx.locale.register(NS, 'zh', ZH);
        const t = ctx.locale.bind(NS);
        const call = async (method, payload, signal) => {
          const result = await ctx.connection.rpc.call('/git-rpc', method, payload, signal);
          if (!result.ok) {
            const failure = new Error(result.error.message);
            failure.code = result.error.code;
            failure.details = result.error.details;
            throw failure;
          }
          return result.value;
        };
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: GIT_TAB_ID,
              kind: 'git',
              priority: 'extension',
              title: () => t('panel'),
              guide: [
                {
                  id: 'git',
                  order: 50,
                  title: () => t('guide.title'),
                  description: () => t('guide.description'),
                  icon: GitIcon,
                },
              ],
            }),
          'dsh-git: right sidebar tab type',
        );
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.pane.tab',
              key: GIT_TAB_ID,
              locale: NS,
              inject: () => ({ call, t }),
            },
            GitPanel,
          ),
        );
        ctx.slots.inject('sidebar.right.pane.tab.title', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.pane.tab.title',
              key: GIT_TAB_ID,
              locale: NS,
              inject: () => ({ t }),
            },
            GitTabTitle,
          ),
        );
      },
    };
  },
});
