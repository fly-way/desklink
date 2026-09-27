# DeskLink

> A Windows MCP gateway that securely connects ChatGPT to local tools and professional desktop applications.

DeskLink is a lightweight Electron app for Windows. It exposes local MCP providers to ChatGPT through the official OpenAI **Secure MCP Tunnel**, without opening a public inbound port.

Today DeskLink ships with two built-in providers:

- **Desktop Commander** for files, shells, processes, Git, and general computer automation.
- **Unity MCP** for structured Unity Editor operations such as scenes, GameObjects, components, prefabs, materials, Console, and Play Mode.

中文文档: [README.zh-CN.md](README.zh-CN.md)

## Features

- **Multi-provider MCP gateway** — aggregates tools and resources from multiple local MCP providers behind one DeskLink endpoint.
- **Zero-config Desktop Commander** — provisions a Node.js runtime and installs `@wonderwhy-er/desktop-commander` into DeskLink's private data directory.
- **Unity Editor integration** — detects running Unity projects and can install and manage the pinned `MCP for Unity` integration per project.
- **Provider lifecycle management** — Unity projects support **Auto**, **Manual**, and **Disabled** modes.
- **Dynamic capability routing** — tools appear only when their provider is ready; provider failures are isolated from other providers.
- **Context-aware Unity exposure** — high-frequency Unity tools stay visible while optional capability groups use **On / Ask / Off** exposure to reduce the model's tool-schema context.
- **Official OpenAI tunnel** — uses OpenAI `tunnel-client`; only an outbound connection is required.
- **Schema-preserving MCP routing** — exposed tools keep their upstream schemas while DeskLink forwards `tools/call`, `resources/list`, and `resources/read`.
- **Modern + legacy MCP support** — serves the modern `2026-07-28` request envelope and legacy stateless `initialize` clients.
- **Control-plane-aware health** — "Ready" means a real OpenAI control-plane poll succeeded, not merely that the local daemon is alive.
- **Secure credentials** — Runtime API Keys are sealed with **Windows DPAPI** and never stored in plaintext.
- **Verified runtime downloads** — downloaded tunnel/uv runtime components are checksum-verified when metadata is available.
- **Desktop UX** — tray mode, single-instance behavior, background notifications, Unity setup confirmation, and taskbar attention when action is required.
- **Consistent Windows icon** — packaged builds use the same Electron application icon shown during `npm run dev`.

## Architecture

```text
 ChatGPT
    │
    │ OpenAI Secure MCP Tunnel
    ▼
 tunnel-client
    │ loopback
    ▼
 DeskLink MCP Gateway
    ├── Desktop Commander Provider ──stdio──► Desktop Commander
    └── Unity Provider ──────────────stdio──► MCP for Unity Server
                                                │
                                                ▼
                                           Unity Editor
```

Local endpoints:

- MCP: `127.0.0.1:47933/mcp`
- Health / operator surface: `127.0.0.1:47934`

DeskLink binds local endpoints to loopback only.

## Built-in providers

| Provider | Typical capabilities | Default behavior |
|---|---|---|
| Desktop Commander | Files, code editing, shell, Git, processes, local automation | Always on |
| Unity MCP | Scene, GameObject, Component, Prefab, Material, Console, Play Mode, Editor operations | Auto per approved project |

The gateway merges the currently active providers into one tool registry. If one provider fails, healthy providers remain available.

The **Providers** page is also the operator surface for provider-specific capabilities. Desktop Commander shows its current and latest versions, update status, update actions, and a read-only **AI Capabilities…** view grouped by files/editing, search, terminal sessions, processes, configuration, history/diagnostics, and assistance. Unity uses the same page for its **AI Capabilities…** exposure controls. There is no separate Tools page in the UI.

## Unity integration

DeskLink currently pins **MCP for Unity 10.2.0**.

When a running Unity project is detected, DeskLink checks whether the project integration is present. On first use it asks for confirmation before changing the project.

After approval DeskLink can:

1. Add the pinned `com.coplaydev.unity-mcp` dependency.
2. Request a real Unity Package Manager resolve from inside the Editor.
3. Wait for the package to be resolved and imported instead of treating `manifest.json` alone as success.
4. Install a small project-scoped DeskLink bootstrap.
5. Start the Unity MCP stdio server and select the matching Editor instance.
6. Expose Unity tools through the same DeskLink MCP endpoint used by ChatGPT.

The small bootstrap is stored under:

```text
Assets/Editor/DeskLink/DeskLinkUnityMcpBootstrap.cs
ProjectSettings/DeskLinkUnityMcp.json
```

It does **not** reimplement Unity automation. It only controls the upstream MCP for Unity transport for that project.

### Unity project modes

- **Auto** — connect whenever the approved Unity project is running.
- **Manual** — keep the integration installed but start the provider only when requested.
- **Disabled** — do not start the Unity provider for that project.

DeskLink also reconnects the Unity stdio provider after Editor domain reloads or temporary bridge changes.

### Unity AI capability exposure

DeskLink keeps a small high-frequency Unity core visible and groups lower-frequency upstream tools behind per-capability **On / Ask / Off** controls. The Unity Provider page stays compact: open **AI Capabilities…** to see the full capability list, descriptions, and controls. Core capability groups are listed there as always-on and read-only. **On** exposes an optional group's real MCP tools, **Ask** hides their schemas and exposes them only through the small `unity_capabilities` request tool, and **Off** hides the group completely. `unity_capabilities` itself is omitted when no capability is in Ask mode.

Optional groups default to **Ask**; **Raw MCP** defaults to **Off** and restores the complete upstream tool surface for debugging. An Ask request can be allowed for the current Unity session, always allowed, or denied. Changing a mode rebuilds DeskLink's tool registry immediately, so subsequent `tools/list` requests see the new surface without restarting the provider.

### Verified Unity capabilities

The current integration has been exercised with real Editor operations including:

- Create, save, load, and inspect scenes.
- Create, duplicate, modify, and delete GameObjects.
- Add and configure Components.
- Create and assign Materials, including URP materials.
- Create and inspect Prefabs.
- Read and clear the Unity Console.
- Enter and leave Play Mode.
- Execute Editor/runtime C# through the upstream MCP tool.
- Select the active Unity Editor instance.

A complete sample scene was built through MCP during development to verify Scene → GameObject → Component → Prefab → Play Mode → physics trigger → Console workflows.

## Requirements

- **Windows 10+**
- Network access to OpenAI services
- An OpenAI organization with **Secure MCP Tunnel** enabled
- For Unity integration: **Unity 2021.3+**

DeskLink manages its private Node.js runtime, Desktop Commander runtime, and Unity MCP `uv/uvx` runtime when needed.

## Quick start

### 1. Create an OpenAI tunnel

1. Open **Tunnels** in the OpenAI platform: <https://platform.openai.com/settings/organization/tunnels>
2. Create a tunnel and copy its **Tunnel ID** (`tunnel_…`).
3. Create a **Runtime API key**: <https://platform.openai.com/settings/organization/api-keys>

### 2. Connect DeskLink

1. Install and launch DeskLink.
2. Open the **Tunnel** page.
3. Enter the Tunnel ID and Runtime API Key.
4. Click **Connect & Start**.
5. Wait until the control-plane status becomes **Ready**.

### 3. Connect ChatGPT

1. Open **Settings → Connectors** in ChatGPT: <https://chatgpt.com/#settings/Connectors>
2. Select the tunnel you created.
3. ChatGPT can now use the providers exposed by DeskLink.

### 4. Optional: enable Unity

1. Open a Unity project.
2. DeskLink detects the running project automatically.
3. Confirm **Install & Enable** when prompted.
4. Wait for Package Manager import and the Editor bridge to become connected.
5. Unity tools then appear in the same MCP gateway automatically.

## How it works

- `tunnel-client run` connects the OpenAI control plane to DeskLink's local MCP endpoint.
- `ProviderManager` owns the active MCP providers and builds a merged tool/resource registry.
- Tool-name collisions are routed to the provider that owns the exported name.
- Desktop Commander is connected over stdio.
- Unity MCP is connected over stdio and matched to the detected Unity project instance.
- Provider state changes rebuild the gateway registry without requiring ChatGPT to understand provider switching.
- The tunnel health flow verifies both local readiness and an accepted control-plane poll.

## Configuration

State lives under the DeskLink user-data directory, typically `%APPDATA%\DeskLink`.

Important files include:

- `config.json` — tunnel configuration and project/provider preferences.
- `tunnel-key.dpapi` — DPAPI-sealed Runtime API Key.
- Private runtimes and caches managed by DeskLink.

Unity project integration state is stored in the Unity project itself under `ProjectSettings/DeskLinkUnityMcp.json`.

## Development

### Prerequisites

- Node.js 20+
- npm

```bash
npm install
npm run dev        # generate icon, build TypeScript, launch Electron
npm test           # build + run node:test suite
npm run pack       # unpacked Windows build
npm run dist       # NSIS installer + zip
```

`npm run build` regenerates the Windows `.ico` from the exact icon resources embedded in the installed Electron runtime, so packaged and development icons stay consistent.

## Security notes

Desktop Commander and Unity MCP are powerful local automation providers. Only connect DeskLink to a tunnel and ChatGPT account you control.

DeskLink's MCP endpoint is loopback-only and rejects non-loopback host headers. Tunnel traffic is outbound and encrypted. Runtime API Keys are sealed with Windows DPAPI and are never written to disk in plaintext.

Unity project modification is not silent on first use: DeskLink asks before installing the Unity package or project bootstrap.

## License

DeskLink is licensed under the **ISC License** (see `package.json`).

Bundled or downloaded third-party components, including `tunnel-client`, `cloudflared`, Desktop Commander, MCP for Unity, Electron, and their dependencies, retain their respective licenses.
