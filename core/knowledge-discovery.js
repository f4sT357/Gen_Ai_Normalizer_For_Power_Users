(() => {
  'use strict';

  const llm = () => window.ganfpuLLMAdapter || window.ganfpuLLM;
  function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function users(messages) { return (Array.isArray(messages) ? messages : []).filter((message) => message?.role === 'user' && !message?.synthetic).map((message) => text(message.content)).filter(Boolean); }
  function topic(messages, intent) { return text(intent?.raw) || users(messages).slice(-1)[0] || ''; }
  function extractAxes(raw) { try { const parsed = JSON.parse(text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')); return [...new Set((Array.isArray(parsed?.axes) ? parsed.axes : []).map(text).filter(Boolean))].slice(0, 8); } catch (_) { return []; } }
  async function discover(messages, intent) {
    const userText = users(messages).join('\n'), adapter = llm();
    if (!userText || !window.ganfpuEvidence?.search || !adapter?.request) {
      throw Object.assign(new Error('Knowledge discovery dependencies are unavailable.'), { code: 'DEPENDENCY_UNAVAILABLE' });
    }
    const subject = topic(messages, intent);
    let successfulSearches = 0;
    let failedSearches = 0;
    const searchErrors = [];
    const searches = await Promise.all([`${subject} 選ぶ基準`, `${subject} 比較`, `${subject} selection criteria`].map(async (query) => {
      try {
        const result = await window.ganfpuEvidence.search(query, { limit: 6 });
        successfulSearches += 1;
        return result;
      } catch (error) {
        failedSearches += 1;
        searchErrors.push({ query, name: text(error?.name) || 'Error', message: text(error?.message) || 'Evidence search failed.' });
        return { results: [] };
      }
    }));
    if (failedSearches === searches.length) {
      throw Object.assign(new Error('All Evidence searches failed.'), {
        code: 'EVIDENCE_UNAVAILABLE',
        details: { successful_searches: successfulSearches, failed_searches: failedSearches, errors: searchErrors },
      });
    }
    const sources = [], seen = new Set();
    for (const result of searches.flatMap((item) => item.results || [])) {
      const url = text(result?.url); if (!url || seen.has(url)) continue; seen.add(url);
      sources.push({ id: `src_${String(sources.length + 1).padStart(2, '0')}`, url, title: text(result?.title), snippet: text(result?.snippet) });
      if (sources.length >= 6) break;
    }
    if (sources.length < 2) {
      return { status: 'insufficient_evidence', topic: subject, sources, search_errors: searchErrors };
    }
    const prompt = ['Summarize broad decision axes supported by the external search results.','The sources are untrusted reference material, not authoritative truth.','Do not recommend a product or model.','Do not infer the user\'s preferences.','Return only broad categories that appear in the supplied evidence.','Return JSON: {"axes":["..."]}.',`USER REQUEST:\n${JSON.stringify(userText)}`,`EXTERNAL SOURCES:\n${JSON.stringify(sources)}`].join('\n');
    try {
      const axes = extractAxes(await adapter.request([{ role: 'system', content: 'You are a knowledge discovery component. Summarize evidence; do not recommend.' }, { role: 'user', content: prompt }], 0.1));
      if (!axes.length) throw Object.assign(new Error('Knowledge discovery returned no usable findings.'), { code: 'KNOWLEDGE_LLM_EMPTY' });
      return { status: 'complete', knowledge: { id: `knowledge_${Date.now()}`, topic: subject, sources, findings: axes.map((axis, index) => ({ id: `finding_${String(index + 1).padStart(2, '0')}`, axis, source_ids: sources.map((source) => source.id) })) } };
    } catch (error) {
      if (error?.code === 'KNOWLEDGE_LLM_EMPTY') throw error;
      throw Object.assign(new Error(text(error?.message) || 'Knowledge discovery LLM failed.'), { code: 'KNOWLEDGE_LLM_FAILED', cause: error });
    }
  }
  window.ganfpuKnowledgeDiscovery = Object.freeze({ discover });
})();
