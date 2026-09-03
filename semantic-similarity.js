// ============================================================
// GANFPU Semantic Similarity Guard
// ============================================================
// Optional local semantic similarity for interview-state checks.
// This is a guard against wording drift, not a source of truth.
// If the local embedding runtime is unavailable, the existing
// deterministic Grill Engine checks continue to operate unchanged.

(() => {
  const MODEL = 'onnx-community/ruri-v3-30m-ONNX';
  const THRESHOLD = 0.90;
  const CACHE_LIMIT = 64;

  let extractorPromise = null;
  const cache = new Map();

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function cosine(a, b) {
    if (!a || !b || a.length !== b.length || !a.length) return null;
    let dot = 0;
    let aa = 0;
    let bb = 0;
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      aa += a[i] * a[i];
      bb += b[i] * b[i];
    }
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
      // Ruri v3 uses an empty prefix for semantic-meaning embeddings.
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

  function installGrillGuard() {
    const engine = window.ganfpuGrillEngine;
    if (!engine?.nextQuestion || engine.nextQuestion.__semanticGuardInstalled) return;

    const original = engine.nextQuestion;

    const guarded = async function guardedNextQuestion(messages, interviewState = {}) {
      let workingState = {
        ...interviewState,
        blockedAnchors: [...(interviewState.blockedAnchors || [])],
        blockedDimensions: [...(interviewState.blockedDimensions || [])],
      };

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await original(messages, workingState);
        const anchor = normalize(result?.candidate?.dimension_anchor);
        const blocked = workingState.blockedAnchors || [];
        if (!anchor || !blocked.length) return result;

        const similarity = await maxSimilarity(anchor, blocked);
        if (similarity.score === null || similarity.score < THRESHOLD) return result;

        // Treat semantic proximity as a secondary guard only. The existing engine's
        // exact provenance checks remain authoritative; this guard merely asks it
        // for another candidate when the wording changed but the grounded dimension
        // is effectively the same.
        if (!workingState.blockedAnchors.includes(anchor)) {
          workingState.blockedAnchors.push(anchor);
        }
        const dimension = normalize(result?.candidate?.dimension);
        if (dimension && !workingState.blockedDimensions.includes(dimension)) {
          workingState.blockedDimensions.push(dimension);
        }

        console.info('[GANFPU] Semantic duplicate dimension rejected:', {
          score: Number(similarity.score.toFixed(3)),
          matchedAnchor: similarity.match,
          candidateAnchor: anchor,
        });
      }

      return { question: '', candidate: null };
    };

    guarded.__semanticGuardInstalled = true;
    engine.nextQuestion = guarded;
  }

  window.ganfpuSemanticSimilarity = {
    embed,
    cosine,
    maxSimilarity,
    threshold: THRESHOLD,
    model: MODEL,
  };

  // grill-engine.js is loaded immediately before this file in index.html.
  // Retry once defensively so this remains safe if script loading order changes.
  installGrillGuard();
  if (!window.ganfpuGrillEngine?.nextQuestion) {
    setTimeout(installGrillGuard, 0);
  }
})();
