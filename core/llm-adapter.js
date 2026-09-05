(() => {
  'use strict';

  function request(messages, temperature = 0.1) {
    if (!window.ganfpuLLM || typeof window.ganfpuLLM.request !== 'function') {
      throw new Error('LLM provider is unavailable.');
    }
    return window.ganfpuLLM.request(messages, temperature);
  }

  function isReady() {
    return !!window.ganfpuLLM && typeof window.ganfpuLLM.request === 'function';
  }

  window.ganfpuLLMAdapter = Object.freeze({ request, isReady });
})();
