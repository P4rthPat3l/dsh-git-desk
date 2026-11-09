/* Git panel prototype: interaction and rendering.
   Renders into three mount points and keeps a small state object.
   All data shapes are the ones the host contract will return. */

(() => {
  'use strict';

  /* ------------------------------------------------------------ icons */

  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    chevronsRight: '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
    branch: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    commit: '<circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    stash: '<rect width="17" height="4" x="3.5" y="3.5" rx="1"/><path d="M5 7.5v11a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-11"/><path d="M12 10.5v6"/><path d="m9.5 14 2.5 2.5 2.5-2.5"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
    arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    arrowDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    branchPlus: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M6 8.5v7"/><path d="M18 4v6M15 7h6"/><path d="M9 18c4.5 0 6-3 6-7"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    chevronLeft: '<path d="m15 6-6 6 6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
    alignLeft: '<path d="M4 6h16M4 12h10M4 18h13"/>',
    more: '<circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M18.5 15.5v4M16.5 17.5h4"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    external: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    terminal: '<path d="m5 7 5 5-5 5"/><path d="M13 17h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/>',
    filter: '<path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    circle: '<circle cx="12" cy="12" r="3.4"/>',
    file: '<path d="M14 3v5h5"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/>',
  };

  const icon = (name, cls = '') =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* ------------------------------------------------------------ helpers */

  const esc = (v) =>
    String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const clone = (v) => JSON.parse(JSON.stringify(v));

  const splitPath = (p) => {
    const i = p.lastIndexOf('/');
    return i < 0 ? { dir: '', name: p } : { dir: p.slice(0, i), name: p.slice(i + 1) };
  };

  const STATUS = {
    M: { cls: 'M', label: 'Modified' },
    A: { cls: 'A', label: 'Added' },
    D: { cls: 'D', label: 'Deleted' },
    U: { cls: 'U', label: 'Untracked' },
    R: { cls: 'R', label: 'Renamed' },
    '!': { cls: 'conflict', label: 'Conflict' },
  };

  const statusOf = (s) => STATUS[s] || STATUS.U;


  /* ------------------------------------------------------------ state */

  const state = {
    view: 'changes',
    diffMode: 'split',
    selected: 'src/client/git-panel.tsx',
    selectedSection: 'unstaged',
    selectedSha: commits[0].sha,
    commitFileKey: 'src/client/git-panel.tsx',
    message: 'feat(git): add hunk-level staging to the review panel',
    amend: false,
    theme: 'dark',
    working: clone(files),
    log: clone(commits),
    branch: 'main',
    ahead: 2,
    behind: 1,
    filter: '',
    logQuery: '',
    diffPos: 1,
    collapsed: {},
    branchCreate: { open: false, name: '', base: 'main' },
    viewKey: null,
    stashCount: stashEntries.length,
    merging: true,
    stash: { open: false, sel: {}, expanded: { 'src/client/git-panel.tsx': true }, name: '', keepIndex: false, includeUntracked: true },
    merge: { open: false, choice: null },
  };

  state.working.forEach((f) => {
    if (f.conflicted) return;
    if (f.untracked) {
      f.head = [];
      f.staged = [];
      f.local = (f.content || []).slice();
      return;
    }
    const stagedHunks = f.staged ? (f.both ? f.hunks.slice(0, 1) : f.hunks) : [];
    f.staged = applyHunks(f.head, stagedHunks);
    f.local = applyHunks(f.head, f.hunks || []);
  });

  const hasStaged = (f) => !f.conflicted && !!f.staged && cachedDiff(f.head, f.staged).blocks.length > 0;
  const hasUnstaged = (f) => !f.conflicted && !!f.staged && cachedDiff(f.staged, f.local).blocks.length > 0;
  const isBoth = (f) => hasStaged(f) && hasUnstaged(f);
  const stagedFiles = () => state.working.filter(hasStaged);
  const conflictFiles = () => state.working.filter((f) => f.conflicted);
  const displayStatus = (f) => {
    if (f.conflicted) return '!';
    if (f.untracked) return hasStaged(f) ? 'A' : 'U';
    return f.status;
  };
  const stagedStats = () => stagedFiles().reduce((acc, f) => {
    const s = cachedDiff(f.head, f.staged).stats;
    return { add: acc.add + s.add, del: acc.del + s.del };
  }, { add: 0, del: 0 });

  const findFile = (path) => state.working.find((f) => f.path === path);

  function applyHunks(base, hunks) {
    const out = base.slice();
    const edits = hunks.map((h) => {
      const left = h.rows.filter((r) => r.l);
      const start = left.length ? left[0].l.n - 1 : out.length;
      const end = left.length ? left[left.length - 1].l.n : start;
      const lines = h.rows.filter((r) => r.r).map((r) => r.r.t);
      return { start, end, lines };
    }).sort((a, b) => b.start - a.start);
    edits.forEach((e) => out.splice(e.start, e.end - e.start, ...e.lines));
    return out;
  }

  function sameLines(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  /* ------------------------------------------------------------ syntax */

  const TOKEN_RE = /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|let|async|await|return|export|import|from|function|interface|type|new|if|else|this|class|private|readonly|extends|implements|default|true|false|null|undefined|void|number|string|boolean|describe|it|expect)\b|\b(\d+)\b|\b([A-Z][A-Za-z0-9_]*)\b/g;

  const tokenize = (text, hot) => {
    let out = '';
    let last = 0;
    let m;
    TOKEN_RE.lastIndex = 0;
    const wrap = (cls, v) => `<span class="tok-${cls}${hot ? ' hot' : ''}">${esc(v)}</span>`;
    while ((m = TOKEN_RE.exec(text))) {
      if (m.index > last) out += (hot ? `<span class="hot">${esc(text.slice(last, m.index))}</span>` : esc(text.slice(last, m.index)));
      if (m[1]) out += wrap('comment', m[1]);
      else if (m[2]) out += wrap('string', m[2]);
      else if (m[3]) out += wrap('keyword', m[3]);
      else if (m[4]) out += wrap('number', m[4]);
      else if (m[5]) out += wrap('type', m[5]);
      last = m.index + m[0].length;
    }
    if (last < text.length) out += (hot ? `<span class="hot">${esc(text.slice(last))}</span>` : esc(text.slice(last)));
    return out;
  };

  const renderCode = (text) =>
    text
      .split(/(«.*?»)/)
      .map((part) => {
        if (part.startsWith('«') && part.endsWith('»')) return tokenize(part.slice(1, -1), true);
        return tokenize(part, false);
      })
      .join('');

  /* ------------------------------------------------------------ head */

  function renderHead() {
    const total = state.working.length;
    const changes = total;
    document.getElementById('gitHead').innerHTML = [
      `<div class="tabs">
        <button class="tab ${state.view === 'changes' ? 'active' : ''}" data-action="view" data-view="changes">
          ${icon('commit')} Commit ${changes ? `<span class="count">${changes}</span>` : ''}
        </button>
        <button class="tab ${state.view === 'log' ? 'active' : ''}" data-action="view" data-view="log">
          ${icon('history')} Log
        </button>
      </div>`,
      `<div class="vr"></div>`,
      `<button class="branch-chip" data-action="branch-menu" title="Switch branch" aria-label="Switch branch">
        ${icon('branch')}
        <span class="branch-name">${esc(state.branch)}</span>
        ${icon('chevronDown', 'chev')}
      </button>`,
      `<div class="head-spacer"></div>`,
      `<div class="toolbar">
        <button class="tool-btn" data-action="fetch" aria-label="Fetch from origin">${icon('refresh')}</button>
        <button class="tool-btn" data-action="pull" ${state.behind ? '' : 'disabled'} aria-label="Update from remote">${icon('arrowDown')}${state.behind ? `<span class="num">${state.behind}</span>` : ''}</button>
        <button class="tool-btn ${state.ahead ? 'accent' : ''}" data-action="push" ${state.ahead ? '' : 'disabled'} aria-label="Push to origin">${icon('arrowUp')}Push${state.ahead ? `<span class="num">${state.ahead}</span>` : ''}</button>
        <div class="vr"></div>
        <button class="tool-btn" data-action="stash-open" title="Stash changes…" aria-label="Stash changes">${icon('stash')}</button>
        <button class="tool-btn" data-action="more-menu" title="More actions" aria-label="More actions">${icon('more')}</button>
      </div>`,
    ].join('');
  }

  /* ------------------------------------------------------------ file list */

  function fileRow(f, section) {
    const { dir, name } = splitPath(f.path);
    const disp = displayStatus(f);
    const st = statusOf(disp);
    const selected = state.selected === f.path && state.selectedSection === section && state.view === 'changes';
    const both = isBoth(f) ? '<span class="both" title="Staged and unstaged changes">↕</span>' : '';
    const action = f.conflicted
      ? `<button class="row-act resolve" data-action="merge-open" title="Resolve conflict" aria-label="Resolve conflict">${icon('alert')}</button>`
      : section === 'staged'
        ? `<button class="row-act minus" data-action="unstage-file" data-path="${esc(f.path)}" title="Unstage file" aria-label="Unstage file">${icon('minus')}</button>`
        : `<button class="row-act plus" data-action="stage-file" data-path="${esc(f.path)}" title="Stage file" aria-label="Stage file">${icon('plus')}</button>`;

    return [
      `<div class="file-row ${selected ? 'selected' : ''}" data-action="select-file" data-path="${esc(f.path)}" data-section="${section}">`,
      `<span class="status st-${st.cls}"><span class="letter">${disp}</span>${both}</span>`,
      `<span class="file-name n-${st.cls}">${esc(name)}</span>`,
      `<span class="file-dir">${esc(dir)}</span>`,
      `<span class="row-act-wrap">`,
      action,
      `</span>`,
      `</div>`,
    ].join('');
  }

  function groupHTML(id, label, rows, actionLabel, extraClass = '') {
    if (!rows.length) return '';
    const collapsed = !!state.collapsed[id];
    return [
      `<div class="group ${collapsed ? 'collapsed' : ''} ${extraClass}" data-group="${id}">`,
      `<div class="group-head" data-action="toggle-group" data-group="${id}">`,
      icon('chevronDown', 'g-chev'),
      `<span class="g-label">${label}</span><span class="g-count">${rows.length}</span><span class="g-unit">${rows.length === 1 ? 'file' : 'files'}</span>`,
      actionLabel ? `<button class="g-action" data-action="${id === 'staged' ? 'unstage-all' : 'stage-all'}" data-group="${id}">${actionLabel}</button>` : '',
      `</div>`,
      `<div class="group-rows">${rows.map((f) => fileRow(f, id)).join('')}</div>`,
      `</div>`,
    ].join('');
  }

  function listHTML() {
    const q = state.filter.trim().toLowerCase();
    const matches = (f) => !q || f.path.toLowerCase().includes(q);
    const conflicts = conflictFiles().filter(matches);
    const staged = stagedFiles().filter(matches);
    const unstaged = state.working.filter((f) => !f.conflicted && hasUnstaged(f)).filter(matches);
    const html = [
      groupHTML('conflicts', 'Conflicts', conflicts, '', 'conflicts'),
      groupHTML('staged', 'Staged', staged, 'Unstage all'),
      groupHTML('unstaged', 'Unstaged', unstaged, 'Stage all'),
    ].join('');
    return html || `<div class="empty-list">No changed files${q ? ` match “${esc(state.filter)}”` : ''}.</div>`;
  }


  /* ------------------------------------------------------------ commit box */

  function commitHTML() {
    const staged = stagedFiles();
    const conflicts = conflictFiles().length;
    const { add, del } = stagedStats();
    return [
      `<div class="commit-box">`,
      `<div class="msg-wrap">
        <textarea class="msg" data-input="message" placeholder="Commit message" aria-label="Commit message">${esc(state.message)}</textarea>
        <button class="gen-btn" data-action="generate-message" title="Generate a message with DSH">${icon('sparkles')}</button>
      </div>`,
      `<div class="commit-meta">
        <label class="check"><input type="checkbox" data-action="amend" ${state.amend ? 'checked' : ''}> Amend</label>
        ${conflicts ? `<span class="conflict-note">${icon('alert')}${conflicts} conflict${conflicts === 1 ? '' : 's'}</span>` : ''}
        <span class="commit-stats">
          <span>${staged.length} staged</span>
          <span class="add">+${add}</span><span class="del">−${del}</span>
        </span>
      </div>`,
      `<div class="commit-row-btns">
        <div class="split-btn">
          <button class="btn btn-primary" data-action="commit" ${staged.length ? '' : 'disabled'} title="Commit staged changes">Commit${state.merging ? ' merge' : ''}</button>
          <button class="split-caret" data-action="commit-menu" ${staged.length ? '' : 'disabled'} aria-label="More commit actions">${icon('chevronDown')}</button>
        </div>
        <button class="icon-btn branch-new" data-action="branch-create-open" ${staged.length ? '' : 'disabled'} aria-label="Create branch and commit" title="Create branch and commit">${icon('branchPlus')}</button>
      </div>`,
      `</div>`,
    ].join('');
  }

  /* ------------------------------------------------------------ diff engine */

  function lcsOps(a, b) {
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push({ type: 'ctx', ai: i, bi: j });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: 'del', ai: i });
        i += 1;
      } else {
        ops.push({ type: 'add', bi: j });
        j += 1;
      }
    }
    while (i < n) ops.push({ type: 'del', ai: i++ });
    while (j < m) ops.push({ type: 'add', bi: j++ });
    return ops;
  }

  function diffRows(a, b) {
    const ops = lcsOps(a, b);
    const rows = [];
    let i = 0;
    while (i < ops.length) {
      if (ops[i].type === 'ctx') {
        rows.push({ l: { i: ops[i].ai, t: a[ops[i].ai] }, r: { i: ops[i].bi, t: b[ops[i].bi] }, k: 'ctx' });
        i += 1;
        continue;
      }
      const dels = [];
      const adds = [];
      while (i < ops.length && ops[i].type === 'del') dels.push(ops[i++]);
      while (i < ops.length && ops[i].type === 'add') adds.push(ops[i++]);
      const n = Math.max(dels.length, adds.length);
      for (let j = 0; j < n; j += 1) {
        const d = dels[j];
        const ad = adds[j];
        const l = d ? { i: d.ai, t: a[d.ai] } : null;
        const r = ad ? { i: ad.bi, t: b[ad.bi] } : null;
        rows.push({ l, r, k: l && r ? 'mod' : l ? 'del' : 'add' });
      }
    }
    return rows;
  }

  function diffBlocks(rows, aLen, bLen) {
    const blocks = [];
    for (let k = 0; k < rows.length;) {
      if (rows[k].k === 'ctx') {
        k += 1;
        continue;
      }
      const startRow = k;
      while (k < rows.length && rows[k].k !== 'ctx') k += 1;
      const run = rows.slice(startRow, k);
      const left = run.filter((r) => r.l).map((r) => r.l.i);
      const right = run.filter((r) => r.r).map((r) => r.r.i);
      const next = rows.slice(k);
      const nextL = next.find((r) => r.l);
      const nextR = next.find((r) => r.r);
      const leftStart = left.length ? left[0] : nextL ? nextL.l.i : aLen;
      const leftEnd = left.length ? left[left.length - 1] + 1 : leftStart;
      const rightStart = right.length ? right[0] : nextR ? nextR.r.i : bLen;
      const rightEnd = right.length ? right[right.length - 1] + 1 : rightStart;
      blocks.push({
        startRow,
        endRow: k - 1,
        leftStart,
        leftEnd,
        rightStart,
        rightEnd,
        kind: !left.length ? 'add' : !right.length ? 'del' : 'mod',
      });
    }
    return blocks;
  }

  function diffStats(rows) {
    return rows.reduce((acc, r) => {
      if (r.r && (!r.l || r.k === 'add' || r.k === 'mod')) acc.add += 1;
      if (r.l && (!r.r || r.k === 'del' || r.k === 'mod')) acc.del += 1;
      return acc;
    }, { add: 0, del: 0 });
  }

  const DIFF_CACHE = new WeakMap();

  function cachedDiff(a, b) {
    let byRight = DIFF_CACHE.get(a);
    if (!byRight) {
      byRight = new WeakMap();
      DIFF_CACHE.set(a, byRight);
    }
    let diff = byRight.get(b);
    if (!diff) {
      const rows = diffRows(a, b);
      diff = { a, b, rows, blocks: diffBlocks(rows, a.length, b.length), stats: diffStats(rows) };
      byRight.set(b, diff);
    }
    return diff;
  }

  const contextArrays = (f, ctx) =>
    ctx === 'staged' ? [f.head, f.staged] : ctx === 'commit' ? [f.head, f.local] : [f.staged, f.local];

  const diffFor = (f, ctx) => {
    const [a, b] = contextArrays(f, ctx);
    return cachedDiff(a, b);
  };

  function arrowButton(f, dir, blockId, ctx) {
    const label = dir === 'stage' ? 'Stage hunk' : dir === 'revert' ? 'Revert hunk to the staged version' : 'Unstage hunk';
    return `<button class="hunk-arrow ${dir}" data-action="move-hunk" data-path="${esc(f.path)}" data-dir="${dir}" data-block="${blockId}" data-ctx="${ctx}" aria-label="${label}">${icon(dir === 'stage' ? 'arrowLeft' : 'arrowRight')}</button>`;
  }

  function blockArrows(f, blockId, ctx) {
    if (ctx === 'staged') return arrowButton(f, 'unstage', blockId, ctx);
    return arrowButton(f, 'stage', blockId, ctx) + arrowButton(f, 'revert', blockId, ctx);
  }

  function splitBody(f, ctx) {
    const d = diffFor(f, ctx);
    const interactive = ctx === 'staged' || ctx === 'unstaged';
    const arrows = new Map();
    const starts = new Set(d.blocks.map((b, i) => {
      if (interactive) arrows.set(b.startRow, `<span class="hunk-actions">${blockArrows(f, i, ctx)}</span>`);
      return b.startRow;
    }));
    return d.rows.map((r, i) => {
      const cls = [r.k, starts.has(i) ? 'chg' : ''].filter(Boolean).join(' ');
      return [
        `<div class="drow ${cls}">`,
        `<div class="pane l"><span class="code">${r.l ? renderCode(r.l.t) : ''}</span></div>`,
        `<span class="ln old">${r.l ? r.l.i + 1 : ''}</span>`,
        `<span class="gmark">${arrows.get(i) || ''}</span>`,
        `<span class="ln new">${r.r ? r.r.i + 1 : ''}</span>`,
        `<div class="pane r"><span class="code">${r.r ? renderCode(r.r.t) : ''}</span></div>`,
        `</div>`,
      ].join('');
    }).join('');
  }

  function unifiedBody(f, ctx) {
    const d = diffFor(f, ctx);
    const interactive = ctx === 'staged' || ctx === 'unstaged';
    const arrows = new Map();
    const starts = new Set(d.blocks.map((b, i) => {
      if (interactive) arrows.set(b.startRow, `<span class="hunk-actions">${blockArrows(f, i, ctx)}</span>`);
      return b.startRow;
    }));
    const out = [];
    d.rows.forEach((r, i) => {
      let arrow = arrows.get(i) || '';
      if (r.k === 'ctx') {
        out.push(`<div class="urow ctx${arrow ? ' chg' : ''}"><span class="ln">${r.l.i + 1}</span><span class="ln">${r.r.i + 1}</span><span class="code">${renderCode(r.l.t)}</span><span class="gmark">${arrow}</span></div>`);
        return;
      }
      if (r.l) {
        out.push(`<div class="urow del${arrow ? ' chg' : ''}"><span class="ln">${r.l.i + 1}</span><span class="ln"></span><span class="code">${renderCode(r.l.t)}</span><span class="gmark">${arrow}</span></div>`);
        arrow = '';
      }
      if (r.r) out.push(`<div class="urow add${arrow ? ' chg' : ''}"><span class="ln"></span><span class="ln">${r.r.i + 1}</span><span class="code">${renderCode(r.r.t)}</span><span class="gmark">${arrow}</span></div>`);
    });
    return out.join('');
  }

  function diffToolsHTML(changes) {
    const mode = state.diffMode === 'split' ? 'Side by side' : 'Unified';
    return [
      `<div class="diff-tools">`,
      `<button class="icon-btn sm" data-action="prev-change" aria-label="Previous change">${icon('arrowUp')}</button>`,
      `<button class="icon-btn sm" data-action="next-change" aria-label="Next change">${icon('arrowDown')}</button>`,
      `<span class="tools-sep"></span>`,
      `<button class="tool-select" data-action="mode-menu">${icon('columns')}<span>${mode}</span>${icon('chevronDown')}</button>`,
      `<span class="spacer"></span>`,
      `<span class="diff-count">${changes} change${changes === 1 ? '' : 's'}</span>`,
      `</div>`,
    ].join('');
  }

  function versionsHTML(file, context) {
    let left;
    let right;
    if (context === 'staged') {
      left = { tag: 'HEAD', sha: 'ce68c19a' };
      right = { tag: 'Staged' };
    } else if (context === 'unstaged') {
      left = { tag: 'Staged' };
      right = { tag: 'Local' };
    } else if (context === 'conflict') {
      left = { tag: 'HEAD', sha: 'ce68c19a' };
      right = { tag: 'origin/main' };
    } else {
      left = { tag: 'parent', sha: '4c5d6e7' };
      right = { tag: 'commit', sha: state.selectedSha };
    }
    return [
      `<div class="diff-versions">`,
      `<div class="ver left"><span class="vtag">${esc(left.tag)}</span>${left.sha ? `<span class="vsha">${esc(left.sha)}</span>` : ''}</div>`,
      `<div class="ver mid"></div>`,
      `<div class="ver right"><span class="vtag">${esc(right.tag)}</span>${right.sha ? `<span class="vsha">${esc(right.sha)}</span>` : ''}</div>`,
      `</div>`,
    ].join('');
  }

  function conflictBody(file) {
    return [
      `<div class="conflict-scroll">`,
      `<div class="conflict-banner">
        ${icon('alert')}
        <div class="txt"><b>1 conflict block</b> between ${esc(file.conflict.ours)} and ${esc(file.conflict.theirs)}. Resolve it before committing.</div>
      </div>`,
      file.conflict.blocks.map((ln) => `<div class="conflict-line ${ln.k}"><span class="ln">${ln.n}</span><span class="code">${renderCode(ln.t)}</span></div>`).join(''),
      `</div>`,
    ].join('');
  }

  function resolveDiffFile(entry) {
    if (!entry) return null;
    if (entry.head && entry.local) {
      return { path: entry.path, status: entry.status, head: entry.head, local: entry.local };
    }
    const key = entry.diff || entry.path;
    const base = key.startsWith('clean:') ? cleanDiffs[key.slice(6)] : findFile(key) || cleanDiffs[key];
    if (!base) return null;
    return { path: entry.path, status: entry.status, head: base.head, local: base.local };
  }

  function renderDiff(file, context) {
    if (!file) return `<section class="diff-col"><div class="empty-list" style="padding:32px">Select a file to review its changes.</div></section>`;
    return `<section class="diff-col">${diffInner(file, context)}</section>`;
  }

  function diffInner(file, context) {
    const { dir, name } = splitPath(file.path);
    const isConflict = context === 'conflict' && file.conflicted;
    const isCommit = context === 'commit';
    const interactive = context === 'staged' || context === 'unstaged';
    const d = isConflict ? null : diffFor(file, context);
    const changes = d ? d.blocks.length : 0;
    const stats = d ? d.stats : { add: 0, del: 0 };
    const disp = displayStatus(file);
    const pill = isCommit
      ? `<span class="head-pill">${icon('commit')}${esc(state.selectedSha)}</span>`
      : isConflict
        ? `<span class="head-pill" style="color:var(--git-conflict);border-color:color-mix(in srgb, var(--git-conflict) 35%, transparent)">${icon('alert')}Unresolved</span>`
        : context === 'staged'
          ? `<span class="head-pill staged">${icon('check')}Staged</span>`
          : `<span class="head-pill">Unstaged</span>`;

    const actions = isConflict
      ? `<button class="btn" style="height:26px;font-size:11.5px" data-action="merge-open">${icon('alert')}Resolve conflict</button><button class="icon-btn" data-action="file-menu" data-path="${esc(file.path)}" aria-label="File actions">${icon('more')}</button>`
      : `<button class="icon-btn" data-action="file-menu" data-path="${esc(file.path)}" aria-label="File actions">${icon('more')}</button>`;

    const lang = file.path.endsWith('.json') ? 'JSON' : file.path.endsWith('.md') ? 'Markdown' : 'TypeScript';
    const emptyText = context === 'staged'
      ? `<div>No staged changes</div><span>Every change in this file is in the working tree. Open the Unstaged entry to stage it.</span>`
      : `<div>No unstaged changes</div><span>Everything in this file is staged. Open the Staged entry to review or unstage it.</span>`;
    const body = isConflict
      ? conflictBody(file)
      : !changes
        ? `<div class="diff-empty">${icon('arrowRight')}${emptyText}</div>`
        : state.diffMode === 'unified'
          ? `<div class="diff-scroll unified">${unifiedBody(file, context)}</div>`
          : `<div class="diff-scroll">${splitBody(file, context)}</div>`;
    const foot = isConflict
      ? `<div class="diff-foot"><span class="legend" style="color:var(--git-conflict)">1 conflict block</span><span class="spacer"></span><span>HEAD vs origin/main</span><span>UTF-8</span><span>JSON</span></div>`
      : `<div class="diff-foot">
        <span class="legend"><span class="swatch add"></span>Added</span>
        <span class="legend"><span class="swatch del"></span>Removed</span>
        <span>${changes} change${changes === 1 ? '' : 's'}</span>
        <span class="spacer"></span>
        <span>UTF-8</span><span>LF</span><span>${lang}</span>
      </div>`;

    return [
      `<div class="file-head">
        <span class="diff-status ${isConflict ? 'conflict' : ''} ${disp === 'U' ? 'new' : ''}">${disp}</span>
        <div class="file-title"><span class="name">${esc(name)}</span><span class="dir">${esc(dir)}</span></div>
        ${isConflict ? '' : `<span class="file-stats">${stats.add ? `<span class="add">+${stats.add}</span>` : ''}${stats.del ? `<span class="del">−${stats.del}</span>` : ''}</span>`}
        ${pill}
        <div class="head-actions">${actions}</div>
      </div>`,
      isConflict ? versionsHTML(file, context) : diffToolsHTML(changes),
      isConflict || state.diffMode === 'unified' ? '' : versionsHTML(file, context),
      body,
      foot,
    ].join('');
  }

  /* ------------------------------------------------------------ changes view */

  function renderChanges() {
    const work = document.getElementById('work');
    work.className = 'work';
    work.innerHTML = [
      `<aside class="list-col">
        <div class="list-tools">
          <div class="filter-box">${icon('search')}<input data-input="file-filter" placeholder="Filter files" value="${esc(state.filter)}" spellcheck="false"></div>
          <button class="icon-btn" data-action="refresh-list" title="Refresh status">${icon('refresh')}</button>
          <button class="icon-btn" data-action="list-menu" title="View options">${icon('more')}</button>
        </div>
        <div class="list-body" id="listBody">${listHTML()}</div>
        ${commitHTML()}
      </aside>`,
      (() => {
        const f = findFile(state.selected);
        if (!f) return renderDiff(null, 'unstaged');
        const context = f.conflicted
          ? 'conflict'
          : state.selectedSection === 'staged' || state.selectedSection === 'unstaged'
            ? state.selectedSection
            : hasStaged(f) && !hasUnstaged(f) ? 'staged' : 'unstaged';
        return renderDiff(f, context);
      })(),
    ].join('');
  }

  /* ------------------------------------------------------------ log */

  function laneX(l) { return 15 + l * 17; }

  function graphSVG(c) {
    const w = 64;
    const h = 50;
    const parts = [];
    (c.lines || []).forEach((l) => {
      parts.push(`<line x1="${laneX(l)}" y1="0" x2="${laneX(l)}" y2="${h}" stroke="var(--lane-${l % 4})" stroke-width="1.7" opacity=".85"/>`);
    });
    if (c.curve) {
      parts.push(`<path d="M ${laneX(c.curve.from)} ${h / 2} C ${laneX(c.curve.from)} ${h * 0.78}, ${laneX(c.curve.to)} ${h * 0.74}, ${laneX(c.curve.to)} ${h}" stroke="var(--lane-${c.curve.from % 4})" stroke-width="1.7" fill="none" opacity=".85"/>`);
    }
    if (c.close) {
      parts.push(`<path d="M ${laneX(c.close.from)} 0 C ${laneX(c.close.from)} ${h * 0.22}, ${laneX(c.close.to)} ${h * 0.26}, ${laneX(c.close.to)} ${h / 2}" stroke="var(--lane-${c.close.from % 4})" stroke-width="1.7" fill="none" opacity=".85"/>`);
    }
    parts.push(`<circle cx="${laneX(c.lane)}" cy="${h / 2}" r="3.4" fill="var(--lane-${c.lane % 4})" stroke="var(--panel)" stroke-width="1.6"/>`);
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${parts.join('')}</svg>`;
  }

  const refChip = (r) => `<span class="ref ${r.kind}">${esc(r.label)}</span>`;

  function logRowsHTML() {
    const q = state.logQuery.trim().toLowerCase();
    const rows = state.log.filter((c) => !q || (c.subject + ' ' + c.author + ' ' + c.sha).toLowerCase().includes(q));
    if (!rows.length) return `<div class="empty-list">No commits match “${esc(state.logQuery)}”.</div>`;
    return rows
      .map((c) => {
        const selected = c.sha === state.selectedSha;
        return [
          `<div class="commit-row ${selected ? 'selected' : ''}" data-action="select-commit" data-sha="${c.sha}">`,
          `<div class="graph-cell">${graphSVG(c)}</div>`,
          `<div class="commit-main">
            <div class="commit-subject"><span class="subj" title="${esc(c.subject)}">${esc(c.subject)}</span></div>
            <div class="commit-meta">
              ${(c.refs || []).map(refChip).join('')}
              <span>${esc(c.author)}</span><span class="dot-sep">·</span><span class="sha">${c.sha}</span>
            </div>
          </div>`,
          `<span class="commit-time">${esc(c.time)}</span>`,
          `</div>`,
        ].join('');
      })
      .join('');
  }

  function renderCommitView() {
    const c = state.log.find((x) => x.sha === state.selectedSha) || state.log[0];
    if (!c) return `<section class="diff-col"><div class="empty-list" style="padding:32px">Select a commit.</div></section>`;
    const entry = c.files.find((f) => f.path === state.commitFileKey) || c.files[0];
    if (entry) state.commitFileKey = entry.path;
    const diffFile = entry ? resolveDiffFile(entry) : null;
    const totalAdd = c.files.reduce((n, f) => n + (f.add || 0), 0);
    const totalDel = c.files.reduce((n, f) => n + (f.del || 0), 0);
    return [
      `<section class="diff-col">`,
      `<div class="commit-detail">
        <div class="commit-title">${esc(c.subject)}</div>
        ${c.body ? `<div class="commit-body">${esc(c.body)}</div>` : ''}
        <div class="commit-detail-meta">
          <div class="avatar">${esc(c.initials)}</div>
          <span class="author">${esc(c.author)}</span>
          <span>committed ${esc(c.time)}</span>
          <span class="sha">${icon('commit')}${c.sha}</span>
          <span class="stat"><span class="add">+${totalAdd}</span><span class="del">−${totalDel}</span></span>
        </div>
        <div class="commit-files">
          ${c.files.map((f) => `<button class="cfile ${f.path === state.commitFileKey ? 'active' : ''}" data-action="select-commit-file" data-path="${esc(f.path)}">
            <span class="st st-${statusOf(f.status).cls}">${f.status}</span>
            <span class="fname">${esc(splitPath(f.path).name)}</span>
          </button>`).join('')}
        </div>
      </div>`,
      `<div class="diff-host">${diffFile ? diffInner(diffFile, 'commit') : ''}</div>`,
      `</section>`,
    ].join('');
  }

  function renderLog() {
    const work = document.getElementById('work');
    work.className = 'work is-log';
    work.innerHTML = [
      `<aside class="log-col">
        <div class="log-tools">
          <div class="filter-box">${icon('search')}<input data-input="log-filter" placeholder="Search history" value="${esc(state.logQuery)}" spellcheck="false"></div>
          <button class="filter-chip" data-action="log-filter-menu">${icon('filter')}All branches${icon('chevronDown')}</button>
        </div>
        <div class="log-scroll" id="logScroll">${logRowsHTML()}</div>
      </aside>`,
      renderCommitView(),
    ].join('');
  }

  /* ------------------------------------------------------------ status */

  function renderStatus() {
    const changed = state.working.length;
    const staged = stagedFiles().length;
    const conflicts = conflictFiles().length;
    document.getElementById('gitStatus').innerHTML = [
      `<span class="item">${icon('branch')}<span class="branch">${esc(state.branch)}</span></span>`,
      `<span class="dot"></span>`,
      state.merging ? `<span class="item merged">${icon('alert')}Merging origin/main${conflicts ? ` · ${conflicts} conflict` : ''}</span>` : '',
      `<span class="grow"></span>`,
      `<span class="item">${changed} changed · ${staged} staged</span>`,
      `<span class="item">${icon('stash')}${state.stashCount} stashes</span>`,
      `<span class="item">Fetched 4m ago</span>`,
    ].join('');
  }

  /* ------------------------------------------------------------ stash */

  function initStash() {
    state.stash.sel = {};
    stashCandidates.filter((f) => findFile(f.path)).forEach((f) => {
      state.stash.sel[f.path] = { on: true, hunks: f.hunks.map((_, i) => i) };
    });
  }

  const stashSelected = () => {
    let files = 0;
    let hunks = 0;
    Object.entries(state.stash.sel).forEach(([, v]) => {
      if (v.on && v.hunks.length) {
        files += 1;
        hunks += v.hunks.length;
      }
    });
    return { files, hunks };
  };

  function stashModalHTML() {
    if (!state.stash.open) return '';
    const sel = state.stash.sel;
    const candidates = stashCandidates.filter((f) => findFile(f.path));
    const counts = stashSelected();
    return [
      `<div class="overlay" data-action="stash-close">
        <div class="dialog" role="dialog" aria-modal="true" aria-label="Stash changes" data-stop>
          <div class="dialog-head">
            <div>
              <div class="dialog-title">Stash changes</div>
              <div class="dialog-sub">Choose what leaves the working tree. Unselected changes stay where they are.</div>
            </div>
            <button class="close-x" data-action="stash-close" aria-label="Close">${icon('x')}</button>
          </div>
          <div class="dialog-body">
            <div class="stash-scroll">
              ${candidates.map((f) => {
                const s = sel[f.path];
                const open = !!state.stash.expanded[f.path];
                const { dir, name } = splitPath(f.path);
                return [
                  `<div class="stash-row" data-action="stash-toggle-file" data-path="${esc(f.path)}">
                    <input class="cb" type="checkbox" data-action="stash-toggle-file" data-path="${esc(f.path)}" ${s.on ? 'checked' : ''} aria-label="Include ${esc(f.path)}">
                    <button class="expand ${open ? 'open' : ''}" data-action="stash-expand" data-path="${esc(f.path)}" aria-label="Show hunks">${icon('chevronRight')}</button>
                    <span class="st st-${statusOf(f.status).cls}">${f.status}</span>
                    <span class="s-name">${esc(name)}</span>
                    <span class="s-dir">${esc(dir)}</span>
                    <span class="s-count">${f.hunks.length} hunk${f.hunks.length === 1 ? '' : 's'}</span>
                  </div>`,
                  open
                    ? `<div class="stash-hunks">${f.hunks.map((h, i) => `<label class="stash-hunk">
                        <input class="cb" type="checkbox" data-action="stash-toggle-hunk" data-path="${esc(f.path)}" data-hunk="${i}" ${s.hunks.includes(i) ? 'checked' : ''}>
                        <span class="h-head">${esc(h.header)}</span>
                        <span class="h-preview">${esc(h.preview)}</span>
                      </label>`).join('')}</div>`
                    : '',
                ].join('');
              }).join('')}
            </div>
            <div class="dialog-section">
              <label class="field-label" for="stashName">Stash name</label>
              <input class="text-input" id="stashName" data-input="stash-name" value="${esc(state.stash.name)}" placeholder="WIP on ${esc(state.branch)}: a1b2c3d">
            </div>
            <div class="dialog-section">
              <label class="option-row"><input type="checkbox" data-action="stash-opt" data-opt="keepIndex" ${state.stash.keepIndex ? 'checked' : ''}>
                <span><span class="o-title">Keep staged changes in the index</span><span class="o-desc">Equivalent to git stash --keep-index</span></span></label>
              <label class="option-row"><input type="checkbox" data-action="stash-opt" data-opt="includeUntracked" ${state.stash.includeUntracked ? 'checked' : ''}>
                <span><span class="o-title">Include untracked files</span><span class="o-desc">New files that git does not track yet</span></span></label>
            </div>
          </div>
          <div class="dialog-foot">
            <span class="info">${counts.files} file${counts.files === 1 ? '' : 's'} · ${counts.hunks} hunk${counts.hunks === 1 ? '' : 's'}</span>
            <span class="spacer"></span>
            <button class="btn" data-action="stash-close">Cancel</button>
            <button class="btn btn-primary" style="flex:none;padding:0 14px" data-action="stash-confirm" ${counts.hunks ? '' : 'disabled'}>Stash selected</button>
          </div>
        </div>
      </div>`,
    ].join('');
  }

  /* ------------------------------------------------------------ merge */

  const MERGE_OURS = [
    '  "name": "dsh-git",',
    '  "version": "0.3.0",',
    '  "private": true,',
    '  "dependencies": {',
    '    "diff": "^5.2.0",',
    '    "simple-git": "^3.27.0"',
    '  }',
    '}',
  ];
  const MERGE_THEIRS = [
    '  "name": "dsh-git",',
    '  "version": "0.3.0",',
    '  "private": true,',
    '  "dependencies": {',
    '    "diff": "^6.0.0"',
    '  },',
    '  "devDependencies": {',
    '    "vitest": "^2.1.8"',
    '  }',
    '}',
  ];
  const MERGE_BOTH = [
    '  "name": "dsh-git",',
    '  "version": "0.3.0",',
    '  "private": true,',
    '  "dependencies": {',
    '    "diff": "^6.0.0",',
    '    "simple-git": "^3.27.0"',
    '  },',
    '  "devDependencies": {',
    '    "vitest": "^2.1.8"',
    '  }',
    '}',
  ];

  const mergePane = (title, tagCls, tag, lines, highlight, start = 1) =>
    [
      `<div class="merge-pane">
        <div class="merge-pane-head">${icon('file')}<span>${title}</span><span class="tag ${tagCls}">${tag}</span></div>
        <div class="merge-code">${lines
          .map((t, i) => `<div class="merge-line ${highlight(i) ? tagCls : ''}"><span class="ln">${start + i}</span><span class="code">${renderCode(t)}</span></div>`)
          .join('')}</div>
      </div>`,
    ].join('');

  function mergeModalHTML() {
    if (!state.merge.open) return '';
    const choice = state.merge.choice;
    const result = choice === 'ours' ? MERGE_OURS : choice === 'theirs' ? MERGE_THEIRS : choice === 'both' ? MERGE_BOTH : [];
    return [
      `<div class="overlay" data-action="merge-close">
        <div class="dialog wide" role="dialog" aria-modal="true" aria-label="Resolve conflict" data-stop>
          <div class="dialog-head">
            <div>
              <div class="dialog-title">Resolve conflict in package.json</div>
              <div class="dialog-sub">One block conflicts between <b>HEAD</b> and <b>origin/main</b>. Pick a side, then mark the file resolved.</div>
            </div>
            <button class="close-x" data-action="merge-close" aria-label="Close">${icon('x')}</button>
          </div>
          <div class="merge-grid">
            ${mergePane('Current (ours)', 'ours', 'HEAD', MERGE_OURS, (i) => i >= 3 && i <= 6)}
            <div class="merge-pane">
              <div class="merge-pane-head">${icon('check')}Result<span class="tag result">${choice ? 'resolved' : 'empty'}</span></div>
              <div class="conflict-actions">
                <button class="mini-action ${choice === 'ours' ? 'primary' : ''}" data-action="merge-choice" data-choice="ours">${icon('chevronLeft')}Accept current</button>
                <button class="mini-action ${choice === 'theirs' ? 'primary' : ''}" data-action="merge-choice" data-choice="theirs">Accept incoming${icon('chevronRight')}</button>
                <button class="mini-action ${choice === 'both' ? 'primary' : ''}" data-action="merge-choice" data-choice="both">${icon('plus')}Both</button>
              </div>
              <div class="merge-code">${result.length
                ? result.map((t, i) => `<div class="merge-line result"><span class="ln">${i + 1}</span><span class="code">${renderCode(t)}</span></div>`).join('')
                : `<div class="merge-line gap"><span class="ln"></span><span class="code">Choose a side to build the result.</span></div>`}</div>
            </div>
            ${mergePane('Incoming (theirs)', 'theirs', 'origin/main', MERGE_THEIRS, (i) => i >= 3 && i <= 8)}
          </div>
          <div class="dialog-foot">
            <span class="info">1 of 1 conflict block</span>
            <span class="spacer"></span>
            <button class="btn" data-action="merge-close">Cancel</button>
            <button class="btn btn-primary" style="flex:none;padding:0 14px" data-action="merge-resolve" ${choice ? '' : 'disabled'}>Mark as resolved</button>
          </div>
        </div>
      </div>`,
    ].join('');
  }

  function branchModalHTML() {
    if (!state.branchCreate.open) return '';
    const staged = stagedFiles();
    const conflicts = conflictFiles().length;
    const { add, del } = stagedStats();
    return [
      `<div class="overlay" data-action="branch-create-close">
        <div class="dialog" role="dialog" aria-modal="true" aria-label="Create branch and commit" data-stop>
          <div class="dialog-head">
            <div>
              <div class="dialog-title">New branch and commit</div>
              <div class="dialog-sub">The name follows the changes. The commit lands on the new branch, then you can push.</div>
            </div>
            <button class="close-x" data-action="branch-create-close" aria-label="Close">${icon('x')}</button>
          </div>
          <div class="dialog-body">
            <div class="dialog-section">
              <label class="field-label" for="branchName">Branch name</label>
              <div class="name-row">
                <input class="text-input" id="branchName" data-input="branch-name" value="${esc(state.branchCreate.name)}" spellcheck="false">
                <button class="icon-btn" data-action="branch-suggest" aria-label="Suggest another name">${icon('sparkles')}</button>
              </div>
              <div class="field-hint">Branches from <b>${esc(state.branchCreate.base)}</b>. Nothing leaves the working tree.</div>
              ${conflicts ? `<div class="field-hint" style="color:var(--red)">Resolve the open conflict before branching.</div>` : ''}
            </div>
            <div class="branch-summary">
              <span class="bs-file">${icon('file')}${staged.length} staged file${staged.length === 1 ? '' : 's'}</span>
              <span class="spacer"></span>
              <span class="add">+${add}</span><span class="del">−${del}</span>
            </div>
          </div>
          <div class="dialog-foot">
            <span class="info">${esc(state.message.split('\n')[0] || 'No message yet')}</span>
            <span class="spacer"></span>
            <button class="btn" data-action="branch-create-close">Cancel</button>
            <button class="btn btn-primary" style="flex:none;padding:0 14px" data-action="branch-create-confirm" ${staged.length && !conflicts ? '' : 'disabled'}>Create branch and commit</button>
          </div>
        </div>
      </div>`,
    ].join('');
  }

  function renderOverlays() {
    document.getElementById('modalRoot').innerHTML = stashModalHTML() + mergeModalHTML() + branchModalHTML();
  }

  /* ------------------------------------------------------------ menus */

  function closeMenus() {
    document.getElementById('menuRoot').innerHTML = '';
  }

  function openMenu(anchor, html, alignRight = false) {
    const root = document.getElementById('menuRoot');
    root.innerHTML = `<div class="menu">${html}</div>`;
    const menu = root.firstElementChild;
    const r = anchor.getBoundingClientRect();
    let x = alignRight ? r.right - menu.offsetWidth : r.left;
    let y = r.bottom + 6;
    x = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8));
    if (y + menu.offsetHeight > window.innerHeight - 8) y = Math.max(8, r.top - menu.offsetHeight - 6);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const input = menu.querySelector('input');
    if (input) setTimeout(() => input.focus(), 0);
  }

  function branchMenuHTML() {
    return [
      `<input class="menu-input" placeholder="Filter branches…" data-role="branch-filter">`,
      `<div class="menu-label">Local</div>`,
      branches.local.map((b) => `<button class="menu-item" data-action="menu" data-kind="checkout" data-arg="${esc(b.name)}">
        ${icon(b.current ? 'check' : 'branch')}<span>${esc(b.name)}</span>${b.current ? '<span class="mi-right">current</span>' : ''}
      </button>`).join(''),
      `<div class="menu-label">Remote</div>`,
      branches.remote.map((b) => `<button class="menu-item" data-action="menu" data-kind="checkout-remote" data-arg="${esc(b.name)}">
        ${icon('branch')}<span>${esc(b.name)}</span>
      </button>`).join(''),
      `<div class="menu-sep"></div>`,
      `<button class="menu-item" data-action="menu" data-kind="branch-create">${icon('branchPlus')}New branch and commit…</button>`,
      `<button class="menu-item" data-action="menu" data-kind="noop">${icon('history')}Show all branches</button>`,
    ].join('');
  }

  /* ------------------------------------------------------------ toast */

  function toast(kind, text, sub) {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = [
      icon(kind === 'ok' ? 'checkCircle' : kind === 'err' ? 'alert' : 'info'),
      `<span>${esc(text)}</span>`,
      sub ? `<span class="t-sub">${esc(sub)}</span>` : '',
    ].join('');
    root.appendChild(el);
    while (root.children.length > 3) root.firstElementChild.remove();
    setTimeout(() => {
      el.style.transition = 'opacity .16s, transform .16s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 180);
    }, 3400);
  }

  /* ------------------------------------------------------------ actions */

  function selectFile(path, section) {
    state.selected = path;
    if (section) state.selectedSection = section;
    state.diffPos = 1;
  }

  function afterWorkingChange() {
    if (!findFile(state.selected) && state.working.length) {
      const next = state.working[0];
      state.selected = next.path;
      state.selectedSection = next.conflicted ? 'conflicts' : hasStaged(next) ? 'staged' : 'unstaged';
    }
    const sel = findFile(state.selected);
    if (sel && !sel.conflicted) {
      if (state.selectedSection === 'staged' && !hasStaged(sel)) {
        state.selectedSection = hasUnstaged(sel) ? 'unstaged' : 'staged';
      } else if (state.selectedSection === 'unstaged' && !hasUnstaged(sel)) {
        state.selectedSection = hasStaged(sel) ? 'staged' : 'unstaged';
      } else if (state.selectedSection !== 'staged' && state.selectedSection !== 'unstaged') {
        state.selectedSection = hasStaged(sel) ? 'staged' : 'unstaged';
      }
    }
    state.diffPos = 1;
  }

  function doCommit(pushAfter) {
    const staged = stagedFiles();
    const conflicts = conflictFiles().length;
    if (conflicts) {
      toast('err', 'Resolve the conflict before committing', 'package.json has an unresolved block');
      selectFile('package.json');
      render();
      return;
    }
    if (!staged.length) {
      toast('err', 'Nothing staged', 'Use + on a file, or the left arrow on a hunk');
      return;
    }
    if (!state.message.trim()) {
      toast('err', 'Write a commit message first', 'The message becomes the commit subject');
      return;
    }
    const sha = Math.random().toString(16).slice(2, 9);
    const subject = state.message.split('\n')[0];
    const body = state.message.split('\n').slice(1).join('\n').trim();
    const totals = stagedStats();
    const entries = staged.map((f) => {
      const s = cachedDiff(f.head, f.staged).stats;
      return {
        path: f.path,
        status: displayStatus(f),
        add: s.add,
        del: s.del,
        head: f.head.slice(),
        local: f.staged.slice(),
      };
    });
    state.log = state.log.map((c) => ({ ...c, refs: (c.refs || []).filter((r) => r.label !== state.branch && r.label !== 'HEAD') }));
    state.log.unshift({
      sha,
      subject,
      body,
      author: 'Parth Patel',
      initials: 'PP',
      color: '#5b7cfa',
      time: 'just now',
      lane: 0,
      lines: [0],
      refs: [{ label: state.branch, kind: 'branch' }, { label: 'HEAD', kind: 'head' }],
      add: totals.add,
      del: totals.del,
      files: entries,
    });
    state.selectedSha = sha;
    state.commitFileKey = staged[0].path;
    const cleared = [];
    staged.forEach((f) => {
      f.head = f.staged.slice();
      f.staged = f.head.slice();
      if (sameLines(f.head, f.local)) cleared.push(f);
    });
    state.working = state.working.filter((f) => !cleared.includes(f));
    state.ahead += 1;
    state.message = '';
    state.amend = false;
    state.merging = false;
    afterWorkingChange();
    toast('ok', `Committed ${staged.length} file${staged.length === 1 ? '' : 's'} to ${state.branch}`, sha);
    render();
    if (pushAfter) setTimeout(() => doPush(true), 420);
  }

  function doPush(quiet) {
    if (state.ahead === 0) {
      if (!quiet) toast('info', 'Nothing to push', `${state.branch} is level with origin/${state.branch}`);
      render();
      return;
    }
    const n = state.ahead;
    state.ahead = 0;
    state.log = state.log.map((c) => ({ ...c, refs: (c.refs || []).filter((r) => r.label !== `origin/${state.branch}`) }));
    if (state.log[0]) state.log[0].refs = [...(state.log[0].refs || []), { label: `origin/${state.branch}`, kind: 'remote' }];
    toast('ok', `Pushed ${n} commit${n === 1 ? '' : 's'}`, `origin/${state.branch}`);
    render();
  }

  function doPull() {
    if (state.behind === 0) {
      toast('info', 'Already up to date', 'origin/main has no new commits');
      return;
    }
    const n = state.behind;
    state.behind = 0;
    toast('ok', `Pulled ${n} commit${n === 1 ? '' : 's'}`, 'Fast-forward to origin/main');
    render();
  }

  function generateMessage() {
    const drafts = [
      'feat(git): stage hunks from the split diff',
      'feat(git): show the commit graph beside its diff',
      'fix(diff): keep the hunk header in view while scrolling',
    ];
    const next = drafts[Math.floor(Math.random() * drafts.length)];
    state.message = next;
    render();
    toast('info', 'Message generated with DSH', 'Edit it before committing');
  }

  function suggestBranchName() {
    const msg = state.message.trim();
    if (!msg) {
      const files = stagedFiles();
      const stem = files.length
        ? splitPath(files[0].path).name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
        : 'changes';
      return `feat/${stem}`;
    }
    const m = msg.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);
    const type = m ? m[1] : 'feat';
    const scope = m && m[2] ? m[2] : 'git';
    const words = (m ? m[3] : msg)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .filter(Boolean)
      .slice(0, 4);
    return `${type}/${scope}-${words.join('-')}`;
  }

  function openBranchCreate() {
    state.branchCreate = { open: true, name: suggestBranchName(), base: state.branch };
    render();
  }

  function createBranchAndCommit() {
    const name = state.branchCreate.name.trim();
    if (!name) {
      toast('err', 'Name the branch', 'Use a short, lowercase name');
      return;
    }
    if (conflictFiles().length) {
      toast('err', 'Resolve the conflict first', 'A branch cannot be committed with an open conflict');
      return;
    }
    if (!stagedFiles().length) {
      toast('err', 'Nothing staged', 'Stage at least one change first');
      return;
    }
    const base = state.branch;
    state.branch = name;
    state.ahead = 0;
    state.behind = 0;
    branches.local.forEach((b) => { b.current = false; });
    branches.local.unshift({ name, current: true, tracking: null, ahead: 0, behind: 0 });
    state.branchCreate.open = false;
    toast('ok', `Created ${name}`, `Branched from ${base}`);
    doCommit(false);
  }

  function resolveConflict() {
    const f = findFile('package.json');
    if (!f) return;
    const clean = cleanDiffs['package.json'];
    Object.assign(f, {
      conflicted: false,
      status: 'M',
      conflict: undefined,
      untracked: false,
      head: clean.head.slice(),
      local: clean.local.slice(),
      staged: clean.local.slice(),
    });
    state.selectedSection = 'staged';
    state.merge = { open: false, choice: null };
    toast('ok', 'Conflict resolved', 'package.json is staged');
    render();
  }

  function applyStash() {
    const counts = stashSelected();
    const removed = Object.entries(state.stash.sel)
      .filter(([, v]) => v.on && v.hunks.length)
      .map(([p]) => p);
    state.working = state.working.filter((f) => !removed.includes(f.path));
    state.stashCount += 1;
    state.stash = { open: false, sel: {}, expanded: {}, name: '', keepIndex: false, includeUntracked: true };
    afterWorkingChange();
    toast('ok', `Stashed ${counts.files} file${counts.files === 1 ? '' : 's'} · ${counts.hunks} hunks`, `stash@{0} · on ${state.branch}`);
    render();
  }

  function stageFile(f) {
    f.staged = f.local.slice();
    state.selectedSection = 'staged';
  }

  function unstageFile(f) {
    f.staged = f.head.slice();
    state.selectedSection = 'unstaged';
  }

  function stageAll() {
    state.working.forEach((f) => {
      if (!f.conflicted) f.staged = f.local.slice();
    });
    afterWorkingChange();
    render();
  }

  function unstageAll() {
    state.working.forEach((f) => {
      if (!f.conflicted) f.staged = f.head.slice();
    });
    afterWorkingChange();
    render();
  }

  /* ------------------------------------------------------------ events */

  function onAction(el) {
    const d = el.dataset;
    switch (d.action) {
      case 'view':
        state.view = d.view;
        closeMenus();
        render();
        break;

      case 'toast':
        toast('info', d.toast);
        break;

      case 'select-file':
        selectFile(d.path, d.section);
        render();
        break;

      case 'stage-file': {
        const f = findFile(d.path);
        if (!f) return;
        stageFile(f);
        render();
        break;
      }

      case 'unstage-file': {
        const f = findFile(d.path);
        if (!f) return;
        unstageFile(f);
        render();
        break;
      }

      case 'stage-all':
        stageAll();
        break;

      case 'unstage-all':
        unstageAll();
        break;

      case 'toggle-group': {
        state.collapsed[d.group] = !state.collapsed[d.group];
        render();
        break;
      }

      case 'refresh-list':
        toast('info', 'Status refreshed');
        render();
        break;

      case 'move-hunk': {
        const f = findFile(d.path);
        if (!f) return;
        const ctx = d.ctx === 'staged' ? 'staged' : 'unstaged';
        const diff = diffFor(f, ctx);
        const blk = diff.blocks[Number(d.block)];
        if (!blk) return;
        if (d.dir === 'revert') {
          const next = f.local.slice();
          next.splice(blk.rightStart, blk.rightEnd - blk.rightStart, ...f.staged.slice(blk.leftStart, blk.leftEnd));
          f.local = next;
          if (!hasStaged(f) && !hasUnstaged(f)) state.working = state.working.filter((x) => x !== f);
        } else {
          const next = f.staged.slice();
          if (d.dir === 'stage') {
            next.splice(blk.leftStart, blk.leftEnd - blk.leftStart, ...f.local.slice(blk.rightStart, blk.rightEnd));
          } else {
            next.splice(blk.rightStart, blk.rightEnd - blk.rightStart, ...f.head.slice(blk.leftStart, blk.leftEnd));
          }
          f.staged = next;
        }
        afterWorkingChange();
        state.diffPos = 1;
        render();
        break;
      }

      case 'prev-change':
      case 'next-change': {
        const blocks = [...document.querySelectorAll('.drow.chg, .urow.chg')];
        if (!blocks.length) return;
        const delta = d.action === 'next-change' ? 1 : -1;
        state.diffPos = ((state.diffPos - 1 + delta + blocks.length) % blocks.length) + 1;
        blocks[state.diffPos - 1].scrollIntoView({ block: 'center', behavior: 'smooth' });
        break;
      }

      case 'mode-menu':
        openMenu(el, [
          `<button class="menu-item" data-action="menu" data-kind="diff-mode" data-arg="split">${icon('columns')}Side by side</button>`,
          `<button class="menu-item" data-action="menu" data-kind="diff-mode" data-arg="unified">${icon('alignLeft')}Unified</button>`,
        ].join(''));
        break;

      case 'discard-file': {
        const f = findFile(d.path);
        if (!f) return;
        state.working = state.working.filter((x) => x !== f);
        toast('info', `${f.untracked ? 'File deleted' : 'Changes discarded'}`, splitPath(f.path).name);
        afterWorkingChange();
        render();
        break;
      }

      case 'commit':
        doCommit(false);
        break;

      case 'commit-menu':
        openMenu(el, [
          `<button class="menu-item" data-action="menu" data-kind="branch-create">${icon('branchPlus')}Commit on a new branch…</button>`,
          `<div class="menu-sep"></div>`,
          `<button class="menu-item" data-action="menu" data-kind="commit-push">${icon('arrowUp')}Commit and push</button>`,
          `<button class="menu-item" data-action="menu" data-kind="commit-amend">${icon('commit')}Commit with amend</button>`,
        ].join(''), true);
        break;

      case 'branch-create-open':
        openBranchCreate();
        break;

      case 'branch-create-close':
        state.branchCreate.open = false;
        render();
        break;

      case 'branch-create-confirm':
        createBranchAndCommit();
        break;

      case 'branch-suggest':
        state.branchCreate.name = suggestBranchName();
        render();
        break;

      case 'amend':
        state.amend = el.checked;
        break;

      case 'generate-message':
        generateMessage();
        break;

      case 'branch-menu':
        openMenu(el, branchMenuHTML());
        break;

      case 'more-menu':
        openMenu(el, [
          `<div class="menu-label">Repository</div>`,
          `<button class="menu-item" data-action="menu" data-kind="stash-open">${icon('stash')}Stash changes…</button>`,
          `<button class="menu-item" data-action="menu" data-kind="fetch">${icon('refresh')}Fetch from origin</button>`,
          `<button class="menu-item" data-action="menu" data-kind="console">${icon('terminal')}Open Git console</button>`,
          `<div class="menu-sep"></div>`,
          `<button class="menu-item" data-action="menu" data-kind="noop">${icon('settings')}Repository settings…</button>`,
        ].join(''), true);
        break;

      case 'list-menu':
        openMenu(el, [
          `<button class="menu-item" data-action="menu" data-kind="noop">${icon('check')}Group by directory</button>`,
          `<button class="menu-item" data-action="menu" data-kind="noop">${icon('check')}Show ignored files</button>`,
          `<div class="menu-sep"></div>`,
          `<button class="menu-item" data-action="menu" data-kind="noop">${icon('undo')}Refresh status</button>`,
        ].join(''), true);
        break;

      case 'file-menu':
        openMenu(el, [
          `<button class="menu-item" data-action="menu" data-kind="noop">${icon('file')}Open file</button>`,
          `<button class="menu-item" data-action="menu" data-kind="noop">${icon('history')}Show file history</button>`,
          `<button class="menu-item" data-action="menu" data-kind="noop">${icon('copy')}Copy path</button>`,
          `<div class="menu-sep"></div>`,
          `<button class="menu-item danger" data-action="menu" data-kind="discard" data-arg="${esc(d.path)}">${icon('undo')}Discard changes</button>`,
        ].join(''), true);
        break;

      case 'fetch':
        toast('info', 'Fetched origin', state.behind ? `${state.behind} commit behind` : 'Everything is up to date');
        render();
        break;

      case 'pull':
        doPull();
        break;

      case 'push':
        doPush(false);
        break;

      case 'stash-open':
        closeMenus();
        initStash();
        state.stash.open = true;
        render();
        break;

      case 'stash-close':
        state.stash.open = false;
        render();
        break;

      case 'stash-toggle-file': {
        const s = state.stash.sel[d.path];
        if (!s) return;
        s.on = !s.on;
        const f = stashCandidates.find((x) => x.path === d.path);
        s.hunks = s.on ? f.hunks.map((_, i) => i) : [];
        render();
        break;
      }

      case 'stash-toggle-hunk': {
        const s = state.stash.sel[d.path];
        if (!s) return;
        const i = Number(d.hunk);
        s.hunks = s.hunks.includes(i) ? s.hunks.filter((x) => x !== i) : [...s.hunks, i];
        s.on = s.hunks.length > 0;
        render();
        break;
      }

      case 'stash-expand':
        state.stash.expanded[d.path] = !state.stash.expanded[d.path];
        render();
        break;

      case 'stash-opt':
        state.stash[d.opt] = el.checked;
        break;

      case 'stash-confirm':
        applyStash();
        break;

      case 'merge-open':
        state.merge.open = true;
        state.merge.choice = state.merge.choice || 'both';
        render();
        break;

      case 'merge-close':
        state.merge.open = false;
        render();
        break;

      case 'merge-choice':
        state.merge.choice = d.choice;
        render();
        break;

      case 'merge-resolve':
        resolveConflict();
        break;

      case 'select-commit': {
        const c = state.log.find((x) => x.sha === d.sha);
        if (!c) return;
        state.selectedSha = c.sha;
        state.commitFileKey = c.files[0] ? c.files[0].path : null;
        render();
        break;
      }

      case 'select-commit-file':
        state.commitFileKey = d.path;
        render();
        break;

      case 'menu': {
        closeMenus();
        if (d.kind === 'checkout') {
          state.branch = d.arg;
          const b = branches.local.find((x) => x.name === d.arg);
          state.ahead = b ? b.ahead : 0;
          state.behind = b ? b.behind : 0;
          toast('info', `Checked out ${d.arg}`, b && b.tracking ? `Tracking ${b.tracking}` : 'Local branch');
          render();
        } else if (d.kind === 'checkout-remote') {
          toast('info', `Checked out ${d.arg}`, 'Detached HEAD');
        } else if (d.kind === 'commit-push') {
          doCommit(true);
        } else if (d.kind === 'diff-mode') {
          state.diffMode = d.arg;
          render();
        } else if (d.kind === 'branch-create') {
          openBranchCreate();
        } else if (d.kind === 'commit-amend') {
          state.amend = true;
          toast('info', 'Amend is on', 'The next commit replaces the last one');
          render();
        } else if (d.kind === 'stash-open') {
          initStash();
          state.stash.open = true;
          render();
        } else if (d.kind === 'fetch') {
          toast('info', 'Fetched origin', state.behind ? `${state.behind} commit behind` : 'Everything is up to date');
        } else if (d.kind === 'console') {
          toast('info', 'Git console opened', 'A terminal tab would open inside the harness');
        } else if (d.kind === 'discard') {
          const f = findFile(d.arg);
          if (f) {
            state.working = state.working.filter((x) => x !== f);
            toast('info', 'Discarded', splitPath(d.arg).name);
            afterWorkingChange();
            render();
          }
        } else {
          toast('info', 'Not wired in this prototype');
        }
        break;
      }

      default:
        break;
    }
  }

  document.addEventListener('click', (e) => {
    const stop = e.target.closest('[data-stop]');
    if (!e.target.closest('#menuRoot')) closeMenus();

    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (stop && el.classList.contains('overlay')) return;
    onAction(el);
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-input="message"]')) {
      state.message = t.value;
    } else if (t.matches('[data-input="stash-name"]')) {
      state.stash.name = t.value;
    } else if (t.matches('[data-input="branch-name"]')) {
      state.branchCreate.name = t.value;
    } else if (t.matches('[data-input="file-filter"]')) {
      state.filter = t.value;
      const body = document.getElementById('listBody');
      if (body) body.innerHTML = listHTML();
    } else if (t.matches('[data-input="log-filter"]')) {
      state.logQuery = t.value;
      const scroll = document.getElementById('logScroll');
      if (scroll) scroll.innerHTML = logRowsHTML();
    } else if (t.matches('[data-role="branch-filter"]')) {
      const q = t.value.toLowerCase();
      document.querySelectorAll('#menuRoot .menu-item').forEach((item) => {
        item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('menuRoot').children.length) { closeMenus(); return; }
      if (state.merge.open) { state.merge.open = false; render(); return; }
      if (state.stash.open) { state.stash.open = false; render(); return; }
      if (state.branchCreate.open) { state.branchCreate.open = false; render(); return; }
    }
  });

  document.getElementById('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
  });

  /* ------------------------------------------------------------ boot */

  function revealFirstChange() {
    const scroll = document.querySelector('.work .diff-scroll');
    if (!scroll) return;
    const first = scroll.querySelector('.chg');
    if (!first) return;
    const top = first.offsetTop;
    if (top + first.offsetHeight > scroll.scrollTop + scroll.clientHeight - 8 || top < scroll.scrollTop) {
      scroll.scrollTop = Math.max(0, top - Math.round(scroll.clientHeight * 0.3));
    }
  }

  function render() {
    const previous = document.querySelector('.work .diff-scroll');
    const keep = previous ? previous.scrollTop : 0;
    const key = state.view === 'changes' ? `${state.selected}:${state.selectedSection}` : 'log';
    const changed = key !== state.viewKey;
    state.viewKey = key;
    document.documentElement.dataset.theme = state.theme;
    renderHead();
    if (state.view === 'changes') {
      renderChanges();
      const next = document.querySelector('.work .diff-scroll');
      if (next) {
        next.scrollTop = changed ? 0 : keep;
        if (changed) revealFirstChange();
      }
    } else {
      renderLog();
    }
    renderStatus();
    renderOverlays();
  }

  render();
})();
