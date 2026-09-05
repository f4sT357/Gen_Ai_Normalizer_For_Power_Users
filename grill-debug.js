(() => {
  'use strict';
  const LOG_VERSION = 5;
  let llmCalls = [];
  let networkCalls = [];
  let coreSteps = [];
  let activeLLMCall = null;

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return String(value == null ? '' : value);
    }
  }

  function elapsed(start) {
    return Math.round(performance.now() - start);
  }

  function pushLimited(list, value, limit = 50) {
    list.push(value);
    if (list.length > limit) list.splice(0, list.length - limit);
  }

  function installLLMProbe() {
    const llm = window.ganfpuLLM;
    if (!llm || typeof llm.request !== 'function') return false;
    if (llm.request.__ganfpuDebugWrapped) return true;
    const original = llm.request;
    const wrapped = async function (messages, temperature) {
      const call = {
        timestamp: new Date().toISOString(),
        temperature,
        messages: clone(messages),
        response: null,
        error: null,
      };
      pushLimited(llmCalls, call, 20);
      const callIndex = llmCalls.length - 1;
      const started = performance.now();
      const previous = activeLLMCall;
      activeLLMCall = callIndex;
      try {
        const result = await original(messages, temperature);
        call.response = String(result == null ? '' : result);
        call.elapsed_ms = elapsed(started);
        return result;
      } catch (error) {
        call.elapsed_ms = elapsed(started);
        call.error = {
          name: error?.name || 'Error',
          message: String(error?.message || error),
          stack: String(error?.stack || ''),
        };
        throw error;
      } finally {
        activeLLMCall = previous;
      }
    };
    wrapped.__ganfpuDebugWrapped = true;
    llm.request = wrapped;
    return true;
  }

  function installFetchProbe() {
    if (window.fetch.__ganfpuDebugWrapped) return true;
    const original = window.fetch.bind(window);
    const wrapped = async function (input, init) {
      const started = performance.now();
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      const call = {
        timestamp: new Date().toISOString(),
        method,
        url,
        llm_call_index: activeLLMCall,
        status: null,
        ok: null,
        elapsed_ms: null,
        error: null,
      };
      pushLimited(networkCalls, call);
      try {
        const response = await original(input, init);
        call.status = response.status;
        call.ok = response.ok;
        call.elapsed_ms = elapsed(started);
        return response;
      } catch (error) {
        call.elapsed_ms = elapsed(started);
        call.error = {
          name: error?.name || 'Error',
          message: String(error?.message || error),
          stack: String(error?.stack || ''),
        };
        throw error;
      }
    };
    wrapped.__ganfpuDebugWrapped = true;
    window.fetch = wrapped;
    return true;
  }

  function installCoreProbe() {
    const core = window.ganfpuCore;
    if (!core || typeof core.step !== 'function') return false;
    if (core.step.__ganfpuDebugWrapped) return true;
    const original = core.step;
    const wrapped = async function (args) {
      const started = performance.now();
      const before = {
        model: clone(args?.model),
        discovery: clone(args?.discovery),
        currentAction: clone(args?.currentAction),
        message_count: Array.isArray(args?.messages) ? args.messages.length : 0,
      };
      const step = {
        timestamp: new Date().toISOString(),
        before,
        result: null,
        after: null,
        elapsed_ms: null,
        error: null,
      };
      pushLimited(coreSteps, step);
      try {
        const result = await original(args);
        step.elapsed_ms = elapsed(started);
        step.result = clone({
          status: result?.status,
          action: result?.action,
          model: result?.model,
          discovery: result?.discovery,
        });
        step.after = clone(window.ganfpuGrillController?.getState?.() || null);
        return result;
      } catch (error) {
        step.elapsed_ms = elapsed(started);
        step.error = {
          name: error?.name || 'Error',
          message: String(error?.message || error),
          stack: String(error?.stack || ''),
        };
        step.after = clone(window.ganfpuGrillController?.getState?.() || null);
        throw error;
      }
    };
    wrapped.__ganfpuDebugWrapped = true;
    core.step = wrapped;
    return true;
  }

  function currentLog() {
    const provider = window.ganfpuLLM;
    return {
      log_version: LOG_VERSION,
      timestamp: new Date().toISOString(),
      app: 'GANFPU',
      page: location.href,
      provider: provider
        ? {
            label:
              typeof provider.getProviderLabel === 'function' ? provider.getProviderLabel() : '',
            model: typeof provider.getModel === 'function' ? provider.getModel() : '',
          }
        : null,
      llm_calls: clone(llmCalls),
      network_calls: clone(networkCalls),
      core_steps: clone(coreSteps),
      controller_state: clone(window.ganfpuGrillController?.getState?.() || null),
      visible_chat: Array.from(document.querySelectorAll('#grillChatLog > *'))
        .map((node) => String(node.textContent || '').trim())
        .filter(Boolean),
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
    try {
      copied = document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(textarea);
    return copied;
  }

  function copyDebugLog() {
    const text = JSON.stringify(currentLog(), null, 2);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          if (typeof window.showToast === 'function') window.showToast('Debug log copied.');
        })
        .catch(() => {
          if (!copyText(text) && typeof window.showToast === 'function')
            window.showToast('Failed to copy debug log.');
        });
      return;
    }
    if (!copyText(text) && typeof window.showToast === 'function')
      window.showToast('Failed to copy debug log.');
  }

  function installButton() {
    const existing = document.getElementById('btn-grill-debug-copy');
    if (existing) {
      existing.style.cssText =
        'position:fixed !important;right:12px !important;bottom:12px !important;z-index:2147483647 !important;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;padding:10px 14px;border:1px solid #888;border-radius:8px;background:#fff;color:#111;font:600 13px sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.2);cursor:pointer;';
      existing.onclick = copyDebugLog;
      return true;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'btn-grill-debug-copy';
    button.textContent = 'Copy Debug Log';
    button.title = 'Copy GANFPU controller diagnostics';
    button.onclick = copyDebugLog;
    button.style.cssText =
      'position:fixed !important;right:12px !important;bottom:12px !important;z-index:2147483647 !important;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;padding:10px 14px;border:1px solid #888;border-radius:8px;background:#fff;color:#111;font:600 13px sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.2);cursor:pointer;';
    document.body.appendChild(button);
    return true;
  }

  function init() {
    installButton();
    installLLMProbe();
    installFetchProbe();
    installCoreProbe();
  }

  window.ganfpuGrillDebug = { getLog: currentLog, copy: copyDebugLog };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
