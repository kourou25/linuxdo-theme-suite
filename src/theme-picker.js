import { THEME_KEYS, THEMES } from "./theme-registry.js";
import {
  normalizeBackgroundOpacity,
  normalizeThemeKey,
} from "./runtime.js";
import {
  isHeroPackManifest,
  readPackManifest,
} from "./hero-pack.js";
import {
  isSuitePackManifest,
  parseSuitePackFiles,
} from "./suite-pack.js";

const PICKER_POSITION_KEY = "ld-picker-position";
const PICKER_EDGE_MARGIN = 12;
const PICKER_DRAG_THRESHOLD = 6;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizePickerPosition(
  value,
  viewport,
  triggerSize,
  margin = PICKER_EDGE_MARGIN,
) {
  let position = value;
  if (typeof position === "string") {
    try {
      position = JSON.parse(position);
    } catch {
      return null;
    }
  }
  if (
    !position ||
    !Number.isFinite(Number(position.x)) ||
    !Number.isFinite(Number(position.y))
  ) {
    return null;
  }

  const width = Math.max(0, Number(viewport?.width) || 0);
  const height = Math.max(0, Number(viewport?.height) || 0);
  const triggerWidth = Math.max(0, Number(triggerSize?.width) || 48);
  const triggerHeight = Math.max(0, Number(triggerSize?.height) || 48);
  const maxX = Math.max(margin, width - triggerWidth - margin);
  const maxY = Math.max(margin, height - triggerHeight - margin);

  return {
    x: Math.round(clamp(Number(position.x), margin, maxX)),
    y: Math.round(clamp(Number(position.y), margin, maxY)),
  };
}

export async function importSelectedPack(
  files,
  { mediaManager, heroManager },
) {
  const { manifest } = await readPackManifest(files);
  if (isSuitePackManifest(manifest)) {
    if (!mediaManager || !heroManager) {
      throw new Error("统一素材功能尚未初始化。");
    }
    const { mediaPack, heroPack } = await parseSuitePackFiles(files);
    const mediaResult = await mediaManager.importPack(mediaPack);
    const heroResult = await heroManager.importPack(heroPack);
    return {
      packId: manifest.packId,
      version: manifest.version,
      count: mediaResult.count + heroResult.count,
    };
  }
  if (isHeroPackManifest(manifest)) {
    if (!heroManager) throw new Error("英雄素材功能尚未初始化。");
    return heroManager.importFiles(files);
  }
  if (!mediaManager) throw new Error("主题素材功能尚未初始化。");
  heroManager?.disable?.();
  return mediaManager.importFiles(files);
}

export function createThemePickerMarkup(
  activeKey,
  backgroundOpacity,
  {
    motionEnabled = true,
    rotationEnabled = false,
    textColorEnabled = false,
    textColor = "#24343d",
  } = {},
) {
  const theme = normalizeThemeKey(activeKey);
  const opacity = normalizeBackgroundOpacity(backgroundOpacity);
  const options = THEME_KEYS.map((key) => {
    const item = THEMES[key];
    return `
      <button
        class="ld-theme-picker__option"
        type="button"
        data-ld-theme-option="${key}"
        aria-pressed="${key === theme}"
      >
        <span
          class="ld-theme-picker__swatch"
          aria-hidden="true"
          ${item.swatch ? `style="--ld-theme-swatch: ${item.swatch}"` : ""}
        ></span>
        <span>
          <strong>${item.label}</strong>
          <small>${item.description}</small>
        </span>
      </button>`;
  }).join("");

  return `
    <div class="ld-theme-picker" data-ld-picker-open="false">
      <button
        class="ld-theme-picker__trigger"
        type="button"
        aria-label="打开主题工具；拖动可移动"
        aria-expanded="false"
        aria-controls="ld-theme-picker-panel"
        title="点击打开，按住拖动"
      >
        <span aria-hidden="true">◐</span>
      </button>
      <section
        class="ld-theme-picker__panel"
        id="ld-theme-picker-panel"
        role="dialog"
        aria-labelledby="ld-theme-picker-title"
        hidden
      >
        <header>
          <div>
            <strong id="ld-theme-picker-title">主题工具</strong>
            <span>仅保存在当前浏览器</span>
          </div>
          <button
            class="ld-theme-picker__close"
            type="button"
            data-ld-close-picker
            aria-label="关闭主题工具"
          >×</button>
        </header>
        <div class="ld-theme-picker__options">${options}</div>
        <label class="ld-theme-picker__intensity">
          <span>背景强度</span>
          <input
            type="range"
            min="0.35"
            max="1"
            step="0.01"
            value="${opacity}"
            data-ld-background-opacity
          >
        </label>
        <div class="ld-theme-picker__settings">
          <label class="ld-theme-picker__setting">
            <span>
              <strong>刷新切换主题</strong>
              <small>每次完整刷新按顺序切换到下一套</small>
            </span>
            <input
              type="checkbox"
              data-ld-theme-rotation-enabled
              ${rotationEnabled ? "checked" : ""}
            >
          </label>
          <label class="ld-theme-picker__setting">
            <span>
              <strong>动态背景</strong>
              <small>有视频素材时启用；减少动态效果时自动停用</small>
            </span>
            <input
              type="checkbox"
              data-ld-motion-enabled
              ${motionEnabled ? "checked" : ""}
            >
          </label>
          <div class="ld-theme-picker__setting ld-theme-picker__color-setting">
            <span>
              <strong>自定义文字颜色</strong>
              <small>背景过亮时建议选择深色文字</small>
            </span>
            <span class="ld-theme-picker__color-controls">
              <input
                type="color"
                data-ld-text-color
                value="${textColor}"
                aria-label="文字颜色"
                ${textColorEnabled ? "" : "disabled"}
              >
              <input
                type="checkbox"
                aria-label="启用自定义文字颜色"
                data-ld-text-color-enabled
                ${textColorEnabled ? "checked" : ""}
              >
            </span>
          </div>
        </div>
        <section
          class="ld-theme-picker__hero-draw"
          aria-labelledby="ld-hero-draw-title"
        >
          <div>
            <strong id="ld-hero-draw-title">抽取你的 L 站英雄</strong>
            <small>不显示名单，每次随机组合</small>
          </div>
          <div class="ld-theme-picker__hero-actions">
            <button type="button" data-ld-draw-hero>抽取英雄</button>
            <button type="button" data-ld-draw-background>只换背景</button>
            <button type="button" data-ld-draw-companion>只换伙伴</button>
            <button type="button" data-ld-reset-companion-position>伙伴归位</button>
            <button type="button" data-ld-hide-companion>关闭伙伴</button>
          </div>
        </section>
        <div class="ld-theme-picker__media-actions">
          <input
            type="file"
            data-ld-media-pack
            accept=".json,image/*,video/mp4,video/webm"
            webkitdirectory
            multiple
            hidden
          >
          <button type="button" data-ld-import-media>导入统一素材包</button>
          <button type="button" data-ld-clear-media>清除本地素材</button>
        </div>
        <output class="ld-theme-picker__status" data-ld-media-status>
          素材仅保存在当前浏览器
        </output>
      </section>
    </div>`;
}

export function getThemeKeyFromTarget(target) {
  const option = target?.closest?.("[data-ld-theme-option]");
  const key = option?.dataset?.ldThemeOption;
  return THEME_KEYS.includes(key) ? key : null;
}

export function syncPickerState(
  root,
  activeKey,
  backgroundOpacity,
  {
    motionEnabled = true,
    rotationEnabled = false,
    textColorEnabled = false,
    textColor = "#24343d",
  } = {},
) {
  const theme = normalizeThemeKey(activeKey);
  for (const button of root.querySelectorAll("[data-ld-theme-option]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.ldThemeOption === theme),
    );
  }

  const range = root.querySelector("[data-ld-background-opacity]");
  if (range) {
    range.value = String(normalizeBackgroundOpacity(backgroundOpacity));
  }
  const motion = root.querySelector("[data-ld-motion-enabled]");
  if (motion) {
    motion.checked = Boolean(motionEnabled);
  }
  const rotation = root.querySelector("[data-ld-theme-rotation-enabled]");
  if (rotation) {
    rotation.checked = Boolean(rotationEnabled);
  }
  const textColorToggle = root.querySelector(
    "[data-ld-text-color-enabled]",
  );
  if (textColorToggle) {
    textColorToggle.checked = Boolean(textColorEnabled);
  }
  const textColorInput = root.querySelector("[data-ld-text-color]");
  if (textColorInput) {
    textColorInput.value = textColor;
    textColorInput.disabled = !textColorEnabled;
  }
}

export function mountThemePicker({
  document,
  controller,
  mediaManager,
  heroManager,
  getValue = () => null,
  setValue = () => {},
  view = globalThis,
}) {
  const existing = document.getElementById("ld-theme-suite-root");
  if (existing) {
    const state = controller.getState();
    syncPickerState(
      existing,
      state.theme,
      state.backgroundOpacity,
      state,
    );
    return existing;
  }

  const state = controller.getState();
  const host = document.createElement("div");
  host.id = "ld-theme-suite-root";
  host.innerHTML = createThemePickerMarkup(
    state.theme,
    state.backgroundOpacity,
    state,
  );
  document.body.append(host);

  const picker = host.querySelector(".ld-theme-picker");
  const trigger = host.querySelector(".ld-theme-picker__trigger");
  const panel = host.querySelector(".ld-theme-picker__panel");
  const closeButton = host.querySelector("[data-ld-close-picker]");
  const range = host.querySelector("[data-ld-background-opacity]");
  const motion = host.querySelector("[data-ld-motion-enabled]");
  const rotation = host.querySelector("[data-ld-theme-rotation-enabled]");
  const textColorToggle = host.querySelector(
    "[data-ld-text-color-enabled]",
  );
  const textColorInput = host.querySelector("[data-ld-text-color]");
  const mediaInput = host.querySelector("[data-ld-media-pack]");
  const importButton = host.querySelector("[data-ld-import-media]");
  const clearButton = host.querySelector("[data-ld-clear-media]");
  const drawHeroButton = host.querySelector("[data-ld-draw-hero]");
  const drawBackgroundButton = host.querySelector(
    "[data-ld-draw-background]",
  );
  const drawCompanionButton = host.querySelector(
    "[data-ld-draw-companion]",
  );
  const hideCompanionButton = host.querySelector(
    "[data-ld-hide-companion]",
  );
  const resetCompanionPositionButton = host.querySelector(
    "[data-ld-reset-companion-position]",
  );
  const status = host.querySelector("[data-ld-media-status]");
  let activeDrag = null;
  let suppressNextClick = false;

  function setStatus(message, type = "info") {
    if (!status) return;
    status.value = message;
    status.textContent = message;
    status.dataset.ldStatus = type;
  }

  function setOpen(open) {
    picker.dataset.ldPickerOpen = String(open);
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      positionPanel();
      closeButton?.focus?.();
    }
  }

  function getViewport() {
    return {
      width:
        Number(view?.innerWidth) ||
        Number(document.documentElement?.clientWidth) ||
        0,
      height:
        Number(view?.innerHeight) ||
        Number(document.documentElement?.clientHeight) ||
        0,
    };
  }

  function getTriggerSize() {
    const rect = trigger.getBoundingClientRect?.();
    return {
      width: Number(rect?.width) || Number(trigger.offsetWidth) || 48,
      height: Number(rect?.height) || Number(trigger.offsetHeight) || 48,
    };
  }

  function applyPickerPosition(value, { persist = false } = {}) {
    const position = normalizePickerPosition(
      value,
      getViewport(),
      getTriggerSize(),
    );
    if (!position || !host.style) return null;
    host.style.left = `${position.x}px`;
    host.style.top = `${position.y}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
    if (persist) setValue(PICKER_POSITION_KEY, position);
    return position;
  }

  function positionPanel() {
    if (panel.hidden || !panel.style) return;
    const viewport = getViewport();
    const hostRect = host.getBoundingClientRect?.();
    const triggerRect = trigger.getBoundingClientRect?.();
    const panelRect = panel.getBoundingClientRect?.();
    if (!hostRect || !triggerRect || !panelRect) return;

    const preferredLeft = triggerRect.right - panelRect.width;
    const left = clamp(
      preferredLeft,
      PICKER_EDGE_MARGIN,
      Math.max(
        PICKER_EDGE_MARGIN,
        viewport.width - panelRect.width - PICKER_EDGE_MARGIN,
      ),
    );
    const above = triggerRect.top - panelRect.height - 12;
    const below = triggerRect.bottom + 12;
    const preferredTop =
      above >= PICKER_EDGE_MARGIN ? above : below;
    const top = clamp(
      preferredTop,
      PICKER_EDGE_MARGIN,
      Math.max(
        PICKER_EDGE_MARGIN,
        viewport.height - panelRect.height - PICKER_EDGE_MARGIN,
      ),
    );

    panel.style.left = `${Math.round(left - hostRect.left)}px`;
    panel.style.top = `${Math.round(top - hostRect.top)}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  document.addEventListener("pointerdown", (event) => {
    if (panel.hidden || host.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || panel.hidden) return;
    setOpen(false);
    trigger.focus?.();
  });

  trigger.addEventListener("click", () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    setOpen(trigger.getAttribute("aria-expanded") !== "true");
  });

  closeButton?.addEventListener("click", () => {
    setOpen(false);
    trigger.focus?.();
  });

  trigger.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = host.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }
    activeDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      dragging: false,
    };
    trigger.setPointerCapture?.(event.pointerId);
  });

  trigger.addEventListener("pointermove", (event) => {
    if (
      !activeDrag ||
      (activeDrag.pointerId !== undefined &&
        event.pointerId !== activeDrag.pointerId)
    ) {
      return;
    }
    const deltaX = event.clientX - activeDrag.startX;
    const deltaY = event.clientY - activeDrag.startY;
    if (
      !activeDrag.dragging &&
      Math.hypot(deltaX, deltaY) < PICKER_DRAG_THRESHOLD
    ) {
      return;
    }
    activeDrag.dragging = true;
    picker.dataset.ldDragging = "true";
    event.preventDefault?.();
    applyPickerPosition({
      x: activeDrag.originX + deltaX,
      y: activeDrag.originY + deltaY,
    });
    if (!panel.hidden) positionPanel();
  });

  function finishDrag(event, { releaseCapture = true } = {}) {
    if (
      !activeDrag ||
      (activeDrag.pointerId !== undefined &&
        event.pointerId !== activeDrag.pointerId)
    ) {
      return;
    }
    const drag = activeDrag;
    activeDrag = null;
    delete picker.dataset.ldDragging;
    if (releaseCapture) {
      trigger.releasePointerCapture?.(event.pointerId);
    }
    if (drag.dragging) {
      const rect = host.getBoundingClientRect?.();
      if (rect) {
        applyPickerPosition(
          { x: rect.left, y: rect.top },
          { persist: true },
        );
      }
      suppressNextClick = true;
      view?.setTimeout?.(() => {
        suppressNextClick = false;
      }, 400);
    }
  }

  trigger.addEventListener("pointerup", finishDrag);
  trigger.addEventListener("pointercancel", finishDrag);
  trigger.addEventListener("lostpointercapture", (event) => {
    finishDrag(event, { releaseCapture: false });
  });

  host.addEventListener("click", (event) => {
    const key = getThemeKeyFromTarget(event.target);
    if (!key) return;
    heroManager?.disable?.();
    const nextState = controller.setTheme(key);
    syncPickerState(
      host,
      nextState.theme,
      nextState.backgroundOpacity,
      nextState,
    );
    setOpen(false);
    trigger.focus?.();
  });

  range?.addEventListener("input", (event) => {
    const nextState = controller.setBackgroundOpacity(event.target.value);
    syncPickerState(
      host,
      nextState.theme,
      nextState.backgroundOpacity,
      nextState,
    );
  });

  motion?.addEventListener("change", (event) => {
    const nextState = controller.setMotionEnabled(event.target.checked);
    syncPickerState(
      host,
      nextState.theme,
      nextState.backgroundOpacity,
      nextState,
    );
  });

  rotation?.addEventListener("change", (event) => {
    const nextState = controller.setRotationEnabled(event.target.checked);
    syncPickerState(
      host,
      nextState.theme,
      nextState.backgroundOpacity,
      nextState,
    );
  });

  textColorToggle?.addEventListener("change", (event) => {
    const nextState = controller.setTextColorEnabled(event.target.checked);
    syncPickerState(
      host,
      nextState.theme,
      nextState.backgroundOpacity,
      nextState,
    );
  });

  textColorInput?.addEventListener("input", (event) => {
    const nextState = controller.setTextColor(event.target.value);
    syncPickerState(
      host,
      nextState.theme,
      nextState.backgroundOpacity,
      nextState,
    );
  });

  importButton?.addEventListener("click", () => mediaInput?.click());
  mediaInput?.addEventListener("change", async (event) => {
    if (!event.target.files?.length) return;
    setStatus("正在导入素材包…");
    try {
      const result = await importSelectedPack(event.target.files, {
        mediaManager,
        heroManager,
      });
      setStatus(`已导入 ${result.count} 个资源`, "success");
    } catch (error) {
      setStatus(error?.message || "素材包导入失败。", "error");
    } finally {
      event.target.value = "";
    }
  });
  clearButton?.addEventListener("click", async () => {
    if (!mediaManager && !heroManager) return;
    setStatus("正在清除本地素材…");
    try {
      await Promise.all([
        mediaManager?.clear(),
        heroManager?.clear(),
      ]);
      setStatus("本地素材已清除", "success");
    } catch (error) {
      setStatus(error?.message || "本地素材清除失败。", "error");
    }
  });

  async function drawHero(method, pendingMessage) {
    if (!heroManager) {
      setStatus("英雄素材功能尚未初始化。", "error");
      return;
    }
    setStatus(pendingMessage);
    try {
      if (method !== "drawCompanion") {
        mediaManager?.suspend?.();
      }
      await heroManager[method]();
      setStatus("抽取完成", "success");
    } catch (error) {
      setStatus(error?.message || "抽取失败。", "error");
    }
  }

  drawHeroButton?.addEventListener("click", () => {
    drawHero("drawAll", "正在抽取背景与伙伴…");
  });
  drawBackgroundButton?.addEventListener("click", () => {
    drawHero("drawBackground", "正在更换背景…");
  });
  drawCompanionButton?.addEventListener("click", () => {
    drawHero("drawCompanion", "正在更换伙伴…");
  });
  hideCompanionButton?.addEventListener("click", () => {
    if (!heroManager?.hideCompanion) {
      setStatus("伙伴功能尚未初始化。", "error");
      return;
    }
    heroManager.hideCompanion();
    setStatus("伙伴已关闭", "success");
  });
  resetCompanionPositionButton?.addEventListener("click", () => {
    if (!heroManager?.resetCompanionPosition) {
      setStatus("伙伴功能尚未初始化。", "error");
      return;
    }
    heroManager.resetCompanionPosition();
    setStatus("伙伴已回到默认位置", "success");
  });

  applyPickerPosition(getValue(PICKER_POSITION_KEY, null));
  view?.addEventListener?.("resize", () => {
    const rect = host.getBoundingClientRect?.();
    if (!rect || host.style?.left === "") return;
    applyPickerPosition(
      { x: rect.left, y: rect.top },
      { persist: true },
    );
    if (!panel.hidden) positionPanel();
  });

  return host;
}
