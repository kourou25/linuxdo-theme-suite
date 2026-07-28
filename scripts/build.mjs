import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { THEME_KEYS } from "../src/theme-registry.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageMetadata = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);

const legacyAssetPaths = Object.freeze({
  __ASSET_CRIMSON_DUO__:
    "assets/generated/runtime/v0.6.0/theme-crimson-duo-white-safe.jpg",
  __ASSET_SHIKOTI_ROOM__:
    "assets/generated/runtime/v0.6.0/theme-shikoti-pink-room.jpg",
  __ASSET_ERII_SUNSET__:
    "assets/generated/runtime/v0.6.0/theme-erii-sunset-city.jpg",
  __ASSET_CORGI_SHOP__:
    "assets/generated/runtime/v0.6.0/theme-corgi-pet-shop.jpg",
  __ASSET_YAMADA_SKY__:
    "assets/generated/runtime/v0.6.0/theme-yamada-blue-sky.jpg",
  __ASSET_YAMADA_MANGA__:
    "assets/generated/runtime/v0.6.0/theme-yamada-manga-white.jpg",
  __ASSET_YAMADA_WINDOW__:
    "assets/generated/runtime/v0.6.0/theme-yamada-window.jpg",
  __ASSET_TAYAMA__:
    "assets/generated/runtime/v0.6.0/theme-tayama-fence.jpg",
  __ASSET_DJGUN_NOISE__:
    "assets/generated/runtime/v0.6.0/theme-djgun-noise.jpg",
  __ASSET_MIKU_MONITORING__:
    "assets/generated/runtime/v0.6.0/theme-miku-monitoring.jpg",
  __ASSET_ARONA_CLASSROOM__:
    "assets/generated/runtime/v0.6.0/theme-arona-classroom.jpg",
});

const legacyThemeKeys = Object.freeze([
  "crimson-duo",
  "shikoti-room",
  "erii-sunset",
  "corgi-shop",
  "yamada-sky",
  "yamada-manga",
  "yamada-window",
  "tayama",
  "djgun-noise",
  "miku-monitoring",
  "arona-classroom",
]);

function toAssetPlaceholder(themeKey) {
  return `__ASSET_${themeKey.replaceAll("-", "_").toUpperCase()}__`;
}

const expansionThemeKeys = Object.freeze(
  THEME_KEYS.filter((themeKey) => !legacyThemeKeys.includes(themeKey)),
);

const expansionAssetPaths = Object.freeze(
  Object.fromEntries(
    expansionThemeKeys.map((themeKey) => [
      toAssetPlaceholder(themeKey),
      `assets/generated/wallpaper-expansion/v0.8.0/runtime/images/${themeKey}.jpg`,
    ]),
  ),
);

const assetPaths = Object.freeze({
  ...legacyAssetPaths,
  ...expansionAssetPaths,
});

const expansionThemeStyles = expansionThemeKeys
  .map(
    (themeKey) =>
      `html[data-ld-theme="${themeKey}"] {\n` +
      `  --ld-bundled-hero-image: ${toAssetPlaceholder(themeKey)};\n` +
      "}",
  )
  .join("\n\n");

const sourceFiles = Object.freeze([
  "src/theme-registry.js",
  "src/runtime.js",
  "src/media-pack.js",
  "src/media-store.js",
  "src/media-manager.js",
  "src/hero-pack.js",
  "src/suite-pack.js",
  "src/hero-manager.js",
  "src/theme-picker.js",
  "src/entry.js",
]);

const variants = Object.freeze([
  {
    filename: "linuxdo-theme-suite.user.js",
    name: "LINUX DO Theme Suite",
    description: "为 LINUX DO 提供人物背景皮肤、随机英雄伙伴与本地素材包。",
    includeBundledAssets: true,
  },
  {
    filename: "linuxdo-theme-suite-core.user.js",
    name: "LINUX DO Theme Suite Core",
    description: "不内置第三方图片的 LINUX DO 主题核心，可导入主题与英雄素材包。",
    includeBundledAssets: false,
  },
]);

function stripModuleSyntax(source) {
  return source
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];\s*/g,
      "",
    )
    .replace(
      /\bexport\s+(?=(?:async\s+)?(?:const|function|class)\b)/g,
      "",
    );
}

async function readAssets() {
  const entries = [];
  let totalBytes = 0;

  for (const [placeholder, relativePath] of Object.entries(assetPaths)) {
    const absolutePath = path.join(projectRoot, relativePath);
    const info = await stat(absolutePath);
    if (!info.isFile() || info.size === 0) {
      throw new Error(`无效主题图片：${relativePath}`);
    }

    totalBytes += info.size;
    const bytes = await readFile(absolutePath);
    entries.push([
      placeholder,
      `data:image/jpeg;base64,${bytes.toString("base64")}`,
    ]);
  }

  if (totalBytes > 9_500_000) {
    throw new Error(`主题图片总体积超过 9.5 MB：${totalBytes}`);
  }

  return { entries, totalBytes };
}

async function build() {
  const template = await readFile(
    path.join(projectRoot, "src/userscript.template.js"),
    "utf8",
  );
  const sourceStyles =
    (await readFile(path.join(projectRoot, "src/styles.css"), "utf8")) +
    `\n\n${expansionThemeStyles}\n`;
  const { entries, totalBytes } = await readAssets();

  const sourceParts = [];
  for (const relativePath of sourceFiles) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    sourceParts.push(stripModuleSyntax(source).trim());
  }

  const outputDir = path.join(projectRoot, "dist");
  const fixtureDir = path.join(projectRoot, "tests", "fixtures");
  const fixtureStylesPath = path.join(fixtureDir, "runtime-styles.css");
  await mkdir(outputDir, { recursive: true });
  await mkdir(fixtureDir, { recursive: true });

  for (const variant of variants) {
    let styles = sourceStyles;
    for (const [placeholder, dataUrl] of entries) {
      if (!styles.includes(placeholder)) {
        throw new Error(`样式缺少图片占位符：${placeholder}`);
      }
      styles = styles.replaceAll(
        placeholder,
        variant.includeBundledAssets ? `url("${dataUrl}")` : "none",
      );
    }

    const output = template
      .replace("__USERSCRIPT_NAME__", variant.name)
      .replace("__USERSCRIPT_VERSION__", packageMetadata.version)
      .replace("__USERSCRIPT_DESCRIPTION__", variant.description)
      .replace("__STYLES_JSON__", () => JSON.stringify(styles))
      .replace("__SOURCE__", () => sourceParts.join("\n\n"));

    const unresolved = output.match(/__[A-Z0-9_]+__/g);
    if (unresolved) {
      throw new Error(`存在未替换占位符：${unresolved.join(", ")}`);
    }

    const outputPath = path.join(outputDir, variant.filename);
    await writeFile(outputPath, output, "utf8");
    const outputInfo = await stat(outputPath);
    process.stdout.write(
      [
        `主题资源：${variant.includeBundledAssets ? totalBytes : 0} bytes`,
        `UserScript：${outputInfo.size} bytes`,
        `输出：${outputPath}`,
      ].join("\n") + "\n",
    );

    if (variant.includeBundledAssets) {
      await writeFile(fixtureStylesPath, styles, "utf8");
    }
  }
}

await build();
