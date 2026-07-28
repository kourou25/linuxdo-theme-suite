import { createThemeController } from "./runtime.js";
import { mountThemePicker } from "./theme-picker.js";
import { createMediaManager } from "./media-manager.js";
import { createHeroManager } from "./hero-manager.js";

const mediaManager = createMediaManager({ document });
const heroManager = createHeroManager({
  root: document.documentElement,
  document,
  getValue: GM_getValue,
  setValue: GM_setValue,
  beforeActivate: () => mediaManager.suspend(),
});
const controller = createThemeController({
  root: document.documentElement,
  getValue: GM_getValue,
  setValue: GM_setValue,
  onChange(state) {
    mediaManager.apply(state).catch(() => {});
  },
});

controller.initialize();

let observer = null;

function startThemePicker() {
  heroManager.initialize().catch(() => {});
  mountThemePicker({
    document,
    controller,
    mediaManager,
    heroManager,
    getValue: GM_getValue,
    setValue: GM_setValue,
  });

  let mountScheduled = false;
  observer = new MutationObserver(() => {
    mediaManager.maintain().catch(() => {});
    heroManager.maintain();
    if (document.getElementById("ld-theme-suite-root") || mountScheduled) {
      return;
    }

    mountScheduled = true;
    requestAnimationFrame(() => {
      mountScheduled = false;
      mountThemePicker({
        document,
        controller,
        mediaManager,
        heroManager,
        getValue: GM_getValue,
        setValue: GM_setValue,
      });
    });
  });

  observer.observe(document.body, { childList: true });
}

globalThis.addEventListener(
  "pagehide",
  () => {
    observer?.disconnect();
    mediaManager.dispose();
    heroManager.dispose();
  },
  { once: true },
);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startThemePicker, {
    once: true,
  });
} else {
  startThemePicker();
}
