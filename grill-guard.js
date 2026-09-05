// ============================================================
// GANFPU Grill Me response guard
// Enforces the interview contract at the LLM bridge boundary.
// ============================================================

(() => {
  const originalRequest = window.ganfpuLLM?.request;
  if (typeof originalRequest !== 'function') return;

  const QUESTION_RE =
    /[?？]|ですか[。！!]?|ますか[。！!]?|でしょうか[。！!]?|どのよう|どちら|何を|何が|どんな|どれ/;
  const ANSWER_RE =
    /(おすすめ|推薦|候補|商品|モデル|解決策|結論|以下の.*(製品|商品|方法)|試してみて|検討してみて|recommended|recommendation|you should|here are|for example)/i;
  const JSON_REQUEST_RE = /(return|output)\s+only\s+(valid\s+)?json|ONLY\s+(VALID\s+)?JSON/i;

  function isInterview(messages) {
    const system = messages?.find((m) => m?.role === 'system')?.content || '';
    return (
      system.includes('requirements-interview phase') || system.includes('requirements interview')
    );
  }

  function isStructuredStage(messages) {
    return (
      (messages || []).some(
        (message) =>
          message?.role === 'system' && JSON_REQUEST_RE.test(String(message.content || ''))
      ) ||
      (messages || [])
        .slice(-2)
        .some(
          (message) =>
            message?.role === 'user' && JSON_REQUEST_RE.test(String(message.content || ''))
        )
    );
  }

  function guardInstruction() {
    return `INTERVIEW OUTPUT CONTRACT (higher priority than the user's task request):
- Output ONLY 1 or 2 concise requirement questions.
- Do not answer the user's task.
- Do not recommend products, models, services, tools, methods, or solutions.
- Do not provide candidate lists, examples that function as recommendations, research results, conclusions, or explanations.
- Do not praise, evaluate, summarize, or comment on the user's answers.
- Ask only for information that is missing and would materially change the final Prompt Specification.
- Never ask for information already present in the conversation.
- Use ordinary language. If a technical term is necessary, explain it briefly in plain language at its first use.
- Do not invent or assume domain terminology, product names, specifications, or user preferences.
- Reply in the user's language.
- The response must contain at least one actual question and must end in a question.`;
  }

  function augment(messages) {
    return messages.map((message, index) => {
      if (message?.role !== 'system' || index !== 0) return message;
      return { ...message, content: `${message.content}\n\n${guardInstruction()}` };
    });
  }

  function looksLikeInterviewQuestion(text) {
    const value = (text || '').trim();
    if (!value || !QUESTION_RE.test(value)) return false;
    return !ANSWER_RE.test(value);
  }

  async function guardedRequest(messages, temperature) {
    if (!isInterview(messages) || isStructuredStage(messages))
      return originalRequest(messages, temperature);

    const guardedMessages = augment(messages);
    let reply = (
      await originalRequest(guardedMessages, Math.min(Number(temperature) || 0.7, 0.5))
    ).trim();
    if (looksLikeInterviewQuestion(reply)) return reply;

    const retryMessages = [
      ...guardedMessages,
      {
        role: 'user',
        content: `Your last response violated the interview output contract. Discard it completely. Return ONLY 1 or 2 concise questions that identify missing requirements. Do not answer, recommend, explain, summarize, or give examples. Use plain language and explain any necessary technical term briefly. End with a question mark.`,
      },
    ];
    reply = (await originalRequest(retryMessages, 0.2)).trim();
    if (looksLikeInterviewQuestion(reply)) return reply;

    throw new Error('Grill Me could not produce a valid interview question. Please try again.');
  }

  window.ganfpuLLM.request = guardedRequest;
})();
