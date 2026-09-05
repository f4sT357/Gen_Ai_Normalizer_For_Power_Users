(() => {
  'use strict';

  const el = (id) => document.getElementById(id);
  let grillState = createState();
  let compilerPromise = null;

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function createState() {
    return {
      messages: [],
      model: { version: 1, intent: null, requirements: [], knowledge: [], pending: [] },
      discovery: { asked: [], completed: false },
      currentAction: null,
      interviewComplete: false,
      generatedPrompt: ''
    };
  }

  function providerReady() {
    return !!window.ganfpuLLM?.ensureReady && window.ganfpuLLM.ensureReady();
  }

  function providerLabel() {
    const provider = window.ganfpuLLM;
    if (!provider) return '';
    const label = typeof provider.getProviderLabel === 'function' ? provider.getProviderLabel() : '';
    const model = typeof provider.getModel === 'function' ? provider.getModel() : '';
    return [label, model].filter(Boolean).join(' · ');
  }

  function userMessages() {
    return grillState.messages.filter((message) => message.role === 'user' && !message.synthetic);
  }

  function appendGrillMessage(role, content) {
    const value = text(content);
    const log = el('grillChatLog');
    if (!value || !log) return;
    const div = document.createElement('div');
    div.className = `grill-message ${role}`;
    div.textContent = value;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function recordAction(action) {
    if (!action || action.type !== 'ask_user') return;
    if (!Array.isArray(grillState.discovery.asked)) grillState.discovery.asked = [];
    const id = text(action.id) || `action_${String(grillState.discovery.asked.length + 1).padStart(2, '0')}`;
    if (!grillState.discovery.asked.some((item) => text(item.id) === id)) {
      grillState.discovery.asked.push({ id, question: text(action.question), target: action.target ? { ...action.target } : null });
    }
  }

  function ensurePromptCompiler() {
    if (window.ganfpuPromptCompiler?.compile) return Promise.resolve(window.ganfpuPromptCompiler);
    if (compilerPromise) return compilerPromise;

    compilerPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'core/prompt-compiler.js';
      script.async = true;
      script.onload = () => {
        if (window.ganfpuPromptCompiler?.compile) resolve(window.ganfpuPromptCompiler);
        else reject(new Error('Prompt Compiler loaded but API is unavailable.'));
      };
      script.onerror = () => reject(new Error('Prompt Compiler could not be loaded.'));
      document.head.appendChild(script);
    });
    return compilerPromise;
  }

  function compileGeneratedPrompt() {
    const requirements = Array.isArray(grillState.model?.requirements) ? grillState.model.requirements : [];
    const specification = {};
    const prefixes = {};

    requirements.forEach((requirement) => {
      if (text(requirement?.status) !== 'confirmed') return;
      const fieldId = text(requirement?.field_id);
      const value = text(requirement?.value);
      if (!fieldId || !value) return;
      const field = fieldId.replace(/^f-/, '');
      specification[field] = value;
    });

    const lang = document.documentElement.lang || 'ja';
    const i18n = window.I18N;
    if (i18n?.[lang]) {
      Object.keys(i18n[lang]).forEach((key) => {
        if (key.startsWith('prefix-')) prefixes[key] = i18n[lang][key];
      });
    }

    return window.ganfpuPromptCompiler.compile(specification, prefixes);
  }

  async function respond() {
    const send = el('btn-grill-send');
    const input = el('grillInput');
    if (send) send.disabled = true;
    if (input) input.disabled = true;
    appendGrillMessage('system', 'Thinking...');
    try {
      if (!window.ganfpuCore?.step) throw new Error('GANFPU Core is unavailable.');
      const result = await window.ganfpuCore.step({ messages: grillState.messages, model: grillState.model, discovery: grillState.discovery });
      grillState.model = result.model || grillState.model;
      grillState.discovery = result.discovery || grillState.discovery;
      grillState.currentAction = result.action || null;
      const log = el('grillChatLog');
      if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild);
      if (result.action?.type === 'ask_user') {
        recordAction(result.action);
        appendGrillMessage('ai', result.action.question);
      } else if (result.action?.type === 'complete') {
        grillState.interviewComplete = true;
        grillState.discovery.completed = true;
        try {
          await ensurePromptCompiler();
          grillState.generatedPrompt = compileGeneratedPrompt();
          const resultEl = el('normal-result');
          const resultWrap = el('normal-result-wrap');
          if (resultEl && resultWrap && grillState.generatedPrompt) {
            resultEl.textContent = grillState.generatedPrompt;
            resultWrap.hidden = false;
          }
        } catch (error) {
          console.warn('[GANFPU] Prompt compilation failed:', error);
        }
        appendGrillMessage('system', 'No further user-grounded requirement needs clarification. You can apply the collected requirements.');
        const apply = el('btn-grill-apply');
        if (apply) apply.disabled = false;
      } else if (result.status === 'blocked') {
        appendGrillMessage('system', 'Requirement discovery is temporarily unavailable. The collected requirements were not treated as complete.');
      }
    } catch (error) {
      const log = el('grillChatLog');
      if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild);
      appendGrillMessage('system', `Error: ${error.message}`);
    } finally {
      if (send) send.disabled = grillState.interviewComplete;
      if (input) input.disabled = grillState.interviewComplete;
    }
  }

  async function send() {
    const input = el('grillInput');
    const value = text(input?.value);
    if (!value || input?.disabled || grillState.interviewComplete) return;
    grillState.messages.push({ role: 'user', content: value, id: `msg_${String(userMessages().length + 1).padStart(2, '0')}` });
    appendGrillMessage('user', value);
    if (input) input.value = '';
    await respond();
  }

  async function start() {
    if (!providerReady()) return;
    const input = el('normal-intent');
    const intent = text(input?.value);
    if (!intent) { input?.focus(); return; }
    grillState = createState();
    grillState.messages.push({ role: 'user', content: intent, id: 'msg_01' });
    const modal = el('grillModal'), log = el('grillChatLog'), inputArea = el('grillInput'), applyButton = el('btn-grill-apply');
    if (modal) modal.style.display = 'flex';
    if (log) log.innerHTML = '';
    if (inputArea) inputArea.value = '';
    if (applyButton) applyButton.disabled = true;
    appendGrillMessage('system', providerLabel());
    await respond();
  }

  function closeGrillMe() {
    const modal = el('grillModal');
    if (modal) modal.style.display = 'none';
    grillState = createState();
  }

  async function apply() {
    if (!providerReady()) return;
    const requirements = Array.isArray(grillState.model?.requirements) ? grillState.model.requirements : [];
    const confirmed = requirements.filter((requirement) => text(requirement?.status) === 'confirmed' && text(requirement?.field_id) && text(requirement?.value));
    for (const requirement of confirmed) {
      const field = el(text(requirement.field_id));
      if (!field) continue;
      const value = text(requirement.value);
      if (field.tagName === 'SELECT') {
        const option = [...field.options].find((item) => item.value === value);
        if (option) field.value = value;
        else if (field.id === 'f-format' || field.id === 'f-hallucination') {
          field.value = 'custom';
          const custom = el(`${field.id}-custom`);
          if (custom) { custom.value = value.replace(/^カスタム:\s*/i, ''); custom.style.display = 'block'; }
        }
      } else field.value = value;
    }
    if (typeof window.update === 'function') window.update();
    if (typeof window.recordHistory === 'function') window.recordHistory('grill');
    closeGrillMe();
    if (typeof window.showToast === 'function') window.showToast('Prompt Specification updated from Requirement Model.');
  }

  function bind() {
    const sendButton = el('btn-grill-send');
    const applyButton = el('btn-grill-apply');
    if (!sendButton || !applyButton) return false;
    const freshSend = sendButton.cloneNode(true);
    sendButton.replaceWith(freshSend);
    freshSend.onclick = send;
    const input = el('grillInput');
    if (input) {
      const freshInput = input.cloneNode(true);
      input.replaceWith(freshInput);
      freshInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
      });
    }
    const freshApply = applyButton.cloneNode(true);
    applyButton.replaceWith(freshApply);
    freshApply.onclick = apply;
    freshApply.disabled = true;
    window.applyGrillMeResult = apply;
    return true;
  }

  window.startGrillMe = start;
  window.closeGrillMe = closeGrillMe;
  window.applyGrillMeResult = apply;
  window.ganfpuGrillController = Object.freeze({ getState: () => JSON.parse(JSON.stringify(grillState)), start, send, apply });
  bind();
})();
