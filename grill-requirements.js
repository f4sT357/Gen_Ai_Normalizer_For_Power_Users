// ============================================================
// GANFPU Grill Me requirement node state
// Owns requirement-node bookkeeping independently of UI flow.
// ============================================================

(() => {
  function normalizeStateValue(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  }

  function normalizeQuote(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function requirementNodeKey(fieldId, anchor) {
    if (!window.ganfpuGrillEngine?.requirementNodeKey) return '';
    return window.ganfpuGrillEngine.requirementNodeKey({ field_id: fieldId, dimension_anchor: anchor });
  }

  function isUnresolvedAnswer(text) {
    const normalized = normalizeStateValue(text);
    return normalized ? /^(分からない|わからない|不明|未定|決めていない|決まっていない|特に決めてない|まだ分からない|まだわからない|よく分からない|よくわからない)$/.test(normalized) : false;
  }

  function createState() {
    return {
      requirementNodes: [],
      blockedRequirementNodes: [],
      lastQuestion: null,
      interviewComplete: false,
    };
  }

  function syncBlockedRequirementNodes(state) {
    state.blockedRequirementNodes = state.requirementNodes
      .filter((node) => node && node.key)
      .map((node) => node.key);
  }

  function upsert(state, candidate) {
    const key = requirementNodeKey(candidate?.field_id, candidate?.dimension_anchor);
    if (!key) return '';
    const existing = state.requirementNodes.find((node) => normalizeStateValue(node.key) === normalizeStateValue(key));
    if (existing) return key;

    state.requirementNodes.push({
      key,
      field_id: String(candidate.field_id || '').trim(),
      dimension: String(candidate.dimension || '').trim(),
      anchor: String(candidate.dimension_anchor || '').trim(),
      grounding_quote: String(candidate.grounding_quote || '').trim(),
      status: 'unresolved',
      answer: '',
      answer_quote: '',
      evidence: [],
    });
    return key;
  }

  function resolveLastQuestion(state, answer) {
    const last = state.lastQuestion;
    if (!last) return;
    const key = requirementNodeKey(last.field_id, last.dimension_anchor);
    const node = state.requirementNodes.find((item) => normalizeStateValue(item.key) === normalizeStateValue(key));
    if (!node) {
      state.lastQuestion = null;
      return;
    }
    node.status = isUnresolvedAnswer(answer) ? 'explicitly_unknown' : 'answered';
    node.answer = String(answer || '').trim();
    node.answer_quote = String(answer || '').trim();
    syncBlockedRequirementNodes(state);
    state.lastQuestion = null;
  }

  function setLastQuestion(state, candidate, question) {
    const key = upsert(state, candidate);
    state.lastQuestion = {
      key,
      field_id: String(candidate?.field_id || '').trim(),
      dimension: String(candidate?.dimension || '').trim(),
      dimension_anchor: String(candidate?.dimension_anchor || '').trim(),
      question: String(question || '').trim(),
    };
    syncBlockedRequirementNodes(state);
  }

  function authoritativeUsers(messages) {
    return (messages || [])
      .map((message, message_index) => ({ message, message_index }))
      .filter(({ message }) => message?.role === 'user' && !message.synthetic)
      .map(({ message, message_index }) => ({
        message_index,
        content: String(message.content || '').trim(),
      }))
      .filter(({ content }) => content);
  }

  function occurrences(haystack, needle) {
    const source = normalizeQuote(haystack);
    const target = normalizeQuote(needle);
    if (!source || !target) return [];
    const result = [];
    let start = 0;
    while (start <= source.length - target.length) {
      const index = source.indexOf(target, start);
      if (index < 0) break;
      result.push({ start: index, end: index + target.length });
      start = index + 1;
    }
    return result;
  }

  function resolveCandidateSource(candidate, messages) {
    const anchor = normalizeQuote(candidate?.dimension_anchor);
    const grounding = normalizeQuote(candidate?.grounding_quote);
    if (!anchor || !grounding) return null;

    const candidates = [];
    for (const entry of authoritativeUsers(messages)) {
      for (const groundingMatch of occurrences(entry.content, grounding)) {
        for (const relativeMatch of occurrences(grounding, anchor)) {
          candidates.push({
            message_index: entry.message_index,
            start: groundingMatch.start + relativeMatch.start,
            end: groundingMatch.start + relativeMatch.end,
          });
        }
      }
    }

    return candidates.length === 1 ? candidates[0] : null;
  }

  function resolveNodeSource(node, messages) {
    return resolveCandidateSource({
      dimension_anchor: node?.anchor,
      grounding_quote: node?.grounding_quote,
    }, messages);
  }

  function sameSource(a, b) {
    return !!a && !!b && a.message_index === b.message_index && a.start < b.end && b.start < a.end;
  }

  function hasSourceIdentityConflict(state, candidate, messages) {
    const candidateSource = resolveCandidateSource(candidate, messages);
    if (!candidateSource) return false;
    return state.requirementNodes.some((node) => {
      if (normalizeStateValue(candidate?.field_id) !== normalizeStateValue(node?.field_id)) return false;
      return sameSource(candidateSource, resolveNodeSource(node, messages));
    });
  }

  window.ganfpuGrillRequirements = {
    createState,
    syncBlockedRequirementNodes,
    upsert,
    resolveLastQuestion,
    setLastQuestion,
    hasSourceIdentityConflict,
  };
})();
