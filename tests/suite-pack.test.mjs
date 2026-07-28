import test from "node:test";
import assert from "node:assert/strict";

import {
  isSuitePackManifest,
  parseSuitePackFiles,
  validateSuitePackManifest,
} from "../src/suite-pack.js";
import { importSelectedPack } from "../src/theme-picker.js";

function createFile(root, path, type = "application/octet-stream") {
  return {
    name: path.split("/").at(-1),
    webkitRelativePath: `${root}/${path}`,
    type,
  };
}

function createManifest() {
  return {
    schemaVersion: 1,
    packType: "suite",
    packId: "linuxdo-theme-suite",
    version: "0.9.0",
    media: {
      themes: {
        "crimson-duo": {
          image: "images/crimson-duo.jpg",
          video: "videos/crimson-duo.mp4",
        },
      },
    },
    hero: {
      heroes: {
        "001": {
          background: "backgrounds/hero-001-background.jpg",
          companion: "companions/hero-001-companion.png",
        },
      },
    },
  };
}

test("统一素材包先完整校验主题与英雄资源再返回两个已解析子包", async () => {
  const manifest = createManifest();
  assert.equal(isSuitePackManifest(manifest), true);
  assert.equal(validateSuitePackManifest(manifest).packType, "suite");

  const files = [
    {
      name: "manifest.json",
      webkitRelativePath: "suite/manifest.json",
      async text() {
        return JSON.stringify(manifest);
      },
    },
    createFile("suite", "images/crimson-duo.jpg", "image/jpeg"),
    createFile("suite", "videos/crimson-duo.mp4", "video/mp4"),
    createFile("suite", "backgrounds/hero-001-background.jpg", "image/jpeg"),
    createFile("suite", "companions/hero-001-companion.png", "image/png"),
  ];
  const parsed = await parseSuitePackFiles(files);
  assert.equal(parsed.mediaPack.assets.length, 2);
  assert.equal(parsed.heroPack.assets.length, 2);
  assert.deepEqual(parsed.heroPack.heroIds, ["001"]);
});

test("统一素材包缺失任一子资源时整体拒绝", async () => {
  const manifest = createManifest();
  const files = [
    {
      name: "manifest.json",
      webkitRelativePath: "suite/manifest.json",
      async text() {
        return JSON.stringify(manifest);
      },
    },
    createFile("suite", "images/crimson-duo.jpg", "image/jpeg"),
    createFile("suite", "videos/crimson-duo.mp4", "video/mp4"),
    createFile("suite", "backgrounds/hero-001-background.jpg", "image/jpeg"),
  ];
  await assert.rejects(() => parseSuitePackFiles(files), /缺少文件/);
});

test("兼容导入旧版普通素材包时先退出随机英雄模式", async () => {
  const order = [];
  const manifest = {
    schemaVersion: 1,
    packId: "legacy-media-pack",
    version: "0.8.0",
    themes: {
      "crimson-duo": {
        image: "images/crimson-duo.jpg",
      },
    },
  };
  const files = [
    {
      name: "manifest.json",
      webkitRelativePath: "legacy/manifest.json",
      async text() {
        return JSON.stringify(manifest);
      },
    },
    createFile("legacy", "images/crimson-duo.jpg", "image/jpeg"),
  ];
  const result = await importSelectedPack(files, {
    heroManager: {
      disable() {
        order.push("disable-hero");
      },
    },
    mediaManager: {
      async importFiles(received) {
        order.push("import-media");
        assert.equal(received, files);
        return { count: 1 };
      },
    },
  });

  assert.deepEqual(order, ["disable-hero", "import-media"]);
  assert.deepEqual(result, { count: 1 });
});
