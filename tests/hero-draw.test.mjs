import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseHeroPackFiles,
  validateHeroPackManifest,
} from "../src/hero-pack.js";
import {
  createHeroManager,
  pickHeroId,
} from "../src/hero-manager.js";
import { createThemePickerMarkup } from "../src/theme-picker.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function createManifest() {
  return {
    schemaVersion: 1,
    packType: "hero-draw",
    packId: "linuxdo-theme-suite-hero-draw",
    version: "0.7.0",
    heroes: {
      "001": {
        background: "backgrounds/hero-001-background.jpg",
        companion: "companions/hero-001-companion.png",
      },
      "009": {
        background: "backgrounds/hero-009-background.jpg",
        companion: "companions/hero-009-companion.png",
      },
    },
  };
}

test("英雄素材包只使用数字编号并同时提供背景与伙伴", async () => {
  const manifest = createManifest();
  assert.equal(validateHeroPackManifest(manifest).packType, "hero-draw");
  assert.throws(
    () =>
      validateHeroPackManifest({
        ...manifest,
        heroes: {
          emperor: manifest.heroes["001"],
        },
      }),
    /数字编号/,
  );
  assert.throws(
    () =>
      validateHeroPackManifest({
        ...manifest,
        heroes: {
          "001": {
            background: "backgrounds/hero-001-background.jpg",
          },
        },
      }),
    /背景与伙伴/,
  );

  const files = [
    {
      name: "manifest.json",
      webkitRelativePath: "hero-pack/manifest.json",
      async text() {
        return JSON.stringify(manifest);
      },
    },
    ...Object.values(manifest.heroes).flatMap((entry) =>
      Object.values(entry).map((relativePath) => ({
        name: relativePath.split("/").at(-1),
        webkitRelativePath: `hero-pack/${relativePath}`,
        type: relativePath.endsWith(".png") ? "image/png" : "image/jpeg",
      })),
    ),
  ];
  const parsed = await parseHeroPackFiles(files);
  assert.equal(parsed.heroIds.length, 2);
  assert.equal(parsed.assets.length, 4);
  assert.deepEqual(
    parsed.assets.map(({ heroId, kind }) => [heroId, kind]),
    [
      ["001", "background"],
      ["001", "companion"],
      ["009", "background"],
      ["009", "companion"],
    ],
  );
});

test("随机抽取在存在多个编号时避免立即重复", () => {
  assert.equal(pickHeroId(["001"], () => 0.9, "001"), "001");
  assert.equal(pickHeroId(["001", "009"], () => 0, "001"), "009");
  assert.equal(pickHeroId(["001", "009"], () => 0.99, "001"), "009");
  assert.equal(pickHeroId([], () => 0.5, null), null);
});

test("英雄管理器支持整套、仅背景、仅伙伴三种随机动作并释放旧 URL", async () => {
  const properties = new Map();
  const root = {
    dataset: {},
    style: {
      setProperty(name, value) {
        properties.set(name, value);
      },
      removeProperty(name) {
        properties.delete(name);
      },
    },
  };
  const companion = {
    hidden: true,
    src: "",
    removeCalled: false,
    remove() {
      this.removeCalled = true;
    },
  };
  const writes = [];
  const revoked = [];
  let beforeActivateCount = 0;
  let urlCounter = 0;
  const manager = createHeroManager({
    root,
    getValue(_key, fallback) {
      return fallback;
    },
    setValue(key, value) {
      writes.push([key, value]);
    },
    getHeroIds: async () => ["001", "009"],
    getHeroAsset: async (heroId, kind) => ({
      blob: { heroId, kind },
    }),
    createObjectURL(blob) {
      urlCounter += 1;
      return `blob:${blob.heroId}:${blob.kind}:${urlCounter}`;
    },
    revokeObjectURL(url) {
      revoked.push(url);
    },
    ensureCompanion: () => companion,
    beforeActivate() {
      beforeActivateCount += 1;
    },
    random: () => 0,
  });

  await manager.initialize();
  assert.deepEqual(manager.getState(), {
    backgroundId: "001",
    companionId: "001",
    availableCount: 2,
  });
  assert.equal(root.dataset.ldHeroActive, "true");
  assert.match(properties.get("--ld-hero-draw-image"), /blob:001:background/);
  assert.match(companion.src, /blob:001:companion/);
  assert.equal(beforeActivateCount, 1);

  await manager.drawAll();
  assert.deepEqual(manager.getState(), {
    backgroundId: "009",
    companionId: "009",
    availableCount: 2,
  });
  await manager.drawBackground();
  assert.equal(manager.getState().backgroundId, "001");
  assert.equal(manager.getState().companionId, "009");
  await manager.drawCompanion();
  assert.equal(manager.getState().backgroundId, "001");
  assert.equal(manager.getState().companionId, "001");
  assert.ok(revoked.length >= 4);
  assert.equal(beforeActivateCount, 4);
  assert.ok(writes.some(([key]) => key === "ld-hero-background-id"));
  assert.ok(writes.some(([key]) => key === "ld-hero-companion-id"));

  manager.disable();
  assert.equal(properties.has("--ld-hero-draw-image"), false);
  assert.equal(root.dataset.ldHeroActive, "false");
  assert.equal(companion.hidden, true);
  assert.deepEqual(manager.getState(), {
    backgroundId: "001",
    companionId: "001",
    availableCount: 2,
  });
  assert.ok(
    writes.some(
      ([key, value]) => key === "ld-hero-active" && value === false,
    ),
  );

  manager.dispose();
  assert.equal(companion.removeCalled, true);
  assert.equal(root.dataset.ldHeroActive, "false");
});

test("停用英雄后刷新保持普通主题模式，重新抽取才恢复英雄视图", async () => {
  const properties = new Map();
  const stored = new Map([
    ["ld-hero-background-id", "001"],
    ["ld-hero-companion-id", "001"],
    ["ld-hero-active", false],
  ]);
  const root = {
    dataset: {},
    style: {
      setProperty(name, value) {
        properties.set(name, value);
      },
      removeProperty(name) {
        properties.delete(name);
      },
    },
  };
  const companion = { hidden: true, src: "", isConnected: true };
  const manager = createHeroManager({
    root,
    getValue(key, fallback) {
      return stored.has(key) ? stored.get(key) : fallback;
    },
    setValue(key, value) {
      stored.set(key, value);
    },
    getHeroIds: async () => ["001", "009"],
    getHeroAsset: async (heroId, kind) => ({
      blob: { heroId, kind },
    }),
    createObjectURL: ({ heroId, kind }) => `blob:${heroId}:${kind}`,
    revokeObjectURL() {},
    ensureCompanion: () => companion,
    random: () => 0,
  });

  await manager.initialize();
  assert.equal(root.dataset.ldHeroActive, "false");
  assert.equal(properties.has("--ld-hero-draw-image"), false);
  assert.equal(companion.hidden, true);

  await manager.drawAll();
  assert.equal(root.dataset.ldHeroActive, "true");
  assert.match(properties.get("--ld-hero-draw-image"), /blob:009:background/);
  assert.equal(stored.get("ld-hero-active"), true);
});

test("导入统一素材包只登记英雄素材，不自动覆盖当前普通主题", async () => {
  const properties = new Map([
    ["--ld-hero-draw-image", 'url("blob:old-background")'],
  ]);
  const stored = new Map([["ld-hero-active", true]]);
  let assetReadCount = 0;
  const root = {
    dataset: { ldHeroActive: "true" },
    style: {
      setProperty(name, value) {
        properties.set(name, value);
      },
      removeProperty(name) {
        properties.delete(name);
      },
    },
  };
  const companion = {
    hidden: false,
    src: "blob:old-companion",
    isConnected: true,
  };
  const manager = createHeroManager({
    root,
    getValue(key, fallback) {
      return stored.has(key) ? stored.get(key) : fallback;
    },
    setValue(key, value) {
      stored.set(key, value);
    },
    saveHeroPack: async () => ({ stored: 4 }),
    getHeroIds: async () => ["001", "009"],
    getHeroAsset: async () => {
      assetReadCount += 1;
      return { blob: {} };
    },
    ensureCompanion: () => companion,
    createObjectURL: () => "blob:unexpected",
    revokeObjectURL() {},
  });

  await manager.initialize();
  assetReadCount = 0;
  const result = await manager.importPack({
    heroIds: ["001", "009"],
    assets: [],
  });

  assert.deepEqual(result, { stored: 4 });
  assert.equal(assetReadCount, 0);
  assert.equal(root.dataset.ldHeroActive, "false");
  assert.equal(properties.has("--ld-hero-draw-image"), false);
  assert.equal(companion.hidden, true);
  assert.equal(stored.get("ld-hero-active"), false);
  assert.deepEqual(manager.getState(), {
    backgroundId: null,
    companionId: null,
    availableCount: 2,
  });
});

test("主题面板只显示三个随机按钮，不显示英雄名称或手动选择列表", () => {
  const markup = createThemePickerMarkup("crimson-duo", 0.78);
  assert.match(markup, /抽取你的 L 站英雄/);
  assert.equal((markup.match(/data-ld-draw-(?:hero|background|companion)/g) ?? []).length, 3);
  assert.match(markup, />抽取英雄</);
  assert.match(markup, />只换背景</);
  assert.match(markup, />只换伙伴</);
  assert.doesNotMatch(markup, /data-ld-hero-option|英雄名称|始皇|始皇后/);
  assert.doesNotMatch(markup, /<select[^>]*data-ld-hero/);
});

test("本地存在发布伙伴素材时，尺寸统一且画布四角完全透明", (context) => {
  const companionRoot = path.join(
    projectRoot,
    "assets",
    "media-pack",
    "hero-draw",
    "v0.7.0",
    "companions",
  );
  if (!existsSync(companionRoot)) {
    context.skip("完整伙伴素材仅随 GitHub Release 提供");
    return;
  }
  const script = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.Drawing
    $files = @(Get-ChildItem -LiteralPath '${companionRoot.replaceAll("'", "''")}' -File)
    if ($files.Count -ne 16) { throw "expected 16 companions, got $($files.Count)" }
    foreach ($file in $files) {
      $image = [System.Drawing.Bitmap]::FromFile($file.FullName)
      try {
        if ($image.Width -ne 640 -or $image.Height -ne 640) {
          throw "invalid size: $($file.Name)"
        }
        $alphas = @(
          $image.GetPixel(0, 0).A,
          $image.GetPixel(639, 0).A,
          $image.GetPixel(0, 639).A,
          $image.GetPixel(639, 639).A
        )
        if (@($alphas | Where-Object { $_ -ne 0 }).Count -ne 0) {
          throw "opaque corner: $($file.Name) [$($alphas -join ',')]"
        }
      } finally {
        $image.Dispose()
      }
    }
  `;
  const result = spawnSync("pwsh", ["-NoProfile", "-Command", script], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
