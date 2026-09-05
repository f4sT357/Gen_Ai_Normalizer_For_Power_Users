(() => {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function readSpecification(root = document) {
    const api = window.ganfpuPromptSpecification;
    if (!api?.fromDom) return {};
    return api.fromDom(root);
  }

  function compile(specification, language = {}, compiler = window.ganfpuPromptCompiler) {
    if (!compiler?.compile) return '';
    return compiler.compile(specification, language);
  }

  function render(promptText, root = document) {
    const preview = root.getElementById('preview');
    if (!preview) return;

    if (!text(promptText)) {
      preview.innerHTML = '';
      return;
    }

    preview.textContent = promptText;

    const charCountEl = root.getElementById('charCount');
    if (charCountEl) {
      const len = promptText.length;
      const translate = typeof window.t === 'function' ? window.t : (key) => key;
      charCountEl.textContent = `${len.toLocaleString()} ${translate('char-count')}`;
      charCountEl.className = 'char-count' + (len > 2000 ? ' long' : len > 800 ? ' warn' : '');
    }
  }

  window.ganfpuPromptUI = Object.freeze({
    readSpecification,
    compile,
    render,
  });
})();
