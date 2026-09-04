// ============================================================
// GANFPU Semantic Similarity Guard
// ============================================================
// Semantic similarity is a secondary duplicate detector.
// It never establishes facts and never replaces deterministic
// provenance checks in grill-engine.js.
//
// IMPORTANT: semantic similarity must not merge independent
// requirement nodes. Node identity is deterministic:
// field_id + normalized user-grounded dimension_anchor.

(() => {
  const MODEL = 'onnx-community/ruri-v3-30m-ONNX';
  const THRESHOLD = 0.90;
  const MAX_RETRIES = 2;
  const CACHE_LIMIT = 96;

  let extractorPromise = null;
  const cache = new Map();

  function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function requirementNodeKeys(interviewState) {
    const nodes = Array.isArray(interviewState?.requirementNodes) ? interviewState.requirementNodes : [];
    const nodeKeys = nodes.map((node) => normalize(node?.key)).filter(Boolean);
    const legacyKeys = Array.isArray(interviewState?.blockedRequirementNodes) ? interviewState.blockedRequirementNodes : [];
    return [...new Set([...nodeKeys, ...legacyKeys.map(normalize).filter(Boolean)])];
  }

  function cosine(a, b) {
    if (!a || !b || a.length !== b.length || !a.length) return null;
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
    const denom = Math.sqrt(aa) * Math.sqrt(bb);
    return denom > 0 ? dot / denom : null;
  }

  async function getExtractor() {
    if (!extractorPromise) {
      extractorPromise = (async () => {
        try {
          const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm');
          return await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
        } catch (error) {
          extractorPromise = null;
          console.warn('[GANFPU] Semantic similarity unavailable:', error);
          return null;
        }
      })();
    }
    return extractorPromise;
  }

  async function embed(text) {
    const value = normalize(text);
    if (!value) return null;
    if (cache.has(value)) return cache.get(value);
    const extractor = await getExtractor();
    if (!extractor) return null;
    try {
      const output = await extractor(value, { pooling: 'mean', normalize: true });
      const vector = output?.data ? Array.from(output.data) : null;
      if (!vector?.length) return null;
      cache.set(value, vector);
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
      return vector;
    } catch (error) {
      console.warn('[GANFPU] Semantic embedding failed:', error);
      return null;
    }
  }

  function previousInterviewQuestions(messages) {
    return (messages || [])
      .filter((message) => message.role === 'assistant' && !message.synthetic)
      .map((message) => normalize(message.content))
      .filter((text) => text && /[?？]|ですか|ますか|でしょうか|どのよう|どちら|何を|何が|どんな|どれ/.test(text))
      .filter((text) => !/おすすめ|推薦|候補|以下の|検討してみ|最適です|選ぶとよい|\bhttps?:\/\//i.test(text));
  }

  async function maxSimilarity(query, candidates) {
    const q = await embed(query);
    if (!q) return { score: null, match: null };
    let best = { score: -1, match: null };
    for (const candidate of candidates || []) {
      const text = normalize(candidate);
      if (!text) continue;
      const vector = await embed(text);
      const score = cosine(q, vector);
      if (score !== null && score > best.score) best = { score, match: text };
    }
    return best.score >= 0 ? best : { score: null, match: null };
  }

  function candidateSemanticText(result) {
    const candidate = result?.candidate || {};
    return normalize([result?.question, candidate.field_id, candidate.dimension_anchor, candidate.missing_requirement].filter(Boolean).join(' '));
  }

  function candidateNodeKey(engine, result) {
    return typeof engine?.requirementNodeKey === 'function' ? normalize(engine.requirementNodeKey(result?.candidate)) : '';
  }

  function nodeKeyExists(interviewState, key) {
    if (!key) return false;
    return requirementNodeKeys(interviewState).some((value) => normalize(value) === key);
  }

  function installGrillGuard() {
    const engine = window.ganfpuGrillEngine;
    if (!engine?.nextQuestion || engine.nextQuestion.__semanticGuardInstalled) return;
    const original = engine.nextQuestion;
    const guarded = async function guardedNextQuestion(messages, interviewState = {}) {
      const hasAuthoritativeNodes = Array.isArray(interviewState.requirementNodes) && interviewState.requirementNodes.length > 0;
      const blockedRequirementNodes = requirementNodeKeys(interviewState);
      const blockedSemanticQuestions = [
        ...(interviewState.blockedSemanticQuestions || []),
        ...previousInterviewQuestions(messages),
      ];

      // Semantic similarity is never allowed to reject a candidate merely
      // because it resembles a question for a different requirement node.
      // The deterministic node key owns that decision.
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        const result = await original(messages, { ...interviewState, blockedRequirementNodes });
        if (result?.status && result.status !== 'question') return result;

        const nodeKey = candidateNodeKey(engine, result);
        if (hasAuthoritativeNodes && nodeKey && !nodeKeyExists(interviewState, nodeKey)) return result;
        if (!nodeKey && hasAuthoritativeNodes) return result;
        if (!blockedSemanticQuestions.length) return result;

        const text = candidateSemanticText(result);
        if (!text) return result;
        const similarity = await maxSimilarity(text, blockedSemanticQuestions);
        if (similarity.score === null || similarity.score < THRESHOLD) return result;

        // A same-node semantic duplicate is safe to reject. Different-node
        // candidates were returned above and therefore remain independent.
        if (nodeKey && !blockedRequirementNodes.some((value) => normalize(value) === nodeKey)) return result;
        console.info('[GANFPU] Semantic duplicate question rejected:', {
          score: Number(similarity.score.toFixed(3)),
          matchedQuestion: similarity.match,
          candidateQuestion: normalize(result.question),
          nodeKey,
        });
      }
      return { status:'blocked', reason:'semantic_duplicate_question', question:'', candidate:null, evidence:[] };
    };
    guarded.__semanticGuardInstalled = true;
    engine.nextQuestion = guarded;
  }

  window.ganfpuSemanticSimilarity = { embed, cosine, maxSimilarity, threshold: THRESHOLD, model: MODEL };
  installGrillGuard();
  if (!window.ganfpuGrillEngine?.nextQuestion) setTimeout(installGrillGuard, 0);
})();
