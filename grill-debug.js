// ============================================================
// GANFPU Grill Debug Logger
// Captures structured Grill Engine diagnostics without changing
// the user-facing safety error. Intended for local debugging.
// ============================================================

(() => {
  const LOG_VERSION = 1;
  let lastEngineCall = null;
  let lastEngineResult = null;
  let lastEngineError = null;

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return String(value || ''); }
  }

  function installEngineProbe() {
    const engine = window.ganfpuGrillEngine;
    if (!engine?.nextQuestion || engine.nextQuestion.__ganfpuDebugWrapped) return !!engine?.nextQuestion;

    const original = engine.nextQuestion;
    const wrapped = async function(messages, interviewState = {}) {
      lastEngineError = null;
      lastEngineResult = null;
      lastEngineCall = {
        timestamp: new Date().toISOString(),
        messages: clone(messages),
        interviewState: clone(interviewState),
      };
      try {
        const result = await original(messages, interviewState);
        lastEngineResult = clone(result);
        return result;
      } catch (error) {
        lastEngineError = {
          name: error?.name || 'Error',
          message: String(error?.message || error),
          stack: String(error?.stack || ''),
        };
        throw error;
      }
    };
    wrapped.__ganfpuDebugWrapped = true;
    engine.nextQuestion = wrapped;
    return true;
  }

  function currentLog() {
    const provider = window.ganfpuLLM;
    return {
      log_version: LOG_VERSION,
      timestamp: new Date().toISOString(),
      app: 'GANFPU',
      page: location.href,
      user_agent: navigator.userAgent,
      provider: provider ? {
        label: typeof provider.getProviderLabel === 'function' ? provider.getProviderLabel() : '',
        model: typeof provider.getModel === 'function' ? provider.getModel() : '',
      } : null,
      engine_call: clone(lastEngineCall),
      engine_result: clone(lastEngineResult),
      engine_error: clone(lastEngineError),
      visible_chat: Array.from(document.querySelectorAll('#grillChatLog > *')).map((node) => String(node.textContent || '').trim()).filter(Boolean),
    };
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (e) {}
    textarea.remove();
    return copied;
  }

  async function copyDebugLog() {
    const text = JSON.stringify(currentLog(), null, 2);
    const copied = await copyText(text);
    if (typeof window.showToast === 'function') window.showToast(copied ? 'Debug log copied.' : 'Copy failed.');
    else if (!copied) console.log(text);
  }

  function installButton() {
    const footer = document.querySelector('#grillModal .modal-footer');
    if (!footer || document.getElementById('btn-grill-debug-copy')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'btn-grill-debug-copy';
    button.className = 'btn btn-secondary';
    button.textContent = 'Copy Debug Log';
    button.title = 'Copy structured Grill Engine diagnostics for debugging';
    button.onclick = copyDebugLog;
    footer.appendChild(button);
  }

  function init() {
    installEngineProbe();
    installButton();
    if (!window.ganfpuGrillEngine?.nextQuestion || !document.getElementById('btn-grill-debug-copy')) {
      setTimeout(init, 100);
    }
  }

  window.ganfpuGrillDebug = {
    getLog: currentLog,
    copy: copyDebugLog,
  };
  init();
})();
