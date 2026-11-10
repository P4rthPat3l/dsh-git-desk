# dsh-git-desk

- The profile installs this directory as a symlink (`~/.dsh/profiles/web/node_modules/dsh-git-desk`). Whether an edit to `client.js` shows without reinstalling has not been verified.
- There is no DESIGN.md. The design system is the Harness one. Use only `--dsw-*` and `--dsh-*` tokens. The token values and the primitive component CSS ship inside `/opt/DSH NEXT/resources/app.asar` (`dsh-client-ui-theme/lib/client.js`, `dsh-client-ui-primitives/lib/*.module.css`, `dsh-web-frontend/dist/assets/index-*.css`). Extract them with `npx @electron/asar extract-file` to check a value.
- Native conventions copied from those primitives: body 13px/20px, meta 12px/18px, secondary text `--dsw-alias-label-tertiary`, radius sm 8 / md 12 / xl 20, hairline outlines through `inset box-shadow` with `--dsh-hairline-width`, focus ring `--dsw-alias-state-business-primary`, primary button `--dsw-alias-button-primary-fill` (neutral, not blue).
- The plugin must not import `@deepseek-ai/dsh-client-ui-primitives`. It reproduces their styles in the `CSS` string inside `client.js`.
- Every visible string goes through `t()` with both `EN` and `ZH` entries in `client.js`.
