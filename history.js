const GANFPU_HISTORY_KEY = 'ganfpu_prompt_history';
const GANFPU_HISTORY_MAX = 100;

function ganfpuHistoryData() {
  const data = {};
  if (typeof FIELDS === 'undefined') return data;
  FIELDS.forEach((f) => {
    if (typeof getFieldValue === 'function') data[f.id] = getFieldValue(f.id);
  });
  ['f-format-custom', 'f-hallucination-custom'].forEach((id) => {
    const el = document.getElementById(id);
    data[id] = el ? el.value.trim() : '';
  });
  return data;
}

function getPromptHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(GANFPU_HISTORY_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function recordHistory(source = 'manual') {
  if (typeof getPromptText !== 'function') return;
  const text = getPromptText();
  if (!text) return;
  const history = getPromptHistory();
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    source,
    text,
    data: ganfpuHistoryData(),
  };
  if (history[0]?.text === text) {
    history[0].createdAt = item.createdAt;
    history[0].source = source;
  } else {
    history.unshift(item);
  }
  localStorage.setItem(GANFPU_HISTORY_KEY, JSON.stringify(history.slice(0, GANFPU_HISTORY_MAX)));
}

function loadHistoryItem(item) {
  if (!item?.data || typeof FIELDS === 'undefined') return;
  FIELDS.forEach((f) => {
    const el = document.getElementById(f.id);
    if (el) el.value = item.data[f.id] || '';
  });
  ['f-format-custom', 'f-hallucination-custom'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = item.data[id] || '';
  });
  if (typeof update === 'function') update();
}

function deleteHistoryItem(id) {
  localStorage.setItem(
    GANFPU_HISTORY_KEY,
    JSON.stringify(getPromptHistory().filter((x) => x.id !== id))
  );
  renderHistory();
}

function clearPromptHistory() {
  localStorage.removeItem(GANFPU_HISTORY_KEY);
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('ganfpu-history-list');
  const empty = document.getElementById('ganfpu-history-empty');
  if (!list || !empty) return;
  list.querySelectorAll('.ganfpu-history-item').forEach((x) => x.remove());
  const history = getPromptHistory();
  empty.hidden = history.length > 0;
  history.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'ganfpu-history-item';
    const load = document.createElement('button');
    load.type = 'button';
    load.className = 'ganfpu-history-load';
    load.textContent = item.text.length > 180 ? `${item.text.slice(0, 180)}…` : item.text;
    load.onclick = () => {
      loadHistoryItem(item);
      document.getElementById('ganfpu-history-modal').style.display = 'none';
    };
    const meta = document.createElement('small');
    meta.className = 'ganfpu-history-meta';
    meta.textContent = new Date(item.createdAt).toLocaleString(
      document.documentElement.lang || 'ja'
    );
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ganfpu-history-delete';
    del.textContent = '×';
    del.onclick = () => deleteHistoryItem(item.id);
    row.append(load, meta, del);
    list.appendChild(row);
  });
}

function initHistoryUI() {
  if (document.getElementById('ganfpu-history-btn')) return;
  const anchor = document.querySelector('#normal-mode .normal-power-toggle');
  if (!anchor) return;
  const style = document.createElement('style');
  style.textContent = `#ganfpu-history-btn{width:100%;justify-content:center;margin-top:10px}.ganfpu-history-card{width:min(760px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:16px}.ganfpu-history-body{min-height:0;overflow-y:auto;padding:10px}.ganfpu-history-item{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:10px;border-bottom:1px solid var(--border)}.ganfpu-history-load{min-width:0;border:0;background:transparent;color:var(--text);text-align:left;cursor:pointer;white-space:normal;overflow-wrap:anywhere}.ganfpu-history-meta{color:var(--text-dim);font-size:11px}.ganfpu-history-delete{border:0;background:transparent;color:var(--text-dim);font-size:20px;cursor:pointer}@media(max-width:700px){.ganfpu-history-item{grid-template-columns:1fr auto}.ganfpu-history-meta{grid-column:1}.ganfpu-history-delete{grid-column:2;grid-row:1/span 2}}`;
  document.head.appendChild(style);
  const button = document.createElement('button');
  button.id = 'ganfpu-history-btn';
  button.type = 'button';
  button.className = 'btn btn-secondary';
  button.textContent = 'History';
  button.onclick = () => {
    renderHistory();
    document.getElementById('ganfpu-history-modal').style.display = 'flex';
  };
  anchor.appendChild(button);
  const modal = document.createElement('div');
  modal.id = 'ganfpu-history-modal';
  modal.style.cssText =
    'position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55)';
  modal.innerHTML =
    '<div class="ganfpu-history-card"><div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border)"><strong>Prompt History</strong><div><button type="button" class="btn btn-secondary" id="ganfpu-history-clear">Clear</button> <button type="button" class="btn btn-secondary" id="ganfpu-history-close">×</button></div></div><div class="ganfpu-history-body" id="ganfpu-history-list"><div id="ganfpu-history-empty" style="padding:28px 12px;text-align:center;color:var(--text-dim)">No saved prompts.</div></div></div>';
  document.body.appendChild(modal);
  document.getElementById('ganfpu-history-close').onclick = () => {
    modal.style.display = 'none';
  };
  document.getElementById('ganfpu-history-clear').onclick = () => {
    if (confirm('Clear all prompt history?')) clearPromptHistory();
  };
  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = 'none';
  };
}

function wireHistoryActions() {
  const wrap = (name, source) => {
    const original = window[name];
    if (typeof original !== 'function' || original._ganfpuHistoryWrapped) return;
    const wrapped = function () {
      const result = original.apply(this, arguments);
      Promise.resolve(result).then(() => recordHistory(source));
      return result;
    };
    wrapped._ganfpuHistoryWrapped = true;
    window[name] = wrapped;
  };
  wrap('copyPrompt', 'copy');
  wrap('downloadPrompt', 'download');
  wrap('sharePrompt', 'share');
  wrap('applyGrillMeResult', 'grill');
}

window.recordHistory = recordHistory;
window.loadHistoryItem = loadHistoryItem;
window.initHistoryUI = initHistoryUI;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      initHistoryUI();
      wireHistoryActions();
    }, 1000);
  });
} else {
  setTimeout(() => {
    initHistoryUI();
    wireHistoryActions();
  }, 1000);
}
