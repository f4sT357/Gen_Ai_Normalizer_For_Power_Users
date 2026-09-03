from pathlib import Path
import re
root = Path('.')
normal = root / 'normal-mode.js'
free = root / 'free-api.js'
index = root / 'index.html'
n = normal.read_text(); f = free.read_text(); h = index.read_text()
n, c = re.subn(r"  function startNormalGrill\(\) \{.*?\n  \}\n\n  function wrapLanguageSwitch", '''  function startNormalGrill() {
    const input = document.getElementById('normal-intent');
    const task = document.getElementById('f-task');
    if (!input || !task) return;
    const intent = input.value.trim();
    if (!intent) { input.focus(); return; }
    task.value = intent;
    update();
    if (typeof window.ganfpuStartGrill === 'function') window.ganfpuStartGrill();
    else showToast('Grill Me is still loading. Try again in a moment.');
  }

  function wrapLanguageSwitch''', n, flags=re.S); assert c == 1
n, c = re.subn(r"  function overrideApply\(\) \{.*?\n  \}\n\n  function init\(\)", '''  function overrideApply() {
    window.applyGrillMeResult = function () {
      if (typeof window.ganfpuApplyGrillResult === 'function') return window.ganfpuApplyGrillResult();
    };
  }

  function init()''', n, flags=re.S); assert c == 1
normal.write_text(n)
bridge = '''  function exposeLLMBridge() {
    window.ganfpuLLM = { request, ensureReady, getProviderLabel: () => currentProvider().label, getModel: () => getConfig().model };
  }

'''
if 'function exposeLLMBridge()' not in f:
    f = f.replace('  function init() {', bridge + '  function init() {', 1)
    f = f.replace('    injectStyles();\n    createUI();', '    injectStyles();\n    createUI();\n    exposeLLMBridge();', 1)
f, c = re.subn(r"  function replaceNormalHandlers\(\) \{.*?\n  \}\n\n  function init\(\)", '''  function replaceNormalHandlers() {
    // Grill Me UI events are owned by grill-controller.js.
  }

  function init()''', f, flags=re.S); assert c == 1
free.write_text(f)
(root / 'grill-controller.js').write_text('''(() => {\n  const el = (id) => document.getElementById(id);\n  function buildInitialConversation() {\n    const filledFields = {}; const emptyFields = [];\n    FIELDS.forEach((f) => { const val = typeof getFieldValue === 'function' ? getFieldValue(f.id) : ''; const key = f.id.replace('f-', ''); if (val) filledFields[key] = val; else emptyFields.push(key); });\n    const systemPrompt = `You are an expert prompt engineer. Your job is to elicit requirements before producing a final prompt.\\nRules: 1. Identify the highest-value missing requirement. 2. Never ask for information already supplied. 3. Do not invent requirements or preferences. 4. Ask only 1 or 2 short, targeted questions per turn. 5. If the domain is specific, make the question domain-specific. 6. Reply in the user's language.`;\n    const user = `Current prompt configuration:\\n${JSON.stringify(filledFields, null, 2)}\\n\\nEmpty fields: ${emptyFields.join(', ')}\\n\\nPreview:\\n---\\n${typeof getPromptText === 'function' ? getPromptText() || '' : ''}\\n---\\n\\nAsk me 1 or 2 targeted questions to resolve the most important ambiguity.`;\n    return [{ role: 'system', content: systemPrompt }, { role: 'user', content: user }];\n  }\n  async function respond() {\n    const send = el('btn-grill-send'), input = el('grillInput'); if (send) send.disabled = true; if (input) input.disabled = true; appendGrillMessage('system', 'Thinking...');\n    try { const reply = await window.ganfpuLLM.request(grillMessages, 0.7); const log = el('grillChatLog'); if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild); grillMessages.push({ role: 'assistant', content: reply }); appendGrillMessage('ai', reply); }\n    catch (e) { const log = el('grillChatLog'); if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild); appendGrillMessage('system', `Error: ${e.message}`); }\n    finally { if (send) send.disabled = false; if (input) input.disabled = false; requestAnimationFrame(() => { const log = el('grillChatLog'); if (log) log.scrollTop = log.scrollHeight; }); }\n  }\n  async function start() {\n    if (!window.ganfpuLLM || !window.ganfpuLLM.ensureReady()) return; const input = el('normal-intent'), task = el('f-task'); if (!input || !task || !input.value.trim()) { input?.focus(); return; } task.value = input.value.trim(); update(); el('grillModal').style.display = 'flex'; el('grillChatLog').innerHTML = ''; el('grillInput').value = ''; grillMessages = buildInitialConversation(); appendGrillMessage('system', `Using ${window.ganfpuLLM.getProviderLabel()} · ${window.ganfpuLLM.getModel()}`); await respond();\n  }\n  async function send() { const input = el('grillInput'); const text = input?.value.trim(); if (!text) return; appendGrillMessage('user', text); grillMessages.push({ role: 'user', content: text }); input.value = ''; await respond(); }\n  async function apply() {\n    if (!window.ganfpuLLM || !window.ganfpuLLM.ensureReady()) return; appendGrillMessage('system', 'Structuring requirements into Prompt Specification...');\n    const instruction = `Based on our conversation, structure the final requirements into this JSON format. Output ONLY valid JSON, with every key present. Do not invent requirements.\\n{\\n  "f-role":"", "f-task":"", "f-context":"", "f-constraint":"", "f-format":"", "f-tone":"", "f-length":"", "f-reasoning":"", "f-lang":"", "f-hallucination":""\\n}`; grillMessages.push({ role: 'user', content: instruction });\n    try { const reply = (await window.ganfpuLLM.request(grillMessages, 0.2)).trim(); const match = reply.match(/\\{[\\s\\S]*\\}/); const parsed = JSON.parse(match ? match[0] : reply); ['f-role','f-task','f-context','f-constraint','f-format','f-tone','f-length','f-reasoning','f-lang','f-hallucination'].forEach((id) => { const field = el(id); if (!field) return; const value = typeof parsed[id] === 'string' ? parsed[id] : ''; if (field.tagName === 'SELECT') { if ([...field.options].some((o) => o.value === value)) field.value = value; else if (value) { field.value = 'custom'; const custom = el(id + '-custom'); if (custom) { custom.value = value; custom.style.display = 'block'; } } } else field.value = value; }); update(); const preview = el('preview'), result = el('normal-result'), wrap = el('normal-result-wrap'); if (preview && result && wrap && preview.textContent.trim() && !preview.querySelector('.preview-placeholder')) { result.textContent = preview.textContent.trim(); wrap.hidden = false; } if (typeof window.recordHistory === 'function') window.recordHistory('grill'); closeGrillMe(); el('normal-intent').value = el('f-task')?.value || el('normal-intent').value; showToast('Prompt Specification updated from interview.'); }\n    catch (e) { console.error(e); appendGrillMessage('system', 'Failed to map the interview to structured fields.'); }\n  }\n  function bind() { const sendButton = el('btn-grill-send'), applyButton = el('btn-grill-apply'); if (!sendButton || !applyButton || !window.ganfpuLLM) return false; sendButton.onclick = send; applyButton.onclick = apply; window.applyGrillMeResult = apply; return true; }\n  function init() { if (bind()) return; setTimeout(init, 100); }\n  window.ganfpuStartGrill = start; window.ganfpuApplyGrillResult = apply; init();\n})();\n''')
if 'src="grill-controller.js"' not in h: h = h.replace('<script src="normal-mode.js"></script>', '<script src="normal-mode.js"></script>\n    <script src="grill-controller.js"></script>', 1)
index.write_text(h)
