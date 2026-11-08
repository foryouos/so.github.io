/*!
 * desktop-icons.js —— PC 端桌面图标：全量动态渲染 + 编辑态 + 事件委托（延迟收起）
 * ---------------------------------------------------------------------------
 * 依据：CONTRACT.md §4「模块契约」/ §5「动态重绘时序 · 事件绑定裁决」、
 *       02-icons-spec.md（本文件的逐行实现规格，尤其 §3 渲染 / §4 编辑 / §5 安全 / §6 API）。
 *
 * 关键裁决（team-lead，勿偏离）：
 *  - index.js 第 17~40 行是只读区，一字不改；本文件绝不依赖、绝不改写它的绑定。
 *  - render() 无条件全量重绘 #top_colum / #movie，原 .icon-wrapper 节点被替换，
 *    其上由 index.js 绑定的监听随节点销毁自然失效，从根上消除两套 280ms 计时器。
 *  - 280ms 延迟收起改由本文件在 document 上用 mouseover/mouseout（按 .icon-wrapper
 *    过滤 + relatedTarget 判断进出）做事件委托；mouseenter/mouseleave 不冒泡，不能用。
 *    focusin/focusout 保键盘可达；图片 error 不冒泡，用捕获阶段监听兜底。
 *    bindHoverDelay() 幂等，用 FYIcons.hoverDelegated 保证全局只注册一次。
 *
 * 约束：ES5 语法、IIFE、单一全局 window.FYIcons、不写 innerHTML 拼用户串、
 *       不改任何 CSS/HTML/index.js、不直接读写 localStorage（一律经 FYSettings.patch）。
 *       透明底 LOGO 的浮起感一律 drop-shadow，绝不用 box-shadow。
 */
(function (global) {
  'use strict';

  var doc = global.document || null;

  var CLOSE_DELAY = 280;              // 与 index.js:18 一致
  var MAX_ITEMS = 8;                  // 单行 items 上限（02 §2）
  var MAX_CHILDREN = 6;               // 单组 children 上限（02 §3.2）
  var TITLE_MAX = 40;                 // 契约 §2
  var URL_MAX = 2048;                 // 契约 §2
  var ICON_MAX = 256 * 1024 + 64;     // icon 字段长度上限（容纳 dataURL）
  var DATAURL_MAX = 256 * 1024;       // 上传图 dataURL 上限（02 §5.6）

  // ---- 白名单（XSS / 协议注入边界，02 §2.2 / §5.4）----
  var RE_URL = /^https?:\/\/[^\x00-\x20\x7f]+$/i;                      // 仅 http(s)，无空白/控制字符
  var RE_ICON_DATA = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i;
  var RE_ICON_LOCAL = /^assert\/[A-Za-z0-9._-]+\.(png|jpe?g|svg|webp|gif|ico)$/i; // 字符类不含 /，天然防 ../ 穿越

  // 本地 assert/ 图标库（02 §1.5，排除右上角 brand-foryouos.svg），供图标选择器使用
  var LOCAL_ICONS = [
    'assert/brand-icourse163.png', 'assert/brand-xuetangx.png', 'assert/brand-netease-open.png',
    'assert/brand-cctv.png', 'assert/brand-bilibili.png', 'assert/brand-iconfont.svg',
    'assert/brand-iqiyi.png', 'assert/brand-hitokoto.png', 'assert/brand-imgtg.png',
    'assert/brand-cloudflare.png', 'assert/brand-tencent-video.svg', 'assert/brand-douban.png',
    'assert/brand-doubao.png', 'assert/brand-gemini.png', 'assert/brand-chatgpt.svg',
    'assert/brand-deepseek.svg', 'assert/brand-workbuddy.svg', 'assert/brand-weread.png',
    'assert/brand-bookan.png', 'assert/brand-canva.svg', 'assert/brand-wechat.png'
  ];

  // ---- 模块状态 ----
  var editing = false;         // 编辑态
  var changeQueued = false;    // 合并同一 tick 内的多次配置变更，防重复/循环重绘
  var dragSrc = null;          // 当前拖拽起点节点
  var dropTarget = null;       // 当前高亮的落点节点
  var uidSeq = 0;              // genId 递增序号
  var lastGoodConfig = null;   // 最近一次成功渲染的配置（FYSettings 缺失时的内存副本）

  // =========================================================================
  // 小工具（全部 ES5；DOM 操作一律 setAttribute / textContent，不碰 innerHTML）
  // =========================================================================
  function warn(msg, err) {
    try { if (global.console && global.console.warn) global.console.warn(msg, err || ''); } catch (e) {}
  }
  function isArray(a) { return Object.prototype.toString.call(a) === '[object Array]'; }
  function isObj(o) { return !!o && typeof o === 'object' && !isArray(o); }
  function str(v) { return v == null ? '' : String(v); }
  function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }

  function setAttr(el, name, val) { if (el && el.setAttribute) el.setAttribute(name, val); }
  function getAttr(el, name) { return (el && el.getAttribute) ? el.getAttribute(name) : null; }

  function hasClass(el, cls) {
    var c = getAttr(el, 'class') || '';
    return (' ' + c + ' ').indexOf(' ' + cls + ' ') >= 0;
  }
  function addClass(el, cls) {
    if (!el || hasClass(el, cls)) return;
    var c = getAttr(el, 'class') || '';
    setAttr(el, 'class', c ? (c + ' ' + cls) : cls);
  }
  function removeClass(el, cls) {
    if (!el) return;
    var c = getAttr(el, 'class') || '';
    var parts = c.split(/\s+/), out = [], i;
    for (i = 0; i < parts.length; i++) if (parts[i] && parts[i] !== cls) out.push(parts[i]);
    setAttr(el, 'class', out.join(' '));
  }
  // 从 node 沿 parentNode 向上找第一个令 test 返回真的元素节点
  function upTo(node, test) {
    var guard = 0;
    while (node && guard++ < 200) {
      if (node.nodeType === 1 || node.tagName) { if (test(node)) return node; }
      node = node.parentNode;
    }
    return null;
  }
  // parent 是否包含 child（child===parent 也算），不依赖 Element.contains
  function containsNode(parent, child) {
    var guard = 0;
    while (child && guard++ < 200) {
      if (child === parent) return true;
      child = child.parentNode;
    }
    return false;
  }
  function childElements(el) {
    var out = [];
    if (!el) return out;
    var kids = el.children || el.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] && (kids[i].nodeType === 1 || kids[i].tagName)) out.push(kids[i]);
    }
    return out;
  }
  function childByTag(el, tag) {
    var kids = childElements(el), t = String(tag).toUpperCase();
    for (var i = 0; i < kids.length; i++) {
      if (String(kids[i].tagName).toUpperCase() === t) return kids[i];
    }
    return null;
  }
  function childByClass(el, cls) {
    var kids = childElements(el);
    for (var i = 0; i < kids.length; i++) if (hasClass(kids[i], cls)) return kids[i];
    return null;
  }
  function allDescendants(root) {
    if (!root || !root.getElementsByTagName) return [];
    try { return root.getElementsByTagName('*'); } catch (e) { return []; }
  }
  function descByClass(el, cls) {
    var all = allDescendants(el);
    for (var i = 0; i < all.length; i++) if (hasClass(all[i], cls)) return all[i];
    return null;
  }
  function descAllByClass(el, cls) {
    var all = allDescendants(el), out = [];
    for (var i = 0; i < all.length; i++) if (hasClass(all[i], cls)) out.push(all[i]);
    return out;
  }
  function el(tag) { return doc.createElement(tag); }
  // 派发自定义事件（ES5 兼容 CustomEvent，老环境用 createEvent 降级）。
  // render 全量重建会清掉 dev-panel 注入的装饰节点，故每次成功重绘后广播，
  // 供 dev-panel 重新注入 .fy-icon-editing / .fy-drag-handle / .fy-icon-del。
  function emit(name, detail) {
    if (!doc || typeof doc.dispatchEvent !== 'function') return;
    try {
      var ev;
      if (typeof global.CustomEvent === 'function') ev = new global.CustomEvent(name, { detail: detail });
      else if (typeof doc.createEvent === 'function') {
        ev = doc.createEvent('CustomEvent');
        ev.initCustomEvent(name, false, false, detail);
      }
      if (ev) doc.dispatchEvent(ev);
    } catch (e) {}
  }

  // =========================================================================
  // 校验（即使 FYSettings.validate 已校验，render 写 href/src 前仍二次校验）
  // =========================================================================
  function safeUrl(u) {
    var s = trim(str(u));
    if (!RE_URL.test(s)) return '';                 // 拒绝 javascript:/vbscript:/data:/file:/ //host / 相对路径
    if (s.length > URL_MAX) return '';
    if (s.indexOf('../') >= 0 || s.indexOf('..\\') >= 0) return '';  // 路径穿越
    return s;
  }
  function safeIcon(v) {
    var s = str(v);
    if (s === '' || s.length > ICON_MAX) return '';
    if (RE_ICON_DATA.test(s)) return s;             // 上传图（仅 png/jpeg/webp）
    if (RE_URL.test(s)) return s;                   // 外链
    if (RE_ICON_LOCAL.test(s)) return s;            // 本地 assert/（无 / 与 :，防穿越与协议注入）
    return '';                                      // javascript: / data:text/html / data:image/svg+xml / ../ 等
  }
  function safeTitle(t) {
    var s = trim(str(t));
    if (s.length > TITLE_MAX) s = s.substring(0, TITLE_MAX);
    return s;
  }
  // iconText 兜底：显式值截断到 2 字；否则取 title 首字（拉丁转大写），空 title -> '?'
  function fallbackText(title, iconText) {
    var t = trim(str(iconText));
    if (t) return t.substring(0, 2);
    t = trim(str(title));
    if (!t) return '?';
    var c = t.charAt(0);
    if (/[a-zA-Z]/.test(c)) return c.toUpperCase();
    return c;
  }

  // =========================================================================
  // 角度自动分配（02 §3.2）。返回长度 n 的角度数组，children[k] -> ANG[k]，--i = k
  //   n=1 按行：top -90 / movie 90；n=2 按行上半/下半对角；n=3/4 固定表不分行；
  //   n=5/6 公式 base+(k-(n-1)/2)*(360/n)，不排序、规约到 (-180,180]。
  // =========================================================================
  function anglesFor(n, rowId) {
    var out = [], k, a, base, step;
    n = Math.max(0, Math.min(MAX_CHILDREN, n | 0));
    if (n === 0) return out;
    if (n === 1) { out.push(rowId === 'movie' ? 90 : -90); return out; }
    if (n === 2) { return rowId === 'movie' ? [45, 135] : [-135, -45]; }
    if (n === 3) { return [-90, 30, 150]; }
    if (n === 4) { return [-135, -45, 45, 135]; }
    base = rowId === 'movie' ? 90 : -90;
    step = 360 / n;
    for (k = 0; k < n; k++) {
      a = base + (k - (n - 1) / 2) * step;
      while (a > 180) a -= 360;
      while (a <= -180) a += 360;
      out.push(Math.round(a * 100) / 100);
    }
    return out;
  }

  // =========================================================================
  // DOM 构建（结构不变量见 02 §3.1；用户文本一律 textContent / setAttribute）
  // =========================================================================
  // 全套 data-fy-*（snapshotFromDom 反读依据）。写原始 cfg 值以保等价；href/src 另用安全值。
  function setData(node, item, rowId, type) {
    setAttr(node, 'data-fy-id', str(item.id));
    setAttr(node, 'data-fy-row', rowId);
    setAttr(node, 'data-fy-type', type);
    setAttr(node, 'data-fy-title', str(item.title));
    setAttr(node, 'data-fy-url', str(item.url));
    setAttr(node, 'data-fy-icon', str(item.icon));
    setAttr(node, 'data-fy-icon-text', str(item.iconText));
  }
  // 给 <a> 写 href/target/rel/title/aria-label。isSub=true 时（.sub-icon）不写原生 title。
  function webLink(a, urlValue, titleValue, isSub) {
    var href = safeUrl(urlValue);
    if (href) setAttr(a, 'href', href);             // 非法 url 不设 href -> 不可点击，安全
    setAttr(a, 'target', '_blank');
    setAttr(a, 'rel', 'noopener');                  // 所有外链都带
    setAttr(a, 'aria-label', titleValue);
    if (!isSub) setAttr(a, 'title', titleValue);
  }
  // 主图标/子项的图片 + 兜底文字节点。isMain=true 时 <img> 带 .image_logo（子项绝不带）。
  function appendIconContent(host, item, isMain) {
    var icon = safeIcon(item.icon);
    var title = safeTitle(item.title);
    var fb = el('span');
    setAttr(fb, 'class', 'fy-icon-fallback');
    setAttr(fb, 'aria-hidden', 'true');
    fb.textContent = fallbackText(item.title, item.iconText);
    if (icon) {
      var img = el('img');
      if (isMain) setAttr(img, 'class', 'image_logo');
      setAttr(img, 'data-fy-img', '1');             // error 委托只处理图标行图片
      setAttr(img, 'src', icon);
      setAttr(img, 'alt', isMain ? title : '');
      if (isMain) setAttr(img, 'title', title);
      host.appendChild(img);
      setAttr(fb, 'hidden', '');
      if (fb.style) fb.style.display = 'none';      // 内联 display 确保隐藏压过任何 CSS
      host.appendChild(fb);
    } else {
      host.appendChild(fb);                         // 无图标：直接显示兜底文字，不创建 img（避免 404）
    }
  }
  // type:'link' 结构（02 §3.1）。forceType 用于 children:[] 的 group 降级（data-fy-type 仍写 'group'）。
  function buildLink(item, rowId, forceType) {
    var a = el('a');
    setAttr(a, 'class', 'fy-icon-link');
    setData(a, item, rowId, forceType || 'link');
    webLink(a, item.url, safeTitle(item.title), false);
    appendIconContent(a, item, true);
    return a;
  }
  // type:'group' 结构（02 §3.1）：.icon-wrapper + .main-icon + N×.sub-icon
  function buildGroup(item, rowId) {
    var wrap = el('div');
    setAttr(wrap, 'class', 'icon-wrapper');
    setData(wrap, item, rowId, 'group');           // group 的数据挂在 wrapper，.main-icon 不重复带

    var main = el('a');
    setAttr(main, 'class', 'main-icon');
    webLink(main, item.url, safeTitle(item.title), false);
    appendIconContent(main, item, true);
    wrap.appendChild(main);

    var children = isArray(item.children) ? item.children.slice(0, MAX_CHILDREN) : [];
    var angles = anglesFor(children.length, rowId);
    for (var k = 0; k < children.length; k++) {
      var c = isObj(children[k]) ? children[k] : {};
      var sub = el('a');
      setAttr(sub, 'class', 'sub-icon');
      setData(sub, c, rowId, 'child');             // data-fy-row 与父同值，type='child'
      setAttr(sub, 'style', '--a: ' + angles[k] + 'deg; --i: ' + k);
      webLink(sub, c.url, safeTitle(c.title), true);
      appendIconContent(sub, c, false);           // 子项 img 不带 .image_logo
      var label = el('span');
      setAttr(label, 'class', 'sub-label');
      label.textContent = safeTitle(c.title);
      sub.appendChild(label);
      wrap.appendChild(sub);
    }
    return wrap;
  }
  function buildItem(item, rowId) {
    if (!isObj(item)) item = {};
    if (item.type === 'group') {
      var children = isArray(item.children) ? item.children : [];
      if (children.length === 0) return buildLink(item, rowId, 'group');  // §3.4 降级
      return buildGroup(item, rowId);
    }
    return buildLink(item, rowId, 'link');
  }
  function buildRowNodes(row, rowId) {
    var out = [];
    var items = (row && isArray(row.items)) ? row.items.slice(0, MAX_ITEMS) : [];
    for (var i = 0; i < items.length; i++) out.push(buildItem(items[i], rowId));
    return out;
  }
  function replaceChildren(container, nodes) {
    while (container.firstChild) container.removeChild(container.firstChild);
    for (var i = 0; i < nodes.length; i++) container.appendChild(nodes[i]);
  }

  // =========================================================================
  // render：全量重绘两行（幂等）。先在内存构建全部节点，全部成功后才替换 DOM，
  //        任何异常都保持静态 DOM 原样（页面不空白）。末尾自动 bindHoverDelay()。
  // =========================================================================
  function normalizeConfig(cfg) {
    if (!cfg || !isArray(cfg.rows)) return null;
    var rows = [{ id: 'top', items: [] }, { id: 'movie', items: [] }];
    var targets = { top: rows[0], movie: rows[1] };
    for (var i = 0; i < cfg.rows.length; i++) {
      var r = cfg.rows[i];
      if (!r) continue;
      var t = targets[str(r.id)];
      if (t && isArray(r.items)) t.items = r.items.slice(0, MAX_ITEMS);
    }
    return { rows: rows };
  }
  function render(iconsCfg) {
    try {
      if (!doc || !iconsCfg) return false;          // 配置缺失 -> 降级，保持静态 DOM 不动
      var cfg = normalizeConfig(iconsCfg);
      if (!cfg) { warn('[FYIcons] icons 配置非法，保持静态 DOM'); return false; }
      if (cfg.rows[0].items.length === 0 && cfg.rows[1].items.length === 0) {
        warn('[FYIcons] icons 配置为空，保持静态 DOM'); return false;
      }
      var topEl = doc.getElementById('top_colum');
      var movEl = doc.getElementById('movie');
      if (!topEl || !movEl) { warn('[FYIcons] 缺少图标行容器，保持静态 DOM'); return false; }

      // 阶段 1：纯内存构建（不触碰真实 DOM）
      var topNodes = buildRowNodes(cfg.rows[0], 'top');
      var movNodes = buildRowNodes(cfg.rows[1], 'movie');

      // 阶段 2：一次性替换（销毁旧 wrapper，index.js 的旧监听随之失效）
      replaceChildren(topEl, topNodes);
      replaceChildren(movEl, movNodes);

      lastGoodConfig = cfg;
      bindHoverDelay();                            // 幂等，多次重绘不叠加
      if (editing) applyEditDecorations();        // 编辑态重绘后恢复 draggable
      // 全量重建会清掉 dev-panel 注入的装饰节点；广播让 dev-panel 重新注入。
      // 放在 render 成功末尾，覆盖 boot / 直接 render / 订阅重绘等所有路径。
      emit('fy:icons-rendered', { rows: cfg.rows, editMode: editing, config: cfg });
      return true;
    } catch (e) {
      warn('[FYIcons] render 失败，保持静态 DOM', e);
      return false;
    }
  }

  // =========================================================================
  // 事件委托（全部挂在永不被重建的 document 上；hoverDelegated 保证只注册一次）
  //   mouseover/mouseout/focusin/focusout/error/click/drag* 均用捕获阶段：
  //   mouseover/mouseout/focusin/focusout 冒泡但因捕获同样经过 document，不依赖冒泡；
  //   error 不冒泡必须捕获；click 编辑态拦截、drag 委托亦用捕获保持一致。
  // =========================================================================
  function isWrapper(n) { return !!n && hasClass(n, 'icon-wrapper'); }

  function keepOpen(wrap) {
    if (!wrap || editing) return;                  // 编辑态跳过：CSS 已用 .fy-edit 屏蔽展开
    if (wrap.__fyCloseTimer) { global.clearTimeout(wrap.__fyCloseTimer); wrap.__fyCloseTimer = null; }
    addClass(wrap, 'is-open');
  }
  function closeLater(wrap) {
    if (!wrap) return;
    if (wrap.__fyCloseTimer) global.clearTimeout(wrap.__fyCloseTimer);
    wrap.__fyCloseTimer = global.setTimeout(function () {
      removeClass(wrap, 'is-open');
      wrap.__fyCloseTimer = null;
    }, CLOSE_DELAY);
  }
  function onMouseOver(e) {
    var wrap = upTo(e.target, isWrapper);
    if (wrap) keepOpen(wrap);
  }
  function onMouseOut(e) {
    var wrap = upTo(e.target, isWrapper);
    if (!wrap) return;
    var to = e.relatedTarget;
    if (to && containsNode(wrap, to)) return;      // 仍在同一 wrapper 内移动，忽略
    closeLater(wrap);
  }
  function onFocusIn(e) {
    var wrap = upTo(e.target, isWrapper);
    if (wrap) keepOpen(wrap);
  }
  function onFocusOut(e) {
    var wrap = upTo(e.target, isWrapper);
    if (!wrap) return;
    var to = e.relatedTarget;
    if (to && containsNode(wrap, to)) return;
    closeLater(wrap);
  }
  // 图片加载失败：隐藏 img、显示同级 .fy-icon-fallback（error 不冒泡 -> 捕获阶段）
  function onImgError(e) {
    var img = e.target;
    if (!img || String(img.tagName).toUpperCase() !== 'IMG') return;
    if (getAttr(img, 'data-fy-img') !== '1') return;
    var fb = childByClass(img.parentNode, 'fy-icon-fallback');
    if (img.style) img.style.display = 'none';
    if (fb) {
      if (fb.removeAttribute) fb.removeAttribute('hidden');
      if (fb.style) fb.style.display = '';
    }
  }
  // 编辑态：点击图标 <a> 阻止跳转（preventDefault 但不 stopPropagation，dev-panel 仍能收到 click 打开表单）
  function onCaptureClick(e) {
    if (!editing) return;
    if (!upTo(e.target, isEditableRoot)) return;
    var a = upTo(e.target, function (n) {
      return !!n && String(n.tagName).toUpperCase() === 'A' && !!getAttr(n, 'href');
    });
    if (a && e.preventDefault) e.preventDefault();
  }

  // ---- 拖拽排序（HTML5 DnD 委托，编辑态生效；同 item 行内排序 / 同 group 内 children 排序）----
  function isEditableRoot(n) {
    if (!n || !getAttr(n, 'data-fy-id')) return false;
    var t = getAttr(n, 'data-fy-type');
    return t === 'link' || t === 'group' || t === 'child';
  }
  function nodeInfo(node) {
    var info = {
      id: getAttr(node, 'data-fy-id') || '',
      row: getAttr(node, 'data-fy-row') || '',
      type: getAttr(node, 'data-fy-type') || '',
      parentId: ''
    };
    if (info.type === 'child') {
      var p = node.parentNode;
      while (p && getAttr(p, 'data-fy-type') !== 'group') p = p.parentNode;
      if (p) info.parentId = getAttr(p, 'data-fy-id') || '';
    }
    return info;
  }
  function canDrop(s, t) {
    if (!s || !t || !s.id || !t.id || s.id === t.id) return false;
    if (s.row !== t.row) return false;             // 跨行禁止（02 §4.3）
    if (s.type === 'child' || t.type === 'child') {
      return s.type === 'child' && t.type === 'child' && !!s.parentId && s.parentId === t.parentId;
    }
    return true;                                   // 顶层 items 同行内移动
  }
  function setDropTarget(t) {
    if (dropTarget && dropTarget !== t) removeClass(dropTarget, 'fy-drop-target');
    dropTarget = t || null;
    if (dropTarget) addClass(dropTarget, 'fy-drop-target');
  }
  function endDrag() {
    if (dragSrc) removeClass(dragSrc, 'fy-dragging');
    setDropTarget(null);
    dragSrc = null;
  }
  function onDragStart(e) {
    if (!editing) return;
    var src = upTo(e.target, isEditableRoot);
    if (!src) return;
    dragSrc = src;
    if (e.dataTransfer) {
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', getAttr(src, 'data-fy-id') || '');
      } catch (er) {}
    }
    addClass(src, 'fy-dragging');
  }
  function onDragOver(e) {
    if (!editing || !dragSrc) return;
    var tgt = upTo(e.target, isEditableRoot);
    if (!tgt) return;
    var allowed = canDrop(nodeInfo(dragSrc), nodeInfo(tgt));
    if (e.dataTransfer) e.dataTransfer.dropEffect = allowed ? 'move' : 'none';
    if (e.preventDefault) e.preventDefault();      // 允许 drop（含跨行，以便 onDrop 给 toast）
    setDropTarget(allowed ? tgt : null);
  }
  function onDrop(e) {
    if (!editing || !dragSrc) return;
    if (e.preventDefault) e.preventDefault();
    var tgt = upTo(e.target, isEditableRoot);
    var s = nodeInfo(dragSrc);
    var t = tgt ? nodeInfo(tgt) : null;
    if (!t || !canDrop(s, t)) {
      if (t && s.row !== t.row) FYIcons.toast('图标不能跨行移动');
      endDrag();
      return;
    }
    var before = true;
    try {
      if (tgt.getBoundingClientRect && e.clientX != null) {
        var r = tgt.getBoundingClientRect();
        before = e.clientX < (r.left + r.width / 2);
      }
    } catch (er) {}
    if (s.type === 'child' && t.type === 'child') moveChild(s.parentId, s.id, t.id, before);
    else moveItem(s.row, s.id, t.id, before);
    endDrag();
  }
  function onDragEnd() { endDrag(); }

  function bindHoverDelay() {
    if (FYIcons.hoverDelegated) return;
    if (!doc || !doc.addEventListener) return;
    doc.addEventListener('mouseover', onMouseOver, true);
    doc.addEventListener('mouseout', onMouseOut, true);
    doc.addEventListener('focusin', onFocusIn, true);
    doc.addEventListener('focusout', onFocusOut, true);
    doc.addEventListener('error', onImgError, true);
    doc.addEventListener('click', onCaptureClick, true);
    doc.addEventListener('dragstart', onDragStart, true);
    doc.addEventListener('dragover', onDragOver, true);
    doc.addEventListener('drop', onDrop, true);
    doc.addEventListener('dragend', onDragEnd, true);
    FYIcons.hoverDelegated = true;
  }

  // =========================================================================
  // 配置读写与订阅（唯一持久化入口 FYSettings.patch；render 不 patch，故无循环）
  // =========================================================================
  function readSection() {
    try {
      if (global.FYSettings && typeof global.FYSettings.getSection === 'function') {
        var s = global.FYSettings.getSection('icons');
        if (s && isArray(s.rows)) return s;         // 深拷贝
      }
    } catch (e) { warn('[FYIcons] getSection 异常', e); }
    return null;
  }
  function readIconsConfig() {
    var cfg = readSection();
    if (cfg) return cfg;
    // FYSettings 缺失/异常 -> 从现有静态 DOM 提取（team-lead 回退要求）
    try {
      var snap = snapshotFromDom();
      if (snap && isArray(snap.rows) &&
          ((snap.rows[0] && snap.rows[0].items.length) || (snap.rows[1] && snap.rows[1].items.length))) {
        return snap;
      }
    } catch (e) { warn('[FYIcons] snapshotFromDom 异常', e); }
    return null;
  }
  function onSettingsChange(detail, config) {
    var section = detail && detail.section;
    if (section && section !== 'icons') return;    // 只响应 icons 段
    if (changeQueued) return;
    changeQueued = true;
    global.setTimeout(function () {
      changeQueued = false;
      var cfg = readSection();                     // 优先读最新配置
      if (!cfg && config && config.icons && isArray(config.icons.rows)) cfg = config.icons;
      if (!cfg && detail && detail.config && detail.config.icons && isArray(detail.config.icons.rows)) cfg = detail.config.icons;
      if (cfg) render(cfg);
    }, 0);
  }
  function subscribeChanges() {
    if (!doc || !doc.addEventListener) return;
    doc.addEventListener('fy:settings-change', function (e) {
      onSettingsChange(e && e.detail, null);
    }, false);
    try {
      if (global.FYSettings && typeof global.FYSettings.subscribe === 'function') {
        global.FYSettings.subscribe(function (config, detail) {
          onSettingsChange(detail || { section: 'icons', config: config }, config);
        });
      }
    } catch (e) {}
  }

  // =========================================================================
  // snapshotFromDom：双模式反读
  //   ① 动态 DOM（render 后，含 data-fy-*）：按 data-fy-type/row 重建 rows/items/children；
  //   ② 静态 DOM（无 data-fy-*，no-JS 兜底 / FYSettings 缺失）：按 .icon-wrapper 等 class 结构提取，
  //      children 按 --a 升序（= 角度表顺序，§1.3），恰好还原 §1.1 默认快照顺序。
  // =========================================================================
  function readData(node) {
    return {
      id: getAttr(node, 'data-fy-id') || '',
      title: getAttr(node, 'data-fy-title') || '',
      url: getAttr(node, 'data-fy-url') || '',
      icon: getAttr(node, 'data-fy-icon') || '',
      iconText: getAttr(node, 'data-fy-icon-text') || ''
    };
  }
  function parseAngle(node) {
    var st = getAttr(node, 'style') || (node.style && node.style.cssText) || '';
    var m = /--a:\s*(-?\d+(?:\.\d+)?)\s*deg/.exec(st);
    return m ? parseFloat(m[1]) : 0;
  }
  function snapshotDynamic(all) {
    var items = [], cur = null;
    for (var i = 0; i < all.length; i++) {
      var n = all[i], type = getAttr(n, 'data-fy-type');
      if (type === 'link' || type === 'group') {
        var item = readData(n);
        item.type = type;
        if (type === 'group') item.children = [];
        items.push(item);
        cur = (type === 'group') ? item : null;
      } else if (type === 'child' && cur) {
        cur.children.push(readData(n));
      }
    }
    return items;
  }
  function snapshotStaticGroup(wrap, rowId, i) {
    var main = descByClass(wrap, 'main-icon');
    var mainImg = descByClass(wrap, 'image_logo');
    var item = {
      id: 'ic-d-' + rowId + '-' + i,
      type: 'group',
      title: (main && getAttr(main, 'title')) || (mainImg && (getAttr(mainImg, 'title') || getAttr(mainImg, 'alt'))) || '',
      url: (main && getAttr(main, 'href')) || '',
      icon: (mainImg && getAttr(mainImg, 'src')) || '',
      iconText: '',
      children: []
    };
    var subs = descAllByClass(wrap, 'sub-icon');
    var list = [];
    for (var k = 0; k < subs.length; k++) {
      var s = subs[k];
      var label = descByClass(s, 'sub-label');
      var img = childByTag(s, 'IMG');
      var svg = childByTag(s, 'SVG');              // 华文慕课内联字标
      var iconText = '';
      if (!img && svg && svg.textContent) iconText = trim(svg.textContent).substring(0, 2);
      list.push({
        ang: parseAngle(s),
        id: 'ic-d-' + rowId + '-' + i + '-' + k,
        title: (label && trim(label.textContent)) || getAttr(s, 'aria-label') || '',
        url: getAttr(s, 'href') || '',
        icon: (img && getAttr(img, 'src')) || '',
        iconText: iconText
      });
    }
    list.sort(function (a, b) { return a.ang - b.ang; });
    for (var j = 0; j < list.length; j++) {
      item.children.push({
        id: list[j].id, title: list[j].title, url: list[j].url,
        icon: list[j].icon, iconText: list[j].iconText
      });
    }
    return item;
  }
  function snapshotStatic(container, rowId) {
    var items = [], kids = childElements(container);
    for (var i = 0; i < kids.length; i++) {
      var node = kids[i];
      if (hasClass(node, 'icon-wrapper')) {
        items.push(snapshotStaticGroup(node, rowId, i));
      } else if (String(node.tagName).toUpperCase() === 'A') {
        var img = descByClass(node, 'image_logo') || childByTag(node, 'IMG');
        items.push({
          id: 'ic-d-' + rowId + '-' + i,
          type: 'link',
          title: (img && (getAttr(img, 'title') || getAttr(img, 'alt'))) || getAttr(node, 'title') || '',
          url: getAttr(node, 'href') || '',
          icon: (img && getAttr(img, 'src')) || '',
          iconText: ''
        });
      }
    }
    return items;
  }
  function snapshotFromDom() {
    var rows = [{ id: 'top', items: [] }, { id: 'movie', items: [] }];
    if (!doc) return { rows: rows };
    var defs = [{ id: 'top_colum', row: 'top' }, { id: 'movie', row: 'movie' }];
    for (var d = 0; d < defs.length; d++) {
      var c = doc.getElementById(defs[d].id);
      if (!c) continue;
      var all = allDescendants(c), hasData = false;
      for (var i = 0; i < all.length; i++) if (getAttr(all[i], 'data-fy-id')) { hasData = true; break; }
      rows[d].items = hasData ? snapshotDynamic(all) : snapshotStatic(c, defs[d].row);
    }
    return { rows: rows };
  }

  // =========================================================================
  // 编辑数据 API：所有变更经 FYSettings.patch('icons', {rows}) 持久化并触发重绘；
  //              patch 成功时依赖 fy:settings-change 广播单入口重绘（§4.2），
  //              FYSettings 缺失/失败时退化为内存副本 + 直接 render（不写 localStorage）。
  // =========================================================================
  function currentConfig() {
    var cfg = readSection();
    if (cfg) return cfg;
    if (lastGoodConfig) return clone(lastGoodConfig) || { rows: [{ id: 'top', items: [] }, { id: 'movie', items: [] }] };
    return snapshotFromDom();
  }
  function findRow(cfg, rowId) {
    if (!cfg || !isArray(cfg.rows)) return null;
    for (var i = 0; i < cfg.rows.length; i++) if (cfg.rows[i] && cfg.rows[i].id === rowId) return cfg.rows[i];
    return null;
  }
  function findItem(cfg, id) {
    if (!cfg || !isArray(cfg.rows)) return null;
    for (var i = 0; i < cfg.rows.length; i++) {
      var r = cfg.rows[i];
      if (!r || !isArray(r.items)) continue;
      for (var j = 0; j < r.items.length; j++) {
        if (r.items[j] && r.items[j].id === id) return { row: r, item: r.items[j], index: j };
      }
    }
    return null;
  }
  function findChild(cfg, groupId, childId) {
    var f = findItem(cfg, groupId);
    if (!f || !isArray(f.item.children)) return null;
    for (var k = 0; k < f.item.children.length; k++) {
      if (f.item.children[k] && f.item.children[k].id === childId) {
        return { row: f.row, item: f.item, child: f.item.children[k], index: k };
      }
    }
    return null;
  }
  function idExists(cfg, id) {
    if (!cfg || !isArray(cfg.rows)) return false;
    for (var i = 0; i < cfg.rows.length; i++) {
      var r = cfg.rows[i];
      if (!r || !isArray(r.items)) continue;
      for (var j = 0; j < r.items.length; j++) {
        var it = r.items[j];
        if (!it) continue;
        if (it.id === id) return true;
        if (isArray(it.children)) {
          for (var k = 0; k < it.children.length; k++) if (it.children[k] && it.children[k].id === id) return true;
        }
      }
    }
    return false;
  }
  function genId(cfg) {
    var t = (new Date()).getTime().toString(36), id;
    do {
      uidSeq = (uidSeq + 1) % 100000;
      id = 'ic-u-' + t + '-' + ('000' + uidSeq).slice(-3);
    } while (idExists(cfg, id));
    return id;
  }
  function normalizeItem(raw, isChild) {
    raw = isObj(raw) ? raw : {};
    var o = {
      id: str(raw.id),
      title: safeTitle(raw.title),
      url: str(raw.url),
      icon: str(raw.icon),
      iconText: str(raw.iconText)
    };
    if (!isChild) {
      o.type = raw.type === 'group' ? 'group' : 'link';
      if (o.type === 'group') {
        o.children = [];
        if (isArray(raw.children)) {
          for (var i = 0; i < raw.children.length && i < MAX_CHILDREN; i++) {
            o.children.push(normalizeItem(raw.children[i], true));
          }
        }
      }
    }
    return o;
  }
  function commit(cfg) {
    if (!cfg) return false;
    if (isArray(cfg)) cfg = { rows: cfg };        // 容错：dev-panel 可直接传 rows 数组或 {rows} 对象
    if (!isArray(cfg.rows)) return false;
    lastGoodConfig = cfg;
    var patched = false;
    try {
      if (global.FYSettings && typeof global.FYSettings.patch === 'function') {
        var r = global.FYSettings.patch('icons', { rows: cfg.rows });
        if (r && r.ok === false) {
          warn('[FYIcons] patch 被拒绝：' + (r.error || ''));
          FYIcons.toast('保存失败：' + (r.error || '配置不合法'));
        } else {
          patched = true;                          // 依赖 fy:settings-change 广播触发 render
        }
      }
    } catch (e) { warn('[FYIcons] patch 异常', e); }
    if (!patched) {
      render(cfg);                               // FYSettings 缺失/失败：内存副本 + 立即重绘
    }
    return patched;
  }

  function addItem(rowId, index, raw) {
    var cfg = currentConfig(), row = findRow(cfg, rowId);
    if (!row) { warn('[FYIcons] 未知行 ' + rowId); return false; }
    if (!isArray(row.items)) row.items = [];
    if (row.items.length >= MAX_ITEMS) { FYIcons.toast('本行图标已达上限（8 个）'); return false; }
    var item = normalizeItem(raw, false);
    if (!item.id || idExists(cfg, item.id)) item.id = genId(cfg);
    if (!safeUrl(item.url)) item.url = 'https://'; // 占位，保证 validate 通过，随后由 UI 改链
    var at = (typeof index === 'number' && index >= 0) ? Math.min(index, row.items.length) : row.items.length;
    row.items.splice(at, 0, item);
    return commit(cfg);
  }
  function removeItem(id) {
    var cfg = currentConfig(), f = findItem(cfg, id);
    if (!f) return false;
    FYIcons.confirmAction('确定删除图标「' + safeTitle(f.item.title) + '」吗？此操作不可撤销。', function (ok) {
      if (!ok) return;
      var c2 = currentConfig(), g = findItem(c2, id);
      if (!g) return;
      g.row.items.splice(g.index, 1);
      commit(c2);
    });
    return true;
  }
  function updateItem(id, patch) {
    if (!isObj(patch)) return false;
    var cfg = currentConfig(), f = findItem(cfg, id);
    if (!f) return false;
    if (patch.title != null) f.item.title = safeTitle(patch.title);
    if (patch.url != null) f.item.url = str(patch.url);
    if (patch.icon != null) f.item.icon = str(patch.icon);
    if (patch.iconText != null) f.item.iconText = str(patch.iconText);
    if (patch.type != null) {
      var t = patch.type === 'group' ? 'group' : 'link';
      f.item.type = t;
      if (t === 'group') { if (!isArray(f.item.children)) f.item.children = []; }
      else { delete f.item.children; }
    }
    return commit(cfg);
  }
  function moveItem(rowId, fromId, toId, before) {
    var cfg = currentConfig(), row = findRow(cfg, rowId);
    if (!row || !isArray(row.items)) return false;
    var from = -1, to = -1, i;
    for (i = 0; i < row.items.length; i++) {
      if (row.items[i].id === fromId) from = i;
      if (row.items[i].id === toId) to = i;
    }
    if (from < 0 || to < 0 || from === to) return false;
    var it = row.items.splice(from, 1)[0], at = -1;
    for (i = 0; i < row.items.length; i++) if (row.items[i].id === toId) { at = i; break; }
    row.items.splice(before ? at : at + 1, 0, it);
    return commit(cfg);
  }
  function addChild(groupId, index, raw) {
    var cfg = currentConfig(), f = findItem(cfg, groupId);
    if (!f || f.item.type !== 'group') { warn('[FYIcons] 目标不是分组'); return false; }
    if (!isArray(f.item.children)) f.item.children = [];
    if (f.item.children.length >= MAX_CHILDREN) { FYIcons.toast('一个分组最多 6 个子项'); return false; }
    var c = normalizeItem(raw, true);
    if (!c.id || idExists(cfg, c.id)) c.id = genId(cfg);
    if (!safeUrl(c.url)) c.url = 'https://';
    var at = (typeof index === 'number' && index >= 0) ? Math.min(index, f.item.children.length) : f.item.children.length;
    f.item.children.splice(at, 0, c);
    return commit(cfg);
  }
  function removeChild(groupId, childId) {
    var cfg = currentConfig(), f = findChild(cfg, groupId, childId);
    if (!f) return false;
    FYIcons.confirmAction('确定删除子项「' + safeTitle(f.child.title) + '」吗？', function (ok) {
      if (!ok) return;
      var c2 = currentConfig(), g = findChild(c2, groupId, childId);
      if (!g) return;
      g.item.children.splice(g.index, 1);
      commit(c2);
    });
    return true;
  }
  function updateChild(groupId, childId, patch) {
    if (!isObj(patch)) return false;
    var cfg = currentConfig(), f = findChild(cfg, groupId, childId);
    if (!f) return false;
    if (patch.title != null) f.child.title = safeTitle(patch.title);
    if (patch.url != null) f.child.url = str(patch.url);
    if (patch.icon != null) f.child.icon = str(patch.icon);
    if (patch.iconText != null) f.child.iconText = str(patch.iconText);
    return commit(cfg);
  }
  function moveChild(groupId, fromId, toId, before) {
    var cfg = currentConfig(), f = findItem(cfg, groupId);
    if (!f || !isArray(f.item.children)) return false;
    var arr = f.item.children, from = -1, to = -1, i;
    for (i = 0; i < arr.length; i++) {
      if (arr[i].id === fromId) from = i;
      if (arr[i].id === toId) to = i;
    }
    if (from < 0 || to < 0 || from === to) return false;
    var it = arr.splice(from, 1)[0], at = -1;
    for (i = 0; i < arr.length; i++) if (arr[i].id === toId) { at = i; break; }
    arr.splice(before ? at : at + 1, 0, it);
    return commit(cfg);
  }

  // =========================================================================
  // 交互辅助（自绘浮层，不用原生 confirm；可被 dev-panel 覆盖为面板内浮层/toast）
  //   浮层用 drop-shadow 而非 box-shadow（透明底 LOGO 规则，且全文件不出现 box-shadow）。
  // =========================================================================
  function mkConfirmBtn(text, primary) {
    var b = el('button');
    setAttr(b, 'type', 'button');
    b.textContent = text;
    var css = 'margin-left:8px;padding:5px 14px;border-radius:6px;cursor:pointer;font:13px ui-monospace,monospace;';
    css += primary ? 'background:#2f7a45;color:#fff;border:1px solid #2f7a45;'
                   : 'background:#fff;color:#073b30;border:1px solid #b1ddbc;';
    setAttr(b, 'style', css);
    return b;
  }
  function defaultConfirm(question, cb) {
    if (!doc || !doc.createElement || !doc.body) { if (cb) cb(false); return; }
    var box = el('div');
    setAttr(box, 'class', 'fy-confirm');
    setAttr(box, 'role', 'dialog');
    setAttr(box, 'style', 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:970;' +
      'background:#fff;color:#073b30;padding:18px 22px;border:1px solid #b1ddbc;border-radius:12px;' +
      'filter:drop-shadow(0 6px 20px rgba(0,0,0,.22));font:14px/1.6 ui-monospace,Consolas,"Microsoft YaHei",monospace;max-width:80vw;');
    var p = el('div'); p.textContent = str(question); box.appendChild(p);
    var bar = el('div'); setAttr(bar, 'style', 'margin-top:14px;text-align:right;');
    var no = mkConfirmBtn('取消', false), yes = mkConfirmBtn('确认', true);
    bar.appendChild(no); bar.appendChild(yes); box.appendChild(bar);
    function done(v) {
      if (box.parentNode && box.parentNode.removeChild) box.parentNode.removeChild(box);
      if (cb) cb(v);
    }
    no.onclick = function () { done(false); };
    yes.onclick = function () { done(true); };
    doc.body.appendChild(box);
  }
  function defaultToast(msg) {
    if (!doc || !doc.createElement || !doc.body) { warn(str(msg)); return; }
    var t = el('div');
    setAttr(t, 'class', 'fy-toast');
    setAttr(t, 'style', 'position:fixed;left:50%;bottom:8%;transform:translateX(-50%);z-index:970;' +
      'background:rgba(7,59,48,.92);color:#eafff6;padding:8px 16px;border-radius:8px;' +
      'font:13px ui-monospace,monospace;pointer-events:none;');
    t.textContent = str(msg);
    doc.body.appendChild(t);
    global.setTimeout(function () {
      if (t.parentNode && t.parentNode.removeChild) t.parentNode.removeChild(t);
    }, 1800);
  }
  // 上传图：显式传 FYTheme.PRESET_ICON（补丁 P13），回调里二次校验 MIME + 长度（02 §5.6）
  // 回调签名（theme.js:569 起，契约 P4）：cb(err, dataURL) —— 成功 cb(null, dataURL)、
  //   失败 cb(Error, null)，**不是**单参 cb(dataURL)。故此处必须取第二参；曾按单参写会
  //   在成功时拿到 null 而被 MIME 校验误判失败，导致上传必然失败（联调 bug，已修）。
  // 兼容：若首个参数是 data:image 字符串，按旧式单参 cb(dataURL) 处理（防御其它实现）。
  // 降级语义（P13 / qa-static 联调）：若 theme.js 仍是两参 compressImage 且缺 PRESET_ICON，
  //   第三参会被忽略、产出背景预设(1600px/1.4M)的大 dataURL，将被下方 256KB 二次校验
  //   拒绝并提示 —— 这是"安全地失败"：绝不把超标图写进配置、不撑爆 localStorage、不抛异常。
  //   dev-theme 按 P4 补齐三参 + PRESET_ICON(256px/256KB/q0.85) 后，本调用点自动成功。
  //   二次校验阈值不放宽（P13 明确要求）。
  function iconFromFile(file, cb) {
    cb = typeof cb === 'function' ? cb : function () {};
    var TH = global.FYTheme;
    if (!TH || typeof TH.compressImage !== 'function') { warn('[FYIcons] FYTheme.compressImage 不可用'); cb(''); return; }
    if (!TH.PRESET_ICON) {
      warn('[FYIcons] FYTheme.PRESET_ICON 缺失（theme.js 或仍是两参 compressImage）；' +
           '图标上传将由 256KB 二次校验兜底拒绝，请 dev-theme 按 P4/P13 补齐三参 + PRESET_ICON');
    }
    try {
      TH.compressImage(file, function (err, dataUrl) {
        // 兼容旧式单参 cb(dataUrl)
        if (typeof err === 'string' && /^data:image\//i.test(err)) { dataUrl = err; err = null; }
        if (err) {
          warn('[FYIcons] 图标压缩失败：' + (err && err.message ? err.message : str(err)));
          FYIcons.toast('图片处理失败，请换更小的图或改用 http(s) 图片 URL');
          cb(''); return;
        }
        var s = str(dataUrl);
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(s) || s.length > DATAURL_MAX) {
          warn('[FYIcons] 图标 dataURL 非法或超过 256KB（若 PRESET_ICON 缺失属预期降级）');
          FYIcons.toast('图片过大，请换更小的图或改用 http(s) 图片 URL');
          cb(''); return;
        }
        cb(s);
      }, TH.PRESET_ICON || { maxEdge: 256, maxChars: DATAURL_MAX, quality: 0.85 });
    } catch (e) { warn('[FYIcons] 图片压缩失败', e); cb(''); }
  }

  // =========================================================================
  // 编辑态：只切容器 fy-edit class + 点击行为开关（editing）+ 根节点 draggable，
  //         不重建图标结构、不改配置；退出不解绑重绑（hoverDelegated 恒为 true，P6）。
  //         装饰节点（.fy-icon-editing / .fy-drag-handle / .fy-icon-del）由 dev-panel 注入。
  // =========================================================================
  function collectEditableRoots() {
    var out = [];
    if (!doc) return out;
    var ids = ['top_colum', 'movie'];
    for (var i = 0; i < ids.length; i++) {
      var c = doc.getElementById(ids[i]);
      if (!c) continue;
      var all = allDescendants(c);
      for (var j = 0; j < all.length; j++) if (isEditableRoot(all[j])) out.push(all[j]);
    }
    return out;
  }
  function applyEditDecorations() {
    var roots = collectEditableRoots();
    for (var i = 0; i < roots.length; i++) {
      if (editing) setAttr(roots[i], 'draggable', 'true');
      else if (roots[i].removeAttribute) roots[i].removeAttribute('draggable');
    }
  }
  function clearOpenStates(container) {
    var all = allDescendants(container);
    for (var i = 0; i < all.length; i++) if (hasClass(all[i], 'icon-wrapper')) removeClass(all[i], 'is-open');
  }
  function setEditMode(on) {
    editing = !!on;
    var ids = ['top_colum', 'movie'];
    for (var i = 0; i < ids.length; i++) {
      var c = doc && doc.getElementById(ids[i]);
      if (!c) continue;
      if (editing) { addClass(c, 'fy-edit'); clearOpenStates(c); }
      else { removeClass(c, 'fy-edit'); }
    }
    applyEditDecorations();
    bindHoverDelay();                            // 幂等：进入/退出都不解绑重绑
  }

  // =========================================================================
  // 暴露 API（契约 §4：render / setEditMode / snapshotFromDom / bindHoverDelay / hoverDelegated）
  //   另暴露编辑数据 API 供 dev-panel 调用；_internals 为纯函数，供 qa / 自测直接验证。
  // =========================================================================
  var FYIcons = {
    hoverDelegated: false,                       // 只读幂等标记（qa 断言），初始 false
    LOCAL_ICONS: LOCAL_ICONS,
    render: render,
    setEditMode: setEditMode,
    snapshotFromDom: snapshotFromDom,
    bindHoverDelay: bindHoverDelay,
    // 编辑数据 API（全部经 FYSettings.patch 持久化）
    addItem: addItem,
    removeItem: removeItem,
    updateItem: updateItem,
    moveItem: moveItem,
    addChild: addChild,
    removeChild: removeChild,
    updateChild: updateChild,
    moveChild: moveChild,
    genId: function () { return genId(currentConfig()); },
    iconFromFile: iconFromFile,
    commit: commit,                             // 直接提交整份 {rows}（内部仍走 FYSettings.patch，供 dev-panel 导入/批量变更）
    // 可覆盖钩子：dev-panel 应设为「面板内非原生确认浮层」/「面板 toast」
    confirmAction: defaultConfirm,
    toast: defaultToast,
    // 内部纯函数（下划线 = 内部/测试钩子，不属契约 API）
    _internals: {
      anglesFor: anglesFor,
      safeUrl: safeUrl,
      safeIcon: safeIcon,
      fallbackText: fallbackText,
      normalizeConfig: normalizeConfig
    }
  };
  global.FYIcons = FYIcons;

  // =========================================================================
  // 启动：等 DOMContentLoaded（或 readyState 已完成）后再首绘，
  //       不早于 index.js 的 DOMContentLoaded 注册时机抢跑（02 §5.1）。
  // =========================================================================
  function boot() {
    try {
      var cfg = readIconsConfig();
      if (cfg) render(cfg);
    } catch (e) { warn('[FYIcons] 首绘失败', e); }
    try { subscribeChanges(); } catch (e) { warn('[FYIcons] 订阅失败', e); }
  }
  if (doc && doc.addEventListener) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', boot, false);
    } else if (global.setTimeout) {
      global.setTimeout(boot, 0);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
