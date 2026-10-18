# Paseo Toolkit

[English](README.md) | [简体中文](README_zh.md)

`paseo-plugin-toolkit` combines workspace quick questions, chat display tools, and shared AI model settings. Its Paseo installation ID is `toolkit`. The chat tools are embedded from `paseo-plugin-chat-view`; that plugin does not need to run alongside Toolkit. Tunnel functionality is planned for a later migration.

## Features

| Module             | What it does                                                                            | Default                |
| ------------------ | --------------------------------------------------------------------------------------- | ---------------------- |
| Quick questions    | Workspace question library, composer popover, manual editing, history suggestions       | On                     |
| Sticky questions   | Keeps the current user question visible while scrolling                                 | On                     |
| Compact activity   | Groups reasoning and tool activity into expandable rows                                 | On                     |
| Mermaid            | Renders supported diagrams inside assistant answers                                     | On                     |
| Read-only messages | Hides the sent-message revert action in the web UI                                      | On                     |
| Prompt enhancement | Expands a short draft using project context                                             | Off                    |
| Shared models      | One host default for history summaries and prompt enhancement, with workspace overrides | Requires configuration |

## Requirements and platform support

Supported Paseo versions: **0.10.3 through 0.11.x** (`>=0.10.3 <0.12.0`). Client and daemon versions must both support the plugin APIs. The project uses SDK 0.10.3.

| Feature                            | Desktop / browser                           | iOS / Android                                                     |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Quick questions and model settings | Available                                   | Cross-platform components; physical-device QA remains needed      |
| Sticky questions                   | Available in active conversation views      | Unavailable; uses a web adapter                                   |
| Compact activity and Mermaid       | Available                                   | Cross-platform renderers; physical-device QA remains needed       |
| Read-only messages                 | Available                                   | Unavailable; uses a web adapter                                   |
| Prompt enhancement                 | Composer button, draft replacement and undo | `/enhance` and clipboard fallback; no automatic draft replacement |

For compact activity, select **Detailed** in Paseo's tool-call detail settings. Overview mode combines information before the plugin receives it, so some details cannot be recovered.

## Install and manage

### Install from GitHub

Run on the daemon machine, with Paseo plugins enabled. Git, Node.js, and npm must be available to the daemon process.

```bash
paseo plugin install github:lyhu/paseo-plugin-toolkit --ref main
paseo plugin ls
```

The installation ID is `toolkit`; check that its status is `running`. Paseo clones the repository, runs the manifest's `npm ci --omit=dev --ignore-scripts` preparation to install locked runtime dependencies, then compiles the TypeScript plugin. No manual clone or build is needed.

**The repository is currently private.** The daemon machine's Git credentials must have read access to `lyhu/paseo-plugin-toolkit`. For HTTPS access, authenticate with a Git credential helper; if using GitHub CLI, `gh auth login` followed by `gh auth setup-git` configures it. A browser login alone does not authenticate Git, and the plugin's AI API key is unrelated to repository access.

### Install from a local checkout

Use this method when developing the plugin:

```bash
git clone https://github.com/lyhu/paseo-plugin-toolkit.git
cd paseo-plugin-toolkit
npm ci
npm run typecheck
npm run lint
paseo plugin install "$PWD"
paseo plugin ls
```

The same Git access requirement applies. This registers your local directory, so source edits take effect after `paseo plugin reload toolkit`.

### Update and troubleshoot

For a GitHub installation:

```bash
paseo plugin update toolkit
paseo plugin ls
```

Review the update when prompted. `--ref main` selects the initial revision; it is not a permanent version pin. For a local checkout, use `git pull --ff-only`, run `npm ci`, then reload instead of using the managed-source update command.

```bash
paseo plugin reload toolkit
paseo plugin logs toolkit
paseo plugin disable toolkit
paseo plugin enable toolkit
```

If installation reports repository access errors, check Git authentication on the daemon machine. For preparation failures, check npm availability and `$PASEO_HOME/daemon.log`; for compilation or runtime failures, inspect `paseo plugin logs toolkit`.

Select the intended host when using multiple Paseo hosts. Plugin source, settings, questions, and credentials belong to that host. Updating or reloading this plugin does not require restarting the Paseo daemon.

## Quick questions

Click **Quick questions** above the chat composer. Search the list, send with the row's send icon, or select a question, edit it in the popover, and send. Sending is enabled when the conversation is idle.

The popover's **settings icon** opens the workspace maintenance panel. The same panel is available through Command Center.

- Add questions manually. Each question supports up to 8,000 characters.
- Use the pencil icon to edit, and the arrows to reorder.
- Use the trash icon to request deletion. Inline confirm and cancel icons appear; confirmation becomes available after two seconds.
- Click **Save changes** to persist additions, edits, reordering, and deletions. Removing a row only changes the draft until saved.

Two switches control the shortcut: the host-wide **Quick questions** switch in Toolkit feature settings, and the workspace shortcut switch in the maintenance panel. Disabling the host switch hides composer shortcuts and blocks sending through them; the maintenance panel and saved questions remain available.

### Summarize workspace history

Open **Summarize workspace history**, then start a summary. A configured model is required; missing configuration is highlighted.

1. Find accessible conversations in the current workspace, including archived conversations.
2. Select the latest **50 user questions**, ordered by user-message time across those conversations. This means messages, not 50 conversations. Change and save the positive integer limit in this section for each workspace.
3. Send batches of questions and nearby assistant context to the configured model. Merge batch results into at most **20 candidates** and sort by estimated frequency, with repeated intents first.
4. Edit candidate rows, select the top N or individual rows, and add them to the question library. The plus icon adds one row; the minus icon removes it from this summary's candidates. The source icon reveals up to three source references and lets you open the original conversation.
5. Save changes to persist the added questions. Existing saved questions are kept; exact duplicate text is skipped.

The collapsible **Summary prompt** lives inside this section. Edit and save it per workspace. The restore icon restores the default text; save it before the next summary. The plugin still enforces the JSON output contract and valid source references.

Progress includes history reads, question counts, batches, merge rounds, unreadable conversations, and the latest 100 timestamped events. You can cancel or retry. Invalid model output triggers one automatic format retry for that batch or merge request. Manual retry rereads history and generates a new candidate set.

Frequency is an estimate, not an exact global count: semantic grouping is model-dependent, and local batch top-20 filtering can discard low-frequency questions. Deleted or unrecoverable conversations cannot contribute. The conversation list is captured when the task starts. Summary jobs and candidates are held in memory and disappear on plugin reload or daemon restart; saved questions remain.

## Shared AI models

Open **Settings → Plugins → toolkit → Toolkit models**, or expand **Model settings** in the quick-question panel.

Configure a host default once. History summaries and prompt enhancement share it across workspaces on that host. A workspace can use its own override, or restore inheritance from the host default. Credentials are not shared between different hosts.

Enter an OpenAI-compatible Chat Completions base URL, model name, and optional API key. You can fetch the model list using the URL and key, search and select a model, or enter its name manually. **Test connection** checks the connection and JSON output. Summaries require `response_format: json_object` support.

A blank key field preserves a saved key. Use the explicit clear-key action to remove it. The client receives configuration metadata and whether a key exists, never the saved key itself.

## Embedded chat-view tools

### Sticky questions

The current user question stays visible above the composer while scrolling. Long questions collapse to three lines and can be expanded or copied. This feature depends on the active web conversation's composer and viewport; archived views without that composer do not receive the overlay.

### Compact activity

Reasoning and tool calls appear in expandable activity groups. Choose Folded or Detailed display and Vivid, Soft, or High contrast colors in feature settings. Supported details include tool output, diffs, search results, and subagent activity. Disabling the feature restores the host rendering.

### Mermaid diagrams

Supported Mermaid blocks render as interactive diagrams, with fit, zoom from 25% to 400%, source view, and fullscreen controls. Supported syntax includes `flowchart` / `graph`, top-level subgraphs, and `sequenceDiagram`. Unsupported syntax, including nested subgraphs and styling directives such as `classDef`, falls back to source or error presentation.

Only answers containing Mermaid blocks use the plugin's lightweight Markdown renderer. Those answers do not have the host's native copy/fork controls; ordinary answers retain their normal rendering.

### Read-only sent messages

On web and desktop, hides the sent-message revert action to reduce accidental edits to conversation history. This is a UI guard, not a server-side permission rule.

### Prompt enhancement

Enable enhancement in feature settings, configure the shared model, then use **Enhance** above the composer or `/enhance`. A short draft can be expanded into a request with a goal, scope, constraints, and acceptance criteria. Successful web enhancement replaces the draft; the button can restore the original. Review the result before sending.

Inputs longer than 200 characters, very short inputs, or already structured requests may remain unchanged. Model errors preserve the original draft. Project context includes metadata, manifests/scripts, Git information, and limited excerpts of project instructions and documentation such as README, AGENTS, CLAUDE, and CONTRIBUTING. The model receives no tools. Native clients use the slash command and clipboard fallback because draft replacement is not available there.

## Feature settings and language

The Toolkit **Settings** page contains individual switches for quick questions and each embedded chat tool. It also contains compact-activity appearance and language preferences.

Choose **简体中文**, **English**, or **Auto**. Chinese is the default. Auto follows the browser language; native environments without browser language detection fall back to Chinese. Open panels, composer labels, model forms, summary progress, errors, and action tooltips follow the selected UI language. Other clients on the same host receive settings through polling.

Your question text, conversation content, summary prompt, model names, and generated content are kept as entered or returned. Changing the UI language does not translate them or force a model output language.

## Data and model requests

With the default Paseo home, files are stored at:

| Location                                                  | Content                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `~/.paseo/toolkit/models.json`                            | Host default model, workspace overrides, and API credentials |
| `~/.paseo/toolkit/quick-questions/<workspace-hash>.json`  | Saved questions, history limit, and summary prompt           |
| `~/.paseo/plugin-settings/toolkit/chat-view-display.json` | Feature switches, language, and display preferences          |

`PASEO_HOME` overrides the home directory. Workspace keys use the workspace ID, not its filesystem path. Question and model files use mode `0600`. Concurrent saves use revision checks; a conflict keeps your local draft so you can copy changes before loading the latest version.

History summaries run only when requested. They send selected user questions and necessary nearby assistant text to your configured model endpoint; tool output, reasoning, and attachment bodies are not separately loaded as summary sources. Enhancement sends the draft and project context described above. Both features call the configured service from the daemon, without granting model tools.

## Migration and plugin overlap

On first load, Toolkit imports old chat-view display preferences if Toolkit settings do not yet exist. For the initial shared model, it prefers an existing chat-view enhancement configuration, otherwise an existing summary configuration. Different workspace summary models are retained as workspace overrides; matching models inherit the host default. Existing Toolkit configuration is not overwritten.

Old source and configuration files are retained. Validate Toolkit, then disable the old `chat-view` plugin to avoid duplicate buttons and timeline transformations. Avoid enabling overlapping compact-activity, reasoning-display, or Mermaid transformers from other plugins at the same time. The separate `paseo-plugin-tunnel` has not been migrated and remains independent.

## Architecture and development

```text
index.client.tsx       Client registration and cleanup
index.server.ts        Server registration and cleanup
client/
  quick-questions/     Library, candidates, popover and progress
  models/              Shared model settings UI
  chat-view/           Embedded chat display and enhancement UI
server/
  quick-questions/     History, summary jobs and persistence
  models/              Model registry and endpoint probes
  chat-view/           Enhancement and project context
shared/                RPC contracts, schemas and translations
```

Keep client, server, and shared runtime boundaries. Modules are composed explicitly at the entries. Future tunnel migration should use its own module directories rather than reuse chat-view names.

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test -- run shared/i18n.test.ts --bail=1
npm run test -- run server/quick-questions/jobs.test.ts --bail=1
```

Run the specific tests relevant to a change. Compiler registration tests accept `PASEO_SOURCE_DIR` pointing to a local Paseo checkout. Model-interface tests use local HTTP fixtures; a passing fixture test does not verify your real endpoint.

## Credits and licenses

The embedded chat tools retain the original notices in [LICENSE.chat-view](LICENSE.chat-view), [LICENSE.compact-agent-activity](LICENSE.compact-agent-activity), and [LICENSE.mermaid](LICENSE.mermaid). These cover the migrated chat-view code and its incorporated compact-activity and Mermaid components.
