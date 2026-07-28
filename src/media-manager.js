import { parseMediaPackFiles } from "./media-pack.js";
import {
  clearStoredMediaAssets,
  getStoredMediaAsset,
  storeMediaAssets,
} from "./media-store.js";

export function waitForDocumentBody(document) {
  if (document.body) return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });
}

export function createMediaManager({
  document,
  matchMedia = globalThis.matchMedia?.bind(globalThis),
  createObjectURL = URL.createObjectURL.bind(URL),
  revokeObjectURL = URL.revokeObjectURL.bind(URL),
  getMediaAsset = getStoredMediaAsset,
  setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
}) {
  const loopRestartLead = Object.freeze({
    "yamada-sky": 0.5,
  });
  let revision = 0;
  let currentObjectUrls = [];
  let currentState = null;
  let currentMediaKey = null;
  let activeKind = null;
  let mediaRoot = null;
  let video = null;
  let boundVideo = null;
  let recoveryTimer = null;
  let stoppingVideo = false;

  function canPlayVideo() {
    return Boolean(
      activeKind === "video" &&
        currentState?.motionEnabled &&
        !document.hidden &&
        video?.src,
    );
  }

  function clearRecoveryTimer() {
    if (recoveryTimer !== null) {
      clearTimeoutFn?.(recoveryTimer);
      recoveryTimer = null;
    }
  }

  function schedulePlaybackRecovery() {
    if (stoppingVideo || !canPlayVideo() || !setTimeoutFn) return;
    clearRecoveryTimer();
    recoveryTimer = setTimeoutFn(() => {
      recoveryTimer = null;
      maintain().catch(() => {});
    }, 160);
  }

  function handleVideoEnded() {
    if (video) video.currentTime = 0.01;
    schedulePlaybackRecovery();
  }

  function handleVideoTimeUpdate() {
    const lead = loopRestartLead[currentState?.theme];
    if (
      !lead ||
      !video ||
      !Number.isFinite(video.duration) ||
      video.currentTime < 1 ||
      video.currentTime < video.duration - lead
    ) {
      return;
    }
    video.currentTime = 0.01;
    video.play().catch(() => {});
  }

  function detachVideoListeners() {
    if (!boundVideo) return;
    boundVideo.removeEventListener("ended", handleVideoEnded);
    boundVideo.removeEventListener("pause", schedulePlaybackRecovery);
    boundVideo.removeEventListener("stalled", schedulePlaybackRecovery);
    boundVideo.removeEventListener("timeupdate", handleVideoTimeUpdate);
    boundVideo = null;
  }

  function attachVideoListeners(activeVideo) {
    if (boundVideo === activeVideo) return;
    detachVideoListeners();
    boundVideo = activeVideo;
    activeVideo.addEventListener("ended", handleVideoEnded);
    activeVideo.addEventListener("pause", schedulePlaybackRecovery);
    activeVideo.addEventListener("stalled", schedulePlaybackRecovery);
    activeVideo.addEventListener("timeupdate", handleVideoTimeUpdate);
  }

  function ensureVideo() {
    if (video?.isConnected) return video;
    detachVideoListeners();
    mediaRoot = document.getElementById("ld-theme-suite-media");
    if (!mediaRoot) {
      mediaRoot = document.createElement("div");
      mediaRoot.id = "ld-theme-suite-media";
      mediaRoot.setAttribute("aria-hidden", "true");
    }
    video = mediaRoot.querySelector("video");
    if (!video) {
      video = document.createElement("video");
      video.id = "ld-theme-suite-video";
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      mediaRoot.append(video);
    }
    attachVideoListeners(video);
    if (!mediaRoot.isConnected) {
      document.body.prepend(mediaRoot);
    }
    return video;
  }

  function createTrackedObjectUrl(blob) {
    const objectUrl = createObjectURL(blob);
    currentObjectUrls.push(objectUrl);
    return objectUrl;
  }

  function releaseObjectUrls() {
    for (const objectUrl of currentObjectUrls) {
      revokeObjectURL(objectUrl);
    }
    currentObjectUrls = [];
  }

  function stopVideo() {
    if (!video) return;
    stoppingVideo = true;
    clearRecoveryTimer();
    video.pause();
    video.removeAttribute("src");
    video.load();
    mediaRoot?.removeAttribute("data-ld-active");
    stoppingVideo = false;
  }

  async function apply(state, { force = false } = {}) {
    const reducedMotion =
      matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const nextMediaKey = [
      state.theme,
      state.motionEnabled && !reducedMotion ? "motion" : "static",
    ].join(":");
    currentState = { ...state };
    if (!force && nextMediaKey === currentMediaKey) {
      await maintain();
      return;
    }
    currentMediaKey = nextMediaKey;
    const requestedRevision = ++revision;
    const root = document.documentElement;
    activeKind = null;
    releaseObjectUrls();
    stopVideo();
    root.style.removeProperty("--ld-runtime-hero-image");
    root.style.removeProperty("--ld-video-poster-image");

    const [imageAsset, videoAsset] = await Promise.all([
      getMediaAsset(state.theme, "image"),
      state.motionEnabled
        ? getMediaAsset(state.theme, "video")
        : Promise.resolve(null),
    ]);
    if (requestedRevision !== revision) return;

    const selectedAsset =
      state.motionEnabled && !reducedMotion && videoAsset
        ? videoAsset
        : imageAsset;
    if (!selectedAsset?.blob) return;

    if (selectedAsset === videoAsset) {
      const posterObjectUrl = imageAsset?.blob
        ? createTrackedObjectUrl(imageAsset.blob)
        : null;
      const videoObjectUrl = createTrackedObjectUrl(videoAsset.blob);
      await waitForDocumentBody(document);
      if (requestedRevision !== revision) return;
      const activeVideo = ensureVideo();
      root.style.setProperty("--ld-runtime-hero-image", "none");
      if (posterObjectUrl) {
        root.style.setProperty(
          "--ld-video-poster-image",
          `url("${posterObjectUrl}")`,
        );
      }
      activeVideo.src = videoObjectUrl;
      mediaRoot.dataset.ldActive = "true";
      activeKind = "video";
      activeVideo.play().catch(() => {});
    } else {
      const imageObjectUrl = createTrackedObjectUrl(imageAsset.blob);
      activeKind = "image";
      root.style.setProperty(
        "--ld-runtime-hero-image",
        `url("${imageObjectUrl}")`,
      );
    }
  }

  async function importFiles(files) {
    const pack = await parseMediaPackFiles(files);
    return importPack(pack);
  }

  async function importPack(pack) {
    const result = await storeMediaAssets(pack);
    if (currentState) await apply(currentState, { force: true });
    return result;
  }

  function suspend() {
    revision += 1;
    releaseObjectUrls();
    stopVideo();
    activeKind = null;
    currentMediaKey = null;
    document.documentElement.style.removeProperty("--ld-runtime-hero-image");
    document.documentElement.style.removeProperty("--ld-video-poster-image");
  }

  async function clear() {
    await clearStoredMediaAssets();
    suspend();
  }

  async function maintain() {
    if (!canPlayVideo()) return;
    if (!video?.isConnected || !mediaRoot?.isConnected) {
      await apply(currentState, { force: true });
      return;
    }
    if (video.ended) video.currentTime = 0.01;
    if (video.paused) {
      await video.play().catch(() => {});
    }
  }

  function handleVisibility() {
    if (!video?.src) return;
    if (document.hidden) {
      stoppingVideo = true;
      video.pause();
      stoppingVideo = false;
    } else if (currentState?.motionEnabled) {
      maintain().catch(() => {});
    }
  }

  document.addEventListener("visibilitychange", handleVisibility);

  return {
    apply,
    maintain,
    importFiles,
    importPack,
    suspend,
    clear,
    dispose() {
      revision += 1;
      document.removeEventListener("visibilitychange", handleVisibility);
      clearRecoveryTimer();
      releaseObjectUrls();
      stopVideo();
      detachVideoListeners();
      mediaRoot?.remove();
      activeKind = null;
      currentMediaKey = null;
      document.documentElement.style.removeProperty("--ld-runtime-hero-image");
      document.documentElement.style.removeProperty("--ld-video-poster-image");
    },
  };
}
