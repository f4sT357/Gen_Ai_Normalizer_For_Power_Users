(() => {
  'use strict';
  const LOG_VERSION = 3;
  let lastEngineCall = null;
  let lastEngineResult = null;
  let lastEngineError = null;
  let llmCalls = [];

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return String(value == null ? '' : value); }
  }

  function installLLMProbe() {
    const llm = window.ganfpuLLM;
    if (!llm || typeof llm.request !== 'function') return false;
    if (llm.request.__ganfpuDebugWrapped) return true;
    const original = llm.request;
    const wrapped = async function(messages, temperature) {
      const call = { timestamp: new Date().toISOString(), temperature, messages: clone(messages), response: null, error: null };
      llmCalls.push(call);
      if (llmCalls.length > 10) llmCalls = llmCalls.slice(-10);
      try {
        const result = await original(messages, temperature);
        call.response = String(result == null ? '' : result);
        return result;
      } catch (error) {
        call.error = { name: error?.name || 'Error', message: String(error?.message || error), stack: String(error?.stack || '') };
        throw error;
      }
    };
    wrapped.__ganfpuDebugWrapped = true;
    llm.request = wrapped;
    return true;
  }

  function installEngineProbe() {
    const engine = window.ganfpuGrillEngine;
    if (!engine || typeof engine.nextQuestion !== 'function') return false;
    if (engine.nextQuestion.__ganfpuDebugWrapped) return true;
    const original = engine.nextQuestion;
    const wrapped = async function(messages, interviewState) {
      lastEngineError = null;
      lastEngineResult = null;
      llmCalls = [];
      lastEngineCall = { timestamp: new Date().toISOString(), messages: clone(messages), interviewState: clone(interviewState || {}) };
      try {
        const result = await original(messages, interviewState || {});
        lastEngineResult = clone(result);
        return result;
      } catch (error) {
        lastEngineError = { name: error?.name || 'Error', message: String(error?.message || error), stack: String(error?.stack || '') };
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
      provider: provider ? { label: typeof provider.getProviderLabel === 'function' ? provider.getProviderLabel() : '', model: typeof provider.getModel === 'function' ? provider.getModel() : '' } : null,
      engine_call: clone(lastEngineCall),
      llm_calls: clone(llmCalls),
      engine_result: clone(lastEngineResult),
      engine_error: clone(lastEngineError),
      visible_chat: Array.from(document.querySelectorAll('#grillChatLog > *')).map((node) => String(node.textContent || '').trim()).filter(Boolean)
    };
  }

  function copyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(textarea);
    return copied;
  }

  function copyDebugLog() {
    const text = JSON.stringify(currentLog(), null, 2);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        if (typeof window.showToast === 'function') window.showToast('Debug log copied.');
      }).catch(() => {
        if (!copyText(text) && typeof window.showToast === 'function') window.showToast('Failed to copy debug log.');
      });
      return;
    }
    if (!copyText(text) && typeof window.showToast === 'function') window.showToast('Failed to copy debug log.');
  }

  function installButton() {
    const existing = document.getElementById('btn-grill-debug-copy');
    if (existing) {
      existing.style.cssText = 'position:fixed !important;right:12px !important;bottom:12px !important;z-index:2147483647 !important;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;padding:10px 14px;border:1px solid #888;border-radius:8px;background:#fff;color:#111;font:600 13px sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.2);cursor:pointer;';
      existing.onclick = copyDebugLog;
      return true;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'btn-grill-debug-copy';
    button.textContent = 'Copy Debug Log';
    button.title = 'Copy Grill Engine diagnostics';
    button.onclick = copyDebugLog;
    button.style.cssText = 'position:fixed !important;right:12px !important;bottom:12px !important;z-index:2147483647 !important;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;padding:10px 14px;border:1px solid #888;border-radius:8px;background:#fff;color:#111;font:600 13px sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.2);cursor:pointer;';
    document.body.appendChild(button);
    return true;
  }

  function init() {
    installButton();
    installLLMProbe();
    installEngineProbe();
    if (!document.getElementById('btn-grill-debug-copy') || !window.ganfpuLLM || !window.ganfpuGrillEngine) setTimeout(init, 250);
  }

  window.ganfpuGrillDebug = { getLog: currentLog, copy: copyDebugLog };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
