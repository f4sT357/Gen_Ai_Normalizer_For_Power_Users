// ============================================================
// GANFPU Normal Mode
// Keeps the existing Power Mode intact while making intent-first
// requirement elicitation the default experience.
// ============================================================

(() => {
    const COPY = {
        ja: {
            eyebrow: 'INTENT → PROMPT', title: 'AIに何をさせたい？', placeholder: '例：このコードのバグを見つけて直して', start: 'Grill Me / Normalize', power: 'Power Mode', powerDesc: 'Prompt Specificationを手動で編集', needModel: '先にPower ModeでLM Studioのモデルを選択してください。', active: 'Power Modeを閉じる', model: 'LM Studioのモデルが選択されています', noModel: 'LM Studioのモデル未選択'
        },
        en: { eyebrow: 'INTENT → PROMPT', title: 'What do you want the AI to do?', placeholder: 'e.g. Find and fix the bugs in this code', start: 'Grill Me / Normalize', power: 'Power Mode', powerDesc: 'Manually edit the Prompt Specification', needModel: 'Select an LM Studio model in Power Mode first.', active: 'Close Power Mode', model: 'LM Studio model selected', noModel: 'No LM Studio model selected' },
        zh: { eyebrow: 'INTENT → PROMPT', title: '你希望 AI 做什么？', placeholder: '例如：找出并修复这段代码中的错误', start: 'Grill Me / Normalize', power: 'Power Mode', powerDesc: '手动编辑 Prompt Specification', needModel: '请先在 Power Mode 中选择 LM Studio 模型。', active: '关闭 Power Mode', model: '已选择 LM Studio 模型', noModel: '未选择 LM Studio 模型' },
        ko: { eyebrow: 'INTENT → PROMPT', title: 'AI에게 무엇을 시키고 싶나요?', placeholder: '예: 이 코드의 버그를 찾아 수정해줘', start: 'Grill Me / Normalize', power: 'Power Mode', powerDesc: 'Prompt Specification 직접 편집', needModel: '먼저 Power Mode에서 LM Studio 모델을 선택하세요.', active: 'Power Mode 닫기', model: 'LM Studio 모델이 선택됨', noModel: 'LM Studio 모델이 선택되지 않음' },
        es: { eyebrow: 'INTENT → PROMPT', title: '¿Qué quieres que haga la IA?', placeholder: 'Ej.: Encuentra y corrige los errores de este código', start: 'Grill Me / Normalize', power: 'Power Mode', powerDesc: 'Editar manualmente el Prompt Specification', needModel: 'Selecciona primero un modelo de LM Studio en Power Mode.', active: 'Cerrar Power Mode', model: 'Modelo de LM Studio seleccionado', noModel: 'Sin modelo de LM Studio seleccionado' },
        fr: { eyebrow: 'INTENT → PROMPT', title: 'Que voulez-vous faire faire à l’IA ?', placeholder: 'Ex. : Trouve et corrige les bugs de ce code', start: 'Grill Me / Normalize', power: 'Power Mode', powerDesc: 'Modifier le Prompt Specification', needModel: 'Sélectionnez d’abord un modèle LM Studio dans Power Mode.', active: 'Fermer Power Mode', model: 'Modèle LM Studio sélectionné', noModel: 'Aucun modèle LM Studio sélectionné' }
    };

    let normalMode = true;
    let powerButton = null;
    function copy() { return COPY[document.documentElement.lang] || COPY.ja; }

    function injectStyles() {
        if (document.getElementById('normal-mode-style')) return;
        const style = document.createElement('style');
        style.id = 'normal-mode-style';
        style.textContent = `
            #normal-mode { max-width: 920px; margin: 42px auto 28px; }
            .normal-hero { padding: 38px 34px 32px; border: 1px solid var(--border); border-radius: 18px; background: linear-gradient(145deg, var(--surface), var(--surface2)); box-shadow: 0 18px 50px rgba(0,0,0,.18); }
            .normal-eyebrow { font-family: Syne, sans-serif; font-size: 11px; letter-spacing: .16em; color: var(--accent3); margin-bottom: 12px; font-weight: 700; }
            .normal-title { font-family: Syne, 'Noto Sans JP', sans-serif; font-size: clamp(25px, 4vw, 38px); line-height: 1.15; margin-bottom: 22px; }
            #normal-intent { width: 100%; min-height: 116px; resize: vertical; font-size: 16px; line-height: 1.65; padding: 16px 18px; border-radius: 12px; }
            .normal-actions { display: flex; gap: 10px; align-items: stretch; margin-top: 14px; }
            #normal-start { flex: 1; min-height: 46px; font-weight: 700; justify-content: center; }
            #normal-model-status { display: flex; align-items: center; padding: 0 13px; border: 1px solid var(--border); border-radius: 10px; color: var(--text-dim); font-size: 12px; white-space: nowrap; }
            #normal-model-status.ready { color: var(--accent3); border-color: rgba(106,247,200,.35); }
            .normal-power-toggle { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border); }
            #normal-power { width: 100%; justify-content: center; }
            .normal-power-desc { margin-top: 8px; text-align: center; color: var(--text-dim); font-size: 12px; }
            @media (max-width: 700px) { #normal-mode { margin: 22px 0; } .normal-hero { padding: 26px 20px 22px; } .normal-actions { flex-direction: column; } #normal-model-status { min-height: 38px; justify-content: center; } }
        `;
        document.head.appendChild(style);
    }

    function createUI() {
        if (document.getElementById('normal-mode')) return;
        const mainGrid = document.querySelector('.main-grid');
        if (!mainGrid) return;
        const wrap = document.createElement('section');
        wrap.id = 'normal-mode';
        wrap.innerHTML = `
            <div class="normal-hero">
                <div class="normal-eyebrow" id="normal-eyebrow"></div>
                <h1 class="normal-title" id="normal-title"></h1>
                <textarea id="normal-intent" autocomplete="off"></textarea>
                <div class="normal-actions">
                    <button class="btn btn-primary" id="normal-start" type="button"></button>
                    <div id="normal-model-status"></div>
                </div>
                <div class="normal-power-toggle">
                    <button class="btn btn-secondary" id="normal-power" type="button"></button>
                    <div class="normal-power-desc" id="normal-power-desc"></div>
                </div>
            </div>
        `;
        mainGrid.parentNode.insertBefore(wrap, mainGrid);
        powerButton = document.getElementById('normal-power');
        document.getElementById('normal-start').addEventListener('click', startNormalGrill);
        powerButton.addEventListener('click', togglePowerMode);
        const input = document.getElementById('normal-intent');
        input.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); startNormalGrill(); } });
    }

    function applyCopy() {
        const c = copy();
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
        set('normal-eyebrow', c.eyebrow); set('normal-title', c.title);
        const input = document.getElementById('normal-intent'); if (input) input.placeholder = c.placeholder;
        set('normal-start', c.start); set('normal-power', normalMode ? c.power : c.active); set('normal-power-desc', c.powerDesc); updateModelStatus();
    }

    function updateModelStatus() {
        const el = document.getElementById('normal-model-status'); if (!el) return;
        const c = copy(); const ready = typeof selectedLMModel !== 'undefined' && !!selectedLMModel;
        el.textContent = ready ? c.model : c.noModel; el.classList.toggle('ready', ready);
    }

    function togglePowerMode() {
        normalMode = !normalMode;
        const mainGrid = document.querySelector('.main-grid'); const normal = document.getElementById('normal-mode');
        if (mainGrid) mainGrid.style.display = normalMode ? 'none' : ''; if (normal) normal.style.display = normalMode ? '' : 'none';
        applyCopy();
        if (!normalMode) {
            const task = document.getElementById('f-task'); const input = document.getElementById('normal-intent');
            if (task && input && input.value.trim() && !task.value.trim()) { task.value = input.value.trim(); update(); }
        }
    }

    function startNormalGrill() {
        const input = document.getElementById('normal-intent'); const task = document.getElementById('f-task');
        if (!input || !task) return; const intent = input.value.trim(); if (!intent) { input.focus(); return; }
        if (typeof selectedLMModel === 'undefined' || !selectedLMModel) { togglePowerMode(); const status = document.getElementById('normal-model-status'); if (status) status.textContent = copy().needModel; return; }
        task.value = intent; update(); startGrillMe();
    }

    function wrapLanguageSwitch() {
        if (typeof window.setLang !== 'function' || window.setLang._normalWrapped) return;
        const original = window.setLang; const wrapped = function(l) { const result = original.apply(this, arguments); setTimeout(applyCopy, 0); return result; };
        wrapped._normalWrapped = true; window.setLang = wrapped;
    }

    function overrideApply() {
        window.applyGrillMeResult = async function() {
            const endpointInput = document.getElementById('lm-endpoint'); if (!endpointInput || !selectedLMModel) return;
            const endpoint = endpointInput.value.trim(); const chatLog = document.getElementById('grillChatLog');
            appendGrillMessage('system', 'Structuring requirements into Prompt Specification...');
            const finalInstruct = `Based on our conversation, structure the final requirements into this JSON format. Output ONLY valid JSON, with every key present. Do not invent requirements: if the user never specified a value and it is not necessary to fulfill the task, use an empty string. Preserve concrete user requirements.\n{\n  "f-role": "", "f-task": "", "f-context": "", "f-constraint": "", "f-format": "", "f-tone": "", "f-length": "", "f-reasoning": "", "f-lang": "", "f-hallucination": ""\n}`;
            grillMessages.push({ role: 'user', content: finalInstruct });
            try {
                const res = await fetch(`${endpoint}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: selectedLMModel, messages: grillMessages, temperature: 0.2 }) });
                if (!res.ok) throw new Error('Failed to get structured JSON'); const data = await res.json(); const reply = data.choices[0].message.content.trim();
                if (chatLog?.lastChild?.textContent.includes('Structuring requirements')) chatLog.removeChild(chatLog.lastChild);
                const match = reply.match(/\{[\s\S]*\}/); const parsed = JSON.parse(match ? match[0] : reply);
                const ids = ['f-role','f-task','f-context','f-constraint','f-format','f-tone','f-length','f-reasoning','f-lang','f-hallucination'];
                ids.forEach(id => { const val = typeof parsed[id] === 'string' ? parsed[id] : ''; const field = document.getElementById(id); if (!field) return; if (field.tagName === 'SELECT') { const has = Array.from(field.options).some(o => o.value === val); if (has) field.value = val; else if (val) { field.value = 'custom'; const custom = document.getElementById(id + '-custom'); if (custom) { custom.value = val; custom.style.display = 'block'; } } else field.value = ''; } else field.value = val; });
                update(); closeGrillMe(); const input = document.getElementById('normal-intent'); if (input) input.value = document.getElementById('f-task')?.value || input.value; showToast('Prompt Specification updated from interview.');
            } catch (err) { console.error(err); if (chatLog?.lastChild?.textContent.includes('Structuring requirements')) chatLog.removeChild(chatLog.lastChild); appendGrillMessage('system', 'Failed to map the interview to structured fields.'); }
        };
    }

    function init() {
        injectStyles(); createUI(); applyCopy(); wrapLanguageSwitch(); overrideApply();
        const mainGrid = document.querySelector('.main-grid'); if (mainGrid) mainGrid.style.display = 'none';
        if (location.hash.includes('data=')) togglePowerMode();
        setTimeout(() => { const input = document.getElementById('normal-intent'); const task = document.getElementById('f-task'); if (input && task && !input.value.trim() && task.value.trim()) input.value = task.value.trim(); updateModelStatus(); }, 350);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// Load the optional browser-side provider module after Normal Mode exists.
(() => {
    const load = () => { if (!document.querySelector('script[data-ganfpu-free-api]')) { const s = document.createElement('script'); s.src = 'free-api.js'; s.dataset.ganfpuFreeApi = '1'; document.body.appendChild(s); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else setTimeout(load, 0);
})();
