from pathlib import Path

p = Path('grill-controller.js')
s = p.read_text()
old = """    window.closeGrillMe = () => {
      const modal = el('grillModal');
      if (modal) modal.style.display = 'none';
      grillMessages = [];
    };
    return true;
"""
new = """    window.closeGrillMe = () => {
      const modal = el('grillModal');
      if (modal) modal.style.display = 'none';
      grillMessages = [];
    };
    const closeButtons = [el('btn-grill-close'), document.querySelector('.modal-close-btn')];
    closeButtons.forEach((button) => {
      if (button) button.addEventListener('click', window.closeGrillMe);
    });
    return true;
"""
if old not in s:
    raise SystemExit('close handler insertion point not found')
s = s.replace(old, new, 1)
p.write_text(s)
