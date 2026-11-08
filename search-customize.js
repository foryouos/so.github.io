/*!
 * foryouos 导航页 · 搜索引擎自定义接入（PC / 移动端共用）
 * ---------------------------------------------------------------------------
 * 由 search.js 的 boot() 首句在 init() 之前调用：
 *     FYSearchCustomize.apply(CFG, engines)
 *   · 读取 FYSettings.getSection('search')，原地改写 CFG 的 3 项与 engines 数组内容；
 *   · 绝不替换 CFG.engines / engines 的引用（闭包里多处持有同一数组，见契约 P2）；
 *   · 内置引擎字段以 search.js 顶部 CFG 的快照为真值，自定义引擎按白名单清洗；
 *   · ai 伪引擎只读、恒存在（字段恒来自快照），url/param 保持空串，绝不拼 URL。
 * 运行期订阅 fy:settings-change，search 段变化时重新 apply + FYSearch.refresh()。
 * 零构建、ES5、单一全局 FYSearchCustomize、零 localStorage 读写。
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var doc = global.document;

  /* ---------- 模块级缓存（S0：内置真值只在首次有效 apply 固化一次） ---------- */
  var cachedCFG = null;
  var cachedEngines = null;
  var BUILTIN = null;       // 内置 7 项深拷贝
  var BUILTIN_MAP = null;   // id -> 内置项深拷贝
  var AI_SNAPSHOT = null;   // ai 只读项深拷贝
  var lastDefaultEngine = null;    // 每次 apply 写入的 section.defaultEngine（原样声明值）
  var initialDeclaredDefault = null; // 首次 apply 的声明默认（固化，作为变化检测基线）
  var lastEventDefault = null;    // 上次 onChange 处理的事件默认（跨链路检测「设为默认」变更）
  var subscribed = false;
  var applying = false;

  /* 内置 id：与 search.js 顶部 CFG / settings.js defaults 一致 */
  var BUILTIN_IDS = ['bing', 'baidu', 'google', 'ai', 'bilibili', 'github', 'douban'];
  /* 自定义 id 不得覆盖内置 id（尤其 ai），并避开 LOGOS 原型键 */
  var RESERVED = {
    bing: 1, baidu: 1, google: 1, ai: 1, bilibili: 1, github: 1, douban: 1,
    constructor: 1, prototype: 1, toString: 1, hasOwnProperty: 1, valueOf: 1
  };

  /* 与 settings.js 同一套规则（契约 P3：validate 与 apply 共用，避免校验过却被改 q） */
  var PARAM_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
  var EXTRA_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
  var ENGINE_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
  var CTRL_RE = /[\u0000-\u001F\u007F]/;

  /* ------------------------------ 小工具 ------------------------------ */
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isArr(a) { return Object.prototype.toString.call(a) === '[object Array]'; }
  function isObj(o) { return o !== null && typeof o === 'object' && !isArr(o); }

  function deepClone(v) {
    if (isArr(v)) { var a = [], i; for (i = 0; i < v.length; i++) { a.push(deepClone(v[i])); } return a; }
    if (isObj(v)) { var o = {}, k; for (k in v) { if (hasOwn(v, k)) { o[k] = deepClone(v[k]); } } return o; }
    return v;
  }

  /* 优先用 dev-settings 导出的 isValidParam；未导出时用同款正则兜底 */
  function isValidParam(p) {
    var FS = global.FYSettings;
    if (FS && typeof FS.isValidParam === 'function') {
      try { return !!FS.isValidParam(p); } catch (e) { /* 落到内置正则 */ }
    }
    return typeof p === 'string' && PARAM_RE.test(p);
  }

  function cleanUrl(u) {
    if (typeof u !== 'string' || u.length > 2048) { return null; }
    if (!/^https?:\/\//i.test(u)) { return null; }        // 仅 http(s)，拒绝 javascript:/data:/相对路径
    if (/javascript\s*:/i.test(u)) { return null; }
    if (CTRL_RE.test(u) || /\s/.test(u)) { return null; }
    return u;
  }

  function cleanExtra(e) {
    var out = {};
    if (!isObj(e)) { return out; }
    for (var k in e) {
      if (!hasOwn(e, k) || !EXTRA_KEY_RE.test(k)) { continue; }   // 非法键剔除
      var v = e[k];
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') { continue; }
      out[k] = String(v).slice(0, 256);
    }
    return out;
  }

  function cleanName(n, id) {
    if (typeof n !== 'string') { return id; }
    var t = n.replace(/^\s+|\s+$/g, '').slice(0, 40);
    return t || id;
  }

  function cleanPlaceholder(p) {
    if (typeof p !== 'string' || CTRL_RE.test(p)) { return ''; }
    return p.slice(0, 120);
  }

  /* 自定义引擎清洗：url 不合格整项丢弃；其余字段按白名单降级；ai 标记一律剥离 */
  function cleanCustom(raw, usedIds) {
    if (!isObj(raw)) { return null; }
    var id = raw.id;
    if (typeof id !== 'string' || !ENGINE_ID_RE.test(id)) { return null; }
    if (RESERVED[id]) { return null; }                // 不得覆盖内置 id（尤其 ai）/ 原型键
    if (usedIds[id]) { return null; }                 // 与已加入的自定义 id 冲突
    var url = cleanUrl(raw.url);
    if (url === null) { return null; }
    var eng = {
      id: id,
      name: cleanName(raw.name, id),
      url: url,
      param: isValidParam(raw.param) ? raw.param : 'q',
      extra: cleanExtra(raw.extra),
      suggest: (raw.suggest === 'bing' || raw.suggest === 'baidu') ? raw.suggest : null,
      builtin: false
    };                                               // 不写 ai：自定义项禁止伪引擎
    var ph = cleanPlaceholder(raw.placeholder);
    if (ph) { eng.placeholder = ph; }
    usedIds[id] = 1;
    return eng;
  }

  /* ---------------------- S0：固化内置真值 ---------------------- */
  /* 运行期每次 apply 都自行判环境：与 boot()（search.js:550）同一判据（契约 P12）。
     无法判断（桩无 getElementById）时按 PC 处理，保留 ai。 */
  function envNoAiPanel() {
    try {
      if (doc && typeof doc.getElementById === 'function') {
        var el = doc.getElementById('ai-panel');
        return (el === null || el === undefined);
      }
    } catch (e) { /* 视为 PC */ }
    return false;
  }

  function ensureSnapshot(CFG, engines) {
    if (BUILTIN) { return; }
    cachedCFG = CFG;
    cachedEngines = engines;
    BUILTIN = deepClone(engines);                    // 首次：完整 7 项
    BUILTIN_MAP = {};
    var i, e;
    for (i = 0; i < BUILTIN.length; i++) {
      e = BUILTIN[i];
      e.builtin = true;                             // 契约 §3 Engine 结构
      BUILTIN_MAP[e.id] = deepClone(e);
      if (e.id === 'ai') { AI_SNAPSHOT = deepClone(e); }
    }
    if (!AI_SNAPSHOT) {                            // 极端兜底：快照缺 ai
      AI_SNAPSHOT = {
        id: 'ai', name: 'AI 搜索', url: '', param: '', extra: {}, suggest: 'bing',
        ai: true, placeholder: '输入关键词，让 AI 跨平台找并排序', builtin: true
      };
      BUILTIN_MAP.ai = deepClone(AI_SNAPSHOT);
    }
  }

  /* ---------------- 订阅：fy:settings-change（仅注册一次） ---------------- */
  function onChange(evt) {
    if (applying) { return; }                        // 重入保护（防与面板显式调用互激）
    var detail = (evt && evt.detail) || {};
    var section = detail.section;
    var source = detail.source;
    // 其它 section 的 patch（theme/icons/ui）不触发；search 段 / import / reset / storage 触发
    if (section !== 'search' && section !== '*' && source === 'patch') { return; }

    applying = true;
    try {
      if (!cachedCFG || !cachedEngines) { return; }
      /* 从事件自带的 config 快照读「声明的默认引擎」：即便另一条 subscribe 兜底链路
         抢先调用过 apply（会更新 lastDefaultEngine），仍能正确判断「设为默认」变更。 */
      var decl = (detail.config && detail.config.search &&
                  typeof detail.config.search.defaultEngine === 'string')
        ? detail.config.search.defaultEngine : null;
      var before = (lastEventDefault !== null) ? lastEventDefault : initialDeclaredDefault;
      apply(cachedCFG, cachedEngines);               // 重新合并（只读配置，不广播、不写存储）
      var now = (decl !== null) ? decl : lastDefaultEngine;
      var changed = (before !== null && now !== null && before !== now);
      var FY = global.FYSearch;
      if (FY && typeof FY.refresh === 'function') {
        FY.refresh(changed ? { forceDefault: true } : undefined);
      }
      lastEventDefault = now;
    } finally {
      applying = false;
    }
  }

  function ensureSubscribed() {
    if (subscribed) { return; }
    subscribed = true;
    // 主路径：契约 §2 / 团队指定的 DOM 事件
    if (doc && typeof doc.addEventListener === 'function') {
      try { doc.addEventListener('fy:settings-change', onChange, false); return; } catch (e) {}
    }
    // 兜底：无 DOM 事件时退到 FYSettings.subscribe（detail 结构一致）
    var FS = global.FYSettings;
    if (FS && typeof FS.subscribe === 'function') {
      try { FS.subscribe(function (config, detail) { onChange({ detail: detail }); }); } catch (e) {}
    }
  }

  /* ------------------- apply：原地改写 CFG 与 engines ------------------- */
  function applyUnsafe(CFG, engines) {
    // S1：无 FYSettings / 读段失败 → no-op，页面回退内置 7 项
    var FS = global.FYSettings;
    var section = (FS && typeof FS.getSection === 'function') ? FS.getSection('search') : null;
    if (!isObj(section)) { return; }

    // 允许 apply() 省参调用（用首次缓存的引用）
    if (!CFG || !engines) { CFG = cachedCFG; engines = cachedEngines; }
    if (!CFG || !engines) { return; }

    ensureSnapshot(CFG, engines);
    ensureSubscribed();
    if (initialDeclaredDefault === null) {
      initialDeclaredDefault = (typeof section.defaultEngine === 'string' && section.defaultEngine)
        ? section.defaultEngine : 'bing';
    }

    // S2：规范化 section（运行期纵深防御）
    var cfgEngines = isArr(section.engines) ? section.engines : deepClone(BUILTIN);
    var hiddenArr = isArr(section.hidden) ? section.hidden : [];
    var hidden = {}, h;
    for (h = 0; h < hiddenArr.length; h++) {
      if (typeof hiddenArr[h] === 'string') { hidden[hiddenArr[h]] = 1; }
    }
    var defEngine = (typeof section.defaultEngine === 'string' && section.defaultEngine)
      ? section.defaultEngine : 'bing';

    // S4：按配置顺序构造 target
    var target = [], usedIds = {}, i, j, raw, rid;
    for (i = 0; i < cfgEngines.length; i++) {
      raw = cfgEngines[i];
      if (!isObj(raw)) { continue; }
      rid = raw.id;
      if (typeof rid !== 'string') { continue; }
      if (BUILTIN_IDS.indexOf(rid) !== -1) {
        // 内置项：一律用快照，忽略 raw 的一切字段（含被篡改的 url/param/ai）
        if (BUILTIN_MAP[rid]) { target.push(deepClone(BUILTIN_MAP[rid])); }
        continue;
      }
      var custom = cleanCustom(raw, usedIds);
      if (custom) { target.push(custom); }
    }

    // S5：保证 ai 存在且只读（字段恒来自 AI_SNAPSHOT，绝不接受配置改写）
    var hasAi = false;
    for (j = 0; j < target.length; j++) { if (target[j].id === 'ai') { hasAi = true; break; } }
    if (!hasAi) { target.push(deepClone(AI_SNAPSHOT)); }
    for (j = 0; j < target.length; j++) {
      if (target[j].id === 'ai') { target[j] = deepClone(AI_SNAPSHOT); }
    }

    // S6：过滤 hidden + 环境剔除 ai（P12：运行期每次 apply 都自行判环境，不依赖 boot）
    var noPanel = envNoAiPanel();
    var filtered = [];
    for (j = 0; j < target.length; j++) {
      var e = target[j];
      if (hidden[e.id]) { continue; }
      if (e.id === 'ai' && noPanel) { continue; }
      filtered.push(e);
    }
    target = filtered;

    // S7：保证非空 + defaultEngine 回退（在 S6 之后，覆盖「默认=ai 但被摘」）
    if (!target.length) {
      target.push(deepClone(BUILTIN_MAP.bing || AI_SNAPSHOT));
    }
    var ids = {}, n;
    for (n = 0; n < target.length; n++) { ids[target[n].id] = 1; }
    var resolvedDefault;
    if (ids[defEngine]) { resolvedDefault = defEngine; }   // P11：ai 也可作默认
    else if (ids.bing) { resolvedDefault = 'bing'; }
    else { resolvedDefault = target[0].id; }

    // S8：只覆盖 CFG 这 3 项；suggestDelay/suggestLimit/suggestTimeout/storageKey 不动
    CFG.defaultEngine = resolvedDefault;
    CFG.openInNewTab = (section.openInNewTab === true);
    CFG.enableSuggest = (section.enableSuggest !== false);

    // S9：原地重建 engines（length=0 + push，保留引用，绝不重新赋值）
    engines.length = 0;
    for (n = 0; n < target.length; n++) { engines.push(target[n]); }

    // S10：不触碰 LOGOS —— 新引擎 LOGO 自动走 FYSearch.getLogo 的 fallback
    lastDefaultEngine = section.defaultEngine;
  }

  function apply(CFG, engines) {
    try { applyUnsafe(CFG, engines); }
    catch (e) { /* 配置异常时保持原状，绝不阻断 search.js 的 boot */ }
  }

  global.FYSearchCustomize = { apply: apply };
})(typeof window !== 'undefined' ? window
   : (typeof globalThis !== 'undefined' ? globalThis : this));
