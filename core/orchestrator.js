(() => {
  'use strict';

  const llm = () => window.ganfpuLLMAdapter || window.ganfpuLLM;
  const requirementApi = () => window.ganfpuRequirementModel;

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function authoritativeUserMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
      .filter((message) => message?.role === 'user' && !message?.synthetic)
      .map((message) => ({ ...message, content: text(message.content) }))
      .filter((message) => message.content);
  }

  function latestUserMessage(messages) {
    return authoritativeUserMessages(messages).slice(-1)[0] || null;
  }

  function completionAction(model) {
    return {
      type: 'complete',
      model,
      requirements: Array.isArray(model?.requirements) ? model.requirements : [],
      knowledge: Array.isArray(model?.knowledge) ? model.knowledge : [],
    };
  }

  function knowledgeIsSufficient(model) {
    return Array.isArray(model?.knowledge) && model.knowledge.some((item) => {
      const findings = Array.isArray(item?.findings) ? item.findings : [];
      return findings.length > 0;
    });
  }

  function hasInitialRequirementCue(message) {
    const value = text(message?.content);
    if (!value) return false;
    return /(?:予算|価格|金額|費用|期限|締切|納期|までに|以内|文字数|字以内|短く|長く|簡潔|詳細|箇条書き|表形式|JSON|Markdown|メール形式|敬語|カジュアル|丁寧|英語|日本語|中国語|韓国語|対象|読者|用途|目的|背景|前提|条件|制約|禁止|避け|含め|除外|出力|フォーマット|形式|トーン|語調|推論|理由|根拠|正確|事実|幻覚|ソース|引用|Python|JavaScript|TypeScript|コード|API|React|Next\.js|\bbudget\b|\bdeadline\b|\bformat\b|\btone\b|\baudience\b|\bcontext\b|\bconstraint\b|\blength\b|\blanguage\b|\breasoning\b|\bsource\b|\bcitation\b)/i.test(value);
  }

  function seedInitialTask(model, messages) {
    const first = authoritativeUserMessages(messages)[0];
    if (!first || text(model?.intent?.task_type) === 'unknown') return { model, seeded: false };
    if (!requirementApi()?.addRequirement) return { model, seeded: false };
    const value = text(first.content);
    const next = requirementApi().addRequirement(model, {
      field_id: 'f-task',
      dimension: 'task',
      dimension_anchor: value,
      value,
      status: 'confirmed',
      source: { type: 'user', message_id: first.id || null, quote: value },
    });
    return { model: next, seeded: true };
  }

  function localCompletion(model) {
    const taskType = text(model?.intent?.task_type);
    if (!taskType || taskType === 'unknown') return false;
    const requirements = Array.isArray(model?.requirements) ? model.requirements : [];
    if (!requirements.some((item) => text(item?.field_id) === 'f-task' && text(item?.status) === 'confirmed')) return false;
    if (requirements.some((item) => text(item?.status) === 'candidate')) return false;
    return taskType === 'transformation' && requirements.length === 1;
  }

  async function resolveIntent(messages, currentModel, intentApi) {
    if (currentModel.intent && typeof currentModel.intent === 'object') return currentModel.intent;
    if (!intentApi) return null;

    if (typeof intentApi.heuristicIntent === 'function') {
      const heuristic = intentApi.heuristicIntent(messages);
      if (text(heuristic?.task_type) !== 'unknown') return heuristic;
    }

    if (typeof intentApi.analyze === 'function') return intentApi.analyze(messages);
    return null;
  }

  async function extractRequirements(messages, model, currentAction, extractor) {
    if (!extractor) return model;
    const latest = latestUserMessage(messages);
    if (!latest) return model;
    if (currentAction?.type === 'ask_user' && typeof extractor.extractDelta === 'function') {
      const next = await extractor.extractDelta({
        userMessage: latest,
        currentAction,
        model,
      });
      return next?.model || model;
    }
    if (typeof extractor.extract !== 'function') return model;
    const next = await extractor.extract(messages, model);
    return next?.model || model;
  }

  async function step({ messages, model, discovery, currentAction }) {
    let currentModel = model || requirementApi()?.createModel?.(null) || { version: 1, intent: null, requirements: [], knowledge: [], pending: [] };
    let currentDiscovery = discovery || { asked: [], completed: false };
    const intentApi = window.ganfpuIntentAnalyzer;
    const extractor = window.ganfpuRequirementExtractor;
    const discoveryApi = window.ganfpuRequirementDiscovery;
    const knowledgeApi = window.ganfpuKnowledgeDiscovery;

    currentModel = {
      version: 1,
      intent: currentModel.intent || null,
      requirements: Array.isArray(currentModel.requirements) ? currentModel.requirements : [],
      knowledge: Array.isArray(currentModel.knowledge) ? currentModel.knowledge : [],
      pending: Array.isArray(currentModel.pending) ? currentModel.pending : [],
    };

    currentModel.intent = await resolveIntent(messages, currentModel, intentApi);
    if (!currentModel.intent) return { status: 'blocked', model: currentModel, discovery: currentDiscovery, action: null };

    const taskType = text(currentModel.intent?.task_type);
    const authoritative = authoritativeUserMessages(messages);
    const initialTurn = authoritative.length === 1 && !currentAction && !currentModel.requirements.length;
    const seedResult = initialTurn ? seedInitialTask(currentModel, messages) : { model: currentModel, seeded: false };
    currentModel = seedResult.model;

    if (!seedResult.seeded || hasInitialRequirementCue(latestUserMessage(messages))) {
      currentModel = await extractRequirements(messages, currentModel, currentAction, extractor);
    }

    if (
      (taskType === 'knowledge' || taskType === 'research' || taskType === 'recommendation') &&
      knowledgeApi?.discover &&
      !knowledgeIsSufficient(currentModel)
    ) {
      const discovered = await knowledgeApi.discover(messages, currentModel.intent);
      if (discovered) {
        currentModel.knowledge = [...(currentModel.knowledge || []), discovered];
      }
    }

    if (taskType === 'knowledge' && knowledgeIsSufficient(currentModel)) {
      currentDiscovery.completed = true;
      return { status: 'ok', model: currentModel, discovery: currentDiscovery, action: completionAction(currentModel) };
    }

    if (localCompletion(currentModel)) {
      currentDiscovery.completed = true;
      return { status: 'ok', model: currentModel, discovery: currentDiscovery, action: completionAction(currentModel) };
    }

    if (!discoveryApi?.nextAction) return { status: 'blocked', model: currentModel, discovery: currentDiscovery, action: null };
    const next = await discoveryApi.nextAction(messages, currentModel, currentDiscovery);
    if (!next) return { status: 'blocked', model: currentModel, discovery: currentDiscovery, action: null };
    if (next.type === 'complete') {
      currentDiscovery.completed = true;
      return { status: 'ok', model: currentModel, discovery: currentDiscovery, action: completionAction(currentModel) };
    }
    return { status: 'ok', model: currentModel, discovery: currentDiscovery, action: next };
  }

  window.ganfpuCore = Object.freeze({ step });
})();
