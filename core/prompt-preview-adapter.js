(() => {
  'use strict';

  function install() {
    const originalUpdate = window.update;
    const specificationApi = window.ganfpuPromptSpecification;
    const compilerApi = window.ganfpuPromptCompiler;
    const translate = window.t;

    if (typeof originalUpdate !== 'function' || !specificationApi?.fromDom || !compilerApi?.compile || typeof translate !== 'function') {
      console.warn('[GANFPU] Prompt preview adapter could not initialize.');
      return;
    }

    const prefixes = {};
    compilerApi.fieldOrder.forEach(([, prefixKey]) => {
      prefixes[prefixKey] = translate(prefixKey);
    });

    window.update = function updateWithCompiler() {
      originalUpdate();

      const specification = specificationApi.fromDom();
      const promptText = compilerApi.compile(specification, prefixes);
      const preview = document.getElementById('preview');
      const charCount = document.getElementById('charCount');
      if (!preview || !charCount) return;

      if (!promptText) {
        preview.innerHTML = `<span class="preview-placeholder">${translate('preview-placeholder')}</span>`;
        charCount.textContent = '';
        charCount.className = 'char-count';
        return;
      }

      preview.textContent = promptText;
      const len = promptText.length;
      charCount.textContent = `${len.toLocaleString()} ${translate('char-count')}`;
      charCount.className = 'char-count' + (len > 2000 ? ' long' : len > 800 ? ' warn' : '');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
