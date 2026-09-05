(() => {
  'use strict';
  const modelApi = () => window.ganfpuRequirementModel;
  const llm = () => window.ganfpuLLMAdapter || window.ganfpuLLM;
  function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function authoritativeUserMessages(messages) {
    return (Array.isArray(messages) ? messages : []).filter((message) => message?.role === 'user' && !message?.synthetic).map((message, index) => ({ ...message, id: text(message.id) || `msg_${String(index + 1).padStart(2, '0')}`, content: text(message.content) })).filter((message) => message.content);
  }
  function previousQuestions(messages) {
    return (Array.isArray(messages) ? messages : []).filter((message) => message?.role === 'assistant' && !message?.synthetic && text(message.content)).map((message) => text(message.content)).filter(Boolean);
  }
  function buildPrompt(messages, existingRequirements) {
    return ['Extract only requirements explicitly stated by the user from the USER MESSAGES below.','Assistant messages are not authoritative evidence, but previous assistant questions may be used only to understand which requirement a user answer is responding to.','Assistant messages, system messages, model output, examples, and external knowledge must never become requirement values or sources.','Do not infer preferences, facts, technical specifications, recommendations, or unstated intent.','A requirement may be candidate only when it is a hypothesis; confirmed, unknown, and not_required MUST be directly supported by a user message.','When a user explicitly says they do not know, cannot decide, or does not understand an item asked by the previous assistant question, you may represent that target requirement as unknown. The source must still be the user\'s exact quote. Do not invent a value.','For confirmed/unknown/not_required requirements, source.type MUST be "user" and source.quote MUST be copied from the user message.','Use only these field IDs: f-role, f-task, f-context, f-constraint, f-format, f-tone, f-length, f-reasoning, f-lang, f-hallucination.','Return an array. Return [] when there are no new user-grounded requirements.','Do not repeat an existing requirement identity.',`Existing requirements:\n${JSON.stringify(existingRequirements || [])}`,`PREVIOUS ASSISTANT QUESTIONS (context only):\n${JSON.stringify(previousQuestions(messages))}`,`USER MESSAGES:\n${JSON.stringify(authoritativeUserMessages(messages))}`,'JSON schema for each item:','{"field_id":"f-task","dimension":"task","dimension_anchor":"exact user phrase","value":"user-stated value","status":"confirmed","source":{"type":"user","message_id":"msg_01","quote":"exact user quote"}}','For unknown or not_required, value must be empty.','Output ONLY valid JSON.'].join('\n');
  }
  function buildDeltaPrompt(userMessage, currentAction, existingRequirements) {
    return ['Extract only the requirement expressed by the latest USER MESSAGE in response to the CURRENT ACTION.','The CURRENT ACTION identifies what requirement the assistant asked the user to clarify. Use it only to resolve what the answer refers to; never treat the action itself as a user requirement.','The latest USER MESSAGE is the only authoritative evidence for a new requirement.','Do not infer preferences, facts, technical specifications, recommendations, or unstated intent.','If the user explicitly says they do not know, cannot decide, or does not understand the asked criterion, return status "unknown" with an empty value.','If the user explicitly says the asked criterion is unnecessary, return status "not_required" with an empty value.','For confirmed/unknown/not_required, source.type MUST be "user" and source.quote MUST be copied from the latest user message.','Use only these field IDs: f-role, f-task, f-context, f-constraint, f-format, f-tone, f-length, f-reasoning, f-lang, f-hallucination.','Return [] when the latest message does not establish a requirement.','Do not repeat an existing requirement identity.','Return at most one requirement.','CURRENT ACTION:',JSON.stringify(currentAction || null),`EXISTING REQUIREMENTS:\n${JSON.stringify(existingRequirements || [])}`,`LATEST USER MESSAGE:\n${JSON.stringify(userMessage || null)}`,'JSON schema:','{"field_id":"f-context","dimension":"usage","dimension_anchor":"exact user phrase","value":"user-stated value","status":"confirmed","source":{"type":"user","message_id":"msg_02","quote":"exact user quote"}}','For unknown or not_required, value must be empty.','Output ONLY valid JSON.'].join('\n');
  }
  function parseJson(raw) {
    const value = text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try { return JSON.parse(value); } catch (_) {
      const start = value.indexOf('['), end = value.lastIndexOf(']');
      if (start >= 0 && end > start) { try { return JSON.parse(value.slice(start, end + 1)); } catch (_) { return null; } }
      return null;
    }
  }
  function validateSourceAgainstUsers(requirement, users) { const source = requirement?.source; if (!source || source.type !== 'user' || !text(source.quote)) return false; const quote = text(source.quote); const message = users.find((item) => text(item.id) === text(source.message_id)); if (!message || !message.content.includes(quote)) return false; const anchor = text(requirement.dimension_anchor || quote); if (!anchor || !quote.includes(anchor)) return false; if (requirement.status === 'confirmed' && !text(requirement.value)) return false; if ((requirement.status === 'unknown' || requirement.status === 'not_required') && text(requirement.value)) return false; return true; }
  function validateCandidate(requirement, users) { const api = modelApi(); if (!api) return { valid: false, reason: 'requirement_model_unavailable' }; const normalized = { ...requirement, field_id: text(requirement?.field_id), dimension: text(requirement?.dimension), dimension_anchor: text(requirement?.dimension_anchor), value: text(requirement?.value), status: text(requirement?.status) }; const validation = api.validateRequirement(normalized); if (!validation.valid) return validation; if (normalized.status !== 'candidate' && !validateSourceAgainstUsers(normalized, users)) return { valid: false, reason: 'source_not_user_grounded' }; return { valid: true }; }
  async function extract(messages, model = {}) {
    const api = modelApi(); if (!api) throw new Error('Requirement Model is unavailable.');
    const users = authoritativeUserMessages(messages); if (!users.length) return [];
    const existing = Array.isArray(model?.requirements) ? model.requirements : [];
    const adapter = llm(); if (!adapter?.request) return [];
    let raw;
    try { raw = await adapter.request([{ role: 'system', content: 'You are a requirement extraction component. User-authored messages are authoritative evidence. Extract, do not invent.' }, { role: 'user', content: buildPrompt(messages, existing) }], 0.1); } catch (_) { return []; }
    const parsed = parseJson(raw); if (parsed == null) return [];
    const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.requirements) ? parsed.requirements : [];
    const accepted = [];
    for (const candidate of candidates) { const validation = validateCandidate(candidate, users); if (!validation.valid) continue; const normalized = { ...candidate, source: candidate.status === 'candidate' ? (candidate.source && typeof candidate.source === 'object' ? { ...candidate.source } : null) : { type: 'user', message_id: text(candidate.source?.message_id), quote: text(candidate.source?.quote) } }; if (api.findRequirementByIdentity(model, normalized)) continue; if (accepted.some((item) => api.requirementIdentity(item) === api.requirementIdentity(normalized))) continue; accepted.push(normalized); }
    return accepted;
  }
  async function extractDelta({ userMessage, currentAction = null, model = {} } = {}) {
    const api = modelApi(); if (!api) throw new Error('Requirement Model is unavailable.');
    const message = typeof userMessage === 'string' ? { id: 'latest', content: text(userMessage) } : { id: text(userMessage?.id) || 'latest', content: text(userMessage?.content) };
    if (!message.content || !currentAction?.target) return [];
    const adapter = llm(); if (!adapter?.request) return [];
    const existing = Array.isArray(model?.requirements) ? model.requirements : [];
    let raw;
    try { raw = await adapter.request([{ role: 'system', content: 'You are a requirement extraction component. Extract only a user-grounded answer to the current action.' }, { role: 'user', content: buildDeltaPrompt(message, currentAction, existing) }], 0.1); } catch (_) { return []; }
    const parsed = parseJson(raw); if (parsed == null) return [];
    const candidates = Array.isArray(parsed) ? parsed : (parsed?.requirements && Array.isArray(parsed.requirements) ? parsed.requirements : (parsed && typeof parsed === 'object' && parsed.field_id ? [parsed] : []));
    const accepted = [];
    for (const candidate of candidates.slice(0, 1)) {
      const normalized = { ...candidate, source: candidate.status === 'candidate' ? (candidate.source && typeof candidate.source === 'object' ? { ...candidate.source } : null) : { type: 'user', message_id: message.id, quote: text(candidate.source?.quote) || message.content } };
      const valid = validateCandidate(normalized, [message]);
      if (!valid.valid) continue;
      if (api.findRequirementByIdentity(model, normalized)) continue;
      accepted.push(normalized);
    }
    return accepted;
  }
  window.ganfpuRequirementExtractor = Object.freeze({ authoritativeUserMessages, extract, extractDelta });
})();
