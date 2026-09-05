// ============================================================
// Prompt Compiler
// ============================================================
// Pure transformation layer:
//   Prompt Specification + localized prefixes -> generated prompt
//
// This module intentionally knows nothing about the DOM, UI state,
// Requirement Model, or LLM/provider state.
// ============================================================
(() => {
  'use strict';

  const FIELD_ORDER = Object.freeze([
    ['role', 'prefix-role'],
    ['task', 'prefix-task'],
    ['context', 'prefix-context'],
    ['constraint', 'prefix-constraint'],
    ['format', 'prefix-format'],
    ['tone', 'prefix-tone'],
    ['length', 'prefix-length'],
    ['reasoning', 'prefix-reasoning'],
    ['lang', 'prefix-lang'],
    ['hallucination', 'prefix-hallucination'],
  ]);

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function prefix(value) {
    // Prefixes are formatting data. Preserve their trailing newline(s)
    // because the existing Power Mode compiler concatenates prefix + value.
    return String(value == null ? '' : value);
  }

  function compile(specification = {}, prefixes = {}) {
    const parts = [];

    FIELD_ORDER.forEach(([field, prefixKey]) => {
      const value = text(specification[field]);
      if (!value) return;

      parts.push(prefix(prefixes[prefixKey]) + value);
    });

    return parts.join('\n\n');
  }

  window.ganfpuPromptCompiler = Object.freeze({
    compile,
    fieldOrder: FIELD_ORDER,
  });
})();
