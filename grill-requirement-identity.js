// ============================================================
// GANFPU Grill requirement identity guard
// Keeps requirement-node identity grounded in user-source spans.
// This is a secondary guard: the existing deterministic node key
// remains the compatibility identifier.
// ============================================================

(() => {
  function normalize(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeQuote(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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
      const groundingMatches = occurrences(entry.content, grounding);
      for (const groundingMatch of groundingMatches) {
        const relativeMatches = occurrences(grounding, anchor);
        for (const relativeMatch of relativeMatches) {
          candidates.push({
            message_index: entry.message_index,
            start: groundingMatch.start + relativeMatch.start,
            end: groundingMatch.start + relativeMatch.end,
          });
        }
      }
    }

    if (candidates.length !== 1) return null;
    return candidates[0];
  }

  function resolveNodeSource(node, messages) {
    if (!node) return null;
    return resolveCandidateSource({
      dimension_anchor: node.anchor,
      grounding_quote: node.grounding_quote,
    }, messages);
  }

  function sameSource(candidateSource, nodeSource) {
    return !!candidateSource && !!nodeSource &&
      candidateSource.message_index === nodeSource.message_index &&
      candidateSource.start < nodeSource.end &&
      nodeSource.start < candidateSource.end;
  }

  function sameField(candidate, node) {
    return normalize(candidate?.field_id) === normalize(node?.field_id);
  }

  function hasSourceIdentityConflict(candidate, interviewState, messages) {
    const nodes = Array.isArray(interviewState?.requirementNodes) ? interviewState.requirementNodes : [];
    if (!nodes.length) return false;

    const candidateSource = resolveCandidateSource(candidate, messages);
    if (!candidateSource) return false;

    return nodes.some((node) => {
      if (!sameField(candidate, node)) return false;
      const nodeSource = resolveNodeSource(node, messages);
      return sameSource(candidateSource, nodeSource);
    });
  }

  function install() {
    if (!window.ganfpuGrillEngine || typeof window.ganfpuGrillEngine.nextQuestion !== 'function') return false;
    if (window.ganfpuGrillEngine.__sourceIdentityGuardInstalled) return true;

    const originalNextQuestion = window.ganfpuGrillEngine.nextQuestion;
    window.ganfpuGrillEngine.nextQuestion = async (messages, interviewState = {}) => {
      const result = await originalNextQuestion(messages, interviewState);
      if (result?.status !== 'question' || !result.candidate) return result;

      if (hasSourceIdentityConflict(result.candidate, interviewState, messages)) {
        return {
          status: 'blocked',
          reason: 'requirement_source_already_asked',
          question: '',
          candidate: result.candidate,
          evidence: result.evidence || [],
        };
      }
      return result;
    };

    window.ganfpuGrillEngine.__sourceIdentityGuardInstalled = true;
    return true;
  }

  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 50);
  install();
})();
