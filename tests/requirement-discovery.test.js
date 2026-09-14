const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'core', 'requirement-discovery.js'),
  'utf8'
);

function load(request) {
  let calls = 0;
  const window = {
    ganfpuRequirementModel: {
      FIELD_IDS: [
        'f-role', 'f-task', 'f-context', 'f-constraint', 'f-format',
        'f-tone', 'f-length', 'f-reasoning', 'f-lang', 'f-hallucination',
      ],
    },
    ganfpuLLMAdapter: {
      async request() {
        calls += 1;
        return request;
      },
    },
  };
  const context = vm.createContext({ window, console, Date });
  vm.runInContext(source, context, { filename: 'requirement-discovery.js' });
  return { api: window.ganfpuRequirementDiscovery, calls: () => calls };
}

(async () => {
  {
    const { api, calls } = load(JSON.stringify({
      type: 'ask_user',
      id: 'llm_01',
      question: 'どのOSを対象にしますか？',
      target: { field_id: 'f-context', dimension: 'target_os' },
    }));
    const action = await api.nextAction({
      model: { intent: { task_type: 'transformation' }, requirements: [] },
      discovery: { asked: [] },
      messages: [{ role: 'user', content: 'Windows向けにこのコードを修正して' }],
    });
    assert.equal(calls(), 1);
    assert.equal(action.id, 'llm_01');
    assert.equal(action.target.dimension, 'target_os');
  }

  {
    const { api, calls } = load('User Safety: safe');
    const action = await api.nextAction({
      model: { intent: { task_type: 'recommendation' }, requirements: [] },
      discovery: { asked: [] },
      messages: [{ role: 'user', content: 'おすすめを教えて' }],
    });
    assert.equal(calls(), 1);
    assert.equal(action.type, 'ask_user');
    assert.equal(action.target.field_id, 'f-context');
  }

  {
    const { api, calls } = load(JSON.stringify({
      type: 'ask_user',
      id: 'bad_01',
      question: 'すでに聞いた質問',
      target: { field_id: 'f-context', dimension: 'usage' },
    }));
    const action = await api.nextAction({
      model: { intent: { task_type: 'recommendation' }, requirements: [] },
      discovery: { asked: [{ id: 'action_01', question: 'すでに聞いた質問', target: { field_id: 'f-context', dimension: 'usage' } }] },
      messages: [{ role: 'user', content: 'おすすめを教えて' }],
    });
    assert.equal(calls(), 1);
    assert.equal(action.type, 'ask_user');
    assert.notEqual(action.question, 'すでに聞いた質問');
  }

  console.log('requirement-discovery: 3/3 passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
