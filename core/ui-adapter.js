(() => {
  'use strict';

  // Compatibility bridge only.
  // grill-controller.js owns Core UI state and event binding.
  // Normal Mode uses these names while the legacy UI is being retired.
  function install() {
    const controller = window.ganfpuGrillController;
    if (!controller?.start || !controller?.apply) return false;

    window.ganfpuStartGrill = controller.start;
    window.ganfpuApplyGrillResult = controller.apply;
    return true;
  }

  function init() {
    if (install()) return;
    setTimeout(init, 0);
  }

  window.ganfpuCoreUI = Object.freeze({
    start: () => window.ganfpuGrillController?.start?.(),
    send: () => window.ganfpuGrillController?.send?.(),
    apply: () => window.ganfpuGrillController?.apply?.(),
    getState: () => window.ganfpuGrillController?.getState?.() || null
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
