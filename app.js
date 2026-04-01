// ============================================================
// PWA - Service Worker Registration
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

// ============================================================
// State
// ============================================================
let lang = localStorage.getItem('pb_lang') || 'ja';
let templates = [];
let I18N = {};

const FIELDS = [
    { id: 'f-role', prefixKey: 'prefix-role', required: false },
    { id: 'f-task', prefixKey: 'prefix-task', required: true },
    { id: 'f-context', prefixKey: 'prefix-context', required: false },
    { id: 'f-constraint', prefixKey: 'prefix-constraint', required: false },
    { id: 'f-format', prefixKey: 'prefix-format', required: true },
    { id: 'f-tone', prefixKey: 'prefix-tone', required: false },
    { id: 'f-length', prefixKey: 'prefix-length', required: false },
    { id: 'f-reasoning', prefixKey: 'prefix-reasoning', required: false },
    { id: 'f-lang', prefixKey: 'prefix-lang', required: false },
];

// ============================================================
// Data Loading
// ============================================================
async function initApp() {
    try {
        // Load i18n
        const i18nRes = await fetch('data/i18n.json');
        I18N = await i18nRes.json();

        // Load templates
        const storedTemplates = localStorage.getItem('pb_templates');
        if (storedTemplates) {
            templates = JSON.parse(storedTemplates);
        } else {
            await loadDefaultTemplates();
        }

        // UI Initialization
        rebuildSelects();
        applyUI();
        restoreAutosave();
        restoreCollapsed();
        renderTemplates();
        setLang(lang);
        initShareButtons();
        update();
    } catch (err) {
        console.error('Initialization failed:', err);
    }
}

async function loadDefaultTemplates() {
    try {
        const listRes = await fetch('data/templates.json');
        const fileNames = await listRes.json();
        
        const loadedTemplates = [];
        for (const fileName of fileNames) {
            const res = await fetch(`data/templates/${fileName}`);
            const text = await res.text();
            
            // Parse Frontmatter
            const frontmatterMatch = text.match(/^---([\s\S]*?)---/);
            if (frontmatterMatch) {
                const yaml = frontmatterMatch[1];
                const content = text.slice(frontmatterMatch[0].length).trim();
                const meta = jsyaml.load(yaml);
                
                // Map Markdown content to field IDs (heuristic mapping based on headers)
                const data = parseMarkdownToData(content);
                
                loadedTemplates.push({
                    id: meta.id || null,
                    name: meta.name,
                    category: meta.category,
                    data: data
                });
            }
        }
        templates = loadedTemplates;
        persist();
    } catch (err) {
        console.error('Default templates load failed:', err);
    }
}

function parseMarkdownToData(markdown) {
    const data = {};
    const sections = markdown.split(/\n# /);
    
    // Mapping of Japanese headers to field IDs
    const headerMap = {
        '役割': 'f-role',
        'タスク': 'f-task',
        '背景': 'f-context',
        '制約条件': 'f-constraint',
        '出力形式': 'f-format',
        'トーン・文体': 'f-tone',
        '出力の長さ': 'f-length',
        '回答アプローチ': 'f-reasoning',
        '言語': 'f-lang'
    };

    sections.forEach(sec => {
        const lines = sec.split('\n');
        let header = lines[0].replace(/^# /, '').trim();
        const content = lines.slice(1).join('\n').trim();
        
        const fieldId = headerMap[header];
        if (fieldId) {
            // Select values need to match the 'value' in i18n
            if (fieldId.includes('format') || fieldId.includes('tone') || fieldId.includes('length') || fieldId.includes('reasoning') || fieldId.includes('lang')) {
                // Heuristic: try to find matching value in i18n
                // This is a bit tricky, but for defaults we know the values
                data[fieldId] = findSelectValue(fieldId, content);
            } else {
                data[fieldId] = content;
            }
        }
    });

    return data;
}

function findSelectValue(fieldId, content) {
    // Current hardcoded mapping for defaults
    // In a real app we might want to store the literal value in YAML instead of parsing text
    // For now, let's keep it simple. If we can't find a match, just return empty
    // (Actual refactoring might change template metadata to be more direct)
    const options = I18N['ja'][fieldId.replace('f-', '') + '-options'];
    if (options) {
        const match = options.find(opt => opt.value.includes(content) || content.includes(opt.value));
        return match ? match.value : '';
    }
    return '';
}

// ============================================================
// Translation helper
// ============================================================
function t(key) { return (I18N[lang] && I18N[lang][key]) || key; }

// ============================================================
// Language switch
// ============================================================
function setLang(l) {
    lang = l;
    localStorage.setItem('pb_lang', l);
    document.documentElement.lang = l;
    ['ja', 'en', 'zh', 'ko', 'es', 'fr'].forEach(code => {
        const btn = document.getElementById('btn-' + code);
        if (btn) btn.classList.toggle('active', l === code);
    });
    applyUI();
    rebuildSelects();
    renderTemplates();
    update();
}

function applyUI() {
    document.getElementById('hdr-subtitle').textContent = t('subtitle');

    const fields = ['role', 'task', 'context', 'constraint', 'format', 'tone', 'length', 'reasoning', 'lang'];
    const requiredFields = ['task', 'format'];
    fields.forEach(f => {
        const tagEl = document.getElementById('tag-' + f);
        if (tagEl) tagEl.textContent = requiredFields.includes(f) ? t('tag-required') : t('tag-optional');
        const lblEl = document.getElementById('lbl-' + f);
        if (lblEl) lblEl.textContent = t('lbl-' + f);
        const descEl = document.getElementById('desc-' + f);
        if (descEl) descEl.innerHTML = t('desc-' + f).replace(/\n/g, '<br>');
        const inputEl = document.getElementById('f-' + f);
        if (inputEl && inputEl.tagName !== 'SELECT') inputEl.placeholder = t('ph-' + f) || '';
    });
    document.getElementById('f-format-custom').placeholder = t('ph-format-custom');

    const noteEl = document.getElementById('note-reasoning');
    if (noteEl) noteEl.textContent = t('note-reasoning');

    document.getElementById('btn-reset').textContent = t('btn-reset');
    document.getElementById('copy-text').textContent = t('btn-copy');
    const shareTxt = document.getElementById('share-text');
    if (shareTxt) shareTxt.textContent = t('btn-share-prompt');
    const shareTmpl = document.getElementById('btn-share-tmpl');
    if (shareTmpl) shareTmpl.textContent = t('btn-share-tmpl');
    document.getElementById('emptyState').textContent = t('templates-empty');
    document.getElementById('templateName').placeholder = t('ph-template-name');
    document.getElementById('btn-save').textContent = t('btn-save');
    document.getElementById('btn-export').textContent = t('btn-export');
    const importBtnText = document.getElementById('btn-import-text');
    if (importBtnText) importBtnText.textContent = t('btn-import');

    const preview = document.getElementById('preview');
    if (preview.querySelector('.preview-placeholder')) {
        preview.querySelector('.preview-placeholder').textContent = t('preview-placeholder');
    }

    const editToggle = document.getElementById('editToggle');
    if (editToggle) {
        const isEditing = preview.contentEditable === 'true';
        editToggle.textContent = isEditing ? t('edit-mode-off') : t('edit-mode-on');
        editToggle.classList.toggle('active', isEditing);
    }

    const sh = document.getElementById('shortcut-hint');
    if (sh) sh.textContent = t('shortcut-hint');

    buildCatFilter();
}

function rebuildSelects() {
    function rebuild(selId, optKey) {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '';
        const options = t(optKey);
        if (Array.isArray(options)) {
            options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value; o.textContent = opt.label;
                sel.appendChild(o);
            });
        }
        sel.value = prev;
    }
    rebuild('f-format', 'format-options');
    rebuild('f-tone', 'tone-options');
    rebuild('f-length', 'length-options');
    rebuild('f-reasoning', 'reasoning-options');
    rebuild('f-lang', 'lang-options');
}

// ============================================================
// Core update
// ============================================================
function getFieldValue(fieldId) {
    if (fieldId === 'f-format') {
        const sel = document.getElementById('f-format').value;
        if (sel === 'custom') return document.getElementById('f-format-custom').value.trim();
        return sel;
    }
    const el = document.getElementById(fieldId);
    return el ? el.value.trim() : '';
}

function update() {
    const fmtEl = document.getElementById('f-format');
    if (!fmtEl) return;
    const fmtSel = fmtEl.value;
    document.getElementById('f-format-custom').style.display = fmtSel === 'custom' ? 'block' : 'none';

    const parts = [];
    let filledCount = 0, requiredFilled = 0;
    const requiredTotal = FIELDS.filter(f => f.required).length;

    FIELDS.forEach(f => {
        const val = getFieldValue(f.id);
        const secId = 'sec-' + f.id.replace('f-', '');
        const sec = document.getElementById(secId);
        const label = sec ? sec.querySelector('label') : null;
        if (val) {
            filledCount++;
            if (f.required) requiredFilled++;
            parts.push(t(f.prefixKey) + val);
            if (label) label.classList.add('field-filled');
        } else {
            if (label) label.classList.remove('field-filled');
        }
    });

    const score = Math.round((filledCount / FIELDS.length) * 100);
    const fill = document.getElementById('scoreFill');
    const num = document.getElementById('scoreNum');
    const hint = document.getElementById('scoreHint');

    if (fill) fill.style.width = score + '%';
    if (num) {
        num.textContent = score + '%';
        const color = score <= 33 ? 'var(--score-low)' : score <= 66 ? 'var(--score-mid)' : 'var(--score-high)';
        if (fill) fill.style.background = color;
        num.style.color = color;
    }

    if (hint) {
        if (filledCount === FIELDS.length) hint.textContent = t('hint-complete');
        else if (requiredFilled < requiredTotal) hint.textContent = t('hint-required');
        else if (!getFieldValue('f-context')) hint.textContent = t('hint-context');
        else if (!getFieldValue('f-role')) hint.textContent = t('hint-role');
        else hint.textContent = t('hint-constraint');
    }

    const preview = document.getElementById('preview');
    const charCountEl = document.getElementById('charCount');
    if (preview) {
        if (parts.length === 0) {
            preview.innerHTML = `<span class="preview-placeholder">${t('preview-placeholder')}</span>`;
            if (charCountEl) {
                charCountEl.textContent = '';
                charCountEl.className = 'char-count';
            }
        } else {
            const promptText = parts.join('\n\n');
            preview.textContent = promptText;
            const len = promptText.length;
            if (charCountEl) {
                charCountEl.textContent = `${len.toLocaleString()} ${t('char-count')}`;
                charCountEl.className = 'char-count' + (len > 2000 ? ' long' : len > 800 ? ' warn' : '');
            }
        }
    }
    autosave();
}

// ============================================================
// Copy
// ============================================================
function copyPrompt() {
    const text = getPromptText();
    if (!text) { showToast(t('toast-no-copy')); return; }
    const btn = document.getElementById('copyBtn');
    const copyTxtEl = document.getElementById('copy-text');
    const doConfirm = () => {
        btn.classList.add('copied');
        if (copyTxtEl) copyTxtEl.textContent = t('btn-copied');
        setTimeout(() => {
            btn.classList.remove('copied');
            if (copyTxtEl) copyTxtEl.textContent = t('btn-copy');
        }, 2000);
    };
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(doConfirm).catch(() => fallbackCopy(text, doConfirm));
    } else {
        fallbackCopy(text, doConfirm);
    }
}

function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); if (cb) cb(); } catch (e) { showToast(t('toast-no-copy')); }
    document.body.removeChild(ta);
}

// ============================================================
// Web Share
// ============================================================
function canShare() { return !!(navigator.share && navigator.canShare); }

function initShareButtons() {
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn && canShare()) shareBtn.style.display = 'flex';
    const shareTmplBtn = document.getElementById('btn-share-tmpl');
    if (shareTmplBtn && canShare()) shareTmplBtn.style.display = 'flex';
}

async function sharePrompt() {
    const text = getPromptText();
    if (!text) { showToast(t('toast-no-copy')); return; }
    const shareData = { title: t('share-title-prompt'), text };
    try {
        if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
            showToast(t('toast-share-ok'));
        } else {
            fallbackCopy(text, () => showToast(t('toast-copied')));
        }
    } catch (e) {
        if (e.name !== 'AbortError') showToast(t('toast-share-unsupported'));
    }
}

async function shareTemplates() {
    if (templates.length === 0) { showToast(t('toast-no-export')); return; }
    const json = JSON.stringify(templates, null, 2);
    const shareData = {
        title: t('share-title-tmpl'),
        text: t('share-text-tmpl') + json,
    };
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], 'prompt-templates.json', { type: 'application/json' });
    const fileShareData = { title: t('share-title-tmpl'), files: [file] };
    try {
        if (navigator.canShare && navigator.canShare(fileShareData)) {
            await navigator.share(fileShareData);
        } else if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
        } else {
            exportTemplates();
            return;
        }
        showToast(t('toast-share-ok'));
    } catch (e) {
        if (e.name !== 'AbortError') exportTemplates();
    }
}

// ============================================================
// Reset
// ============================================================
function resetAll() {
    FIELDS.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.value = '';
    });
    const custom = document.getElementById('f-format-custom');
    if (custom) custom.value = '';
    update();
    showToast(t('toast-reset'));
}

// ============================================================
// Templates
// ============================================================
function renderTemplates() {
    const list = document.getElementById('templateList');
    const empty = document.getElementById('emptyState');
    if (!list) return;
    list.querySelectorAll('.template-item').forEach(i => i.remove());
    if (empty) empty.textContent = t('templates-empty');

    if (templates.length === 0) { if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';

    templates.forEach((tmpl, i) => {
        const item = document.createElement('div');
        item.className = 'template-item';

        const name = document.createElement('div');
        name.className = 'template-name';
        
        // Translated name fallback
        const translated = tmpl.id ? t('tmpl-' + tmpl.id) : null;
        name.textContent = (translated && translated !== 'tmpl-' + tmpl.id) ? translated : tmpl.name;

        name.title = t('tmpl-load-title');
        name.onclick = () => loadTemplate(i);

        const del = document.createElement('button');
        del.className = 'template-del';
        del.textContent = '×';
        del.title = t('tmpl-del-title');
        del.onclick = () => deleteTemplate(i);

        item.appendChild(name);
        item.appendChild(del);
        list.insertBefore(item, empty);
    });
    filterTemplates();
}

function saveTemplate() {
    const nameInput = document.getElementById('templateName');
    const name = nameInput.value.trim();
    if (!name) { showToast(t('toast-no-name')); return; }
    const data = {};
    FIELDS.forEach(f => { data[f.id] = getFieldValue(f.id); });
    data['f-format-custom'] = document.getElementById('f-format-custom').value.trim();
    templates.push({ name, data });
    persist(); renderTemplates();
    nameInput.value = '';
    showToast(`「${name}」${t('toast-saved')}`);
}

function loadTemplate(i) {
    const tmpl = templates[i];
    FIELDS.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.value = tmpl.data[f.id] || '';
    });
    const custom = document.getElementById('f-format-custom');
    if (custom) custom.value = tmpl.data['f-format-custom'] || '';
    update();
    showToast(`「${tmpl.name}」${t('toast-loaded')}`);
}

function deleteTemplate(i) {
    const name = templates[i].name;
    templates.splice(i, 1);
    persist(); renderTemplates();
    showToast(`「${name}」${t('toast-deleted')}`);
}

function persist() { localStorage.setItem('pb_templates', JSON.stringify(templates)); }

// ============================================================
// Export / Import
// ============================================================
function exportTemplates() {
    if (templates.length === 0) { showToast(t('toast-no-export')); return; }
    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'prompt-templates.json'; a.click();
    URL.revokeObjectURL(url);
    showToast(t('toast-exported'));
}

function importTemplates(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!Array.isArray(data)) throw new Error();
            templates = data; persist(); renderTemplates();
            showToast(data.length + t('toast-import-ok'));
        } catch { showToast(t('toast-import-err')); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ============================================================
// Toast
// ============================================================
function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

// ============================================================
// ① オートセーブ
// ============================================================
const AUTOSAVE_KEY = 'pb_autosave';

function autosave() {
    const data = {};
    FIELDS.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) data[f.id] = el.value;
    });
    const custom = document.getElementById('f-format-custom');
    if (custom) data['f-format-custom'] = custom.value;
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
}

function restoreAutosave() {
    try {
        const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY));
        if (!saved) return;
        FIELDS.forEach(f => {
            const el = document.getElementById(f.id);
            if (el && saved[f.id] !== undefined) el.value = saved[f.id];
        });
        const custom = document.getElementById('f-format-custom');
        if (custom && saved['f-format-custom'] !== undefined) custom.value = saved['f-format-custom'];
    } catch (e) { }
}

// ============================================================
// ② フィールド折りたたみ
// ============================================================
const COLLAPSE_KEY = 'pb_collapsed';

function toggleCollapse(secId) {
    const sec = document.getElementById(secId);
    const body = sec.querySelector('.field-body');
    const isCollapsed = sec.classList.contains('collapsed');
    if (isCollapsed) {
        sec.classList.remove('collapsed');
        body.style.maxHeight = body.scrollHeight + "px";
        setTimeout(() => { body.style.maxHeight = ''; }, 280);
    } else {
        body.style.maxHeight = body.scrollHeight + "px";
        requestAnimationFrame(() => { sec.classList.add('collapsed'); body.style.maxHeight = '0'; });
    }
    saveCollapsed();
}

function saveCollapsed() {
    const collapsed = FIELDS.map(f => {
        const secId = 'sec-' + f.id.replace('f-', '');
        const el = document.getElementById(secId);
        return (el && el.classList.contains('collapsed')) ? secId : null;
    }).filter(Boolean);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
}

function restoreCollapsed() {
    try {
        const collapsed = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]');
        collapsed.forEach(secId => {
            const sec = document.getElementById(secId);
            if (sec) {
                sec.classList.add('collapsed');
                const body = sec.querySelector('.field-body');
                if (body) body.style.maxHeight = '0';
            }
        });
    } catch (e) { }
}

// ============================================================
// ③ カテゴリフィルター
// ============================================================
const CAT_MAP = {
    biz: ['🔍', '📧', '📊', '⚖️'],
    writing: ['✍️', '🔄', '📣', '🌐'],
    research: ['📚', '🧠', '🔎', '❓'],
};

let activeCat = 'all';

function getTemplateCat(name) {
    for (const [cat, emojis] of Object.entries(CAT_MAP)) {
        if (emojis.some(e => name.startsWith(e))) return cat;
    }
    return 'other';
}

function buildCatFilter() {
    const container = document.getElementById('catFilter');
    if (!container) return;
    container.innerHTML = '';
    const cats = ['all', 'biz', 'writing', 'research'];
    cats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn' + (activeCat === cat ? ' active' : '');
        btn.textContent = t('cat-' + cat);
        btn.onclick = () => { activeCat = cat; buildCatFilter(); filterTemplates(); };
        container.appendChild(btn);
    });
}

function filterTemplates() {
    const items = document.querySelectorAll('.template-item');
    items.forEach(item => {
        const nameEl = item.querySelector('.template-name');
        if (!nameEl) return;
        const name = nameEl.textContent;
        const cat = getTemplateCat(name);
        const show = activeCat === 'all' || cat === activeCat;
        item.classList.toggle('hidden', !show);
    });
}

// ============================================================
// ④ キーボードショートカット
// ============================================================
document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === 'Enter') {
        e.preventDefault();
        copyPrompt();
    } else if (e.key === 's') {
        e.preventDefault();
        const tmplNameEl = document.getElementById('templateName');
        if (!tmplNameEl) return;
        const name = tmplNameEl.value.trim();
        if (name) {
            saveTemplate();
        } else {
            tmplNameEl.focus();
            showToast(t('toast-no-name'));
        }
    }
});

// ============================================================
// ⑤ プレビュー直接編集
// ============================================================
let editMode = false;

function getPromptText() {
    const preview = document.getElementById('preview');
    if (!preview || preview.querySelector('.preview-placeholder')) return null;
    return preview.innerText || preview.textContent || null;
}

function toggleEditMode() {
    const preview = document.getElementById('preview');
    const toggle = document.getElementById('editToggle');
    if (!preview || !toggle) return;
    editMode = !editMode;

    if (editMode) {
        if (preview.querySelector('.preview-placeholder')) {
            showToast(t('toast-no-copy'));
            editMode = false;
            return;
        }
        preview.contentEditable = 'true';
        toggle.textContent = t('edit-mode-off');
        toggle.classList.add('active');
        preview.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(preview);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        preview.contentEditable = 'false';
        toggle.textContent = t('edit-mode-on');
        toggle.classList.remove('active');
    }
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', initApp);
