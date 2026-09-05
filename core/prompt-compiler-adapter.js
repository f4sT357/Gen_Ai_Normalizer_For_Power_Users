(() => {
  'use strict';

  // Compatibility adapter for the legacy DOM-driven Power Mode.
  // The legacy update() remains responsible for UI metrics, autosave,
  // field highlighting, and custom-control visibility. This adapter
  // replaces only the final prompt-generation result with the shared
  // Prompt Specification -> Prompt Compiler pipeline.
  function renderCompiledPreview() {
    const specificationApi = window.ganfpuPromptSpecification;
    const compiler = window.ganfpuPromptCompiler;
    if (!specificationApi?.fromDom || !compiler?.compile) return;

    const preview = document.getElementById('preview');
    const charCount = document.getElementById('charCount');
    if (!preview) return;

    const specification = specificationApi.fromDom();
    const prefixes = {};
    compiler.fieldOrder.forEach(([, prefixKey]) => {
      prefixes[prefixKey] = typeof window.t === 'function' ? window.t(prefixKey) : prefixKey;
    });

    const promptText = compiler.compile(specification, prefixes);
    if (!promptText) {
      preview.innerHTML = `<span class="preview-placeholder">${typeof window.t === 'function' ? window.t('preview-placeholder') : ''}</span>`;
      if (charCount) {
        charCount.textContent = '';
        charCount.className = 'char-count';
      }
      return;
    }

    preview.textContent = promptText;
    const len = promptText.length;
    if (charCount) {
      charCount.textContent = `${len.toLocaleString()} ${typeof window.t === 'function' ? window.t('char-count') : ''}`;
      charCount.className = 'char-count' + (len > 2000 ? ' long' : len > 800 ? ' warn' : '');
    }
  }

  function install() {
    if (typeof window.update !== 'function') return;
    const legacyUpdate = window.update;
    if (legacyUpdate.__ganfpuCompilerAdapter) return;

    const adaptedUpdate = function (...args) {
      legacyUpdate.apply(this, args);
      renderCompiledPreview();
    };
    Object.defineProperty(adaptedUpdate, '__ganfpuCompilerAdapter', { value: true });
    window.update = adaptedUpdate;
  }

  install();
  window.ganfpuPromptCompilerAdapter = Object.freeze({ render: renderCompiledPreview, install });
})();
