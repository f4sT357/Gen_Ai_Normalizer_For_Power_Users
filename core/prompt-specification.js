(() => {
  'use strict';

  const FIELD_IDS = Object.freeze([
    'f-role',
    'f-task',
    'f-context',
    'f-constraint',
    'f-format',
    'f-tone',
    'f-length',
    'f-reasoning',
    'f-lang',
    'f-hallucination'
  ]);

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function readField(fieldId, root = document) {
    if (fieldId === 'f-format' || fieldId === 'f-hallucination') {
      const select = root.getElementById(fieldId);
      if (!select) return '';
      if (select.value !== 'custom') return text(select.value);
      const custom = root.getElementById(`${fieldId}-custom`);
      return text(custom?.value);
    }

    return text(root.getElementById(fieldId)?.value);
  }

  function fromDom(root = document) {
    const specification = {};
    FIELD_IDS.forEach((fieldId) => {
      specification[fieldId.replace(/^f-/, '')] = readField(fieldId, root);
    });
    return specification;
  }

  function toFieldMap(specification = {}) {
    const fields = {};
    FIELD_IDS.forEach((fieldId) => {
      const key = fieldId.replace(/^f-/, '');
      fields[fieldId] = text(specification[key]);
    });
    return fields;
  }

  function filledCount(specification = {}) {
    return FIELD_IDS.reduce((count, fieldId) => {
      const key = fieldId.replace(/^f-/, '');
      return count + (text(specification[key]) ? 1 : 0);
    }, 0);
  }

  window.ganfpuPromptSpecification = Object.freeze({
    fieldIds: FIELD_IDS,
    readField,
    fromDom,
    toFieldMap,
    filledCount
  });
})();
