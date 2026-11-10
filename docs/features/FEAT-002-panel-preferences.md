---
id: FEAT-002
title: Panel preferences and key bindings
status: implemented
implementation_status: partial
version: 0.16.0
owners: [Parth Patel]
created: 2026-11-10
last_updated: 2026-11-10
last_verified_commit: none
---

# Panel preferences and key bindings

One sentence: the Git panel joins the harness shortcut system, and gains a Settings page where the AI model and the commit instructions can be overridden.

## 1. Snapshot

| Field | Value |
| --- | --- |
| Surface | Settings section "Git", and the built-in Keyboard shortcuts dialog |
| Actors | Developer using the harness |
| Entry point | Sidebar Settings → Git; Settings → General → Edit shortcuts, or Mod+/ |
| Primary outcome | Drive the panel from the keyboard, and make the AI message follow a chosen model and a chosen writing instruction |
| State | Host and client implemented. Four commands registered with no default binding. The model override is sent per request; nothing is written to the profile. |
| Implementation | [`../implementation.md`](../implementation.md) |

## 2. Problem and outcome

The panel had one shortcut, Mod+Enter inside the commit box, and it could not be changed. The AI message action always used the Composer model and a fixed prompt, so a developer who wanted a different model for commit messages, or a different house style, had no place to say so.

After this change the panel's actions appear in the native shortcut editor, every one unassigned until the developer records a key, and a Git settings page holds the model override and the commit instructions.

## 3. Scope

In scope:

- Registration of four commands: open or collapse the panel, stage all changes, commit staged changes, write the commit message with AI.
- A `settings.section` page with a model select and an instructions textarea.
- Host support for an explicit model and instruction on the AI message request.

Out of scope:

- Per-session preferences. One stored preference set applies to every session in the browser.
- Storing preferences in the profile. The harness profile is not touched.
- Changing the fixed reply format. The one-line `type(scope): summary` contract stays enforced.
- The existing Mod+Enter handler inside the commit textarea. It stays as an input affordance.

## 4. Terms

| Term | Meaning |
| --- | --- |
| Command | An entry in the harness shortcut catalog, registrable by any client plugin through `ctx.shortcuts.register`. |
| Bridge | The module-scope record a mounted Git tab publishes so a command can run an action that lives in React state. |
| Instruction | The prose that shapes how the model words the message. Stored in this browser. |
| Override | An explicit provider and model pair chosen in Settings, used instead of the Composer selection. |

## 5. Actors

- Developer: records bindings, chooses a model, edits the instructions.
- Git tab body: publishes the bridge while mounted.
- Host `llm` and `agentDefaultModel` services: answer the model list and the Composer selection.

## 6. User journey

1. The developer opens Settings. The new Git section sits last in the navigation, after Plugins.
2. The model select shows "Same as Composer" plus one group per provider. Choosing a pair stores it in this browser.
3. The instructions field starts with the shipped wording. Editing it stores the new text.
4. The developer opens Settings → General → Edit shortcuts (or presses Mod+/). Under the extension commands, four Git actions appear with no shortcut.
5. Recording a combination saves it through the harness, not through this plugin.
6. Pressing the combination closes the panel, or stages, commits, or writes a message, according to the row.

## 7. System context

| Direction | Party | Contract |
| --- | --- | --- |
| Client → harness | `ctx.shortcuts` | `register(command)` returns a disposer |
| Client → harness | `ctx.slots` | `settings.section` list, `settings.section.icon` list |
| Client → host | `/git-rpc` | `preferences`, `aiMessage` |
| Host → harness | `ctx.llm`, `ctx.agentDefaultModel` | `listProviders`, `listModels`, `currentSelection` |

## 8. Control flow

Command invocation:

1. The key adapter resolves the combination against the catalog and checks the region and modal.
2. `resolve` asks the bridge whether the action can run now.
3. Blocked returns a localized reason; handled returns a run closure.
4. The adapter consumes the key, then the panel runs the action.

Settings read:

1. The section mounts and calls `preferences` once.
2. The host lists providers, then models per provider. A provider that throws contributes no group.
3. The page renders the select and fills the instructions field from the shipped default.
4. A change writes to `localStorage` and notifies subscribers.

AI message request:

1. The panel reads the stored preferences at call time.
2. The request carries `model` and `instruction` only when set.
3. The host validates each, falls back to the Composer selection, and appends the fixed format rules.

## 9. Data flow

Stored value, key `dsh-git.preferences.v1`:

```json
{ "model": { "provider": "deepseek-account", "model": "deepseek-chat" }, "instruction": "Use conventional commits." }
```

`model: null` and `instruction: ""` mean "no override": the host uses `agentDefaultModel` and its shipped wording.

The request fields are optional and independent. Either can be present without the other.

## 10. Contracts

`preferences` request: `{}`. Response: `{ instruction: string, groups: [{ id, label, models: [{ id, name }] }] }`.

`aiMessage` request adds `model?: { provider: string, model: string }` and `instruction?: string`. The response is `{ message, provider, model }`, where `message` may hold a title, a blank line, and a short body.

Command definitions:

| Field | Value |
| --- | --- |
| `id` | `git.panel.toggle`, `git.stageAll`, `git.commit`, `git.writeMessage` |
| `defaults` | `{}` for all four |
| `regions` | `page`, `editable`, `terminal` |
| `modals` | empty, so no binding fires while a modal is open |
| `aliases` | English only, matching the harness rule |

## 11. Implementation map

| File | Role |
| --- | --- |
| `client.js` | Preferences store, settings section, icon, command definitions, bridge, request fields |
| `lib/ai.js` | Instruction and model resolution, `preferences` projection |
| `lib/rpc.js` | `preferences` endpoint before workspace resolution, `aiMessage` fields |

## 12. Business rules

- A command never runs an action whose state is stale: the bridge is rewritten on every render.
- A panel command is blocked while the Git tab is not the visible pane, because its result would be invisible.
- An explicit model wins over the Composer selection, including when the Composer later changes.
- An empty instruction means the shipped wording; it does not mean "no instructions".
- The reply title is not configurable: `type(scope): summary` on one line, because the log and the panel read the first line as the subject. The body below it is optional and comes from the model.

## 13. Acceptance criteria

- AC-001: Every Git command registers with no default binding, so the shortcut editor lists all four with no shortcut and records one on demand. Fails if a command disappears from the dialog or arrives preassigned.
- AC-002: With the panel closed, the assigned toggle combination opens it; with the panel open on the Git tab, the same combination collapses the column. Fails if the combination does nothing or duplicates the tab.
- AC-003: Stage all, commit, and write message are reported as blocked with a localized reason while the Git tab is closed. Fails if they run against a stale bridge or fail silently.
- AC-004: Write message and commit are blocked while nothing is staged, and commit is blocked while the message is empty. Fails if a request reaches the host that the panel's own buttons would refuse.
- AC-005: The Git settings section appears in the settings navigation and renders one select whose first option is "Same as Composer", followed by one group per provider with models.
- AC-006: With no override stored, the AI request carries no model field and the host uses the Composer selection. Fails if the request carries a null model or the host ignores `agentDefaultModel`.
- AC-007: With an override stored, the request carries that pair and the message is produced with it even when the Composer selection differs.
- AC-008: The instructions field starts with the shipped wording. An edited instruction replaces the style paragraph in the system prompt while the title format rules stay.
- AC-011: A model reply with a title, a blank line, and a body fills the message field with all three parts, and the body reaches `git commit -F -`. Fails if the body is dropped or the title keeps a trailing period.
- AC-012: A reply wrapped in a code fence, prefixed with `Commit message:`, or padded with blank lines is cleaned to the same title and body. Consecutive blank lines inside the body collapse to one.
- AC-009: Restore default empties the stored instruction and the field returns to the shipped text.
- AC-010: Preferences survive a reload and stay in this browser. A second browser profile starts with the Composer model and the shipped wording.

## 14. Security and privacy

- The override stores a provider and model identifier only, never a credential.
- Preferences are written to `localStorage` under one key and never leave the browser except as request fields to the local host.
- The host validates both fields; a malformed model is ignored rather than trusted.

## 15. Failure behavior

| Case | Behavior |
| --- | --- |
| `preferences` read fails | The page shows a read failure line. The select keeps "Same as Composer". |
| A provider refuses `listModels` | That provider contributes no group and the read still succeeds. |
| The stored model is no longer listed | The select shows the raw pair as an extra option, so the choice is visible and replaceable. |
| AI is unavailable | The existing `git/ai-unavailable` error path is unchanged. |
| The bridge is gone when the key fires | The command reports "Open the Git panel first". |
| Storage is blocked | The write is dropped; the panel uses the shipped behavior for the rest of the session. |

## 16. Accessibility

- The select and textarea have labels bound with `htmlFor` and `id`.
- Focus uses the business-primary ring, matching the harness form controls.
- Blocked commands surface their reason through the harness toast path, not a silent no-op.

## 17. Performance

- The model list is read once per settings page mount, aborted on unmount.
- The preferences store notifies only on change.
- The bridge is a plain object assignment, no subscription.

## 18. Testing

| Check | Command | Result |
| --- | --- | --- |
| Client parses | `node --check client.js` | passed |
| UI lint | `npx impeccable detect --json client.js` | `[]` |
| Locale coverage | key scan over both dictionaries | 190 keys each, no missing keys, no new duplicates |
| Host AI overrides | scratch script with a stub context | default, refusal, override, and preferences paths passed |

Unverified: the running page. The Wayland session gives no window capture, so the section's placement, the recorder row, and the select rendering were not seen.

## 19. Implementation plan

1. Host: instruction constant split from the format rules, model override validation, `preferences`.
2. Client: preferences store with the native hook shape.
3. Client: settings section and icon registration.
4. Client: bridge in the tab body, four command definitions, `ctx.inject(['shortcuts'])`.
5. Docs, version, checks.

## 20. Rollout

Ships in 0.16.0. No profile change and no migration. Existing users see no binding until they record one.

## 21. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The `settings.section` registration contract differs from `settings.general.item` | The page fails to appear | Registration mirrors the documented list shape; the slot injection is guarded by `slots.inject`, so a missing slot is inert |
| The dialog's extension group hides commands that cannot resolve | A command with no session looks dead | Blocked reasons are returned, never thrown |
| `localStorage` is per browser origin | Preferences do not follow the user across machines | Stated in the settings hint; a profile-backed store is the follow-up if needed |
| A user instruction fights the reply format | The model adds a preamble or a trailer | `cleanMessage` drops fences and labels, keeps the first non-empty line as the title, and the format rules stay in the prompt |

## 22. Open questions

- Should the instruction field also offer per-repository overrides? Not now.
- Should the model override follow the session preset? Not now.

## 23. Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.16.0 | 2026-11-10 | Four unassigned keyboard commands, a Git settings section with model override and commit instructions, host support for both request fields, and commit bodies kept alongside the title. |

## 24. Implementation status

| Item | State |
| --- | --- |
| Command registration | Done, unverified in the running dialog |
| Settings section | Done, unverified in the running page |
| Model override request path | Done, checked with a stub context |
| Instruction request path | Done, checked with a stub context |
| Live visual check | Not possible in this session |
