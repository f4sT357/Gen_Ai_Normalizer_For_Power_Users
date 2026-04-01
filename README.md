# Prompt Forge 2 (Modular)

A powerful, modular AI prompt composition assistant. 

## Features
- **Modular Data**: UI translations in `data/i18n.json` and templates in `data/templates/*.md`.
- **Quality Score**: Real-time feedback on prompt richness.
- **Multilingual Support**: Supports 6 languages (JA, EN, ZH, KO, ES, FR).
- **Template Management**: Save, load, and categorize prompts with Markdown support.

## How to use
Run a local web server (e.g., `npx serve .`) and visit the URL. 
CORS will prevent standard browser opening of the files if they are not served.

## Development
Edit `index.html`, `style.css`, and `app.js`. For content updates, modify the `data/` folder.
