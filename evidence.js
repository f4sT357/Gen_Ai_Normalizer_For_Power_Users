// ============================================================
// GANFPU Evidence Layer
//
// Provides a provider-neutral interface for external evidence.
// Search is intentionally kept separate from Grill Me and the
// LLM bridge. The returned shape is GANFPU's internal contract.
// ============================================================

(() => {
  const STORAGE_KEY = 'ganfpu_evidence_endpoint';
  const DEFAULT_ENDPOINT = 'http://localhost:8787/evidence/search';

  function getEndpoint() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_ENDPOINT;
  }

  function setEndpoint(endpoint) {
    const value = String(endpoint || '').trim();
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  }

  function normalizeResult(result) {
    if (!result || typeof result !== 'object') return null;
    const title = typeof result.title === 'string' ? result.title.trim() : '';
    const url = typeof result.url === 'string' ? result.url.trim() : '';
    const snippet = typeof result.snippet === 'string' ? result.snippet.trim() : '';
    const source = typeof result.source === 'string' ? result.source.trim() : '';

    if (!title && !url && !snippet) return null;
    return { title, url, snippet, source };
  }

  async function search(query, options = {}) {
    const text = String(query || '').trim();
    if (!text) throw new Error('Evidence search query is empty.');

    const params = new URLSearchParams();
    params.set('q', text);
    params.set('limit', String(Number.isFinite(options.limit) ? options.limit : 8));

    const response = await fetch(`${getEndpoint()}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Evidence search failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    const results = Array.isArray(data.results)
      ? data.results.map(normalizeResult).filter(Boolean)
      : [];

    return {
      query: text,
      results,
      errors: Array.isArray(data.errors) ? data.errors : [],
    };
  }

  window.ganfpuEvidence = {
    search,
    getEndpoint,
    setEndpoint,
  };
})();
