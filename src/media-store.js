const DATABASE_NAME = "linuxdo-theme-suite";
const DATABASE_VERSION = 1;
const STORE_NAME = "media-assets";
const HERO_INDEX_KEY = "hero:index";

function assetKey(theme, kind) {
  return `${theme}:${kind}`;
}

function heroAssetKey(heroId, kind) {
  return `hero:${heroId}:${kind}`;
}

export function isMediaAssetKey(key) {
  return typeof key === "string" && !key.startsWith("hero:");
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("本地素材数据库操作失败。")),
      { once: true },
    );
  });
}

export function openMediaDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) {
    return Promise.reject(new Error("当前浏览器不支持 IndexedDB。"));
  }
  const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME);
    }
  });
  return requestResult(request);
}

async function withStore(mode, operation) {
  const database = await openMediaDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await operation(store);
    await new Promise((resolve, reject) => {
      transaction.addEventListener("complete", resolve, { once: true });
      transaction.addEventListener(
        "error",
        () => reject(transaction.error),
        { once: true },
      );
      transaction.addEventListener(
        "abort",
        () => reject(transaction.error),
        { once: true },
      );
    });
    return result;
  } finally {
    database.close();
  }
}

export function getStoredMediaAsset(theme, kind) {
  return withStore("readonly", (store) =>
    requestResult(store.get(assetKey(theme, kind))),
  );
}

export function storeMediaAssets(pack) {
  return withStore("readwrite", async (store) => {
    for (const asset of pack.assets) {
      store.put(
        {
          blob: asset.file,
          packId: pack.manifest.packId,
          packVersion: pack.manifest.version,
          path: asset.path,
          type: asset.file.type,
          updatedAt: Date.now(),
        },
        assetKey(asset.theme, asset.kind),
      );
    }
    return {
      packId: pack.manifest.packId,
      version: pack.manifest.version,
      count: pack.assets.length,
    };
  });
}

export function clearStoredMediaAssets() {
  return withStore("readwrite", async (store) => {
    const keys = await requestResult(store.getAllKeys());
    for (const key of keys.filter(isMediaAssetKey)) {
      store.delete(key);
    }
  });
}

export function getStoredHeroIds() {
  return withStore("readonly", async (store) => {
    const index = await requestResult(store.get(HERO_INDEX_KEY));
    return Array.isArray(index?.heroIds) ? index.heroIds : [];
  });
}

export function getStoredHeroAsset(heroId, kind) {
  return withStore("readonly", (store) =>
    requestResult(store.get(heroAssetKey(heroId, kind))),
  );
}

export function storeHeroAssets(pack) {
  return withStore("readwrite", async (store) => {
    const previous = await requestResult(store.get(HERO_INDEX_KEY));
    for (const heroId of previous?.heroIds ?? []) {
      store.delete(heroAssetKey(heroId, "background"));
      store.delete(heroAssetKey(heroId, "companion"));
    }
    for (const asset of pack.assets) {
      store.put(
        {
          blob: asset.file,
          packId: pack.manifest.packId,
          packVersion: pack.manifest.version,
          path: asset.path,
          type: asset.file.type,
          updatedAt: Date.now(),
        },
        heroAssetKey(asset.heroId, asset.kind),
      );
    }
    store.put(
      {
        heroIds: pack.heroIds,
        packId: pack.manifest.packId,
        packVersion: pack.manifest.version,
        updatedAt: Date.now(),
      },
      HERO_INDEX_KEY,
    );
    return {
      packId: pack.manifest.packId,
      version: pack.manifest.version,
      count: pack.assets.length,
    };
  });
}

export function clearStoredHeroAssets() {
  return withStore("readwrite", async (store) => {
    const index = await requestResult(store.get(HERO_INDEX_KEY));
    for (const heroId of index?.heroIds ?? []) {
      store.delete(heroAssetKey(heroId, "background"));
      store.delete(heroAssetKey(heroId, "companion"));
    }
    store.delete(HERO_INDEX_KEY);
  });
}
