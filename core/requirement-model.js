(() => {
  'use strict';

  const FIELD_IDS = Object.freeze([
    'f-role', 'f-task', 'f-context', 'f-constraint', 'f-format',
    'f-tone', 'f-length', 'f-reasoning', 'f-lang', 'f-hallucination',
  ]);
  const FIELD_ID_SET = new Set(FIELD_IDS);
  const STATUSES = Object.freeze(['candidate', 'confirmed', 'unknown', 'not_required']);
  const STATUS_SET = new Set(STATUSES);

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function normalizeFieldId(value) {
    const id = text(value);
    return FIELD_ID_SET.has(id) ? id : '';
  }

  function normalizeStatus(value) {
    const status = text(value).toLowerCase();
    return STATUS_SET.has(status) ? status : '';
  }

  function normalizeSource(source) {
    if (!source || typeof source !== 'object') return null;
    const type = text(source.type);
    if (!type) return null;
    return { type, message_id: text(source.message_id), quote: text(source.quote) };
  }

  function createModel(intent = null) {
    return {
      version: 1,
      intent: intent && typeof intent === 'object' ? { ...intent } : null,
      requirements: [],
      knowledge: [],
      pending: [],
    };
  }

  function requirementIdentity(requirement) {
    if (!requirement || typeof requirement !== 'object') return '';
    const fieldId = normalizeFieldId(requirement.field_id);
    const dimension = text(requirement.dimension);
    const source = normalizeSource(requirement.source);
    const anchor = text(requirement.dimension_anchor || source?.quote || requirement.anchor);
    // Dimension is part of identity: two independent requirements can share
    // the same user phrase while representing different semantic dimensions.
    return fieldId && dimension && anchor ? `${fieldId}::${dimension}::${anchor}` : '';
  }

  function nextRequirementId(model) {
    const used = new Set(
      Array.isArray(model?.requirements)
        ? model.requirements.map((item) => text(item?.id)).filter(Boolean)
        : []
    );
    let index = 1;
    while (used.has(`req_${String(index).padStart(2, '0')}`)) index += 1;
    return `req_${String(index).padStart(2, '0')}`;
  }

  function isUserSource(source) {
    return normalizeSource(source)?.type === 'user';
  }

  function validateRequirement(requirement, { allowCandidate = true } = {}) {
    if (!requirement || typeof requirement !== 'object') return { valid: false, reason: 'not_an_object' };
    const fieldId = normalizeFieldId(requirement.field_id);
    if (!fieldId) return { valid: false, reason: 'invalid_field_id' };
    const status = normalizeStatus(requirement.status);
    if (!status || (!allowCandidate && status === 'candidate')) return { valid: false, reason: 'invalid_status' };
    const dimension = text(requirement.dimension);
    if (!dimension) return { valid: false, reason: 'missing_dimension' };
    if (status === 'candidate') return { valid: true };

    const source = normalizeSource(requirement.source);
    if (!isUserSource(source)) return { valid: false, reason: 'non_user_source' };
    if (!source.quote) return { valid: false, reason: 'missing_source_quote' };

    const value = text(requirement.value);
    if (status === 'confirmed' && !value) return { valid: false, reason: 'missing_confirmed_value' };
    if (status === 'unknown' && value) return { valid: false, reason: 'unknown_has_value' };
    if (status === 'not_required' && value) return { valid: false, reason: 'not_required_has_value' };

    const anchor = text(requirement.dimension_anchor || source.quote);
    if (!anchor) return { valid: false, reason: 'missing_dimension_anchor' };
    if (!source.quote.includes(anchor)) return { valid: false, reason: 'anchor_not_in_source_quote' };
    return { valid: true };
  }

  function normalizeRequirement(requirement, model) {
    const source = normalizeSource(requirement.source);
    return {
      id: text(requirement.id) || nextRequirementId(model),
      field_id: normalizeFieldId(requirement.field_id),
      dimension: text(requirement.dimension),
      dimension_anchor: text(requirement.dimension_anchor || source?.quote),
      value: text(requirement.value),
      status: normalizeStatus(requirement.status) || 'candidate',
      source,
    };
  }

  function findRequirement(model, id) {
    const key = text(id);
    if (!key || !Array.isArray(model?.requirements)) return null;
    return model.requirements.find((item) => text(item?.id) === key) || null;
  }

  function findRequirementByIdentity(model, requirement) {
    const identity = requirementIdentity(requirement);
    if (!identity || !Array.isArray(model?.requirements)) return null;
    return model.requirements.find((item) => requirementIdentity(item) === identity) || null;
  }

  function addRequirement(model, requirement, options = {}) {
    const target = model && typeof model === 'object' ? model : createModel();
    const normalized = normalizeRequirement(requirement, target);
    const validation = validateRequirement(normalized, options);
    if (!validation.valid) return { model: target, requirement: null, added: false, reason: validation.reason };
    const existing = findRequirementByIdentity(target, normalized);
    if (existing) return { model: target, requirement: existing, added: false, reason: 'duplicate_identity' };
    target.requirements = [...(Array.isArray(target.requirements) ? target.requirements : []), normalized];
    return { model: target, requirement: normalized, added: true, reason: '' };
  }

  function updateRequirement(model, id, patch = {}) {
    const target = model && typeof model === 'object' ? model : createModel();
    const current = findRequirement(target, id);
    if (!current) return { model: target, requirement: null, updated: false, reason: 'not_found' };
    const next = normalizeRequirement({ ...current, ...patch, id: current.id }, target);
    const validation = validateRequirement(next);
    if (!validation.valid) return { model: target, requirement: current, updated: false, reason: validation.reason };
    const duplicate = findRequirementByIdentity({ ...target, requirements: target.requirements.filter((item) => text(item?.id) !== text(id)) }, next);
    if (duplicate) return { model: target, requirement: current, updated: false, reason: 'duplicate_identity' };
    target.requirements = target.requirements.map((item) => text(item?.id) === text(id) ? next : item);
    return { model: target, requirement: next, updated: true, reason: '' };
  }

  function cloneModel(model) {
    const target = model && typeof model === 'object' ? model : createModel();
    return {
      version: 1,
      intent: target.intent && typeof target.intent === 'object' ? { ...target.intent } : null,
      requirements: Array.isArray(target.requirements) ? target.requirements.map((item) => ({ ...item, source: item?.source ? { ...item.source } : null })) : [],
      knowledge: Array.isArray(target.knowledge) ? target.knowledge.map((item) => ({ ...item })) : [],
      pending: Array.isArray(target.pending) ? target.pending.map((item) => ({ ...item })) : [],
    };
  }

  window.ganfpuRequirementModel = Object.freeze({
    FIELD_IDS, STATUSES, text, normalizeFieldId, normalizeStatus,
    createModel, requirementIdentity, validateRequirement, findRequirement,
    findRequirementByIdentity, addRequirement, updateRequirement, cloneModel,
  });
})();
