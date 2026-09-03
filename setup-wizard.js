// ============================================================
// GANFPU first-run setup wizard
// Branches through the minimum LLM connection setup.
// ============================================================

(() => {
  const SETUP_KEY = 'ganfpu_setup_completed';
  const DISMISS_KEY = 'ganfpu_setup_dismissed_session';

  const el = (id) => document.getElementById(id);

  function hasSavedProviderConfig() {
    const provider = localStorage.getItem('ganfpu_provider');
    const key = localStorage.getItem('ganfpu_free_api');
    if (provider === 'lmstudio') return isLMReady();
    return !!key;
  }

  function isLMReady() {
    return typeof selectedLMModel !== 'undefined' && !!selectedLMModel;
  }

  function isReady() {
    if (!window.ganfpuLLM) return false;
    const provider = localStorage.getItem('ganfpu_provider') || 'lmstudio';
    if (provider === 'lmstudio') return isLMReady();
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
      .setup-wizard-choice { display: grid; gap: 10px; margin-top: 16px; }
      .setup-wizard-choice .btn { width: 100%; justify-content: flex-start; text-align: left; }
      .setup-wizard-inline-error { margin-top: 10px; color: var(--danger, #ff6b6b); font-size: 12px; min-height: 18px; }
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
          <div class="setup-wizard-step active" data-step="provider">
            <div class="setup-wizard-title">まずAI接続を設定します</div>
            <div class="setup-wizard-text">どの方法でAIを使いますか？</div>
            <div class="setup-wizard-choice">
              <button class="btn btn-primary" data-provider="openrouter" type="button">OpenRouter Free<br><small>無料モデルを使う</small></button>
              <button class="btn btn-secondary" data-provider="groq" type="button">Groq<br><small>GroqのAPIを使う</small></button>
              <button class="btn btn-secondary" data-provider="lmstudio" type="button">LM Studio<br><small>自分のPCでローカルLLMを使う</small></button>
            </div>
          </div>

          <div class="setup-wizard-step" data-step="key">
            <div class="setup-wizard-title" id="setup-wizard-key-title"></div>
            <div class="setup-wizard-text" id="setup-wizard-key-text"></div>
            <a class="btn btn-secondary btn-sm setup-wizard-link" id="setup-wizard-key-link" target="_blank" rel="noopener noreferrer"></a>
            <input class="setup-wizard-input" id="setup-wizard-key" type="password" autocomplete="off" placeholder="API key">
            <label class="free-api-checkbox" id="setup-wizard-save-wrap" style="margin-top:10px">
              <input id="setup-wizard-save-key" type="checkbox">
              <span>この端末に保存する</span>
            </label>
            <div class="setup-wizard-note" id="setup-wizard-key-note"></div>
            <div class="setup-wizard-inline-error" id="setup-wizard-key-error"></div>
          </div>

          <div class="setup-wizard-step" data-step="lmstudio">
            <div class="setup-wizard-title">LM Studioを準備します</div>
            <div class="setup-wizard-text">LM Studioを起動し、使用するモデルをロードしてください。</div>
            <ol class="setup-wizard-list">
              <li>LM Studioを起動</li>
              <li>使用するモデルをロード</li>
              <li>ローカルサーバーを起動</li>
              <li>GANFPUのLLM設定でモデルを選択</li>
            </ol>
            <button class="btn btn-secondary" id="setup-wizard-open-settings" type="button">LLM設定を開く</button>
            <div class="setup-wizard-note">設定が終わったら「接続テスト」を押してください。</div>
            <div class="setup-wizard-inline-error" id="setup-wizard-lm-error"></div>
          </div>

          <div class="setup-wizard-step" data-step="test">
            <div class="setup-wizard-title">接続を確認します</div>
            <div class="setup-wizard-text">設定したAIにテストリクエストを送信します。</div>
            <div class="setup-wizard-status" id="setup-wizard-status"></div>
          </div>

          <div class="setup-wizard-step" data-step="done">
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

    document.querySelectorAll('#setupWizard [data-provider]').forEach((button) => {
      button.addEventListener('click', () => selectProvider(button.dataset.provider));
    });
    el('setup-wizard-next').addEventListener('click', next);
    el('setup-wizard-back').addEventListener('click', back);
    el('setup-wizard-later').addEventListener('click', dismiss);
    el('setup-wizard-x').addEventListener('click', dismiss);
    el('setup-wizard-open-settings').addEventListener('click', openSettings);
  }

  let selectedProvider = 'openrouter';
  let currentStep = 'provider';

  function selectProvider(value) {
    selectedProvider = value;
    if (value === 'lmstudio') {
      currentStep = 'lmstudio';
      renderStep();
      return;
    }
    currentStep = 'key';
    renderKeyStep();
    renderStep();
  }

  function renderKeyStep() {
    const title = el('setup-wizard-key-title');
    const text = el('setup-wizard-key-text');
    const link = el('setup-wizard-key-link');
    const key = el('setup-wizard-key');
    const saveWrap = el('setup-wizard-save-wrap');
    const note = el('setup-wizard-key-note');
    if (!title || !text || !link || !key || !saveWrap || !note) return;

    const isOpenRouter = selectedProvider === 'openrouter';
    title.textContent = isOpenRouter ? 'OpenRouterのAPIキーを用意します' : 'GroqのAPIキーを用意します';
    text.textContent = isOpenRouter
      ? 'OpenRouterでAPIキーを作成してコピーし、下の欄に貼り付けてください。GANFPUはOpenRouterの無料モデルを使用します。'
      : 'GroqでAPIキーを作成してコピーし、下の欄に貼り付けてください。';
    link.href = isOpenRouter ? 'https://openrouter.ai/keys' : 'https://console.groq.com/keys';
    link.textContent = isOpenRouter ? 'OpenRouterでAPIキーを取得' : 'GroqでAPIキーを取得';
    key.value = '';
    key.placeholder = isOpenRouter ? 'OpenRouter API key' : 'Groq API key';
    saveWrap.style.display = '';
    note.textContent = '保存しない場合、APIキーはこのページを閉じると消えます。';
    el('setup-wizard-key-error').textContent = '';
  }

  function renderStep() {
    document.querySelectorAll('#setupWizard .setup-wizard-step').forEach((node) => {
      node.classList.toggle('active', node.dataset.step === currentStep);
    });
    const backButton = el('setup-wizard-back');
    const nextButton = el('setup-wizard-next');
    const laterButton = el('setup-wizard-later');
    if (backButton) backButton.style.display = currentStep === 'provider' || currentStep === 'done' ? 'none' : '';
    if (laterButton) laterButton.style.display = currentStep === 'done' ? 'none' : '';
    if (nextButton) {
      nextButton.style.display = currentStep === 'provider' || currentStep === 'done' ? '' : '';
      nextButton.textContent = currentStep === 'test' ? '接続テスト' : currentStep === 'done' ? '始める' : '次へ';
    }
    if (currentStep === 'provider') nextButton.style.display = 'none';
    if (currentStep === 'key' || currentStep === 'lmstudio') nextButton.style.display = '';
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
    if (!providerSelect) throw new Error('LLM設定を読み込めませんでした。');

    providerSelect.value = selectedProvider;
    providerSelect.dispatchEvent(new Event('change'));

    if (selectedProvider !== 'lmstudio') {
      const value = el('setup-wizard-key')?.value.trim() || '';
      if (keyInput) {
        keyInput.value = value;
        keyInput.dispatchEvent(new Event('input'));
      }
      if (saveKey) saveKey.checked = !!el('setup-wizard-save-key')?.checked;
      if (modelInput && selectedProvider === 'openrouter') modelInput.value = 'openrouter/free';
      const saveButton = el('free-api-save');
      if (saveButton) saveButton.click();
    }
  }

  function showStatus(message, error = false) {
    const status = el('setup-wizard-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', error);
    status.classList.toggle('ok', !error);
  }

  async function testConnection() {
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
      currentStep = 'done';
      renderStep();
      if (typeof window.ganfpuUpdateModelStatus === 'function') window.ganfpuUpdateModelStatus();
    } catch (error) {
      console.error(error);
      showStatus(`接続に失敗しました: ${error.message}`, true);
      currentStep = 'test';
      renderStep();
    } finally {
      if (nextButton) nextButton.disabled = false;
    }
  }

  function next() {
    if (currentStep === 'key') {
      const key = el('setup-wizard-key')?.value.trim() || '';
      if (!key) {
        el('setup-wizard-key-error').textContent = 'APIキーを入力してください。';
        return;
      }
      currentStep = 'test';
      renderStep();
      return;
    }
    if (currentStep === 'lmstudio') {
      if (!isLMReady()) {
        el('setup-wizard-lm-error').textContent = 'LLM設定でLM Studioのモデルを選択してください。';
        openSettings();
        return;
      }
      el('setup-wizard-lm-error').textContent = '';
      currentStep = 'test';
      renderStep();
      return;
    }
    if (currentStep === 'test') {
      testConnection();
      return;
    }
    if (currentStep === 'done') complete();
  }

  function back() {
    if (currentStep === 'key' || currentStep === 'lmstudio') {
      currentStep = 'provider';
      renderStep();
      return;
    }
    if (currentStep === 'test') {
      currentStep = selectedProvider === 'lmstudio' ? 'lmstudio' : 'key';
      renderStep();
    }
  }

  function complete() {
    const modal = el('setupWizard');
    if (modal) modal.style.display = 'none';
    el('normal-intent')?.focus();
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
    selectedProvider = localStorage.getItem('ganfpu_provider') || 'openrouter';
    if (!['openrouter', 'groq', 'lmstudio'].includes(selectedProvider)) selectedProvider = 'openrouter';
    currentStep = 'provider';
    renderStep();
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
