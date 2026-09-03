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
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch (e) {
      return '';
    }
  }

  function hostnameFor(result) {
    try {
      const parsed = new URL(result.url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      return parsed.hostname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function searchableText(result) {
    return [result.title, result.snippet]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
  }

  function termAppearsInResult(term, result) {
    const value = normalizeTerm(term).toLocaleLowerCase();
    if (!value) return false;
    return searchableText(result).includes(value);
  }

  function collectEvidence(searches, term) {
    const byUrl = new Map();
    searches.forEach((item) => {
      (item.results || []).forEach((result) => {
        const normalizedUrl = normalizeUrl(result.url);
        if (!normalizedUrl || !termAppearsInResult(term, result)) return;

        const existing = byUrl.get(normalizedUrl);
        if (existing) {
          existing.matchedQueries = [...new Set([...existing.matchedQueries, item.query])];
        } else {
          byUrl.set(normalizedUrl, {
            ...result,
            url: normalizedUrl,
            matchedQueries: [item.query],
          });
        }
      });
    });
    return [...byUrl.values()];
  }

  function assessEvidence(evidence, searches) {
    const corroboratingSearches = searches.filter((item) => item.results.length > 0).length;
    const hosts = new Set(evidence.map(hostnameFor).filter(Boolean));

    // Search engines and result-source labels are not independent factual sources.
    // Require term-bearing results from two distinct web hosts. This establishes
    // external usage/corroboration only; it does not establish factual truth.
    const independentHosts = hosts.size;

    let status = 'insufficient';
    let confidence = 0;
    if (corroboratingSearches >= 2 && independentHosts >= 2) {
      status = 'supported';
      confidence = Math.min(0.8, 0.45 + independentHosts * 0.1 + corroboratingSearches * 0.05);
    } else if (evidence.length === 0) {
      status = 'unsupported';
      confidence = 0.8;
    } else {
      confidence = Math.min(0.39, 0.1 + corroboratingSearches * 0.08);
    }

    return { status, confidence, corroboratingSearches, independentHosts };
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

    // Search success alone is not evidence. A result must contain the exact term
    // in its title or snippet before it can contribute to corroboration.
    const relevantSearches = settled.map((item) => ({
      ...item,
      results: item.results.filter((result) => termAppearsInResult(value, result)),
    }));
    const evidence = collectEvidence(relevantSearches, value);
    const assessment = assessEvidence(evidence, relevantSearches);

    return {
      term: value,
      status: assessment.status,
      confidence: assessment.confidence,
      evidence,
      searches: settled,
      warnings: [
        'Evidence indicates usage or corroboration; it does not establish factual truth by itself.',
        'Corroboration requires term-bearing results from distinct web hosts; this still does not prove source independence or factual truth.',
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
