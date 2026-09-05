// ============================================================
// GANFPU Grill unknown-answer compatibility
// Broadens natural-language "I don't know" answers without
// modifying the authoritative user-message model.
// ============================================================

(() => {
  const UNKNOWN_ANSWER_RE =
    /(?:分からない|わからない|分からん|わからん|よく分からん|よくわからん|不明|未定|決めていない|決めてない|決まっていない|決まってない|詳しくない|よく知らない|知らない|任せる|お任せ|おまかせ)/i;
  const originalNextQuestion = window.ganfpuGrillEngine?.nextQuestion;
  if (typeof originalNextQuestion !== 'function') return;

  window.ganfpuGrillEngine.nextQuestion = async function (messages, interviewState = {}) {
    const nodes = Array.isArray(interviewState?.requirementNodes)
      ? interviewState.requirementNodes
      : [];
    const normalized = (value) =>
      String(value || '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim();
    const selectionNode = nodes.find(
      (node) =>
        normalized(node?.dimension) === 'selection_criteria' &&
        UNKNOWN_ANSWER_RE.test(normalized(node?.answer))
    );
    if (!selectionNode) return originalNextQuestion(messages, interviewState);

    const state = {
      ...interviewState,
      requirementNodes: nodes.map((node) =>
        node === selectionNode
          ? { ...node, status: 'explicitly_unknown', answer: 'わからない' }
          : { ...node }
      ),
    };
    return originalNextQuestion(messages, state);
  };
})();
