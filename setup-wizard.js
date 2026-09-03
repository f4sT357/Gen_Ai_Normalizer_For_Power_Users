// ============================================================
// GANFPU first-run setup wizard
// Guides new users through the minimum LLM connection setup.
// ============================================================

(() => {
  const SETUP_KEY = 'ganfpu_setup_completed';
  const DISMISS_KEY = 'ganfpu_setup_dismissed_session';

  const el = (id) => document.getElementById(id);

  function hasSavedProviderConfig() {
    const provider = localStorage.getItem('ganfpu_provider');
    const key = localStorage.getItem('ganfpu_free_api');
    if (provider === 'lmstudio') return true;
    return !!key;
  }

  function isReady() {
    if (!window.ganfpuLLM) return false;
    const provider = localStorage.getItem('ganfpu_provider') || 'lmstudio';
    if (provider === 'lmstudio') {
      return typeof selectedLMModel !== 'undefined' && !!selectedLMModel;
    }
    return !!localStorage.getItem('ganfpu_free_api');
  }

  function injectStyles() {
    if (el('setup-wizard-style')) return;
    const style = document.createElement('style');
    style.id = 'setup-wizard-style';
    style.textContent = `
      .setup-wizard-card { width: min(560px, 100%); }
      .setup-wizard-body { padding: 22px; }
      .setup-wizard-step { display: none; }
      .setup-wizard-step.active { display: block; }
      .setup-wizard-title { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
      .setup-wizard-text { color: var(--text-dim); font-size: 13px; line-height: 1.7; }
      .setup-wizard-list { margin: 14px 0; padding-left: 20px; color: var(--text-dim); font-size: 13px; line-height: 1.8; }
      .setup-wizard-link { display: inline-flex; margin: 14px 0; }
      .setup-wizard-input { width: 100%; margin-top: 12px; }
      .setup-wizard-note { margin-top: 10px; color: var(--text-dim); font-size: 11px; line-height: 1.5; }
      .setup-wizard-status { margin-top: 12px; font-size: 12px; min-height: 18px; }
      .setup-wizard-status.ok { color: var(--accent3); }
      .setup-wizard-status.error { color: var(--danger, #ff6b6b); }
      .setup-wizard-footer { display: flex; gap: 8px; justify-content: space-between; }
      .setup-wizard-footer .right { display: flex; gap: 8px; margin-left: auto; }
      .setup-wizard-provider { width: 100%; margin-top: 12px; }
      @media(max-width:700px){
        .setup-wizard-body { padding: 18px; }
        .setup-wizard-footer { flex-wrap: wrap; }
      }
    `;
    document.head.appendChild(style);
  }

  function createUI() {
    if (el('setupWizard')) return;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'setupWizard';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-card setup-wizard-card">
        <div class="modal-header">
          <div class="modal-title">GANFPU Setup</div>
          <button class="modal-close-btn" id="setup-wizard-x" type="button">×</button>
        </div>
        <div class="setup-wizard-body">
          <div class="setup-wizard-step active" data-step="1">
            <div class="setup-wizard-title">まずAI接続を設定します</div>
            <div class="setup-wizard-text">
              GANFPUは、あなた自身のLLM接続を使って動作します。APIキーはGANFPUのサーバーには送信されません。
            </div>
            <select class="setup-wizard-provider" id="setup-wizard-provider">
              <option value="openrouter">OpenRouter Free（おすすめ）</option>
              <option value="groq">Groq</option>
              <option value="lmstudio">LM Studio（ローカル）</option>
            </select>
          </div>

          <div class="setup-wizard-step" data-step="2">
            <div class="setup-wizard-title" id="setup-wizard-step2-title">APIキーを用意します</div>
            <div class="setup-wizard-text" id="setup-wizard-step2-text"></div>
            <a class="btn btn-secondary btn-sm setup-wizard-link" id="setup-wizard-key-link" target="_blank" rel="noopener noreferrer"></a>
            <input class="setup-wizard-input" id="setup-wizard-key" type="password" autocomplete="off" placeholder="API key">
            <label class="free-api-checkbox" style="margin-top:10px">
              <input id="setup-wizard-save-key" type="checkbox">
              <span>この端末に保存する</span>
            </label>
            <div class="setup-wizard-note">保存しない場合、APIキーはこのページを閉じると消えます。</div>
          </div>

          <div class="setup-wizard-step" data-step="3">
            <div class="setup-wizard-title">接続を確認しています</div>
            <div class="setup-wizard-text">入力した設定でAIにテストリクエストを送信します。</div>
            <div class="setup-wizard-status" id="setup-wizard-status"></div>
          </div>

          <div class="setup-wizard-step" data-step="4">
            <div class="setup-wizard-title">セットアップ完了</div>
            <div class="setup-wizard-text">AI接続の準備ができました。Normal Modeから、そのままプロンプト作成を始められます。</div>
          </div>
        </div>
        <div class="modal-footer setup-wizard-footer">
          <button class="btn btn-secondary btn-sm" id="setup-wizard-later" type="button">後で設定</button>
          <div class="right">
            <button class="btn btn-secondary btn-sm" id="setup-wizard-back" type="button">戻る</button>
            <button class="btn btn-primary btn-sm" id="setup-wizard-next" type="button">次へ</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    el('setup-wizard-provider').addEventListener('change', renderStep2);
    el('setup-wizard-next').addEventListener('click', next);
    el('setup-wizard-back').addEventListener('click', back);
    el('setup-wizard-later').addEventListener('click', dismiss);
    el('setup-wizard-x').addEventListener('click', dismiss);
    renderStep2();
  }

  function provider() {
    return el('setup-wizard-provider')?.value || 'openrouter';
  }

  function renderStep2() {
    const p = provider();
    const title = el('setup-wizard-step2-title');
    const text = el('setup-wizard-step2-text');
    const link = el('setup-wizard-key-link');
    const key = el('setup-wizard-key');
    const save = el('setup-wizard-save-key');
    if (!title || !text || !link || !key || !save) return;

    if (p === 'lmstudio') {
      title.textContent = 'LM Studioを起動します';
      text.textContent = 'LM Studioでローカルサーバーを起動し、モデルをロードしてください。その後、Normal ModeのLLM設定からモデルを選択します。';
      link.style.display = 'none';
      key.style.display = 'none';
      save.parentElement.style.display = 'none';
    } else if (p === 'groq') {
      title.textContent = 'GroqのAPIキーを用意します';
      text.textContent = 'GroqのAPIキーを作成してコピーし、下の欄に貼り付けてください。';
      link.href = 'https://console.groq.com/keys';
      link.textContent = 'GroqでAPIキーを取得';
      link.style.display = '';
      key.style.display = '';
      save.parentElement.style.display = '';
    } else {
      title.textContent = 'OpenRouterのAPIキーを用意します';
      text.textContent = 'OpenRouterでAPIキーを作成してコピーし、下の欄に貼り付けてください。GANFPUはOpenRouterの無料モデルを使用する設定になっています。';
      link.href = 'https://openrouter.ai/keys';
      link.textContent = 'OpenRouterでAPIキーを取得';
      link.style.display = '';
      key.style.display = '';
      save.parentElement.style.display = '';
    }
  }

  function setStep(step) {
    document.querySelectorAll('#setupWizard .setup-wizard-step').forEach((node) => {
      node.classList.toggle('active', Number(node.dataset.step) === step);
    });
    const backButton = el('setup-wizard-back');
    const nextButton = el('setup-wizard-next');
    const laterButton = el('setup-wizard-later');
    if (backButton) backButton.style.display = step <= 1 || step >= 4 ? 'none' : '';
    if (laterButton) laterButton.style.display = step >= 4 ? 'none' : '';
    if (nextButton) nextButton.textContent = step === 3 ? '接続テスト' : step === 4 ? '始める' : '次へ';
  }

  let currentStep = 1;

  async function next() {
    if (currentStep === 1) {
      currentStep = 2;
      setStep(currentStep);
      renderStep2();
      return;
    }
    if (currentStep === 2) {
      if (provider() !== 'lmstudio' && !el('setup-wizard-key')?.value.trim()) {
        showStatus('APIキーを入力してください。', true);
        return;
      }
      currentStep = 3;
      setStep(currentStep);
      await configureAndTest();
      return;
    }
    if (currentStep === 3) {
      await configureAndTest();
      return;
    }
    if (currentStep === 4) {
      complete();
    }
  }

  function back() {
    if (currentStep <= 1 || currentStep >= 4) return;
    currentStep -= 1;
    setStep(currentStep);
  }

  function showStatus(message, error = false) {
    const status = el('setup-wizard-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', error);
    status.classList.toggle('ok', !error);
  }

  function openSettings() {
    const button = el('normal-settings-button');
    if (button && el('normal-settings')?.hidden) button.click();
  }

  function configureProvider() {
    openSettings();
    const providerSelect = el('free-api-provider');
    const keyInput = el('free-api-key');
    const modelInput = el('free-api-model');
    const saveKey = el('free-api-save-key');
    if (!providerSelect) throw new Error('LLM settings are not ready yet.');

    providerSelect.value = provider();
    providerSelect.dispatchEvent(new Event('change'));

    if (provider() !== 'lmstudio') {
      const value = el('setup-wizard-key')?.value.trim() || '';
      if (keyInput) {
        keyInput.value = value;
        keyInput.dispatchEvent(new Event('input'));
      }
      if (saveKey) saveKey.checked = !!el('setup-wizard-save-key')?.checked;
      if (modelInput && provider() === 'openrouter') modelInput.value = 'openrouter/free';
      const saveButton = el('free-api-save');
      if (saveButton) saveButton.click();
    }
  }

  async function configureAndTest() {
    const nextButton = el('setup-wizard-next');
    if (nextButton) nextButton.disabled = true;
    showStatus('接続を確認しています…');
    try {
      configureProvider();
      if (!window.ganfpuLLM || !window.ganfpuLLM.ensureReady()) {
        throw new Error('LLM設定が完了していません。');
      }
      const reply = await window.ganfpuLLM.request(
        [{ role: 'user', content: 'Reply with exactly: OK' }],
        0
      );
      if (!reply.trim()) throw new Error('AIから有効な応答がありませんでした。');
      localStorage.setItem(SETUP_KEY, '1');
      currentStep = 4;
      setStep(currentStep);
      if (typeof window.ganfpuUpdateModelStatus === 'function') window.ganfpuUpdateModelStatus();
    } catch (error) {
      console.error(error);
      showStatus(`接続に失敗しました: ${error.message}`, true);
      if (currentStep !== 3) currentStep = 3;
    } finally {
      if (nextButton) nextButton.disabled = false;
    }
  }

  function complete() {
    const modal = el('setupWizard');
    if (modal) modal.style.display = 'none';
    const input = el('normal-intent');
    input?.focus();
  }

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    const modal = el('setupWizard');
    if (modal) modal.style.display = 'none';
  }

  function shouldShow() {
    if (isReady()) return false;
    if (sessionStorage.getItem(DISMISS_KEY)) return false;
    if (localStorage.getItem(SETUP_KEY) && hasSavedProviderConfig()) return false;
    return true;
  }

  function open() {
    const modal = el('setupWizard');
    if (!modal) return;
    currentStep = 1;
    setStep(currentStep);
    modal.style.display = 'flex';
  }

  function init() {
    injectStyles();
    createUI();
    if (shouldShow()) setTimeout(open, 250);

    const start = el('normal-start');
    if (start) {
      start.addEventListener('click', () => {
        if (!isReady()) open();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})();
