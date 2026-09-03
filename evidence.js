// ============================================================
// GANFPU Evidence Layer
//
// Provides a provider-neutral interface for external evidence.
// Search is intentionally kept separate from Grill Me and the
// LLM bridge. Evidence is reference data, not instructions.
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

  function normalizeTerm(term) {
    return String(term || '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function buildVerificationQueries(term, options = {}) {
    const value = normalizeTerm(term);
    if (!value) return [];

    const queries = [
      `"${value}" terminology`,
      `"${value}" definition`,
      `${value} meaning terminology`,
    ];

    if (Array.isArray(options.queries)) {
      queries.push(...options.queries.map((query) => String(query || '').trim()));
    }

    return [...new Set(queries.filter(Boolean))];
  }

  function normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch (e) {
      return String(url || '').trim();
    }
  }

  function hostnameFor(result) {
    try {
      return new URL(result.url).hostname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function collectEvidence(searches) {
    const byUrl = new Map();
    searches.forEach((item) => {
      (item.results || []).forEach((result) => {
        const key = normalizeUrl(result.url) || `${result.source}|${result.title}`;
        const existing = byUrl.get(key);
        if (existing) {
          existing.matchedQueries = [...new Set([...existing.matchedQueries, item.query])];
        } else {
          byUrl.set(key, { ...result, matchedQueries: [item.query] });
        }
      });
    });
    return [...byUrl.values()];
  }

  function assessEvidence(evidence, searches) {
    const nonEmptySearches = searches.filter((item) => item.results.length > 0).length;
    const hosts = new Set(evidence.map(hostnameFor).filter(Boolean));

    // Search engines and result-source labels are not independent factual sources.
    // Require two distinct web hosts with actual URLs, and do not count multiple
    // search-engine hits that resolve to the same host as corroboration.
    const independentHosts = hosts.size;

    let status = 'insufficient';
    let confidence = 0;
    if (nonEmptySearches >= 2 && independentHosts >= 2) {
      status = 'supported';
      confidence = Math.min(0.8, 0.45 + independentHosts * 0.1 + nonEmptySearches * 0.05);
    } else if (nonEmptySearches === 0) {
      status = 'unsupported';
      confidence = 0.8;
    } else {
      confidence = Math.min(0.39, 0.1 + nonEmptySearches * 0.08);
    }

    return { status, confidence, nonEmptySearches, independentHosts };
  }

  async function verifyTerm(term, options = {}) {
    const value = normalizeTerm(term);
    if (!value) throw new Error('Evidence verification term is empty.');

    const queries = buildVerificationQueries(value, options);
    const settled = await Promise.all(
      queries.map(async (query) => {
        try {
          return await search(query, { limit: options.limit || 6 });
        } catch (error) {
          return { query, results: [], errors: [String(error.message || error)] };
        }
      })
    );

    const evidence = collectEvidence(settled);
    const assessment = assessEvidence(evidence, settled);

    return {
      term: value,
      status: assessment.status,
      confidence: assessment.confidence,
      evidence,
      searches: settled,
      warnings: [
        'Evidence indicates usage or corroboration; it does not establish factual truth by itself.',
        'Corroboration is based on distinct web hosts, not independent verification of factual truth.',
      ],
    };
  }

  window.ganfpuEvidence = {
    search,
    verifyTerm,
    getEndpoint,
    setEndpoint,
  };
})();
