'use strict';

const bridge = window.desklink;

const views = {
  overview: { title: '概览', render: renderOverview },
  tunnel: { title: '隧道', render: renderTunnel },
  tools: { title: '工具', render: renderTools },
  logs: { title: '日志', render: renderLogs },
  diagnostics: { title: '诊断', render: renderDiagnostics }
};

const phaseText = { idle: '未启动', starting: '启动中', ready: '已就绪', error: '错误' };

let status = { phase: 'idle', detail: '', toolCount: 0, endpoint: '', commanderVersion: '', commanderLatest: '' };
let tunnel = { installed: false, version: '', running: false, live: false, ready: false, connected: false, tunnelId: '', hasKey: false, lastError: '', installing: false, message: '' };
let logs = '';
let tools = [];
let diagnosis = null;
let current = 'overview';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(label, value, mono) {
  const line = el('div', 'row');
  line.append(el('div', 'row-label', label));
  line.append(el('div', mono ? 'row-value mono' : 'row-value', value));
  return line;
}

function section(title, ...children) {
  const box = el('section', 'section');
  box.append(el('h3', null, title));
  for (const child of children) box.append(child);
  return box;
}

function head(title, subtitle) {
  const box = el('div', 'page-head');
  box.append(el('h2', null, title));
  if (subtitle) box.append(el('p', null, subtitle));
  return box;
}

function setFeedback(text, isError) {
  const content = document.getElementById('content');
  if (!content) return;
  let box = document.getElementById('feedback');
  if (!box) {
    box = el('div', 'note');
    box.id = 'feedback';
    content.prepend(box);
  }
  box.textContent = text;
  box.className = isError ? 'note is-error' : 'note';
}

function button(label, handler, busyLabel) {
  const node = el('button', 'btn', label);
  node.addEventListener('click', async () => {
    const original = node.textContent;
    node.disabled = true;
    if (busyLabel) node.textContent = busyLabel;
    try {
      const result = await handler();
      setFeedback(result ? String(result) : '完成');
    } catch (error) {
      setFeedback('失败：' + String(error?.message ?? error), true);
    } finally {
      node.disabled = false;
      node.textContent = original;
    }
  });
  return node;
}

function tunnelText() {
  if (tunnel.installing) return tunnel.message || '正在安装 tunnel-client…';
  if (tunnel.connected) return 'Ready';
  if (tunnel.ready) return '本地就绪，等待控制面';
  if (tunnel.live) return '在线，等待就绪';
  if (tunnel.running) return '进程已启动';
  return '未连接';
}

function renderOverview() {
  const wrap = document.createDocumentFragment();
  wrap.append(head('概览', 'DeskLink 把 ChatGPT 的 MCP 调用转发给本机的 Desktop Commander。'));

  const rows = el('div', 'rows');
  rows.append(row('隧道', tunnelText()));
  rows.append(row('Desktop Commander', status.detail || phaseText[status.phase]));
  rows.append(row('工具数量', String(status.toolCount)));
  rows.append(row('MCP 端点', status.endpoint || '—', true));
  wrap.append(section('运行状态', rows));

  const bar = el('div', 'toolbar');
  bar.append(button('重启 Desktop Commander', async () => {
    await bridge.restart();
    return '已重启 Desktop Commander';
  }, '重启中…'));
  bar.append(el('span', 'spacer'));
  bar.append(el('span', 'muted', '工具清单由 Desktop Commander 提供，原样转发'));
  wrap.append(bar);

  const flow = el('div', 'note');
  flow.textContent = 'ChatGPT → Custom MCP Connector → OpenAI Secure MCP Tunnel → tunnel-client → DeskLink → Desktop Commander（stdio）→ 本机文件 / 搜索 / 编辑 / 进程 / Shell';
  wrap.append(section('链路', flow));
  return wrap;
}

function renderTunnel() {
  const wrap = document.createDocumentFragment();
  wrap.append(head('隧道', '连接 OpenAI Secure MCP Tunnel 后，ChatGPT 才能调用本机能力。'));

  const form = el('div');
  const idRow = el('div', 'row');
  idRow.append(el('div', 'row-label', 'Tunnel ID'));
  const idField = el('input', 'field mono');
  idField.id = 'tunnelId';
  idField.placeholder = 'tunnel_ 开头，32 位十六进制';
  idField.value = tunnel.tunnelId;
  idRow.append(idField);
  form.append(idRow);

  const keyRow = el('div', 'row');
  keyRow.append(el('div', 'row-label', 'Runtime API Key'));
  const keyField = el('input', 'field');
  keyField.id = 'runtimeKey';
  keyField.type = 'password';
  keyField.placeholder = tunnel.hasKey ? '已保存，留空则沿用' : '运行时密钥';
  keyRow.append(keyField);
  form.append(keyRow);
  wrap.append(section('凭据', form));

  const rows = el('div', 'rows');
  rows.append(row('tunnel-client', tunnel.installed ? tunnel.version || '已安装' : '未安装'));
  rows.append(row('进程', tunnel.running ? '运行中' : '已停止'));
  rows.append(row('健康', tunnel.live ? '在线' : '—'));
  rows.append(row('就绪', tunnel.connected ? 'Ready' : tunnel.ready ? '等待控制面' : '—'));
  rows.append(row('密钥', tunnel.hasKey ? '已保存（Windows DPAPI）' : '未保存'));
  wrap.append(section('状态', rows));

  if (tunnel.installing) wrap.append(el('div', 'note', tunnel.message || '正在安装 tunnel-client…'));
  if (tunnel.lastError) {
    const note = el('div', 'note', tunnel.lastError);
    note.id = 'tunnelError';
    wrap.append(note);
  }

  const bar = el('div', 'toolbar');
  bar.append(button(tunnel.installed ? '更新 tunnel-client' : '安装 tunnel-client', async () => {
    const result = await bridge.tunnelInstall();
    if (result?.error) throw new Error(result.error);
    tunnel.lastError = '';
    show(current);
    return 'tunnel-client 已更新';
  }, '下载中…'));

  const connect = el('button', 'btn btn-default', '连接并启动');
  connect.disabled = !tunnel.installed;
  connect.addEventListener('click', async () => {
    connect.disabled = true;
    try {
      const result = await bridge.tunnelConnect({
        tunnelId: document.getElementById('tunnelId').value.trim(),
        apiKey: document.getElementById('runtimeKey').value.trim()
      });
      if (result?.error) tunnel.lastError = result.error;
    } finally {
      connect.disabled = false;
      show(current);
    }
  });
  bar.append(connect);

  bar.append(button('停止', async () => {
    await bridge.tunnelStop();
    return '已停止 tunnel-client';
  }));
  bar.append(el('span', 'spacer'));
  wrap.append(bar);
  return wrap;
}

function toolRow(tool) {
  const line = el('div', 'row');
  const name = el('div', 'row-value mono', tool.name);
  name.style.flex = '0 0 200px';
  line.append(name);
  line.append(el('div', 'row-value dim', tool.description || '—'));
  return line;
}

function updateNote() {
  const version = status.commanderVersion;
  const latest = status.commanderLatest;
  if (!version || !latest) return '未检查';
  if (version === latest) return '已是最新';
  return `有更新 ${latest}，重启 Desktop Commander 生效`;
}

function renderTools() {
  const wrap = document.createDocumentFragment();
  wrap.append(head('工具', '工具清单由 Desktop Commander 提供，DeskLink 原样转发。'));

  const rows = el('div', 'rows');
  rows.append(row('运行版本', status.commanderVersion || '—', true));
  rows.append(row('最新版本', status.commanderLatest || '—', true));
  rows.append(row('更新', updateNote()));
  wrap.append(section('Desktop Commander', rows));

  const bar = el('div', 'toolbar');
  bar.append(button('检查更新', async () => {
    const latest = await bridge.checkCommanderUpdate();
    return latest ? `最新可用版本 ${latest}` : '未能获取版本，请检查网络或 npm';
  }, '检查中…'));
  bar.append(button('更新 Desktop Commander', async () => {
    await bridge.restart();
    return '已按 @latest 重新安装并启动';
  }, '更新中…'));
  bar.append(el('span', 'spacer'));
  bar.append(el('span', 'muted', '启动时用 @latest 解析，版本变化才下载'));
  wrap.append(bar);

  const list = el('div', 'rows');
  if (tools.length) for (const tool of tools) list.append(toolRow(tool));
  else list.append(el('div', 'empty', '等待 Desktop Commander 就绪…'));
  wrap.append(section(`工具（${tools.length}）`, list));
  return wrap;
}

function renderLogs() {
  const wrap = document.createDocumentFragment();
  wrap.append(head('日志', 'Desktop Commander、tunnel-client 与 DeskLink 的输出。'));
  const view = el('div', 'log-view', logs || '尚无日志。\n');
  view.id = 'logView';
  wrap.append(view);
  return wrap;
}

function renderDiagnostics() {
  const wrap = document.createDocumentFragment();
  wrap.append(head('诊断', '检查运行 Desktop Commander 与隧道所需的本机环境。'));

  const rows = el('div', 'rows');
  const add = (label, value, mono) => rows.append(row(label, value, mono));

  if (diagnosis) {
    add('Node.js（运行时）', diagnosis.runtime?.version
      ? `${diagnosis.runtime.version} · ${diagnosis.runtime.source === 'bundled' ? '应用内置' : '系统'}${diagnosis.runtime.satisfies ? '' : ' · 版本过低'}`
      : '未检测到', true);
    add('Electron', diagnosis.electron || '—', true);
    add('Desktop Commander（已装）', diagnosis.runtime?.commanderInstalled || '未预装', true);
    add('Desktop Commander', diagnosis.commander?.version || diagnosis.commander?.phase || '—', true);
    add('工具数量', String(diagnosis.commander?.toolCount ?? 0));
    add('MCP 端口', `${diagnosis.endpoint?.port} · ${diagnosis.endpoint?.reachable ? '可访问' : '不可访问'}`, true);
    add('tunnel-client', diagnosis.tunnel?.installed ? diagnosis.tunnel.version || '已安装' : '未安装');
    add('Runtime API Key', diagnosis.tunnel?.hasKey ? '已保存' : '未保存');
    add('Tunnel ID', diagnosis.tunnel?.tunnelId || '—', true);
  } else {
    add('Node.js', bridge.versions?.node ?? '—', true);
    add('Electron', bridge.versions?.electron ?? '—', true);
    add('Desktop Commander', status.detail || phaseText[status.phase]);
    add('MCP 端点', status.endpoint || '—', true);
    add('tunnel-client', tunnel.installed ? tunnel.version || '已安装' : '未安装');
    add('提示', '点击“运行诊断”获取实时结果');
  }
  wrap.append(section('环境', rows));

  const bar = el('div', 'toolbar');
  bar.append(button('运行诊断', async () => {
    diagnosis = await bridge.diagnostics();
    show('diagnostics');
    return '诊断完成';
  }, '检查中…'));
  bar.append(el('span', 'spacer'));
  bar.append(el('span', 'muted', 'Desktop Commander 需要 Node.js ≥ 18'));
  wrap.append(bar);

  const runtime = diagnosis?.runtime;
  if (runtime && (!runtime.available || !runtime.satisfies)) {
    const action = el('div', 'toolbar');
    action.append(button('下载 Node.js（官方绿色版）', async () => {
      const result = await bridge.nodeInstall();
      if (result?.error) throw new Error(result.error);
      diagnosis = await bridge.diagnostics();
      show('diagnostics');
      return result?.version ? `Node.js ${result.version} 已就绪，请重启 Desktop Commander` : 'Node.js 已就绪';
    }, '下载中…'));
    wrap.append(action);
  }
  return wrap;
}

function captureInputs() {
  const snapshot = [];
  for (const field of document.querySelectorAll('#content input')) {
    snapshot.push({
      id: field.id,
      value: field.value,
      focused: document.activeElement === field,
      caret: field.selectionStart
    });
  }
  return snapshot;
}

function restoreInputs(snapshot) {
  for (const data of snapshot) {
    const field = document.getElementById(data.id);
    if (!field) continue;
    field.value = data.value;
    if (!data.focused) continue;
    field.focus();
    try { field.setSelectionRange(data.caret, data.caret); } catch {}
  }
}

function isTyping() {
  const active = document.activeElement;
  return !!active && active.tagName === 'INPUT' && document.getElementById('content')?.contains(active);
}

function show(view) {
  current = views[view] ? view : 'overview';
  const item = views[current];
  const form = captureInputs();
  document.getElementById('windowTitle').textContent = item.title;
  document.getElementById('content').replaceChildren(item.render());
  restoreInputs(form);
  document.querySelectorAll('.side-item').forEach(node => {
    node.classList.toggle('is-active', node.dataset.view === current);
  });
  if (current === 'logs') {
    const log = document.getElementById('logView');
    if (log) log.scrollTop = log.scrollHeight;
  }
}

function updateTitleStatus() {
  const dot = document.getElementById('titleStatus');
  const text = document.getElementById('titleStatusText');
  const ready = status.phase === 'ready' && tunnel.connected;
  dot.className = 'status-dot' + (ready ? ' is-ready' : status.phase === 'ready' || tunnel.live ? ' is-live' : status.phase === 'error' ? ' is-error' : '');
  text.textContent = ready ? '已就绪' : tunnel.connected ? '隧道已就绪' : status.detail || phaseText[status.phase];
}

async function loadTools() {
  try { tools = await bridge.getTools(); } catch { tools = []; }
  if (current === 'tools') show('tools');
}

function startClock() {
  const target = document.getElementById('menuClock');
  const tick = () => {
    const now = new Date();
    const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
    target.textContent = `${week} ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  };
  tick();
  setInterval(tick, 15000);
}

(function enableDragging() {
  const bars = [document.querySelector('.menubar'), document.querySelector('.titlebar')].filter(Boolean);
  const THRESHOLD = 4;
  let dragging = false;
  let moved = false;
  let origin = { x: 0, y: 0 };

  for (const bar of bars) {
    bar.addEventListener('mousedown', event => {
      if (event.button !== 0 || event.target.closest('button, input, select, textarea, a')) return;
      dragging = true;
      moved = false;
      origin = { x: event.screenX, y: event.screenY };
      bridge.dragStart(event.screenX, event.screenY);
    });
  }

  window.addEventListener('mousemove', event => {
    if (!dragging) return;
    // Ignore jitter so a plain click never turns into a move.
    if (!moved && Math.abs(event.screenX - origin.x) < THRESHOLD && Math.abs(event.screenY - origin.y) < THRESHOLD) return;
    moved = true;
    bridge.dragMove(event.screenX, event.screenY);
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    if (moved) bridge.dragEnd();
  });

})();

document.querySelectorAll('.side-item').forEach(node => {
  node.addEventListener('click', () => show(node.dataset.view));
});
document.querySelectorAll('.win-btn').forEach(node => {
  node.addEventListener('click', () => bridge.windowAction(node.dataset.action));
});

bridge.onStatus(next => {
  status = next;
  updateTitleStatus();
  if (isTyping()) return;
  show(current);
  if (next.phase === 'ready') void loadTools();
});
bridge.onTunnel(next => {
  tunnel = next;
  updateTitleStatus();
  if (isTyping()) return;
  if (current === 'tunnel' || current === 'overview' || current === 'diagnostics') show(current);
});
bridge.onLog(line => {
  logs += line;
  if (current === 'logs') {
    const view = document.getElementById('logView');
    if (view) {
      view.textContent = logs;
      view.scrollTop = view.scrollHeight;
    }
  }
});

(async () => {
  try {
    const initial = await bridge.tunnelStatus();
    if (initial) tunnel = initial;
  } catch {}
  updateTitleStatus();
})();

startClock();
updateTitleStatus();
show('overview');
void loadTools();
