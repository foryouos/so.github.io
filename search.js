/*!
 * foryouos 导航页 · 统一搜索模块（PC / 移动端共用）
 * ---------------------------------------------------------------------------
 * 默认搜索引擎：必应 Bing（cn.bing.com）
 *
 * 设计要点
 *   1. 引擎表、默认引擎、是否新标签页打开等全部集中在下方 CFG，改一处即两处生效；
 *   2. 关键词参数名按引擎而异（必应/Google=q、百度=wd、B站=keyword），
 *      统一由 buildSearchUrl 生成完整地址，彻底避免原来「切到 Google 后再点百度搜不出东西」的参数串味问题；
 *   3. 当前引擎记忆在 localStorage，下次打开自动沿用；
 *   4. 联想下拉走 JSONP（必应 / 百度官方接口），失败静默降级，不影响主流程；
 *   5. 无 JS 时表单仍可回退到原生提交（action 已指向必应）。
 *
 * DOM 约定（index.html / mobile.html 保持一致）
 *   [data-fy-search]          搜索区容器
 *     .so-engines             引擎标签容器（由本脚本生成）
 *     form                    提交表单
 *       .so-input-wrap        输入框包裹层（定位基准）
 *         .so-logo            当前引擎 LOGO（内容由本脚本注入）
 *         .so-input           输入框（id=kw）
 *         .so-clear           清空按钮
 *         .so-suggest         联想下拉容器
 *       .so-submit            搜索按钮
 * ---------------------------------------------------------------------------
 */
(function (global, doc) {
  'use strict';

  /* ============================== 配置区 ============================== */
  var CFG = {
    /** 默认搜索引擎 id，必须是 engines 里的某一项 */
    defaultEngine: 'bing',
    /** true = 搜索结果在新标签页打开；false = 当前标签页打开 */
    openInNewTab: false,
    /** 是否开启搜索联想（必应 / 百度可用，其余引擎自动跳过） */
    enableSuggest: true,
    /** 联想请求防抖时间（毫秒），越小越灵敏、请求越频繁 */
    suggestDelay: 180,
    /** 联想最多展示条数 */
    suggestLimit: 8,
    /** 联想请求超时（毫秒），超时后静默放弃 */
    suggestTimeout: 5000,
    /** 记忆上次所选引擎用的 localStorage 键名 */
    storageKey: 'foryouos.search.engine',

    /**
     * 搜索引擎表
     *   id      唯一标识，同时写进 localStorage
     *   name    界面显示名称
     *   url     搜索地址（不含 ?）
     *   param   关键词参数名
     *   extra   该引擎的固定附加参数
     *   suggest 联想数据源：'bing' | 'baidu' | null
     *
     * 增删引擎只需改这一个数组，界面标签会自动跟着变。
     */
    engines: [
      { id: 'bing',     name: '必应',   url: 'https://cn.bing.com/search',      param: 'q',       extra: {},                       suggest: 'bing'  },
      { id: 'baidu',    name: '百度',   url: 'https://www.baidu.com/s',         param: 'wd',      extra: {},                       suggest: 'baidu' },
      { id: 'google',   name: 'Google', url: 'https://www.google.com/search',   param: 'q',       extra: {},                       suggest: null    },
      /* AI 搜索是「伪引擎」：不跳转、不拼 URL，而是交给 ai-search.js 打开右侧抽屉。
         它必须留在引擎表里，标签栏才会自动生成；url/param 留空串，
         submit() 里对 id === 'ai' 走单独分支，绝不会落到 buildSearchUrl。
         没有抽屉的页面（如 mobile.html）会在 boot() 里把这一项摘掉。 */
      { id: 'ai',       name: 'AI 搜索', url: '',                              param: '',        extra: {},                       suggest: 'bing',
        ai: true, placeholder: '输入关键词，让 AI 跨平台找并排序' },
      { id: 'bilibili', name: 'B站',    url: 'https://search.bilibili.com/all', param: 'keyword', extra: {},                       suggest: null    },
      { id: 'github',   name: 'GitHub', url: 'https://github.com/search',       param: 'q',       extra: { type: 'repositories' }, suggest: null    },
      { id: 'douban',   name: '豆瓣',   url: 'https://www.douban.com/search',   param: 'q',       extra: {},                       suggest: null    }
    ]
  };
  /* =================================================================== */

  /* ---------------------- 引擎标识（内联 SVG） ----------------------
   * 全部内联、不依赖任何外部图标服务或 favicon 接口：
   * 国内网络下 google.com 的 favicon 取不到，外链方案必然出现半截空白。
   * 统一形制 = 品牌色圆角方底 + 品牌字形；
   *   必应 b / 百度熊掌 / Google 四色 G / 知乎 知 / B站 小电视 / GitHub 猫 / 豆瓣 豆
   * ------------------------------------------------------------------ */
  var LOGOS = {
    bing:
      '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#0a7cf0"/>' +
      '<text x="12" y="17.2" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" ' +
      'font-size="15" font-weight="700" fill="#fff">b</text></svg>',

    baidu:
      '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#2932e1"/>' +
      '<ellipse cx="12" cy="16.1" rx="5" ry="4.1" fill="#fff"/>' +
      '<circle cx="5.7" cy="10.6" r="2.05" fill="#fff"/>' +
      '<circle cx="9.8" cy="7.7" r="2.25" fill="#fff"/>' +
      '<circle cx="14.2" cy="7.7" r="2.25" fill="#fff"/>' +
      '<circle cx="18.3" cy="10.6" r="2.05" fill="#fff"/></svg>',

    google:
      '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#fff"/>' +
      '<g fill="none" stroke-width="3.4">' +
      '<circle cx="12" cy="12" r="7.2" stroke="#EA4335" stroke-dasharray="11.3 33.9" transform="rotate(-140 12 12)"/>' +
      '<circle cx="12" cy="12" r="7.2" stroke="#FBBC05" stroke-dasharray="11.3 33.9" transform="rotate(130 12 12)"/>' +
      '<circle cx="12" cy="12" r="7.2" stroke="#34A853" stroke-dasharray="11.3 33.9" transform="rotate(40 12 12)"/>' +
      '<circle cx="12" cy="12" r="7.2" stroke="#4285F4" stroke-dasharray="11.3 33.9" transform="rotate(-50 12 12)"/>' +
      '</g><path d="M12 10.4h7.5v3.2H12z" fill="#4285F4"/></svg>',

    /* AI 搜索：深墨绿底 + 荧光青「四角星」，刻意呼应全站悬浮态的 HUD 配色。
       （原「知乎」引擎与它的「知」字标已按需求移除，知乎现由 AI 搜索跨平台覆盖。） */
    ai:
      '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#0f2b25"/>' +
      '<path d="M10.9 4.5l1.62 4.28 4.28 1.62-4.28 1.62L10.9 16.3l-1.62-4.28L5 10.4l4.28-1.62z" ' +
      'fill="#00e5b0"/>' +
      '<circle cx="17.7" cy="6.3" r="1.45" fill="#5ee7c3"/></svg>',

    bilibili:
      '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#00a1d6"/>' +
      '<path d="M8.1 7.2 10 9.2M15.9 7.2 14 9.2" stroke="#fff" stroke-width="1.6" ' +
      'stroke-linecap="round" fill="none"/>' +
      '<rect x="4.6" y="9.1" width="14.8" height="9.4" rx="1.9" fill="#fff"/>' +
      '<path d="M9.5 11.9v3.8M14.5 11.9v3.8" stroke="#00a1d6" stroke-width="1.5" ' +
      'stroke-linecap="round"/></svg>',

    github:
      '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#24292f"/>' +
      '<g transform="translate(4.8 4.8) scale(0.9)"><path fill="#fff" d="M8 0C3.58 0 0 3.58 0 8c0 ' +
      '3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 ' +
      '1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 ' +
      '0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 ' +
      '2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 ' +
      '1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></g></svg>',

    douban:
      '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#2e9637"/>' +
      '<text x="12" y="17.4" text-anchor="middle" font-family="PingFang SC,Microsoft YaHei,sans-serif" ' +
      'font-size="14" font-weight="700" fill="#fff">豆</text></svg>'
  };

  /** 配置表里没写 logo 时的兜底：品牌色圆角方底 + 首字 */
  function fallbackLogo(engine) {
    var name = String(engine.name || '?').slice(0, 1);
    return '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#6fbf8a"/>' +
           '<text x="12" y="17.2" text-anchor="middle" font-family="inherit" ' +
           'font-size="14" font-weight="700" fill="#fff">' + escapeHtml(name) + '</text></svg>';
  }

  var engines = CFG.engines;

  /* ------------------------------ 工具函数 ------------------------------ */

  function getEngine(id) {
    for (var i = 0; i < engines.length; i++) {
      if (engines[i].id === id) { return engines[i]; }
    }
    return null;
  }

  function loadEngineId() {
    var id = null;
    try { id = global.localStorage.getItem(CFG.storageKey); } catch (e) { id = null; }
    return getEngine(id) ? id : CFG.defaultEngine;
  }

  function rememberEngineId(id) {
    try { global.localStorage.setItem(CFG.storageKey, id); } catch (e) { /* 隐私模式等场景忽略 */ }
  }

  /** 拼装最终搜索地址：关键词与固定附加参数一并做 URL 编码 */
  function buildSearchUrl(engine, keyword) {
    var parts = [encodeURIComponent(engine.param) + '=' + encodeURIComponent(keyword)];
    var extra = engine.extra || {};
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(extra[key]));
      }
    }
    return engine.url + '?' + parts.join('&');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /** 把命中的关键词前缀高亮出来（先定位再转义，避免 HTML 实体错位） */
  function highlight(text, keyword) {
    var raw = String(text);
    if (!keyword) { return escapeHtml(raw); }
    var pos = raw.toLowerCase().indexOf(String(keyword).toLowerCase());
    if (pos < 0) { return escapeHtml(raw); }
    return escapeHtml(raw.slice(0, pos)) +
           '<em>' + escapeHtml(raw.slice(pos, pos + keyword.length)) + '</em>' +
           escapeHtml(raw.slice(pos + keyword.length));
  }

  /* ---------------------------- 联想数据源 ---------------------------- */

  var SUGGEST_PROVIDERS = {
    bing: {
      makeUrl: function (keyword, cbName) {
        return 'https://api.bing.com/qsonhs.aspx?type=cb&cb=' + cbName +
               '&q=' + encodeURIComponent(keyword);
      },
      parse: function (data) {
        var list = [];
        try {
          var groups = (data && data.AS && data.AS.Results) || [];
          for (var i = 0; i < groups.length; i++) {
            var suggests = groups[i].Suggests || [];
            for (var j = 0; j < suggests.length; j++) {
              var txt = suggests[j] && suggests[j].Txt;
              if (!txt) { continue; }
              txt = String(txt).replace(/\s+/g, ' ').trim();
              if (txt && list.indexOf(txt) === -1) { list.push(txt); }
            }
          }
        } catch (e) { /* 结构变动时按「无建议」处理 */ }
        return list;
      }
    },
    baidu: {
      makeUrl: function (keyword, cbName) {
        return 'https://suggestion.baidu.com/su?wd=' + encodeURIComponent(keyword) +
               '&cb=' + cbName;
      },
      parse: function (data) {
        return (data && data.s) ? [].concat(data.s) : [];
      }
    }
  };

  var jsonpSeq = 0;

  /**
   * JSONP 请求联想数据。
   * 无论成功、超时还是出错，onDone 一定被调用一次（失败回传空数组）。
   */
  function requestSuggest(providerName, keyword, onDone) {
    var provider = SUGGEST_PROVIDERS[providerName];
    if (!provider) { onDone([]); return; }

    var cbName = 'fySuggestCallback' + (++jsonpSeq);
    var script = doc.createElement('script');
    var settled = false;
    var timer = null;

    function cleanup() {
      if (settled) { return; }
      settled = true;
      if (timer) { global.clearTimeout(timer); }
      if (script.parentNode) { script.parentNode.removeChild(script); }
      try { delete global[cbName]; } catch (e) { global[cbName] = undefined; }
    }

    timer = global.setTimeout(function () {
      cleanup();
      onDone([]);
    }, CFG.suggestTimeout);

    global[cbName] = function (data) {
      var list = [];
      try { list = provider.parse(data) || []; } catch (e) { list = []; }
      cleanup();
      onDone(list);
    };

    script.async = true;
    script.src = provider.makeUrl(keyword, cbName);
    script.onerror = function () { cleanup(); onDone([]); };
    doc.head.appendChild(script);
  }

  /* ------------------------------- 初始化 ------------------------------- */

  function init(options) {
    options = options || {};
    var root = doc.querySelector(options.root || '[data-fy-search]');
    if (!root || root.getAttribute('data-fy-ready') === '1') { return; }

    var form       = root.querySelector('form');
    var input      = root.querySelector('.so-input');
    var chipBox    = root.querySelector('.so-engines');
    var suggestBox = root.querySelector('.so-suggest');
    var clearBtn   = root.querySelector('.so-clear');
    var wrap       = root.querySelector('.so-input-wrap');
    var logoBox    = root.querySelector('.so-logo');
    if (!form || !input) { return; }

    var engineId    = loadEngineId();
    var debounceId  = null;
    var seq         = 0;
    var items       = [];
    var activeIndex = -1;

    /* ---------- 引擎标签 ---------- */

    function renderChips() {
      if (!chipBox) { return; }
      var html = '';
      for (var i = 0; i < engines.length; i++) {
        var e = engines[i];
        var on = e.id === engineId;
        html += '<button type="button" class="so-chip' + (on ? ' is-active' : '') +
                '" data-engine="' + escapeHtml(e.id) + '" aria-pressed="' + on +
                '" title="用' + escapeHtml(e.name) + '搜索">' + escapeHtml(e.name) + '</button>';
      }
      chipBox.innerHTML = html;
    }

    function paintChips() {
      if (!chipBox) { return; }
      var chips = chipBox.querySelectorAll('.so-chip');
      for (var i = 0; i < chips.length; i++) {
        var on = chips[i].getAttribute('data-engine') === engineId;
        chips[i].className = 'so-chip' + (on ? ' is-active' : '');
        chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }

    function applyEngine(id, focusInput) {
      var engine = getEngine(id);
      if (!engine) { return; }
      engineId = id;
      rememberEngineId(id);
      paintChips();
      paintLogo(engine);
      input.placeholder = engine.placeholder || ('在' + engine.name + '中搜索');
      hideSuggest();
      if (focusInput) { input.focus(); }
    }

    /** 把输入框左侧的标识换成当前引擎的 LOGO */
    function paintLogo(engine) {
      if (!logoBox) { return; }
      logoBox.innerHTML = LOGOS[engine.id] || fallbackLogo(engine);
      logoBox.setAttribute('title', engine.name);
      // 重置再挂上动画类，让每次换引擎都有一次淡入缩放
      logoBox.className = 'so-logo';
      void logoBox.offsetWidth;              // 读取布局属性，强制回流以重启动画
      logoBox.className = 'so-logo is-swap';
    }

    /* ---------- 联想下拉 ---------- */

    function updateClear() {
      if (clearBtn) { clearBtn.hidden = input.value.length === 0; }
    }

    function hideSuggest() {
      if (debounceId) { global.clearTimeout(debounceId); debounceId = null; }
      seq++;                       // 让在途响应失效
      if (!suggestBox) { return; }
      suggestBox.hidden = true;
      suggestBox.innerHTML = '';
      items = [];
      activeIndex = -1;
      input.setAttribute('aria-expanded', 'false');
    }

    function showSuggest(list, keyword) {
      if (!suggestBox || !list || !list.length) { hideSuggest(); return; }
      items = list.slice(0, CFG.suggestLimit);
      var html = '';
      for (var i = 0; i < items.length; i++) {
        html += '<div class="so-suggest-item" role="option" id="so-suggest-' + i +
                '" data-index="' + i + '">' + highlight(items[i], keyword) + '</div>';
      }
      suggestBox.innerHTML = html;
      suggestBox.hidden = false;
      activeIndex = -1;
      input.setAttribute('aria-expanded', 'true');
    }

    function moveActive(step) {
      if (!suggestBox) { return; }
      var nodes = suggestBox.querySelectorAll('.so-suggest-item');
      if (!nodes.length) { return; }
      var next = activeIndex + step;
      if (next < 0) { next = nodes.length - 1; }
      if (next >= nodes.length) { next = 0; }
      for (var i = 0; i < nodes.length; i++) { nodes[i].className = 'so-suggest-item'; }
      nodes[next].className = 'so-suggest-item is-active';
      activeIndex = next;
    }

    function scheduleSuggest() {
      if (debounceId) { global.clearTimeout(debounceId); debounceId = null; }
      if (!CFG.enableSuggest || !suggestBox) { return; }

      var keyword = input.value.trim();
      var engine = getEngine(engineId);
      if (!keyword || !engine || !engine.suggest) { hideSuggest(); return; }

      var mySeq = ++seq;
      debounceId = global.setTimeout(function () {
        requestSuggest(engine.suggest, keyword, function (list) {
          if (mySeq !== seq) { return; }                       // 已有更新的请求，丢弃本次
          if (input.value.trim() !== keyword) { return; }      // 输入内容已变化，丢弃本次
          showSuggest(list, keyword);
        });
      }, CFG.suggestDelay);
    }

    /* ---------- 提交 ---------- */

    function shake() {
      if (!wrap) { return; }
      wrap.className = 'so-input-wrap is-shake';
      global.setTimeout(function () { wrap.className = 'so-input-wrap'; }, 320);
    }

    function submit(keyword) {
      var value = (typeof keyword === 'string' ? keyword : input.value).trim();
      if (!value) {                       // 空关键词：不发请求，只做提示
        shake();
        input.focus();
        return;
      }
      input.value = value;
      var engine = getEngine(engineId) || getEngine(CFG.defaultEngine);
      hideSuggest();
      updateClear();

      // AI 搜索：不跳转、不拼 URL，交给 ai-search.js 打开右侧抽屉
      if (engine && engine.ai) {
        if (global.FYAI && global.FYAI.ask) { global.FYAI.ask(value); }
        return;
      }

      var url = buildSearchUrl(engine, value);
      if (CFG.openInNewTab) {
        global.open(url, '_blank', 'noopener');
      } else {
        global.location.href = url;
      }
    }

    /* ---------- 事件绑定 ---------- */

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit();
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        input.value = '';
        updateClear();
        hideSuggest();
        input.focus();
      });
    }

    if (chipBox) {
      chipBox.addEventListener('click', function (e) {
        var node = e.target;
        while (node && node !== chipBox && !(node.getAttribute && node.getAttribute('data-engine'))) {
          node = node.parentNode;
        }
        if (node && node !== chipBox && node.getAttribute) {
          applyEngine(node.getAttribute('data-engine'), true);
        }
      });
    }

    if (suggestBox) {
      // mousedown 阻止默认行为，避免输入框失焦导致下拉先被收起
      suggestBox.addEventListener('mousedown', function (e) {
        if (e.target && e.target.getAttribute && e.target.getAttribute('data-index') !== null) {
          e.preventDefault();
        }
      });
      suggestBox.addEventListener('click', function (e) {
        var node = e.target;
        while (node && node !== suggestBox && !(node.getAttribute && node.getAttribute('data-index'))) {
          node = node.parentNode;
        }
        if (node && node !== suggestBox && node.getAttribute) {
          var idx = parseInt(node.getAttribute('data-index'), 10);
          if (!isNaN(idx) && items[idx]) { submit(items[idx]); }
        }
      });
    }

    input.addEventListener('input', function () {
      updateClear();
      scheduleSuggest();
    });

    input.addEventListener('keydown', function (e) {
      var opened = suggestBox && !suggestBox.hidden;
      if (opened) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); moveActive(-1); return; }
        if (e.key === 'Escape')    { e.preventDefault(); hideSuggest(); return; }
        if (e.key === 'Enter' && activeIndex >= 0) {
          e.preventDefault();
          submit(items[activeIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        input.value = '';
        updateClear();
        hideSuggest();
      }
    });

    input.addEventListener('blur', function () {
      global.setTimeout(hideSuggest, 120);          // 留出点击下拉的时间
    });

    doc.addEventListener('click', function (e) {
      if (!root.contains(e.target)) { hideSuggest(); }
    });

    // Ctrl / Cmd + K：任意位置快速聚焦搜索框
    doc.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        input.focus();
        try { input.select(); } catch (err) { /* 忽略 */ }
      }
    });

    /* ---------- 首次渲染 ---------- */

    renderChips();
    applyEngine(engineId, false);
    updateClear();
    root.setAttribute('data-fy-ready', '1');
  }

  /* ------------------------------- 对外接口 ------------------------------- */

  global.FYSearch = {
    config: CFG,
    engines: engines,
    logos: LOGOS,
    getEngine: getEngine,
    getActiveEngine: function () { return getEngine(loadEngineId()); },
    buildSearchUrl: buildSearchUrl,
    /** 供外部按引擎 id 取 LOGO 的 SVG 字符串（新增引擎时可复用） */
    getLogo: function (id) {
      var engine = getEngine(id);
      return LOGOS[id] || (engine ? fallbackLogo(engine) : '');
    },
    init: init
  };

  function boot() {
    // 没有右侧抽屉的页面（如 mobile.html）不提供 AI 搜索：
    // 直接从引擎表里摘掉，标签栏就不会渲染出这一项，也不用改两端的 HTML。
    if (!doc.getElementById('ai-panel')) {
      for (var i = engines.length - 1; i >= 0; i--) {
        if (engines[i].ai) { engines.splice(i, 1); }
      }
      if (!getEngine(CFG.defaultEngine)) { CFG.defaultEngine = 'bing'; }
    }
    init();
    // 同页存在多个搜索区时可继续调用：FYSearch.init({ root: '#other' })
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
