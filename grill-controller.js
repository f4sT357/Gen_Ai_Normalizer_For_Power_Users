(() => {
  const el = (id) => document.getElementById(id);
  let grillMessages = [];
  let grillState = {
    blockedAnchors: [],
    blockedDimensions: [],
    lastQuestion: null,
  };

  function buildInitialConversation(intent) {
    const systemPrompt = `You are an expert prompt engineer operating in the requirements-interview phase of a prompt normalization workflow.
Rules:
1. Treat the user's current intent as the ONLY source of task context.
2. Your ONLY job in this phase is to identify missing or ambiguous requirements by asking questions.
3. Do NOT answer the user's original request.
4. Do NOT provide recommendations, solutions, explanations, research results, or the final prompt.
5. Do NOT perform the task described in the user's request.
6. Never ask for information already supplied in the current intent or later in this conversation.
7. Do not invent requirements or preferences.
8. Ask only 1 or 2 short, targeted questions per turn.
9. Ask only questions whose answers would materially change the final prompt.
10. If the domain is specific, make the question domain-specific without assuming that your domain knowledge is correct.
11. Reply in the user's language.
12. Stay in interview mode until the application explicitly asks you to structure the final requirements.`;
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: intent },
    ];
  }

  function isInterviewQuestion(text) {
    const normalized = (text || '').trim();
    if (!normalized) return false;
    if (!/[?？]|ですか[。！!]?|ますか[。！!]?|でしょうか[。！!]?|どのよう|どちら|何を|何が|どんな|どれ/.test(normalized)) return false;

    const answerLike = [
      /(^|\n)\s*[-*•]\s+/,
      /(^|\n)\s*\d+[.)]\s+/,
      /おすすめ|推薦|候補|以下の|検討してみ|～がおすすめ|最適です|選ぶとよい/i,
      /\bhttps?:\/\//i,
    ];
    if (answerLike.some((pattern) => pattern.test(normalized))) return false;

    return true;
  }

  function normalizeStateValue(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Only explicit uncertainty reopens the previous dimension.
  // "特にない", "ありません", "お任せ" etc. are valid answers meaning
  // that the user has no additional requirement; they must not reopen the dimension.
  function isUnresolvedAnswer(text) {
    const normalized = normalizeStateValue(text);
    if (!normalized) return false;
    return /^(分からない|わからない|不明|未定|決めていない|決まっていない|特に決めてない|まだ分からない|まだわからない|よく分からない|よくわからない)$/.test(normalized);
  }

  function addBlockedQuestion(candidate) {
    if (!candidate) return;
    const anchor = String(candidate.dimension_anchor || '').trim();
    const dimension = String(candidate.dimension || '').trim();
    if (anchor && !grillState.blockedAnchors.includes(anchor)) {
      grillState.blockedAnchors.push(anchor);
    }
    if (dimension && !grillState.blockedDimensions.some((item) => normalizeStateValue(item) === normalizeStateValue(dimension))) {
      grillState.blockedDimensions.push(dimension);
    }
  }

  function reopenLastQuestionDimension() {
    const last = grillState.lastQuestion;
    if (!last) return;
    const anchor = String(last.dimension_anchor || '').trim();
    const dimension = normalizeStateValue(last.dimension || '');
    grillState.blockedAnchors = grillState.blockedAnchors.filter((item) => item !== anchor);
    grillState.blockedDimensions = grillState.blockedDimensions.filter((item) => normalizeStateValue(item) !== dimension);
  }

  function consumePreviousQuestion(answer) {
    const last = grillState.lastQuestion;
    if (!last) return;
    if (isUnresolvedAnswer(answer)) reopenLastQuestionDimension();
    grillState.lastQuestion = null;
  }

  async function requestInterviewResponse() {
    if (!window.ganfpuGrillEngine?.nextQuestion) {
      throw new Error('The Grill Engine is unavailable. Interview safety checks cannot be bypassed.');
    }
    const result = await window.ganfpuGrillEngine.nextQuestion(grillMessages, grillState);
    if (result?.status === 'question' && isInterviewQuestion(result.question)) return result;
    if (result?.status === 'blocked') {
      throw new Error('The next question was rejected by the Grill Me safety guards.');
    }
    if (result?.status === 'no_question') {
      throw new Error('No safe interview question could be generated from the user-provided requirements.');
    }
    if (result?.status === 'invalid') {
      throw new Error('The generated interview question failed validation.');
    }
    throw new Error('The Grill Engine returned an invalid result state.');
  }

  async function respond() {
    const send = el('btn-grill-send'),
      input = el('grillInput');
    if (send) send.disabled = true;
    if (input) input.disabled = true;
    appendGrillMessage('system', 'Thinking...');
    try {
      const result = await requestInterviewResponse();
      const log = el('grillChatLog');
      if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild);
      grillMessages.push({ role: 'assistant', content: result.question });
      grillState.lastQuestion = {
        dimension: String(result.candidate?.dimension || '').trim(),
        dimension_anchor: String(result.candidate?.dimension_anchor || '').trim(),
        question: result.question,
      };
      addBlockedQuestion(result.candidate);
      appendGrillMessage('ai', result.question);
    } catch (e) {
      const log = el('grillChatLog');
      if (log?.lastChild?.textContent === 'Thinking...') log.removeChild(log.lastChild);
      appendGrillMessage('system', `Error: ${e.message}`);
    } finally {
      if (send) send.disabled = false;
      if (input) input.disabled = false;
      requestAnimationFrame(() => {
        const log = el('grillChatLog');
        if (log) log.scrollTop = log.scrollHeight;
      });
    }
  }

  async function send() {
    const input = el('grillInput');
    const text = input?.value.trim();
    if (!text) return;
    consumePreviousQuestion(text);
    appendGrillMessage('user', text);
    grillMessages.push({ role: 'user', content: text });
    input.value = '';
    await respond();
  }

  async function start() {
    if (!window.ganfpuLLM || !window.ganfpuLLM.ensureReady()) return;
    const input = el('normal-intent');
    const intent = input?.value.trim();
    if (!intent) {
      input?.focus();
      return;
    }
    el('grillModal').style.display = 'flex';
    el('grillChatLog').innerHTML = '';
    el('grillInput').value = '';
    grillMessages = buildInitialConversation(intent);
    grillState = {
      blockedAnchors: [],
      blockedDimensions: [],
      lastQuestion: null,
    };
    appendGrillMessage(
      'system',
      `Using ${window.ganfpuLLM.getProviderLabel()} · ${window.ganfpuLLM.getModel()}`
    );
    await respond();
  }

  async function copyText(text) {
    if (!text) return false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (e) {}
    ta.remove();
    return copied;
  }

  async function copyResult() {
    const result = el('normal-result'),
      preview = el('preview');
    const text = result?.textContent.trim() || preview?.textContent.trim() || '';
    if (!text || preview?.querySelector('.preview-placeholder')) {
      showToast('Nothing to copy.');
      return;
    }
    if (await copyText(text)) showToast('Copied to clipboard.');
    else showToast('Copy failed. Please select and copy the text manually.');
  }

  function userMessages() {
    return grillMessages.filter((message) => message.role === 'user' && !message.synthetic);
  }

  function userTranscript() {
    return userMessages()
      .map((message) => message.content)
      .join('\n');
  }

  function extractJson(text) {
    const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      return JSON.parse(raw);
    } catch (error) {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
      throw error;
    }
  }

  function normalizeSource(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sourceExistsInUserMessage(source, authoritativeUserMessages) {
    const normalizedSource = normalizeSource(source);
    if (!normalizedSource) return false;
    return authoritativeUserMessages.some((message) =>
      normalizeSource(message.content).includes(normalizedSource)
    );
  }

  function sourceBackedValue(value, source, authoritativeUserMessages) {
    const normalizedValue = normalizeSource(value);
    const normalizedSource = normalizeSource(source);
    if (!normalizedValue || !normalizedSource) return false;
    if (!sourceExistsInUserMessage(source, authoritativeUserMessages)) return false;
    return normalizedSource.includes(normalizedValue);
  }

  function valueForSourceCheck(id, value) {
    if (id === 'f-hallucination') {
      return normalizeSource(value).replace(/^カスタム:\s*/i, '');
    }
    return normalizeSource(value);
  }

  async function apply() {
    if (!window.ganfpuLLM || !window.ganfpuLLM.ensureReady()) return;
    appendGrillMessage('system', 'Structuring requirements into Prompt Specification...');

    // Snapshot actual user-authored turns before adding the application-generated
    // structuring instruction. Only this snapshot is authoritative evidence.
    const authoritativeUserMessages = userMessages().map((message) => ({ ...message }));
    const instruction = `Based ONLY on the current Grill Me conversation, extract the final requirements into this JSON format.
The user messages are the authoritative source. Assistant messages are questions only and MUST NOT be treated as facts or requirements.
Do not infer unstated preferences, domain facts, technical specifications, recommendations, or solutions.
For every field, provide a source quote copied from a USER message that directly supports that field.
The source quote must be an exact substring of a user message, apart from whitespace normalization.
If a field has no direct user-provided requirement, set its value and source to empty strings.
Do not turn a question asked by the assistant into a user requirement.
Do not fill gaps using your own knowledge.
For f-hallucination, use ONLY one of these policy values: "指定なし", "不確実な情報を明示", "事実確認を要求", "根拠・出典を要求", "不明な場合は回答しない". If the user explicitly wants another policy, use "カスタム: ..." and quote the user's wording.
If the user did not specify a hallucination policy, use "指定なし" with an empty source.
Output ONLY valid JSON, with every key present.
{
  "f-role":{"value":"","source":""},
  "f-task":{"value":"","source":""},
  "f-context":{"value":"","source":""},
  "f-constraint":{"value":"","source":""},
  "f-format":{"value":"","source":""},
  "f-tone":{"value":"","source":""},
  "f-length":{"value":"","source":""},
  "f-reasoning":{"value":"","source":""},
  "f-lang":{"value":"","source":""},
  "f-hallucination":{"value":"指定なし","source":""}
}`;
    grillMessages.push({ role: 'user', content: instruction, synthetic: true });
    try {
      const reply = (await window.ganfpuLLM.request(grillMessages, 0.2)).trim();
      const parsed = extractJson(reply);
      const fields = [
        'f-role', 'f-task', 'f-context', 'f-constraint', 'f-format',
        'f-tone', 'f-length', 'f-reasoning', 'f-lang', 'f-hallucination',
      ];
      fields.forEach((id) => {
        const field = el(id);
        if (!field) return;
        const entry = parsed[id] && typeof parsed[id] === 'object' ? parsed[id] : {};
        const value = typeof entry.value === 'string' ? entry.value.trim() : '';
        const source = typeof entry.source === 'string' ? entry.source.trim() : '';
        const sourceValue = valueForSourceCheck(id, value);

        // The hallucination policy has an application-defined default. It does not need
        // user evidence, unlike every other extracted requirement.
        const isDefaultHallucinationPolicy =
          id === 'f-hallucination' && value === '指定なし' && !source;

        if ((!value || (!source && !isDefaultHallucinationPolicy)) ||
            (source && !sourceBackedValue(sourceValue, source, authoritativeUserMessages))) {
          field.value = '';
          const custom = el(id + '-custom');
          if (custom) {
            custom.value = '';
            custom.style.display = 'none';
          }
          return;
        }

        if (field.tagName === 'SELECT') {
          const matchingOption = [...field.options].find((o) => o.value === value);
          if (matchingOption) {
            field.value = matchingOption.value;
          } else if (id === 'f-format' || id === 'f-hallucination') {
            // Only fields with an actual custom input may receive a custom value.
            field.value = 'custom';
            const custom = el(id + '-custom');
            if (custom) {
              custom.value = value.replace(/^カスタム:\s*/, '');
              custom.style.display = 'block';
            }
          } else {
            field.value = '';
          }
        } else {
          field.value = value;
        }
      });

      update();
      const preview = el('preview'),
        result = el('normal-result'),
        wrap = el('normal-result-wrap');
      if (
        preview && result && wrap && preview.textContent.trim() &&
        !preview.querySelector('.preview-placeholder')
      ) {
        result.textContent = preview.textContent.trim();
        wrap.hidden = false;
      }
      if (typeof window.recordHistory === 'function') window.recordHistory('grill');
      closeGrillMe();
      showToast('Prompt Specification updated from interview.');
    } catch (e) {
      console.error(e);
      appendGrillMessage('system', 'Failed to map the interview to structured fields.');
    }
  }

  function bind() {
    const sendButton = el('btn-grill-send'),
      applyButton = el('btn-grill-apply');
    if (!sendButton || !applyButton || !window.ganfpuLLM) return false;

    const freshSend = sendButton.cloneNode(true);
    freshSend.removeAttribute('onclick');
    sendButton.replaceWith(freshSend);
    freshSend.onclick = send;

    const grillInput = el('grillInput');
    if (grillInput) {
      const freshInput = grillInput.cloneNode(true);
      freshInput.removeAttribute('onkeydown');
      grillInput.replaceWith(freshInput);
      freshInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
    }

    const freshApply = applyButton.cloneNode(true);
    freshApply.removeAttribute('onclick');
    applyButton.replaceWith(freshApply);
    freshApply.onclick = apply;

    const resultCopy = el('normal-result-copy');
    if (resultCopy) {
      const freshCopy = resultCopy.cloneNode(true);
      freshCopy.removeAttribute('onclick');
      resultCopy.replaceWith(freshCopy);
      freshCopy.onclick = copyResult;
    }
    window.applyGrillMeResult = apply;
    window.closeGrillMe = () => {
      const modal = el('grillModal');
      if (modal) modal.style.display = 'none';
      grillMessages = [];
      grillState = {
        blockedAnchors: [],
        blockedDimensions: [],
        lastQuestion: null,
      };
    };
    const closeButtons = [el('btn-grill-close'), document.querySelector('.modal-close-btn')];
    closeButtons.forEach((button) => {
      if (button) button.addEventListener('click', window.closeGrillMe);
    });
    return true;
  }

  function init() {
    if (bind()) return;
    setTimeout(init, 100);
  }

  window.ganfpuStartGrill = start;
  window.ganfpuApplyGrillResult = apply;
  init();
})();
