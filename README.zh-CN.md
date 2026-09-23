# DeskLink

> macOS 风格的 Windows 控制台，通过 OpenAI 安全 MCP 隧道（Secure MCP Tunnel）把 ChatGPT 连接到 Desktop Commander。

DeskLink 是一个轻量的 Electron 桌面应用，把你的 Windows 电脑变成一个可被 ChatGPT 安全访问的桥接器，用于驱动 [Desktop Commander](https://www.npmjs.com/package/@wonderwhy-er/desktop-commander)。它在本地运行 Desktop Commander，再通过官方的 OpenAI **安全 MCP 隧道**（`tunnel-client`）把其 MCP 工具暴露给 ChatGPT——因此 ChatGPT 可以在你的机器上操作文件、执行 Shell 与命令，而**无需任何公网入站端口**。

English documentation: [README.md](README.md)

## 功能特性

- **开箱即用的 Desktop Commander** —— DeskLink 会自动准备 Node.js 运行时，并在首次运行时把最新的 `@wonderwhy-er/desktop-commander` 安装到私有数据目录中。
- **官方 OpenAI 隧道** —— 使用 OpenAI `tunnel-client` 注册控制面隧道，仅建立出站连接，无需配置防火墙或端口转发。
- **控制面感知的健康判定** —— "Ready" 表示一次真实的**控制面轮询成功**，而不只是本地守护进程已启动。Runtime API Key 错误时会被明确提示，而不是悄悄显示 "Ready"。
- **默认安全** —— 隧道端点绑定在 `127.0.0.1`，并拒绝任何非 loopback 的 `Host` 头；Runtime API Key 使用 **Windows DPAPI** 加密保存，绝不以明文写入磁盘。
- **自更新二进制** —— 首次启动时会下载与平台匹配的 `tunnel-client`，并校验其 SHA-256 校验和。

## 架构

```
 ChatGPT  ──(OpenAI 控制面)──►  tunnel-client（本地）  ──loopback──►  Desktop Commander MCP
                                          │ 127.0.0.1:47933/mcp
                                          └ 127.0.0.1:47934/healthz、/readyz、/ui
```

| 组件             | 位置（应用数据目录内）           | 管理方              |
|------------------|----------------------------------|---------------------|
| Desktop Commander | `<data>/commander/node_modules`   | `CommanderRuntime`  |
| tunnel-client     | `<app>/tools/tunnel-client.exe`   | 下载 + 校验         |
| 私有状态          | `<data>/.desklink`                | 配置 + DPAPI 密钥   |

默认本地端口（特意避开 RDC-X 使用的 `47831–47834` 区间）：

- MCP 端点：`127.0.0.1:47933/mcp`
- 健康 / 运维界面：`127.0.0.1:47934`

## 环境要求

- **Windows 10+** —— `tunnel-client` 的自动安装仅支持 Windows。其他平台需自行把二进制放入 `tools/`。
- 能访问 `api.openai.com` 的网络。
- 已启用 **Secure MCP Tunnel** 的 OpenAI 组织。

## 快速开始

### 1. 创建隧道与运行时密钥

1. 在 OpenAI 平台打开 **Tunnels**：<https://platform.openai.com/settings/organization/tunnels>
2. 创建一个隧道并复制其 **Tunnel ID**（`tunnel_…`）。
3. 创建一个 **Runtime API key**（不是 admin key）：<https://platform.openai.com/settings/organization/api-keys>
4. 妥善保管该密钥——DeskLink 会用 DPAPI 加密保存它。

### 2. 连接 DeskLink

1. 安装并启动 **DeskLink**。
2. 在 **隧道** 页面粘贴 Tunnel ID 与 Runtime API Key。
3. 点击 **连接并启动（Connect & Start）**。
4. 等待状态变为 **Ready**。这需要一次成功的控制面轮询——如果密钥错误，状态会停在"等待控制面（Waiting for control plane）"。

### 3. 在 ChatGPT 中使用

1. 在 ChatGPT 打开 **设置 → Connectors**：<https://chatgpt.com/#settings/Connectors>
2. 选择你创建的隧道。
3. ChatGPT 现在可以调用你机器上的 Desktop Commander 工具（文件系统、Shell、进程等）。

## 工作原理

- `tunnel-client run` 启动时，通过环境变量注入你的控制面凭据，并指向本地 MCP 端点。
- 守护进程暴露 `/healthz`（存活）和 `/readyz`（本地启动门槛：OAuth 发现 + MCP 探测）。DeskLink 还会额外执行 `tunnel-client health --require-control-plane-poll`，以确认凭据确实被控制面接受。
- 守护进程在启动时只探测一次 MCP 上游；DeskLink 会先等待 Desktop Commander 开始监听，再启动隧道，因此 `/readyz` 不会被一次过期的探测卡住。

## 配置

状态保存在应用的用户数据目录（例如 `%APPDATA%\DeskLink`）：

- `config.json` —— Tunnel ID 与本地端口。
- `tunnel-key.dpapi` —— 经 DPAPI 加密的 Runtime API Key。

如需重置，停止隧道并删除 `.desklink` 文件夹，然后重新输入凭据即可。

## 开发

### 前置条件

- Node.js 20+ 与 npm
- `npm install`

### 构建与运行

```bash
npm run build      # 将 TypeScript 编译到 dist/
npm start          # 启动 Electron 应用（需先 build）
npm run dev        # 构建并启动
```

### 打包

```bash
npm run dist       # electron-builder -> release/（nsis 安装包 + zip）
```

## 安全说明

Desktop Commander 能够读写你的文件系统并执行命令。请只把隧道连接到你信任、且由你掌控的 ChatGPT 账号。隧道端点绑定在 loopback，并拒绝任何非 `127.0.0.1`/`localhost` 的 `Host` 头；到控制面的流量是加密的出站隧道。Runtime API Key 使用 Windows DPAPI 加密，绝不以明文存储。

## 许可证

本项目基于 **ISC 许可证**（见 `package.json`）。随附的 `tunnel-client` 与 `cloudflared` 二进制各自带有许可证，详见 `tools/LICENSE` 与 `tools/NOTICE`。
