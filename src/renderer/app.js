'use strict';

const bridge = window.desklink;
// i18n is loaded from i18n.js (in <head>); fall back to passthrough if absent.
const i18n = window.__i18n || { locale: 'zh-CN', t: (k) => k, tl: (k) => k, days: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] };
const t = i18n.t;
const tl = i18n.tl;

// Restored language choice ('auto' follows the OS); applied before the first render.
let langChoice = 'auto';
try { langChoice = localStorage.getItem('desklink.lang') || 'auto'; } catch {}
if (langChoice !== 'auto') i18n.setLocale(langChoice);

const views = {
  overview: { title: t('viewOverview'), render: renderOverview },
  tunnel: { title: t('viewTunnel'), render: renderTunnel },
  tools: { title: t('viewTools'), render: renderTools },
  logs: { title: t('viewLogs'), render: renderLogs },
  diagnostics: { title: t('viewDiagnostics'), render: renderDiagnostics },
  settings: { title: t('viewSettings'), render: renderSettings }
};

let phaseText = { idle: t('phaseIdle'), starting: t('phaseStarting'), ready: t('phaseReady'), error: t('phaseError') };

let status = { phase: 'idle', detail: '', toolCount: 0, endpoint: '', commanderVersion: '', commanderLatest: '' };
let tunnel = { installed: false, version: '', running: false, live: false, ready: false, connected: false, controlPlane: { ok: false, detail: '' }, proxy: '', tunnelId: '', hasKey: false, lastError: '', installing: false, message: '' };
let logs = '';
let tools = [];
let diagnosis = null;
let current = 'overview';
/** True while a tunnel action (connect/install/stop) is awaiting a remote response. */
let tunnelBusy = false;
/** Proxy value kept in the Settings view; sent on connect (the tunnel view no longer edits it). */
let proxyDraft = '';
/** Cached DeskLink version, fetched once at startup for the Settings view. */
let appVersion = '';

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
      setFeedback(result ? String(result) : t('done'));
    } catch (error) {
      setFeedback(t('failed') + String(error?.message ?? error), true);
    } finally {
      node.disabled = false;
      node.textContent = original;
    }
  });
  return node;
}

function tunnelText() {
  if (tunnel.installing) return tunnel.message || t('tunInstalling');
  if (tunnel.connected) return t('tunConnected');
  if (tunnel.ready) return t('tunLocalReady');
  if (tunnel.live) return t('tunOnline');
  if (tunnel.running) return t('tunProcess');
  return t('tunDisconnected');
}

/** Localized phase label; only the 'error' phase falls back to the raw, dynamic detail text. */
function phaseLabel(phase) {
  return phaseText[phase] || phase || '';
}

/** Desktop Commander status line: prefer the localized phase over the main-process detail prose. */
function commanderText() {
  if (status.phase === 'error') return status.detail || phaseText.error;
  return phaseText[status.phase] || status.detail || '';
}

function renderOverview() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewOverview'), t('ovSubtitle')));

  const rows = el('div', 'rows');
  rows.append(row(t('rowTunnel'), tunnelText()));
  rows.append(row('Desktop Commander', commanderText()));
  rows.append(row(t('rowToolCount'), String(status.toolCount)));
  rows.append(row(t('rowMcpEndpoint'), status.endpoint || '—', true));
  wrap.append(section(t('secStatus'), rows));

  const bar = el('div', 'toolbar');
  bar.append(button(t('btnRestartCommander'), async () => {
    await bridge.restart();
    return t('restartedCommander');
  }, t('restarting')));
  bar.append(el('span', 'spacer'));
  bar.append(el('span', 'muted', t('noteToolsForward')));
  wrap.append(bar);

  const flow = el('div', 'note');
  flow.textContent = t('flowText');
  wrap.append(section(t('secLink'), flow));
  return wrap;
}

function renderTunnel() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewTunnel'), t('tunSubtitle')));

  const form = el('div');
  const idRow = el('div', 'row');
  idRow.append(el('div', 'row-label', 'Tunnel ID'));
  const idField = el('input', 'field mono');
  idField.id = 'tunnelId';
  idField.placeholder = t('phTunnelId');
  idField.value = tunnel.tunnelId;
  idRow.append(idField);
  form.append(idRow);

  const keyRow = el('div', 'row');
  keyRow.append(el('div', 'row-label', 'Runtime API Key'));
  const keyField = el('input', 'field');
  keyField.id = 'runtimeKey';
  keyField.type = 'password';
  keyField.placeholder = tunnel.hasKey ? t('phKeySaved') : t('phKey');
  keyRow.append(keyField);
  form.append(keyRow);

  const proxyRow = el('div', 'row');
  proxyRow.append(el('div', 'row-label', t('lblProxy')));
  const proxyNote = el('div', 'row-value muted', t('proxyInSettings'));
  proxyRow.append(proxyNote);
  form.append(proxyRow);
  wrap.append(section(t('secCreds'), form));

  // Daemon is up but the control plane has not acknowledged the key yet: keep actions locked
  // for a grace window so a slow/uncertain remote answer can't be disturbed by local edits.
  const waiting = tunnel.running && tunnel.ready && !tunnel.connected && !tunnel.lastError
    && Date.now() - (tunnel.startedAt || 0) < 90000;

  const rows = el('div', 'rows');
  rows.append(row('tunnel-client', tunnel.installed ? tunnel.version || t('installed') : t('notInstalled')));
  rows.append(row(t('rowProcess'), tunnel.running ? t('procRunning') : t('procStopped')));
  rows.append(row(t('rowHealth'), tunnel.live ? t('healthOnline') : '—'));
  const readyRow = el('div', 'row');
  readyRow.append(el('div', 'row-label', t('rowReady')));
  const readyValue = el('div', 'row-value', tunnel.connected ? t('tunConnected') : tunnel.ready ? t('readyWaiting') : '—');
  if (waiting) readyValue.classList.add('waiting-dots');
  readyRow.append(readyValue);
  rows.append(readyRow);
  if (tunnel.running) {
    const cp = tunnel.controlPlane || { ok: false, detail: '' };
    const line = el('div', 'row');
    line.append(el('div', 'row-label', t('rowControlPlane')));
    if (tunnel.ready) {
      const dot = el('span', 'status-dot ' + (cp.ok ? 'is-ready' : 'is-pulsing'));
      line.append(dot);
    }
    line.append(el('div', 'row-value mono', cp.detail || t('probing')));
    rows.append(line);
  }
  rows.append(row(t('rowKey'), tunnel.hasKey ? t('keySaved') : t('keyUnsaved')));
  wrap.append(section(t('secStatus'), rows));

  if (tunnel.installing) wrap.append(el('div', 'note', tunnel.message || t('installingNote')));
  if (tunnel.lastError) {
    const note = el('div', 'note', tunnel.lastError);
    note.id = 'tunnelError';
    wrap.append(note);
  }

  // Locked while an operation is in flight, while installing, or while the control plane has
  // not answered within the grace window — so local actions can't race the remote response.
  const lock = tunnelBusy || tunnel.installing || waiting;

  const bar = el('div', 'toolbar');
  const installBtn = button(tunnel.installed ? t('btnInstallUpdate') : t('btnInstall'), async () => {
    tunnelBusy = true;
    show(current);
    try {
      const result = await bridge.tunnelInstall();
      if (result?.error) throw new Error(result.error);
      tunnel.lastError = '';
      show(current);
      return t('updated');
    } finally {
      tunnelBusy = false;
      show(current);
    }
  }, t('downloading'));
  installBtn.disabled = lock;
  bar.append(installBtn);

  const connect = el('button', 'btn btn-default', t('btnConnectStart'));
  connect.disabled = !tunnel.installed || lock;
  connect.addEventListener('click', async () => {
    const payload = {
      tunnelId: document.getElementById('tunnelId').value.trim(),
      apiKey: document.getElementById('runtimeKey').value.trim(),
      proxy: proxyDraft
    };
    tunnelBusy = true;
    show(current);
    try {
      const result = await bridge.tunnelConnect(payload);
      if (result?.error) tunnel.lastError = result.error;
    } finally {
      tunnelBusy = false;
      show(current);
    }
  });
  bar.append(connect);

  const stop = button(t('btnStop'), async () => {
    tunnelBusy = true;
    show(current);
    try {
      await bridge.tunnelStop();
      return t('stopped');
    } finally {
      tunnelBusy = false;
      show(current);
    }
  });
  stop.disabled = lock;
  bar.append(stop);
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
  if (!version || !latest) return t('notChecked');
  if (version === latest) return t('upToDate');
  return tl('updateAvailable', { latest });
}

function renderTools() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewTools'), t('toolsSubtitle')));

  const rows = el('div', 'rows');
  rows.append(row(t('rowRunningVersion'), status.commanderVersion || '—', true));
  rows.append(row(t('rowLatestVersion'), status.commanderLatest || '—', true));
  rows.append(row(t('rowUpdate'), updateNote()));
  wrap.append(section('Desktop Commander', rows));

  const bar = el('div', 'toolbar');
  bar.append(button(t('btnCheckUpdate'), async () => {
    const latest = await bridge.checkCommanderUpdate();
    return latest ? tl('latestAvailable', { latest }) : t('checkUpdateFailed');
  }, t('checking')));
  bar.append(button(t('btnUpdateCommander'), async () => {
    await bridge.restart();
    return t('updatedLatest');
  }, t('restarting')));
  bar.append(el('span', 'spacer'));
  bar.append(el('span', 'muted', t('noteVersionResolve')));
  wrap.append(bar);

  const list = el('div', 'rows');
  if (tools.length) for (const tool of tools) list.append(toolRow(tool));
  else list.append(el('div', 'empty', t('emptyTools')));
  wrap.append(section(tl('secTools', { n: tools.length }), list));
  return wrap;
}

function renderLogs() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewLogs'), t('logsSubtitle')));
  const view = el('div', 'log-view', logs || t('noLogs') + '\n');
  view.id = 'logView';
  wrap.append(view);
  return wrap;
}

function renderDiagnostics() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewDiagnostics'), t('diagSubtitle')));

  const rows = el('div', 'rows');
  const add = (label, value, mono) => rows.append(row(label, value, mono));

  if (diagnosis) {
    add(t('diagRuntime'), diagnosis.runtime?.version
      ? `${diagnosis.runtime.version} · ${diagnosis.runtime.source === 'bundled' ? t('sourceBundled') : t('sourceSystem')}${diagnosis.runtime.satisfies ? '' : t('versionLow')}`
      : t('notDetected'), true);
    add('Electron', diagnosis.electron || '—', true);
    add(t('diagCommanderInstalled'), diagnosis.runtime?.commanderInstalled || t('notPreinstalled'), true);
    add('Desktop Commander', diagnosis.commander?.version || phaseLabel(diagnosis.commander?.phase) || '—', true);
    add(t('diagToolCount'), String(diagnosis.commander?.toolCount ?? 0));
    add(t('diagMcpPort'), `${diagnosis.endpoint?.port} · ${diagnosis.endpoint?.reachable ? t('reachable') : t('unreachable')}`, true);
    add('tunnel-client', diagnosis.tunnel?.installed ? diagnosis.tunnel.version || t('installed') : t('notInstalled'));
    add('Runtime API Key', diagnosis.tunnel?.hasKey ? t('keySaved') : t('keyUnsaved'));
    add('Tunnel ID', diagnosis.tunnel?.tunnelId || '—', true);
  } else {
    add('Node.js', bridge.versions?.node ?? '—', true);
    add('Electron', bridge.versions?.electron ?? '—', true);
    add('Desktop Commander', commanderText());
    add(t('rowMcpEndpoint'), status.endpoint || '—', true);
    add('tunnel-client', tunnel.installed ? tunnel.version || t('installed') : t('notInstalled'));
    add(t('hint'), t('clickRunDiag'));
  }
  wrap.append(section(t('secEnv'), rows));

  const bar = el('div', 'toolbar');
  bar.append(button(t('btnRunDiag'), async () => {
    diagnosis = await bridge.diagnostics();
    show('diagnostics');
    return t('diagDone');
  }, t('checking')));
  bar.append(el('span', 'spacer'));
  bar.append(el('span', 'muted', t('noteNodeRequired')));
  wrap.append(bar);

  const runtime = diagnosis?.runtime;
  if (runtime && (!runtime.available || !runtime.satisfies)) {
    const action = el('div', 'toolbar');
    action.append(button(t('btnDownloadNode'), async () => {
      const result = await bridge.nodeInstall();
      if (result?.error) throw new Error(result.error);
      diagnosis = await bridge.diagnostics();
      show('diagnostics');
      return result?.version ? tl('nodeReadyRestart', { version: result.version }) : t('nodeReady');
    }, t('downloading')));
    wrap.append(action);
  }
  return wrap;
}

// Recompute language-dependent strings after a locale switch (titles/phase map are cached at load).
function refreshStrings() {
  views.overview.title = t('viewOverview');
  views.tunnel.title = t('viewTunnel');
  views.tools.title = t('viewTools');
  views.logs.title = t('viewLogs');
  views.diagnostics.title = t('viewDiagnostics');
  views.settings.title = t('viewSettings');
  phaseText = { idle: t('phaseIdle'), starting: t('phaseStarting'), ready: t('phaseReady'), error: t('phaseError') };
}

async function checkDesklinkUpdate() {
  const r = await bridge.checkAppUpdate();
  if (r?.error) return t('updateCheckFailed');
  if (appVersion && r.latest === appVersion) return tl('updateResultLatest', { version: r.latest });
  return tl('updateAvailableDesklink', { latest: r.latest, current: appVersion || '?' });
}

function renderSettings() {
  const wrap = document.createDocumentFragment();
  wrap.append(head(t('viewSettings'), t('settingsSubtitle')));

  // General
  const genRows = el('div', 'rows');
  const langRow = el('div', 'row');
  langRow.append(el('div', 'row-label', t('settingLang')));
  const sel = el('select', 'field');
  sel.id = 'langSelect';
  for (const [val, label] of [['auto', t('langAuto')], ['zh-CN', t('langZh')], ['en-US', t('langEn')]]) {
    const o = el('option');
    o.value = val;
    o.textContent = label;
    sel.append(o);
  }
  sel.value = langChoice;
  sel.addEventListener('change', () => {
    langChoice = sel.value;
    try { localStorage.setItem('desklink.lang', langChoice); } catch {}
    i18n.setLocale(langChoice);
    bridge.setLocale(i18n.locale);
    refreshStrings();
    updateTitleStatus();
    show('settings');
  });
  langRow.append(sel);
  genRows.append(langRow);
  wrap.append(section(t('settingsGeneral'), genRows));

  // Tunnel — proxy (moved out of the Tunnel view)
  const tunRows = el('div', 'rows');
  const proxyRow = el('div', 'row');
  proxyRow.append(el('div', 'row-label', t('lblProxy')));
  const proxyField = el('input', 'field');
  proxyField.id = 'proxy';
  proxyField.placeholder = t('phProxy');
  proxyField.value = proxyDraft || '';
  proxyField.addEventListener('input', () => { proxyDraft = proxyField.value.trim(); });
  proxyRow.append(proxyField);
  tunRows.append(proxyRow);
  wrap.append(section(t('settingsTunnel'), tunRows));

  // About
  const aboutRows = el('div', 'rows');
  aboutRows.append(row(t('desklinkVersion'), appVersion || '—', true));
  wrap.append(section(t('aboutDesklink'), aboutRows));

  const bar = el('div', 'toolbar');
  bar.append(button(t('checkAppUpdate'), async () => {
    return await checkDesklinkUpdate();
  }, t('checking')));
  wrap.append(bar);
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
  const connecting = status.phase === 'ready' && tunnel.running && !tunnel.connected && tunnel.ready;
  dot.className = 'status-dot' + (ready ? ' is-ready' : connecting ? ' is-live is-pulsing' : status.phase === 'ready' || tunnel.live ? ' is-live' : status.phase === 'error' ? ' is-error' : '');
  text.classList.toggle('waiting-dots', connecting);
  text.textContent = ready ? t('titleReady') : connecting ? t('titleConnecting') : tunnel.connected ? t('titleTunnelReady') : commanderText();
}

async function loadTools() {
  try { tools = await bridge.getTools(); } catch { tools = []; }
  if (current === 'tools') show('tools');
}

(function enableDragging() {
  const bars = [document.querySelector('.titlebar')].filter(Boolean);
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
  if (!proxyDraft) proxyDraft = tunnel.proxy || '';
  try { appVersion = await bridge.appVersion(); } catch {}
  updateTitleStatus();
})();

// Keep main-process messages (logs, errors) in the same language as the UI.
bridge.setLocale(i18n.locale);
updateTitleStatus();
show('overview');
void loadTools();
