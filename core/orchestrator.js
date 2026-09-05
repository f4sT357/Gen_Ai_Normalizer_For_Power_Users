(() => {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
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
      current.asked.push({ id, question: text(action.question), target: action.target ? { ...action.target } : null });
    }
    return current;
  }

  function completionAction(model) {
    const taskType = text(model?.intent?.task_type) || 'unknown';
    return { type: 'complete', id: 'complete', result_type: taskType === 'transformation' ? 'prompt_specification' : taskType };
  }

  function knowledgeIsSufficient(model) {
    return (Array.isArray(model?.knowledge) ? model.knowledge : []).some(
      (item) => Array.isArray(item?.findings) && item.findings.length > 0
    );
  }

  function authoritativeUserMessages(messages) {
    return Array.isArray(messages)
      ? messages.filter((message) => message?.role === 'user' && !message?.synthetic && text(message.content))
      : [];
  }

  function latestUserMessage(messages) {
    const users = authoritativeUserMessages(messages);
    return users.length ? users[users.length - 1] : null;
  }

  function hasInitialRequirementCue(message) {
    const value = text(message?.content);
    if (!value) return false;
    return /(?:予算|価格|金額|費用|期限|締切|納期|までに|以内|文字数|字以内|短く|長く|簡潔|詳細|箇条書き|表形式|JSON|Markdown|メール形式|敬語|カジュアル|丁寧|英語|日本語|中国語|韓国語|対象|読者|用途|目的|背景|前提|条件|制約|禁止|避け|含め|除外|出力|フォーマット|形式|トーン|語調|推論|理由|根拠|正確|事実|幻覚|ソース|引用|Python|JavaScript|TypeScript|コード|API|React|Next\.js|for|to|under|budget|deadline|format|tone|audience|context|constraint|length|language|reasoning|source|citation)/i.test(value);
  }

  function seedInitialTask(model, messages) {
    const api = window.ganfpuRequirementModel;
    const intent = model?.intent;
    const users = authoritativeUserMessages(messages);
    const latest = users.length === 1 ? users[0] : null;
    if (!api || !latest || text(intent?.task_type) === 'unknown') return { model, seeded: false };
    if (Array.isArray(model?.requirements) && model.requirements.length) return { model, seeded: false };

    const quote = text(latest.content);
    const result = api.addRequirement(model, {
      field_id: 'f-task',
      dimension: 'task',
      dimension_anchor: quote,
      value: quote,
      status: 'confirmed',
      source: { type: 'user', message_id: text(latest.id), quote }
    });
    return { model: result.added ? result.model : model, seeded: result.added };
  }

  function localCompletion(model) {
    const taskType = text(model?.intent?.task_type);
    if (!taskType || taskType === 'unknown') return false;
    const requirements = Array.isArray(model?.requirements) ? model.requirements : [];
    if (!requirements.some((item) => text(item?.field_id) === 'f-task' && text(item?.status) === 'confirmed')) return false;
    if (requirements.some((item) => text(item?.status) === 'candidate')) return false;
    return taskType === 'transformation' && requirements.length === 1;
  }

  async function extractRequirements({ messages, model, currentAction, extractor }) {
    if (!extractor) return model;
    if (currentAction?.type === 'ask_user' && extractor.extractDelta) {
      const latest = latestUserMessage(messages);
      if (latest) {
        const delta = await extractor.extractDelta({ userMessage: latest, currentAction, model });
        return mergeRequirements(model, delta);
      }
    }
    if (extractor.extract) return mergeRequirements(model, await extractor.extract(messages, model));
    return model;
  }

  async function resolveIntent(messages, currentModel, intentApi) {
    if (currentModel.intent) return currentModel.intent;
    if (!intentApi) return null;

    if (typeof intentApi.heuristicIntent === 'function') {
      const heuristic = intentApi.heuristicIntent(messages);
      if (text(heuristic?.task_type) !== 'unknown') return heuristic;
    }

    if (typeof intentApi.analyze === 'function') return intentApi.analyze(messages);
    return null;
  }

  async function step({ messages = [], model = {}, discovery = {}, currentAction = null } = {}) {
    const hasUserMessage = Array.isArray(messages) && messages.some(
      (message) => message?.role === 'user' && !message?.synthetic && text(message.content)
    );
    if (!hasUserMessage) return { action: null, model: normalizeModel(model, model?.intent || null), discovery: normalizeDiscovery(discovery) };

    const intentApi = window.ganfpuIntentAnalyzer;
    const extractor = window.ganfpuRequirementExtractor;
    const discoveryApi = window.ganfpuRequirementDiscovery;
    const knowledgeApi = window.ganfpuKnowledgeDiscovery;
    let currentModel = normalizeModel(model, model?.intent || null);
    let currentDiscovery = normalizeDiscovery(discovery);

    if (!currentModel.intent) {
      currentModel.intent = await resolveIntent(messages, currentModel, intentApi);
    }

    const initialTurn = authoritativeUserMessages(messages).length === 1 && !currentAction && !currentModel.requirements.length;
    const seedResult = initialTurn ? seedInitialTask(currentModel, messages) : { model: currentModel, seeded: false };
    currentModel = seedResult.model;

    if (!seedResult.seeded || hasInitialRequirementCue(latestUserMessage(messages))) {
      currentModel = await extractRequirements({ messages, model: currentModel, currentAction, extractor });
    }

    const taskType = text(currentModel?.intent?.task_type);

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
      const action = { type: 'ask_user', id: nextActionId(currentDiscovery), question: 'この依頼で最終的に何を実現したいですか?', target: { field_id: 'f-task', dimension: 'goal' } };
      return { action, model: currentModel, discovery: recordAsked(currentDiscovery, action) };
    }

    if (taskType === 'knowledge' && knowledgeIsSufficient(currentModel)) {
      currentDiscovery.completed = true;
      return { action: completionAction(currentModel), model: currentModel, discovery: currentDiscovery };
    }

    if (localCompletion(currentModel)) {
      currentDiscovery.completed = true;
      return { action: completionAction(currentModel), model: currentModel, discovery: currentDiscovery };
    }

    if (discoveryApi?.nextAction) {
      const action = await discoveryApi.nextAction({ messages, model: currentModel, discovery: currentDiscovery, currentAction });
      if (action?.type === 'ask_user') return { action, model: currentModel, discovery: recordAsked(currentDiscovery, action) };
      if (action?.type === 'complete') {
        currentDiscovery.completed = true;
        return { action: completionAction(currentModel), model: currentModel, discovery: currentDiscovery };
      }

      return {
        action: null,
        status: 'blocked',
        error: 'requirement_discovery_unavailable',
        model: currentModel,
        discovery: currentDiscovery
      };
    }

    return {
      action: null,
      status: 'blocked',
      error: 'requirement_discovery_unavailable',
      model: currentModel,
      discovery: currentDiscovery
    };
  }

  window.ganfpuCore = Object.freeze({ step, normalizeDiscovery, normalizeModel, knowledgeIsSufficient });
})();
