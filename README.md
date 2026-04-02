# Generative AI Normalizer For Power User (GANFPU)
“Build your prompt once. Use it everywhere.”

**A local-first, multi-language engine for standardizing AI prompt engineering. Built for power users.**

![Main UI](assets/screenshots/main_ui.png)

[日本語の概要は下にあります]

test from here: https://f4st357.github.io/Gen_Ai_Normalizer_For_Power_Users/

---

## 🚀 About
GANFPU is a lightweight, local-only developer tool designed to **standardize prompt engineering workflows**. By separating logic, data, and presentation, it provides a consistent framework for creating high-quality, high-reliability AI prompts.

---

## ✨ Key Features

### 1. Structured Composition
![Structured Composition](assets/screenshots/screenshots_1.png)
Define your role, tasks, contexts, and constraints in a clean, guided interface. This ensures that every prompt you build follows industry best practices.

### 2. Powerful Template Management
![Template Management](assets/screenshots/screenshots_2.png)
Manage dozens of prompts with ease. Categorize by Business, Writing, or Research, and switch between localized templates instantly.

### 3. Real-time Quality Score
![Quality Score](assets/screenshots/screenshots_3.png)
Get instant feedback on your prompt's richness. The tool analyzes your inputs to provide a "Quality Score," helping you craft more robust interactions with AI models.

---

## 🛠 Technical Highlights
- **Local-First Architecture:** Your sensitive prompts stay on your machine (Local Storage).
- **Multi-Language Engine:** Seamlessly switch between 6+ languages (JA, EN, ZH, KO, ES, FR).
- **Markdown & YAML:** Templates are stored as Markdown files with YAML frontmatter—perfect for version control.
- **For Power Users:** Minimalistic, high-contrast, cyberpunk-inspired UI designed for rapid iteration.
---
Use Cases

Use GitHub as Your Personal Prompt Cloud
Create a private repository and store your exported prompt files there. Free, version-controlled, and accessible from any device — no extra setup required.
	1.	Export your prompts from GANFPU
	2.	Push them to a private GitHub repository
	3.	Download and import on any device, anytime​​​​​​​​​​​​​​​​
---

## 📦 How to Run
Since the application uses `fetch` to load local Markdown/JSON configuration, a web server is required.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/f4sT357/ganfpu.git
   cd ganfpu
   ```

2. **Run a local server:**
   ```bash
   # Using node.js 'serve'
   npx serve .

   # Or using Python
   python -m http.server 3000
   ```

3. **Open the browser:**  
   Visit `http://localhost:3000/index.html` (or `http://localhost:3000/` if using GitHub Pages)

---

## 🇯🇵 日本語概要
GANFPU は、プロンプト作成を標準化し、品質のバラつきを抑えるためのローカル完結型ソフトウェアです。
パワーユーザー向けに設計されており、Markdown/YAML形式のテンプレート管理や多言語UI（6言語対応）を特徴としています。
プロンプトの構成要素（役割、タスク、制約、出力形式など）を体系的に定義することで、誰でも高い品質の回答をAIから引き出すことが可能になります。

---

## 🤝 Contributing
Contributions, bug reports, and improvement ideas are highly welcome! 
Feel free to open an Issue or PR. Spread the word and help us build the standard for prompt engineering.

**License:** MIT
