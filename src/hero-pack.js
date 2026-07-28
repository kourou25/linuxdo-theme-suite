import {
  createMediaFileIndex,
  normalizeMediaPackPath,
} from "./media-pack.js";

const HERO_MANIFEST_NAME = "manifest.json";
const HERO_KINDS = Object.freeze(["background", "companion"]);

export function isHeroPackManifest(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.packType === "hero-draw" &&
      value.heroes,
  );
}

export function validateHeroPackManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("英雄素材包 manifest.json 必须是对象。");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("英雄素材包清单版本不受支持。");
  }
  if (value.packType !== "hero-draw") {
    throw new Error("英雄素材包缺少 packType: hero-draw。");
  }
  if (!value.packId || typeof value.packId !== "string") {
    throw new Error("英雄素材包缺少 packId。");
  }
  if (!value.version || typeof value.version !== "string") {
    throw new Error("英雄素材包缺少 version。");
  }
  if (
    !value.heroes ||
    typeof value.heroes !== "object" ||
    Array.isArray(value.heroes) ||
    !Object.keys(value.heroes).length
  ) {
    throw new Error("英雄素材包缺少 heroes。");
  }

  for (const [heroId, assets] of Object.entries(value.heroes)) {
    if (!/^\d{3}$/.test(heroId)) {
      throw new Error(`英雄必须使用三位数字编号：${heroId}`);
    }
    if (
      !assets ||
      typeof assets !== "object" ||
      !assets.background ||
      !assets.companion
    ) {
      throw new Error(`英雄 ${heroId} 必须同时提供背景与伙伴。`);
    }
    const background = normalizeMediaPackPath(assets.background);
    const companion = normalizeMediaPackPath(assets.companion);
    if (!/\.(?:jpe?g|png|webp)$/i.test(background)) {
      throw new Error(`英雄 ${heroId} 的背景格式不受支持。`);
    }
    if (!/\.(?:png|webp)$/i.test(companion)) {
      throw new Error(`英雄 ${heroId} 的伙伴必须使用 PNG 或 WebP。`);
    }
  }

  return value;
}

function findManifestFile(files) {
  return Array.from(files ?? []).find(
    (file) =>
      file.name?.toLowerCase() === HERO_MANIFEST_NAME ||
      String(file.webkitRelativePath)
        .toLowerCase()
        .endsWith(`/${HERO_MANIFEST_NAME}`),
  );
}

export async function readPackManifest(files) {
  const manifestFile = findManifestFile(files);
  if (!manifestFile) {
    throw new Error("所选目录中没有 manifest.json。");
  }
  try {
    return {
      manifest: JSON.parse(await manifestFile.text()),
      manifestFile,
    };
  } catch {
    throw new Error("manifest.json 不是有效 JSON。");
  }
}

export async function parseHeroPackFiles(
  files,
  { manifest: suppliedManifest, manifestFile: suppliedManifestFile } = {},
) {
  const list = Array.from(files ?? []);
  let manifest = suppliedManifest;
  let manifestFile = suppliedManifestFile;
  if (!manifest || !manifestFile) {
    const detected = await readPackManifest(list);
    manifest ??= detected.manifest;
    manifestFile ??= detected.manifestFile;
  }
  validateHeroPackManifest(manifest);

  const index = createMediaFileIndex(list);
  const manifestPath = normalizeMediaPackPath(
    manifestFile.webkitRelativePath || manifestFile.name,
  );
  const separator = manifestPath.lastIndexOf("/");
  const manifestRoot =
    separator >= 0 ? manifestPath.slice(0, separator + 1) : "";
  const assets = [];
  const heroIds = Object.keys(manifest.heroes).sort();

  for (const heroId of heroIds) {
    for (const kind of HERO_KINDS) {
      const relativePath = normalizeMediaPackPath(
        manifest.heroes[heroId][kind],
      );
      const file =
        index.get(`${manifestRoot}${relativePath}`) ?? index.get(relativePath);
      if (!file) {
        throw new Error(`英雄素材包缺少文件：${relativePath}`);
      }
      assets.push({ heroId, kind, path: relativePath, file });
    }
  }

  return { manifest, heroIds, assets };
}
