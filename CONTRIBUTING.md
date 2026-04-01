# Contributing to GANFPU

We love contributions! This project is designed to be highly extensible. You can contribute by adding new prompt templates, improving UI translations, or refining the core logic.

---

## 📂 Project Structure
- `data/templates/*.md`: Markdown files for prompt templates.
- `data/templates.json`: Registry of available template filenames.
- `data/i18n.json`: UI translations and multi-language support.
- `index.html` & `ganfpu.html`: Main application entry points.
- `app.js`: Core logic and data loading.
- `style.css`: Cyberpunk-inspired design system.

---

## 📝 How to Add a New Template

### 1. Create a Markdown file
Create a new `.md` file in `data/templates/` (e.g., `my-cool-template.md`).

### 2. Add YAML Frontmatter
Every template MUST start with a YAML frontmatter block:
```yaml
---
id: "my-cool-template"
name: "🚀 My Cool Template (Japanese Name)" 
category: "biz" # biz, writing, research
description: "Brief description of what this prompt does."
---
```

### 3. Structure the Prompt Content
Use H1 (`#`) headers for each prompt section. The mapping is as follows:
- `# 役割` (Role/Persona)
- `# タスク` (Goal/Task)
- `# 背景` (Context)
- `# 制約条件` (Constraints)
- `# 出力形式` (Output Format)
- `# トーン・文体` (Tone)
- `# 出力の長さ` (Length)
- `# 回答アプローチ` (Approach)
- `# 言語` (Output Language)

### 4. Register the Template
Add the filename to **[data/templates.json](data/templates.json)**.
```json
[
  "web-research.md",
  "...",
  "my-cool-template.md"
]
```

---

## 🌐 How to Add Translations
Modify **[data/i18n.json](data/i18n.json)**. Each language key (e.g., `en`, `ja`, `zh`) contains its own set of translations. 

If you added a new template with ID `my-cool-template`, please add its localized name:
```json
"tmpl-my-cool-template": "Localized Name Here"
```

---

## ✅ Pull Request Process
1. Fork the repo.
2. Create a feature branch.
3. Commit your changes.
4. Push to the branch.
5. Create a new Pull Request!

Thank you for helping us standardize prompt engineering!
