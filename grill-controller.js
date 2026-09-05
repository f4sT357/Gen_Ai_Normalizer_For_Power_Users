(() => {
  'use strict';

  const el = (id) => document.getElementById(id);
  const FIELD_IDS = ['f-role','f-task','f-context','f-constraint','f-format','f-tone','f-length','f-reasoning','f-lang','f-hallucination'];
  const llm = () => window.ganfpuLLMAdapter || window.ganfpuLLM;
  let grillState = createState();

  function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function createState() {
    return { messages: [], model: { version: 1, intent: null, requirements: [], knowledge: [], pending: [] }, discovery: { asked: [], completed: false }, currentAction: null, interviewComplete: false };
  }
  function providerReady() { return !!window.ganfpuLLM?.ensureReady && window.ganfpuLLM.ensureReady(); }
  function providerLabel() {
    const provider = window.ganfpuLLM; if (!provider) return '';
    const label = typeof provider.getProviderLabel === 'function' ? provider.getProviderLabel() : '';
    const model = typeof provider.getModel === 'function' ? provider.getModel() : '';
    return [label, model].filter(Boolean).join(' · ');
  }
  function userMessages() { return grillState.messages.filter((message) => message.role === 'user' && !message.synthetic); }
  function appendGrillMessage(role, content) { const value = text(content), log = el('grillChatLog'); if (!value || !log) return; const div = document.createElement('div'); div.className = `grill-message ${role}`; div.textContent = value; log.appendChild(div); log.scrollTop = log.scrollHeight; }
  function setCoreMessages() { grillState.messages = grillState.messages.filter((message) => !(message.role === 'user' && message.synthetic)); }
  function recordAction(action) {
    if (!action || action.type !== 'ask_user') return;
    if (!Array.isArray(grillState.discovery.asked)) grillState.discovery.asked = [];
    const id = text(action.id) || `action_${String(grillState.discovery.asked.length + 1).padStart(2, '0')}`;
    if (!grillState.discovery.asked.some((item) => text(item.id) === id)) grillState.discovery.asked.push({ id, question: text(action.question), target: action.target ? { ...action.target } : null });
  }
  async function respond() {
    const send = el('btn-grill-send'), input = el('grillInput');
    if (send) send.disabled = true; if (input) input.disabled = true;
    appendGrillMessage('system', 'Thinking...');
    try {
      const result = await window.ganfpuCore.step({ messages: grillState.messages, model: grillState.model, discovery: grillState.discovery });
      grillState.model = result.model || grillState.model; grillState.discovery = result.discovery || grillState.discovery; grillState.currentAction = result.action || null;
      const log = el('grillChatLog'); if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild);
      if (result.action?.type === 'ask_user') { recordAction(result.action); appendGrillMessage('ai', result.action.question); }
      else if (result.action?.type === 'complete') { grillState.interviewComplete = true; grillState.discovery.completed = true; appendGrillMessage('system', 'No further user-grounded requirement needs clarification. You can apply the collected requirements.'); const apply = el('btn-grill-apply'); if (apply) apply.disabled = false; }
      else if (!result.action) { grillState.interviewComplete = true; appendGrillMessage('system', 'No further user-grounded requirement needs clarification. You can apply the collected requirements.'); const apply = el('btn-grill-apply'); if (apply) apply.disabled = false; }
    } catch (error) {
      const log = el('grillChatLog'); if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild);
      appendGrillMessage('system', `Error: ${error.message}`);
    } finally {
      if (send) send.disabled = grillState.interviewComplete; if (input) input.disabled = grillState.interviewComplete;
    }
  }
  async function send() {
    const input = el('grillInput'), value = text(input?.value);
    if (!value || input?.disabled || grillState.interviewComplete) return;
    grillState.messages.push({ role: 'user', content: value, id: `msg_${String(userMessages().length + 1).padStart(2, '0')}` });
    appendGrillMessage('user', value); if (input) input.value = '';
    await respond();
  }
  async function start() {
    if (!providerReady()) return;
    const input = el('normal-intent'), intent = text(input?.value); if (!intent) { input?.focus(); return; }
    grillState = createState(); grillState.messages.push({ role: 'user', content: intent, id: 'msg_01' });
    const modal = el('grillModal'), log = el('grillChatLog'), inputArea = el('grillInput');
    if (modal) modal.style.display = 'flex'; if (log) log.innerHTML = ''; if (inputArea) inputArea.value = '';
    appendGrillMessage('system', providerLabel()); await respond();
  }
  function sourceBacked(value, source, messages) { const v = text(value), s = text(source); return !!v && !!s && messages.some((message) => text(message.content).includes(s)) && s.includes(v.replace(/^カスタム:\s*/i, '')); }
  async function apply() {
    if (!providerReady()) return;
    const users = userMessages(); if (!users.length) return;
    appendGrillMessage('system', 'Structuring requirements into Prompt Specification...');
    const instruction = `Map ONLY explicitly stated user requirements into the fixed Prompt Specification fields. Assistant messages are questions only. Do not infer anything. Every non-empty field needs a source quote from a USER message. Empty fields stay empty. Allowed fields: ${FIELD_IDS.join(', ')}. For f-hallucination use only an allowed policy or an explicitly user-stated custom policy. Return ONLY valid JSON in the form {"f-task":{"value":"","source":""}} for every field. USER MESSAGES: ${JSON.stringify(users)}`;
    try {
      const adapter = llm(); const raw = await adapter.request([{ role: 'system', content: 'Map user-authored requirements only. Do not invent.' }, { role: 'user', content: instruction }], 0.2);
      const parsed = JSON.parse(text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
      for (const id of FIELD_IDS) {
        const field = el(id); if (!field) continue; const entry = parsed?.[id] && typeof parsed[id] === 'object' ? parsed[id] : {}; const value = text(entry.value), source = text(entry.source);
        if (!value || (id !== 'f-hallucination' || value !== '指定なし') && !sourceBacked(value, source, users)) { field.value = ''; continue; }
        if (field.tagName === 'SELECT') { const option = [...field.options].find((item) => item.value === value); if (option) field.value = value; else if (id === 'f-format' || id === 'f-hallucination') { field.value = 'custom'; const custom = el(`${id}-custom`); if (custom) { custom.value = value.replace(/^カスタム:\s*/i, ''); custom.style.display = 'block'; } } } else field.value = value;
      }
      if (typeof window.update === 'function') window.update(); if (typeof window.recordHistory === 'function') window.recordHistory('grill'); closeGrillMe(); if (typeof window.showToast === 'function') window.showToast('Prompt Specification updated from interview.');
    } catch (error) { console.error(error); appendGrillMessage('system', 'Failed to map the interview to structured fields.'); }
  }
  function bind() {
    const sendButton = el('btn-grill-send'), applyButton = el('btn-grill-apply'); if (!sendButton || !applyButton) return false;
    const freshSend = sendButton.cloneNode(true); sendButton.replaceWith(freshSend); freshSend.onclick = send;
    const input = el('grillInput'); if (input) { const freshInput = input.cloneNode(true); input.replaceWith(freshInput); freshInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }); }
    const freshApply = applyButton.cloneNode(true); applyButton.replaceWith(freshApply); freshApply.onclick = apply;
    window.applyGrillMeResult = apply; return true;
  }
  function closeGrillMe() { const modal = el('grillModal'); if (modal) modal.style.display = 'none'; grillState = createState(); }
  window.startGrillMe = start; window.closeGrillMe = closeGrillMe; window.applyGrillMeResult = apply;
  window.ganfpuGrillController = Object.freeze({ getState: () => JSON.parse(JSON.stringify(grillState)), start, send, apply });
  bind();
})();
