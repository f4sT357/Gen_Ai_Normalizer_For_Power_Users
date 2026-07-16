// ============================================================
// PWA - Service Worker Registration
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
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
    { id: 'f-hallucination', prefixKey: 'prefix-hallucination', required: false },
];

// ============================================================
// Data Loading
// ============================================================
async function initApp() {
    try {
        // Load i18n
        const i18nRes = await fetch('data/i18n.json');
        I18N = await i18nRes.json();

        // Load templates dynamically for the current language
        await loadDefaultTemplates();

        // UI Initialization
        rebuildSelects();
        applyUI();
        restoreAutosave();
        restoreCollapsed();
        renderTemplates();
        
        // Init lang toggle buttons (without triggering a second template load)
        document.documentElement.lang = lang;
        ['ja', 'en', 'zh', 'ko', 'es', 'fr'].forEach(code => {
            const btn = document.getElementById('btn-' + code);
            if (btn) btn.classList.toggle('active', lang === code);
        });

        initShareButtons();
        update();
        // Restore prompt from URL fragment if present (share link auto-restore)
        restorePromptFromUrl();
    } catch (err) {
        console.error('Initialization failed:', err);
    }
}

// Restore prompt from URL fragment like #prompt=<encoded prompt>
function restorePromptFromUrl() {
    try {
        const hash = location.hash || '';
        // Prefer structured data (#data=...), fallback to legacy #prompt=
        const dataMatch = hash.match(/data=([^&]+)/);
        if (dataMatch) {
            let b64url = dataMatch[1];
            // Convert base64url -> base64 (pad)
            let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
            const pad = b64.length % 4;
            if (pad) b64 += '='.repeat(4 - pad);
            let json = null;
            if (typeof LZString !== 'undefined' && LZString.decompressFromBase64) {
                // LZString expects standard base64
                json = LZString.decompressFromBase64(b64);
            } else {
                try { json = decodeURIComponent(escape(atob(b64))); } catch (e) { json = null; }
            }
            if (!json) return;
            const obj = JSON.parse(json);
            // Populate fields
            Object.keys(obj).forEach(key => {
                const val = obj[key];
                const el = document.getElementById(key);
                if (el) {
                    // Handle selects with custom values
                    if (el.tagName === 'SELECT') {
                        const hasOption = Array.from(el.options).some(o => o.value === val);
                        if (hasOption) {
                            el.value = val;
                        } else {
                            // set as custom
                            el.value = 'custom';
                            const customId = key + '-custom';
                            const cust = document.getElementById(customId);
                            if (cust) cust.value = val;
                        }
                    } else {
                        el.value = val;
                    }
                } else {
                    // handle known custom ids
                    const alt = document.getElementById(key.replace('-custom',''));
                    if (!alt) return;
                }
            });
            update();
            return;
        }

        const m = hash.match(/prompt=(.*)/);
        if (!m) return;
        const decoded = decodeURIComponent(m[1]);
        const preview = document.getElementById('preview');
        const charCountEl = document.getElementById('charCount');
        if (!preview) return;
        // Put prompt into preview and update char count styling
        preview.textContent = decoded;
        const len = decoded.length;
        if (charCountEl) {
            charCountEl.textContent = `${len.toLocaleString()} ${t('char-count')}`;
            charCountEl.className = 'char-count' + (len > 2000 ? ' long' : len > 800 ? ' warn' : '');
        }
        // Ensure not in edit mode
        preview.contentEditable = 'false';
        const editToggle = document.getElementById('editToggle');
        if (editToggle) { editToggle.textContent = t('edit-mode-on'); editToggle.classList.remove('active'); }
    } catch (e) { /* ignore */ }
}

// Show modal to allow copying plain text (JSON payload) when URL is too long
function showPlainCopyDialog(text) {
    // If dialog already exists, update and show
    let modal = document.getElementById('plainCopyModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'plainCopyModal';
        modal.className = 'plain-copy-modal';
        modal.innerHTML = `
            <div class="plain-copy-backdrop"></div>
            <div class="plain-copy-card">
                <div class="plain-copy-title">${t('btn-copy-plain')}</div>
                <div class="plain-copy-desc">${t('plain-copy-desc')}</div>
                <textarea id="plainCopyTextarea" class="plain-copy-textarea"></textarea>
                <div class="plain-copy-actions">
                    <button id="plainCopyBtn" class="btn btn-primary">${t('btn-copy-plain')}</button>
                    <button id="plainCopyClose" class="btn btn-secondary">${t('btn-close')}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('plainCopyClose').onclick = () => modal.remove();
        document.getElementById('plainCopyBtn').onclick = async () => {
            const val = document.getElementById('plainCopyTextarea').value;
            if (navigator.clipboard && window.isSecureContext) {
                try { await navigator.clipboard.writeText(val); showToast(t('toast-url-too-long-copied')); modal.remove(); return; } catch(e) {}
            }
            fallbackCopy(val, () => { showToast(t('toast-url-too-long-copied')); modal.remove(); });
        };
    }
    const ta = document.getElementById('plainCopyTextarea');
    ta.value = text;
    ta.select();
}

async function loadDefaultTemplates() {
    try {
        const listRes = await fetch('data/templates.json');
        const fileNames = await listRes.json();
        
        const fetchPromises = fileNames.map(async fileName => {
            try {
                const res = await fetch(`data/templates/${lang}/${fileName}`);
                const text = await res.text();
                
                // Parse Frontmatter
                const frontmatterMatch = text.match(/^---([\s\S]*?)---/);
                if (frontmatterMatch) {
                    const yaml = frontmatterMatch[1];
                    const content = text.slice(frontmatterMatch[0].length).trim();
                    const meta = jsyaml.load(yaml);
                    
                    // Map Markdown content to field IDs (heuristic mapping based on headers)
                    const data = parseMarkdownToData(content);
                    
                    return {
                        id: meta.id || null,
                        name: meta.name,
                        category: meta.category,
                        data: data
                    };
                }
            } catch (e) {
                console.error(`Failed to load template ${fileName}:`, e);
            }
            return null;
        });

        const defaultTemplates = (await Promise.all(fetchPromises)).filter(Boolean);
        const loadedTemplates = [...defaultTemplates];

        // Add user-saved templates from localStorage
        const storedTemplates = localStorage.getItem('pb_templates');
        if (storedTemplates) {
            const parsed = JSON.parse(storedTemplates);
            loadedTemplates.push(...parsed.filter(t => !t.id)); // only user custom templates (no id)
        }

        templates = loadedTemplates;
    } catch (err) {
        console.error('Default templates load failed:', err);
    }
}

function parseMarkdownToData(markdown) {
    const data = {};
    const sections = markdown
        .split(/(?=^#\s)/m)
        .map(section => section.trim())
        .filter(section => section.startsWith('# '));
    // Dynamically build headerMap from the current language's I18N prefixes
    const headerMap = {};
    const fields = ['role', 'task', 'context', 'constraint', 'hallucination', 'format', 'tone', 'length', 'reasoning', 'lang'];
    fields.forEach(f => {
        const prefixStr = I18N[lang] && I18N[lang]['prefix-' + f];
        if (prefixStr) {
            const h = prefixStr.replace(/^#\s*/, '').replace(/\n$/, '').trim();
            headerMap[h] = 'f-' + f;
        }
    });

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
    const options = I18N[lang] && I18N[lang][fieldId.replace('f-', '') + '-options'];
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
    // Reload templates for new lang and then update UI
    loadDefaultTemplates().then(() => {
        renderTemplates();
        update();
    });
}

function applyUI() {
    document.getElementById('hdr-subtitle').textContent = t('subtitle');

    const fields = ['role', 'task', 'context', 'constraint', 'hallucination', 'format', 'tone', 'length', 'reasoning', 'lang'];
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
    const hallucinationCustom = document.getElementById('f-hallucination-custom');
    if (hallucinationCustom) hallucinationCustom.placeholder = t('ph-hallucination-custom');

    const noteEl = document.getElementById('note-reasoning');
    if (noteEl) noteEl.textContent = t('note-reasoning');

    document.getElementById('btn-reset').textContent = t('btn-reset');
    document.getElementById('copy-text').textContent = t('btn-copy');
    const downloadTxt = document.getElementById('download-text');
    if (downloadTxt) downloadTxt.textContent = t('btn-download');
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

    // LM Studio Connection
    const titleLM = document.getElementById('title-lm-connect');
    if (titleLM) titleLM.textContent = t('card-lm-title');
    const btnLMFetch = document.getElementById('btn-lm-fetch');
    if (btnLMFetch) btnLMFetch.textContent = t('btn-lm-fetch');
    const optLMPl = document.getElementById('opt-lm-placeholder');
    if (optLMPl) optLMPl.textContent = t('ph-lm-model-select');
    const btnGrill = document.getElementById('btn-grill-me');
    if (btnGrill) btnGrill.textContent = t('btn-grill-me');

    // Grill Me Modal
    const grillTitle = document.getElementById('grill-title-text');
    if (grillTitle) grillTitle.textContent = t('grill-title');
    const btnGrillApply = document.getElementById('btn-grill-apply');
    if (btnGrillApply) btnGrillApply.textContent = t('btn-grill-apply');
    const btnGrillClose = document.getElementById('btn-grill-close');
    if (btnGrillClose) btnGrillClose.textContent = t('btn-grill-close');
    const grillInput = document.getElementById('grillInput');
    if (grillInput) grillInput.placeholder = t('grill-placeholder');

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
    rebuild('f-hallucination', 'hallucination-options');
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
    if (fieldId === 'f-hallucination') {
        const sel = document.getElementById('f-hallucination').value;
        if (sel === 'custom') return document.getElementById('f-hallucination-custom').value.trim();
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
    const hallucinationEl = document.getElementById('f-hallucination');
    if (hallucinationEl) {
        const hallucinationSel = hallucinationEl.value;
        const hallucinationCustom = document.getElementById('f-hallucination-custom');
        if (hallucinationCustom) hallucinationCustom.style.display = hallucinationSel === 'custom' ? 'block' : 'none';
    }

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
// Download
// ============================================================
function downloadPrompt() {
    const text = getPromptText();
    if (!text) { showToast(t('toast-no-copy')); return; }
    
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = "prompt_" + dateStr + ".txt";
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================
// Web Share
// ============================================================
function canShare() { return !!(navigator.share && navigator.canShare); }
const SHARE_URL_MAX = 2000; // max safe URL length before falling back to plain text copy

function initShareButtons() {
    const shareBtn = document.getElementById('shareBtn');
    // Show share buttons unconditionally; runtime will fallback if Web Share isn't available
    if (shareBtn) shareBtn.style.display = 'flex';
    const shareTmplBtn = document.getElementById('btn-share-tmpl');
    if (shareTmplBtn) shareTmplBtn.style.display = 'flex';
}

async function sharePrompt() {
    const text = getPromptText();
    if (!text) { showToast(t('toast-no-copy')); return; }
    const shareData = { title: t('share-title-prompt'), text };
    try {
        // Try native Web Share first (if supported)
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
            showToast(t('toast-share-ok'));
            return;
        }
    } catch (e) {
        if (e.name !== 'AbortError') showToast(t('toast-share-unsupported'));
    }

    // Fallback: create a compressed shareable URL containing the full form as #data=<base64url>
    try {
        // Build payload from fields
        const payload = {};
        FIELDS.forEach(f => { payload[f.id] = getFieldValue(f.id); });
        payload['f-format-custom'] = (document.getElementById('f-format-custom') || { value: '' }).value || '';
        payload['f-hallucination-custom'] = (document.getElementById('f-hallucination-custom') || { value: '' }).value || '';

        const json = JSON.stringify(payload);
        // Use LZString to compress to base64, then make it URL-safe
        const b64 = (typeof LZString !== 'undefined' && LZString.compressToBase64) ? LZString.compressToBase64(json) : btoa(unescape(encodeURIComponent(json)));
        const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
        const base = location.href.split('#')[0];
        const url = base + '#data=' + b64url;
        // If URL is extremely long, show a plain-text copy modal as fallback
        if (url.length > SHARE_URL_MAX) {
            showToast(t('toast-url-too-long'));
            // Offer the JSON payload as plain text to copy/share
            showPlainCopyDialog(json);
            return;
        }
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(url);
            showToast(t('toast-share-link-copied'));
            return;
        }
        fallbackCopy(url, () => showToast(t('toast-share-link-copied')));
    } catch (e) {
        // As a last resort, copy raw prompt text
        fallbackCopy(text, () => showToast(t('toast-copied')));
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
    const hallucinationCustom = document.getElementById('f-hallucination-custom');
    if (hallucinationCustom) hallucinationCustom.value = '';
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

        const name = document.createElement('span');
        name.className = 'template-name';
        
        // Translated name fallback if available, else use original name
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
    data['f-hallucination-custom'] = document.getElementById('f-hallucination-custom').value.trim();
    templates.push({ name, data });
    persist(); renderTemplates();
    nameInput.value = '';
    showToast(`縲・{name}縲・{t('toast-saved')}`);
}

function loadTemplate(i) {
    const tmpl = templates[i];
    FIELDS.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.value = tmpl.data[f.id] || '';
    });
    const custom = document.getElementById('f-format-custom');
    if (custom) custom.value = tmpl.data['f-format-custom'] || '';
    const hallucinationCustom = document.getElementById('f-hallucination-custom');
    if (hallucinationCustom) hallucinationCustom.value = tmpl.data['f-hallucination-custom'] || '';
    update();
    showToast(`縲・{tmpl.name}縲・{t('toast-loaded')}`);
}

function deleteTemplate(i) {
    const name = templates[i].name;
    templates.splice(i, 1);
    persist(); renderTemplates();
    showToast(`縲・{name}縲・{t('toast-deleted')}`);
}

function persist() { 
    // Filter out default templates (they have an ID) and persist only custom templates
    const customTemplates = templates.filter(t => !t.id);
    localStorage.setItem('pb_templates', JSON.stringify(customTemplates)); 
}

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
// 竭 繧ｪ繝ｼ繝医そ繝ｼ繝・// ============================================================
const AUTOSAVE_KEY = 'pb_autosave';

function autosave() {
    const data = {};
    FIELDS.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) data[f.id] = el.value;
    });
    const custom = document.getElementById('f-format-custom');
    if (custom) data['f-format-custom'] = custom.value;
    const hallucinationCustom = document.getElementById('f-hallucination-custom');
    if (hallucinationCustom) data['f-hallucination-custom'] = hallucinationCustom.value;
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
        const hallucinationCustom = document.getElementById('f-hallucination-custom');
        if (hallucinationCustom && saved['f-hallucination-custom'] !== undefined) hallucinationCustom.value = saved['f-hallucination-custom'];
    } catch (e) { }
}

// ============================================================
// 竭｡ 繝輔ぅ繝ｼ繝ｫ繝画釜繧翫◆縺溘∩
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
// 竭｢ 繧ｫ繝・ざ繝ｪ繝輔ぅ繝ｫ繧ｿ繝ｼ
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
// 竭｣ 繧ｭ繝ｼ繝懊・繝峨す繝ｧ繝ｼ繝医き繝・ヨ
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
// 竭､ 繝励Ξ繝薙Η繝ｼ逶ｴ謗･邱ｨ髮・// ============================================================
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
// LM Studio & Grill Me Integration
// ============================================================
let selectedLMModel = '';
let grillMessages = [];

async function fetchLMModels() {
    const endpointInput = document.getElementById('lm-endpoint');
    if (!endpointInput) return;
    const endpoint = endpointInput.value.trim();
    const select = document.getElementById('lm-model-select');
    const actionsArea = document.getElementById('lm-actions-area');
    
    // Clear select
    select.innerHTML = `<option value="">${t('ph-lm-model-select')}</option>`;
    if (actionsArea) actionsArea.style.display = 'none';

    try {
        const res = await fetch(`${endpoint}/models`);
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();
        
        if (data && Array.isArray(data.data)) {
            data.data.forEach(model => {
                const opt = document.createElement('option');
                opt.value = model.id;
                opt.textContent = model.id;
                select.appendChild(opt);
            });
            showToast(t('toast-lm-connect-success'));
        } else {
            throw new Error('Invalid response structure');
        }
    } catch (err) {
        console.error(err);
        showToast(t('toast-lm-connect-fail'));
    }
}

function onLMModelChange() {
    const select = document.getElementById('lm-model-select');
    const actionsArea = document.getElementById('lm-actions-area');
    selectedLMModel = select ? select.value : '';
    
    if (actionsArea) {
        actionsArea.style.display = selectedLMModel ? 'block' : 'none';
    }
}

function appendGrillMessage(sender, text) {
    const chatLog = document.getElementById('grillChatLog');
    if (!chatLog) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${sender}`;
    msgDiv.textContent = text;
    
    chatLog.appendChild(msgDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
}

async function startGrillMe() {
    if (!selectedLMModel) return;
    
    const modal = document.getElementById('grillModal');
    if (modal) modal.style.display = 'flex';
    
    const chatLog = document.getElementById('grillChatLog');
    if (chatLog) chatLog.innerHTML = '';
    
    const input = document.getElementById('grillInput');
    if (input) {
        input.value = '';
        input.disabled = false;
    }
    
    // Setup initial system prompt and user draft configuration
    const draftPrompt = getPromptText() || '';
    
    const filledFields = {};
    const emptyFields = [];
    FIELDS.forEach(f => {
        const val = getFieldValue(f.id);
        const key = f.id.replace('f-', '');
        if (val) {
            filledFields[key] = val;
        } else {
            emptyFields.push(key);
        }
    });

    const systemPrompt = `You are an expert prompt engineer. Your job is to refine and polish the user's draft prompt configuration.
    
    Rules:
    1. Analyze the filled fields and the full preview text. Identify the absolute most critical missing details (e.g., specific context, target audience, precise goals).
    2. DO NOT ask repetitive questions. If the user has already answered a question (e.g., about tone, length, target audience, or role) in previous turns, or if a field is already filled in the initial configuration, do not ask about it again.
    3. If the user gives a specific domain (like a game, software, or business sector, e.g., "GT7"), ask domain-specific questions (e.g., "What modes are you playing? What is your budget or car preferences in the game?") instead of generic questions.
    4. Ask only 1 or 2 questions per turn. Keep them extremely short, direct, and easy to answer.
    5. Do not include excessive polite greetings or preambles.
    6. Write your response in the language the user is using (current language code: ${lang}).`;
    
    let userInitialMsg = `Here is my current prompt configuration:\n`;
    userInitialMsg += `Filled fields:\n${JSON.stringify(filledFields, null, 2)}\n\n`;
    if (emptyFields.length > 0) {
        userInitialMsg += `Empty fields to consider filling: ${emptyFields.join(', ')}\n\n`;
    }
    userInitialMsg += `Full Preview Text:\n---\n${draftPrompt}\n---\n`;
    userInitialMsg += `Please analyze this configuration and ask me 1 or 2 targeted questions to fill the most important gaps.`;

    grillMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInitialMsg }
    ];

    appendGrillMessage('system', t('grill-ai-init-msg'));
    
    await getLMResponse();
}

async function getLMResponse() {
    const endpointInput = document.getElementById('lm-endpoint');
    if (!endpointInput) return;
    const endpoint = endpointInput.value.trim();
    
    const sendBtn = document.getElementById('btn-grill-send');
    const input = document.getElementById('grillInput');
    
    if (sendBtn) sendBtn.disabled = true;
    if (input) input.disabled = true;
    
    appendGrillMessage('system', 'Thinking...');
    
    try {
        const res = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedLMModel,
                messages: grillMessages.filter(m => m.role !== 'system' || grillMessages.indexOf(m) === 0),
                temperature: 0.7
            })
        });
        
        // Remove 'Thinking...' message
        const chatLog = document.getElementById('grillChatLog');
        if (chatLog && chatLog.lastChild && chatLog.lastChild.textContent === 'Thinking...') {
            chatLog.removeChild(chatLog.lastChild);
        }
        
        if (!res.ok) throw new Error('API request failed');
        const data = await res.json();
        
        const reply = data.choices[0].message.content;
        grillMessages.push({ role: 'assistant', content: reply });
        appendGrillMessage('ai', reply);
        
    } catch (err) {
        console.error(err);
        // Remove 'Thinking...' if still there
        const chatLog = document.getElementById('grillChatLog');
        if (chatLog && chatLog.lastChild && chatLog.lastChild.textContent === 'Thinking...') {
            chatLog.removeChild(chatLog.lastChild);
        }
        appendGrillMessage('system', 'Error: Failed to get response from local server. Make sure LM Studio is running and CORS is allowed.');
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (input) {
            input.disabled = false;
            input.focus();
        }
    }
}

async function sendGrillMeResponse() {
    const input = document.getElementById('grillInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    
    appendGrillMessage('user', text);
    grillMessages.push({ role: 'user', content: text });
    input.value = '';
    
    await getLMResponse();
}

function closeGrillMe() {
    const modal = document.getElementById('grillModal');
    if (modal) modal.style.display = 'none';
    grillMessages = [];
}

// Add shortcut for Enter to send in Grill Me Input
document.addEventListener('DOMContentLoaded', () => {
    const grillInput = document.getElementById('grillInput');
    if (grillInput) {
        grillInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendGrillMeResponse();
            }
        });
    }
});

async function applyGrillMeResult() {
    const endpointInput = document.getElementById('lm-endpoint');
    if (!endpointInput) return;
    const endpoint = endpointInput.value.trim();
    
    const chatLog = document.getElementById('grillChatLog');
    appendGrillMessage('system', 'Polishing prompt & generating structured fields...');
    
    // Request AI to format the final polished prompt as JSON
    const finalInstruct = `Based on our conversation, please structure the polished prompt into the following JSON format. Output ONLY the JSON block, no other text:
{
  "f-role": "role or persona",
  "f-task": "polished task description",
  "f-context": "background details gathered",
  "f-constraint": "constraints identified",
  "f-format": "specified format (if any, matching the options: bullets, list, table, head-para, qa, pro-con, steps, code, json, structure or a custom description)",
  "f-tone": "specified tone",
  "f-length": "specified length"
}
Ensure all keys are present. For the format, tone, and length, you can map them to the best-matching existing option or provide custom descriptions. Output only the raw JSON.`;

    grillMessages.push({ role: 'user', content: finalInstruct });

    try {
        const res = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedLMModel,
                messages: grillMessages,
                temperature: 0.2
            })
        });
        
        if (!res.ok) throw new Error('Failed to get structured JSON');
        const data = await res.json();
        const reply = data.choices[0].message.content.trim();
        
        // Remove 'Polishing...' message
        if (chatLog && chatLog.lastChild && chatLog.lastChild.textContent.includes('Polishing')) {
            chatLog.removeChild(chatLog.lastChild);
        }
        
        // Parse JSON from LLM response
        let jsonStr = reply;
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }
        
        const parsed = JSON.parse(jsonStr);
        
        // Populate GANFPU fields
        Object.keys(parsed).forEach(fieldId => {
            const val = parsed[fieldId];
            const el = document.getElementById(fieldId);
            if (!el) return;
            
            if (el.tagName === 'SELECT') {
                const hasOption = Array.from(el.options).some(o => o.value === val);
                if (hasOption) {
                    el.value = val;
                } else {
                    el.value = 'custom';
                    const customEl = document.getElementById(fieldId + '-custom');
                    if (customEl) {
                        customEl.value = val;
                        customEl.style.display = 'block';
                    }
                }
            } else {
                el.value = val;
            }
        });
        
        update();
        closeGrillMe();
        showToast('Prompt updated successfully from interview!');
    } catch (err) {
        console.error(err);
        if (chatLog && chatLog.lastChild && chatLog.lastChild.textContent.includes('Polishing')) {
            chatLog.removeChild(chatLog.lastChild);
        }
        appendGrillMessage('system', 'Failed to map response to structured fields automatically. Copying AI text to Task field instead...');
        
        // Fallback: put the last assistant message content into f-task
        const lastAIMsg = grillMessages.findLast(m => m.role === 'assistant');
        if (lastAIMsg) {
            const taskEl = document.getElementById('f-task');
            if (taskEl) {
                taskEl.value = lastAIMsg.content;
                update();
            }
            setTimeout(() => {
                closeGrillMe();
                showToast('Applied fallback to Task field');
            }, 2000);
        } else {
            appendGrillMessage('system', 'No AI responses to apply.');
        }
    }
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', initApp);
