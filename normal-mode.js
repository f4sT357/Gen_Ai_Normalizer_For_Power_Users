// ============================================================
// GANFPU Normal Mode
// Keeps the existing Power Mode intact while making intent-first
// requirement elicitation the default experience.
// ============================================================

(() => {
  const COPY = {
    ja: {
      eyebrow: 'INTENT → PROMPT',
      title: 'AIに何をさせたい？',
      placeholder: '例：このコードのバグを見つけて直して',
      start: 'Grill Me / Normalize',
      power: 'Power Mode',
      powerDesc: 'Prompt Specificationを手動で編集',
      needModel: '先にLLMプロバイダーを設定してください。',
      active: 'Power Modeを閉じる',
      model: 'LLMモデルが選択されています',
      noModel: 'LLMモデル未設定',
      resultTitle: '生成されたプロンプト',
      resultCopy: 'コピー',
      resultCopied: 'コピーしました',
      guide: '① やりたいことを書く　→　② AIの質問に答える　→　③ 完成したプロンプトをコピー',
      settings: 'LLM設定',
      settingsOpen: 'LLM設定を閉じる',
    },
    en: {
      eyebrow: 'INTENT → PROMPT',
      title: 'What do you want the AI to do?',
      placeholder: 'e.g. Find and fix the bugs in this code',
      start: 'Grill Me / Normalize',
      power: 'Power Mode',
      powerDesc: 'Manually edit the Prompt Specification',
      needModel: 'Configure an LLM provider first.',
      active: 'Close Power Mode',
      model: 'LLM model configured',
      noModel: 'No LLM model configured',
      resultTitle: 'Generated Prompt',
      resultCopy: 'Copy',
      resultCopied: 'Copied',
      guide: '① Write what you want → ② Answer the AI questions → ③ Copy the finished prompt',
      settings: 'LLM Settings',
      settingsOpen: 'Close LLM Settings',
    },
    zh: {
      eyebrow: 'INTENT → PROMPT',
      title: '你希望 AI 做什么？',
      placeholder: '例如：找出并修复这段代码中的错误',
      start: 'Grill Me / Normalize',
      power: 'Power Mode',
      powerDesc: '手动编辑 Prompt Specification',
      needModel: '请先配置 LLM 提供商。',
      active: '关闭 Power Mode',
      model: 'LLM 模型已配置',
      noModel: '未配置 LLM 模型',
      resultTitle: '生成的提示词',
      resultCopy: '复制',
      resultCopied: '已复制',
      guide: '① 写下需求 → ② 回答 AI 的问题 → ③ 复制生成的提示词',
      settings: 'LLM 设置',
      settingsOpen: '关闭 LLM 设置',
    },
    ko: {
      eyebrow: 'INTENT → PROMPT',
      title: 'AI에게 무엇을 시키고 싶나요?',
      placeholder: '예: 이 코드의 버그를 찾아 수정해줘',
      start: 'Grill Me / Normalize',
      power: 'Power Mode',
      powerDesc: 'Prompt Specification 직접 편집',
      needModel: '먼저 LLM 제공자를 설정하세요.',
      active: 'Power Mode 닫기',
      model: 'LLM 모델이 설정됨',
      noModel: 'LLM 모델이 설정되지 않음',
      resultTitle: '생성된 프롬프트',
      resultCopy: '복사',
      resultCopied: '복사됨',
      guide: '① 원하는 작업을 입력 → ② AI의 질문에 답변 → ③ 완성된 프롬프트 복사',
      settings: 'LLM 설정',
      settingsOpen: 'LLM 설정 닫기',
    },
    es: {
      eyebrow: 'INTENT → PROMPT',
      title: '¿Qué quieres que haga la IA?',
      placeholder: 'Ej.: Encuentra y corrige los errores de este código',
      start: 'Grill Me / Normalize',
      power: 'Power Mode',
      powerDesc: 'Editar manualmente el Prompt Specification',
      needModel: 'Configura primero un proveedor LLM.',
      active: 'Cerrar Power Mode',
      model: 'Modelo LLM configurado',
      noModel: 'Sin modelo LLM configurado',
      resultTitle: 'Prompt generado',
      resultCopy: 'Copiar',
      resultCopied: 'Copiado',
      guide: '① Escribe lo que quieres → ② Responde las preguntas de la IA → ③ Copia el prompt final',
      settings: 'Configuración LLM',
      settingsOpen: 'Cerrar configuración LLM',
    },
    fr: {
      eyebrow: 'INTENT → PROMPT',
      title: 'Que voulez-vous faire faire à l’IA ?',
      placeholder: 'Ex. : Trouve et corrige les bugs de ce code',
      start: 'Grill Me / Normalize',
      power: 'Power Mode',
      powerDesc: 'Modifier le Prompt Specification',
      needModel: 'Configurez d’abord un fournisseur LLM.',
      active: 'Fermer Power Mode',
      model: 'Modèle LLM configuré',
      noModel: 'Aucun modèle LLM configuré',
      resultTitle: 'Prompt généré',
      resultCopy: 'Copier',
      resultCopied: 'Copié',
      guide: '① Écrivez votre besoin → ② Répondez aux questions de l’IA → ③ Copiez le prompt final',
      settings: 'Paramètres LLM',
      settingsOpen: 'Fermer les paramètres LLM',
    },
  };

  let normalMode = true;
  let powerButton = null;
  let settingsButton = null;
  function copy() {
    return COPY[document.documentElement.lang] || COPY.ja;
  }

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
            .normal-guide { margin-top: 12px; color: var(--text-dim); font-size: 12px; line-height: 1.5; text-align: center; }
            .normal-settings-toggle { margin-top: 14px; text-align: center; }
            #normal-settings { margin-top: 12px; }
            .normal-power-toggle { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border); }
            #normal-power { width: 100%; justify-content: center; }
            .normal-power-desc { margin-top: 8px; text-align: center; color: var(--text-dim); font-size: 12px; }
            .normal-result { margin-top: 22px; padding: 22px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface2); }
            .normal-result-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
            .normal-result-title { font-weight: 700; }
            #normal-result { margin: 0; max-height: 520px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; line-height: 1.65; }
            #normal-result-copy { flex: 0 0 auto; }
            @media (max-width: 700px) { #normal-mode { margin: 22px 0; } .normal-hero { padding: 26px 20px 22px; } .normal-actions { flex-direction: column; } #normal-model-status { min-height: 38px; justify-content: center; } .normal-result { padding: 16px; } .normal-result-header { align-items: flex-start; } }
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
                <div class="normal-guide" id="normal-guide"></div>
                <div class="normal-settings-toggle">
                    <button class="btn btn-secondary btn-sm" id="normal-settings-button" type="button"></button>
                </div>
                <div id="normal-settings" hidden></div>
                <div class="normal-result" id="normal-result-wrap" hidden>
                    <div class="normal-result-header">
                        <div class="normal-result-title" id="normal-result-title"></div>
                        <button class="btn btn-secondary btn-sm" id="normal-result-copy" type="button"></button>
                    </div>
                    <pre id="normal-result"></pre>
                </div>
                <div class="normal-power-toggle">
                    <button class="btn btn-secondary" id="normal-power" type="button"></button>
                    <div class="normal-power-desc" id="normal-power-desc"></div>
                </div>
            </div>
        `;
    mainGrid.parentNode.insertBefore(wrap, mainGrid);
    powerButton = document.getElementById('normal-power');
    settingsButton = document.getElementById('normal-settings-button');
    document.getElementById('normal-start').addEventListener('click', startNormalGrill);
    powerButton.addEventListener('click', togglePowerMode);
    document.getElementById('normal-result-copy').addEventListener('click', copyNormalResult);
    settingsButton.addEventListener('click', toggleSettings);
    const input = document.getElementById('normal-intent');
    input.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        startNormalGrill();
      }
    });
  }

  function toggleSettings() {
    const panel = document.getElementById('normal-settings');
    if (!panel || !settingsButton) return;
    panel.hidden = !panel.hidden;
    settingsButton.textContent = panel.hidden ? copy().settings : copy().settingsOpen;
  }

  function applyCopy() {
    const c = copy();
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    set('normal-eyebrow', c.eyebrow);
    set('normal-title', c.title);
    const input = document.getElementById('normal-intent');
    if (input) input.placeholder = c.placeholder;
    set('normal-start', c.start);
    set('normal-guide', c.guide);
    set('normal-settings-button', document.getElementById('normal-settings')?.hidden !== false ? c.settings : c.settingsOpen);
    set('normal-power', normalMode ? c.power : c.active);
    set('normal-power-desc', c.powerDesc);
    set('normal-result-title', c.resultTitle);
    set('normal-result-copy', c.resultCopy);
    updateModelStatus();
  }

  function updateModelStatus() {
    const el = document.getElementById('normal-model-status');
    if (!el) return;
    const c = copy();
    if (window.ganfpuLLM && typeof window.ganfpuLLM.getProviderLabel === 'function') {
      const provider = window.ganfpuLLM.getProviderLabel();
      const model =
        typeof window.ganfpuLLM.getModel === 'function' ? window.ganfpuLLM.getModel() : '';
      const ready = !!model;
      el.textContent = ready ? `${provider} · ${model}` : `${provider} · ${c.noModel}`;
      el.classList.toggle('ready', ready);
      return;
    }
    const ready = typeof selectedLMModel !== 'undefined' && !!selectedLMModel;
    el.textContent = ready ? c.model : c.noModel;
    el.classList.toggle('ready', ready);
  }

  function showNormalResult() {
    const preview = document.getElementById('preview');
    const result = document.getElementById('normal-result');
    const wrap = document.getElementById('normal-result-wrap');
    if (!preview || !result || !wrap) return;
    const text = preview.textContent.trim();
    if (!text || preview.querySelector('.preview-placeholder')) return;
    result.textContent = text;
    wrap.hidden = false;
  }

  async function copyNormalResult() {
    const result = document.getElementById('normal-result');
    if (!result?.textContent.trim()) return;
    const text = result.textContent;
    const btn = document.getElementById('normal-result-copy');
    const c = copy();
    const done = () => {
      if (!btn) return;
      btn.textContent = c.resultCopied;
      setTimeout(() => {
        btn.textContent = copy().resultCopy;
      }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        done();
        return;
      } catch (e) {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;left:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {}
    ta.remove();
  }

  function togglePowerMode() {
    normalMode = !normalMode;
    const mainGrid = document.querySelector('.main-grid');
    const normal = document.getElementById('normal-mode');
    if (mainGrid) mainGrid.style.display = normalMode ? 'none' : '';
    if (normal) normal.style.display = normalMode ? '' : 'none';
    applyCopy();
    if (!normalMode) {
      const task = document.getElementById('f-task');
      const input = document.getElementById('normal-intent');
      if (task && input && input.value.trim() && !task.value.trim()) {
        task.value = input.value.trim();
        update();
      }
    }
  }

  function startNormalGrill() {
    const input = document.getElementById('normal-intent');
    if (!input) return;
    const intent = input.value.trim();
    if (!intent) {
      input.focus();
      return;
    }
    if (typeof window.ganfpuStartGrill === 'function') window.ganfpuStartGrill();
    else showToast('Grill Me is still loading. Try again in a moment.');
  }

  function wrapLanguageSwitch() {
    if (typeof window.setLang !== 'function' || window.setLang._normalWrapped) return;
    const original = window.setLang;
    const wrapped = function (l) {
      const result = original.apply(this, arguments);
      setTimeout(applyCopy, 0);
      return result;
    };
    wrapped._normalWrapped = true;
    window.setLang = wrapped;
  }

  function overrideApply() {
    window.applyGrillMeResult = function () {
      if (typeof window.ganfpuApplyGrillResult === 'function')
        return window.ganfpuApplyGrillResult();
    };
  }

  function init() {
    injectStyles();
    createUI();
    applyCopy();
    wrapLanguageSwitch();
    overrideApply();
    const mainGrid = document.querySelector('.main-grid');
    if (mainGrid) mainGrid.style.display = 'none';
    if (location.hash.includes('data=')) togglePowerMode();
    setTimeout(() => {
      updateModelStatus();
    }, 350);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
