from pathlib import Path
import re

p = Path('normal-mode.js')
s = p.read_text()
s, n = re.subn(
    r"  function startNormalGrill\(\) \{.*?\n  \}\n\n  function wrapLanguageSwitch",
    """  function startNormalGrill() {
    const input = document.getElementById('normal-intent');
    if (!input) return;
    const intent = input.value.trim();
    if (!intent) {
      input.focus();
      return;
    }
    if (typeof window.ganfpuStartGrill === 'function') window.ganfpuStartGrill();
    else showToast('Grill Me is still loading. Try again in a moment.');
  }

  function wrapLanguageSwitch""",
    s,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit(f'normal start replacement count={n}')
s, n = re.subn(
    r"\n    setTimeout\(\(\) => \{\n\s*const input = document\.getElementById\('normal-intent'\);\n\s*const task = document\.getElementById\('f-task'\);\n\s*if \(input && task && !input\.value\.trim\(\) && task\.value\.trim\(\)\)\n\s*input\.value = task\.value\.trim\(\);\n\s*updateModelStatus\(\);\n\s*\}, 350\);",
    "\n    setTimeout(() => {\n      updateModelStatus();\n    }, 350);",
    s,
    count=1,
)
if n != 1:
    raise SystemExit(f'normal restore replacement count={n}')
p.write_text(s)

p = Path('free-api.js')
s = p.read_text()
start = s.index('  function buildInitialConversation() {')
end = s.index('  function exposeLLMBridge() {', start)
s = s[:start] + s[end:]
s = re.sub(
    r"    exposeLLMBridge\(\);\n\s*replaceNormalHandlers\(\);\n\s*// Keep the provider controls visible in Normal Mode; Power Mode remains LM Studio-native\.\n\s*window\.ganfpuFreeApi = \{ startProviderGrill, sendProviderResponse, applyProviderResult \};",
    "    exposeLLMBridge();\n    // Grill Me behavior is owned by grill-controller.js.",
    s,
    count=1,
)
p.write_text(s)

p = Path('grill-controller.js')
s = p.read_text()
if 'let grillMessages = [];' not in s:
    s = s.replace(
        '  const el = (id) => document.getElementById(id);',
        '  const el = (id) => document.getElementById(id);\n  let grillMessages = [];',
        1,
    )
s = s.replace(
    "      closeGrillMe();\n      el('normal-intent').value = el('f-task')?.value || el('normal-intent').value;\n      showToast('Prompt Specification updated from interview.');",
    "      closeGrillMe();\n      showToast('Prompt Specification updated from interview.');",
    1,
)
p.write_text(s)

p = Path('index.html')
s = p.read_text()
s = s.replace('class="modal-close-btn" onclick="closeGrillMe()"', 'class="modal-close-btn"', 1)
s = s.replace('id="btn-grill-send"\n              onclick="sendGrillMeResponse()"', 'id="btn-grill-send"', 1)
s = s.replace('id="btn-grill-apply"\n            onclick="applyGrillMeResult()"', 'id="btn-grill-apply"', 1)
s = s.replace('id="btn-grill-close" onclick="closeGrillMe()"', 'id="btn-grill-close"', 1)
p.write_text(s)

Path('.github/workflows/refactor-once.yml').unlink(missing_ok=True)
