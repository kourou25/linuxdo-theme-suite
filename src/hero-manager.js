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

function normalizeHeroIds(value) {
  return [...new Set(Array.from(value ?? []).filter((id) => /^\d{3}$/.test(id)))]
    .sort();
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
}) {
  let heroIds = [];
  let backgroundUrl = null;
  let companionUrl = null;
  let companion = null;
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
      image.setAttribute("aria-hidden", "true");
      document.body.append(image);
    }
    return image;
  }

  function getCompanion() {
    if (!companion || companion.removeCalled || !companion.isConnected) {
      companion = (ensureCompanion ?? defaultEnsureCompanion)();
    }
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
      companion.removeAttribute?.("src");
      companion.src = "";
      companion.hidden = true;
      if (removeCompanion) {
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
    maintain() {
      if (!companionUrl || !state.companionVisible) return;
      const image = getCompanion();
      if (image.src !== companionUrl) image.src = companionUrl;
      image.hidden = false;
    },
    getState() {
      return { ...state };
    },
    dispose() {
      revision += 1;
      clearView({ removeCompanion: true });
    },
  };

  return manager;
}
