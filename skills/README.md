# Agent Skills for UI Plugins

Agent skills that teach an AI coding assistant how to build, ship, and check a SailPoint Identity Security UI plugin. They are written for any framework. Notes that only apply to the Angular starter from [sailpoint-oss/ui-plugin-templates](https://github.com/sailpoint-oss/ui-plugin-templates) are labeled as such.

| Skill | Use it to |
|---|---|
| [building-ui-plugins](building-ui-plugins/SKILL.md) | Write plugin code that works inside the sandbox: CSP limits, `sp-ui-plugin.json`, the SDK, ISC API calls, routing, and theming. |
| [deploying-ui-plugins](deploying-ui-plugins/SKILL.md) | Create, upload, share, and troubleshoot a plugin with `sail ui-plugins`. |
| [verifying-ui-plugins](verifying-ui-plugins/SKILL.md) | Check a plugin with unit tests, a production build, and a pass in a real tenant. |
| [finding-isc-apis](finding-isc-apis/SKILL.md) | Find the right ISC API, its schemas, and its scopes before writing the call. |
| [adopting-theme-sync](adopting-theme-sync/SKILL.md) | Update an existing plugin to the SDK's built-in light and dark theme sync, and fix plugins that look wrong in one mode. |

Each skill is a folder with a `SKILL.md`. The `description` in its frontmatter tells the agent when to load it. Keep each folder whole: `building-ui-plugins` reads `references/isc-endpoints.md`.

## Using the Skills

Claude Code and Cursor load skills from `.claude/skills/` in your project. Copy the folders you want there:

```bash
mkdir -p .claude/skills
for skill in building-ui-plugins deploying-ui-plugins verifying-ui-plugins finding-isc-apis adopting-theme-sync; do
  cp -R "path/to/colab-ui-plugins/skills/$skill" .claude/skills/
done
```

Any other agent can read the `SKILL.md` files as plain Markdown. Point it at the file, or paste the contents into its context.

If your project already has these skills under `.claude/skills/`, you don't need this copy.
