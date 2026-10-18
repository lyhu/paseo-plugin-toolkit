# Paseo Toolkit

[English](README.md) | [简体中文](README_zh.md)

`paseo-plugin-toolkit` provides a curated workspace quick-question library, rich conversation display enhancements, and unified AI model configuration for Paseo. The plugin installation ID is `toolkit`.

## Features

| Module             | What it does                                                                             | Default                |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------- |
| Quick questions    | Workspace question library, composer popover, manual editing, and AI history suggestions | On                     |
| Sticky questions   | Keeps the active user question visible above the composer while scrolling                | On                     |
| Compact activity   | Groups model reasoning and tool execution steps into clean, expandable rows              | Off                    |
| Mermaid            | Renders supported diagram code blocks as interactive diagrams in assistant responses     | Off                    |
| Read-only messages | Hides sent-message revert actions in the web UI to avoid accidental branch overwrites    | On                     |
| Prompt enhancement | Expands brief user drafts into structured prompts using project context                  | Off                    |
| Shared models      | Configures host-default and workspace-override models for summaries and enhancement      | Requires configuration |

## Requirements and Platform Support

Supported Paseo versions: **0.10.3 through 0.11.x** (`>=0.10.3 <0.12.0`). Both client and daemon environments must support the plugin APIs. Built against Paseo SDK 0.10.3.

| Feature                            | Desktop / Browser                           | iOS / Android                                                     |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Quick questions and model settings | Available                                   | Cross-platform components; physical-device verification suggested |
| Sticky questions                   | Available in active conversation views      | Unavailable (relies on web viewport adapter)                      |
| Compact activity and Mermaid       | Available                                   | Cross-platform renderers; physical-device verification suggested  |
| Read-only messages                 | Available                                   | Unavailable (relies on web viewport adapter)                      |
| Prompt enhancement                 | Composer button, draft replacement and undo | `/enhance` slash command and clipboard fallback                   |

> **Tip**: When using Compact Activity, set tool-call detail to **Detailed** in Paseo settings. Overview mode merges information before plugins receive it, preventing detailed inspection.

## Install and Manage

### Install from GitHub

Run on the daemon host with Paseo plugins enabled (ensure Git, Node.js, and npm are available in the daemon environment):

```bash
paseo plugin install github:lyhu/paseo-plugin-toolkit --ref main
paseo plugin ls
```

The installation ID is `toolkit`; verify that its status is `running`. Paseo automatically clones the repository, runs dependency preparation (`npm ci --omit=dev --ignore-scripts`), and compiles the TypeScript plugin.

### Install from a Local Checkout

Ideal for local plugin development and debugging:

```bash
git clone https://github.com/lyhu/paseo-plugin-toolkit.git
cd paseo-plugin-toolkit
npm ci
npm run typecheck
npm run lint
paseo plugin install "$PWD"
paseo plugin ls
```

This registers the local directory. Edits to the source code take effect upon running `paseo plugin reload toolkit`.

### Update and Troubleshoot

For GitHub installations:

```bash
paseo plugin update toolkit
paseo plugin ls
```

For local checkouts: run `git pull --ff-only` and `npm ci`, then reload:

```bash
paseo plugin reload toolkit
paseo plugin logs toolkit
paseo plugin disable toolkit
paseo plugin enable toolkit
```

**Troubleshooting Tips**:

- **Repository Access**: Verify network connectivity, Git credentials, or proxy settings on the daemon host.
- **Dependency Preparation**: Check npm availability and review `$PASEO_HOME/daemon.log`.
- **Runtime Errors**: Inspect plugin runtime logs with `paseo plugin logs toolkit`.
- **Multi-host Environments**: Select the target host when managing multiple Paseo hosts. Source code, settings, question libraries, and credentials are kept isolated per host.

## Quick Questions

Click the **Quick questions** button above the chat composer to open the popover:

- Real-time search across the workspace question library.
- Click the row's send icon to send immediately, or select a question to edit and refine it in the composer popover before sending.
- Sending is allowed only when the conversation is idle.
- While composing a new agent, the same button appears beside **Import session** above the draft composer. Selecting a question fills the draft, where you can edit it before sending. This draft entry requires Paseo 0.12 or later. Filling the draft requires the web or desktop app.

Click the **settings icon** in the top-right corner of the popover (or navigate via Command Center) to open the workspace maintenance panel:

- **Add Questions**: Create frequently used prompts or templates (up to 8,000 characters per item).
- **Edit & Reorder**: Edit content with the pencil icon and reorder with arrow controls.
- **Accidental Deletion Protection**: Clicking delete triggers a confirmation prompt with a 2-second countdown.
- **Explicit Persistence**: Additions, edits, reordering, and deletions are saved to disk only when clicking **Save changes**.

> Quick questions access is governed by two independent switches: a global host-level switch in Toolkit Settings and a workspace-level switch in the maintenance panel.

### Intelligent Workspace History Summaries

Expand **Summarize workspace history** in the maintenance panel:

1. **Conversation Scan**: Reads accessible conversation history in the current workspace (including archived sessions).
2. **Sample Extraction**: Extracts the most recent **user question samples** in reverse chronological order (default: 50 messages, configurable per workspace).
3. **AI Clustering & Synthesis**: Sends batched questions with relevant context to the configured AI model, grouping them into up to **20 high-frequency candidate questions** with repeated intents prioritized.
4. **Review & Adoption**: Inspect up to 3 original source references per candidate with direct navigation; refine individual items, adopt candidates in bulk, or discard unwanted rows.
5. **Merge into Library**: Click save to merge accepted candidates into the question library, automatically skipping exact duplicates.

Users can also customize the **Summary prompt** per workspace in the collapsible prompt section to steer model synthesis priorities.

## Shared AI Models

Navigate to **Settings → Plugins → toolkit → Toolkit models**, or expand **Model settings** in the quick questions panel.

- **Multi-level Hierarchy**: Configure a host-wide default model shared across workspaces, summaries, and prompt enhancement. Individual workspaces can override the host default when needed.
- **OpenAI-Compatible Protocol**: Connect any standard OpenAI Chat Completions endpoint. Supports automatic model list fetching and connectivity validation.
- **Security & Privacy**: API credentials are saved exclusively on the daemon host. The UI only receives configuration metadata and credential existence indicators—never raw keys.

## Conversation Experience & Display

### Sticky Questions

While scrolling through long conversation threads, the active user question stays pinned above the composer. Long inputs automatically collapse to 3 lines, with options to expand full text or copy with one click.

### Compact Activity

Condenses model reasoning (Thinking) and verbose tool executions into organized, expandable activity blocks.

- Toggle between Folded and Detailed display modes in feature settings.
- Choose between Vivid, Soft, and High Contrast visual themes.
- Expand activity items to inspect tool parameters, unified diffs, search output, and subagent call traces.

### Mermaid Interactive Diagrams

Renders Mermaid code blocks in assistant responses as interactive SVG diagrams:

- Pan and zoom (25% to 400%), fit-to-view, source code view, and full-screen modes.
- Supports `flowchart` / `graph`, `sequenceDiagram`, and top-level subgraphs.

### Read-Only Sent Messages

Hides the revert/rollback action on sent user messages in web and desktop clients, preventing accidental clicks from breaking conversation branches.

### Prompt Enhancement

Click **Enhance** above the composer or trigger `/enhance`:

- Analyzes current project metadata, manifests, Git status, and key repository guidance documents (e.g., README, AGENTS, CLAUDE, CONTRIBUTING excerpts).
- Expands short or ambiguous drafts into clear, structured prompts with explicit objectives, scope, technical constraints, and acceptance criteria.
- Automatically replaces the draft upon success, with a one-click restore option to revert to the original text.

## Settings and Internationalization

Toolkit **Settings** provides granular control over individual features and display options:

- **Feature Toggles**: Quick questions, sticky questions, compact activity, Mermaid diagrams, read-only protection, and prompt enhancement can be toggled independently.
- **Multi-language Support**: Supports **简体中文**, **English**, and **Auto** (browser language detection). Panels, dialogs, progress bars, and alerts switch instantly.
- **Content Integrity**: UI language switching only affects interface labels. User question text, conversation content, and model outputs are preserved in their original languages.

## Data Storage and Privacy

Data is managed centrally under the host `PASEO_HOME` directory:

| Path                                                      | Content                                                  |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `~/.paseo/toolkit/models.json`                            | Host default model, workspace overrides, and credentials |
| `~/.paseo/toolkit/quick-questions/<workspace-hash>.json`  | Workspace question library, limits, and summary prompt   |
| `~/.paseo/plugin-settings/toolkit/chat-view-display.json` | Feature switches, language, and display preferences      |

- **Permission Hardening**: Sensitive configuration files (models, credentials, question libraries) are created with restrictive `0600` file permissions.
- **Zero Third-party Intermediaries**: Summaries and prompt enhancement run only on explicit user action. Requests are dispatched directly from the daemon host to your configured endpoint without external telemetry or intermediate relay services.

## Compatibility

If your environment includes other plugins that modify the Paseo conversation timeline (e.g., third-party compact activity or Mermaid formatters), disable overlapping toggles in settings to prevent conflicting view transformations.

## Architecture and Development

```text
index.client.tsx       Client entry point and lifecycle registration
index.server.ts        Server entry point and lifecycle registration
client/
  quick-questions/     Quick questions UI, candidate management, and progress views
  models/              Shared model configuration UI
  chat-view/           Conversation display & enhancement components
server/
  quick-questions/     History readers, summary job orchestrators, and persistence
  models/              Model storage repository and endpoint probes
  chat-view/           Prompt enhancement service and context extractors
shared/                RPC contracts, validation schemas, and i18n dictionaries
```

### Verification and Testing

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test -- run shared/i18n.test.ts --bail=1
npm run test -- run server/quick-questions/jobs.test.ts --bail=1
```

## Licenses

This project incorporates and references components under the following license notices:

- [LICENSE.chat-view](LICENSE.chat-view)
- [LICENSE.compact-agent-activity](LICENSE.compact-agent-activity)
- [LICENSE.mermaid](LICENSE.mermaid)
