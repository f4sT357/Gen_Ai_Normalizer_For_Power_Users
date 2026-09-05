(() => {
  'use strict';

  const FIELD_IDS = [
    'f-role', 'f-task', 'f-context', 'f-constraint', 'f-format',
    'f-tone', 'f-length', 'f-reasoning', 'f-lang', 'f-hallucination'
  ];

  let state = null;

  function el(id) { return document.getElementById(id); }
  function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }

  function authoritativeMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
      .filter((message) => message?.role === 'user' && !message?.synthetic);
  }

  function append(role, content) {
    if (typeof window.appendGrillMessage === 'function') {
      window.appendGrillMessage(role, content);
    }
  }

  function renderAction(action) {
    if (!action) return;
    if (action.type === 'ask_user') {
      append('ai', text(action.question));
      return;
    }
    if (action.type === 'complete') {
      append('system', 'Requirement discovery complete.');
    }
  }

  function applyRequirements(model) {
    const requirements = Array.isArray(model?.requirements) ? model.requirements : [];
    const grouped = new Map();

    for (const requirement of requirements) {
      if (text(requirement?.status) !== 'confirmed') continue;
      const fieldId = text(requirement?.field_id);
      const value = text(requirement?.value);
      if (!FIELD_IDS.includes(fieldId) || !value) continue;
      if (!grouped.has(fieldId)) grouped.set(fieldId, []);
      grouped.get(fieldId).push(value);
    }

    for (const fieldId of FIELD_IDS) {
      const field = el(fieldId);
      if (!field) continue;
      const values = grouped.get(fieldId) || [];
      if (!values.length) continue;

      const value = values.join('\n');
      if (field.tagName === 'SELECT') {
        const exact = [...field.options].find((option) => option.value === value);
        if (exact) field.value = exact.value;
        else if (fieldId === 'f-format' || fieldId === 'f-hallucination') {
          field.value = 'custom';
          const custom = el(`${fieldId}-custom`);
          if (custom) {
            custom.value = value.replace(/^カスタム:\s*/i, '');
            custom.style.display = 'block';
          }
        }
      } else {
        field.value = value;
      }
    }

    if (typeof window.update === 'function') window.update();
  }

  async function applyCoreResult() {
    if (!state) return;
    applyRequirements(state.model);
    state.discovery.completed = true;
    const wrap = el('normal-result-wrap');
    const result = el('normal-result');
    const preview = el('preview');
    if (wrap && result && preview && !preview.querySelector('.preview-placeholder')) {
      result.textContent = preview.textContent.trim();
      wrap.hidden = !result.textContent;
    }
    if (typeof window.closeGrillMe === 'function') window.closeGrillMe();
    if (typeof window.showToast === 'function') window.showToast('Prompt Specification updated from Core.');
  }

  async function runCore() {
    if (!window.ganfpuCore?.step) throw new Error('GANFPU Core is unavailable.');
    const result = await window.ganfpuCore.step({
      messages: state.messages,
      model: state.model,
      discovery: state.discovery
    });
    state.model = result.model;
    state.discovery = result.discovery;
    state.currentAction = result.action || null;

    if (result.action?.type === 'ask_user') {
      append('ai', text(result.action.question));
    } else if (result.action?.type === 'complete') {
      state.discovery.completed = true;
      append('system', 'Requirement discovery complete.');
      const applyButton = el('btn-grill-apply');
      if (applyButton) applyButton.disabled = false;
    }
    return result;
  }

  async function start() {
    if (!window.ganfpuLLM?.ensureReady?.()) return;
    const input = el('normal-intent');
    const intent = text(input?.value);
    if (!intent) { input?.focus(); return; }

    const modal = el('grillModal');
    const log = el('grillChatLog');
    const grillInput = el('grillInput');
    if (modal) modal.style.display = 'flex';
    if (log) log.innerHTML = '';
    if (grillInput) grillInput.value = '';

    state = {
      messages: [{ role: 'user', content: intent, id: 'msg_01' }],
      model: { version: 1, intent: null, requirements: [], knowledge: [], pending: [] },
      discovery: { asked: [], completed: false },
      currentAction: null
    };

    append('system', `Core · ${window.ganfpuLLM.getProviderLabel?.() || ''} · ${window.ganfpuLLM.getModel?.() || ''}`);
    await runCore();
  }

  async function send() {
    if (!state || state.discovery.completed) return;
    const input = el('grillInput');
    const value = text(input?.value);
    if (!value) return;

    append('user', value);
    state.messages.push({
      role: 'user',
      content: value,
      id: `msg_${String(authoritativeMessages(state.messages).length + 1).padStart(2, '0')}`
    });
    if (input) input.value = '';
    await runCore();
  }

  function install() {
    if (!window.ganfpuCore) return false;
    window.ganfpuStartGrill = start;
    window.ganfpuApplyGrillResult = applyCoreResult;
    const sendButton = el('btn-grill-send');
    const applyButton = el('btn-grill-apply');
    const input = el('grillInput');

    if (sendButton) {
      const fresh = sendButton.cloneNode(true);
      sendButton.replaceWith(fresh);
      fresh.removeAttribute('onclick');
      fresh.onclick = send;
    }
    if (input) {
      const fresh = input.cloneNode(true);
      input.replaceWith(fresh);
      fresh.removeAttribute('onkeydown');
      fresh.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          send();
        }
      });
    }
    if (applyButton) {
      const fresh = applyButton.cloneNode(true);
      applyButton.replaceWith(fresh);
      fresh.removeAttribute('onclick');
      fresh.onclick = applyCoreResult;
      fresh.disabled = true;
    }
    return true;
  }

  function init() {
    if (install()) return;
    setTimeout(init, 0);
  }

  window.ganfpuCoreUI = Object.freeze({ start, send, apply: applyCoreResult, getState: () => state });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
