(() => {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function clone(value) {
    return value && typeof value === 'object'
      ? JSON.parse(JSON.stringify(value))
      : value;
  }

  function nextActionId(discovery) {
    const count = Array.isArray(discovery?.asked) ? discovery.asked.length : 0;
    return `action_${String(count + 1).padStart(2, '0')}`;
  }

  function normalizeDiscovery(discovery = {}) {
    return {
      asked: Array.isArray(discovery.asked) ? discovery.asked.map((item) => ({ ...item })) : [],
      completed: Boolean(discovery.completed),
    };
  }

  function normalizeModel(model, intent) {
    const api = window.ganfpuRequirementModel;
    const base = api?.createModel ? api.createModel(intent) : {
      version: 1, intent: intent || null, requirements: [], knowledge: [], pending: []
    };
    return {
      ...base,
      ...clone(model),
      intent: intent || model?.intent || null,
      requirements: Array.isArray(model?.requirements) ? model.requirements.map((item) => ({
        ...item,
        source: item?.source ? { ...item.source } : null,
      })) : [],
      knowledge: Array.isArray(model?.knowledge) ? model.knowledge.map((item) => ({ ...item })) : [],
      pending: Array.isArray(model?.pending) ? model.pending.map((item) => ({ ...item })) : [],
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

  function hasPendingCandidate(model) {
    return (Array.isArray(model?.requirements) ? model.requirements : [])
      .some((item) => text(item?.status) === 'candidate');
  }

  function isTerminalIntent(taskType) {
    return taskType === 'knowledge' || taskType === 'research';
  }

  function completionAction(model) {
    const taskType = text(model?.intent?.task_type) || 'unknown';
    return {
      type: 'complete',
      id: 'complete',
      result_type: taskType === 'unknown' ? 'unknown' : taskType
    };
  }

  async function step({ messages = [], model = {}, discovery = {} } = {}) {
    const intentApi = window.ganfpuIntentAnalyzer;
    const extractor = window.ganfpuRequirementExtractor;
    const discoveryApi = window.ganfpuRequirementDiscovery;

    if (!Array.isArray(messages) || !messages.some((message) => message?.role === 'user' && !message?.synthetic)) {
      return {
        action: null,
        model: normalizeModel(model, model?.intent || null),
        discovery: normalizeDiscovery(discovery)
      };
    }

    let currentModel = normalizeModel(model, model?.intent || null);
    let currentDiscovery = normalizeDiscovery(discovery);

    if (!currentModel.intent && intentApi?.analyze) {
      currentModel.intent = await intentApi.analyze(messages);
    }

    if (extractor?.extract) {
      const extracted = await extractor.extract(messages, currentModel);
      currentModel = mergeRequirements(currentModel, extracted);
    }

    const taskType = text(currentModel?.intent?.task_type);

    // Knowledge/research requests are not forced through Prompt Specification fields.
    // Knowledge discovery is intentionally a separate stage and can be attached later.
    if (isTerminalIntent(taskType)) {
      currentDiscovery.completed = true;
      return {
        action: completionAction(currentModel),
        model: currentModel,
        discovery: currentDiscovery
      };
    }

    if (taskType === 'unknown') {
      if (discoveryApi?.nextAction) {
        const action = await discoveryApi.nextAction({
          messages,
          model: currentModel,
          discovery: currentDiscovery
        });
        if (action) {
          if (action.type === 'ask_user') {
            currentDiscovery.asked.push({
              id: text(action.id) || nextActionId(currentDiscovery),
              question: text(action.question),
              target: action.target ? { ...action.target } : null
            });
          }
          return { action, model: currentModel, discovery: currentDiscovery };
        }
      }
      return {
        action: {
          type: 'ask_user',
          id: nextActionId(currentDiscovery),
          question: 'この依頼で最終的に何を実現したいですか？',
          target: { field_id: 'f-task', dimension: 'goal' }
        },
        model: currentModel,
        discovery: currentDiscovery
      };
    }

    if (discoveryApi?.nextAction) {
      const action = await discoveryApi.nextAction({
        messages,
        model: currentModel,
        discovery: currentDiscovery
      });

      if (action?.type === 'ask_user') {
        currentDiscovery.asked.push({
          id: text(action.id) || nextActionId(currentDiscovery),
          question: text(action.question),
          target: action.target ? { ...action.target } : null
        });
        return { action, model: currentModel, discovery: currentDiscovery };
      }

      if (action?.type === 'complete') {
        currentDiscovery.completed = true;
        return { action, model: currentModel, discovery: currentDiscovery };
      }
    }

    if (hasPendingCandidate(currentModel)) {
      return {
        action: {
          type: 'complete',
          id: 'complete',
          result_type: 'prompt_specification'
        },
        model: currentModel,
        discovery: { ...currentDiscovery, completed: true }
      };
    }

    return {
      action: completionAction(currentModel),
      model: currentModel,
      discovery: { ...currentDiscovery, completed: true }
    };
  }

  window.ganfpuCore = Object.freeze({
    step,
    normalizeDiscovery,
    normalizeModel,
  });
})();
