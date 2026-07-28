import { parseHeroPackFiles } from "./hero-pack.js";
import {
  clearStoredHeroAssets,
  getStoredHeroAsset,
  getStoredHeroIds,
  storeHeroAssets,
} from "./media-store.js";

const BACKGROUND_KEY = "ld-hero-background-id";
const COMPANION_KEY = "ld-hero-companion-id";
const ACTIVE_KEY = "ld-hero-active";
const COMPANION_VISIBLE_KEY = "ld-hero-companion-visible";
const COMPANION_POSITION_KEY = "ld-hero-companion-position";
const COMPANION_EDGE_MARGIN = 12;
const COMPANION_DRAG_THRESHOLD = 6;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeHeroIds(value) {
  return [...new Set(Array.from(value ?? []).filter((id) => /^\d{3}$/.test(id)))]
    .sort();
}

export function normalizeCompanionPosition(
  value,
  viewport,
  companionSize,
  margin = COMPANION_EDGE_MARGIN,
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
  const companionWidth = Math.max(
    0,
    Number(companionSize?.width) || 160,
  );
  const companionHeight = Math.max(
    0,
    Number(companionSize?.height) || 200,
  );
  const maxX = Math.max(margin, width - companionWidth - margin);
  const maxY = Math.max(margin, height - companionHeight - margin);

  return {
    x: Math.round(clamp(Number(position.x), margin, maxX)),
    y: Math.round(clamp(Number(position.y), margin, maxY)),
  };
}

export function pickHeroId(heroIds, random = Math.random, currentId = null) {
  const ids = normalizeHeroIds(heroIds);
  if (!ids.length) return null;
  const candidates =
    ids.length > 1 ? ids.filter((id) => id !== currentId) : ids;
  const sample = Number(random());
  const normalized = Number.isFinite(sample)
    ? Math.min(0.999999, Math.max(0, sample))
    : 0;
  return candidates[Math.floor(normalized * candidates.length)] ?? candidates[0];
}

export function createHeroManager({
  root,
  document = globalThis.document,
  getValue = () => null,
  setValue = () => {},
  getHeroIds = getStoredHeroIds,
  getHeroAsset = getStoredHeroAsset,
  saveHeroPack = storeHeroAssets,
  clearHeroPack = clearStoredHeroAssets,
  createObjectURL = URL.createObjectURL.bind(URL),
  revokeObjectURL = URL.revokeObjectURL.bind(URL),
  ensureCompanion,
  beforeActivate,
  random = Math.random,
  view = globalThis,
}) {
  let heroIds = [];
  let backgroundUrl = null;
  let companionUrl = null;
  let companion = null;
  let configuredCompanion = null;
  let companionCleanup = null;
  let companionPosition = null;
  let activeCompanionDrag = null;
  let revision = 0;
  let state = {
    backgroundId: null,
    companionId: null,
    companionVisible: false,
    availableCount: 0,
  };

  function defaultEnsureCompanion() {
    let image = document?.getElementById?.("ld-hero-companion");
    if (!image) {
      image = document.createElement("img");
      image.id = "ld-hero-companion";
      image.alt = "";
      image.decoding = "async";
      document.body.append(image);
    }
    return image;
  }

  function getViewport() {
    return {
      width:
        Number(view?.innerWidth) ||
        Number(document?.documentElement?.clientWidth) ||
        0,
      height:
        Number(view?.innerHeight) ||
        Number(document?.documentElement?.clientHeight) ||
        0,
    };
  }

  function getCompanionSize(image = companion) {
    const rect = image?.getBoundingClientRect?.();
    return {
      width: Number(rect?.width) || Number(image?.offsetWidth) || 160,
      height: Number(rect?.height) || Number(image?.offsetHeight) || 200,
    };
  }

  function applyCompanionPosition(
    value,
    { persist = false, target = companion } = {},
  ) {
    if (!target?.style) return null;
    const position = normalizeCompanionPosition(
      value,
      getViewport(),
      getCompanionSize(target),
    );
    if (!position) return null;
    target.style.left = `${position.x}px`;
    target.style.top = `${position.y}px`;
    target.style.right = "auto";
    target.style.bottom = "auto";
    companionPosition = position;
    if (persist) setValue(COMPANION_POSITION_KEY, position);
    return position;
  }

  function clearCompanionPositionStyle(target = companion) {
    if (!target?.style) return;
    for (const property of ["left", "top", "right", "bottom"]) {
      target.style.removeProperty?.(property);
      if (target.style[property] !== undefined) {
        target.style[property] = "";
      }
    }
  }

  function detachCompanionInteractions() {
    companionCleanup?.();
    companionCleanup = null;
    configuredCompanion = null;
    activeCompanionDrag = null;
  }

  function configureCompanion(image) {
    if (!image || configuredCompanion === image) return;
    detachCompanionInteractions();
    configuredCompanion = image;
    image.draggable = false;
    image.setAttribute?.("draggable", "false");
    image.setAttribute?.("role", "img");
    image.setAttribute?.("tabindex", "0");
    image.setAttribute?.(
      "aria-label",
      "伙伴；拖动或使用方向键可移动",
    );
    image.setAttribute?.("title", "拖动或使用方向键可移动");
    image.removeAttribute?.("aria-hidden");

    const storedPosition =
      companionPosition ?? getValue(COMPANION_POSITION_KEY, null);
    applyCompanionPosition(storedPosition, { target: image });

    if (!image.addEventListener) {
      companionCleanup = () => {};
      return;
    }

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = image.getBoundingClientRect?.();
      if (
        !rect ||
        !Number.isFinite(event.clientX) ||
        !Number.isFinite(event.clientY)
      ) {
        return;
      }
      activeCompanionDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: rect.left,
        originY: rect.top,
        dragging: false,
      };
      image.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (
        !activeCompanionDrag ||
        (activeCompanionDrag.pointerId !== undefined &&
          event.pointerId !== activeCompanionDrag.pointerId)
      ) {
        return;
      }
      const deltaX = event.clientX - activeCompanionDrag.startX;
      const deltaY = event.clientY - activeCompanionDrag.startY;
      if (
        !activeCompanionDrag.dragging &&
        Math.hypot(deltaX, deltaY) < COMPANION_DRAG_THRESHOLD
      ) {
        return;
      }
      activeCompanionDrag.dragging = true;
      if (image.dataset) {
        image.dataset.ldDragging = "true";
      }
      event.preventDefault?.();
      applyCompanionPosition(
        {
          x: activeCompanionDrag.originX + deltaX,
          y: activeCompanionDrag.originY + deltaY,
        },
        { target: image },
      );
    };

    const finishDrag = (event, { releaseCapture = true } = {}) => {
      if (
        !activeCompanionDrag ||
        (activeCompanionDrag.pointerId !== undefined &&
          event.pointerId !== activeCompanionDrag.pointerId)
      ) {
        return;
      }
      const drag = activeCompanionDrag;
      activeCompanionDrag = null;
      if (image.dataset) delete image.dataset.ldDragging;
      if (releaseCapture) {
        image.releasePointerCapture?.(event.pointerId);
      }
      if (!drag.dragging) return;
      const rect = image.getBoundingClientRect?.();
      if (rect) {
        applyCompanionPosition(
          { x: rect.left, y: rect.top },
          { persist: true, target: image },
        );
      }
    };

    const onKeyDown = (event) => {
      const offsets = {
        ArrowLeft: [-16, 0],
        ArrowRight: [16, 0],
        ArrowUp: [0, -16],
        ArrowDown: [0, 16],
      };
      const offset = offsets[event.key];
      if (!offset) return;
      const rect = image.getBoundingClientRect?.();
      if (!rect) return;
      event.preventDefault?.();
      applyCompanionPosition(
        { x: rect.left + offset[0], y: rect.top + offset[1] },
        { persist: true, target: image },
      );
    };

    const onPointerUp = (event) => finishDrag(event);
    const onPointerCancel = (event) => finishDrag(event);
    const onLostPointerCapture = (event) =>
      finishDrag(event, { releaseCapture: false });
    const onDragStart = (event) => event.preventDefault?.();

    const bindings = [
      ["pointerdown", onPointerDown],
      ["pointermove", onPointerMove],
      ["pointerup", onPointerUp],
      ["pointercancel", onPointerCancel],
      ["lostpointercapture", onLostPointerCapture],
      ["keydown", onKeyDown],
      ["dragstart", onDragStart],
    ];
    for (const [type, listener] of bindings) {
      image.addEventListener(type, listener);
    }
    companionCleanup = () => {
      for (const [type, listener] of bindings) {
        image.removeEventListener?.(type, listener);
      }
    };
  }

  function getCompanion() {
    if (!companion || companion.removeCalled || !companion.isConnected) {
      detachCompanionInteractions();
      companion = (ensureCompanion ?? defaultEnsureCompanion)();
    }
    configureCompanion(companion);
    return companion;
  }

  function persistSelection(nextState) {
    setValue(BACKGROUND_KEY, nextState.backgroundId ?? "");
    setValue(COMPANION_KEY, nextState.companionId ?? "");
  }

  function persistActive(active) {
    setValue(ACTIVE_KEY, Boolean(active));
  }

  function persistCompanionVisible(visible) {
    setValue(COMPANION_VISIBLE_KEY, Boolean(visible));
  }

  function releaseBackgroundUrl() {
    if (backgroundUrl) revokeObjectURL(backgroundUrl);
    backgroundUrl = null;
  }

  function releaseCompanionUrl() {
    if (companionUrl) revokeObjectURL(companionUrl);
    companionUrl = null;
  }

  function clearBackgroundView() {
    releaseBackgroundUrl();
    root.style.removeProperty("--ld-hero-draw-image");
    root.dataset.ldHeroActive = "false";
  }

  function clearCompanionView({ removeCompanion = false } = {}) {
    releaseCompanionUrl();
    if (companion) {
      activeCompanionDrag = null;
      if (companion.dataset) {
        delete companion.dataset.ldDragging;
      }
      companion.removeAttribute?.("src");
      companion.src = "";
      companion.hidden = true;
      if (removeCompanion) {
        detachCompanionInteractions();
        companion.remove?.();
        companion = null;
      }
    }
  }

  function clearView({ removeCompanion = false } = {}) {
    clearBackgroundView();
    clearCompanionView({ removeCompanion });
  }

  async function applySelection(
    backgroundId,
    companionId,
    {
      activateBackground = true,
      showCompanion = true,
    } = {},
  ) {
    const requestedRevision = ++revision;
    const [backgroundAsset, companionAsset] = await Promise.all([
      activateBackground
        ? getHeroAsset(backgroundId, "background")
        : Promise.resolve(null),
      showCompanion
        ? getHeroAsset(companionId, "companion")
        : Promise.resolve(null),
    ]);
    if (requestedRevision !== revision) return state;
    if (
      (activateBackground && !backgroundAsset?.blob) ||
      (showCompanion && !companionAsset?.blob)
    ) {
      throw new Error("当前英雄素材不完整，请重新导入素材包。");
    }

    if (activateBackground) {
      await beforeActivate?.();
      if (requestedRevision !== revision) return state;
      const nextBackgroundUrl = createObjectURL(backgroundAsset.blob);
      releaseBackgroundUrl();
      backgroundUrl = nextBackgroundUrl;
      root.style.setProperty(
        "--ld-hero-draw-image",
        `url("${backgroundUrl}")`,
      );
      root.dataset.ldHeroActive = "true";
      persistActive(true);
    }

    if (showCompanion) {
      const nextCompanionUrl = createObjectURL(companionAsset.blob);
      releaseCompanionUrl();
      companionUrl = nextCompanionUrl;
      const image = getCompanion();
      image.src = companionUrl;
      image.hidden = false;
      persistCompanionVisible(true);
    }

    state = {
      backgroundId: activateBackground ? backgroundId : state.backgroundId,
      companionId: showCompanion ? companionId : state.companionId,
      companionVisible: showCompanion ? true : state.companionVisible,
      availableCount: heroIds.length,
    };
    persistSelection(state);
    return { ...state };
  }

  async function refreshIds() {
    heroIds = normalizeHeroIds(await getHeroIds());
    state = { ...state, availableCount: heroIds.length };
    return heroIds;
  }

  function handleViewportResize() {
    if (!companionPosition || !companion?.style) return;
    applyCompanionPosition(companionPosition, {
      persist: true,
      target: companion,
    });
  }

  view?.addEventListener?.("resize", handleViewportResize);

  function requireIds() {
    if (!heroIds.length) {
      throw new Error("请先导入英雄素材包。");
    }
  }

  async function importPack(pack) {
    const result = await saveHeroPack(pack);
    heroIds = normalizeHeroIds(pack.heroIds);
    revision += 1;
    state = {
      backgroundId: null,
      companionId: null,
      companionVisible: false,
      availableCount: heroIds.length,
    };
    persistSelection(state);
    persistActive(false);
    persistCompanionVisible(false);
    clearView();
    return result;
  }

  const manager = {
    async initialize() {
      await refreshIds();
      if (!heroIds.length) {
        clearView();
        return { ...state };
      }
      const storedBackground = getValue(BACKGROUND_KEY, heroIds[0]);
      const storedCompanion = getValue(COMPANION_KEY, heroIds[0]);
      const backgroundId = heroIds.includes(storedBackground)
        ? storedBackground
        : heroIds[0];
      const companionId = heroIds.includes(storedCompanion)
        ? storedCompanion
        : heroIds[0];
      state = {
        backgroundId,
        companionId,
        companionVisible: false,
        availableCount: heroIds.length,
      };
      const active = getValue(
        ACTIVE_KEY,
        Boolean(storedBackground || storedCompanion),
      );
      const companionVisible = getValue(
        COMPANION_VISIBLE_KEY,
        active !== false,
      );
      state = {
        ...state,
        companionVisible: companionVisible !== false,
      };
      if (active === false && companionVisible === false) {
        clearView();
        return { ...state };
      }
      return applySelection(backgroundId, companionId, {
        activateBackground: active !== false,
        showCompanion: companionVisible !== false,
      });
    },
    async drawAll() {
      await refreshIds();
      requireIds();
      const current =
        state.backgroundId === state.companionId
          ? state.backgroundId
          : null;
      const heroId = pickHeroId(heroIds, random, current);
      return applySelection(heroId, heroId, {
        activateBackground: true,
        showCompanion: true,
      });
    },
    async drawBackground() {
      await refreshIds();
      requireIds();
      const backgroundId = pickHeroId(
        heroIds,
        random,
        state.backgroundId,
      );
      const companionId = heroIds.includes(state.companionId)
        ? state.companionId
        : heroIds[0];
      return applySelection(backgroundId, companionId, {
        activateBackground: true,
        showCompanion: false,
      });
    },
    async drawCompanion() {
      await refreshIds();
      requireIds();
      const companionId = pickHeroId(
        heroIds,
        random,
        state.companionId,
      );
      const backgroundId = heroIds.includes(state.backgroundId)
        ? state.backgroundId
        : heroIds[0];
      return applySelection(backgroundId, companionId, {
        activateBackground: false,
        showCompanion: true,
      });
    },
    async importFiles(files) {
      const pack = await parseHeroPackFiles(files);
      return importPack(pack);
    },
    importPack,
    async clear() {
      revision += 1;
      await clearHeroPack();
      heroIds = [];
      state = {
        backgroundId: null,
        companionId: null,
        companionVisible: false,
        availableCount: 0,
      };
      persistSelection(state);
      persistActive(false);
      persistCompanionVisible(false);
      clearView({ removeCompanion: true });
    },
    disable() {
      revision += 1;
      persistActive(false);
      clearBackgroundView();
      return { ...state };
    },
    hideCompanion() {
      revision += 1;
      persistCompanionVisible(false);
      clearCompanionView();
      state = {
        ...state,
        companionVisible: false,
      };
      return { ...state };
    },
    resetCompanionPosition() {
      companionPosition = null;
      setValue(COMPANION_POSITION_KEY, "");
      clearCompanionPositionStyle();
      return null;
    },
    maintain() {
      if (!companionUrl || !state.companionVisible) return;
      const image = getCompanion();
      if (image.src !== companionUrl) image.src = companionUrl;
      image.hidden = false;
      if (
        companionPosition &&
        (image.style?.left !== `${companionPosition.x}px` ||
          image.style?.top !== `${companionPosition.y}px`)
      ) {
        applyCompanionPosition(companionPosition, { target: image });
      }
    },
    getState() {
      return { ...state };
    },
    dispose() {
      revision += 1;
      view?.removeEventListener?.("resize", handleViewportResize);
      clearView({ removeCompanion: true });
    },
  };

  return manager;
}
