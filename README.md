# DeskLink

> A Windows console that links ChatGPT to Desktop Commander over the OpenAI Secure MCP Tunnel.

DeskLink is a small Electron desktop app that turns your Windows machine into a secure, ChatGPT-accessible bridge for [Desktop Commander](https://www.npmjs.com/package/@wonderwhy-er/desktop-commander). It runs Desktop Commander locally, then exposes its MCP tools to ChatGPT through the official OpenAI **Secure MCP Tunnel** (`tunnel-client`) — so ChatGPT can operate files, shells, and processes on your machine without any public inbound port.

中文文档: [README.zh-CN.md](README.zh-CN.md)

## Features

- **Zero-config Desktop Commander** — DeskLink provisions a Node.js runtime and installs the latest `@wonderwhy-er/desktop-commander` into its private data directory on first run.
- **Official OpenAI tunnel** — uses the OpenAI `tunnel-client` to register a control-plane tunnel. Only an outbound connection is made, so no firewall or port-forwarding is required.
- **Full MCP passthrough** — mirrors Desktop Commander's tools **and** UI resources (`resources/list` / `resources/read`), preserving every tool's `inputSchema`, and serves both the modern `2026-07-28` MCP request envelope and legacy `initialize` clients. This is what lets ChatGPT finish connector creation.
- **Control-plane-aware health** — "Ready" means a real control-plane poll succeeded, not just that the local daemon is alive. A wrong Runtime API Key is reported instead of silently showing "Ready".
- **Secure by default** — the tunnel endpoint is bound to `127.0.0.1` and rejects any non-loopback `Host` header; the Runtime API Key is sealed with **Windows DPAPI** and is never written in plaintext.
- **Self-updating binary** — the matching `tunnel-client` for your platform is downloaded on first launch and verified against its SHA-256 checksum.

## Architecture

```
 ChatGPT  ──(OpenAI control plane)──►  tunnel-client (local)  ──loopback──►  DeskLink MCP proxy  ──stdio──►  Desktop Commander
                                            │ 127.0.0.1:47933/mcp
                                            └ 127.0.0.1:47934/healthz, /readyz, /ui
```

| Component          | Location (in app data)              | Managed by            |
|--------------------|-------------------------------------|-----------------------|
| Desktop Commander  | `<data>/commander/node_modules`      | `CommanderRuntime`    |
| tunnel-client      | `<app>/tools/tunnel-client.exe`      | downloaded + checked  |
| Private state      | `<data>/.desklink`                   | config + DPAPI key    |

Default local ports (chosen to avoid the `47831–47834` range used by RDC-X):

- MCP endpoint: `127.0.0.1:47933/mcp`
- Health / operator surface: `127.0.0.1:47934`

## Requirements

- **Windows 10+** — `tunnel-client` auto-install is Windows-only. On other platforms, drop the binary into `tools/` yourself.
- Network access to `api.openai.com`.
- An OpenAI organization with **Secure MCP Tunnel** enabled.

## Quick start

### 1. Create a tunnel and a runtime key

1. Open **Tunnels** in the OpenAI platform: <https://platform.openai.com/settings/organization/tunnels>
2. Create a tunnel and copy its **Tunnel ID** (`tunnel_…`).
3. Create a **Runtime API key** (not an admin key): <https://platform.openai.com/settings/organization/api-keys>
4. Keep the key secret — DeskLink stores it sealed with DPAPI.

### 2. Connect DeskLink

1. Install and launch **DeskLink**.
2. On the **Tunnel** page, paste the Tunnel ID and Runtime API Key.
3. Click **Connect & Start** (连接并启动).
4. Wait for the status to reach **Ready**. This requires a successful control-plane poll — a wrong key stays on "Waiting for control plane".

### 3. Use it from ChatGPT

1. Open **Settings → Connectors** in ChatGPT: <https://chatgpt.com/#settings/Connectors>
2. Select the tunnel you created.
3. ChatGPT can now call Desktop Commander tools (filesystem, shell, processes) on your machine.

## How it works

- `tunnel-client run` is launched with your control-plane credentials injected via environment variables and pointed at the local MCP endpoint.
- The daemon exposes `/healthz` (liveness) and `/readyz` (local startup gates: OAuth discovery + MCP probe). DeskLink additionally runs `tunnel-client health --require-control-plane-poll` to confirm the credentials were actually accepted by the control plane.
- The daemon probes its MCP upstream once at startup; DeskLink waits for Desktop Commander to be listening before starting the tunnel, so `/readyz` is never stuck on a stale probe.
- The loopback endpoint is a small in-process proxy (`McpProxy` + `createDeskLinkMcpHandler`). It mirrors Desktop Commander's tool **and** resource definitions verbatim and forwards every `tools/call`, `resources/list`, and `resources/read` to Desktop Commander over stdio.
- Both MCP protocol generations are served: modern clients handshake via `server/discover` with the `2026-07-28` envelope, while older clients fall back to the SDK's stateless `initialize`.

## Configuration

State lives in the app's user data directory (e.g. `%APPDATA%\DeskLink`):

- `config.json` — tunnel ID and local ports.
- `tunnel-key.dpapi` — the DPAPI-sealed Runtime API Key.

To reset, stop the tunnel and delete the `.desklink` folder, then re-enter the credentials.

## Development

### Prerequisites

- Node.js 20+ and npm
- `npm install`

### Build & run

```bash
npm run build      # compile TypeScript to dist/
npm start          # launch the Electron app (after build)
npm run dev        # build + launch
npm test           # build + run the unit tests (node:test)
```

### Package

```bash
npm run dist       # electron-builder -> release/ (nsis installer + zip)
```

## Security notes

Desktop Commander can read/write your filesystem and execute commands. Only connect a tunnel you trust to a ChatGPT account you control. The tunnel endpoint is bound to loopback and rejects any non-`127.0.0.1`/`localhost` `Host` header; traffic to the control plane is an encrypted outbound tunnel. The Runtime API Key is sealed with Windows DPAPI and is never stored in plaintext.

## License

This project is licensed under the **ISC License** (see `package.json`). The bundled `tunnel-client` and `cloudflared` binaries carry their own licenses — see `tools/LICENSE` and `tools/NOTICE`.
