// ============================================================
// GANFPU Free API providers
// Browser-side BYOK integration for GitHub Pages.
// No shared API keys are embedded in the repository.
// API keys stay in memory by default and are never sent to GANFPU.
// ============================================================

(() => {
  const KEY_STORAGE = 'ganfpu_free_api';
  const PROVIDERS = {
    lmstudio: {
      label: 'LM Studio',
      endpoint: '',
      model: '',
    },
    groq: {
      label: 'Groq',
      endpoint: 'https://api.groq.com/openai/v1',
      model: 'openai/gpt-oss-20b',
    },
    openrouter: {
      label: 'OpenRouter Free',
      endpoint: 'https://openrouter.ai/api/v1',
      model: 'openrouter/free',
    },
  };

  let provider = localStorage.getItem('ganfpu_provider') || 'lmstudio';
  // API key is intentionally memory-only unless the user explicitly opts in.
  let apiKey = localStorage.getItem(KEY_STORAGE) || '';
  let model = localStorage.getItem('ganfpu_model') || '';
  let saveKey = !!localStorage.getItem(KEY_STORAGE);

  function el(id) {
    return document.getElementById(id);
  }
  function currentProvider() {
    return PROVIDERS[provider] || PROVIDERS.lmstudio;
  }

  function injectStyles() {
    if (el('free-api-style')) return;
    const s = document.createElement('style');
    s.id = 'free-api-style';
    s.textContent = `
            .free-api-box { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
            .free-api-row { display:flex; gap:8px; align-items:center; margin-top:8px; }
            .free-api-row select, .free-api-row input { flex:1; min-width:0; }
            #free-api-key { font-family: monospace; }
            .free-api-save-row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-top:8px; }
            .free-api-checkbox { display:flex; gap:6px; align-items:center; font-size:12px; color:var(--text-dim); }
            .free-api-checkbox input { flex:none; width:auto; }
            .free-api-note { margin-top:8px; color:var(--text-dim); font-size:11px; line-height:1.5; }
            .free-api-status { margin-top:8px; font-size:11px; color:var(--text-dim); }
            .free-api-status.ready { color:var(--accent3); }
            @media(max-width:700px){ .free-api-row{flex-direction:column;align-items:stretch}.free-api-row button{width:100%}.free-api-save-row{align-items:stretch;flex-direction:column} }
        `;
    document.head.appendChild(s);
  }

  function createUI() {
    const hero = el('normal-mode')?.querySelector('.normal-hero');
    if (!hero || el('free-api-box')) return;
    const box = document.createElement('div');
    box.id = 'free-api-box';
    box.className = 'free-api-box';
    box.innerHTML = `
            <div class="free-api-row">
                <select id="free-api-provider" aria-label="LLM provider">
                    <option value="lmstudio">LM Studio</option>
                    <option value="groq">Groq</option>
                    <option value="openrouter">OpenRouter Free</option>
                </select>
            </div>
            <div class="free-api-row" id="free-api-key-row">
                <input id="free-api-key" type="password" autocomplete="off" placeholder="API key">
            </div>
            <div class="free-api-save-row" id="free-api-save-row">
                <label class="free-api-checkbox">
                    <input id="free-api-save-key" type="checkbox">
                    <span>この端末に保存する</span>
                </label>
                <button class="btn btn-secondary btn-sm" id="free-api-save" type="button">設定を保存</button>
                <button class="btn btn-secondary btn-sm" id="free-api-clear" type="button">保存したキーを削除</button>
            </div>
            <div class="free-api-row">
                <input id="free-api-model" type="text" autocomplete="off" placeholder="Model ID">
                <button class="btn btn-secondary btn-sm" id="free-api-models" type="button">Fetch models</button>
            </div>
            <div class="free-api-status" id="free-api-status"></div>
            <div class="free-api-note" id="free-api-note"></div>
        `;
    hero.appendChild(box);

    el('free-api-provider').value = provider;
    el('free-api-save-key').checked = saveKey;
    el('free-api-provider').addEventListener('change', () => {
      provider = el('free-api-provider').value;
      if (provider === 'lmstudio') {
        model = '';
      } else if (!model || provider !== localStorage.getItem('ganfpu_provider')) {
        model = PROVIDERS[provider].model;
      }
      renderProvider();
    });
    el('free-api-save-key').addEventListener('change', () => {
      saveKey = el('free-api-save-key').checked;
      if (!saveKey) {
        localStorage.removeItem(KEY_STORAGE);
        updateStatus();
      }
    });
    el('free-api-save').addEventListener('click', saveSettings);
    el('free-api-clear').addEventListener('click', clearSavedKey);
    el('free-api-models').addEventListener('click', fetchProviderModels);
    el('free-api-key').addEventListener('input', () => {
      apiKey = el('free-api-key').value;
      updateStatus();
    });
    el('free-api-model').addEventListener('input', () => {
      model = el('free-api-model').value.trim();
    });
    renderProvider();
  }

  function renderProvider() {
    const p = currentProvider();
    const keyRow = el('free-api-key-row');
    const keyInput = el('free-api-key');
    const modelInput = el('free-api-model');
    const modelsBtn = el('free-api-models');
    const saveRow = el('free-api-save-row');
    if (!keyRow || !modelInput) return;

    if (provider === 'lmstudio') {
      keyRow.style.display = 'none';
      if (saveRow) saveRow.style.display = 'none';
      modelsBtn.style.display = 'none';
      modelInput.style.display = 'none';
    } else {
      keyRow.style.display = '';
      if (saveRow) saveRow.style.display = '';
      modelsBtn.style.display = provider === 'groq' ? '' : 'none';
      modelInput.style.display = '';
      keyInput.value = apiKey;
      if (!model || localStorage.getItem('ganfpu_provider') !== provider) model = p.model;
      modelInput.value = model;
    }
    el('free-api-note').textContent =
      provider === 'lmstudio'
        ? 'Local inference. No API key is sent anywhere.'
        : saveKey
          ? 'API requests go directly from your browser to the provider. The API key is saved in this browser because you explicitly enabled it.'
          : 'API requests go directly from your browser to the provider. The API key stays in memory only and disappears when the page is closed.';
    updateStatus();
  }

  function saveSettings() {
    provider = el('free-api-provider').value;
    apiKey = el('free-api-key')?.value.trim() || '';
    model = el('free-api-model')?.value.trim() || '';
    saveKey = !!el('free-api-save-key')?.checked;
    localStorage.setItem('ganfpu_provider', provider);
    localStorage.setItem('ganfpu_model', model);
    if (saveKey && apiKey) {
      localStorage.setItem(KEY_STORAGE, apiKey);
    } else {
      localStorage.removeItem(KEY_STORAGE);
    }
    updateStatus(true);
    renderProvider();
  }

  function clearSavedKey() {
    localStorage.removeItem(KEY_STORAGE);
    saveKey = false;
    const checkbox = el('free-api-save-key');
    if (checkbox) checkbox.checked = false;
    updateStatus();
    renderProvider();
  }

  function updateStatus(saved = false) {
    const s = el('free-api-status');
    if (!s) return;
    if (provider === 'lmstudio') {
      s.textContent = 'Using LM Studio';
      s.classList.add('ready');
      return;
    }
    const ok = !!apiKey;
    if (!ok) {
      s.textContent = 'API key required';
    } else if (saveKey) {
      s.textContent = saved ? 'API key saved on this device' : 'API key configured · saved locally';
    } else {
      s.textContent = 'API key configured · memory only';
    }
    s.classList.toggle('ready', ok);
  }

  async function fetchProviderModels() {
    if (provider !== 'groq') return;
    if (!apiKey) {
      showToast('Enter a Groq API key first.');
      return;
    }
    try {
      const res = await fetch(PROVIDERS.groq.endpoint + '/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const input = el('free-api-model');
      if (!input || !Array.isArray(data.data)) return;
      const wrap = input.parentElement;
      let select = el('free-api-model-select');
      if (select) select.remove();
      select = document.createElement('select');
      select.id = 'free-api-model-select';
      select.style.flex = '1';
      data.data
        .filter((m) => m.active !== false)
        .forEach((m) => {
          const o = document.createElement('option');
          o.value = m.id;
          o.textContent = m.id;
          select.appendChild(o);
        });
      select.value = model;
      select.addEventListener('change', () => {
        model = select.value;
        input.value = model;
      });
      input.style.display = 'none';
      wrap.insertBefore(select, wrap.firstChild);
    } catch (e) {
      console.error(e);
      showToast('Failed to fetch provider models.');
    }
  }

  function getConfig() {
    if (provider === 'lmstudio') {
      return {
        endpoint: (el('lm-endpoint')?.value || 'http://localhost:1234/v1').trim(),
        model: typeof selectedLMModel !== 'undefined' ? selectedLMModel : '',
        headers: { 'Content-Type': 'application/json' },
      };
    }
    return {
      endpoint: currentProvider().endpoint,
      model: model || currentProvider().model,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    };
  }

  function ensureReady() {
    if (provider === 'lmstudio')
      return !!(typeof selectedLMModel !== 'undefined' && selectedLMModel);
    if (!apiKey) {
      showToast('API key is required.');
      return false;
    }
    if (!model) {
      showToast('Model ID is required.');
      return false;
    }
    return true;
  }

  async function request(messages, temperature = 0.7) {
    const cfg = getConfig();
    const res = await fetch(`${cfg.endpoint}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({ model: cfg.model, messages, temperature }),
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error?.message || '';
      } catch (_) {}
      throw new Error(`API request failed (${res.status})${detail ? ': ' + detail : ''}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  function buildInitialConversation() {
    const draftPrompt = typeof getPromptText === 'function' ? getPromptText() || '' : '';
    const filledFields = {};
    const emptyFields = [];
    FIELDS.forEach((f) => {
      const val = typeof getFieldValue === 'function' ? getFieldValue(f.id) : '';
      const key = f.id.replace('f-', '');
      if (val) filledFields[key] = val;
      else emptyFields.push(key);
    });
    const systemPrompt = `You are an expert prompt engineer. Your job is to elicit requirements before producing a final prompt.\nRules:\n1. Identify the highest-value missing requirement.\n2. Never ask for information already supplied.\n3. Do not invent requirements or preferences.\n4. Ask only 1 or 2 short, targeted questions per turn.\n5. If the domain is specific, make the question domain-specific.\n6. Reply in the user's language. Current UI language: ${document.documentElement.lang || 'ja'}.`;
    let user = `Current prompt configuration:\n${JSON.stringify(filledFields, null, 2)}\n\nEmpty fields: ${emptyFields.join(', ')}\n\nPreview:\n---\n${draftPrompt}\n---\n\nAsk me 1 or 2 targeted questions to resolve the most important ambiguity.`;
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: user },
    ];
  }

  async function startProviderGrill() {
    if (!ensureReady()) return;
    const input = el('normal-intent');
    const task = el('f-task');
    if (!input || !task || !input.value.trim()) {
      input?.focus();
      return;
    }
    task.value = input.value.trim();
    update();

    const modal = el('grillModal');
    if (modal) modal.style.display = 'flex';
    const chatLog = el('grillChatLog');
    if (chatLog) chatLog.innerHTML = '';
    const grillInput = el('grillInput');
    if (grillInput) {
      grillInput.value = '';
      grillInput.disabled = false;
    }

    grillMessages = buildInitialConversation();
    appendGrillMessage('system', `Using ${currentProvider().label} · ${getConfig().model}`);
    await getProviderResponse();
  }

  async function getProviderResponse() {
    const send = el('btn-grill-send');
    const input = el('grillInput');
    if (send) send.disabled = true;
    if (input) input.disabled = true;
    appendGrillMessage('system', 'Thinking...');
    try {
      const reply = await request(grillMessages, 0.7);
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
      if (input) {
        input.disabled = false;
      }
      requestAnimationFrame(() => {
        const log = el('grillChatLog');
        if (log) log.scrollTop = log.scrollHeight;
      });
    }
  }

  async function sendProviderResponse() {
    const input = el('grillInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    appendGrillMessage('user', text);
    grillMessages.push({ role: 'user', content: text });
    input.value = '';
    await getProviderResponse();
  }

  async function applyProviderResult() {
    if (!ensureReady()) return;
    appendGrillMessage('system', 'Structuring requirements into Prompt Specification...');
    const finalInstruction = `Based on our entire conversation, produce the final Prompt Specification. Output ONLY valid JSON and include every key. Do not invent requirements. If a value was never specified and is not necessary, use an empty string. Preserve concrete user requirements.\n{\n  "f-role": "",\n  "f-task": "",\n  "f-context": "",\n  "f-constraint": "",\n  "f-format": "",\n  "f-tone": "",\n  "f-length": "",\n  "f-reasoning": "",\n  "f-lang": "",\n  "f-hallucination": ""\n}`;
    grillMessages.push({ role: 'user', content: finalInstruction });
    try {
      const reply = await request(grillMessages, 0.2);
      const match = reply.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : reply);
      const ids = [
        'f-role',
        'f-task',
        'f-context',
        'f-constraint',
        'f-format',
        'f-tone',
        'f-length',
        'f-reasoning',
        'f-lang',
        'f-hallucination',
      ];
      ids.forEach((id) => {
        const value = typeof parsed[id] === 'string' ? parsed[id] : '';
        const field = el(id);
        if (!field) return;
        if (field.tagName === 'SELECT') {
          const has = Array.from(field.options).some((o) => o.value === value);
          if (has) {
            field.value = value;
          } else if (value) {
            field.value = 'custom';
            const custom = el(id + '-custom');
            if (custom) {
              custom.value = value;
              custom.style.display = 'block';
            }
          } else field.value = '';
        } else field.value = value;
      });
      update();
      closeGrillMe();
      const input = el('normal-intent');
      if (input) input.value = el('f-task')?.value || input.value;
      showToast('Prompt Specification updated from interview.');
    } catch (e) {
      console.error(e);
      appendGrillMessage('system', `Failed to structure the result: ${e.message}`);
    }
  }

  function replaceNormalHandlers() {
    const start = el('normal-start');
    if (start) {
      const replacement = start.cloneNode(true);
      start.replaceWith(replacement);
      replacement.addEventListener('click', startProviderGrill);
    }
    const send = el('btn-grill-send');
    if (send) {
      send.onclick = sendProviderResponse;
      send.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
      });
    }
    const apply = el('btn-grill-apply');
    if (apply) apply.onclick = applyProviderResult;
  }

  function init() {
    injectStyles();
    createUI();
    replaceNormalHandlers();
    // Keep the provider controls visible in Normal Mode; Power Mode remains LM Studio-native.
    window.ganfpuFreeApi = { startProviderGrill, sendProviderResponse, applyProviderResult };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})();
