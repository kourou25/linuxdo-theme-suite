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

  function releaseUrls() {
    if (backgroundUrl) revokeObjectURL(backgroundUrl);
    if (companionUrl) revokeObjectURL(companionUrl);
    backgroundUrl = null;
    companionUrl = null;
  }

  function clearView({ removeCompanion = false } = {}) {
    releaseUrls();
    root.style.removeProperty("--ld-hero-draw-image");
    root.dataset.ldHeroActive = "false";
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

  async function applySelection(backgroundId, companionId) {
    const requestedRevision = ++revision;
    const [backgroundAsset, companionAsset] = await Promise.all([
      getHeroAsset(backgroundId, "background"),
      getHeroAsset(companionId, "companion"),
    ]);
    if (requestedRevision !== revision) return state;
    if (!backgroundAsset?.blob || !companionAsset?.blob) {
      throw new Error("当前英雄素材不完整，请重新导入素材包。");
    }

    await beforeActivate?.();
    if (requestedRevision !== revision) return state;
    const nextBackgroundUrl = createObjectURL(backgroundAsset.blob);
    const nextCompanionUrl = createObjectURL(companionAsset.blob);
    releaseUrls();
    backgroundUrl = nextBackgroundUrl;
    companionUrl = nextCompanionUrl;
    root.style.setProperty(
      "--ld-hero-draw-image",
      `url("${backgroundUrl}")`,
    );
    root.dataset.ldHeroActive = "true";
    persistActive(true);
    const image = getCompanion();
    image.src = companionUrl;
    image.hidden = false;
    state = {
      backgroundId,
      companionId,
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
      availableCount: heroIds.length,
    };
    persistSelection(state);
    persistActive(false);
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
        availableCount: heroIds.length,
      };
      const active = getValue(
        ACTIVE_KEY,
        Boolean(storedBackground || storedCompanion),
      );
      if (active === false) {
        clearView();
        return { ...state };
      }
      return applySelection(backgroundId, companionId);
    },
    async drawAll() {
      await refreshIds();
      requireIds();
      const current =
        state.backgroundId === state.companionId
          ? state.backgroundId
          : null;
      const heroId = pickHeroId(heroIds, random, current);
      return applySelection(heroId, heroId);
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
      return applySelection(backgroundId, companionId);
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
      return applySelection(backgroundId, companionId);
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
        availableCount: 0,
      };
      persistSelection(state);
      persistActive(false);
      clearView({ removeCompanion: true });
    },
    disable() {
      revision += 1;
      persistActive(false);
      clearView();
      return { ...state };
    },
    maintain() {
      if (!companionUrl || root.dataset.ldHeroActive !== "true") return;
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
