(() => {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function buildPrompt(userMessage, currentAction) {
    const action = currentAction || {};
    const target = action.target || {};

    return `You are a requirement delta extractor for GANFPU.
Extract only requirements expressed or changed by the latest user response.
Do not reconstruct the entire requirement model.
Do not infer unstated preferences.
The current question/action is authoritative context for interpreting the answer.
If the answer is ambiguous, preserve the ambiguity rather than inventing a value.
Return JSON only as an array of requirement objects.

Current action:
${JSON.stringify({ id: action.id || null, type: action.type || null, question: action.question || '', target })}

Latest user response:
${text(userMessage)}

Each item should use this shape:
{
  "field_id": "f-*",
  "dimension": "...",
  "dimension_anchor": "...",
  "value": "...",
  "status": "confirmed|unknown|not_required|candidate",
  "source": {"type":"user_answer","text":"..."}
}

Return [] when the response does not establish or change a requirement.`;
  }

  function parseJson(raw) {
    if (Array.isArray(raw)) return raw;
    const content = typeof raw === 'string' ? raw : raw?.content;
    if (typeof content !== 'string') return [];

    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  async function extractDelta({ userMessage, currentAction, model } = {}) {
    if (!text(userMessage) || currentAction?.type !== 'ask_user') return [];
    const llm = window.ganfpuLLM;
    if (!llm?.request) return [];

    const response = await llm.request({
      messages: [
        { role: 'system', content: buildPrompt(userMessage, currentAction) },
        { role: 'user', content: text(userMessage) }
      ],
      model
    });

    return parseJson(response);
  }

  window.ganfpuRequirementDeltaExtractor = Object.freeze({
    buildPrompt,
    extractDelta,
  });
})();
