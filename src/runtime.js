import { THEME_KEYS, getThemeDefinition } from "./theme-registry.js";

const DEFAULT_THEME = "crimson-duo";
const DEFAULT_BACKGROUND_OPACITY = 0.78;
const DEFAULT_MOTION_ENABLED = true;
const DEFAULT_ROTATION_ENABLED = false;
const DEFAULT_TEXT_COLOR_ENABLED = false;
const DEFAULT_TEXT_COLOR = "#24343d";

export function normalizeThemeKey(value) {
  return THEME_KEYS.includes(value) ? value : DEFAULT_THEME;
}

export function normalizeBackgroundOpacity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BACKGROUND_OPACITY;
  return Math.round(Math.min(1, Math.max(0.35, parsed)) * 100) / 100;
}

export function normalizeMotionEnabled(value) {
  return typeof value === "boolean" ? value : DEFAULT_MOTION_ENABLED;
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeTextColor(value) {
  const color = String(value ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : DEFAULT_TEXT_COLOR;
}

function getNextThemeKey(themeKey) {
  const current = normalizeThemeKey(themeKey);
  const index = THEME_KEYS.indexOf(current);
  return THEME_KEYS[(index + 1) % THEME_KEYS.length];
}

function getPanelOpacityTokens(backgroundOpacity) {
  const panel = Math.round((1.2 - backgroundOpacity) * 100) / 100;
  const fade = 1 - backgroundOpacity;

  return {
    panel,
    strong: Math.round(Math.min(0.96, panel + 0.2) * 100) / 100,
    soft: Math.round(Math.max(0.1, panel - 0.1) * 100) / 100,
    blur: Math.round((1 - backgroundOpacity) * 28),
    strongBlur: Math.round((1 - backgroundOpacity) * 24),
    fadeMid: Math.round(fade * 18) / 100,
    fadeLower: Math.round(fade * 90) / 100,
    fadeEnd: Math.round(Math.min(1, fade * 1.5) * 100) / 100,
  };
}

export function applyThemeToRoot(root, themeKey, backgroundOpacity) {
  const theme = normalizeThemeKey(themeKey);
  const opacity = normalizeBackgroundOpacity(backgroundOpacity);
  const definition = getThemeDefinition(theme);
  const panelOpacity = getPanelOpacityTokens(opacity);

  root.dataset.ldTheme = theme;
  if (definition.palette) {
    root.dataset.ldPalette = definition.palette;
  } else {
    delete root.dataset.ldPalette;
  }
  root.style.colorScheme = definition.scheme;
  const themeTokens = {
    "--ld-accent": definition.accent,
    "--ld-accent-strong": definition.accentStrong,
    "--ld-image-position": definition.position,
    "--ld-mobile-image-position": definition.mobilePosition,
    "--ld-media-fit": definition.fit,
  };
  for (const [property, value] of Object.entries(themeTokens)) {
    if (value) {
      root.style.setProperty(property, value);
    } else {
      root.style.removeProperty?.(property);
    }
  }
  if (definition.bundled) {
    root.style.removeProperty?.("--ld-bundled-hero-image");
  } else {
    root.style.setProperty("--ld-bundled-hero-image", "none");
  }
  root.style.setProperty("--ld-bg-opacity", String(opacity));
  root.style.setProperty("--ld-panel-opacity", String(panelOpacity.panel));
  root.style.setProperty(
    "--ld-panel-strong-opacity",
    String(panelOpacity.strong),
  );
  root.style.setProperty("--ld-panel-soft-opacity", String(panelOpacity.soft));
  root.style.setProperty("--ld-panel-blur", `${panelOpacity.blur}px`);
  root.style.setProperty(
    "--ld-panel-strong-blur",
    `${panelOpacity.strongBlur}px`,
  );
  root.style.setProperty(
    "--ld-fade-mid-opacity",
    String(panelOpacity.fadeMid),
  );
  root.style.setProperty(
    "--ld-fade-lower-opacity",
    String(panelOpacity.fadeLower),
  );
  root.style.setProperty(
    "--ld-fade-end-opacity",
    String(panelOpacity.fadeEnd),
  );

  return { theme, backgroundOpacity: opacity };
}

export function createThemeController({
  root,
  getValue,
  setValue,
  onChange = () => {},
}) {
  let state = {
    theme: DEFAULT_THEME,
    backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
    motionEnabled: DEFAULT_MOTION_ENABLED,
    rotationEnabled: DEFAULT_ROTATION_ENABLED,
    textColorEnabled: DEFAULT_TEXT_COLOR_ENABLED,
    textColor: DEFAULT_TEXT_COLOR,
  };

  function commit(nextState) {
    const themeState = applyThemeToRoot(
      root,
      nextState.theme,
      nextState.backgroundOpacity,
    );
    state = {
      ...themeState,
      motionEnabled: normalizeMotionEnabled(nextState.motionEnabled),
      rotationEnabled: normalizeBoolean(
        nextState.rotationEnabled,
        DEFAULT_ROTATION_ENABLED,
      ),
      textColorEnabled: normalizeBoolean(
        nextState.textColorEnabled,
        DEFAULT_TEXT_COLOR_ENABLED,
      ),
      textColor: normalizeTextColor(nextState.textColor),
    };
    root.dataset.ldMotionEnabled = String(state.motionEnabled);
    root.dataset.ldThemeRotationEnabled = String(state.rotationEnabled);
    root.dataset.ldTextColorEnabled = String(state.textColorEnabled);
    root.style.setProperty("--ld-text-color", state.textColor);
    onChange({ ...state });
    return { ...state };
  }

  return {
    initialize() {
      const rotationEnabled = normalizeBoolean(
        getValue(
          "ld-theme-rotation-enabled",
          DEFAULT_ROTATION_ENABLED,
        ),
        DEFAULT_ROTATION_ENABLED,
      );
      let theme = normalizeThemeKey(getValue("ld-theme", DEFAULT_THEME));
      if (rotationEnabled) {
        theme = getNextThemeKey(theme);
        setValue("ld-theme", theme);
      }
      return commit({
        theme,
        backgroundOpacity: getValue(
          "ld-bg-opacity",
          DEFAULT_BACKGROUND_OPACITY,
        ),
        motionEnabled: getValue(
          "ld-motion-enabled",
          DEFAULT_MOTION_ENABLED,
        ),
        rotationEnabled,
        textColorEnabled: getValue(
          "ld-text-color-enabled",
          DEFAULT_TEXT_COLOR_ENABLED,
        ),
        textColor: getValue("ld-text-color", DEFAULT_TEXT_COLOR),
      });
    },
    setTheme(theme) {
      const normalized = normalizeThemeKey(theme);
      setValue("ld-theme", normalized);
      return commit({ ...state, theme: normalized });
    },
    setBackgroundOpacity(backgroundOpacity) {
      const normalized = normalizeBackgroundOpacity(backgroundOpacity);
      setValue("ld-bg-opacity", normalized);
      return commit({ ...state, backgroundOpacity: normalized });
    },
    setMotionEnabled(motionEnabled) {
      const normalized = normalizeMotionEnabled(motionEnabled);
      setValue("ld-motion-enabled", normalized);
      return commit({ ...state, motionEnabled: normalized });
    },
    setRotationEnabled(rotationEnabled) {
      const normalized = normalizeBoolean(
        rotationEnabled,
        DEFAULT_ROTATION_ENABLED,
      );
      setValue("ld-theme-rotation-enabled", normalized);
      return commit({ ...state, rotationEnabled: normalized });
    },
    setTextColorEnabled(textColorEnabled) {
      const normalized = normalizeBoolean(
        textColorEnabled,
        DEFAULT_TEXT_COLOR_ENABLED,
      );
      setValue("ld-text-color-enabled", normalized);
      return commit({ ...state, textColorEnabled: normalized });
    },
    setTextColor(textColor) {
      const normalized = normalizeTextColor(textColor);
      setValue("ld-text-color", normalized);
      return commit({ ...state, textColor: normalized });
    },
    getState() {
      return { ...state };
    },
  };
}
