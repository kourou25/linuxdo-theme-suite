// ==UserScript==
// @name         __USERSCRIPT_NAME__
// @namespace    https://linux.do/
// @version      __USERSCRIPT_VERSION__
// @description  __USERSCRIPT_DESCRIPTION__
// @match        https://linux.do/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  GM_addStyle(__STYLES_JSON__);

__SOURCE__
})();
