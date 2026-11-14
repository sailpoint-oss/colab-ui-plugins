---
name: deploying-ui-plugins
description: Use when registering, deploying, sharing, or troubleshooting a SailPoint UI plugin with the `sail ui-plugins` CLI. Covers create, upload, push-manifest, private previews versus sharing with the tenant, platform limits, and the errors authors commonly hit. Use it whenever someone asks to ship, publish, deploy, share, or fix a plugin that doesn't show up or won't upload.
---

# Deploying SailPoint UI plugins

Every `sail ui-plugins` command runs without prompts against the CLI's active environment (`--env <name>` selects another), so an agent can run the whole lifecycle. Run `sail ui-plugins <command> --help` before relying on a flag.

## Lifecycle

1. **Validate.** `sail ui-plugins validate-manifest` checks `sp-ui-plugin.json` offline.
2. **Create privately.** Run `sail ui-plugins create --private --dry-run --json` to preview the payload, then run it without `--dry-run`. `--private` adds your identity to `restrictToUsers` on every slot, so only you can open the plugin. `create` also prints the tenant's `Content-Security-Policy` and `Permissions-Policy` as `devDocumentHeaders` for your dev server. In the Angular starter it writes them into `angular.json`; restart `npm start` if it was running.
3. **Build.** Run your project's production build (`npm run build` in the starter). Upload never builds for you.
4. **Upload.** `sail ui-plugins upload` uploads the `build.outDir` set in `sp-ui-plugin.json`. Each upload is a new, immutable bundle that goes live right away. There is no rollback command, so re-upload a previous build to roll back.
5. **Review privately.** Open `https://{tenant}/ui/plugin/{alias}` as yourself and check it before anyone else can.
6. **Share.** Once the manifest has no `restrictToUsers`, `sail ui-plugins push-manifest` removes the private restriction. Do this only after the author approves.
7. **Confirm.** `sail ui-plugins list --json` shows each instance's `state`, `activeAssetBundleId`, and `slots[].restrictToUsers`.

Use `sail ui-plugins disable` to take a plugin offline without deleting it, and `enable` to bring it back.

## Local development instead of upload

`sail ui-plugins link`, then start your dev server (`npm start` in the starter), then open the developer URL it prints (`?spPluginDev=<alias>`). You get a real handshake and token with hot reload, plus a localhost certificate and browser local-network prompts. For a demo, upload a build instead.

## Limits

- 20 plugin instances per tenant.
- Up to 1,000 files, 10 MB per file, and 100 MB per bundle.
- Allowed file types cover the usual web assets. `.mjs` is not one of them, so emit `.js`.
- The combined CSP and Permissions-Policy headers must stay under 2 KB.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `JWT validation failed: JWT is expired` on upload | The CLI's session expired. Retry once, since the CLI refreshes its token. If it fails again, sign in again with `sail env`. |
| `output directory ... contains no files to upload` | The build failed, or another build cleared `outDir` while the upload ran. Fix the build, then upload once. |
| Angular starter: `npm install` fails with `Cannot read properties of null (reading 'edgesOut')` | npm is older than the version in the starter's `package.json` `engines`. Use Node 24, which ships a new enough npm. `npm install --legacy-peer-deps` works as a stopgap. |
| Only you can see the plugin | It is still private. Run `push-manifest` from a manifest without `restrictToUsers`. |
| `create` or `list` returns 404 | The tenant may not have the UI plugin author license, or the feature is not enabled for the tenant. Ask your SailPoint admin. |
| The iframe shows `Forbidden` in Safari or a Chrome incognito window | Known issue: the browser blocks the third-party cookie that authorizes plugin assets. Use a regular Chrome or Edge window until it's fixed. |
| Blank iframe or 404s for JS and CSS after upload | Absolute asset paths. Build with relative paths. In Angular, keep `baseHref` and `deployUrl` at `./`. |
| `sail env list` keeps printing "Press Enter to continue" | The command expects a terminal. Read `~/.sailpoint/config.yaml` instead. |
