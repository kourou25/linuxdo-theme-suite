import test from "node:test";
import assert from "node:assert/strict";

import {
  THEME_KEYS,
  THEMES,
  getThemeDefinition,
} from "../src/theme-registry.js";
import {
  applyThemeToRoot,
  createThemeController,
  normalizeBackgroundOpacity,
  normalizeMotionEnabled,
  normalizeThemeKey,
} from "../src/runtime.js";
import {
  createMediaFileIndex,
  parseMediaPackFiles,
  validateMediaPackManifest,
} from "../src/media-pack.js";
import {
  createMediaManager,
  waitForDocumentBody,
} from "../src/media-manager.js";
import {
  createThemePickerMarkup,
  getThemeKeyFromTarget,
  mountThemePicker,
  normalizePickerPosition,
  syncPickerState,
} from "../src/theme-picker.js";

const EXPECTED_THEME_KEYS = [
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
];

const EXPANSION_THEME_KEYS = [
  "hinata-night",
  "sketch-twintail",
  "xinruyin-summer",
  "cloud-guitar",
  "pretty-girl",
  "yuki-ink",
  "sofa-midnight",
  "kisaki-summer",
  "cinderella-crystal",
  "summer-window",
  "chain-sunset",
  "mirror-cyan",
  "red-halo-sea",
  "lantern-blue",
  "misa-black-gold",
  "white-feather-shore",
  "palace-flock",
  "strawhat-sword",
  "leaf-shadow",
  "red-umbrella",
  "mist-boat",
  "mist-pagoda",
  "bamboo-wall",
  "water-angel",
  "carousel-duo",
  "train-duo",
  "forest-sword",
  "alpine-angel",
  "ocean-angel",
  "sky-headphones",
];

test("主题注册表包含原有主题与三十套保留的常规壁纸扩展", () => {
  assert.deepEqual(THEME_KEYS, [
    ...EXPECTED_THEME_KEYS,
    ...EXPANSION_THEME_KEYS,
  ]);
  assert.equal(Object.keys(THEMES).length, 41);
  assert.equal(
    Object.values(THEMES).filter((theme) => theme.scheme === "light").length,
    26,
  );
  assert.equal(
    Object.values(THEMES).filter((theme) => theme.scheme === "dark").length,
    15,
  );
  assert.equal(THEMES["miku-monitoring"].motion, true);
  assert.equal(THEMES["crimson-duo"].motion, false);
  assert.equal(THEMES["hinata-night"].motion, true);
  assert.equal(THEMES["summer-window"].motion, false);
  for (const key of EXPANSION_THEME_KEYS) {
    assert.equal(THEMES[key].fit, "cover");
    assert.equal(THEMES[key].bundled, true);
    assert.match(THEMES[key].position, /%|center/);
    assert.match(THEMES[key].swatch, /^#[0-9a-f]{6}$/i);
  }
  assert.equal(getThemeDefinition("unknown").key, "crimson-duo");
  assert.equal(THEMES["mountain-ink"], undefined);
  assert.equal(THEMES["rem-tea"], undefined);
});

test("未知或已删除主题回退到绯红双影主题", () => {
  assert.equal(normalizeThemeKey("unknown"), "crimson-duo");
  assert.equal(normalizeThemeKey(null), "crimson-duo");
  assert.equal(normalizeThemeKey("camellya-day"), "crimson-duo");
  assert.equal(normalizeThemeKey("crimson-duo"), "crimson-duo");
});

test("背景强度限制在 0.35 到 1 之间", () => {
  assert.equal(normalizeBackgroundOpacity(undefined), 0.78);
  assert.equal(normalizeBackgroundOpacity("0.6"), 0.6);
  assert.equal(normalizeBackgroundOpacity(0.1), 0.35);
  assert.equal(normalizeBackgroundOpacity(2), 1);
  assert.equal(normalizeBackgroundOpacity("invalid"), 0.78);
});

test("动态背景开关只接受明确布尔值", () => {
  assert.equal(normalizeMotionEnabled(true), true);
  assert.equal(normalizeMotionEnabled(false), false);
  assert.equal(normalizeMotionEnabled("false"), true);
  assert.equal(normalizeMotionEnabled(undefined), true);
});

test("主题应用同步 data 属性、color-scheme 与背景强度", () => {
  const properties = new Map();
  const root = {
    dataset: {},
    style: {
      colorScheme: "",
      setProperty(name, value) {
        properties.set(name, value);
      },
    },
  };

  const state = applyThemeToRoot(root, "crimson-duo", 0.64);

  assert.deepEqual(state, {
    theme: "crimson-duo",
    backgroundOpacity: 0.64,
  });
  assert.equal(root.dataset.ldTheme, "crimson-duo");
  assert.equal(root.dataset.ldScheme, "light");
  assert.equal(root.style.colorScheme, "light");
  assert.equal(properties.get("--ld-bg-opacity"), "0.64");
});

test("常规壁纸扩展同步调色板、安全显示模式和人物焦点", () => {
  const properties = new Map();
  const root = {
    dataset: {},
    style: {
      colorScheme: "",
      setProperty(name, value) {
        properties.set(name, value);
      },
      removeProperty(name) {
        properties.delete(name);
      },
    },
  };

  applyThemeToRoot(root, "sky-headphones", 0.78);

  assert.equal(root.dataset.ldPalette, "light-blue");
  assert.equal(root.dataset.ldScheme, "light");
  assert.equal(properties.get("--ld-media-fit"), "cover");
  assert.equal(properties.get("--ld-image-position"), "center top");
  assert.equal(properties.has("--ld-bundled-hero-image"), false);
  assert.equal(properties.get("--ld-accent"), "#315f9e");
});

test("背景强度同时控制内容面板透明度且最大档明显透出背景", () => {
  function applyAt(backgroundOpacity) {
    const properties = new Map();
    const root = {
      dataset: {},
      style: {
        colorScheme: "",
        setProperty(name, value) {
          properties.set(name, value);
        },
      },
    };
    applyThemeToRoot(root, "crimson-duo", backgroundOpacity);
    return properties;
  }

  const minimumStrength = applyAt(0.35);
  const defaultStrength = applyAt(0.78);
  const maximumStrength = applyAt(1);

  assert.equal(minimumStrength.get("--ld-panel-opacity"), "0.85");
  assert.equal(minimumStrength.get("--ld-panel-strong-opacity"), "0.96");
  assert.equal(minimumStrength.get("--ld-panel-soft-opacity"), "0.75");
  assert.equal(minimumStrength.get("--ld-panel-blur"), "18px");
  assert.equal(minimumStrength.get("--ld-panel-strong-blur"), "16px");
  assert.equal(minimumStrength.get("--ld-fade-mid-opacity"), "0.12");
  assert.equal(minimumStrength.get("--ld-fade-lower-opacity"), "0.59");
  assert.equal(minimumStrength.get("--ld-fade-end-opacity"), "0.98");

  assert.equal(defaultStrength.get("--ld-panel-opacity"), "0.42");
  assert.equal(defaultStrength.get("--ld-panel-strong-opacity"), "0.62");
  assert.equal(defaultStrength.get("--ld-panel-soft-opacity"), "0.32");
  assert.equal(defaultStrength.get("--ld-panel-blur"), "6px");
  assert.equal(defaultStrength.get("--ld-panel-strong-blur"), "5px");
  assert.equal(defaultStrength.get("--ld-fade-mid-opacity"), "0.04");
  assert.equal(defaultStrength.get("--ld-fade-lower-opacity"), "0.2");
  assert.equal(defaultStrength.get("--ld-fade-end-opacity"), "0.33");

  assert.equal(maximumStrength.get("--ld-panel-opacity"), "0.2");
  assert.equal(maximumStrength.get("--ld-panel-strong-opacity"), "0.4");
  assert.equal(maximumStrength.get("--ld-panel-soft-opacity"), "0.1");
  assert.equal(maximumStrength.get("--ld-panel-blur"), "0px");
  assert.equal(maximumStrength.get("--ld-panel-strong-blur"), "0px");
  assert.equal(maximumStrength.get("--ld-fade-mid-opacity"), "0");
  assert.equal(maximumStrength.get("--ld-fade-lower-opacity"), "0");
  assert.equal(maximumStrength.get("--ld-fade-end-opacity"), "0");
});

test("控制器初始化、切换、强度与动态背景更新均持久化", () => {
  const stored = new Map([
    ["ld-theme", "yamada-window"],
    ["ld-bg-opacity", 0.72],
    ["ld-motion-enabled", false],
    ["ld-theme-rotation-enabled", false],
    ["ld-text-color-enabled", true],
    ["ld-text-color", "#24343d"],
  ]);
  const writes = [];
  const root = {
    dataset: {},
    style: {
      colorScheme: "",
      setProperty() {},
    },
  };
  const controller = createThemeController({
    root,
    getValue(key, fallback) {
      return stored.has(key) ? stored.get(key) : fallback;
    },
    setValue(key, value) {
      writes.push([key, value]);
      stored.set(key, value);
    },
  });

  assert.deepEqual(controller.initialize(), {
    theme: "yamada-window",
    backgroundOpacity: 0.72,
    motionEnabled: false,
    rotationEnabled: false,
    textColorEnabled: true,
    textColor: "#24343d",
  });
  assert.equal(controller.setTheme("crimson-duo").theme, "crimson-duo");
  assert.equal(controller.setBackgroundOpacity(0.58).backgroundOpacity, 0.58);
  assert.equal(controller.setMotionEnabled(true).motionEnabled, true);
  assert.equal(controller.setRotationEnabled(true).rotationEnabled, true);
  assert.equal(controller.setTextColorEnabled(false).textColorEnabled, false);
  assert.equal(controller.setTextColor("#102a43").textColor, "#102a43");
  assert.deepEqual(writes, [
    ["ld-theme", "crimson-duo"],
    ["ld-bg-opacity", 0.58],
    ["ld-motion-enabled", true],
    ["ld-theme-rotation-enabled", true],
    ["ld-text-color-enabled", false],
    ["ld-text-color", "#102a43"],
  ]);
});

test("开启主题轮播后每次初始化只前进一套主题", () => {
  const stored = new Map([
    ["ld-theme", "crimson-duo"],
    ["ld-theme-rotation-enabled", true],
  ]);
  const writes = [];
  const root = {
    dataset: {},
    style: {
      colorScheme: "",
      setProperty() {},
      removeProperty() {},
    },
  };
  const controller = createThemeController({
    root,
    getValue(key, fallback) {
      return stored.has(key) ? stored.get(key) : fallback;
    },
    setValue(key, value) {
      writes.push([key, value]);
      stored.set(key, value);
    },
  });

  const state = controller.initialize();

  assert.equal(state.theme, "shikoti-room");
  assert.equal(state.rotationEnabled, true);
  assert.deepEqual(writes, [["ld-theme", "shikoti-room"]]);
});

test("主题选择器包含轮播、文字颜色、动态背景和素材包控件", () => {
  const markup = createThemePickerMarkup("crimson-duo", 0.66, {
    motionEnabled: true,
    rotationEnabled: true,
    textColorEnabled: true,
    textColor: "#24343d",
  });

  assert.equal((markup.match(/data-ld-theme-option=/g) ?? []).length, 41);
  assert.match(
    markup,
    /data-ld-theme-option="crimson-duo"[^>]*aria-pressed="true"/,
  );
  assert.match(markup, /type="range"/);
  assert.match(markup, /value="0.66"/);
  assert.match(markup, /绯红·双影/);
  assert.match(markup, /诗寇蒂·粉色卧室/);
  assert.match(markup, /绘梨衣·夕照城市/);
  assert.match(markup, /雏田·月影/);
  assert.match(markup, /晴空·耳机少女/);
  assert.doesNotMatch(markup, /神乐钵·墨夜|鸣潮·椿|芙莉莲与费伦/);
  assert.doesNotMatch(markup, /椿 Coser|伊蕾娜·青月|诗梦·粉金海岸/);
  assert.doesNotMatch(markup, /清风·兰亭|2B·赤花原野|雨日·长阶/);
  assert.doesNotMatch(markup, /桐人亚丝娜·晴野/);
  assert.match(markup, /data-ld-motion-enabled/);
  assert.match(markup, /data-ld-theme-rotation-enabled[^>]*checked/);
  assert.match(markup, /data-ld-text-color-enabled[^>]*checked/);
  assert.match(markup, /data-ld-text-color[^>]*value="#24343d"/);
  assert.match(markup, /data-ld-import-media/);
  assert.match(markup, /webkitdirectory/);
  assert.match(markup, /data-ld-clear-media/);
});

test("只从主题选项目标读取合法主题键", () => {
  const validTarget = {
    closest() {
      return { dataset: { ldThemeOption: "crimson-duo" } };
    },
  };
  const invalidTarget = {
    closest() {
      return { dataset: { ldThemeOption: "other" } };
    },
  };

  assert.equal(getThemeKeyFromTarget(validTarget), "crimson-duo");
  assert.equal(getThemeKeyFromTarget(invalidTarget), null);
  assert.equal(getThemeKeyFromTarget(null), null);
});

test("拖拽位置会按触发按钮尺寸夹紧在浏览器可视区域内", () => {
  assert.deepEqual(
    normalizePickerPosition(
      { x: 2000, y: 1200 },
      { width: 1920, height: 1080 },
      { width: 48, height: 48 },
    ),
    { x: 1860, y: 1020 },
  );
  assert.deepEqual(
    normalizePickerPosition(
      { x: -200, y: -100 },
      { width: 1280, height: 720 },
      { width: 48, height: 48 },
    ),
    { x: 12, y: 12 },
  );
  assert.equal(
    normalizePickerPosition(
      null,
      { width: 1280, height: 720 },
      { width: 48, height: 48 },
    ),
    null,
  );
});

test("选择器状态同步按钮、强度、轮播和文字颜色控件", () => {
  const buttons = THEME_KEYS.map((key) => ({
    dataset: { ldThemeOption: key },
    pressed: "",
    setAttribute(name, value) {
      if (name === "aria-pressed") this.pressed = value;
    },
  }));
  const range = { value: "" };
  const motion = { checked: false };
  const rotation = { checked: false };
  const textColorEnabled = { checked: false };
  const textColor = { value: "" };
  const root = {
    querySelectorAll() {
      return buttons;
    },
    querySelector(selector) {
      const nodes = {
        "[data-ld-background-opacity]": range,
        "[data-ld-motion-enabled]": motion,
        "[data-ld-theme-rotation-enabled]": rotation,
        "[data-ld-text-color-enabled]": textColorEnabled,
        "[data-ld-text-color]": textColor,
      };
      return nodes[selector] ?? null;
    },
  };

  syncPickerState(root, "crimson-duo", 0.81, {
    motionEnabled: true,
    rotationEnabled: true,
    textColorEnabled: true,
    textColor: "#102a43",
  });

  assert.equal(buttons.filter((button) => button.pressed === "true").length, 1);
  assert.equal(buttons[0].pressed, "true");
  assert.equal(range.value, "0.81");
  assert.equal(motion.checked, true);
  assert.equal(rotation.checked, true);
  assert.equal(textColorEnabled.checked, true);
  assert.equal(textColor.value, "#102a43");
});

test("素材包清单校验并把目录文件映射到主题资源", async () => {
  const manifest = {
    schemaVersion: 1,
    packId: "linuxdo-theme-suite-test",
    version: "0.4.0",
    themes: {
      "miku-monitoring": {
        image: "images/theme-miku-monitoring.jpg",
        video: "videos/miku-monitoring.mp4",
      },
      "arona-classroom": {
        image: "images/theme-arona-classroom.jpg",
      },
    },
  };
  assert.equal(validateMediaPackManifest(manifest).packId, manifest.packId);
  assert.throws(
    () =>
      validateMediaPackManifest({
        ...manifest,
        themes: { unknown: { image: "images/unknown.jpg" } },
      }),
    /未知主题/,
  );

  const files = [
    {
      name: "manifest.json",
      webkitRelativePath: "pack/manifest.json",
      async text() {
        return JSON.stringify(manifest);
      },
    },
    {
      name: "theme-miku-monitoring.jpg",
      webkitRelativePath: "pack/images/theme-miku-monitoring.jpg",
      type: "image/jpeg",
    },
    {
      name: "miku-monitoring.mp4",
      webkitRelativePath: "pack/videos/miku-monitoring.mp4",
      type: "video/mp4",
    },
    {
      name: "theme-arona-classroom.jpg",
      webkitRelativePath: "pack/images/theme-arona-classroom.jpg",
      type: "image/jpeg",
    },
  ];
  const index = createMediaFileIndex(files);
  assert.equal(
    index.get("images/theme-arona-classroom.jpg")?.name,
    files[3].name,
  );

  const parsed = await parseMediaPackFiles(files);
  assert.equal(parsed.manifest.packId, manifest.packId);
  assert.equal(parsed.assets.length, 3);
  assert.deepEqual(
    parsed.assets.map(({ theme, kind }) => [theme, kind]),
    [
      ["miku-monitoring", "image"],
      ["miku-monitoring", "video"],
      ["arona-classroom", "image"],
    ],
  );
});

test("document-start 阶段会等待 body 出现后再挂载动态背景", async () => {
  let readyListener;
  const document = {
    body: null,
    addEventListener(type, listener) {
      if (type === "DOMContentLoaded") readyListener = listener;
    },
  };

  const waiting = waitForDocumentBody(document);
  assert.equal(typeof readyListener, "function");
  document.body = {};
  readyListener();
  await waiting;
  assert.ok(document.body);
});

function createMediaManagerFixture() {
  const elements = new Map();

  function createElement(tagName) {
    const listeners = new Map();
    const element = {
      tagName: tagName.toUpperCase(),
      id: "",
      dataset: {},
      children: [],
      isConnected: false,
      paused: true,
      ended: false,
      currentTime: 0,
      duration: 30,
      readyState: 4,
      src: "",
      playCalls: 0,
      pauseCalls: 0,
      addEventListener(type, listener) {
        const entries = listeners.get(type) ?? [];
        entries.push(listener);
        listeners.set(type, entries);
      },
      removeEventListener(type, listener) {
        const entries = listeners.get(type) ?? [];
        listeners.set(
          type,
          entries.filter((entry) => entry !== listener),
        );
      },
      dispatch(type) {
        for (const listener of listeners.get(type) ?? []) {
          listener({ type, target: this });
        }
      },
      append(child) {
        this.children.push(child);
        child.isConnected = this.isConnected;
      },
      querySelector(selector) {
        return selector === "video"
          ? this.children.find((child) => child.tagName === "VIDEO") ?? null
          : null;
      },
      setAttribute(name, value) {
        if (name === "aria-hidden") this.ariaHidden = value;
      },
      removeAttribute(name) {
        if (name === "src") this.src = "";
        if (name === "data-ld-active") delete this.dataset.ldActive;
      },
      play() {
        this.paused = false;
        this.ended = false;
        this.playCalls += 1;
        return Promise.resolve();
      },
      pause() {
        this.paused = true;
        this.pauseCalls += 1;
        this.dispatch("pause");
      },
      load() {},
      remove() {
        this.isConnected = false;
        for (const child of this.children) child.isConnected = false;
        elements.delete(this.id);
      },
    };
    return element;
  }

  const properties = new Map();
  const document = {
    hidden: false,
    documentElement: {
      style: {
        setProperty(name, value) {
          properties.set(name, value);
        },
        removeProperty(name) {
          properties.delete(name);
        },
      },
    },
    body: {
      prepend(element) {
        element.isConnected = true;
        for (const child of element.children) child.isConnected = true;
        elements.set(element.id, element);
      },
    },
    createElement,
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    addEventListener() {},
    removeEventListener() {},
  };

  return { document, elements, properties };
}

test("只调整透明度不会重复读取素材或重建视频 Blob", async () => {
  const fixture = createMediaManagerFixture();
  const imageAsset = { blob: { type: "image/jpeg" } };
  const videoAsset = { blob: { type: "video/mp4" } };
  const reads = [];
  const createdUrls = [];
  const revokedUrls = [];
  const manager = createMediaManager({
    document: fixture.document,
    matchMedia: () => ({ matches: false }),
    getMediaAsset(theme, kind) {
      reads.push([theme, kind]);
      return Promise.resolve(kind === "video" ? videoAsset : imageAsset);
    },
    createObjectURL(blob) {
      const url = `blob:${createdUrls.length + 1}`;
      createdUrls.push([url, blob]);
      return url;
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    },
    setTimeoutFn(callback) {
      callback();
      return 1;
    },
    clearTimeoutFn() {},
  });
  const firstState = {
    theme: "erii-sunset",
    backgroundOpacity: 0.72,
    motionEnabled: true,
  };

  await manager.apply(firstState);
  const video = fixture.elements
    .get("ld-theme-suite-media")
    .querySelector("video");
  await manager.apply({ ...firstState, backgroundOpacity: 0.95 });

  assert.deepEqual(reads, [
    ["erii-sunset", "image"],
    ["erii-sunset", "video"],
  ]);
  assert.equal(createdUrls.length, 2);
  assert.equal(revokedUrls.length, 0);
  assert.equal(video.playCalls, 1);
  assert.equal(
    fixture.properties.get("--ld-video-poster-image"),
    'url("blob:1")',
  );
  assert.equal(video.src, "blob:2");
  manager.dispose();
});

test("抽取英雄前可暂停常规媒体层且下次主题应用能够恢复", async () => {
  const fixture = createMediaManagerFixture();
  let reads = 0;
  const manager = createMediaManager({
    document: fixture.document,
    matchMedia: () => ({ matches: false }),
    getMediaAsset(_theme, kind) {
      reads += 1;
      return Promise.resolve({
        blob: { type: kind === "video" ? "video/mp4" : "image/jpeg" },
      });
    },
    createObjectURL: () => `blob:${reads}`,
    revokeObjectURL() {},
    setTimeoutFn(callback) {
      callback();
      return 1;
    },
    clearTimeoutFn() {},
  });
  const state = {
    theme: "hinata-night",
    backgroundOpacity: 0.78,
    motionEnabled: true,
  };

  await manager.apply(state);
  const video = fixture.elements
    .get("ld-theme-suite-media")
    .querySelector("video");
  assert.equal(video.paused, false);

  manager.suspend();
  assert.equal(video.paused, true);
  assert.equal(fixture.properties.has("--ld-runtime-hero-image"), false);
  assert.equal(fixture.properties.has("--ld-video-poster-image"), false);

  await manager.apply(state);
  assert.ok(reads >= 4, "暂停后重新应用主题应重新读取并挂载媒体");
  assert.equal(video.paused, false);
  manager.dispose();
});

test("视频暂停会自动恢复且黑帧主题在尾帧前回环", async () => {
  const fixture = createMediaManagerFixture();
  const manager = createMediaManager({
    document: fixture.document,
    matchMedia: () => ({ matches: false }),
    getMediaAsset(_theme, kind) {
      return Promise.resolve({
        blob: { type: kind === "video" ? "video/mp4" : "image/jpeg" },
      });
    },
    createObjectURL: () => "blob:video",
    revokeObjectURL() {},
    setTimeoutFn(callback) {
      callback();
      return 1;
    },
    clearTimeoutFn() {},
  });

  await manager.apply({
    theme: "yamada-sky",
    backgroundOpacity: 0.78,
    motionEnabled: true,
  });
  const video = fixture.elements
    .get("ld-theme-suite-media")
    .querySelector("video");
  video.paused = true;
  video.dispatch("pause");
  assert.equal(video.paused, false);
  assert.equal(video.playCalls, 2);

  video.duration = 28.633;
  video.currentTime = 28.3;
  video.dispatch("timeupdate");
  assert.ok(video.currentTime < 0.1);
  manager.dispose();
});

test("动态背景节点被站点替换后可按当前状态重新挂载", async () => {
  const fixture = createMediaManagerFixture();
  let reads = 0;
  const manager = createMediaManager({
    document: fixture.document,
    matchMedia: () => ({ matches: false }),
    getMediaAsset(_theme, kind) {
      reads += 1;
      return Promise.resolve({
        blob: { type: kind === "video" ? "video/mp4" : "image/jpeg" },
      });
    },
    createObjectURL: () => `blob:${reads}`,
    revokeObjectURL() {},
    setTimeoutFn(callback) {
      callback();
      return 1;
    },
    clearTimeoutFn() {},
  });
  await manager.apply({
    theme: "miku-monitoring",
    backgroundOpacity: 0.78,
    motionEnabled: true,
  });
  const firstRoot = fixture.elements.get("ld-theme-suite-media");
  firstRoot.remove();

  await manager.maintain();

  const replacement = fixture.elements.get("ld-theme-suite-media");
  assert.notEqual(replacement, firstRoot);
  assert.equal(replacement.isConnected, true);
  assert.equal(replacement.querySelector("video").paused, false);
  manager.dispose();
});

test("主题选择器挂载、打开和响应主题及强度交互", () => {
  function createEventNode() {
    const listeners = new Map();
    return {
      dataset: {},
      hidden: true,
      value: "0.78",
      attributes: new Map(),
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      dispatch(type, event = {}) {
        listeners.get(type)?.(event);
      },
      setAttribute(name, value) {
        this.attributes.set(name, value);
      },
      getAttribute(name) {
        return this.attributes.get(name) ?? null;
      },
    };
  }

  const trigger = createEventNode();
  trigger.setAttribute("aria-expanded", "false");
  const panel = createEventNode();
  const range = createEventNode();
  const picker = createEventNode();
  const hideCompanionButton = createEventNode();
  const status = createEventNode();
  const buttons = THEME_KEYS.map((key) => {
    const node = createEventNode();
    node.dataset.ldThemeOption = key;
    return node;
  });
  const host = createEventNode();
  host.contains = (target) =>
    target === host || target === picker || target === trigger || target === panel;
  host.querySelector = (selector) => {
    if (selector === ".ld-theme-picker") return picker;
    if (selector === ".ld-theme-picker__trigger") return trigger;
    if (selector === ".ld-theme-picker__panel") return panel;
    if (selector === "[data-ld-background-opacity]") return range;
    if (selector === "[data-ld-hide-companion]") return hideCompanionButton;
    if (selector === "[data-ld-media-status]") return status;
    return null;
  };
  host.querySelectorAll = () => buttons;

  let appended = null;
  const documentListeners = new Map();
  const document = {
    body: {
      append(node) {
        appended = node;
      },
    },
    getElementById() {
      return null;
    },
    createElement() {
      return host;
    },
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      documentListeners.get(type)?.(event);
    },
  };
  let state = { theme: "crimson-duo", backgroundOpacity: 0.78 };
  const actions = [];
  const heroActions = [];
  const controller = {
    getState() {
      return { ...state };
    },
    setTheme(theme) {
      actions.push(["theme", theme]);
      state = { ...state, theme };
      return { ...state };
    },
    setBackgroundOpacity(backgroundOpacity) {
      actions.push(["opacity", backgroundOpacity]);
      state = {
        ...state,
        backgroundOpacity: Number(backgroundOpacity),
      };
      return { ...state };
    },
  };

  assert.equal(
    mountThemePicker({
      document,
      controller,
      heroManager: {
        disable() {
          heroActions.push("disable");
        },
        hideCompanion() {
          heroActions.push("hideCompanion");
        },
      },
    }),
    host,
  );
  assert.equal(host.id, "ld-theme-suite-root");
  assert.equal(appended, host);

  trigger.dispatch("click");
  assert.equal(panel.hidden, false);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");

  document.dispatch("pointerdown", { target: panel });
  assert.equal(panel.hidden, false);

  document.dispatch("pointerdown", { target: {} });
  assert.equal(panel.hidden, true);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");

  trigger.dispatch("click");
  document.dispatch("keydown", { key: "Escape" });
  assert.equal(panel.hidden, true);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");

  trigger.dispatch("click");
  host.dispatch("click", {
    target: {
      closest() {
        return { dataset: { ldThemeOption: "crimson-duo" } };
      },
    },
  });
  range.value = "0.61";
  range.dispatch("input", { target: range });
  hideCompanionButton.dispatch("click");

  assert.deepEqual(actions, [
    ["theme", "crimson-duo"],
    ["opacity", "0.61"],
  ]);
  assert.deepEqual(heroActions, ["disable", "hideCompanion"]);
  assert.equal(status.textContent, "伙伴已关闭");
  assert.equal(status.dataset.ldStatus, "success");
  assert.equal(buttons[0].attributes.get("aria-pressed"), "true");
});
