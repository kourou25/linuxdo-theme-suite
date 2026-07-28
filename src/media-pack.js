import { THEME_KEYS } from "./theme-registry.js";

const MANIFEST_NAME = "manifest.json";
const MEDIA_KINDS = Object.freeze(["image", "video"]);

export function normalizeMediaPackPath(value) {
  const path = String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
  const parts = path.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error(`素材路径无效：${value}`);
  }
  return parts.join("/");
}

export function validateMediaPackManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("素材包 manifest.json 必须是对象。");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("素材包清单版本不受支持。");
  }
  if (!value.packId || typeof value.packId !== "string") {
    throw new Error("素材包缺少 packId。");
  }
  if (!value.version || typeof value.version !== "string") {
    throw new Error("素材包缺少 version。");
  }
  if (!value.themes || typeof value.themes !== "object") {
    throw new Error("素材包缺少 themes。");
  }

  for (const [theme, media] of Object.entries(value.themes)) {
    if (!THEME_KEYS.includes(theme)) {
      throw new Error(`素材包包含未知主题：${theme}`);
    }
    if (!media || typeof media !== "object") {
      throw new Error(`主题 ${theme} 的资源定义无效。`);
    }
    if (!MEDIA_KINDS.some((kind) => media[kind])) {
      throw new Error(`主题 ${theme} 没有可导入资源。`);
    }
    for (const kind of MEDIA_KINDS) {
      if (!media[kind]) continue;
      const path = normalizeMediaPackPath(media[kind]);
      if (
        (kind === "image" && !/\.(?:jpe?g|png|webp|gif)$/i.test(path)) ||
        (kind === "video" && !/\.(?:mp4|webm)$/i.test(path))
      ) {
        throw new Error(`主题 ${theme} 的 ${kind} 文件格式不受支持。`);
      }
    }
  }

  return value;
}

export function createMediaFileIndex(files) {
  const index = new Map();
  for (const file of Array.from(files ?? [])) {
    const rawPath = file.webkitRelativePath || file.name;
    const normalized = normalizeMediaPackPath(rawPath);
    index.set(normalized, file);
    const separator = normalized.indexOf("/");
    if (separator >= 0) {
      index.set(normalized.slice(separator + 1), file);
    }
  }
  return index;
}

export async function parseMediaPackFiles(
  files,
  { manifest: suppliedManifest, manifestFile: suppliedManifestFile } = {},
) {
  const list = Array.from(files ?? []);
  const manifestFile =
    suppliedManifestFile ??
    list.find(
      (file) =>
        file.name?.toLowerCase() === MANIFEST_NAME ||
        String(file.webkitRelativePath)
          .toLowerCase()
          .endsWith(`/${MANIFEST_NAME}`),
    );
  if (!manifestFile) {
    throw new Error("所选目录中没有 manifest.json。");
  }

  let manifest = suppliedManifest;
  if (!manifest) {
    try {
      manifest = JSON.parse(await manifestFile.text());
    } catch {
      throw new Error("manifest.json 不是有效 JSON。");
    }
  }
  validateMediaPackManifest(manifest);

  const index = createMediaFileIndex(list);
  const manifestPath = normalizeMediaPackPath(
    manifestFile.webkitRelativePath || manifestFile.name,
  );
  const separator = manifestPath.lastIndexOf("/");
  const manifestRoot =
    separator >= 0 ? manifestPath.slice(0, separator + 1) : "";
  const assets = [];

  for (const [theme, media] of Object.entries(manifest.themes)) {
    for (const kind of MEDIA_KINDS) {
      if (!media[kind]) continue;
      const relativePath = normalizeMediaPackPath(media[kind]);
      const file =
        index.get(`${manifestRoot}${relativePath}`) ?? index.get(relativePath);
      if (!file) {
        throw new Error(`素材包缺少文件：${relativePath}`);
      }
      assets.push({ theme, kind, path: relativePath, file });
    }
  }

  return { manifest, assets };
}
