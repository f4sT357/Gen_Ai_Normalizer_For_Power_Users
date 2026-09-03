(() => {
  const el = (id) => document.getElementById(id);

  function buildInitialConversation(intent) {
    const systemPrompt = `You are an expert prompt engineer. Your job is to elicit requirements before producing a final prompt.
Rules:
1. Treat the user's current intent below as the ONLY source of task context.
2. Do not use, infer, or import information from existing Prompt Specification fields, Preview content, previous prompts, or previous sessions.
3. Never ask for information already supplied in the current intent or later in this conversation.
4. Do not invent requirements or preferences.
5. Ask only 1 or 2 short, targeted questions per turn.
6. If the domain is specific, make the question domain-specific.
7. Reply in the user's language.`;
    const user = `Current user intent:\n---\n${intent}\n---\n\nAsk me 1 or 2 targeted questions to resolve the most important ambiguity in this request.`;
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: user },
    ];
  }

  async function respond() {
    const send = el('btn-grill-send'), input = el('grillInput');
    if (send) send.disabled = true;
    if (input) input.disabled = true;
    appendGrillMessage('system', 'Thinking...');
    try {
      const reply = await window.ganfpuLLM.request(grillMessages, 0.7);
      const log = el('grillChatLog');
      if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild);
      grillMessages.push({ role: 'assistant', content: reply });
      appendGrillMessage('ai', reply);
    } catch (e) {
      const log = el('grillChatLog');
      if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild);
      appendGrillMessage('system', `Error: ${e.message}`);
    } finally {
      if (send) send.disabled = false;
      if (input) input.disabled = false;
      requestAnimationFrame(() => {
        const log = el('grillChatLog');
        if (log) log.scrollTop = log.scrollHeight;
      });
    }
  }

  async function start() {
    if (!window.ganfpuLLM || !window.ganfpuLLM.ensureReady()) return;
    const input = el('normal-intent'), task = el('f-task');
    const intent = input?.value.trim();
    if (!intent || !task) {
      input?.focus();
      return;
    }
    task.value = intent;
    update();
    el('grillModal').style.display = 'flex';
    el('grillChatLog').innerHTML = '';
    el('grillInput').value = '';
    grillMessages = buildInitialConversation(intent);
    appendGrillMessage('system', `Using ${window.ganfpuLLM.getProviderLabel()} · ${window.ganfpuLLM.getModel()}`);
    await respond();
  }

  async function copyText(text) {
    if (!text) return false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (e) {}
    ta.remove();
    return copied;
  }

  async function copyResult() {
    const result = el('normal-result'), preview = el('preview');
    const text = result?.textContent.trim() || preview?.textContent.trim() || '';
    if (!text || preview?.querySelector('.preview-placeholder')) {
      showToast('Nothing to copy.');
      return;
    }
    if (await copyText(text)) showToast('Copied to clipboard.');
    else showToast('Copy failed. Please select and copy the text manually.');
  }

  async function apply() {
    if (!window.ganfpuLLM || !window.ganfpuLLM.ensureReady()) return;
    appendGrillMessage('system', 'Structuring requirements into Prompt Specification...');
    const instruction = `Based ONLY on the current Grill Me conversation, structure the final requirements into this JSON format. Existing form fields and Preview content are not context and must be ignored. Output ONLY valid JSON, with every key present. Do not invent requirements.
For f-hallucination, use ONLY one of these policy values: "指定なし", "不確実な情報を明示", "事実確認を要求", "根拠・出典を要求", "不明な場合は回答しない". If the user explicitly wants another policy, use "カスタム: ...". If the user did not specify a hallucination policy, use "指定なし".
{
  "f-role":"", "f-task":"", "f-context":"", "f-constraint":"", "f-format":"", "f-tone":"", "f-length":"", "f-reasoning":"", "f-lang":"", "f-hallucination":"指定なし"
}`;
    grillMessages.push({ role: 'user', content: instruction });
    try {
      const reply = (await window.ganfpuLLM.request(grillMessages, 0.2)).trim();
      const match = reply.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : reply);
      [
        'f-role', 'f-task', 'f-context', 'f-constraint', 'f-format',
        'f-tone', 'f-length', 'f-reasoning', 'f-lang', 'f-hallucination',
      ].forEach((id) => {
        const field = el(id);
        if (!field) return;
        const value = typeof parsed[id] === 'string' ? parsed[id] : '';
        if (field.tagName === 'SELECT') {
          if ([...field.options].some((o) => o.value === value)) field.value = value;
          else if (value) {
            field.value = 'custom';
            const custom = el(id + '-custom');
            if (custom) {
              custom.value = value.replace(/^カスタム:\s*/, '');
              custom.style.display = 'block';
            }
          }
        } else field.value = value;
      });
      update();
      const preview = el('preview'), result = el('normal-result'), wrap = el('normal-result-wrap');
      if (preview && result && wrap && preview.textContent.trim() && !preview.querySelector('.preview-placeholder')) {
        result.textContent = preview.textContent.trim();
        wrap.hidden = false;
      }
      if (typeof window.recordHistory === 'function') window.recordHistory('grill');
      closeGrillMe();
      el('normal-intent').value = el('f-task')?.value || el('normal-intent').value;
      showToast('Prompt Specification updated from interview.');
    } catch (e) {
      console.error(e);
      appendGrillMessage('system', 'Failed to map the interview to structured fields.');
    }
  }

  function bind() {
    const sendButton = el('btn-grill-send'), applyButton = el('btn-grill-apply');
    if (!sendButton || !applyButton || !window.ganfpuLLM) return false;
    sendButton.onclick = send;
    applyButton.onclick = apply;
    const resultCopy = el('normal-result-copy');
    if (resultCopy) {
      const freshCopy = resultCopy.cloneNode(true);
      resultCopy.replaceWith(freshCopy);
      freshCopy.onclick = copyResult;
    }
    window.applyGrillMeResult = apply;
    return true;
  }

  function init() {
    if (bind()) return;
    setTimeout(init, 100);
  }

  window.ganfpuStartGrill = start;
  window.ganfpuApplyGrillResult = apply;
  init();
})();
