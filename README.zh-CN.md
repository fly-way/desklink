# DeskLink

> Windows 本地 MCP 网关，通过安全隧道把 ChatGPT 连接到本机工具与专业桌面应用。

DeskLink 是一个轻量的 Windows Electron 应用。它通过官方 OpenAI **安全 MCP 隧道（Secure MCP Tunnel）**，把本地 MCP Provider 暴露给 ChatGPT，同时不需要开放公网入站端口。

目前 DeskLink 内置两个 Provider：

- **Desktop Commander**：文件、Shell、进程、Git 与通用电脑自动化。
- **Unity MCP**：Scene、GameObject、Component、Prefab、Material、Console、Play Mode 等结构化 Unity Editor 能力。

English documentation: [README.md](README.md)

## 功能特性

- **多 Provider MCP Gateway** —— 把多个本地 MCP Provider 的工具与资源聚合到同一个 DeskLink 端点。
- **开箱即用的 Desktop Commander** —— 自动准备 Node.js 运行时，并把 `@wonderwhy-er/desktop-commander` 安装到 DeskLink 私有数据目录。
- **Unity Editor 集成** —— 自动检测正在运行的 Unity 项目，并可按项目安装和管理固定版本的 `MCP for Unity`。
- **Provider 生命周期管理** —— Unity 项目支持 **自动 / 手动 / 禁用** 三种模式。
- **动态能力路由** —— Provider Ready 后才暴露工具；某个 Provider 失败不会拖垮其他 Provider。
- **面向上下文的 Unity 暴露策略** —— 高频 Unity 工具常驻，低频能力组通过 **On / Ask / Off** 控制，减少模型长期携带的 tool schema。
- **官方 OpenAI 隧道** —— 使用 OpenAI `tunnel-client`，只建立出站连接。
- **保留 Schema 的 MCP 路由** —— 对已暴露工具保留 upstream schema，并转发 `tools/call`、`resources/list`、`resources/read`。
- **兼容新旧 MCP** —— 同时支持新版 `2026-07-28` 请求格式与旧版无状态 `initialize` 客户端。
- **控制面感知健康状态** —— “Ready” 表示真实 OpenAI 控制面轮询成功，而不只是本地 daemon 已启动。
- **安全保存凭据** —— Runtime API Key 使用 **Windows DPAPI** 加密，不以明文落盘。
- **运行时下载校验** —— tunnel / uv 等运行时组件在元数据可用时进行校验和验证。
- **桌面体验** —— 托盘运行、单实例、后台提醒、Unity 安装确认、需要用户操作时任务栏提醒。
- **统一 Windows 图标** —— 打包版使用与 `npm run dev` 开发态一致的 Electron 应用图标。

## 架构

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

本地端点：

- MCP：`127.0.0.1:47933/mcp`
- Health / 运维界面：`127.0.0.1:47934`

DeskLink 的本地端点只绑定 loopback。

## 内置 Provider

| Provider | 典型能力 | 默认行为 |
|---|---|---|
| Desktop Commander | 文件、代码编辑、Shell、Git、进程、本地自动化 | 始终启用 |
| Unity MCP | Scene、GameObject、Component、Prefab、Material、Console、Play Mode、Editor 操作 | 已批准项目按 Auto 运行 |

Gateway 会把当前活跃 Provider 合并成一份工具注册表。即使某个 Provider 启动失败，其他健康 Provider 仍保持可用。

**Providers** 页面同时承担各 Provider 的能力管理入口。Desktop Commander 会直接显示当前版本、最新版本、更新状态与更新操作，并通过只读的 **AI 能力…** 面板按“文件与编辑 / 搜索 / 终端会话 / 系统进程 / 配置 / 使用记录与诊断 / 辅助功能”等能力组展示它能做什么；Unity 则在同一页面管理 **AI 能力…** 暴露策略。UI 不再保留单独的 Tools 页面。

## Unity 集成

DeskLink 当前固定使用 **MCP for Unity 10.2.0**。

检测到运行中的 Unity 项目后，DeskLink 会检查项目集成状态。第一次使用时，DeskLink 会先询问用户，确认后才修改项目。

用户批准后，DeskLink 会：

1. 添加固定版本的 `com.coplaydev.unity-mcp` 依赖。
2. 在 Unity Editor 内请求真实的 Package Manager Resolve。
3. 等待 Package 真正解析与导入，而不是仅凭 `manifest.json` 判断安装成功。
4. 安装一个很薄的项目级 DeskLink bootstrap。
5. 启动 Unity MCP stdio server，并自动选择匹配的 Editor instance。
6. 将 Unity 工具通过与 ChatGPT 相同的 DeskLink MCP Gateway 暴露出去。

这个轻量 bootstrap 位于：

```text
Assets/Editor/DeskLink/DeskLinkUnityMcpBootstrap.cs
ProjectSettings/DeskLinkUnityMcp.json
```

它**不会重新实现 Unity 自动化能力**，只负责控制该项目中的 upstream MCP for Unity transport。

### Unity 项目模式

- **自动（Auto）** —— 已批准项目运行时自动连接。
- **手动（Manual）** —— 保留集成，但只在用户要求时启动 Provider。
- **禁用（Disabled）** —— 该项目不启动 Unity Provider。

Unity Editor 发生 Domain Reload 或 Bridge 短暂变化后，DeskLink 也会自动重连 stdio Provider。

### Unity AI 能力暴露

DeskLink 默认只常驻一组高频 Unity Core 工具，低频 upstream 工具按能力组使用 **On / Ask / Off** 控制。Unity Provider 页面本身保持简洁，点击 **AI 能力…** 后才打开完整能力列表、用途说明与开关；Core 能力也会列出，但固定为始终启用且不可关闭。**On** 直接暴露可选能力组的真实 MCP 工具；**Ask** 不暴露这些工具的 schema，只通过很小的 `unity_capabilities` 请求工具按需申请；**Off** 则完全隐藏。没有任何 Ask 能力时，`unity_capabilities` 本身也不会出现在工具列表中。

可选能力组默认是 **Ask**；**Raw MCP** 默认 **Off**，仅在调试时用于恢复完整 upstream 工具面。Ask 请求可选择“本次允许 / 始终允许 / 拒绝”。修改状态会立即重建 DeskLink tool registry，后续 `tools/list` 请求无需重启 Provider 就能看到新的暴露面。

### 已验证的 Unity 能力

当前集成已经通过真实 Editor 操作验证，包括：

- 创建、保存、加载与读取 Scene。
- 创建、复制、修改与删除 GameObject。
- 添加与配置 Component。
- 创建并分配 Material，包括 URP Material。
- 创建与读取 Prefab。
- 读取与清空 Unity Console。
- 进入与退出 Play Mode。
- 通过 upstream MCP 工具执行 Editor / Runtime C#。
- 选择当前活动的 Unity Editor instance。

开发期间还通过 MCP 构建过一个完整 Demo 场景，用于验证 Scene → GameObject → Component → Prefab → Play Mode → Physics Trigger → Console 的整条链路。

## 环境要求

- **Windows 10+**
- 能访问 OpenAI 服务的网络
- 已启用 **Secure MCP Tunnel** 的 OpenAI 组织
- 使用 Unity 集成时：**Unity 2021.3+**

DeskLink 会在需要时管理自己的 Node.js、Desktop Commander，以及 Unity MCP 的 `uv/uvx` 运行时。

## 快速开始

### 1. 创建 OpenAI Tunnel

1. 打开 OpenAI 平台的 **Tunnels**：<https://platform.openai.com/settings/organization/tunnels>
2. 创建 Tunnel，并复制 **Tunnel ID**（`tunnel_…`）。
3. 创建 **Runtime API key**：<https://platform.openai.com/settings/organization/api-keys>

### 2. 连接 DeskLink

1. 安装并启动 DeskLink。
2. 打开 **Tunnel / 隧道** 页面。
3. 输入 Tunnel ID 与 Runtime API Key。
4. 点击 **Connect & Start / 连接并启动**。
5. 等待控制面状态变成 **Ready**。

### 3. 在 ChatGPT 中连接

1. 在 ChatGPT 打开 **设置 → Connectors**：<https://chatgpt.com/#settings/Connectors>
2. 选择你创建的 Tunnel。
3. ChatGPT 现在可以使用 DeskLink 当前暴露的 Provider。

### 4. 可选：启用 Unity

1. 打开一个 Unity 项目。
2. DeskLink 会自动检测运行中的项目。
3. 出现提示时确认 **安装并启用**。
4. 等待 Package Manager 导入和 Editor Bridge 连接完成。
5. Unity 工具会自动加入同一个 MCP Gateway。

## 工作原理

- `tunnel-client run` 把 OpenAI 控制面连接到 DeskLink 本地 MCP 端点。
- `ProviderManager` 管理所有活跃 MCP Provider，并构建合并后的 tools/resources 注册表。
- 工具重名时会路由到对应的 Provider owner。
- Desktop Commander 通过 stdio 连接。
- Unity MCP 通过 stdio 连接，并与检测到的 Unity 项目 instance 匹配。
- Provider 状态变化会自动刷新 Gateway 工具注册表，ChatGPT 不需要理解或手动切换 Provider。
- Tunnel 健康流程同时验证本地 readiness 与控制面 poll 是否被接受。

## 配置

状态默认保存在 DeskLink 用户数据目录，通常是 `%APPDATA%\DeskLink`。

主要文件：

- `config.json` —— Tunnel 配置与项目 / Provider 偏好。
- `tunnel-key.dpapi` —— DPAPI 加密后的 Runtime API Key。
- DeskLink 管理的私有运行时与缓存。

Unity 项目级集成状态保存在项目自身的 `ProjectSettings/DeskLinkUnityMcp.json`。

## 开发

### 前置条件

- Node.js 20+
- npm

```bash
npm install
npm run dev        # 生成图标、编译 TypeScript、启动 Electron
npm test           # 构建并运行 node:test 测试
npm run pack       # 生成 Windows unpacked 目录
npm run dist       # 生成 NSIS 安装包 + zip
```

`npm run build` 会直接从当前 Electron runtime 的 `electron.exe` 中提取 Windows Icon Group，确保开发态与安装态图标一致。

## 安全说明

Desktop Commander 和 Unity MCP 都属于高权限本地自动化 Provider。请只将 DeskLink 连接到你自己控制的 Tunnel 与 ChatGPT 账号。

DeskLink MCP 端点只绑定 loopback，并拒绝非 loopback Host；Tunnel 流量是加密的出站连接。Runtime API Key 使用 Windows DPAPI 加密，不会以明文写入磁盘。

第一次修改 Unity 项目并不是静默行为：DeskLink 会先询问用户，再安装 Unity Package 或项目 bootstrap。

## 许可证

DeskLink 使用 **ISC License**（见 `package.json`）。

随附或下载的第三方组件，包括 `tunnel-client`、`cloudflared`、Desktop Commander、MCP for Unity、Electron 及其依赖，继续遵循各自的许可证。
