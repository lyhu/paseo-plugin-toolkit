# Paseo Toolkit

[English](README.md) | [简体中文](README_zh.md) | [Product PRD (zh)](docs/product/prd.md) | [Docs Center](docs/README.md) | [Glossary](GLOSSARY.md)

`paseo-plugin-toolkit` provides a cross-Host workbench, personal AI sessions, a workspace quick-question library, conversation display tools, and shared AI model configuration for Paseo. The plugin installation ID is `toolkit`.

## Features

| Module             | What it does                                                                                  | Default                |
| ------------------ | --------------------------------------------------------------------------------------------- | ---------------------- |
| Workbench          | Project and Host views, personal AI, memory, skills, history search, and display organization | Off                    |
| Quick questions    | Workspace question library, composer popover, manual editing, and AI history suggestions      | On                     |
| Sticky questions   | Keeps the active user question visible above the composer while scrolling                     | On                     |
| Compact activity   | Groups model reasoning and tool execution steps into clean, expandable rows                   | Off                    |
| Mermaid            | Renders supported diagram code blocks as interactive diagrams in assistant responses          | Off                    |
| Read-only messages | Hides sent-message revert actions in the web UI to avoid accidental branch overwrites         | On                     |
| Prompt enhancement | Expands brief user drafts into structured prompts using project context                       | Off                    |
| Shared models      | Configures host-default and workspace-override models for summaries and enhancement           | Requires configuration |

## Requirements and Platform Support

Supported Paseo versions: **0.13.x** (`>=0.13.0 <0.14.0`). Update both client and daemon. Built against Paseo SDK 0.13.0.

| Feature                            | Desktop / Browser                                          | iOS / Android                                                                    |
| ---------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Workbench                          | Browser runtime verified; uses native workspace navigation | React Native component tests; simulator and physical-device verification pending |
| Quick questions and model settings | Available                                                  | Cross-platform components; physical-device verification suggested                |
| Sticky questions                   | Available in active conversation views                     | Unavailable (relies on web viewport adapter)                                     |
| Compact activity and Mermaid       | Available                                                  | Cross-platform renderers; physical-device verification suggested                 |
| Read-only messages                 | Available                                                  | Unavailable (relies on web viewport adapter)                                     |
| Prompt enhancement                 | Composer button, draft replacement and undo                | `/enhance` slash command and clipboard fallback                                  |

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

## Workbench

Enable **Workbench** under **Settings → Plugins → toolkit → Settings**, then open Workbench from the sidebar. Hosts are in Global Overview; skills and memory are managed in Knowledge & Action’s right panel. Connect all devices to one stable configuration Host; it owns display organization and preferences. Project and Host views use the same catalog. Clicking a workspace opens Paseo's native workspace, retaining its **Agent and Terminal tabs**. Knowledge & Action opens the native workspace and conversations.

Workbench is off by default. Enable it on the configuration Host only; the same switch controls its screen, group navigation, and themes. The search workbench owns group names, membership, and ordering. Drag custom group tabs to reorder them; **All projects** stays first and cannot be dragged. Use the drag handle on a project card to reorder projects within a group. Editing a group preserves its position.

The sidebar has direct **Workbench view / Native view** buttons. Workbench view lists every custom group as a root folder, with its associated projects and workspaces beneath it in the saved order; **All projects** is not another root folder. Repeated projects can appear in multiple groups and expand independently. Native view restores Paseo's original project tree. There is no dropdown or separate sidebar organization editor. Project rows reveal native-style plus and More controls on hover. Plus opens native workspace creation; More reuses the original settings, new-window, file-manager and removal menu as supported by the host, including native confirmation and Host scope. The selected view is a device preference; group contents and order persist on the configuration Host. Existing project associations are retained, and legacy organization data is not deleted. Workspace navigation continues to use Paseo's native tabs. Global Overview shows Host-native project membership independently of display groups.

Each search-workbench card represents one native project on one Host and contains its native workspaces. Legacy merged display references expand into separate native projects, including the owners of workspaces previously moved into a display group. The sidebar defaults to **group → project → workspace**. A group's More menu offers **Show workspaces only** to hide its project level. This setting persists with the group and does not change resource ownership.

Cards list all workspaces directly, with a copyable truncated path, project actions at the top right and a More menu on each workspace. Desktop and browser menus reuse native actions, including their Host scope, settings and removal confirmation; the project menu also offers workspace creation and group/scenario controls. Drag the six-dot title handle to reorder projects within a group. Card action menus are not yet available on native iOS/Android; use native navigation there.

Reopening the workbench restores the last group, search text and scope, Host/scenario filters, filter-panel visibility and Host grid/list selection, saved separately for each device and configuration Host. A/B/C layout remains a device preference. Deleted groups fall back to All after the configuration loads.

Global Overview separates project names, copyable paths and branches from indented workspace rows; long names stay on one line with ellipses. Each Host initially shows its five most recently active native projects. More shows the remaining count and reveals five more at a time; grid and list share the expanded count. Project activity is the latest workspace user-message timestamp, falling back per workspace to native activity or creation time. Projects without activity retain their original order at the end.

Choose the four Workbench palettes in Paseo's official **Settings → Appearance** theme picker. Theme changes apply through Paseo, and the screen follows the active theme. The plugin also provides compact layouts; mobile behavior is covered by React Native component tests, not a booted simulator or physical-device acceptance test.

### Personal AI, memory, and skills

Knowledge & Action is pinned above groups in Workbench view. Opening it creates or reuses the native workspace under `$PASEO_HOME/workbench`, preserving existing conversations. The native header’s Skills and memory button opens the Knowledge context panel in the right Explorer, with skills, memory, reference-project selection and creation plans. Compact clients can access it through the native side panel. On desktop/web, View content opens the real SKILL.md in a native Markdown tab in the main pane while retaining the context panel; repeated opens reuse the native file tab. Native conversations keep Paseo’s model selection, composer, tool calls and permissions.

The pinned entry cannot be reordered or removed in Workbench. The system project is omitted from custom group navigation. Plugins cannot veto removal from other native surfaces; a missing workspace keeps its saved identity and reports a recovery error rather than silently creating a replacement. Ordinary conversations remain manageable in the native UI.

Personal memory records support editing, confirmation, enable/disable, and deletion. Only confirmed, enabled records matching the context scope are included. Personal AI receives the personal scope, with a bounded context budget. Records are reference material with provenance, not execution authorization. History indexing and memory are separate: indexing does not automatically turn conversations into memory.

Skills are real `SKILL.md` files. Enabled skills live in `.agents/skills`; disabled skills move outside that discovery directory and are excluded from personal AI tool context. Native sessions created in the reserved directory also receive Workbench tools, enabled skills and confirmed scoped memory within a budget. The reference project never changes the execution directory. Existing sessions may retain previously loaded content: start a new session after changing skills. Plugin reload or restart expires existing Workbench tool connections; create a new personal AI session afterward.

### Confirmed creation and history search

Creating a project, workspace, or session first saves an editable plan with its target Host, directory or workspace, Provider/model, and prompt. **Confirm and execute** performs the real SDK operation. AI tools can prepare plans and read their results; they cannot execute them. Completed, failed, partial, cancelled, and unknown outcomes remain distinct, and handled plans cannot run twice. Partial results preserve known resource identities. Unknown outcomes require checking the target before preparing another request.

A local new project can create its final directory if the parent already exists. A remote target must already contain the selected directory; the plugin does not create it on the configuration Host. Remote operations use the target Host's SDK connection.

History search covers explicitly indexed sessions and shows coverage and errors. It reads user and assistant text, excludes tool output, and preserves the previous complete index if cancellation, missing pages, or limits interrupt indexing. A session is limited to 10,000 text entries and 16 million characters per indexing run. Search results identify the source Host, workspace, and session. Unindexed or failed sessions are not presented as fully searched.

## Quick Questions

Click the **Quick questions** button above the chat composer to open the popover:

- Real-time search across the workspace question library.
- Click the row's send icon to send immediately, or select a question to edit and refine it in the composer popover before sending.
- Sending is allowed only when the conversation is idle.
- While composing a new agent, the same button appears beside **Import session** above the draft composer. Selecting a question fills the draft, where you can edit it before sending. Draft filling requires the web or desktop app.

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

- **Feature Toggles**: Workbench, quick questions, sticky questions, compact activity, Mermaid diagrams, read-only protection, and prompt enhancement can be toggled independently.
- **Multi-language Support**: Supports **简体中文**, **English**, and **Auto** (browser language detection). Panels, dialogs, progress bars, and alerts switch instantly.
- **Content Integrity**: UI language switching only affects interface labels. User question text, conversation content, and model outputs are preserved in their original languages.

## Data Storage and Privacy

Data is managed centrally under the host `PASEO_HOME` directory:

| Path                                                      | Content                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `~/.paseo/toolkit/project-tree.json`                      | Display tree, snapshots, and undo history                                           |
| `~/.paseo/toolkit/workbench/`                             | Preferences, memory, personal AI identity, creation plans, and history index shards |
| `~/.paseo/workbench/`                                     | Personal AI workspace and enabled/disabled skill files                              |
| `~/.paseo/toolkit/models.json`                            | Host default model, workspace overrides, and credentials                            |
| `~/.paseo/toolkit/quick-questions/<workspace-hash>.json`  | Workspace question library, limits, and summary prompt                              |
| `~/.paseo/plugin-settings/toolkit/chat-view-display.json` | Feature switches, language, and display preferences                                 |

- **Permission Hardening**: Sensitive configuration files (models, credentials, question libraries) are created with restrictive `0600` file permissions.
- **Zero Third-party Intermediaries**: Summaries and prompt enhancement run only on explicit user action. Requests are dispatched directly from the daemon host to your configured endpoint without external telemetry or intermediate relay services.

## Compatibility

If your environment includes other plugins that modify the Paseo conversation timeline (e.g., third-party compact activity or Mermaid formatters), disable overlapping toggles in settings to prevent conflicting view transformations.

## Architecture and Development

```text
index.client.tsx       Client entry point and lifecycle registration
index.server.ts        Server entry point and lifecycle registration
client/
  project-tree/        Group-driven sidebar projection, native view integration & device cache
  quick-questions/     Quick questions UI, candidate management, and progress views
  models/              Shared model configuration UI
  chat-view/           Conversation display & enhancement components
  agent-directory.ts   Shared agent directory and session discovery
server/
  project-tree/        Workbench RPC handlers and persistence services
  quick-questions/     History readers, summary job orchestrators, and persistence
  models/              Model storage repository and endpoint probes
  chat-view/           Prompt enhancement service and context extractors
  storage/             Revisioned atomic JSON storage layer
shared/
  project-tree/        Workbench data model, pure action reducers & RPC contracts
  quick-questions/     Quick questions RPC contracts & summary prompt templates
  models/              Model definitions and contracts
  chat-view/           Display enhancement settings, Mermaid parsers & activity stream transformers
  i18n.ts              Internationalization dictionaries and formatters
```

### Verification and Testing

```bash
# Type checking
npm run typecheck

# Code quality & formatting check
npm run lint
npm run format:check

# Automated unit tests
npm run test -- run
```

## Licenses

This project incorporates and references components under the following license notices:

- [LICENSE.chat-view](LICENSE.chat-view)
- [LICENSE.compact-agent-activity](LICENSE.compact-agent-activity)
- [LICENSE.mermaid](LICENSE.mermaid)
