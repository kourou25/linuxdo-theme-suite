import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16),
  );
}

function luminance(hex) {
  const channels = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2]
  );
}

function contrastRatio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function themeVariable(styles, theme, name) {
  const block = styles.match(
    new RegExp(
      `html\\[data-ld-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`,
    ),
  )?.[1];
  assert.ok(block, `缺少主题样式：${theme}`);
  const value = block.match(
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`),
  )?.[1];
  assert.ok(value, `主题 ${theme} 缺少颜色变量 --${name}`);
  return value;
}

function jpegDimensions(filePath) {
  const bytes = readFileSync(filePath);
  assert.equal(bytes.readUInt16BE(0), 0xffd8, "不是有效的 JPEG 文件");

  const sizeMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }
    const segmentLength = bytes.readUInt16BE(offset);
    if (sizeMarkers.has(marker)) {
      return {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }

  assert.fail("JPEG 文件缺少尺寸标记");
}

test("绯红双影主题使用双人安全边界的白色宽屏图", () => {
  const filename = "theme-crimson-duo-white-safe.jpg";
  const filePath = path.join(
    projectRoot,
    "assets",
    "generated",
    "runtime",
    "v0.6.0",
    filename,
  );
  assert.ok(existsSync(filePath), `缺少主题运行图：${filename}`);
  const { width, height } = jpegDimensions(filePath);
  assert.ok(width >= 1536, `${filename} 宽度不足`);
  assert.ok(width / height >= 1.75, `${filename} 不是宽屏构图`);
  assert.ok(width / height <= 1.8, `${filename} 宽高比偏离 16:9`);
});

test("构建生成仅匹配 linux.do 的离线单文件脚本", () => {
  const buildResult = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.equal(
    buildResult.status,
    0,
    `${buildResult.stdout}\n${buildResult.stderr}`,
  );

  const outputPath = path.join(
    projectRoot,
    "dist",
    "linuxdo-theme-suite.user.js",
  );
  const output = readFileSync(outputPath, "utf8");
  const syntaxResult = spawnSync(process.execPath, ["--check", outputPath], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.equal(
    syntaxResult.status,
    0,
    `${syntaxResult.stdout}\n${syntaxResult.stderr}`,
  );
  const previewStyles = readFileSync(
    path.join(projectRoot, "tests", "fixtures", "runtime-styles.css"),
    "utf8",
  );
  const sourceStyles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  assert.match(output, /@match\s+https:\/\/linux\.do\/\*/);
  assert.match(output, /@grant\s+GM_getValue/);
  assert.match(output, /@grant\s+GM_setValue/);
  assert.match(output, /@grant\s+GM_addStyle/);
  assert.doesNotMatch(output, /@require/);
  assert.equal(
    (output.match(/data:image\/(?:jpeg|webp);base64,/g) ?? []).length,
    41,
  );
  assert.doesNotMatch(output, /__[A-Z0-9_]+__/);
  assert.doesNotMatch(output, /url\((["']?)https?:\/\//);
  for (const theme of [
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
  ]) {
    assert.match(output, new RegExp(`data-ld-theme=\\\\?"${theme}\\\\?"`));
  }
  for (const removedTheme of [
    "kagurabachi",
    "camellya-night",
    "camellya-day",
    "frieren-fern",
    "camellya-cosplay",
    "elaina-moon",
    "sweet-amour",
    "lanting",
    "nier-2b",
    "rainy-day",
    "kirito-asuna",
  ]) {
    assert.doesNotMatch(
      output,
      new RegExp(`data-ld-theme=\\\\?"${removedTheme}\\\\?"`),
    );
  }
  assert.match(output, /prefers-reduced-motion:\s*reduce/);
  assert.match(output, /#main-outlet/);
  assert.match(output, /ld-theme-suite-root/);
  assert.match(output, /MutationObserver/);
  assert.ok(statSync(outputPath).size < 12_000_000);
  assert.equal(
    (previewStyles.match(/data:image\/(?:jpeg|webp);base64,/g) ?? []).length,
    41,
  );
  const coreOutput = readFileSync(
    path.join(projectRoot, "dist", "linuxdo-theme-suite-core.user.js"),
    "utf8",
  );
  const coreSyntaxResult = spawnSync(
    process.execPath,
    [
      "--check",
      path.join(projectRoot, "dist", "linuxdo-theme-suite-core.user.js"),
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );
  assert.equal(
    coreSyntaxResult.status,
    0,
    `${coreSyntaxResult.stdout}\n${coreSyntaxResult.stderr}`,
  );
  assert.doesNotMatch(coreOutput, /data:image\/jpeg;base64,/);
  assert.match(coreOutput, /LINUX DO Theme Suite Core/);
  assert.ok(
    statSync(
      path.join(projectRoot, "dist", "linuxdo-theme-suite-core.user.js"),
    ).size < 250_000,
    "核心脚本体积应保持在 250 KB 以内",
  );
  assert.match(output, /indexedDB/);
  assert.match(output, /ld-theme-suite-video/);
  assert.match(output, /webkitdirectory/);
  assert.doesNotMatch(previewStyles, /__[A-Z0-9_]+__/);
  assert.match(
    sourceStyles,
    /html\[data-ld-theme\]\s+body\s*\{[\s\S]*?background:\s*transparent\s*!important/,
  );
  assert.doesNotMatch(
    sourceStyles,
    /body::before\s*\{[\s\S]*?z-index:\s*-\d/,
  );
  const rootBackgroundBlock = sourceStyles.match(
    /html\[data-ld-theme\]\s*\{[\s\S]*?background-image:\s*([\s\S]*?)!important;/,
  )?.[1];
  assert.ok(rootBackgroundBlock, "缺少主题根背景定义");
  assert.equal(
    (rootBackgroundBlock.match(/var\(--ld-hero-image\)/g) ?? []).length,
    1,
    "同一人物背景不得以 contain/cover 两层重复绘制",
  );
  assert.match(sourceStyles, /--ld-divider:/);
  assert.match(sourceStyles, /--ld-control-border:/);
  assert.match(sourceStyles, /--ld-panel-opacity:/);
  assert.match(
    sourceStyles,
    /--ld-panel:\s*rgb\(var\(--ld-panel-rgb\)\s*\/\s*var\(--ld-panel-opacity\)\)/,
  );
  assert.match(sourceStyles, /--ld-panel-blur:/);
  assert.match(sourceStyles, /--ld-panel-strong-blur:/);
  assert.match(sourceStyles, /--ld-fade-mid-opacity:/);
  assert.match(sourceStyles, /--ld-fade-lower-opacity:/);
  assert.match(sourceStyles, /--ld-fade-end-opacity:/);
  assert.match(
    sourceStyles,
    /rgb\(var\(--ld-page-rgb\)\s*\/\s*var\(--ld-fade-end-opacity\)\)/,
  );
  assert.match(
    sourceStyles,
    /background-size:[\s\S]*?100%\s+150vh,[\s\S]*?100%\s+100%,[\s\S]*?var\(--ld-media-fit\)\s*!important/,
  );
  assert.match(
    sourceStyles,
    /#ld-theme-suite-media::before\s*\{[\s\S]*?background-image:\s*var\(--ld-video-poster-image\)[\s\S]*?background-size:\s*cover/,
  );
  assert.match(sourceStyles, /object-fit:\s*var\(--ld-media-fit\)/);
  assert.match(
    sourceStyles,
    /backdrop-filter:\s*blur\(var\(--ld-panel-blur\)\)/,
  );
  assert.match(
    sourceStyles,
    /backdrop-filter:\s*blur\(var\(--ld-panel-strong-blur\)\)/,
  );
  assert.match(sourceStyles, /--ld-post-inline-gutter:/);
  assert.match(
    sourceStyles,
    /\.topic-post article\s*\{[\s\S]*?padding-inline:\s*var\(--ld-post-inline-gutter\)/,
  );
  assert.match(
    sourceStyles,
    /\.topic-post\s*\{[\s\S]*?margin-block:\s*8px/,
  );
  assert.match(
    sourceStyles,
    /\.topic-post article\s*\{[\s\S]*?border:\s*0[\s\S]*?inset 0 0 0 1px var\(--ld-border\)/,
  );
  assert.match(
    sourceStyles,
    /\.topic-post[\s\S]*?\.topic-avatar[\s\S]*?\.topic-body[\s\S]*?border-top-color:\s*transparent\s*!important/,
  );
  assert.match(sourceStyles, /#quick-access-notifications/);
  assert.match(sourceStyles, /\.quick-access-panel/);
  assert.match(
    sourceStyles,
    /(?:#quick-access-notifications|\.quick-access-panel)[\s\S]*?background:\s*var\(--ld-panel-strong\)\s*!important/,
  );
  assert.match(
    sourceStyles,
    /(?:#quick-access-notifications|\.quick-access-panel)[\s\S]*?color:\s*var\(--primary\)\s*!important/,
  );
  assert.match(
    sourceStyles,
    /\.ld-theme-picker__options\s*\{[\s\S]*?overflow-y:\s*auto/,
  );
  assert.match(
    sourceStyles,
    /\.ld-theme-picker__panel\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-rows:\s*auto\s+minmax\(150px,\s*1fr\)\s+auto\s+auto\s+auto\s+auto\s+auto[\s\S]*?height:\s*min\(690px,\s*calc\(100vh\s*-\s*32px\)\)/,
  );
  assert.match(
    sourceStyles,
    /\.ld-theme-picker__options\s*\{[\s\S]*?min-height:\s*0[\s\S]*?max-height:\s*none/,
  );
});

test("个人中心和推荐列表的普通项目跟随背景强度并保留悬停反馈", () => {
  const styles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.user-stream\s+:is\(\s*\.item,\s*\.user-stream-item\s*\):not\(\s*\.moderator-action,\s*\.deleted\s*\)\s*\{[\s\S]*?background:\s*transparent\s*!important/,
  );
  assert.match(
    styles,
    /:is\(\s*\.topic-list-item:not\(\.bulk-selected\),\s*\.category-list-item\s*\)\s*\{[\s\S]*?background:\s*transparent\s*!important/,
  );
  assert.match(
    styles,
    /:is\(\s*\.topic-list-item:not\(\.bulk-selected\),\s*\.category-list-item\s*\):hover\s*\{[\s\S]*?background:\s*var\(--ld-panel-soft\)\s*!important/,
  );
});

test("发帖编辑器自适应可用宽度且个人资料栏使用轻量透明表面", () => {
  const styles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.composer-container\s+:is\(\s*\.reply-area,\s*\.composer-fields,\s*\.d-editor-container\s*\)\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/,
  );
  assert.match(
    styles,
    /\.d-editor-container:has\(\.d-editor-input:placeholder-shown\)\s+\.d-editor-preview-wrapper\s*\{[\s\S]*?display:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /\.d-editor-container:has\(\.d-editor-input:placeholder-shown\)\s+\.d-editor-textarea-wrapper\s*\{[\s\S]*?flex:\s*1\s+1\s+100%[\s\S]*?width:\s*100%/,
  );
  assert.match(
    styles,
    /\.composer-container\s+\.d-editor-input:focus-visible\s*\{[\s\S]*?outline:\s*none/,
  );
  assert.match(
    styles,
    /\.composer-container\s+:is\(\s*\.reply-area,\s*\.composer-fields,\s*\.d-editor-container,\s*\.d-editor-textarea-column,\s*\.d-editor-textarea-wrapper,\s*\.d-editor-preview-wrapper,\s*\.d-editor-input,\s*\.d-editor-button-bar,\s*\.d-editor-button-bar\s+\.btn\s*\)\s*\{[\s\S]*?border:\s*0\s*!important[\s\S]*?outline:\s*0\s*!important[\s\S]*?box-shadow:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /\.composer-container\s+:is\(\s*\.reply-area,\s*\.composer-fields,\s*\.d-editor-container,\s*\.d-editor-textarea-wrapper,\s*\.d-editor-preview-wrapper\s*\):focus-within\s*\{[\s\S]*?outline:\s*none\s*!important[\s\S]*?box-shadow:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /:is\(\s*\.chat-composer,\s*\.chat-composer-container,\s*\.chat-composer__wrapper,\s*\.chat-composer__input-container,\s*\.chat-message-text-area,\s*\.chat-message-text-area__container,\s*\.chat-message-text-area__input-container,\s*\.chat-message-text-area__input\s*\)\s*\{[\s\S]*?border:\s*0\s*!important[\s\S]*?outline:\s*0\s*!important[\s\S]*?box-shadow:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /:is\(\s*\.search-menu,\s*\.search-menu-container,\s*\.custom-search-banner\s*\)[\s\S]*?:is\(\s*\.search-icon,\s*\.search-icon-button,\s*\.search-input\s+\.btn,\s*\.search-input\s+button\s*\)\s*\{[\s\S]*?border:\s*0\s*!important[\s\S]*?box-shadow:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /\.user-main\s+\.about\s*\{[\s\S]*?background:\s*transparent\s*!important[\s\S]*?box-shadow:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /\.user-main\s+\.about\s+\.details\s*\{[\s\S]*?border:\s*1px\s+solid\s+var\(--ld-border\)[\s\S]*?border-radius:\s*16px[\s\S]*?background:\s*var\(--ld-panel\)\s*!important/,
  );
  assert.match(
    styles,
    /\.user-main\s+\.about\s+\.details\s+:is\(\s*\.primary,\s*\.secondary\s*\)\s*\{[\s\S]*?background:\s*transparent\s*!important/,
  );
});

test("桌面主题导航在窄内容区保持筛选、标签和操作的稳定顺序", () => {
  const styles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  assert.match(
    styles,
    /@media\s*\(min-width:\s*769px\)[\s\S]*?\.navigation-container\s*\{[\s\S]*?display:\s*flex\s*!important[\s\S]*?flex-flow:\s*row\s+nowrap\s*!important/,
  );
  assert.match(
    styles,
    /\.navigation-container\s*>\s*\.category-breadcrumb\s*\{[\s\S]*?order:\s*0\s*!important[\s\S]*?flex:\s*0\s+0\s+auto\s*!important/,
  );
  assert.match(
    styles,
    /\.navigation-container\s*>\s*\.nav-pills\s*\{[\s\S]*?order:\s*1\s*!important[\s\S]*?min-width:\s*0[\s\S]*?overflow-x:\s*auto\s*!important[\s\S]*?flex-wrap:\s*nowrap\s*!important/,
  );
  assert.match(
    styles,
    /\.navigation-container\s*>\s*\.navigation-controls\s*\{[\s\S]*?order:\s*2\s*!important[\s\S]*?flex:\s*0\s+0\s+auto\s*!important/,
  );
});

test("主题统计数字不显示按钮描边且自定义文字颜色覆盖正文令牌", () => {
  const styles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.topic-map__stats[\s\S]*?:is\(\s*\.topic-map__stat,\s*\.fk-d-menu__trigger\s*\)[\s\S]*?border:\s*0\s*!important[\s\S]*?box-shadow:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /html\[data-ld-text-color-enabled="true"\]\s*\{[\s\S]*?--primary:\s*var\(--ld-text-color\)[\s\S]*?--ld-muted:/,
  );
  assert.match(styles, /--ld-picker-text:/);
  assert.match(
    styles,
    /#ld-theme-suite-root\s*\{[\s\S]*?color:\s*var\(--ld-picker-text\)/,
  );
  assert.match(
    styles,
    /\.ld-theme-picker__panel\s*\{[\s\S]*?background:\s*rgb\(var\(--ld-panel-strong-rgb\)\s*\/\s*0\.96\)/,
  );
});

test("边框层级隐藏被动控件描边并突出主操作", () => {
  const styles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.d-header-icons[\s\S]*?border:\s*0\s*!important[\s\S]*?box-shadow:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /\.post-controls[\s\S]*?\.widget-button[\s\S]*?border:\s*0\s*!important/,
  );
  assert.match(
    styles,
    /:is\(\s*\.create-topic,\s*\.btn-primary,\s*\.post-controls\s+\.reply\s*\)[\s\S]*?background:\s*var\(--ld-accent\)\s*!important/,
  );
  assert.match(styles, /\.search-menu[\s\S]*?:focus-within/);
  assert.doesNotMatch(styles, /transition:\s*all\b/);
});

test("英雄伙伴不使用整图假动作并保留拖动", () => {
  const styles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  assert.match(styles, /#ld-hero-companion\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(styles, /#ld-hero-companion\s*\{[\s\S]*?max-height:\s*min\(/);
  assert.match(styles, /#ld-hero-companion\s*\{[\s\S]*?pointer-events:\s*auto/);
  assert.match(styles, /#ld-hero-companion\s*\{[\s\S]*?touch-action:\s*none/);
  assert.match(styles, /#ld-hero-companion\s*\{[\s\S]*?cursor:\s*grab/);
  assert.match(
    styles,
    /#ld-hero-companion\[data-ld-dragging="true"\][\s\S]*?cursor:\s*grabbing/,
  );
  assert.match(
    styles,
    /#ld-hero-companion\s*\{[\s\S]*?animation:\s*none\s*!important/,
  );
  assert.doesNotMatch(styles, /data-ld-action|@keyframes\s+ld-hero-float|@keyframes\s+ld-companion-/);
  assert.match(
    styles,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation-duration:\s*0\.01ms\s*!important[\s\S]*?animation-iteration-count:\s*1\s*!important/,
  );
});

test("英雄素材重建时为所有可动画伙伴保留 APNG 姿态帧", () => {
  const prepareScript = readFileSync(
    path.join(projectRoot, "scripts", "prepare-hero-assets.ps1"),
    "utf8",
  );

  assert.match(prepareScript, /\$actionAssetRoot\s*=/);
  assert.match(prepareScript, /"hero-\$id-companion\.png"/);
  assert.match(prepareScript, /Test-Path[\s\S]*?Copy-Item[\s\S]*?continue/);
  assert.doesNotMatch(prepareScript, /\$id\s+-eq\s+'001'/);
});

test("发布脚本把主题和 16 套匿名英雄整合为单一素材包", () => {
  const releaseScript = readFileSync(
    path.join(projectRoot, "scripts", "package-release.ps1"),
    "utf8",
  );

  assert.match(releaseScript, /linuxdo-theme-suite-v\$Version-suite-pack\.zip/);
  assert.match(releaseScript, /'001'\.\.'016'|1\.\.16/);
  assert.match(releaseScript, /packType\s*=\s*'suite'/);
  assert.match(releaseScript, /media\s*=\s*\[ordered\]@\{/);
  assert.match(releaseScript, /hero\s*=\s*\[ordered\]@\{/);
  assert.match(releaseScript, /heroes\s*=\s*\$heroes/);
  assert.match(releaseScript, /hero-\$id-background\.(?:jpg|webp)/);
  assert.match(releaseScript, /hero-\$id-companion\.png/);
  assert.match(
    releaseScript,
    /SHA256SUMS\.txt'\)[\s\S]*?-Encoding\s+utf8/,
  );
  assert.doesNotMatch(
    releaseScript,
    /SHA256SUMS\.txt'\)[\s\S]*?-Encoding\s+ascii/,
  );
  assert.match(
    releaseScript,
    /\$heroPackDir\s*=\s*Join-Path\s+\$projectRoot\s+"assets\\media-pack\\hero-draw\\v\$Version"/,
  );
  assert.match(
    releaseScript,
    /foreach\s*\(\$asset\s+in\s+@\([\s\S]*?Source\s*=\s*Join-Path\s+\$heroPackDir[\s\S]*?Target\s*=\s*Join-Path\s+\$suitePackDir[\s\S]*?\)\)/,
  );
});

test("V1 发布脚本生成可一次下载和一次解压的新手整合包", () => {
  const releaseScript = readFileSync(
    path.join(projectRoot, "scripts", "package-release.ps1"),
    "utf8",
  );

  assert.match(
    releaseScript,
    /\$starterKitName\s*=\s*"linuxdo-theme-suite-v\$Version-starter-kit\.zip"/,
  );
  assert.match(releaseScript, /00-开始使用\.txt/);
  assert.match(releaseScript, /01-安装主题脚本\.user\.js/);
  assert.match(releaseScript, /02-统一素材包/);
  assert.match(releaseScript, /03-操作手册\.md/);
  assert.match(
    releaseScript,
    /Copy-Item[\s\S]*?\$suitePackDir[\s\S]*?02-统一素材包[\s\S]*?-Recurse/,
  );
  assert.match(
    releaseScript,
    /Compress-Archive[\s\S]*?\$starterKitStageDir[\s\S]*?\$starterKitName/,
  );
});

test("发布目录说明展示真实文件名而不是 PowerShell 变量字面量", () => {
  const releaseScript = readFileSync(
    path.join(projectRoot, "scripts", "package-release.ps1"),
    "utf8",
  );

  assert.doesNotMatch(releaseScript, /`\$(?:coreScriptName|fullScriptName|suitePackName|manualName)`/);
  assert.match(releaseScript, /\$starterKitName/);
  assert.match(releaseScript, /首选下载/);
});

test("常规壁纸扩展生成 30 套安全宽屏资源并进入统一素材包", () => {
  const preparePath = path.join(
    projectRoot,
    "scripts",
    "prepare-wallpaper-expansion.ps1",
  );
  assert.ok(existsSync(preparePath), "缺少常规壁纸扩展处理脚本");
  const prepareScript = readFileSync(preparePath, "utf8");
  const releaseScript = readFileSync(
    path.join(projectRoot, "scripts", "package-release.ps1"),
    "utf8",
  );

  assert.match(prepareScript, /1920:1080/);
  assert.match(prepareScript, /fps=30/);
  assert.match(
    prepareScript,
    /assets\\generated\\wallpaper-expansion\\v0\.9\.0\\outpainted/,
  );
  assert.doesNotMatch(prepareScript, /gblur|split=2\[bg\]\[fg\]|overlay=/);
  assert.doesNotMatch(
    prepareScript,
    /force_original_aspect_ratio=decrease,pad=/,
  );
  assert.match(prepareScript, /workshop-3757374198-rendered\.png/);
  assert.match(prepareScript, /linuxdo-theme-suite-wallpaper-expansion/);
  assert.match(releaseScript, /suite-pack\.zip/);
  assert.doesNotMatch(releaseScript, /wallpaper-expansion-media-pack\.zip/);
  assert.doesNotMatch(releaseScript, /complete-theme-media-pack\.zip/);
  assert.match(
    releaseScript,
    /prepare-wallpaper-expansion\.ps1/,
  );
});

test("抽取英雄会先暂停常规媒体层，普通主题切换仅关闭英雄背景", () => {
  const pickerSource = readFileSync(
    path.join(projectRoot, "src", "theme-picker.js"),
    "utf8",
  );
  const entrySource = readFileSync(
    path.join(projectRoot, "src", "entry.js"),
    "utf8",
  );

  assert.match(
    pickerSource,
    /async function drawHero[\s\S]*?mediaManager\?\.suspend\?\.\(\)[\s\S]*?heroManager\[method\]\(\)/,
  );
  assert.match(
    pickerSource,
    /getThemeKeyFromTarget[\s\S]*?heroManager\?\.disable\?\.\(\)[\s\S]*?controller\.setTheme\(key\)/,
  );
  assert.match(
    entrySource,
    /createHeroManager\(\{[\s\S]*?beforeActivate\s*:\s*\(\)\s*=>\s*mediaManager\.suspend\(\)/,
  );
});

test("构建与发布文件名统一读取当前项目版本", () => {
  const buildScript = readFileSync(
    path.join(projectRoot, "scripts", "build.mjs"),
    "utf8",
  );
  const releaseScript = readFileSync(
    path.join(projectRoot, "scripts", "package-release.ps1"),
    "utf8",
  );

  assert.match(
    buildScript,
    /const packageMetadata = JSON\.parse\([\s\S]*?package\.json[\s\S]*?\);/,
  );
  assert.match(
    buildScript,
    /\.replace\("__USERSCRIPT_VERSION__",\s*packageMetadata\.version\)/,
  );
  assert.match(
    releaseScript,
    /\$fullScriptName\s*=\s*"linuxdo-theme-suite-v\$Version-full\.user\.js"/,
  );
  assert.match(
    releaseScript,
    /\$coreScriptName\s*=\s*"linuxdo-theme-suite-v\$Version-core\.user\.js"/,
  );
  assert.doesNotMatch(
    releaseScript,
    /linuxdo-theme-suite-v0\.4\.0-(?:full|core|source|static|dynamic)/,
  );
});

test("暗色主题为评论参与者、标签与元信息提供独立高对比令牌", () => {
  const styles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  assert.match(styles, /--ld-chip-bg:/);
  assert.match(styles, /--ld-chip-text:/);
  assert.match(styles, /--ld-chip-border:/);
  assert.match(styles, /\[data-ld-scheme="dark"\]/);
  assert.match(styles, /\.topic-map__user/);
  assert.match(styles, /\.topic-map__participant/);
  assert.match(styles, /\.discourse-reactions-list \.user-list/);
  assert.match(styles, /\.discourse-reactions-state-panel/);
  assert.match(styles, /\.discourse-reactions-state-panel-reaction/);
  assert.match(styles, /\.discourse-tag/);
  assert.match(styles, /\.badge-category/);
  assert.match(styles, /\.names \.username/);
});

test("主题工具窗使用分组圆角表面并为关闭伙伴提供完整操作行", () => {
  const styles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.ld-theme-picker__panel\s*\{[\s\S]*?border-radius:\s*22px/,
  );
  assert.match(
    styles,
    /\.ld-theme-picker__options\s*\{[\s\S]*?border-radius:\s*14px/,
  );
  assert.match(
    styles,
    /\.ld-theme-picker__hero-actions\s*\{[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /\.ld-theme-picker__hero-actions\s*\[data-ld-hide-companion\][\s\S]*?grid-column:\s*1\s*\/\s*-1/,
  );
});

test("统一素材包目录每次重建并复制全部视频", () => {
  const releaseScript = readFileSync(
    path.join(projectRoot, "scripts", "package-release.ps1"),
    "utf8",
  );

  assert.match(
    releaseScript,
    /Reset-ProjectDirectory\s+-Path\s+\$suitePackDir/,
  );
  assert.match(
    releaseScript,
    /Copy-Item\s+-LiteralPath\s+\$videoPath[\s\S]*?-Destination\s+\(Join-Path\s+\$suitePackDir\s+"videos\\\$\(\$dynamicVideos\[\$theme\]\)"\)/,
  );
});

test("悬浮工具窗具备明确关闭入口、对话框语义和拖拽丢失恢复", () => {
  const pickerSource = readFileSync(
    path.join(projectRoot, "src", "theme-picker.js"),
    "utf8",
  );
  assert.match(pickerSource, /role="dialog"/);
  assert.match(pickerSource, /data-ld-close-picker/);
  assert.match(pickerSource, /lostpointercapture/);
  assert.match(pickerSource, /pointercancel/);
});

test("媒体清理不得清空英雄素材", () => {
  const storeSource = readFileSync(
    path.join(projectRoot, "src", "media-store.js"),
    "utf8",
  );
  assert.doesNotMatch(
    storeSource,
    /clearStoredMediaAssets\(\)[\s\S]*?store\.clear\(\)/,
  );
});

test("页面节点变化会维护动态背景且离开页面时释放观察器", () => {
  const entrySource = readFileSync(
    path.join(projectRoot, "src", "entry.js"),
    "utf8",
  );

  assert.match(
    entrySource,
    /MutationObserver\(\(\)\s*=>\s*\{[\s\S]*?mediaManager\.maintain\(\)/,
  );
  assert.match(
    entrySource,
    /pagehide[\s\S]*?observer\?\.disconnect\(\)[\s\S]*?mediaManager\.dispose\(\)/,
  );
});

test("全部主题的正文与次要文字均保持普通文本对比度", () => {
  const styles = readFileSync(
    path.join(projectRoot, "src", "styles.css"),
    "utf8",
  );

  for (const theme of [
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
  ]) {
    const page = themeVariable(styles, theme, "ld-page-bg");
    const primary = themeVariable(styles, theme, "primary");
    const muted = themeVariable(styles, theme, "ld-muted");
    assert.ok(
      contrastRatio(primary, page) >= 4.5,
      `${theme} 正文对比度不足`,
    );
    assert.ok(
      contrastRatio(muted, page) >= 4.5,
      `${theme} 次要文字对比度不足`,
    );
  }
});
