# Prompt Forge 2

**A local-first, multi-language engine for standardizing AI prompt engineering. Built for power users.**

[日本語の概要は下にあります]

---

## 🚀 About
Prompt Forge 2 is a lightweight, local-only developer tool designed to **standardize prompt engineering workflows**. By separating logic, data, and presentation, it provides a consistent framework for creating high-quality, high-reliability AI prompts.

- **Local-First Architecture:** Your sensitive prompts stay on your machine.
- **Prompt Standardization:** Framework-driven composition using structured fields.
- **Multi-Language Engine:** Seamlessly switch between 6+ languages (JA, EN, ZH, KO, ES, FR).
- **Markdown Templates:** Highly customizable template system with YAML frontmatter.
- **Power User Friendly:** Minimalistic but powerful UI designed for rapid iteration.

---

## 🛠 Features
- **Quality Score:** Real-time feedback on your prompt's richness and structure.
- **Auto-Save:** Never lose your work; stays in your browser's local storage.
- **Dynamic I18N:** Instantly localize both the UI and template names.
- **Export/Import:** Easily share or back up your template collections.

## 📦 How to Run
Since the application uses `fetch` to load local Markdown/JSON configuration, a web server is required.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/f4sT357/promptforge2.git
   cd promptforge2
   ```

2. **Run a local server:**
   ```bash
   # Using node.js 'serve'
   npx serve .

   # Or using Python
   python -m http.server 3000
   ```

3. **Open the browser:**  
   Visit `http://localhost:3000/prompt-forge2.html`

---

## 🇯🇵 日本語概要
Prompt Forge 2 は、プロンプト作成を標準化し、品質のバラつきを抑えるためのローカル完結型ソフトウェアです。
パワーユーザー向けに設計されており、Markdown/YAML形式のテンプレート管理や多言語UI（6言語対応）を特徴としています。
プロンプトの構成要素（役割、タスク、制約、出力形式など）を体系的に定義することで、誰でも高い品質の回答をAIから引き出すことが可能になります。

---

## 🤝 Contributing
Contributions, bug reports, and improvement ideas are highly welcome! 
Feel free to open an Issue or PR. Spread the word and help us build the standard for prompt engineering.

**License:** MIT
