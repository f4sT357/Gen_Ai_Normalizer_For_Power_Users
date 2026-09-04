// ============================================================
// GANFPU Grill Me interview dimensions
// Fixed application-owned vocabulary for requirement discovery.
// ============================================================

(() => {
  const DIMENSIONS = Object.freeze({
    use_case: 'f-context',
    audience: 'f-context',
    scope: 'f-task',
    selection_criteria: 'f-constraint',
    priority: 'f-constraint',
    budget: 'f-constraint',
    environment: 'f-context',
    preferences: 'f-constraint',
    comparison_axis: 'f-constraint',
    output_expectation: 'f-format',
    tone: 'f-tone',
    length: 'f-length',
    reasoning: 'f-reasoning',
    language: 'f-lang',
    hallucination_policy: 'f-hallucination',
  });

  window.ganfpuGrillInterviewDimensions = {
    ids: Object.freeze(Object.keys(DIMENSIONS)),
    fieldFor: (dimension) => DIMENSIONS[String(dimension || '').trim()] || '',
    has: (dimension) => Object.prototype.hasOwnProperty.call(DIMENSIONS, String(dimension || '').trim()),
  };
})();
