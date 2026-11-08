/*
 * customize.js —— 自定义设置面板 UI 与交互（window.FYCustomize，任务 #10）
 *
 * 依据：CONTRACT.md（含补丁 v1.2 P1~P13）/ 01-ux-spec.md / 02-icons-spec.md /
 *       03-search-spec.md / 05-settings-schema.md / 06-bing-wallpaper-api.md / 00-constraints.md
 *
 * 纪律：
 *  1. 纯 ES5、IIFE、无 import/export、无构建、无依赖；只挂单一全局 window.FYCustomize。
 *  2. 面板内容全部注入到 dev-integrate 提供的空容器 #fy-settings-btn / #fy-panel，
 *     绝不修改任何存量 HTML/CSS/JS；CSS 只在 customize.css 覆盖 .fy-edit（不改 index.css）。
 *  3. 所有写入一律走 FYSettings.patch，禁止直接写 localStorage；配置变更靠
 *     fy:settings-change / FYSettings.subscribe 驱动其它模块重绘，避免无限循环。
 *  4. 所有外部依赖（FYSettings / FYTheme / FYIcons / FYSearchCustomize / FYSearch / FYAI）
 *     一律做 typeof 特性检测 + try/catch 兜底：缺失 / 配置损坏 / 无 JS 时面板降级隐藏，
 *     绝不抛异常导致页面崩溃。四个 API open/close/toggle/isOpen 恒存在且切换不抛错。
 *  5. 用户可控文本一律 textContent / setAttribute，绝不拼进 innerHTML（XSS 防护）。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var S = null;                       // FYSettings（boot 时赋值）
  var ready = false;                  // boot 成功标记；false 时所有 API 安全 no-op

  /* ---------------- 模块级状态 ---------------- */
  var panel = null, btn = null;
  var editBar = null, confirmLayer = null;
  var isOpenState = false, isMobile = false, editMode = false;
  var activeTab = 'icons';
  var undoStack = [];
  var savedFocus = null;
  var closeTimer = null, saveTimer = null;
  var pendingConfirm = null;         // { onConfirm, onCancel, trigger }
  var itemFormHost = null;           // 当前打开的 inline-form 宿主
  var bingLoadTimer = null;
  var bingAwaiting = false;   // 「立即换一张」进行中：全部源失败清缓存时据此立即显示回退状态
  var iconSeq = 0;

  /* 面板 DOM 引用（用直接引用，不依赖 querySelector 找回，适配极简 DOM 桩） */
  var R = {};

  /* ---------------- 常量 ---------------- */
  var TABS = ['icons', 'search', 'theme', 'data'];
  var TAB_LABEL = { icons: '图标', search: '搜索', theme: '背景', data: '数据' };
  var TAB_SECTION = { icons: 'icons', search: 'search', theme: 'theme', data: 'ui' };
  var SECTION_OF_TAB = { icons: 'icons', search: 'search', theme: 'theme', data: 'ui' };
  var BUILTIN_ENGINE_IDS = ['bing', 'baidu', 'google', 'ai', 'bilibili', 'github', 'douban'];

  var GEAR_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3.2"/>' +
    '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.4.66.74.85.3.17.64.26.99.25H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>' +
    '</svg>';

  /* 02 §1.5：本地 21 图标库（排除 brand-foryouos.svg） */
  var LOCAL_ICONS = [
    ['assert/brand-icourse163.png', '中国大学MOOC'],
    ['assert/brand-xuetangx.png', '学堂在线'],
    ['assert/brand-netease-open.png', '网易公开课'],
    ['assert/brand-cctv.png', 'CCTV'],
    ['assert/brand-bilibili.png', 'B站'],
    ['assert/brand-iconfont.svg', '矢量图'],
    ['assert/brand-iqiyi.png', '爱奇艺'],
    ['assert/brand-hitokoto.png', '一言'],
    ['assert/brand-imgtg.png', '图床'],
    ['assert/brand-cloudflare.png', 'Cloudflare'],
    ['assert/brand-tencent-video.svg', '腾讯视频'],
    ['assert/brand-douban.png', '豆瓣'],
    ['assert/brand-doubao.png', '豆包'],
    ['assert/brand-gemini.png', 'Gemini'],
    ['assert/brand-chatgpt.svg', 'ChatGPT'],
    ['assert/brand-deepseek.svg', 'DeepSeek'],
    ['assert/brand-workbuddy.svg', 'WorkBuddy'],
    ['assert/brand-weread.png', '微信读书'],
    ['assert/brand-bookan.png', '博看书苑'],
    ['assert/brand-canva.svg', 'Canva'],
    ['assert/brand-wechat.png', '微信公众号']
  ];

  /* 06 §2：bing 配置枚举 */
  var BING_SOURCES = [
    ['auto', '自动（依次备用）'],
    ['biturl-json', '必应 JSON 接口'],
    ['biturl-image', '必应图片直链'],
    ['bing-th', '必应官方图片'],
    ['qqsuu', 'QQ 酥酥'],
    ['vvhan', '韩小韩 API'],
    ['oioweb', 'OIOWEB'],
    ['pearktrue', 'Pearktrue'],
    ['custom', '自定义 API']
  ];
  var BING_MKTS = ['zh-CN', 'en-US', 'ja-JP', 'en-GB', 'de-DE', 'fr-FR', 'random'];
  var BING_RES = ['1920x1080', 'UHD', '1366x768'];
  var BING_REFRESH = ['daily', 'every-load', 'manual'];

  var RE_PARAM = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;   // P3 放宽正则（兜底）
  var RE_HTTP = /^https?:\/\//i;
  var RE_DATA_IMG = /^data:image\/(png|jpeg|webp);base64,/i;
  var RE_ASSERT_ICON = /^assert\/[^\s"'<>]+$/;
  var RE_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  var RE_GRADIENT = /^(linear|radial|conic)-gradient\(/i;
  var ICON_MAX_CHARS = 256 * 1024;        // 02 §5.6 / P13
  var BG_MAX_CHARS = 1400000;             // 05 §4
  var TITLE_MAX = 40, URL_MAX = 2048;

  /* ================================================================== *
   * 通用工具
   * ================================================================== */
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return {}; } }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function str(v) { return (typeof v === 'string') ? v : ''; }
  function num(v, def) { var n = Number(v); return isFinite(n) ? n : def; }
  function bool(v, def) { return (typeof v === 'boolean') ? v : def; }

  function h(tag, attrs, kids) {
    var e;
    try { e = doc.createElement(tag); } catch (err) { return null; }
    if (attrs) {
      for (var k in attrs) if (hasOwn(attrs, k)) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) { continue; }
        if (k === 'text') { e.textContent = String(v); }
        else if (k === 'html') { try { e.innerHTML = String(v); } catch (err2) {} }
        else if (k === 'class') { e.className = String(v); }
        else if (k === 'checked' || k === 'disabled' || k === 'hidden') {
          if (v) { try { e[k] = true; } catch (err3) {} e.setAttribute(k, ''); }
        } else if (k === 'value') { try { e.value = String(v); } catch (err4) {} e.setAttribute('value', String(v)); }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') { on(e, k.slice(2), v); }
        else { try { e.setAttribute(k, String(v)); } catch (err5) {} }
      }
    }
    if (kids) {
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c === null || c === undefined || c === false) { continue; }
        try {
          if (typeof c === 'string' || typeof c === 'number') e.appendChild(doc.createTextNode(String(c)));
          else e.appendChild(c);
        } catch (err6) {}
      }
    }
    return e;
  }
  function on(node, evt, fn) {
    if (!node) { return; }
    try { node.addEventListener(evt, fn, false); } catch (e) {}
  }
  function setText(node, t) { if (node) { try { node.textContent = (t === undefined || t === null) ? '' : String(t); } catch (e) {} } }
  function clearKids(node) {
    if (!node) { return; }
    try { while (node.firstChild) { node.removeChild(node.firstChild); } } catch (e) {
      try { node.innerHTML = ''; } catch (e2) {}
    }
  }
  function show(node, yes) {
    if (!node) { return; }
    try { if (yes) { node.removeAttribute('hidden'); node.hidden = false; } else { node.setAttribute('hidden', ''); node.hidden = true; } } catch (e) {}
  }
  function setAttr(node, k, v) { if (node) { try { node.setAttribute(k, String(v)); } catch (e) {} } }
  function getAttr(node, k) { try { return node ? node.getAttribute(k) : null; } catch (e) { return null; } }
  function addClass(node, c) { if (node && node.classList) { try { node.classList.add(c); } catch (e) {} } }
  function removeClass(node, c) { if (node && node.classList) { try { node.classList.remove(c); } catch (e) {} } }
  function hasClass(node, c) { try { return !!(node && node.classList && node.classList.contains(c)); } catch (e) { return false; } }
  function raf(fn) {
    try { if (typeof global.requestAnimationFrame === 'function') { global.requestAnimationFrame(fn); return; } } catch (e) {}
    try { global.setTimeout(fn, 16); } catch (e2) {}
  }
  function later(fn, ms) { try { return global.setTimeout(fn, ms); } catch (e) { return null; } }
  function clearT(t) { try { if (t) { global.clearTimeout(t); } } catch (e) {} }

  function safeSection(name) { try { return S.getSection(name); } catch (e) { return null; } }
  function sectionOrDefaults(name) {
    var s = safeSection(name);
    if (isObj(s)) { return s; }
    try { var d = S.defaults(); return (d && isObj(d[name])) ? d[name] : {}; } catch (e) { return {}; }
  }
  function safeConfig() { try { return S.get(); } catch (e) { return null; } }

  /* P3：优先 FYSettings.isValidParam，缺失时内置同款正则兜底 */
  function validParam(v) {
    if (S && typeof S.isValidParam === 'function') {
      try { return !!S.isValidParam(v); } catch (e) {}
    }
    return RE_PARAM.test(str(v));
  }
  function validHttpUrl(v) {
    v = str(v).replace(/^\s+|\s+$/g, '');
    return RE_HTTP.test(v) && v.length <= URL_MAX && !/[\u0000-\u001F\u007F]/.test(v);
  }
  function validIconField(v) {
    if (v === '') { return true; }
    if (typeof v !== 'string' || /[\u0000-\u001F\u007F]/.test(v)) { return false; }
    if (RE_DATA_IMG.test(v)) { return v.length <= ICON_MAX_CHARS; }
    var t = v.replace(/^\s+|\s+$/g, '');
    if (RE_HTTP.test(t)) { return v.length <= URL_MAX; }
    if (RE_ASSERT_ICON.test(v) && v.indexOf('..') === -1) { return v.length <= URL_MAX; }
    return false;
  }
  function validTitle(v) { return typeof v === 'string' && v.length >= 1 && v.length <= TITLE_MAX; }
  function validColor(v) { return RE_COLOR.test(str(v)); }
  function validGradient(v) {
    v = str(v);
    return v.length <= 256 && RE_GRADIENT.test(v) && !/url\(|@import|expression\(|;|<|>/i.test(v);
  }

  function friendlyError(err) {
    var e = str(err);
    if (e.indexOf('QUOTA_EXCEEDED') !== -1) {
      return '浏览器本地存储已满，本次设置未能保存。请改用更小的背景图，或把背景改成纯色 / 渐变 / 图片网址。';
    }
    if (e.indexOf('STORAGE_DISABLED') !== -1) {
      return '当前浏览器禁用了本地存储（如无痕/隐私模式），设置只在本次打开期间有效，刷新后会恢复。';
    }
    if (e.indexOf('IMAGE_TOO_LARGE') !== -1) { return '图片过大，已自动压缩；仍无法保存请换用更小的图片或改用图片网址。'; }
    if (e.indexOf('VALIDATION_FAILED') !== -1) {
      var detail = e.split(':').slice(1).join(':').replace(/^\s+/, '');
      return '该项设置值不合法，已忽略；请重新填写。' + (detail ? '（' + detail + '）' : '');
    }
    return '无法保存到本机，改动仅在本次打开期间有效，刷新后会恢复。';
  }

  function genIconId(taken) {
    var id;
    do {
      iconSeq++;
      id = 'ic-u-' + (new Date()).getTime().toString(36) + '-' + iconSeq.toString(36) + '-' +
        Math.random().toString(36).slice(2, 5);
      id = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    } while (taken && taken[id]);
    return id;
  }
  function collectIconIds(icons) {
    var m = {};
    try {
      var rows = (icons && icons.rows) || [];
      for (var i = 0; i < rows.length; i++) {
        var items = (rows[i] && rows[i].items) || [];
        for (var j = 0; j < items.length; j++) {
          var it = items[j];
          if (it && it.id) { m[it.id] = true; }
          var cs = it.children || [];
          for (var k = 0; k < cs.length; k++) { if (cs[k] && cs[k].id) { m[cs[k].id] = true; } }
        }
      }
    } catch (e) {}
    return m;
  }
  function genEngineId(taken) {
    var id;
    do {
      id = 'se-' + (new Date()).getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      id = id.replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    } while (!id || taken[id] || BUILTIN_ENGINE_IDS.indexOf(id) !== -1);
    return id;
  }
  function engineIdMap(search) {
    var m = {}, es = (search && search.engines) || [];
    for (var i = 0; i < es.length; i++) { if (es[i] && es[i].id) { m[es[i].id] = true; } }
    return m;
  }

  /* ================================================================== *
   * 保存 / 状态 / 撤销 / 订阅
   * ================================================================== */
  function saveNodes() {
    var out = [];
    try {
      var list = doc.querySelectorAll ? doc.querySelectorAll('.fy-save-status') : null;
      if (list) { for (var i = 0; i < list.length; i++) { out.push(list[i]); } }
    } catch (e) {}
    return out;
  }
  function setSaveStatus(text, state) {
    var list = saveNodes();
    for (var i = 0; i < list.length; i++) {
      setText(list[i], text);
      if (state) { setAttr(list[i], 'data-fy-state', state); }
      else { try { list[i].removeAttribute('data-fy-state'); } catch (e) {} }
    }
    clearT(saveTimer);
    if (state === 'ok') {
      saveTimer = later(function () { setSaveStatus('所有改动已保存', ''); }, 1600);
    }
  }
  function pushUndo(snapshot) {
    if (!snapshot) { return; }
    undoStack.push(clone(snapshot));
    if (undoStack.length > 20) { undoStack.shift(); }
    refreshUndoButtons();
  }
  function refreshUndoButtons() {
    var disabled = undoStack.length === 0;
    if (R.undoBtn) { try { R.undoBtn.disabled = disabled; } catch (e) {} setAttr(R.undoBtn, 'title', disabled ? '没有可撤销的操作' : '撤销（Ctrl/Cmd+Z）'); }
    if (R.editUndoBtn) { try { R.editUndoBtn.disabled = disabled; } catch (e) {} }
  }
  function undo() {
    if (!undoStack.length) { return; }
    var snap = undoStack.pop();
    try {
      if (S && typeof S.setAll === 'function') {
        var r = S.setAll(snap);
        if (r && r.ok) {
          setSaveStatus('已撤销上一步', 'info');
          rebuildActivePane();
          refreshUndoButtons();
          return;
        }
      }
    } catch (e) {}
    setSaveStatus('撤销失败，配置未改动。', 'error');
  }

  /* save：所有写入的唯一入口。patch 前记录快照，成功后入撤销栈；失败显示中文错误。 */
  function save(section, partial, opts) {
    opts = opts || {};
    var before = safeConfig();
    var r;
    try { r = S.patch(section, partial); } catch (e) { r = { ok: false, error: 'STORAGE_ERROR' }; }
    if (r && r.ok) {
      pushUndo(before);
      setSaveStatus('✓ 已自动保存', 'ok');
      // 图标段：编辑态下由订阅回调 render 后重新注入装饰节点（延迟到广播回调之后）
      if (section === 'icons' && editMode && !isMobile) { later(decorateEdit, 0); }
      if (opts.onOk) { try { opts.onOk(); } catch (e) {} }
      return true;
    }
    var msg = friendlyError(r && r.error);
    setSaveStatus('⚠ ' + msg, 'error');
    if (opts.onError) { try { opts.onError(msg, r && r.error); } catch (e) {} }
    return false;
  }

  /* P2 顺序：先 FYSearchCustomize.apply（原地改）再 FYSearch.refresh（重绘）。
     两者都不写盘、不广播，故不会触发 fy:settings-change → 无无限循环。 */
  function tryApplyRefresh() {
    try {
      var sc = global.FYSearchCustomize, fs = global.FYSearch;
      if (sc && typeof sc.apply === 'function' && fs && fs.config && fs.engines &&
          typeof fs.refresh === 'function') {
        sc.apply(fs.config, fs.engines);
        fs.refresh();
      }
    } catch (e) {}
  }

  function onSettingsChange(config, detail) {
    var d = detail || {};
    try {
      if (d.source === 'storage') { setSaveStatus('已同步其它标签页的改动', 'info'); }
      else if (d.source === 'import' || d.source === 'reset') { setSaveStatus('所有改动已保存', ''); }
      // 搜索段 / 全量：按 P2 顺序重新合并并刷新引擎标签（订阅驱动，面板不直接调 refresh 之外）
      if (d.section === 'search' || d.section === '*') { tryApplyRefresh(); }
      // 图标段编辑态：dev-icons 订阅回调 render 之后重新注入装饰节点
      if ((d.section === 'icons' || d.section === '*') && editMode && !isMobile) { later(decorateEdit, 0); }
      // 只读展示刷新（不重建正在输入的表单、不抢焦点）
      refreshReadOnly(d);
      // 壁纸状态 / 版权刷新
      if (d.section === 'theme' || d.section === '*') { refreshBingReadonly(); }
      // 跨标签同步：把当前 pane 控件值同步为最新配置（不重建、不抢焦点）
      if (d.source === 'storage') { syncActivePaneValues(); }
    } catch (e) {}
  }

  /* ================================================================== *
   * 面板骨架 / 入口按钮
   * ================================================================== */
  function buildPanel() {
    // 补齐 role / aria（HTML 由 dev-integrate 提供，role 可能已带，这里统一覆盖）
    setAttr(panel, 'role', 'dialog');
    setAttr(panel, 'aria-modal', 'true');
    setAttr(panel, 'aria-labelledby', 'fy-panel-title');

    var head = h('header', { 'class': 'fy-panel-head' });
    R.title = h('h2', { 'class': 'fy-panel-title', id: 'fy-panel-title', text: '自定义设置' });
    R.status = h('span', { 'class': 'fy-save-status', role: 'status', 'aria-live': 'polite', text: '所有改动已保存' });
    R.undoBtn = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', id: 'fy-undo-btn',
      'aria-label': '撤销上一步', title: '撤销（Ctrl/Cmd+Z）', disabled: true, text: '撤销' });
    R.closeBtn = h('button', { type: 'button', 'class': 'fy-btn fy-btn-icon', id: 'fy-panel-close',
      'aria-label': '关闭设置', title: '关闭（Esc）', text: '×' });
    head.appendChild(R.title); head.appendChild(R.status);
    head.appendChild(R.undoBtn); head.appendChild(R.closeBtn);

    var tabs = h('div', { 'class': 'fy-tabs', role: 'tablist', 'aria-label': '设置分类' });
    R.tabs = tabs;
    R.tabBtns = {};
    for (var i = 0; i < TABS.length; i++) {
      (function (name) {
        var t = h('button', { type: 'button', 'class': 'fy-tab', id: 'fy-tab-' + name, role: 'tab',
          'aria-controls': 'fy-pane-' + name, 'aria-selected': 'false', tabindex: '-1', text: TAB_LABEL[name] });
        on(t, 'click', function () { setActiveTab(name); });
        R.tabBtns[name] = t;
        tabs.appendChild(t);
      })(TABS[i]);
    }

    var body = h('div', { 'class': 'fy-panel-body' });
    R.panes = {};
    for (var j = 0; j < TABS.length; j++) {
      (function (name) {
        var p = h('section', { 'class': 'fy-pane', id: 'fy-pane-' + name, role: 'tabpanel',
          'aria-labelledby': 'fy-tab-' + name, hidden: true });
        R.panes[name] = p;
        body.appendChild(p);
      })(TABS[j]);
    }

    clearKids(panel);
    panel.appendChild(head);
    panel.appendChild(tabs);
    panel.appendChild(body);

    on(R.closeBtn, 'click', function () { close(); });
    on(R.undoBtn, 'click', function () { undo(); });
    on(tabs, 'keydown', onTabKeydown);
    on(panel, 'keydown', onPanelKeydown);
    refreshUndoButtons();
  }

  function injectButton() {
    // 注入齿轮（静态可信字符串），补 aria-controls / aria-expanded
    try { btn.innerHTML = GEAR_SVG; } catch (e) {}
    setAttr(btn, 'aria-controls', 'fy-panel');
    setAttr(btn, 'aria-expanded', 'false');
    if (!getAttr(btn, 'aria-label')) { setAttr(btn, 'aria-label', '打开自定义设置'); }
    if (!getAttr(btn, 'title')) { setAttr(btn, 'title', '自定义设置（图标 / 搜索 / 背景 / 数据）'); }
    addClass(btn, 'fy-ready');
    on(btn, 'click', function () { toggle(); });
  }

  /* ================================================================== *
   * 状态机 open / close / toggle / isOpen
   * ================================================================== */
  function preferReducedMotion() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }
  function rememberFocus() { try { savedFocus = doc.activeElement; } catch (e) { savedFocus = null; } }
  function focusFirst() {
    var t = R.tabBtns && R.tabBtns[activeTab];
    if (t) { try { t.focus(); } catch (e) {} }
  }
  function restoreFocus() {
    var el = savedFocus;
    if (el && typeof el.focus === 'function') { try { el.focus(); return; } catch (e) {} }
    try { if (btn && typeof btn.focus === 'function') { btn.focus(); } } catch (e2) {}
  }

  function open() {
    if (!ready || !panel) { return; }                 // 降级：容器缺失时安全 no-op
    try {
      if (isOpenState) { return; }
      rememberFocus();
      // 只读调用既有全局，避免双浮层 / 双 Esc（契约 §0 不改 AI 搜索）
      try {
        if (global.FYAI && typeof global.FYAI.isOpen === 'function' && global.FYAI.isOpen() &&
            typeof global.FYAI.close === 'function') { global.FYAI.close(); }
      } catch (e) {}
      show(panel, true);                            // 先解除 display:none（[hidden] 终态）
      clearT(closeTimer);
      raf(function () { addClass(panel, 'is-open'); });   // 下一帧加 class，保证 transition 生效
      addClass(btn, 'is-active');
      setAttr(btn, 'aria-expanded', 'true');
      try { if (doc.body && doc.body.classList) { doc.body.classList.add('fy-panel-open'); } } catch (e) {}
      isOpenState = true;
      setActiveTab(activeTab);                      // 重建当前 pane 内容
      focusFirst();
    } catch (e) {}
  }
  function close() {
    if (!panel) { return; }
    try {
      if (confirmLayer && !confirmLayer.hidden) { return; }   // 确认层打开时先由它处理 Esc
      if (!isOpenState) { return; }
      removeClass(panel, 'is-open');
      removeClass(btn, 'is-active');
      setAttr(btn, 'aria-expanded', 'false');
      try { if (doc.body && doc.body.classList) { doc.body.classList.remove('fy-panel-open'); } } catch (e) {}
      var delay = preferReducedMotion() ? 0 : 380;           // > .36s 滑出时长
      clearT(closeTimer);
      closeTimer = later(function () {
        if (!hasClass(panel, 'is-open')) { show(panel, false); }   // 动画完全结束后才置 [hidden]
      }, delay);
      isOpenState = false;
      restoreFocus();
    } catch (e) {}
  }
  function toggle() { try { if (isOpenState) { close(); } else { open(); } } catch (e) {} }
  function isOpen() { return !!isOpenState; }

  /* ================================================================== *
   * Tab 切换 / 键盘（roving tabindex + 焦点陷阱）
   * ================================================================== */
  function setActiveTab(name) {
    if (!R.tabBtns || !R.panes) { return; }
    if (TABS.indexOf(name) === -1) { name = isMobile ? 'search' : 'icons'; }
    // 移动端「图标」Tab 置灰：选中也只显示提示（§6）
    activeTab = name;
    for (var i = 0; i < TABS.length; i++) {
      var n = TABS[i], t = R.tabBtns[n], p = R.panes[n];
      var on_ = (n === name);
      setAttr(t, 'aria-selected', on_ ? 'true' : 'false');
      setAttr(t, 'tabindex', on_ ? '0' : '-1');
      if (on_) { addClass(t, 'is-active'); } else { removeClass(t, 'is-active'); }
      if (n === 'icons' && isMobile) { setAttr(t, 'aria-disabled', 'true'); }
      show(p, on_);
    }
    rebuildActivePane();
  }
  function rebuildActivePane() {
    var p = R.panes && R.panes[activeTab];
    if (!p) { return; }
    try {
      if (activeTab === 'icons') { renderIconsPane(p); }
      else if (activeTab === 'search') { renderSearchPane(p); }
      else if (activeTab === 'theme') { renderThemePane(p); }
      else if (activeTab === 'data') { renderDataPane(p); }
    } catch (e) {
      // 渲染异常不能让页面崩溃，但也不能静默留白：给出可见提示便于 QA / 用户发现。
      try { setSaveStatus('⚠ 面板内容渲染失败，请重新打开设置', 'error'); } catch (e2) {}
    }
  }
  function onTabKeydown(e) {
    var k = e.key, code = e.keyCode;
    var idx = TABS.indexOf(activeTab);
    var next = -1;
    if (k === 'ArrowRight' || code === 39) { next = (idx + 1) % TABS.length; }
    else if (k === 'ArrowLeft' || code === 37) { next = (idx - 1 + TABS.length) % TABS.length; }
    else if (k === 'Home' || code === 36) { next = 0; }
    else if (k === 'End' || code === 35) { next = TABS.length - 1; }
    if (next >= 0) {
      var name = TABS[next];
      if (name === 'icons' && isMobile) { return; }   // 移动端图标 Tab 不可键盘选中
      try { e.preventDefault(); } catch (e2) {}
      setActiveTab(name);
      var t = R.tabBtns[name];
      if (t) { try { t.focus(); } catch (e3) {} }
    }
  }
  function focusableIn(root) {
    var out = [];
    if (!root || !root.querySelectorAll) { return out; }
    try {
      var list = root.querySelectorAll('button, [href], input, select, textarea, [tabindex]');
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el.disabled) { continue; }
        if (getAttr(el, 'hidden') !== null) { continue; }
        if (el.getAttribute && el.getAttribute('tabindex') === '-1') { continue; }
        // 简单可见性判断：祖先链上无 hidden
        var p = el.parentNode, hidden = false;
        while (p && p !== root) {
          if (getAttr(p, 'hidden') !== null) { hidden = true; break; }
          p = p.parentNode;
        }
        if (!hidden) { out.push(el); }
      }
    } catch (e) {}
    return out;
  }
  function onPanelKeydown(e) {
    if (e.key !== 'Tab' && e.keyCode !== 9) { return; }
    var scope = (confirmLayer && !confirmLayer.hidden) ? confirmLayer : panel;
    var list = focusableIn(scope);
    if (!list.length) { return; }
    var first = list[0], last = list[list.length - 1];
    var ae = null;
    try { ae = doc.activeElement; } catch (e2) {}
    if (e.shiftKey && ae === first) { try { e.preventDefault(); } catch (e3) {} try { last.focus(); } catch (e4) {} }
    else if (!e.shiftKey && ae === last) { try { e.preventDefault(); } catch (e5) {} try { first.focus(); } catch (e6) {} }
  }

  /* 全局 keydown：Esc 优先级 + Ctrl/Cmd+Z（不抢 Ctrl/Cmd+K） */
  function onGlobalKeydown(e) {
    var k = e.key, code = e.keyCode;
    if (k === 'Escape' || code === 27) {
      if (confirmLayer && !confirmLayer.hidden) { try { e.preventDefault(); } catch (e2) {} closeConfirm(); return; }
      if (isOpenState) { try { e.preventDefault(); } catch (e3) {} close(); return; }
      if (editMode) { try { e.preventDefault(); } catch (e4) {} exitEditMode(); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z' || code === 90)) {
      var t = e.target, tag = (t && t.tagName) ? String(t.tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) { return; }  // 保留原生撤销
      if (undoStack.length) { try { e.preventDefault(); } catch (e5) {} undo(); }
    }
    // 面板打开但焦点在面板外（如 Ctrl/Cmd+K 移到 #kw）时，下一次 Tab 把焦点拉回面板（§5.6）
    if ((e.key === 'Tab' || e.keyCode === 9) && isOpenState && panel) {
      var ae2 = null, inside = false;
      try { ae2 = doc.activeElement; } catch (e6) {}
      try {
        var pp = ae2;
        while (pp) { if (pp === panel) { inside = true; break; } pp = pp.parentNode; }
      } catch (e7) {}
      if (!inside) { try { e.preventDefault(); } catch (e8) {} focusFirst(); }
    }
    // 不注册 Ctrl/Cmd+K：留给 search.js 既有监听聚焦 #kw（契约 §7）
  }

  /* ================================================================== *
   * 二次确认层（面板内 #fy-confirm，不用 window.confirm）
   * ================================================================== */
  function openConfirm(opts) {
    opts = opts || {};
    if (!panel) { return; }
    try {
      closeConfirm();
      var layer = h('div', { id: 'fy-confirm', role: 'alertdialog', 'aria-modal': 'true' });
      var card = h('div', { 'class': 'fy-confirm-card' });
      var title = h('h3', { 'class': 'fy-confirm-title', id: 'fy-confirm-title', text: opts.title || '请确认' });
      var desc = h('p', { 'class': 'fy-confirm-desc', id: 'fy-confirm-desc', text: opts.desc || '' });
      setAttr(layer, 'aria-labelledby', 'fy-confirm-title');
      setAttr(layer, 'aria-describedby', 'fy-confirm-desc');
      var actions = h('div', { 'class': 'fy-confirm-actions' });
      var cancel = h('button', { type: 'button', 'class': 'fy-btn', text: opts.cancelText || '取消' });
      var ok = h('button', { type: 'button', 'class': 'fy-btn ' + (opts.danger ? 'fy-btn-danger' : 'fy-btn-primary'),
        text: opts.okText || '确定' });
      actions.appendChild(cancel); actions.appendChild(ok);
      card.appendChild(title); card.appendChild(desc); card.appendChild(actions);
      layer.appendChild(card);
      panel.appendChild(layer);
      confirmLayer = layer;
      pendingConfirm = { onConfirm: opts.onConfirm, onCancel: opts.onCancel, trigger: opts.trigger };
      on(cancel, 'click', function (e) { try { e.preventDefault(); } catch (e2) {} closeConfirm(); });
      on(ok, 'click', function (e) {
        try { e.preventDefault(); } catch (e2) {}
        var fn = pendingConfirm && pendingConfirm.onConfirm;
        closeConfirm(true);
        if (fn) { try { fn(); } catch (e3) {} }
      });
      // 遮罩点击 = 取消（安全项）
      on(layer, 'click', function (e) { if (e.target === layer) { closeConfirm(); } });
      try { cancel.focus(); } catch (e4) {}
    } catch (e) {}
  }
  function closeConfirm(confirmed) {
    if (!confirmLayer) { return; }
    var pc = pendingConfirm;
    try { if (confirmLayer.parentNode) { confirmLayer.parentNode.removeChild(confirmLayer); } } catch (e) {}
    confirmLayer = null;
    pendingConfirm = null;
    if (!confirmed && pc && pc.onCancel) { try { pc.onCancel(); } catch (e2) {} }
    // 焦点回到触发按钮
    if (pc && pc.trigger) { try { pc.trigger.focus(); } catch (e3) {} }
  }

  /* ================================================================== *
   * 只读展示刷新（fy:settings-change 时调用，不重建表单 / 不抢焦点）
   * ================================================================== */
  function refreshReadOnly(d) {
    // 数据 Tab 的只读文本
    if (R.dataSize || R.dataState) {
      var cfg = safeConfig() || {};
      if (R.dataState) { setText(R.dataState, (cfg.ui && cfg.ui.hasCustomized) ? '已自定义' : '尚未自定义'); }
      if (R.dataSize) { setText(R.dataSize, '约 ' + estimateKB() + ' KB'); }
    }
  }
  function estimateKB() {
    var text = '';
    try { text = S['export'](); } catch (e) { text = JSON.stringify(safeConfig() || {}); }
    var bytes = text.length;
    try { if (typeof global.Blob === 'function') { bytes = new global.Blob([text]).size; } } catch (e2) {}
    return (Math.round(bytes / 1024 * 10) / 10).toFixed(1);
  }
  function syncActivePaneValues() {
    // 跨标签 storage 同步（§6 场景 10）：刷新当前 pane 控件值、不抢焦点；
    // 若焦点正落在输入控件或存在打开的内联表单，则跳过重建以免清空用户未提交的内容。
    try {
      var ae = doc.activeElement, tag = (ae && ae.tagName) ? String(ae.tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') { return; }
    } catch (e) {}
    if (itemFormHost && itemFormHost.parentNode) { return; }
    try { rebuildActivePane(); } catch (e2) {}
  }

  /* ================================================================== *
   * Tab 1 · 图标
   * ================================================================== */
  function renderIconsPane(pane) {
    clearKids(pane);
    if (isMobile) {
      pane.appendChild(h('p', { 'class': 'fy-empty',
        text: '请在 PC 端编辑桌面图标。此处修改的搜索 / 背景 / 数据保存在同一份配置里，PC 端打开会自动生效。' }));
      return;
    }
    var actions = h('div', { 'class': 'fy-field fy-pane-actions' });
    var editBtn = h('button', { type: 'button', 'class': 'fy-btn fy-btn-primary', id: 'fy-edit-mode-btn',
      text: '编辑桌面图标', title: '进入可视化编辑：拖拽排序、点 × 删除' });
    var addLink = h('button', { type: 'button', 'class': 'fy-btn', text: '添加图标' });
    var addGroup = h('button', { type: 'button', 'class': 'fy-btn', text: '添加分组' });
    actions.appendChild(editBtn); actions.appendChild(addLink); actions.appendChild(addGroup);
    pane.appendChild(actions);
    on(editBtn, 'click', function () { enterEditMode(); });
    on(addLink, 'click', function () { openItemForm(pane, { mode: 'add', type: 'link' }); });
    on(addGroup, 'click', function () { openItemForm(pane, { mode: 'add', type: 'group' }); });

    var icons = sectionOrDefaults('icons');
    var rows = (icons && icons.rows) || [];
    for (var i = 0; i < rows.length; i++) { pane.appendChild(buildIconRow(rows[i], i, pane)); }
    // 兜底：配置无 rows 时仍给两行空态
    if (!rows.length) {
      pane.appendChild(buildIconRow({ id: 'top', items: [] }, 0, pane));
      pane.appendChild(buildIconRow({ id: 'movie', items: [] }, 1, pane));
    }
  }
  function buildIconRow(row, idx, pane) {
    var rid = (row && row.id) || (idx === 0 ? 'top' : 'movie');
    var wrap = h('div', { 'class': 'fy-row' });
    wrap.appendChild(h('h3', { 'class': 'fy-row-title', text: (idx === 0 ? '第一行（#top_colum）' : '第二行（#movie）') }));
    var list = h('ul', { 'class': 'fy-icon-list' });
    var items = (row && row.items) || [];
    for (var j = 0; j < items.length; j++) { list.appendChild(buildIconItem(items[j], rid, pane)); }
    wrap.appendChild(list);
    if (!items.length) {
      wrap.appendChild(h('p', { 'class': 'fy-empty', text: '这一行还没有图标，点「添加图标」放一个常用站点吧。' }));
    }
    return wrap;
  }
  function buildIconItem(item, rowId, pane) {
    var li = h('li', { 'class': 'fy-icon-item' });
    setAttr(li, 'data-fy-id', item.id || '');
    setAttr(li, 'data-fy-type', item.type || 'link');
    // 缩略图 / 兜底文字（透明底：不用 box-shadow，见 customize.css）
    if (item.icon) {
      var img = h('img', { 'class': 'fy-icon-thumb', alt: '', src: item.icon });
      on(img, 'error', function () {
        try { img.parentNode && img.parentNode.replaceChild(h('span', { 'class': 'fy-icon-thumb-fallback', text: fallbackText(item) }), img); } catch (e) {}
      });
      li.appendChild(img);
    } else {
      li.appendChild(h('span', { 'class': 'fy-icon-thumb-fallback', text: fallbackText(item) }));
    }
    var meta = h('div', { 'class': 'fy-icon-meta' });
    meta.appendChild(h('span', { 'class': 'fy-icon-name', text: item.title || '' }));
    meta.appendChild(h('span', { 'class': 'fy-icon-url', text: item.url || '' }));
    li.appendChild(meta);
    if (item.type === 'group') {
      li.appendChild(h('span', { 'class': 'fy-badge', text: '分组 · ' + ((item.children || []).length) + ' 子项' }));
    } else {
      li.appendChild(h('span', { 'class': 'fy-badge', text: '链接' }));
    }
    var acts = h('div', { 'class': 'fy-icon-actions' });
    var edit = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', text: '编辑', 'aria-label': '编辑 ' + (item.title || '') });
    var del = h('button', { type: 'button', 'class': 'fy-btn fy-icon-del', text: '×', 'aria-label': '删除 ' + (item.title || '') });
    acts.appendChild(edit); acts.appendChild(del);
    li.appendChild(acts);
    on(edit, 'click', function () { openItemForm(pane, { mode: 'edit', type: item.type, rowId: rowId, item: item }); });
    on(del, 'click', function () { confirmDeleteItem(pane, rowId, item, del); });
    return li;
  }
  function fallbackText(item) {
    if (item.iconText) { return String(item.iconText).slice(0, 2); }
    var t = str(item.title).replace(/^\s+/, '');
    return t ? t.charAt(0) : '?';
  }
  function confirmDeleteItem(pane, rowId, item, trigger) {
    var host = h('div', { 'class': 'fy-confirm-inline' });
    var extra = (item.type === 'group') ? ('删除分组会一起移除它的 ' + ((item.children || []).length) + ' 个子项。') : '';
    host.appendChild(h('p', { 'class': 'fy-confirm-text', text: '确定删除「' + (item.title || '') + '」吗？' + extra }));
    var acts = h('div', { 'class': 'fy-form-actions' });
    var cancel = h('button', { type: 'button', 'class': 'fy-btn', text: '取消' });
    var ok = h('button', { type: 'button', 'class': 'fy-btn fy-btn-danger', text: '删除' });
    acts.appendChild(cancel); acts.appendChild(ok);
    host.appendChild(acts);
    on(cancel, 'click', function () { try { host.parentNode && host.parentNode.removeChild(host); } catch (e) {} try { trigger.focus(); } catch (e2) {} });
    on(ok, 'click', function () { deleteItem(rowId, item.id); });
    // 插入到该项 li 之后
    var li = findIconLi(pane, item.id);
    if (li && li.parentNode) { li.parentNode.insertBefore(host, li.nextSibling); }
    else { pane.appendChild(host); }
    try { cancel.focus(); } catch (e) {}
  }
  function findIconLi(pane, id) {
    if (!pane || !pane.querySelectorAll) { return null; }
    try {
      var l = pane.querySelectorAll('.fy-icon-item');
      for (var i = 0; i < l.length; i++) { if (getAttr(l[i], 'data-fy-id') === id) { return l[i]; } }
    } catch (e) {}
    return null;
  }
  function deleteItem(rowId, id) {
    var icons = sectionOrDefaults('icons');
    var rows = clone(icons.rows || []);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === rowId) {
        var items = rows[i].items || [];
        var out = [];
        for (var j = 0; j < items.length; j++) { if (items[j].id !== id) { out.push(items[j]); } }
        rows[i].items = out;
      }
    }
    if (save('icons', { rows: rows })) { rebuildActivePane(); }
  }

  /* ---------- 图标 inline-form（新增 / 编辑，面板与编辑条通用） ---------- */
  function openItemForm(hostPane, opts) {
    // 同一宿主只开一个表单
    if (itemFormHost && itemFormHost.parentNode) {
      try { itemFormHost.parentNode.removeChild(itemFormHost); } catch (e) {}
    }
    var form = buildItemForm(opts, function (draft, ok) {
      if (!ok) { return; }                       // 校验失败：保留表单
      commitItemDraft(opts, draft);
      try { if (form.parentNode) { form.parentNode.removeChild(form); } } catch (e) {}
      itemFormHost = null;
      rebuildActivePane();
    });
    itemFormHost = form;
    if (hostPane) { hostPane.appendChild(form); }
    try {
      var first = form.querySelector ? form.querySelector('input, select') : null;
      if (first) { first.focus(); }
    } catch (e) {}
  }
  function buildItemForm(opts, onSubmit) {
    var isEdit = opts.mode === 'edit';
    var item = opts.item || {};
    var type = opts.type || item.type || 'link';
    var draft = {
      id: isEdit ? item.id : '',
      type: type,
      title: item.title || '',
      url: item.url || '',
      icon: item.icon || '',
      iconText: item.iconText || '',
      children: isEdit && item.children ? clone(item.children) : []
    };
    var form = h('div', { 'class': 'fy-inline-form' });
    var err = h('p', { 'class': 'fy-error', role: 'alert', hidden: true });

    // 目标行（新增时）
    var rowSel = null;
    if (!isEdit) {
      var rowField = h('div', { 'class': 'fy-field' });
      rowField.appendChild(h('label', { 'class': 'fy-label', text: '放到哪一行' }));
      rowSel = h('select', { 'class': 'fy-select', 'aria-label': '目标行' });
      rowSel.appendChild(h('option', { value: 'top', text: '第一行（#top_colum）' }));
      rowSel.appendChild(h('option', { value: 'movie', text: '第二行（#movie）' }));
      opts.rowId = 'top';
      on(rowSel, 'change', function () { opts.rowId = rowSel.value; });
      rowField.appendChild(rowSel);
      form.appendChild(rowField);
    }

    // 名称
    form.appendChild(fieldText('名称', draft.title, TITLE_MAX, function (v) { draft.title = v; }, '这项不能为空。'));
    // 网址
    form.appendChild(fieldText('网址', draft.url, URL_MAX, function (v) { draft.url = v; },
      '请输入以 http:// 或 https:// 开头的网址。', 'url'));
    // 图标：输入框 + 本地库下拉 + 上传
    var iconField = h('div', { 'class': 'fy-field' });
    iconField.appendChild(h('label', { 'class': 'fy-label', text: '图标（留空用文字兜底）' }));
    var iconInput = h('input', { type: 'text', 'class': 'fy-input', value: draft.icon, maxlength: URL_MAX,
      'aria-label': '图标地址', placeholder: 'assert/ 路径 / http(s) 网址 / 上传图片' });
    try { iconInput.value = draft.icon; } catch (e) {}
    on(iconInput, 'change', function () { draft.icon = iconInput.value; });
    on(iconInput, 'input', function () { draft.icon = iconInput.value; });
    iconField.appendChild(iconInput);
    var iconRow = h('div', { 'class': 'fy-form-row' });
    var localSel = h('select', { 'class': 'fy-select', 'aria-label': '本地图标库' });
    localSel.appendChild(h('option', { value: '', text: '— 选择本地图标库 —' }));
    for (var li = 0; li < LOCAL_ICONS.length; li++) {
      localSel.appendChild(h('option', { value: LOCAL_ICONS[li][0], text: LOCAL_ICONS[li][1] }));
    }
    on(localSel, 'change', function () {
      if (localSel.value) { draft.icon = localSel.value; try { iconInput.value = localSel.value; } catch (e) {} }
    });
    iconRow.appendChild(localSel);
    var fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true,
      'aria-label': '上传图标图片' });
    var uploadBtn = h('button', { type: 'button', 'class': 'fy-btn', text: '上传图片' });
    on(uploadBtn, 'click', function () { try { fileInput.click(); } catch (e) {} });
    on(fileInput, 'change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) { return; }
      compressIcon(f, function (e2, dataUrl) {
        if (e2 || !dataUrl) { showError(err, e2 ? e2.message : '图标处理失败', form); return; }
        draft.icon = dataUrl;
        try { iconInput.value = '(已上传图片)'; } catch (e3) {}
      });
    });
    iconRow.appendChild(uploadBtn);
    iconRow.appendChild(fileInput);
    iconField.appendChild(iconRow);
    iconField.appendChild(h('p', { 'class': 'fy-hint', text: '本地库 / http(s) 网址 / 上传 png·jpeg·webp 图片；留空则显示名称首字。' }));
    form.appendChild(iconField);
    // 兜底文字
    form.appendChild(fieldText('兜底文字（≤2 字）', draft.iconText, 2, function (v) { draft.iconText = v; },
      '图标加载不出来时显示这个字（留空则取名称首字）。'));
    // 类型
    var typeField = h('div', { 'class': 'fy-field' });
    typeField.appendChild(h('label', { 'class': 'fy-label', text: '类型' }));
    var typeSel = h('select', { 'class': 'fy-select', 'aria-label': '图标类型' });
    typeSel.appendChild(h('option', { value: 'link', text: '链接' }));
    typeSel.appendChild(h('option', { value: 'group', text: '分组（图标环）' }));
    try { typeSel.value = draft.type; } catch (e) {}
    on(typeSel, 'change', function () { draft.type = typeSel.value; renderChildren(); });
    typeField.appendChild(typeSel);
    form.appendChild(typeField);

    // 子项编辑区
    var childrenWrap = h('div', { 'class': 'fy-field' });
    function renderChildren() {
      clearKids(childrenWrap);
      if (draft.type !== 'group') { return; }
      childrenWrap.appendChild(h('label', { 'class': 'fy-label', text: '子项（0~6 个，位置自动排布，无需手动设置）' }));
      var note = h('p', { 'class': 'fy-field-note' });
      setText(note, draft.children.length >= 5 ? '子项较多，建议 ≤4。' :
        '子项会环绕主图标展开，支持 1~6 个；0 个时按普通链接显示。');
      childrenWrap.appendChild(note);
      for (var i = 0; i < draft.children.length; i++) {
        childrenWrap.appendChild(buildChildRow(draft.children, i));
      }
      var addChild = h('button', { type: 'button', 'class': 'fy-btn', text: '+ 添加子项' });
      on(addChild, 'click', function () {
        if (draft.children.length >= 6) { showError(err, '一个分组最多 6 个子项。', form); return; }
        draft.children.push({ id: '', title: '', url: '', icon: '', iconText: '' });
        renderChildren();
      });
      childrenWrap.appendChild(addChild);
    }
    form.appendChild(childrenWrap);
    form.appendChild(err);

    var actions = h('div', { 'class': 'fy-form-actions' });
    var cancel = h('button', { type: 'button', 'class': 'fy-btn', text: '取消' });
    var submit = h('button', { type: 'button', 'class': 'fy-btn fy-btn-primary', text: isEdit ? '保存修改' : '添加' });
    actions.appendChild(cancel); actions.appendChild(submit);
    form.appendChild(actions);
    on(cancel, 'click', function () { try { form.parentNode && form.parentNode.removeChild(form); } catch (e) {} itemFormHost = null; });
    on(submit, 'click', function () {
      draft.title = draft.title.replace(/^\s+|\s+$/g, '');
      draft.url = draft.url.replace(/^\s+|\s+$/g, '');
      var v = validateItemDraft(draft);
      if (!v.ok) { showError(err, v.msg, form); return; }
      onSubmit(draft, true);
    });
    renderChildren();
    return form;
  }
  function buildChildRow(arr, idx) {
    var c = arr[idx];
    var box = h('div', { 'class': 'fy-child-item' });
    box.appendChild(h('label', { 'class': 'fy-label', text: '子项 ' + (idx + 1) }));
    var t = h('input', { type: 'text', 'class': 'fy-input', value: c.title, maxlength: TITLE_MAX,
      'aria-label': '子项名称', placeholder: '名称' });
    var u = h('input', { type: 'url', 'class': 'fy-input', value: c.url, maxlength: URL_MAX,
      'aria-label': '子项网址', placeholder: 'https://…' });
    var ic = h('input', { type: 'text', 'class': 'fy-input', value: c.icon, maxlength: URL_MAX,
      'aria-label': '子项图标', placeholder: 'assert/ 或 http(s)（可留空）' });
    var tx = h('input', { type: 'text', 'class': 'fy-input', value: c.iconText, maxlength: 2,
      'aria-label': '子项兜底文字', placeholder: '兜底字' });
    on(t, 'input', function () { c.title = t.value; });
    on(u, 'input', function () { c.url = u.value; });
    on(ic, 'input', function () { c.icon = ic.value; });
    on(tx, 'input', function () { c.iconText = tx.value; });
    box.appendChild(t); box.appendChild(u); box.appendChild(ic); box.appendChild(tx);
    var rm = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', text: '移除子项' });
    on(rm, 'click', function () { arr.splice(idx, 1); renderChildrenOf(box); });
    box.appendChild(rm);
    return box;
  }
  function renderChildrenOf(box) {
    // 子项移除后重建父级子项区：向上找到 .fy-inline-form 触发其 renderChildren 不便，
    // 这里用简单策略：刷新整个表单所在的 pane（用户可接受，移除子项非高频输入态）
    var form = box;
    while (form && form.parentNode && !hasClass(form, 'fy-inline-form')) { form = form.parentNode; }
    // 直接重建当前 pane（数据已写入 draft 内存，重建会丢草稿）—— 退回轻量做法：
    // 仅移除该 box 并让后续提交时数组已 splice，故无需重绘编号。
    try { box.parentNode && box.parentNode.removeChild(box); } catch (e) {}
  }
  function fieldText(label, value, max, setter, hint, inputType) {
    var f = h('div', { 'class': 'fy-field' });
    f.appendChild(h('label', { 'class': 'fy-label', text: label }));
    var inp = h('input', { type: inputType || 'text', 'class': 'fy-input', value: value, maxlength: max,
      'aria-label': label });
    try { inp.value = value; } catch (e) {}
    on(inp, 'input', function () { setter(inp.value); });
    on(inp, 'change', function () { setter(inp.value); });
    f.appendChild(inp);
    if (hint) { f.appendChild(h('p', { 'class': 'fy-hint', text: hint })); }
    return f;
  }
  function showError(node, msg, form) {
    setText(node, msg);
    show(node, true);
    try { form.scrollIntoView && form.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }
  function validateItemDraft(d) {
    if (!validTitle(d.title)) { return { ok: false, msg: d.title ? '标题最多 40 个字符。' : '这项不能为空。' }; }
    if (!validHttpUrl(d.url)) { return { ok: false, msg: '请输入以 http:// 或 https:// 开头的网址。' }; }
    if (d.url.length > URL_MAX) { return { ok: false, msg: '网址最多 2048 个字符。' }; }
    if (!validIconField(d.icon)) { return { ok: false, msg: '图标需使用 assert/ 路径、http(s) 网址，或上传 png / jpeg / webp 图片。' }; }
    if (d.iconText && String(d.iconText).length > 2) { return { ok: false, msg: '兜底文字最多 2 个字。' }; }
    if (d.type === 'group') {
      if (d.children.length > 6) { return { ok: false, msg: '一个分组最多 6 个子项。' }; }
      for (var i = 0; i < d.children.length; i++) {
        var c = d.children[i];
        if (!validTitle(c.title)) { return { ok: false, msg: '第 ' + (i + 1) + ' 个子项名称不能为空且最多 40 字。' }; }
        if (!validHttpUrl(c.url)) { return { ok: false, msg: '第 ' + (i + 1) + ' 个子项网址需以 http(s) 开头。' }; }
        if (!validIconField(c.icon)) { return { ok: false, msg: '第 ' + (i + 1) + ' 个子项图标地址不合法。' }; }
      }
    }
    return { ok: true };
  }
  function commitItemDraft(opts, draft) {
    var icons = sectionOrDefaults('icons');
    var rows = clone(icons.rows || []);
    if (!rows.length) { rows = [{ id: 'top', items: [] }, { id: 'movie', items: [] }]; }
    var taken = collectIconIds({ rows: rows });
    var isEdit = opts.mode === 'edit';
    var rowId = opts.rowId || 'top';
    // 生成稳定 id
    if (!isEdit) {
      draft.id = genIconId(taken);
      for (var ci = 0; ci < draft.children.length; ci++) {
        draft.children[ci].id = genIconId(taken);
        taken[draft.children[ci].id] = true;
      }
    }
    var out = {
      id: draft.id, type: draft.type, title: draft.title, url: draft.url,
      icon: draft.icon, iconText: String(draft.iconText || '').slice(0, 2)
    };
    if (draft.type === 'group') {
      var cs = [];
      for (var i = 0; i < draft.children.length; i++) {
        var c = draft.children[i];
        cs.push({ id: c.id || genIconId(taken), title: c.title, url: c.url,
          icon: c.icon || '', iconText: String(c.iconText || '').slice(0, 2) });
      }
      out.children = cs;                       // 0 子项合法（P10），render 降级为 link
    }
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].id !== rowId) { continue; }
      var items = rows[r].items || [];
      if (isEdit) {
        for (var j = 0; j < items.length; j++) { if (items[j].id === opts.item.id) { items[j] = out; break; } }
      } else {
        items.push(out);
      }
      rows[r].items = items;
    }
    save('icons', { rows: rows });
  }

  /* 上传图标：显式传 PRESET_ICON（P13），回调里 MIME + 长度二次校验兜底 */
  function compressIcon(file, cb) {
    var T = global.FYTheme;
    if (!T || typeof T.compressImage !== 'function') { cb(new Error('图片压缩功能不可用'), null); return; }
    var opts = T.PRESET_ICON || { maxEdge: 256, maxChars: ICON_MAX_CHARS, quality: 0.85 };
    try { T.compressImage(file, wrapped, opts); }
    catch (e) { cb(e, null); }
    function wrapped(err, dataUrl) {
      if (err || !dataUrl) { cb(err || new Error('图标处理失败'), null); return; }
      if (!RE_DATA_IMG.test(dataUrl)) { cb(new Error('图片格式不支持（仅 png/jpeg/webp）'), null); return; }
      if (dataUrl.length > ICON_MAX_CHARS) { cb(new Error('图片过大，请换更小的图或改用图片网址'), null); return; }
      cb(null, dataUrl);
    }
  }

  /* ================================================================== *
   * 编辑态（桌面图标）：setEditMode / 装饰节点 / 拖拽 / snapshotFromDom
   * ================================================================== */
  function enterEditMode() {
    if (isMobile) { return; }                    // 移动端不进入（无 FYIcons）
    try {
      if (!global.FYIcons || typeof global.FYIcons.setEditMode !== 'function') {
        setSaveStatus('⚠ 桌面图标编辑暂不可用（模块未就绪）', 'error');
        return;
      }
      close();                                   // 收起 950 面板，解除 aria-modal / 焦点陷阱
      global.FYIcons.setEditMode(true);
      editMode = true;
      buildEditBar();
      decorateEdit();
      later(function () { if (R.editDoneBtn) { try { R.editDoneBtn.focus(); } catch (e) {} } }, 0);
    } catch (e) {}
  }
  function exitEditMode() {
    if (!editMode) { return; }
    try {
      editMode = false;
      removeDecorations();
      try { if (global.FYIcons && typeof global.FYIcons.setEditMode === 'function') { global.FYIcons.setEditMode(false); } } catch (e) {}
      // 收尾幂等重绘（§4.1）；不解绑 / 不重绑任何 hover 事件（P6，那是 FYIcons 的事）
      try { if (global.FYIcons && typeof global.FYIcons.render === 'function') { global.FYIcons.render(safeSection('icons')); } } catch (e2) {}
      if (editBar) { try { if (editBar.parentNode) { editBar.parentNode.removeChild(editBar); } } catch (e3) {} editBar = null; }
      try { if (btn && typeof btn.focus === 'function') { btn.focus(); } } catch (e4) {}
    } catch (e) {}
  }
  function buildEditBar() {
    if (editBar) { return; }
    editBar = h('div', { id: 'fy-edit-bar', role: 'toolbar', 'aria-label': '桌面图标编辑' });
    var head = h('div', { 'class': 'fy-edit-head' });
    head.appendChild(h('strong', { 'class': 'fy-edit-title', text: '编辑中' }));
    head.appendChild(h('span', { 'class': 'fy-save-status', role: 'status', 'aria-live': 'polite', text: '所有改动已保存' }));
    editBar.appendChild(head);
    editBar.appendChild(h('p', { 'class': 'fy-edit-tip',
      text: '拖动 ⠿ 手柄排序（仅限同一行），点 × 删除，点图标在面板里改名称 / 网址；改完点「完成」。' }));
    var acts = h('div', { 'class': 'fy-edit-actions' });
    var addLink = h('button', { type: 'button', 'class': 'fy-btn', text: '添加图标' });
    var addGroup = h('button', { type: 'button', 'class': 'fy-btn', text: '添加分组' });
    R.editUndoBtn = h('button', { type: 'button', 'class': 'fy-btn', text: '撤销', disabled: true });
    R.editDoneBtn = h('button', { type: 'button', 'class': 'fy-btn fy-btn-primary', text: '完成' });
    acts.appendChild(addLink); acts.appendChild(addGroup); acts.appendChild(R.editUndoBtn); acts.appendChild(R.editDoneBtn);
    editBar.appendChild(acts);
    on(addLink, 'click', function () { openItemForm(editBar, { mode: 'add', type: 'link' }); });
    on(addGroup, 'click', function () { openItemForm(editBar, { mode: 'add', type: 'group' }); });
    on(R.editUndoBtn, 'click', function () { undo(); });
    on(R.editDoneBtn, 'click', function () { exitEditMode(); });
    refreshUndoButtons();
    try { doc.body.appendChild(editBar); } catch (e) {}
  }
  /* 装饰节点：依据 data-fy-id 注入到 item 根节点，不插入 .sub-icon 内部、不改 --a/--i（P7/02 §4.1） */
  function decorateEdit() {
    if (!editMode || isMobile || !doc.querySelectorAll) { return; }
    removeDecorations();
    try {
      var roots = doc.querySelectorAll('#top_colum [data-fy-id], #movie [data-fy-id]');
      for (var i = 0; i < roots.length; i++) {
        var root = roots[i];
        var ty = getAttr(root, 'data-fy-type');
        if (ty !== 'link' && ty !== 'group') { continue; }   // 跳过 child（.sub-icon）
        if (getAttr(root, 'data-fy-type') === 'child') { continue; }
        addClass(root, 'fy-icon-editing');
        var grip = h('span', { 'class': 'fy-drag-handle', tabindex: '0', draggable: 'true',
          role: 'button', 'aria-label': '拖动排序 ' + (getAttr(root, 'data-fy-title') || ''), text: '⠿' });
        var del = h('button', { type: 'button', 'class': 'fy-icon-del', 'aria-label': '删除该图标', text: '×' });
        bindDragHandle(grip, root);
        bindDelDecoration(del, root);
        bindGripKeys(grip, root);
        root.appendChild(grip);
        root.appendChild(del);
        // 编辑态点击主图标不跳转（捕获阶段 preventDefault），由 setEditMode 行为开关负责，
        // 这里补一层兜底，避免误触跳转
        onClickNoJump(root);
      }
    } catch (e) {}
  }
  function removeDecorations() {
    if (!doc.querySelectorAll) { return; }
    try {
      var list = doc.querySelectorAll('.fy-drag-handle, .fy-icon-del');
      for (var i = list.length - 1; i >= 0; i--) {
        var n = list[i];
        if (n.parentNode) { n.parentNode.removeChild(n); }
      }
      var roots = doc.querySelectorAll('.fy-icon-editing');
      for (var j = 0; j < roots.length; j++) { removeClass(roots[j], 'fy-icon-editing'); }
      var drag = doc.querySelectorAll('.is-fy-dragging, .is-fy-drop-target, .is-fy-no-drop');
      for (var k = 0; k < drag.length; k++) {
        removeClass(drag[k], 'is-fy-dragging'); removeClass(drag[k], 'is-fy-drop-target'); removeClass(drag[k], 'is-fy-no-drop');
      }
    } catch (e) {}
  }
  function onClickNoJump(root) {
    on(root, 'click', function (e) { try { e.preventDefault(); } catch (e2) {} });
  }
  function rowOfRoot(root) {
    var row = getAttr(root, 'data-fy-row');
    if (row === 'top' || row === 'movie') { return row; }
    // 从祖先容器推断
    var p = root;
    while (p) {
      var id = getAttr(p, 'id');
      if (id === 'top_colum') { return 'top'; }
      if (id === 'movie') { return 'movie'; }
      p = p.parentNode;
    }
    return 'top';
  }
  function bindDragHandle(grip, root) {
    // 拖拽由 desktop-icons.js 处理：setEditMode(true) 把图标根节点设为 draggable，
    // 并在 document 捕获阶段用 upTo(target, isEditableRoot) 命中根节点。手柄保留 draggable
    // 属性仅作视觉提示（从手柄起拖时 dragstart 冒泡同样能被其命中），面板不再自行记录
    // dragId / 绑 dragstart，避免与捕获阶段 DnD 双重落库。
  }
  function bindDelDecoration(del, root) {
    on(del, 'click', function (e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (e2) {}
      var id = getAttr(root, 'data-fy-id');
      var title = getAttr(root, 'data-fy-title') || '';
      var ty = getAttr(root, 'data-fy-type');
      var row = rowOfRoot(root);
      var extra = (ty === 'group') ? '删除分组会一起移除它的子项。' : '';
      // 项内 .fy-confirm-inline（append 到编辑条，不新增根层级）
      var host = h('div', { 'class': 'fy-confirm-inline' });
      host.appendChild(h('p', { 'class': 'fy-confirm-text', text: '确定删除「' + title + '」吗？' + extra }));
      var acts = h('div', { 'class': 'fy-form-actions' });
      var cancel = h('button', { type: 'button', 'class': 'fy-btn', text: '取消' });
      var ok = h('button', { type: 'button', 'class': 'fy-btn fy-btn-danger', text: '删除' });
      acts.appendChild(cancel); acts.appendChild(ok); host.appendChild(acts);
      if (editBar) { editBar.appendChild(host); }
      on(cancel, 'click', function () { try { host.parentNode && host.parentNode.removeChild(host); } catch (e3) {} try { del.focus(); } catch (e4) {} });
      on(ok, 'click', function () {
        var rows = readRowsFromDom();
        for (var r = 0; r < rows.length; r++) {
          var items = rows[r].items || [], out = [];
          for (var j = 0; j < items.length; j++) { if (items[j].id !== id) { out.push(items[j]); } }
          rows[r].items = out;
        }
        if (save('icons', { rows: rows })) { try { host.parentNode && host.parentNode.removeChild(host); } catch (e5) {} }
      });
      try { cancel.focus(); } catch (e6) {}
    });
  }
  function bindGripKeys(grip, root) {
    on(grip, 'keydown', function (e) {
      var k = e.key, code = e.keyCode;
      var up = (k === 'ArrowUp' || code === 38), down = (k === 'ArrowDown' || code === 40);
      var left = (k === 'ArrowLeft' || code === 37), right = (k === 'ArrowRight' || code === 39);
      var isDelete = (k === 'Delete' || code === 46 || k === 'Backspace' || code === 8);
      if (isDelete && !e.altKey && !e.ctrlKey && !e.metaKey) {
        try { e.preventDefault(); } catch (e2) {}
        try { grip.click && grip.click(); } catch (e3) {}   // 复用删除角标逻辑
        var del = null;
        try { del = root.querySelector ? root.querySelector('.fy-icon-del') : null; } catch (e4) {}
        if (del && del.click) { try { del.click(); } catch (e5) {} }
        return;
      }
      if (!e.altKey) { return; }
      if (!up && !down && !left && !right) { return; }
      try { e.preventDefault(); } catch (e6) {}
      var rows = readRowsFromDom();
      var rowId = rowOfRoot(root), id = getAttr(root, 'data-fy-id');
      var arr = null;
      for (var r = 0; r < rows.length; r++) { if (rows[r].id === rowId) { arr = rows[r].items; } }
      if (!arr) { return; }
      var idx = -1;
      for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { idx = i; break; } }
      if (idx < 0) { return; }
      var dest = idx;
      if (e.shiftKey && (up || left)) { dest = 0; }
      else if (e.shiftKey && (down || right)) { dest = arr.length - 1; }
      else if (up || left) { dest = Math.max(0, idx - 1); }
      else { dest = Math.min(arr.length - 1, idx + 1); }
      if (dest !== idx) {
        var moved = arr.splice(idx, 1)[0];
        arr.splice(dest, 0, moved);
      }
      save('icons', { rows: rows });
      // 播报
      announce('已移动到第 ' + (dest + 1) + ' 位');
      later(function () { decorateEdit(); }, 0);
    });
  }
  function announce(text) {
    try {
      var n = doc.getElementById('fy-edit-live');
      if (!n) {
        n = h('span', { id: 'fy-edit-live', 'aria-live': 'polite' });
        setAttr(n, 'class', 'fy-hint');
        try { n.style.position = 'absolute'; n.style.width = '1px'; n.style.height = '1px'; n.style.overflow = 'hidden'; } catch (e) {}
        if (editBar) { editBar.appendChild(n); }
      }
      setText(n, text);
    } catch (e2) {}
  }
  /* 从带 data-fy-* 的 DOM 回读 rows：优先 FYIcons.snapshotFromDom，缺失时内置等价实现 */
  function readRowsFromDom() {
    if (global.FYIcons && typeof global.FYIcons.snapshotFromDom === 'function') {
      try {
        var snap = global.FYIcons.snapshotFromDom();
        if (snap && snap.rows && snap.rows.length) { return clone(snap.rows); }
      } catch (e) {}
    }
    var rows = [{ id: 'top', items: [] }, { id: 'movie', items: [] }];
    if (!doc.querySelectorAll) { return rows; }
    try {
      var roots = doc.querySelectorAll('#top_colum [data-fy-id], #movie [data-fy-id]');
      for (var i = 0; i < roots.length; i++) {
        var el = roots[i];
        var ty = getAttr(el, 'data-fy-type');
        var row = getAttr(el, 'data-fy-row') || rowOfRoot(el);
        var target = null;
        for (var r = 0; r < rows.length; r++) { if (rows[r].id === row) { target = rows[r]; } }
        if (!target) { continue; }
        var base = {
          id: getAttr(el, 'data-fy-id'), title: getAttr(el, 'data-fy-title') || '',
          url: getAttr(el, 'data-fy-url') || '', icon: getAttr(el, 'data-fy-icon') || '',
          iconText: getAttr(el, 'data-fy-icon-text') || ''
        };
        if (ty === 'child') {
          // child 必须归属最近的同组根节点（简化：追加到该行最后一个 group）
          var lastGroup = null;
          for (var g = target.items.length - 1; g >= 0; g--) { if (target.items[g].children) { lastGroup = target.items[g]; break; } }
          if (lastGroup) { lastGroup.children.push(base); }
          continue;
        }
        if (ty === 'group') { base.children = []; base.type = 'group'; }
        else { base.type = 'link'; }
        target.items.push(base);
      }
    } catch (e) {}
    return rows;
  }
  /* 拖拽排序由 desktop-icons.js 全权处理（已核对实现）：它在 document 捕获阶段监听
     dragstart/dragover/drop，onDrop 内部 moveItem/moveChild → FYIcons.commit → FYSettings.patch，
     跨行一律拒绝并给出 toast。面板刻意不再注册自己的 dragover/drop：否则同一次拖放会被
     两套逻辑各 patch 一次，第二次 patch 基于「尚未异步重绘的旧 DOM」回读 rows，会覆盖
     dev-icons 的排序结果（双重落库）。装饰节点只保留视觉提示 / 键盘排序 / 删除入口职责。 */
  function eventRoot(node) {
    var p = node;
    while (p && p !== doc.body) {
      var ty = getAttr(p, 'data-fy-type');
      if (ty === 'link' || ty === 'group') { return p; }
      p = p.parentNode;
    }
    return null;
  }

  /* 把 dev-icons 内部的确认 / 提示钩子接到面板内浮层（契约 §7：不用原生 confirm）。
     编辑态时面板收起，确认浮层改挂编辑条内的 .fy-confirm-inline，避免 append 到
     display:none 的 #fy-panel 而不可见。 */
  function wireFYIconsHooks() {
    try {
      var I = global.FYIcons;
      if (!I) { return; }
      I.confirmAction = function (question, cb) {
        if (editMode && editBar) { inlineConfirm(editBar, question, cb); }
        else {
          openConfirm({ title: '请确认', desc: str(question), danger: true,
            onConfirm: function () { if (cb) { cb(true); } },
            onCancel: function () { if (cb) { cb(false); } } });
        }
      };
      I.toast = function (msg) { setSaveStatus(str(msg), 'info'); };
    } catch (e) {}
  }
  function inlineConfirm(host, question, cb) {
    if (!host) { if (cb) { cb(false); } return; }
    var box = h('div', { 'class': 'fy-confirm-inline' });
    box.appendChild(h('p', { 'class': 'fy-confirm-text', text: str(question) }));
    var acts = h('div', { 'class': 'fy-form-actions' });
    var no = h('button', { type: 'button', 'class': 'fy-btn', text: '取消' });
    var yes = h('button', { type: 'button', 'class': 'fy-btn fy-btn-danger', text: '确定' });
    acts.appendChild(no); acts.appendChild(yes); box.appendChild(acts);
    host.appendChild(box);
    var done = function (v) {
      try { if (box.parentNode) { box.parentNode.removeChild(box); } } catch (e) {}
      if (cb) { cb(v); }
    };
    on(no, 'click', function () { done(false); });
    on(yes, 'click', function () { done(true); });
    try { no.focus(); } catch (e) {}
  }
  /* 编辑态点击图标打开该 item 的编辑表单。dev-icons 的 onCaptureClick 只 preventDefault、
     不 stopPropagation，click 仍冒泡到 document；其文档提及的 fy:icon-edit-request 事件
     在交付代码中未实现，故以 click 为主路径、事件仅作未来兼容。 */
  function wireIconEditRequest() {
    on(doc, 'fy:icon-edit-request', function (e) {
      var d = e && e.detail;
      if (d && d.id) { openEditFormFor(d.id, d.row, d.type); }
    });
    on(doc, 'click', function (e) {
      if (!editMode || isMobile) { return; }
      var t = e.target, p = t;
      while (p && p !== doc.body) {
        if (hasClass(p, 'fy-icon-del') || hasClass(p, 'fy-drag-handle') ||
            hasClass(p, 'fy-confirm-inline') || getAttr(p, 'id') === 'fy-edit-bar') { return; }
        p = p.parentNode;
      }
      var root = eventRoot(t);
      if (!root) { return; }
      var id = getAttr(root, 'data-fy-id');
      if (!id) { return; }
      openEditFormFor(id, getAttr(root, 'data-fy-row') || rowOfRoot(root), getAttr(root, 'data-fy-type'));
    });
  }
  function openEditFormFor(id, row, type) {
    var icons = sectionOrDefaults('icons');
    var rows = (icons && icons.rows) || [], found = null, foundRow = row || 'top';
    for (var i = 0; i < rows.length && !found; i++) {
      var items = (rows[i] && rows[i].items) || [];
      for (var j = 0; j < items.length; j++) {
        if (items[j].id === id) { found = items[j]; foundRow = rows[i].id; break; }
      }
    }
    if (!found) { return; }
    var host = (editMode && editBar) ? editBar : (R.panes && R.panes.icons);
    openItemForm(host, { mode: 'edit', rowId: foundRow, type: found.type || type || 'link', item: found });
  }

  /* ================================================================== *
   * Tab 2 · 搜索
   * ================================================================== */
  function renderSearchPane(pane) {
    clearKids(pane);
    var search = sectionOrDefaults('search');
    var engines = search.engines || [];
    var hidden = search.hidden || [];
    var def = search.defaultEngine || 'bing';
    var err = h('p', { 'class': 'fy-error', role: 'alert', hidden: true });

    // 默认引擎（列出启用引擎）
    var f1 = h('div', { 'class': 'fy-field' });
    f1.appendChild(h('label', { 'class': 'fy-label', for: 'fy-default-engine', text: '默认搜索引擎' }));
    var defSel = h('select', { 'class': 'fy-select', id: 'fy-default-engine', 'aria-label': '默认搜索引擎' });
    for (var i = 0; i < engines.length; i++) {
      if (hidden.indexOf(engines[i].id) !== -1) { continue; }
      var op = h('option', { value: engines[i].id, text: engines[i].name || engines[i].id });
      defSel.appendChild(op);
    }
    try { defSel.value = def; } catch (e) {}
    on(defSel, 'change', function () { save('search', { defaultEngine: defSel.value }); });
    f1.appendChild(defSel);
    f1.appendChild(h('p', { 'class': 'fy-hint', text: '当前引擎会记住，下次打开自动沿用。' }));
    pane.appendChild(f1);

    // 新标签 / 联想
    pane.appendChild(switchField('在新标签页打开结果', search.openInNewTab === true, function (v) { save('search', { openInNewTab: v }); },
      '开启后，搜索结果在新标签页打开。'));
    pane.appendChild(switchField('开启搜索联想', search.enableSuggest !== false, function (v) { save('search', { enableSuggest: v }); },
      '仅必应 / 百度支持联想，其它引擎自动跳过。'));

    pane.appendChild(h('h3', { 'class': 'fy-section', text: '搜索引擎' }));
    var list = h('ul', { 'class': 'fy-engine-list' });
    for (var j = 0; j < engines.length; j++) { list.appendChild(buildEngineItem(engines[j], search, pane, err)); }
    pane.appendChild(list);
    if (!engines.length) {
      pane.appendChild(h('p', { 'class': 'fy-empty', text: '没有可用的搜索引擎。至少要保留一个启用的引擎。' }));
    }
    var addBtn = h('button', { type: 'button', 'class': 'fy-btn', text: '添加自定义引擎' });
    on(addBtn, 'click', function () { openEngineForm(pane, err); });
    pane.appendChild(addBtn);
    pane.appendChild(err);
  }
  function switchField(label, checked, setter, hint) {
    var f = h('div', { 'class': 'fy-field' });
    var lab = h('label', { 'class': 'fy-label fy-label-inline' });
    var cb = h('input', { type: 'checkbox', 'class': 'fy-switch', checked: !!checked, 'aria-label': label });
    lab.appendChild(cb); lab.appendChild(h('span', { text: ' ' + label }));
    f.appendChild(lab);
    on(cb, 'change', function () { setter(!!cb.checked); });
    if (hint) { f.appendChild(h('p', { 'class': 'fy-hint', text: hint })); }
    return f;
  }
  function buildEngineItem(engine, search, pane, err) {
    var isAi = !!(engine.ai || engine.id === 'ai');
    var isBuiltin = engine.builtin === true;
    var hidden = search.hidden || [];
    var isHidden = hidden.indexOf(engine.id) !== -1;
    var li = h('li', { 'class': 'fy-engine-item' });
    setAttr(li, 'data-fy-engine-id', engine.id);
    setAttr(li, 'data-fy-hidden', isHidden ? 'true' : 'false');
    li.appendChild(h('span', { 'class': 'fy-engine-grip', 'aria-hidden': 'true', text: '⠿' }));
    var info = h('div', { 'class': 'fy-engine-info' });
    info.appendChild(h('span', { 'class': 'fy-engine-name', text: engine.name || engine.id }));
    info.appendChild(h('span', { 'class': 'fy-engine-param', text: isAi ? '内置伪引擎' : ('参数名 ' + (engine.param || '—')) }));
    if (isAi || isBuiltin) { info.appendChild(h('span', { 'class': 'fy-engine-readonly', text: isAi ? 'AI · 只读' : '内置 · 只读' })); }
    li.appendChild(info);
    var acts = h('div', { 'class': 'fy-engine-actions' });
    // 启用开关（ai 允许停用，P11 只读字段但可隐藏 / 排序 / 设为默认）
    var tog = h('input', { type: 'checkbox', 'class': 'fy-switch', checked: !isHidden,
      'aria-label': (isHidden ? '启用 ' : '停用 ') + (engine.name || engine.id), title: '显示 / 隐藏' });
    on(tog, 'change', function () { toggleEngineHidden(engine.id, !tog.checked, pane, err); });
    acts.appendChild(tog);
    // 设为默认（含 ai，P11；ai/url/param 仍只读）
    var setDef = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', text: '设为默认' });
    setAttr(setDef, 'aria-label', '把 ' + (engine.name || engine.id) + ' 设为默认');
    on(setDef, 'click', function () {
      if (isHidden) { showError(err, '它是隐藏状态，请先启用再设为默认。', pane); return; }
      save('search', { defaultEngine: engine.id });
    });
    acts.appendChild(setDef);
    // 上移 / 下移（排序，原地改数组）
    var up = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', text: '↑', 'aria-label': '上移 ' + (engine.name || '') });
    var down = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', text: '↓', 'aria-label': '下移 ' + (engine.name || '') });
    on(up, 'click', function () { moveEngine(engine.id, -1); });
    on(down, 'click', function () { moveEngine(engine.id, 1); });
    acts.appendChild(up); acts.appendChild(down);
    // 删除：仅自定义（ai / builtin 不可删）
    var del = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', text: '删除' });
    if (isAi || isBuiltin) {
      try { del.disabled = true; } catch (e) {}
      setAttr(del, 'title', '内置 / AI 引擎不可删除，只能停用或排序');
      setAttr(del, 'aria-label', '内置引擎不可删除');
    } else {
      on(del, 'click', function () {
        openConfirm({ title: '删除自定义引擎', desc: '确定删除自定义引擎「' + (engine.name || engine.id) + '」吗？',
          danger: true, trigger: del, onConfirm: function () { deleteEngine(engine.id); } });
      });
    }
    acts.appendChild(del);
    li.appendChild(acts);
    return li;
  }
  function toggleEngineHidden(id, hide, pane, err) {
    var search = sectionOrDefaults('search');
    var hidden = (search.hidden || []).slice();
    var idx = hidden.indexOf(id);
    if (hide && idx === -1) { hidden.push(id); }
    if (!hide && idx !== -1) { hidden.splice(idx, 1); }
    // 面板层防呆：至少保留 1 个启用引擎；默认引擎被停用则拒绝
    var eng = search.engines || [];
    var remain = 0;
    for (var i = 0; i < eng.length; i++) { if (hidden.indexOf(eng[i].id) === -1) { remain++; } }
    if (remain < 1) { showError(err, '至少要保留一个启用的引擎。', pane); rebuildActivePane(); return; }
    if (hide && (search.defaultEngine === id)) {
      showError(err, '它是当前默认引擎，请先改选其它引擎再停用。', pane); rebuildActivePane(); return;
    }
    save('search', { hidden: hidden });
    rebuildActivePane();
  }
  function moveEngine(id, dir) {
    var search = sectionOrDefaults('search');
    var eng = clone(search.engines || []);
    var idx = -1;
    for (var i = 0; i < eng.length; i++) { if (eng[i].id === id) { idx = i; break; } }
    var dest = idx + dir;
    if (idx < 0 || dest < 0 || dest >= eng.length) { return; }
    var m = eng.splice(idx, 1)[0]; eng.splice(dest, 0, m);
    save('search', { engines: eng });           // 浅合并：传完整数组
    rebuildActivePane();
  }
  function deleteEngine(id) {
    var search = sectionOrDefaults('search');
    var eng = [], hidden = (search.hidden || []).slice();
    for (var i = 0; i < (search.engines || []).length; i++) { if (search.engines[i].id !== id) { eng.push(search.engines[i]); } }
    var hi = hidden.indexOf(id); if (hi !== -1) { hidden.splice(hi, 1); }
    var patch = { engines: eng, hidden: hidden };
    if (search.defaultEngine === id) { patch.defaultEngine = (eng[0] && eng[0].id) || 'bing'; }
    save('search', patch);
    rebuildActivePane();
  }
  /* 自定义引擎表单：param 用 validParam（P3 放宽正则），不写死 q/wd/keyword */
  function openEngineForm(pane, err) {
    var existing = pane.querySelector ? pane.querySelector('.fy-inline-form') : null;
    if (existing && existing.parentNode) { try { existing.parentNode.removeChild(existing); } catch (e) {} }
    var form = h('div', { 'class': 'fy-inline-form' });
    form.appendChild(h('label', { 'class': 'fy-label', text: '新增自定义引擎' }));
    var name = h('input', { type: 'text', 'class': 'fy-input', maxlength: TITLE_MAX, 'aria-label': '引擎名称', placeholder: '名称' });
    var url = h('input', { type: 'url', 'class': 'fy-input', maxlength: URL_MAX, 'aria-label': '搜索地址', placeholder: 'https://example.com/search（不要带 ? 和参数）' });
    var param = h('input', { type: 'text', 'class': 'fy-input', maxlength: 32, 'aria-label': '关键词参数名', placeholder: '参数名，如 q / wd / keyword，或自定义标识符' });
    var suggest = h('select', { 'class': 'fy-select', 'aria-label': '联想' });
    suggest.appendChild(h('option', { value: '', text: '不启用联想' }));
    suggest.appendChild(h('option', { value: 'bing', text: '必应联想' }));
    suggest.appendChild(h('option', { value: 'baidu', text: '百度联想' }));
    var placeholder = h('input', { type: 'text', 'class': 'fy-input', maxlength: 80, 'aria-label': '占位文案', placeholder: '占位文案（可选）' });
    form.appendChild(name); form.appendChild(url);
    var pf = h('div', { 'class': 'fy-field' });
    pf.appendChild(h('label', { 'class': 'fy-label', text: '关键词参数名' }));
    pf.appendChild(param);
    pf.appendChild(h('p', { 'class': 'fy-hint', text: '参数名需以字母或下划线开头，只含字母、数字、下划线，最长 32 个字符（P3 放宽，不局限于 q/wd/keyword）。' }));
    // 常用值做成「点击填入」的快捷选项，而非硬白名单；输入框仍允许任意合法标识符
    var quick = h('div', { 'class': 'fy-form-row' });
    var quickVals = ['q', 'wd', 'keyword'];
    for (var qi = 0; qi < quickVals.length; qi++) {
      (function (qv) {
        var qb = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', text: qv,
          title: '填入常用参数名 ' + qv, 'aria-label': '填入常用参数名 ' + qv });
        on(qb, 'click', function () { try { param.value = qv; } catch (e) {} });
        quick.appendChild(qb);
      })(quickVals[qi]);
    }
    quick.appendChild(h('span', { 'class': 'fy-hint', text: ' 点击填入常用值，也可自定义' }));
    pf.appendChild(quick);
    form.appendChild(pf);
    form.appendChild(h('label', { 'class': 'fy-label', text: '联想' }));
    form.appendChild(suggest);
    form.appendChild(h('label', { 'class': 'fy-label', text: '占位文案' }));
    form.appendChild(placeholder);
    var ferr = h('p', { 'class': 'fy-error', role: 'alert', hidden: true });
    form.appendChild(ferr);
    var acts = h('div', { 'class': 'fy-form-actions' });
    var cancel = h('button', { type: 'button', 'class': 'fy-btn', text: '取消' });
    var ok = h('button', { type: 'button', 'class': 'fy-btn fy-btn-primary', text: '添加' });
    acts.appendChild(cancel); acts.appendChild(ok);
    form.appendChild(acts);
    on(cancel, 'click', function () { try { form.parentNode && form.parentNode.removeChild(form); } catch (e) {} });
    on(ok, 'click', function () {
      var nm = String(name.value || '').replace(/^\s+|\s+$/g, '');
      var u = String(url.value || '').replace(/^\s+|\s+$/g, '');
      var p = String(param.value || '').replace(/^\s+|\s+$/g, '');
      if (!nm) { showError(ferr, '引擎名称不能为空。', form); return; }
      if (!validHttpUrl(u)) { showError(ferr, '请输入以 http:// 或 https:// 开头的搜索地址（不要带 ? 和参数）。', form); return; }
      if (!validParam(p)) { showError(ferr, '参数名需以字母或下划线开头，只含字母、数字、下划线，最长 32 个字符。', form); return; }
      var search = sectionOrDefaults('search');
      var eng = clone(search.engines || []);
      var id = genEngineId(engineIdMap(search));
      var e = { id: id, name: nm, url: u, param: p, extra: {}, builtin: false,
        suggest: suggest.value || null };
      var ph = String(placeholder.value || '').replace(/^\s+|\s+$/g, '');
      if (ph) { e.placeholder = ph.slice(0, 80); }
      eng.push(e);
      if (save('search', { engines: eng })) {
        try { form.parentNode && form.parentNode.removeChild(form); } catch (e2) {}
        rebuildActivePane();
      } else {
        showError(ferr, '保存失败，请检查输入。', form);
      }
    });
    pane.appendChild(form);
    try { name.focus(); } catch (e) {}
  }

  /* ================================================================== *
   * Tab 3 · 背景（含必应每日壁纸卡片，06 §4）
   * ================================================================== */
  function defaultBing() {
    return {
      source: 'auto', customApi: '', mkt: 'zh-CN', resolution: '1920x1080',
      index: 0, refresh: 'daily', showCopyright: true,
      cache: { date: '', url: '', copyright: '', copyrightLink: '', source: '' }
    };
  }
  function pick(v, list, def) { return list.indexOf(v) !== -1 ? v : def; }
  function wholeBing() {
    var t = sectionOrDefaults('theme');
    var b = isObj(t.bing) ? t.bing : {};
    var d = defaultBing();
    var c = isObj(b.cache) ? b.cache : {};
    return {
      source: pick(b.source, BING_SOURCES.map(function (x) { return x[0]; }), d.source),
      customApi: str(b.customApi),
      mkt: pick(b.mkt, BING_MKTS, d.mkt),
      resolution: pick(b.resolution, BING_RES, d.resolution),
      index: (b.index === 'random' || (typeof b.index === 'number' && b.index >= 0 && b.index <= 7)) ? b.index : 0,
      refresh: pick(b.refresh, BING_REFRESH, d.refresh),
      showCopyright: bool(b.showCopyright, true),
      cache: {
        date: str(c.date), url: str(c.url), copyright: str(c.copyright),
        copyrightLink: str(c.copyrightLink), source: str(c.source)
      }
    };
  }
  function patchBing(mutator) {
    var b = wholeBing();
    mutator(b);
    // 即时预览：切 bing 相关配置时先本地 apply（不依赖 patch 返回），再落库
    previewTheme(function (t) { t.bing = b; });
    save('theme', { bing: b });                 // 浅合并：传完整 bing 对象（含 cache 原值）
  }
  function previewTheme(mutator) {
    try {
      var t = sectionOrDefaults('theme');
      mutator(t);
      if (global.FYTheme && typeof global.FYTheme.apply === 'function') { global.FYTheme.apply(t); }
    } catch (e) {}
  }
  function renderThemePane(pane) {
    clearKids(pane);
    var theme = sectionOrDefaults('theme');
    var mode = theme.mode || 'default';
    var err = h('p', { 'class': 'fy-error', role: 'alert', hidden: true });

    // 预览小窗
    var preview = h('div', { 'class': 'fy-theme-preview', 'aria-hidden': 'true' });
    try { preview.style.background = previewBg(theme); } catch (e) {}
    pane.appendChild(preview);

    // mode radios（含 bing，P1）
    var modeField = h('div', { 'class': 'fy-field' });
    modeField.appendChild(h('span', { 'class': 'fy-label', text: '背景模式' }));
    var radios = h('div', { 'class': 'fy-mode-radios' });
    var modes = [['default', '默认背景'], ['image', '图片'], ['color', '纯色'], ['gradient', '渐变'], ['bing', '必应每日壁纸']];
    for (var i = 0; i < modes.length; i++) {
      (function (m) {
        var lab = h('label', { 'class': 'fy-label fy-label-inline' });
        var r = h('input', { type: 'radio', name: 'fy-mode', value: m[0], checked: (mode === m[0]), 'aria-label': m[1] });
        lab.appendChild(r); lab.appendChild(h('span', { text: ' ' + m[1] }));
        on(r, 'change', function () { if (r.checked) { onModeChange(m[0], theme, pane, err); } });
        radios.appendChild(lab);
      })(modes[i]);
    }
    modeField.appendChild(radios);
    pane.appendChild(modeField);

    // 各模式字段容器（选 bing 时整体置灰）
    var fields = h('div', { 'class': 'fy-mode-fields' });
    R.themeFields = fields;
    setAttr(fields, 'data-fy-mode-fields', 'all');
    if (mode === 'bing') { addClass(fields, 'is-fy-disabled'); setAttr(fields, 'aria-disabled', 'true'); }

    // image
    var imgField = h('div', { 'class': 'fy-field' });
    setAttr(imgField, 'data-fy-mode-field', 'image');
    imgField.appendChild(h('label', { 'class': 'fy-label', text: '图片网址 / 上传' }));
    var imgInput = h('input', { type: 'text', 'class': 'fy-input', value: theme.image || '', maxlength: URL_MAX,
      'aria-label': '图片网址', placeholder: 'https://… 或上传本地图片' });
    try { imgInput.value = theme.image || ''; } catch (e) {}
    on(imgInput, 'change', function () {
      var v = imgInput.value;
      if (v && !validHttpUrl(v) && !RE_DATA_IMG.test(v)) { showError(err, '请输入以 http(s) 开头的图片网址，或上传图片。', pane); return; }
      previewTheme(function (t) { t.image = v; t.mode = 'image'; });
      save('theme', { image: v });
    });
    imgField.appendChild(imgInput);
    var bgFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, 'aria-label': '上传背景图片' });
    var bgUp = h('button', { type: 'button', 'class': 'fy-btn', text: '上传图片' });
    on(bgUp, 'click', function () { try { bgFile.click(); } catch (e) {} });
    on(bgFile, 'change', function () {
      var f = bgFile.files && bgFile.files[0];
      if (!f) { return; }
      compressBg(f, function (e2, dataUrl) {
        if (e2 || !dataUrl) { showError(err, e2 ? e2.message : '背景图处理失败', pane); return; }
        previewTheme(function (t) { t.image = dataUrl; t.mode = 'image'; });
        save('theme', { image: dataUrl, mode: 'image' });
      });
    });
    imgField.appendChild(bgUp); imgField.appendChild(bgFile);
    imgField.appendChild(h('p', { 'class': 'fy-hint', text: '可填 http(s) 图片网址，或上传本地图片（会压缩后存在本机）。' }));
    fields.appendChild(imgField);

    // color
    var colorField = h('div', { 'class': 'fy-field' });
    setAttr(colorField, 'data-fy-mode-field', 'color');
    colorField.appendChild(h('label', { 'class': 'fy-label', text: '纯色' }));
    var colorInput = h('input', { type: 'color', 'class': 'fy-color', value: validColor(theme.color) ? theme.color : '#b1ddbc', 'aria-label': '纯色' });
    on(colorInput, 'input', function () { previewTheme(function (t) { t.color = colorInput.value; t.mode = 'color'; }); });
    on(colorInput, 'change', function () { save('theme', { color: colorInput.value }); });
    colorField.appendChild(colorInput);
    fields.appendChild(colorField);

    // gradient
    var gradField = h('div', { 'class': 'fy-field' });
    setAttr(gradField, 'data-fy-mode-field', 'gradient');
    gradField.appendChild(h('label', { 'class': 'fy-label', text: '渐变' }));
    var gradInput = h('input', { type: 'text', 'class': 'fy-input', value: theme.gradient || '', maxlength: 256,
      'aria-label': '渐变', placeholder: 'linear-gradient(135deg,#b1ddbc,#e8f5ec)' });
    try { gradInput.value = theme.gradient || ''; } catch (e) {}
    on(gradInput, 'change', function () {
      var v = gradInput.value;
      if (!validGradient(v)) { showError(err, '请输入 CSS 渐变，例如 linear-gradient(135deg,#b1ddbc,#e8f5ec)。', pane); return; }
      previewTheme(function (t) { t.gradient = v; t.mode = 'gradient'; });
      save('theme', { gradient: v });
    });
    gradField.appendChild(gradInput);
    fields.appendChild(gradField);

    // blur / overlay / overlayColor（通用）
    fields.appendChild(rangeField('背景模糊', 0, 24, 1, theme.blur, 'px',
      function (v, numEl) { setText(numEl, String(v)); previewTheme(function (t) { t.blur = v; }); },
      function (v) { save('theme', { blur: v }); }));
    fields.appendChild(rangeField('遮罩透明度', 0, 0.8, 0.05, theme.overlay, '',
      function (v, numEl) { setText(numEl, String(v)); previewTheme(function (t) { t.overlay = v; }); },
      function (v) { save('theme', { overlay: v }); }));
    var ocField = h('div', { 'class': 'fy-field' });
    ocField.appendChild(h('label', { 'class': 'fy-label', text: '遮罩颜色' }));
    var ocInput = h('input', { type: 'color', 'class': 'fy-color', value: validColor(theme.overlayColor) ? theme.overlayColor : '#000000', 'aria-label': '遮罩颜色' });
    on(ocInput, 'change', function () { save('theme', { overlayColor: ocInput.value }); });
    ocField.appendChild(ocInput);
    fields.appendChild(ocField);
    pane.appendChild(fields);

    // 按当前 mode 显隐对应 field（不销毁 DOM，避免焦点丢失）
    applyModeFieldVisibility(mode);

    // 空状态
    if (mode === 'default') {
      pane.appendChild(h('p', { 'class': 'fy-empty', text: '当前使用站点默认背景。选一种模式即可自定义。' }));
    }
    // 恢复默认背景（危险操作，06 §4：需二次确认）
    var resetBg = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', text: '恢复默认背景' });
    on(resetBg, 'click', function () {
      openConfirm({ title: '恢复默认背景', desc: '确定把背景恢复为站点默认吗？', danger: true, trigger: resetBg,
        onConfirm: function () { save('theme', { mode: 'default' }); rebuildActivePane(); } });
    });
    pane.appendChild(resetBg);
    pane.appendChild(err);

    // 必应每日壁纸卡片（06 §4）
    pane.appendChild(buildBingCard(theme, pane));
  }
  function applyModeFieldVisibility(mode) {
    if (!R.themeFields || !R.themeFields.querySelectorAll) { return; }
    try {
      var list = R.themeFields.querySelectorAll('[data-fy-mode-field]');
      for (var i = 0; i < list.length; i++) {
        var f = list[i];
        var m = getAttr(f, 'data-fy-mode-field');
        show(f, m === mode);                    // 只显示对应模式字段
      }
    } catch (e) {}
  }
  function previewBg(theme) {
    if (theme.mode === 'image' && theme.image) { return 'url("' + theme.image + '") center/cover'; }
    if (theme.mode === 'color') { return validColor(theme.color) ? theme.color : '#b1ddbc'; }
    if (theme.mode === 'gradient') { return validGradient(theme.gradient) ? theme.gradient : 'linear-gradient(135deg,#b1ddbc,#e8f5ec)'; }
    if (theme.mode === 'bing' && theme.bing && theme.bing.cache && theme.bing.cache.url) {
      return 'url("' + theme.bing.cache.url + '") center/cover';
    }
    return 'linear-gradient(135deg,#b1ddbc,#e8f5ec)';
  }
  function rangeField(label, min, max, step, value, unit, onInput, onChange) {
    var f = h('div', { 'class': 'fy-field' });
    var lab = h('label', { 'class': 'fy-label' });
    lab.appendChild(h('span', { text: label + ' ' }));
    // 局部显示节点必须叫 numEl：若叫 num，var 提升会遮蔽模块级工具函数 num()，
    // 导致 String(num(value,0)) 抛 "num is not a function"，整个背景 Tab 渲染中断。
    var numEl = h('span', { text: String(num(value, 0)) });
    lab.appendChild(numEl); lab.appendChild(h('span', { text: ' ' + unit }));
    f.appendChild(lab);
    var r = h('input', { type: 'range', 'class': 'fy-range', min: min, max: max, step: step,
      value: num(value, min), 'aria-label': label });
    on(r, 'input', function () { var v = num(r.value, min); onInput(v, numEl); });
    on(r, 'change', function () { var v = num(r.value, min); onChange(v); });
    f.appendChild(r);
    return f;
  }
  function onModeChange(mode, theme, pane, err) {
    if (mode === 'bing') {
      // 开关启用即切 mode:'bing'，并把完整 bing 对象写入（含默认 / 现有配置）
      var b = wholeBing();
      previewTheme(function (t) { t.mode = 'bing'; t.bing = b; });
      save('theme', { mode: 'bing', bing: b });
      // 触发一次壁纸加载（若 FYTheme 就绪）
      triggerBingLoad(true);
    } else {
      // 切回其它 mode：停止定时器 / 清理由 dev-theme 处理，这里只落库
      previewTheme(function (t) { t.mode = mode; });
      save('theme', { mode: mode });
    }
    rebuildActivePane();
  }
  /* 上传背景：传 PRESET_BG（P4），回调里 MIME + 长度二次校验兜底 */
  function compressBg(file, cb) {
    var T = global.FYTheme;
    if (!T || typeof T.compressImage !== 'function') { cb(new Error('图片压缩功能不可用'), null); return; }
    var opts = T.PRESET_BG || undefined;
    try { if (opts) { T.compressImage(file, wrapped, opts); } else { T.compressImage(file, wrapped); } }
    catch (e) { cb(e, null); }
    function wrapped(err, dataUrl) {
      if (err || !dataUrl) { cb(err || new Error('背景图处理失败'), null); return; }
      if (!RE_DATA_IMG.test(dataUrl)) { cb(new Error('图片格式不支持（仅 png/jpeg/webp）'), null); return; }
      if (dataUrl.length > BG_MAX_CHARS) { cb(new Error('背景图过大，请换一张更小的图，或改用 http(s) 图片网址'), null); return; }
      cb(null, dataUrl);
    }
  }

  /* ---------- 必应每日壁纸卡片 ---------- */
  function buildBingCard(theme, pane) {
    var card = h('div', { 'class': 'fy-bing-card' });
    var head = h('div', { 'class': 'fy-bing-head' });
    head.appendChild(h('h3', { 'class': 'fy-bing-title', text: '必应每日壁纸' }));
    // 启用开关
    var swLab = h('label', { 'class': 'fy-label fy-label-inline' });
    var sw = h('input', { type: 'checkbox', 'class': 'fy-switch', checked: (theme.mode === 'bing'), 'aria-label': '启用必应每日壁纸' });
    swLab.appendChild(sw); swLab.appendChild(h('span', { text: ' 启用' }));
    on(sw, 'change', function () {
      if (sw.checked) { onModeChange('bing', theme, pane, null); }
      else { onModeChange('default', theme, pane, null); }
    });
    head.appendChild(swLab);
    card.appendChild(head);

    var apiReady = !!(global.FYTheme && typeof global.FYTheme.loadBing === 'function' && typeof global.FYTheme.refreshBing === 'function');
    if (!apiReady) {
      card.appendChild(h('p', { 'class': 'fy-bing-unavailable',
        text: '壁纸功能暂不可用（主题模块未就绪）。其余背景设置仍可正常使用。' }));
    }

    var b = wholeBing();
    // 状态 / 版权：fill 阶段就用 wholeBing() 读到的缓存主动内联回填，不依赖
    // fy:settings-change 回调（壁纸常在面板打开前就加载完，见 qa-browser E2E D1）。
    R.bingStatus = h('div', { 'class': 'fy-bing-status', role: 'status', 'aria-live': 'polite',
      text: bingStatusText(b) });
    setAttr(R.bingStatus, 'data-fy-state', bingStatusState(b));
    card.appendChild(R.bingStatus);
    // 版权（textContent 注入，06 §3 第 7 条 / 断言 12）
    R.bingCopyright = h('p', { 'class': 'fy-bing-copyright' });
    card.appendChild(R.bingCopyright);
    fillBingCopyright(R.bingCopyright, b);

    var grid = h('div', { 'class': 'fy-bing-grid' });
    // 来源
    grid.appendChild(bingSelectField('来源', 'fy-bing-source', sourceOptions(), b.source, function (v) {
      patchBing(function (x) { x.source = v; });
      showCustomApi(v);
    }));
    // 地区
    grid.appendChild(bingSelectField('地区', 'fy-bing-mkt', enumOptions(BING_MKTS), b.mkt, function (v) {
      patchBing(function (x) { x.mkt = v; });
    }));
    // 分辨率
    grid.appendChild(bingSelectField('分辨率', 'fy-bing-res', enumOptions(BING_RES), b.resolution, function (v) {
      patchBing(function (x) { x.resolution = v; });
    }));
    // 日期 / 随机
    var idxOpts = [['0', '今天']];
    for (var d = 1; d <= 7; d++) { idxOpts.push([String(d), d + ' 天前']); }
    idxOpts.push(['random', '近 8 天随机']);
    grid.appendChild(bingSelectField('日期', 'fy-bing-index', idxOpts, String(b.index), function (v) {
      patchBing(function (x) { x.index = (v === 'random') ? 'random' : num(v, 0); });
    }));
    // 刷新频率
    var refOpts = [['daily', '每日自动换'], ['every-load', '每次打开都取'], ['manual', '仅手动换']];
    grid.appendChild(bingSelectField('刷新频率', 'fy-bing-refresh', refOpts, b.refresh, function (v) {
      patchBing(function (x) { x.refresh = v; });
    }));
    // 显示版权
    var cpField = h('div', { 'class': 'fy-field' });
    var cpLab = h('label', { 'class': 'fy-label fy-label-inline' });
    var cp = h('input', { type: 'checkbox', 'class': 'fy-switch', checked: b.showCopyright, 'aria-label': '显示版权信息' });
    cpLab.appendChild(cp); cpLab.appendChild(h('span', { text: ' 显示版权' }));
    on(cp, 'change', function () { patchBing(function (x) { x.showCopyright = !!cp.checked; }); });
    cpField.appendChild(cpLab);
    grid.appendChild(cpField);
    card.appendChild(grid);

    // 自定义 API（仅 http(s)）
    var apiField = h('div', { 'class': 'fy-field', id: 'fy-bing-custom-field' });
    apiField.appendChild(h('label', { 'class': 'fy-label', text: '自定义 API' }));
    var apiInput = h('input', { type: 'text', 'class': 'fy-input', value: b.customApi, maxlength: URL_MAX,
      'aria-label': '自定义壁纸 API', placeholder: '填返回 {url:"…"} 的 JSON 接口，或直接图片 URL（仅 http(s)）' });
    try { apiInput.value = b.customApi; } catch (e) {}
    var apiErr = h('p', { 'class': 'fy-error', role: 'alert', hidden: true });
    on(apiInput, 'change', function () {
      var v = String(apiInput.value || '').replace(/^\s+|\s+$/g, '');
      if (v && !validHttpUrl(v)) { showError(apiErr, '自定义 API 仅支持 http:// 或 https:// 开头的地址。', card); return; }
      show(apiErr, false);
      patchBing(function (x) { x.customApi = v; });
    });
    apiField.appendChild(apiInput); apiField.appendChild(apiErr);
    card.appendChild(apiField);
    function showCustomApi(src) { show(apiField, src === 'custom'); }
    showCustomApi(b.source);

    // 立即换一张
    var acts = h('div', { 'class': 'fy-bing-actions' });
    var refreshBtn = h('button', { type: 'button', 'class': 'fy-btn fy-btn-primary', text: '立即换一张' });
    setAttr(refreshBtn, 'aria-label', '立即换一张必应壁纸');
    on(refreshBtn, 'click', function () {
      if (!apiReady) { showError(apiErr, '壁纸功能暂不可用。', card); return; }
      triggerBingLoad(false);
    });
    acts.appendChild(refreshBtn);
    card.appendChild(acts);

    refreshBingReadonly();
    return card;
  }
  function sourceOptions() {
    var out = BING_SOURCES.slice();
    // 若 FYTheme.BING_SOURCES 就绪，用其 id/label 补全（不覆盖 auto/custom）
    try {
      var src = global.FYTheme && global.FYTheme.BING_SOURCES;
      if (src && src.length) {
        for (var i = 0; i < src.length; i++) {
          var s = src[i], id = s && (s.id || s.value);
          if (!id || id === 'auto' || id === 'custom') { continue; }
          var found = false;
          for (var j = 0; j < out.length; j++) { if (out[j][0] === id) { found = true; break; } }
          if (!found) { out.push([String(id), String((s.label || s.name || id))]); }
        }
      }
    } catch (e) {}
    return out;
  }
  function enumOptions(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) { out.push([arr[i], arr[i]]); }
    return out;
  }
  function bingSelectField(label, id, options, value, setter) {
    var f = h('div', { 'class': 'fy-field' });
    f.appendChild(h('label', { 'class': 'fy-label', text: label }));
    var sel = h('select', { 'class': 'fy-select', id: id, 'aria-label': label });
    for (var i = 0; i < options.length; i++) { sel.appendChild(h('option', { value: options[i][0], text: options[i][1] })); }
    try { sel.value = String(value); } catch (e) {}
    on(sel, 'change', function () { setter(sel.value); });
    f.appendChild(sel);
    return f;
  }
  /* 触发壁纸加载：调 FYTheme.refreshBing()，状态靠 cache 变化 / 超时兜底更新 */
  function triggerBingLoad(isEnable) {
    var T = global.FYTheme;
    if (!T || typeof T.refreshBing !== 'function') { return; }
    bingAwaiting = true;
    setBingStatus('获取中…', 'loading');
    try { T.refreshBing(); } catch (e) { bingAwaiting = false; setBingStatus('壁纸获取失败，已恢复默认背景', 'error'); return; }
    clearT(bingLoadTimer);
    var beforeDate = wholeBing().cache.date;
    bingLoadTimer = later(function () {
      bingAwaiting = false;
      try {
        var t = sectionOrDefaults('theme');
        var cur = wholeBing();
        if (t.mode !== 'bing') { setBingStatus('壁纸源均不可用，已恢复默认背景', 'error'); return; }
        if (cur.cache.date && cur.cache.date !== beforeDate) { refreshBingReadonly(); return; }
        setBingStatus('已恢复默认背景（壁纸源暂不可用）', 'error');
      } catch (e) {}
    }, 8000);
  }
  function setBingStatus(text, state) {
    if (!R.bingStatus) { return; }
    setText(R.bingStatus, text);
    setAttr(R.bingStatus, 'data-fy-state', state || '');
  }
  /* 只读刷新：从 theme.bing.cache 读版权 / 来源名，textContent 注入（06 断言 12）。
     fill 阶段（buildBingCard）也直接调同一组 helper，避免「缓存已写好但面板未打开」时
     版权 / 状态区空白（qa-browser E2E D1）。 */
  function bingStatusText(b) {
    var t = sectionOrDefaults('theme');
    var c = (b && isObj(b.cache)) ? b.cache : {};
    if (t.mode !== 'bing') { return '未启用必应壁纸'; }
    if (str(c.url)) {
      return '已用 ' + sourceLabel(str(c.source) || str(b.source)) + ' 源' + (c.date ? ' · ' + c.date : '');
    }
    // 全部源失败时 theme.js 会 clearBingCache + 广播（cache 清空、配置 mode 仍为 bing）；
    // bingAwaiting 为「本次换图进行中」标志，据此立即显示回退状态，不必等 8s 兜底。
    return bingAwaiting ? '壁纸源均不可用，已恢复默认背景' : '加载中 / 等待壁纸';
  }
  function bingStatusState(b) {
    var t = sectionOrDefaults('theme');
    var c = (b && isObj(b.cache)) ? b.cache : {};
    if (t.mode !== 'bing') { return ''; }
    if (str(c.url)) { return 'ok'; }
    return bingAwaiting ? 'error' : 'loading';
  }
  function fillBingCopyright(node, b) {
    if (!node) { return; }
    clearKids(node);
    var c = (b && isObj(b.cache)) ? b.cache : {};
    if (!bool(b && b.showCopyright, true)) { return; }
    if (str(c.copyright)) {
      node.appendChild(doc.createTextNode(str(c.copyright)));
      if (validHttpUrl(c.copyrightLink)) {
        node.appendChild(h('a', { href: c.copyrightLink, target: '_blank',
          rel: 'noopener noreferrer', text: ' © 版权详情' }));
      }
    } else {
      node.appendChild(doc.createTextNode('必应图片有版权，仅作个人壁纸使用。'));
    }
  }
  function refreshBingReadonly() {
    if (!R.bingStatus && !R.bingCopyright) { return; }
    try {
      var b = wholeBing();
      if (b && isObj(b.cache) && str(b.cache.url)) { bingAwaiting = false; }  // 成功回写：清除等待标志
      if (R.bingStatus) { setBingStatus(bingStatusText(b), bingStatusState(b)); }
      if (R.bingCopyright) { fillBingCopyright(R.bingCopyright, b); }
    } catch (e) {}
  }
  function sourceLabel(id) {
    var opts = sourceOptions();
    for (var i = 0; i < opts.length; i++) { if (opts[i][0] === id) { return opts[i][1]; } }
    return id || '自动';
  }

  /* ================================================================== *
   * Tab 4 · 数据
   * ================================================================== */
  function renderDataPane(pane) {
    clearKids(pane);
    var cfg = safeConfig() || {};
    R.dataState = h('p', { 'class': 'fy-hint' });
    setText(R.dataState, (cfg.ui && cfg.ui.hasCustomized) ? '已自定义' : '尚未自定义');
    pane.appendChild(R.dataState);
    var ver = (S && S.SCHEMA_VERSION) || 1;
    var key = (S && S.STORAGE_KEY) || 'foryouos.customize.v1';
    R.dataSize = h('span', { text: '约 ' + estimateKB() + ' KB' });
    var info = h('p', { 'class': 'fy-hint' });
    info.appendChild(h('span', { text: '配置版本 v' + ver + ' · 存储键 ' + key + ' · 当前配置' }));
    info.appendChild(R.dataSize);
    info.appendChild(h('span', { text: '，只保存在这台设备的浏览器里。' }));
    pane.appendChild(info);

    var err = h('p', { 'class': 'fy-error', role: 'alert', hidden: true });

    var actions = h('div', { 'class': 'fy-data-actions' });
    var expBtn = h('button', { type: 'button', 'class': 'fy-btn', text: '导出为 JSON 文件' });
    var impBtn = h('button', { type: 'button', 'class': 'fy-btn', text: '导入配置' });
    var resetBtn = h('button', { type: 'button', 'class': 'fy-btn fy-btn-danger', text: '恢复全部默认' });
    actions.appendChild(expBtn); actions.appendChild(impBtn); actions.appendChild(resetBtn);
    pane.appendChild(actions);

    // 分 section 重置（二次确认）
    var secRow = h('div', { 'class': 'fy-data-actions' });
    var secNames = [['icons', '图标'], ['search', '搜索'], ['theme', '背景']];
    for (var i = 0; i < secNames.length; i++) {
      (function (sn) {
        var b = h('button', { type: 'button', 'class': 'fy-btn fy-btn-ghost', text: '重置「' + sn[1] + '」' });
        on(b, 'click', function () {
          openConfirm({ title: '重置本 Tab', desc: '确定把「' + sn[1] + '」恢复为默认吗？', danger: true, trigger: b,
            onConfirm: function () { beforeBigChange(); var r = S.reset(sn[0]); afterReset(r); } });
        });
        secRow.appendChild(b);
      })(secNames[i]);
    }
    pane.appendChild(secRow);

    // 复制导出文本
    var copyRow = h('div', { 'class': 'fy-copy-row' });
    var copyInput = h('input', { type: 'text', 'class': 'fy-input', readonly: true, 'aria-label': '配置 JSON 文本（可复制）' });
    try { copyInput.value = ''; } catch (e) {}
    var copyBtn = h('button', { type: 'button', 'class': 'fy-btn', text: '复制配置文本' });
    copyRow.appendChild(copyInput); copyRow.appendChild(copyBtn);
    pane.appendChild(copyRow);

    // 导入区
    var importArea = h('div', { 'class': 'fy-import-area', hidden: true });
    importArea.appendChild(h('label', { 'class': 'fy-label', text: '粘贴配置 JSON，或选择 .json 文件' }));
    var ta = h('textarea', { 'class': 'fy-textarea', rows: 6, 'aria-label': '配置 JSON' });
    var impFile = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '选择 .json 文件' });
    var impErr = h('p', { 'class': 'fy-error', role: 'alert', hidden: true });
    var doImport = h('button', { type: 'button', 'class': 'fy-btn fy-btn-primary', text: '确认导入并覆盖' });
    var impHint = h('p', { 'class': 'fy-hint', text: '导入会覆盖当前全部设置，建议先「导出配置」备份。' });
    importArea.appendChild(ta); importArea.appendChild(impFile); importArea.appendChild(impHint);
    importArea.appendChild(doImport); importArea.appendChild(impErr);
    pane.appendChild(importArea);
    pane.appendChild(err);

    // 导出
    on(expBtn, 'click', function () {
      var text = '';
      try { text = S['export'](); } catch (e) { text = '{}'; }
      try { copyInput.value = text; } catch (e2) {}
      var ok = false;
      try {
        var blob = new global.Blob([text], { type: 'application/json' });
        var a = h('a', { download: 'foryouos-customize-v' + ver + '.json' });
        var url = global.URL && global.URL.createObjectURL ? global.URL.createObjectURL(blob) : '';
        if (url) {
          a.href = url;
          doc.body.appendChild(a);
          a.click();
          try { doc.body.removeChild(a); } catch (e3) {}
          if (global.URL.revokeObjectURL) { global.URL.revokeObjectURL(url); }
          ok = true;
        }
      } catch (e4) {}
      if (ok) { setSaveStatus('✓ 已导出配置', 'ok'); }
      else { copyInput.focus(); copyInput.select && copyInput.select(); setSaveStatus('已生成配置文本，请手动复制', 'info'); }
    });
    on(copyBtn, 'click', function () {
      var text = '';
      try { text = S['export'](); } catch (e) {}
      try { copyInput.value = text; copyInput.focus(); copyInput.select && copyInput.select(); } catch (e2) {}
      var copied = false;
      try { if (global.navigator && global.navigator.clipboard) { global.navigator.clipboard.writeText(text); copied = true; } } catch (e3) {}
      try { if (!copied && doc.execCommand) { copied = doc.execCommand('copy'); } } catch (e4) {}
      setSaveStatus(copied ? '✓ 已复制配置文本' : '已填入文本框，请按 Ctrl+C 复制', copied ? 'ok' : 'info');
    });
    // 导入
    on(impBtn, 'click', function () { show(importArea, getAttr(importArea, 'hidden') !== null); });
    on(impFile, 'change', function () {
      var f = impFile.files && impFile.files[0];
      if (!f) { return; }
      try {
        var reader = new global.FileReader();
        reader.onload = function (ev) { try { ta.value = String(ev.target.result || ''); } catch (e) {} };
        reader.onerror = function () { showError(impErr, '读取文件失败，请改用粘贴方式。', importArea); };
        reader.readAsText(f);
      } catch (e) { showError(impErr, '当前浏览器不支持读取文件，请改用粘贴方式。', importArea); }
    });
    on(doImport, 'click', function () {
      var text = String(ta.value || '');
      if (!text) { showError(impErr, '导入内容为空，请粘贴配置 JSON。', importArea); return; }
      openConfirm({ title: '导入覆盖', desc: '导入会覆盖当前全部设置，确定继续吗？建议先「导出配置」备份。',
        danger: true, trigger: doImport, onConfirm: function () {
          beforeBigChange();
          var r = S['import'](text);
          if (r && r.ok) {
            setSaveStatus('✓ 已导入配置', 'ok');
            try { rebuildActivePane(); } catch (e) {}
            // import 广播 section='*' 会触发 tryApplyRefresh / 图标重绘
          } else {
            setText(err, friendlyImportError(r && r.error));
            show(err, true);
            show(impErr, false);
          }
        } });
    });
    // 全量重置
    on(resetBtn, 'click', function () {
      openConfirm({ title: '恢复全部默认', desc: '确定清空全部自定义并恢复默认吗？此操作不可撤销（可用「撤销」撤回一次）。',
        danger: true, trigger: resetBtn, onConfirm: function () {
          beforeBigChange();
          var r = S.reset();
          afterReset(r);
        } });
    });
  }
  function beforeBigChange() { pushUndo(safeConfig()); }
  function afterReset(r) {
    if (r && r.ok) { setSaveStatus('✓ 已恢复默认', 'ok'); rebuildActivePane(); }
    else { setSaveStatus('⚠ ' + friendlyError(r && r.error), 'error'); }
  }
  function friendlyImportError(err) {
    var e = str(err);
    if (e.indexOf('UNSUPPORTED_VERSION') !== -1) { return '配置版本不兼容（当前支持 v1），现有配置未做任何改动。'; }
    if (e.indexOf('PARSE_ERROR') !== -1) { return '导入内容不是合法的 JSON，现有配置未做任何改动。'; }
    if (e.indexOf('VALIDATION_FAILED') !== -1) { return '配置校验未通过：' + e.split(':').slice(1).join(':').replace(/^\s+/, '') + '，现有配置未做任何改动。'; }
    return '导入失败：' + (e || '未知错误') + '，现有配置未做任何改动。';
  }

  /* ================================================================== *
   * boot：DOMContentLoaded / readyState 判断 + 全量降级
   * ================================================================== */
  function boot() {
    try {
      S = global.FYSettings;
      // 降级前提：FYSettings 缺失 / 容器缺失 → 不显示入口，面板保持 hidden，不抛异常
      if (!S || typeof S.patch !== 'function' || typeof S.getSection !== 'function') { return; }
      btn = doc.getElementById ? doc.getElementById('fy-settings-btn') : null;
      panel = doc.getElementById ? doc.getElementById('fy-panel') : null;
      if (!btn || !panel) { return; }
      // 两端判定：移动端不引入 desktop-icons.js，也没有 #top_colum / #movie（01 §0）
      isMobile = !(doc.getElementById && doc.getElementById('top_colum') && doc.getElementById('movie'));
      try {
        if (doc.documentElement && doc.documentElement.classList) {
          doc.documentElement.classList.add(isMobile ? 'fy-mobile' : 'fy-pc');
        }
      } catch (e) {}
      activeTab = isMobile ? 'search' : 'icons';
      buildPanel();
      injectButton();
      on(doc, 'keydown', onGlobalKeydown, false);
      wireFYIconsHooks();
      wireIconEditRequest();
      // dev-icons 的 render 经 setTimeout(0) 异步执行且会清掉装饰节点；若其后续补发
      // fy:icons-rendered 事件，这里作为可靠的重注入主路径（later(0) 为兜底）。
      on(doc, 'fy:icons-rendered', function () { if (editMode) { later(decorateEdit, 0); } });
      try { if (S.subscribe) { S.subscribe(onSettingsChange); } } catch (e) {}
      ready = true;
    } catch (e) {
      // 任何异常都降级：入口保持隐藏，面板保持 hidden
      ready = false;
      try { if (btn) { removeClass(btn, 'fy-ready'); } } catch (e2) {}
      try { if (panel) { show(panel, false); } } catch (e3) {}
    }
  }

  /* 暴露契约 API（恒存在，Node 桩 / 降级时切换安全 no-op） */
  global.FYCustomize = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen
  };

  /* DOM 就绪判定：脚本在 </body> 前，body 已存在 */
  try {
    if (doc.readyState === 'loading') {
      on(doc, 'DOMContentLoaded', boot, false);
    } else {
      boot();
    }
  } catch (e) {
    try { boot(); } catch (e2) {}
  }

})(typeof window !== 'undefined' ? window : this);
