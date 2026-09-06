(() => {
  'use strict';

  const modelApi = () => window.ganfpuRequirementModel;
  const llm = () => window.ganfpuLLMAdapter || window.ganfpuLLM;

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function fingerprint(question) {
    return text(question).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function isDuplicateQuestion(question, discovery) {
    const key = fingerprint(question);
    if (!key) return true;
    return (Array.isArray(discovery?.asked) ? discovery.asked : [])
      .some((item) => fingerprint(item?.question) === key);
  }

  function targetStatus(target, requirements) {
    const fieldId = text(target?.field_id);
    const dimension = text(target?.dimension);
    if (!fieldId || !dimension) return '';
    const found = (Array.isArray(requirements) ? requirements : []).filter((requirement) =>
      text(requirement?.field_id) === fieldId && text(requirement?.dimension) === dimension
    );
    if (found.some((item) => text(item.status) === 'confirmed')) return 'confirmed';
    if (found.some((item) => text(item.status) === 'unknown')) return 'unknown';
    if (found.some((item) => text(item.status) === 'not_required')) return 'not_required';
    return '';
  }

  function validateAction(action, model, discovery) {
    if (text(action?.type) !== 'ask_user') return { valid: false, reason: 'unsupported_action' };
    const question = text(action.question);
    const fieldId = text(action?.target?.field_id);
    const dimension = text(action?.target?.dimension);
    if (!question || !fieldId || !dimension) return { valid: false, reason: 'incomplete_action' };
    if (isDuplicateQuestion(question, discovery)) return { valid: false, reason: 'question_already_asked' };
    const api = modelApi();
    if (!api || !api.FIELD_IDS?.includes(fieldId)) return { valid: false, reason: 'invalid_field_id' };
    const status = targetStatus({ field_id: fieldId, dimension }, model?.requirements);
    if (status) return { valid: false, reason: `target_already_${status}` };
    return { valid: true };
  }

  function nextActionId(discovery) {
    const count = Array.isArray(discovery?.asked) ? discovery.asked.length : 0;
    return `action_${String(count + 1).padStart(2, '0')}`;
  }

  function fallbackAction(model, discovery) {
    const taskType = text(model?.intent?.task_type);
    const candidates = taskType === 'research'
      ? [
          { field_id: 'f-constraint', dimension: 'priority', question: '調査で特に重視したい条件や比較基準はありますか？' },
          { field_id: 'f-context', dimension: 'purpose', question: 'この調査結果を主に何に使う予定ですか？' },
        ]
      : taskType === 'recommendation'
        ? [
            { field_id: 'f-context', dimension: 'usage', question: '主な用途や使う場面を教えてください。' },
            { field_id: 'f-constraint', dimension: 'priority', question: '選ぶときに特に重視したい条件はありますか？' },
          ]
        : [
            { field_id: 'f-context', dimension: 'purpose', question: 'この依頼の用途や目的を教えてください。' },
            { field_id: 'f-constraint', dimension: 'priority', question: '特に重視したい条件はありますか？' },
          ];

    for (const candidate of candidates) {
      const validation = validateAction({ type: 'ask_user', ...candidate }, model, discovery);
      if (validation.valid) {
        return {
          type: 'ask_user',
          id: nextActionId(discovery),
          question: candidate.question,
          target: { field_id: candidate.field_id, dimension: candidate.dimension },
        };
      }
    }
    return null;
  }

  function parseAction(raw) {
    const cleaned = text(raw)
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch (_) {}

    // Some providers may prepend safety/status text. Recover a JSON object if one exists.
    const start = cleaned.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.slice(start, i + 1));
          } catch (_) {
            return null;
          }
        }
      }
    }
    return null;
  }

  function buildPrompt(model, discovery, currentAction, messages, latestUserMessage) {
    const latest = text(latestUserMessage?.content);
    const conversation = (Array.isArray(messages) ? messages : [])
      .filter((message) => message?.role === 'user' || message?.role === 'assistant')
      .map((message) => ({ role: message.role, content: text(message.content) }))
      .filter((message) => message.content);

    return [
      'Choose the single highest-value next user question for requirement discovery.',
      'This component generates an action, not facts, recommendations, or solutions.',
      'The Requirement Model contains all user-grounded requirements discovered so far. Treat it as the source of truth.',
      'The discovery log contains questions already asked. Do not repeat them.',
      'Do not invent user preferences, domain facts, technical specifications, or recommendations.',
      'Ask only for a requirement that materially affects the user goal.',
      'Discover only requirements necessary for the current task. Do not fill all ten fields by default.',
      'Use exactly one fixed field ID: f-role, f-task, f-context, f-constraint, f-format, f-tone, f-length, f-reasoning, f-lang, f-hallucination.',
      'The target dimension must describe the requirement being asked about.',
      'Do not ask about a target whose requirement is already confirmed, unknown, or not_required.',
      'A candidate requirement is not authoritative until explicitly confirmed by the user.',
      'Generate the question in the language used by the conversation as a whole.',
      'Use the latest user message as the strongest signal for the current conversation language, but do not switch languages merely because one answer is temporarily written in another language.',
      'Only change the question language when the user explicitly requests a different language for the questions or conversation.',
      'Do not infer f-lang from the conversation language. f-lang is a separate task requirement and must be user-grounded.',
      'The conversation history is provided to judge language continuity and explicit language requests; it is not permission to infer unstated requirements.',
      'If no materially useful requirement remains, return {"type":"complete"}.',
      '{"type":"ask_user","id":"action_01","question":"...","target":{"field_id":"f-context","dimension":"usage"}}',
      `INTENT:\n${JSON.stringify(model?.intent || null)}`,
      `REQUIREMENTS:\n${JSON.stringify(model?.requirements || [])}`,
      `KNOWLEDGE:\n${JSON.stringify(model?.knowledge || [])}`,
      `DISCOVERY:\n${JSON.stringify(discovery || {})}`,
      `CURRENT ACTION:\n${JSON.stringify(currentAction || null)}`,
      `CONVERSATION HISTORY:\n${JSON.stringify(conversation)}`,
      `LATEST USER MESSAGE:\n${JSON.stringify(latest)}`
    ].join('\n');
  }

  async function nextAction({ model = {}, discovery = {}, currentAction = null, messages = [], latestUserMessage = null } = {}) {
    const adapter = llm();
    if (!adapter?.request) return null;

    try {
      const raw = await adapter.request([
        {
          role: 'system',
          content: 'You are a requirement discovery component. Generate only the next user-facing action.'
        },
        {
          role: 'user',
          content: buildPrompt(model, discovery, currentAction, messages, latestUserMessage)
        }
      ], 0.1);

      const action = parseAction(raw);

      if (action?.type === 'complete') return action;

      const validation = validateAction(action, model, discovery);
      if (validation.valid) {
        return {
          type: 'ask_user',
          id: text(action.id) || nextActionId(discovery),
          question: text(action.question),
          target: {
            field_id: text(action.target.field_id),
            dimension: text(action.target.dimension)
          }
        };
      }

      // A malformed provider response should not make the interview unusable.
      // Fall back to a conservative, generic question without inventing a requirement value.
      return fallbackAction(model, discovery);
    } catch (_) {
      return fallbackAction(model, discovery);
    }
  }

  window.ganfpuRequirementDiscovery = Object.freeze({
    nextAction,
    validateAction,
    targetStatus,
    isDuplicateQuestion
  });
})();
