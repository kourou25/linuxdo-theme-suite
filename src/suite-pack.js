import { parseHeroPackFiles } from "./hero-pack.js";
import { parseMediaPackFiles } from "./media-pack.js";
import { readPackManifest } from "./hero-pack.js";

export function isSuitePackManifest(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.packType === "suite",
  );
}

export function validateSuitePackManifest(value) {
  if (!isSuitePackManifest(value)) {
    throw new Error("统一素材包缺少 packType: suite。");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("统一素材包清单版本不受支持。");
  }
  if (!value.packId || typeof value.packId !== "string") {
    throw new Error("统一素材包缺少 packId。");
  }
  if (!value.version || typeof value.version !== "string") {
    throw new Error("统一素材包缺少 version。");
  }
  if (!value.media?.themes || typeof value.media.themes !== "object") {
    throw new Error("统一素材包缺少 media.themes。");
  }
  if (!value.hero?.heroes || typeof value.hero.heroes !== "object") {
    throw new Error("统一素材包缺少 hero.heroes。");
  }
  return value;
}

export async function parseSuitePackFiles(files) {
  const list = Array.from(files ?? []);
  const { manifest, manifestFile } = await readPackManifest(list);
  validateSuitePackManifest(manifest);

  const mediaManifest = {
    schemaVersion: 1,
    packId: `${manifest.packId}-media`,
    version: manifest.version,
    themes: manifest.media.themes,
  };
  const heroManifest = {
    schemaVersion: 1,
    packType: "hero-draw",
    packId: `${manifest.packId}-hero`,
    version: manifest.version,
    heroes: manifest.hero.heroes,
  };

  const [mediaPack, heroPack] = await Promise.all([
    parseMediaPackFiles(list, {
      manifest: mediaManifest,
      manifestFile,
    }),
    parseHeroPackFiles(list, {
      manifest: heroManifest,
      manifestFile,
    }),
  ]);

  return { manifest, mediaPack, heroPack };
}
