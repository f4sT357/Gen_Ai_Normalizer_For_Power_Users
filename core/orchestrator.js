(() => {
  'use strict';

  function text(value) {
    return String(value == null ? '').replace(/\s+/g, ' ').trim();
  }

  function clone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  }

  function nextActionId(discovery) {
    const count = Array.isArray(discovery?.asked) ? discovery.asked.length : 0;
    return `action_${String(count + 1).padStart(2, '0')}`;
  }

  function normalizeDiscovery(discovery = {}) {
    return {
      asked: Array.isArray(discovery.asked) ? discovery.asked.map((item) => ({ ...item })) : [],
      completed: Boolean(discovery.completed)
    };
  }

  function normalizeModel(model, intent) {
    const api = window.ganfpuRequirementModel;
    const base = api?.createModel
      ? api.createModel(intent)
      : { version: 1, intent: intent || null, requirements: [], knowledge: [], pending: [] };
    return {
      ...base,
      ...clone(model),
      intent: intent || model?.intent || null,
      requirements: Array.isArray(model?.requirements)
        ? model.requirements.map((item) => ({ ...item, source: item?.source ? { ...item.source } : null }))
        : [],
      knowledge: Array.isArray(model?.knowledge) ? model.knowledge.map((item) => ({ ...item })) : [],
      pending: Array.isArray(model?.pending) ? model.pending.map((item) => ({ ...item })) : []
    };
  }

  function mergeRequirements(model, extracted) {
    const api = window.ganfpuRequirementModel;
    if (!api || !Array.isArray(extracted) || !extracted.length) return model;
    let current = model;
    for (const requirement of extracted) {
      const result = api.addRequirement(current, requirement, { allowCandidate: true });
      if (result.added) current = result.model;
    }
    return current;
  }

  function recordAsked(discovery, action) {
    if (!action || action.type !== 'ask_user') return discovery;
    const current = normalizeDiscovery(discovery);
    const id = text(action.id) || nextActionId(current);
    if (!current.asked.some((item) => text(item.id) === id)) {
      current.asked.push({
        id,
        question: text(action.question),
        target: action.target ? { ...action.target } : null
      });
    }
    return current;
  }

  function completionAction(model) {
    const taskType = text(model?.intent?.task_type) || 'unknown';
    return {
      type: 'complete',
      id: 'complete',
      result_type: taskType === 'transformation' ? 'prompt_specification' : taskType
    };
  }

  function hasConfirmedRequirement(model, fieldId, dimension) {
    return (Array.isArray(model?.requirements) ? model.requirements : []).some((requirement) =>
      text(requirement?.status) === 'confirmed' &&
      text(requirement?.field_id) === fieldId &&
      text(requirement?.dimension) === dimension
    );
  }

  function hasResolvedRequirement(model, fieldId, dimension) {
    return (Array.isArray(model?.requirements) ? model.requirements : []).some((requirement) =>
      ['confirmed', 'unknown', 'not_required'].includes(text(requirement?.status)) &&
      text(requirement?.field_id) === fieldId &&
      text(requirement?.dimension) === dimension
    );
  }

  function knowledgeTopic(model) {
    const intent = model?.intent;
    return text(intent?.topic) || text(intent?.subject) || text(intent?.raw) || '';
  }

  function knowledgeIsSufficient(model) {
    const items = Array.isArray(model?.knowledge) ? model.knowledge : [];
    return items.some((item) =>
      Array.isArray(item?.findings) && item.findings.length > 0
    );
  }

  async function step({ messages = [], model = {}, discovery = {} } = {}) {
    const hasUserMessage = Array.isArray(messages) && messages.some(
      (message) => message?.role === 'user' && !message?.synthetic && text(message.content)
    );

    if (!hasUserMessage) {
      return {
        action: null,
        model: normalizeModel(model, model?.intent || null),
        discovery: normalizeDiscovery(discovery)
      };
    }

    const intentApi = window.ganfpuIntentAnalyzer;
    const extractor = window.ganfpuRequirementExtractor;
    const discoveryApi = window.ganfpuRequirementDiscovery;
    const knowledgeApi = window.ganfpuKnowledgeDiscovery;

    let currentModel = normalizeModel(model, model?.intent || null);
    let currentDiscovery = normalizeDiscovery(discovery);

    if (!currentModel.intent && intentApi?.analyze) {
      currentModel.intent = await intentApi.analyze(messages);
    }

    if (extractor?.extract) {
      currentModel = mergeRequirements(
        currentModel,
        await extractor.extract(messages, currentModel)
      );
    }

    const taskType = text(currentModel?.intent?.task_type);

    // Knowledge is reusable evidence, not a completion signal by itself.
    // Discover it once, then let Requirement Discovery determine whether
    // user-facing requirements are still needed.
    if (
      (taskType === 'knowledge' || taskType === 'research' || taskType === 'recommendation') &&
      knowledgeApi?.discover &&
      !knowledgeIsSufficient(currentModel)
    ) {
      const discovered = await knowledgeApi.discover(messages, currentModel.intent);
      if (discovered) {
        currentModel.knowledge = [
          ...(Array.isArray(currentModel.knowledge) ? currentModel.knowledge : []),
          discovered
        ];
      }
    }

    if (taskType === 'unknown') {
      const action = {
        type: 'ask_user',
        id: nextActionId(currentDiscovery),
        question: 'この依頼で最終的に何を実現したいですか?',
        target: { field_id: 'f-task', dimension: 'goal' }
      };
      return {
        action,
        model: currentModel,
        discovery: recordAsked(currentDiscovery, action)
      };
    }

    if (discoveryApi?.nextAction) {
      const action = await discoveryApi.nextAction({
        messages,
        model: currentModel,
        discovery: currentDiscovery
      });

      if (action?.type === 'ask_user') {
        return {
          action,
          model: currentModel,
          discovery: recordAsked(currentDiscovery, action)
        };
      }

      if (action?.type === 'complete') {
        // Requirement Discovery may only complete after it has resolved the
        // requirements it considers necessary. Knowledge existence alone is
        // never sufficient for completion.
        currentDiscovery.completed = true;
        return {
          action: completionAction(currentModel),
          model: currentModel,
          discovery: currentDiscovery
        };
      }
    }

    // A knowledge request needs evidence before it can complete. This is an
    // internal readiness check, not a substitute for user requirements.
    if (taskType === 'knowledge') {
      if (knowledgeIsSufficient(currentModel)) {
        currentDiscovery.completed = true;
        return {
          action: completionAction(currentModel),
          model: currentModel,
          discovery: currentDiscovery
        };
      }
      return {
        action: {
          type: 'ask_user',
          id: nextActionId(currentDiscovery),
          question: '知りたい内容について、もう少し具体的に教えてください。',
          target: { field_id: 'f-task', dimension: 'scope' }
        },
        model: currentModel,
        discovery: recordAsked(currentDiscovery, {
          type: 'ask_user',
          id: nextActionId(currentDiscovery),
          question: '知りたい内容について、もう少し具体的に教えてください。',
          target: { field_id: 'f-task', dimension: 'scope' }
        })
      };
    }

    currentDiscovery.completed = true;
    return {
      action: completionAction(currentModel),
      model: currentModel,
      discovery: currentDiscovery
    };
  }

  window.ganfpuCore = Object.freeze({
    step,
    normalizeDiscovery,
    normalizeModel,
    hasConfirmedRequirement,
    hasResolvedRequirement,
    knowledgeIsSufficient,
    knowledgeTopic
  });
})();
