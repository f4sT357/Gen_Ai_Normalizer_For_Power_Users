(() => {
  'use strict';

  const TASK_TYPES = new Set(['transformation', 'knowledge', 'recommendation', 'research', 'unknown']);
  const llm = () => window.ganfpuLLMAdapter || window.ganfpuLLM;

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function authoritativeUserMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
      .filter((message) => message?.role === 'user' && !message?.synthetic)
      .map((message) => text(message.content))
      .filter(Boolean);
  }

  function transcript(messages) {
    return authoritativeUserMessages(messages).join('\n');
  }

  function heuristicIntent(messages) {
    const input = transcript(messages);
    if (!input) return { task_type: 'unknown', knowledge_needed: false, confidence: 0 };

    if (/(?:調べて|調査して|リサーチ|最新|最近の|比較して|比較)/i.test(input)) {
      return { task_type: 'research', knowledge_needed: true, confidence: 0.72 };
    }

    // "選び方を教えて" asks for decision criteria, not a recommendation.
    // Keep it in Knowledge so Knowledge Discovery can supply the external axes
    // before Requirement Discovery asks for the user's own criteria.
    if (/(?:選び方|選ぶ基準|選定基準|選定方法|選ぶ方法).*(?:教えて|知りたい|説明|解説)/i.test(input)) {
      return { task_type: 'knowledge', knowledge_needed: true, confidence: 0.84 };
    }

    if (/(?:おすすめ|推薦|推奨|選んで|選びたい|どれがいい|どれが良い|どれにすべき|どれにしたら)/i.test(input)) {
      return { task_type: 'recommendation', knowledge_needed: true, confidence: 0.82 };
    }

    if (/(?:教えて|とは|意味|どういう|説明して|解説して|知りたい)/i.test(input) &&
        !/(?:コード|文章|文書|メール|翻訳|要約|書き換え|修正|レビュー)/i.test(input)) {
      return { task_type: 'knowledge', knowledge_needed: true, confidence: 0.68 };
    }

    if (/(?:コード|文章|文書|メール|翻訳|要約|書き換え|修正|レビュー|生成して|作って|変換して)/i.test(input)) {
      return { task_type: 'transformation', knowledge_needed: false, confidence: 0.7 };
    }

    return { task_type: 'unknown', knowledge_needed: false, confidence: 0.35 };
  }

  function normalizeResult(result, messages) {
    const heuristic = heuristicIntent(messages);
    const taskType = text(result?.task_type).toLowerCase();
    const normalizedType = TASK_TYPES.has(taskType) ? taskType : heuristic.task_type;
    const confidence = Number(result?.confidence);
    return {
      task_type: normalizedType,
      knowledge_needed:
        normalizedType === 'knowledge' ||
        normalizedType === 'recommendation' ||
        normalizedType === 'research'
          ? true
          : Boolean(result?.knowledge_needed),
      confidence: Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : heuristic.confidence
    };
  }

  async function analyze(messages) {
    const users = authoritativeUserMessages(messages);
    if (!users.length) return { task_type: 'unknown', knowledge_needed: false, confidence: 0 };

    const heuristic = heuristicIntent(messages);
    const adapter = llm();
    if (!adapter?.request) return heuristic;

    const prompt = [
      'Classify the user request for routing only.',
      'Do not extract requirements.',
      'Do not infer user preferences, domain facts, recommendations, or solutions.',
      'Use only authoritative user messages.',
      'Allowed task_type values: transformation, knowledge, recommendation, research, unknown.',
      'knowledge_needed is a routing flag, not a statement of domain knowledge.',
      'A request asking how to choose something or what criteria to use is knowledge when it asks for the selection method itself.',
      'A request asking you to choose/recommend a specific option is recommendation.',
      'Return ONLY valid JSON.',
      '{"task_type":"knowledge","knowledge_needed":true,"confidence":0.8}',
      `USER MESSAGES:\n${JSON.stringify(users)}`
    ].join('\n');

    try {
      const raw = await adapter.request([
        { role: 'system', content: 'You are an intent routing component. Classify only.' },
        { role: 'user', content: prompt }
      ], 0.1);
      return normalizeResult(
        JSON.parse(text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')),
        messages
      );
    } catch (_) {
      return heuristic;
    }
  }

  window.ganfpuIntentAnalyzer = Object.freeze({
    TASK_TYPES: Object.freeze([...TASK_TYPES]),
    authoritativeUserMessages,
    heuristicIntent,
    analyze
  });
})();
