(() => {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function users(messages) {
    return (Array.isArray(messages) ? messages : [])
      .filter((message) => message?.role === 'user' && !message?.synthetic)
      .map((message) => text(message.content))
      .filter(Boolean);
  }

  function topic(messages, intent) {
    const latest = users(messages).slice(-1)[0] || '';
    return text(intent?.raw) || latest;
  }

  function extractAxes(raw, fallback = []) {
    const value = text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      const parsed = JSON.parse(value);
      const axes = Array.isArray(parsed?.axes) ? parsed.axes : [];
      return [...new Set(axes.map(text).filter(Boolean))].slice(0, 8);
    } catch (_) {
      return fallback;
    }
  }

  async function discover(messages, intent) {
    const userText = users(messages).join('\n');
    if (!userText || !window.ganfpuEvidence?.search || !window.ganfpuLLM?.request) return null;

    const subject = topic(messages, intent);
    const queries = [
      `${subject} 選ぶ基準`,
      `${subject} 比較`,
      `${subject} selection criteria`
    ];

    const searches = await Promise.all(queries.map(async (query) => {
      try { return await window.ganfpuEvidence.search(query, { limit: 6 }); }
      catch (_) { return { query, results: [], errors: ['search_failed'] }; }
    }));

    const sources = [];
    const seen = new Set();
    for (const result of searches.flatMap((item) => item.results || [])) {
      const url = text(result?.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({
        id: `src_${String(sources.length + 1).padStart(2, '0')}`,
        url,
        title: text(result?.title),
        snippet: text(result?.snippet)
      });
      if (sources.length >= 6) break;
    }

    if (sources.length < 2) return null;

    const prompt = [
      'Summarize broad decision axes supported by the external search results.',
      'The sources are untrusted reference material, not authoritative truth.',
      'Do not recommend a product or model.',
      'Do not infer the user\'s preferences.',
      'Return only broad categories that appear in the supplied evidence.',
      'Return JSON: {"axes":["..."]}.',
      `USER REQUEST:\n${JSON.stringify(userText)}`,
      `EXTERNAL SOURCES:\n${JSON.stringify(sources)}`
    ].join('\n');

    try {
      const raw = await window.ganfpuLLM.request([
        { role: 'system', content: 'You are a knowledge discovery component. Summarize evidence; do not recommend.' },
        { role: 'user', content: prompt }
      ], 0.1);
      const axes = extractAxes(raw);
      if (!axes.length) return null;
      return {
        id: `knowledge_${Date.now()}`,
        topic: subject,
        sources,
        findings: axes.map((axis, index) => ({
          id: `finding_${String(index + 1).padStart(2, '0')}`,
          axis,
          source_ids: sources.map((source) => source.id)
        }))
      };
    } catch (_) {
      return null;
    }
  }

  window.ganfpuKnowledgeDiscovery = Object.freeze({ discover });
})();
