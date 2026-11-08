/*
 * theme.js —— 背景主题（window.FYTheme）
 * 契约：.workbuddy/design/CONTRACT.md §3 theme / §4 FYTheme / §5 / §6 / §8
 *       + 契约补丁 v1.2 P1 / P4、v1.3 P13 + .workbuddy/design/06-bing-wallpaper-api.md
 *
 * 职责：只把 --fy-bg-* 自定义变量写到 documentElement.style，绝不创建 DOM 节点，
 *       绝不修改 body / #kw / 任何祖先的 filter / backdrop-filter / opacity。
 *       背景层 DOM（#fy-bg-layer / #fy-bg-overlay）由 dev-integrate 在 HTML 中提供一次。
 * 加载：<head> 同步，settings.js 之后、settings-boot.js 之前。
 */
(function (global) {
    'use strict';

    var COLOR_DEFAULT = '#b1ddbc';
    var GRADIENT_DEFAULT = 'linear-gradient(135deg,#b1ddbc,#e8f5ec)';
    var OVERLAY_COLOR_DEFAULT = '#000000';
    var BING_TIMEOUT = 6000;

    var VARS = [
        '--fy-bg-image',
        '--fy-bg-color',
        '--fy-bg-blur',
        '--fy-bg-overlay',
        '--fy-bg-overlay-color'
    ];

    // P4 / P13：压缩预设（不传 opts 默认 PRESET_BG）
    var PRESET_ICON = { maxEdge: 256, maxChars: 256 * 1024, quality: 0.85 };
    var PRESET_BG = { maxEdge: 1600, maxChars: 1400000, quality: 0.82 };

    var RE_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    var RE_DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i;
    var RE_HTTP = /^https?:\/\//i;
    var RE_ASSERT = /^assert\/[^\s"'<>\\]+$/;   // 契约 §2.1：theme.image 放行相对 assert/ 路径
    var RE_GRADIENT = /^(?:linear|radial|conic)-gradient\(/i;
    var RE_CSS_BAD = /["'\\\r\n\u0000-\u001f\u007f]/;

    // 写入目标恒为根元素 style；head 同步阶段 document.documentElement 已存在，
    // body 尚未解析，两个空背景 div 之后自然继承这些变量（首屏无闪烁）。
    function rootStyle() {
        try {
            if (typeof document !== 'undefined' && document.documentElement &&
                document.documentElement.style) {
                return document.documentElement.style;
            }
        } catch (e) {}
        return null;
    }

    function setVar(style, name, value) {
        try { style.setProperty(name, value); } catch (e) {}
    }

    function removeVar(style, name) {
        // 用 removeProperty 彻底删除，让 CSS 的 var(..., 回退值) 生效。
        try {
            if (typeof style.removeProperty === 'function') {
                style.removeProperty(name);
                return;
            }
        } catch (e) {}
        try { style.setProperty(name, ''); } catch (e) {}
    }

    function clearAll(style) {
        for (var i = 0; i < VARS.length; i++) {
            removeVar(style, VARS[i]);
        }
    }

    function clampNum(v, lo, hi, def) {
        var n = Number(v);
        if (!isFinite(n)) { return def; }
        if (n < lo) { n = lo; }
        if (n > hi) { n = hi; }
        return n;
    }

    function posNum(v, def) {
        var n = Number(v);
        return (isFinite(n) && n > 0) ? n : def;
    }

    function qualityNum(v, def) {
        var n = Number(v);
        return (isFinite(n) && n > 0 && n <= 1) ? n : def;
    }

    function safeColor(v, def) {
        return (typeof v === 'string' && RE_COLOR.test(v)) ? v : def;
    }

    // 背景图放行 http(s) / 相对 assert/ 路径 / data:image 位图；剔除能闭合 CSS 字符串的危险字符。
    function safeImage(v) {
        if (typeof v !== 'string' || v === '') { return ''; }
        if (!RE_HTTP.test(v) && !RE_DATA_IMAGE.test(v) && !RE_ASSERT.test(v)) { return ''; }
        if (RE_CSS_BAD.test(v)) { return ''; }
        return v;
    }

    function safeGradient(v) {
        if (typeof v !== 'string' || v === '' || v.length > 256) { return GRADIENT_DEFAULT; }
        if (!RE_GRADIENT.test(v)) { return GRADIENT_DEFAULT; }
        if (/url\(|@import|expression\(|;|<|>/.test(v)) { return GRADIENT_DEFAULT; }
        return v;
    }

    // 壁纸 URL / cache.url 只放行 http(s)，长度 ≤2048，无危险字符（绝不写 javascript:/data:）。
    function safeBingUrl(v) {
        if (typeof v !== 'string' || v === '' || v.length > 2048) { return ''; }
        if (!RE_HTTP.test(v) || RE_CSS_BAD.test(v)) { return ''; }
        return v;
    }

    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function localDateKey() {
        var d = new Date();
        return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate());
    }
    function cacheStr(v) {
        if (typeof v !== 'string') { return ''; }
        return v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 2048);
    }

    /* ================================================================ *
     * 必应每日壁纸（契约补丁 v1.2 P1 / 06-bing-wallpaper-api.md）
     * ================================================================ */

    function resParam(res) {
        if (res === 'UHD') { return 'UHD'; }
        if (res === '1366x768') { return '1366'; }
        return '1920';
    }
    function idxParam(idx) {
        if (idx === 'random') { return String(Math.floor(Math.random() * 8)); }
        return String(idx);
    }
    function suffixBing(res) {
        if (res === 'UHD') { return '_UHD.jpg'; }
        if (res === '1366x768') { return '_1366x768.jpg'; }
        return '_1920x1080.jpg';
    }
    function biturlBase(cfg, format) {
        return 'https://bing.biturl.top/?resolution=' + resParam(cfg.resolution) +
               '&format=' + format + '&index=' + idxParam(cfg.index) +
               '&mkt=' + encodeURIComponent(cfg.mkt);
    }
    function normalizeBingUrl(u) {
        if (typeof u !== 'string' || !u) { return ''; }
        u = u.replace(/\\/g, '/');
        if (u.charAt(0) === '/' && u.charAt(1) !== '/') { return 'https://www.bing.com' + u; }
        if (u.slice(0, 2) === '//') { return 'https:' + u; }
        return RE_HTTP.test(u) ? u : '';
    }
    function deepFindUrl(o, depth) {
        if (depth > 5 || !o) { return ''; }
        if (typeof o === 'string') { return RE_HTTP.test(o) ? o : ''; }
        if (typeof o !== 'object') { return ''; }
        var keys = ['url', 'image', 'imgurl', 'img', 'src', 'link', 'urlbase'];
        for (var i = 0; i < keys.length; i++) {
            var v = o[keys[i]];
            if (typeof v === 'string' && RE_HTTP.test(v)) { return v; }
        }
        for (var k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k)) {
                var found = deepFindUrl(o[k], depth + 1);
                if (found) { return found; }
            }
        }
        return '';
    }
    function parseJsonGeneric(data, cfg) {
        if (!data || typeof data !== 'object') { return null; }
        var raw = data.url || (data.data && data.data.url) ||
                  (data.images && data.images[0] && (data.images[0].url || data.images[0].urlbase));
        var url = normalizeBingUrl(raw) || deepFindUrl(data, 0);
        if (!url && data.images && data.images[0] && data.images[0].urlbase) {
            url = 'https://www.bing.com' + data.images[0].urlbase + suffixBing(cfg.resolution);
        }
        if (!url) { return null; }
        return {
            url: url,
            copyright: (data.copyright || (data.images && data.images[0] && data.images[0].copyright)) || '',
            copyrightLink: (data.copyright_link || data.copyrightLink) || '',
            date: (data.start_date || data.end_date || data.date) || ''
        };
    }

    // 源定义数组（source='auto' 时按此顺序依次尝试）。
    // 官方 HPImageArchive.aspx 无 CORS 且不支持 JSONP，前端禁止 fetch，故不列入。
    var BING_SOURCES = [
        { id: 'biturl-json', label: 'BitURL JSON（首选）', kind: 'json',
          build: function (cfg) { return biturlBase(cfg, 'json'); },
          parse: parseJsonGeneric },
        { id: 'biturl-image', label: 'BitURL 图片直链（302）', kind: 'image',
          build: function (cfg) { return biturlBase(cfg, 'image'); } },
        { id: 'bing-th', label: 'Bing 官方图片直链', kind: 'image',
          build: function (cfg, ctx) {
              var base = ctx && ctx.url;
              if (!base || !/bing\.com\/th|bing\.net\/th/i.test(base)) { return null; }
              var r = base.replace(/_(?:1920x1080|UHD|1366x768|1920x1200|1080x1920)\.jpg.*$/i,
                                  suffixBing(cfg.resolution));
              return r === base ? null : r;
          } },
        { id: 'qqsuu', label: 'QQSUU 重定向', kind: 'image',
          build: function () { return 'https://api.qqsuu.cn/api/dm-bing'; } },
        { id: 'vvhan', label: 'VVHan', kind: 'json',
          build: function () { return 'https://api.vvhan.com/api/bing?type=json'; },
          parse: parseJsonGeneric },
        { id: 'oioweb', label: 'OIOWeb', kind: 'json',
          build: function () { return 'https://api.oioweb.cn/api/common/bing?format=json'; },
          parse: parseJsonGeneric },
        { id: 'pearktrue', label: 'PearkTrue', kind: 'json',
          build: function () { return 'https://api.pearktrue.cn/api/dailywallpaper/'; },
          parse: parseJsonGeneric },
        { id: 'custom', label: '自定义 API', kind: 'json',
          build: function (cfg) {
              return (cfg.customApi && RE_HTTP.test(cfg.customApi)) ? cfg.customApi : null;
          },
          parse: function (data) {
              if (!data) { return null; }
              var url = (typeof data === 'string') ? normalizeBingUrl(data)
                        : (normalizeBingUrl(data.url) || deepFindUrl(data, 0));
              if (!url) { return null; }   // 06 §5-13：customApi JSON 缺 url 优雅跳过
              return { url: url, copyright: '', copyrightLink: '', date: '' };
          } }
    ];

    function normalizeBing(cfg) {
        cfg = (cfg && typeof cfg === 'object') ? cfg : {};
        var idx = cfg.index;
        if (idx !== 'random') {
            idx = Number(idx);
            if (!isFinite(idx)) { idx = 0; }
            idx = Math.max(0, Math.min(7, Math.round(idx)));
        }
        return {
            source: (typeof cfg.source === 'string' && cfg.source) ? cfg.source : 'auto',
            customApi: (typeof cfg.customApi === 'string') ? cfg.customApi : '',
            mkt: (typeof cfg.mkt === 'string' && cfg.mkt) ? cfg.mkt : 'zh-CN',
            resolution: (typeof cfg.resolution === 'string' && cfg.resolution) ? cfg.resolution : '1920x1080',
            index: idx,
            refresh: (typeof cfg.refresh === 'string' && cfg.refresh) ? cfg.refresh : 'daily',
            showCopyright: cfg.showCopyright !== false,
            cache: (cfg.cache && typeof cfg.cache === 'object') ? cfg.cache : {}
        };
    }

    function buildSourceChain(cfg) {
        if (cfg.source !== 'auto') {
            for (var i = 0; i < BING_SOURCES.length; i++) {
                if (BING_SOURCES[i].id === cfg.source) { return [BING_SOURCES[i]]; }
            }
            return [];
        }
        return BING_SOURCES.slice(0);
    }

    // JSON 源：fetch + AbortController 6s 超时（无 CORS 的官方接口绝不 fetch）。
    function tryJsonSource(endpoint, timeoutMs, done) {
        if (typeof fetch !== 'function' || typeof AbortController === 'undefined' ||
            typeof Promise === 'undefined') {
            return done(new Error('当前环境不支持 fetch/AbortController'));
        }
        var ctrl;
        try { ctrl = new AbortController(); } catch (e) { return done(e); }
        var settled = false;
        var timer = setTimeout(function () {
            try { ctrl.abort(); } catch (e) {}
            finish(new Error('请求超时'));
        }, timeoutMs);
        function finish(err, data) {
            if (settled) { return; }
            settled = true;
            clearTimeout(timer);
            done(err, data);
        }
        try {
            fetch(endpoint, { signal: ctrl.signal, mode: 'cors', credentials: 'omit' })
                .then(function (r) {
                    if (!r || !r.ok) { throw new Error('HTTP ' + (r && r.status)); }
                    return r.json();
                })
                .then(function (data) { finish(null, data); })
                .catch(function (e) { finish(e || new Error('fetch 失败')); });
        } catch (e) { finish(e); }
    }

    // 图片类源：new Image().src，天然不受 CORS 限制；onerror + 6s 超时。
    function tryImageSource(endpoint, timeoutMs, done) {
        if (typeof Image !== 'function') { return done(new Error('当前环境不支持 Image')); }
        var img;
        try { img = new Image(); } catch (e) { return done(e); }
        var settled = false;
        var timer;
        function finish(err) {
            if (settled) { return; }
            settled = true;
            clearTimeout(timer);
            img.onload = img.onerror = null;
            done(err);
        }
        timer = setTimeout(function () { finish(new Error('图片加载超时')); }, timeoutMs);
        img.onload = function () { finish(null); };
        img.onerror = function () { finish(new Error('图片加载失败')); };
        try { img.src = endpoint; } catch (e) { finish(e); }
    }

    function trySource(src, cfg, ctx, done) {
        var endpoint;
        try { endpoint = src.build(cfg, ctx); } catch (e) { endpoint = null; }
        if (!endpoint || typeof endpoint !== 'string') { return done(new Error('源跳过')); }

        if (src.kind === 'image') {
            return tryImageSource(endpoint, BING_TIMEOUT, function (err) {
                if (err) { return done(err); }
                done(null, { url: endpoint, copyright: '', copyrightLink: '', date: '' });
            });
        }

        tryJsonSource(endpoint, BING_TIMEOUT, function (err, data) {
            if (err) {
                // customApi 填的是「直接图片 URL」时的兜底
                if (src.id === 'custom' && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(endpoint)) {
                    return tryImageSource(endpoint, BING_TIMEOUT, function (e2) {
                        if (e2) { return done(e2); }
                        done(null, { url: endpoint, copyright: '', copyrightLink: '', date: '' });
                    });
                }
                return done(err);
            }
            var parsed;
            try { parsed = src.parse(data, cfg, ctx); } catch (e) { parsed = null; }
            if (!parsed || !parsed.url || !safeBingUrl(parsed.url)) {
                return done(new Error('解析失败或缺少 url'));
            }
            ctx.url = parsed.url;   // 供 bing-th 等后续源复用
            done(null, parsed);
        });
    }

    function readThemeSection() {
        try {
            if (global.FYSettings && typeof global.FYSettings.getSection === 'function') {
                var s = global.FYSettings.getSection('theme');
                return (s && typeof s === 'object') ? s : null;
            }
        } catch (e) {}
        return null;
    }

    // 自己回写缓存时置位，订阅 handler 跳过，避免 patch → 广播 → 再 fetch 的回环 / 跨标签回环。
    var bingSelfPatch = false;
    var bingInFlight = false;
    var bingAutoStarted = false;

    function selfPatchBing(bing) {
        bingSelfPatch = true;
        try {
            if (global.FYSettings && typeof global.FYSettings.patch === 'function') {
                global.FYSettings.patch('theme', { bing: bing });   // 深度 1 整体替换，绝不写 theme.image
            }
        } catch (e) {}
        bingSelfPatch = false;
    }
    function mergeBing(bing, patch) {
        var b = normalizeBing(bing);
        var src = (patch && patch.cache) ? patch.cache : b.cache;
        return {
            source: b.source, customApi: b.customApi, mkt: b.mkt, resolution: b.resolution,
            index: b.index, refresh: b.refresh, showCopyright: b.showCopyright,
            cache: {
                date: cacheStr(src.date), url: cacheStr(src.url),
                copyright: cacheStr(src.copyright), copyrightLink: cacheStr(src.copyrightLink),
                source: cacheStr(src.source)
            }
        };
    }
    function clearBingCache(bing) {
        selfPatchBing(mergeBing(bing, {
            cache: { date: '', url: '', copyright: '', copyrightLink: '', source: '' }
        }));
    }
    function writeBingCache(bing, result) {
        var next = mergeBing(bing, {
            cache: {
                date: localDateKey(),
                url: result.url || '',
                copyright: result.copyright || '',
                copyrightLink: result.copyrightLink || '',
                source: result.sourceId || ''
            }
        });
        next.cache.date = localDateKey();
        selfPatchBing(next);
    }

    // loadBing(cfg, cb)：按源链依次尝试，任一源成功即停；全部失败清缓存并回可读错误。
    // cb(err, {url, copyright, copyrightLink, date, sourceId})
    function loadBing(cfg, cb) {
        if (typeof cb !== 'function') { cb = function () {}; }
        var b = normalizeBing(cfg);
        var chain = buildSourceChain(b);
        var ctx = {};
        var i = 0;
        function next() {
            if (i >= chain.length) {
                clearBingCache(b);
                return cb(new Error('壁纸源均不可用，已恢复默认背景'), null);
            }
            var src = chain[i++];
            trySource(src, b, ctx, function (err, result) {
                if (!err && result && result.url) {
                    result.sourceId = src.id;
                    return cb(null, result);
                }
                next();   // 串行，不并发打满
            });
        }
        next();
    }

    // applyBing(result)：new Image() 预加载成功后才写 --fy-bg-image；失败不改动现有背景。
    function applyBing(result) {
        if (!result || !result.url) { return; }
        var u = safeBingUrl(result.url);
        if (!u || typeof Image !== 'function') { return; }
        var img;
        try { img = new Image(); } catch (e) { return; }
        var settled = false;
        var timer;
        function finish(ok) {
            if (settled) { return; }
            settled = true;
            clearTimeout(timer);
            img.onload = img.onerror = null;
            if (ok) {
                var style = rootStyle();
                if (style) { setVar(style, '--fy-bg-image', 'url("' + u + '")'); }
            }
        }
        timer = setTimeout(function () { finish(false); }, BING_TIMEOUT);
        img.onload = function () { finish(true); };
        img.onerror = function () { finish(false); };
        try { img.src = u; } catch (e) { finish(false); }
    }

    function doFetchBing(bing) {
        if (bingInFlight) { return; }
        bingInFlight = true;
        loadBing(bing, function (err, result) {
            bingInFlight = false;
            var cur = readThemeSection();
            if (!cur || cur.mode !== 'bing') { return; }   // 已切走：丢弃结果，不再有后台请求
            if (err || !result || !result.url) {
                apply({ mode: 'default' });                 // 视觉回退原背景（loadBing 已清缓存）
                return;
            }
            applyBing(result);                              // 预加载成功后写变量
            writeBingCache(bing, result);                  // 回写缓存（绝不写 theme.image）
        });
    }

    // refreshBing()：「立即换一张」，忽略缓存强制重取。
    function refreshBing() {
        var section = readThemeSection();
        if (!section || section.mode !== 'bing') { return; }
        doFetchBing(section.bing);
    }

    function isCacheFresh(b) {
        var c = b.cache || {};
        return !!(safeBingUrl(c.url) && c.date === localDateKey());
    }
    function shouldAutoFetch(bing) {
        var b = normalizeBing(bing);
        if (b.refresh === 'manual') { return false; }
        if (b.refresh === 'every-load') { return true; }
        return !isCacheFresh(b);   // daily：当天无有效缓存才请求
    }

    // startBingRefresh()：由 settings-boot.js 在 head 同步阶段调用；
    // 注册一次性就绪监听，把联网刷新延后到 DOMContentLoaded 之后异步进行（首屏零网络）。
    function startBingRefresh() {
        if (bingAutoStarted) { return; }
        if (typeof window === 'undefined' || typeof document === 'undefined' ||
            typeof setTimeout !== 'function') { return; }
        bingAutoStarted = true;
        var run = function () {
            var section = readThemeSection();
            if (!section || section.mode !== 'bing') { return; }
            if (shouldAutoFetch(section.bing)) { doFetchBing(section.bing); }
        };
        if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
            document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 0); }, false);
        } else {
            setTimeout(run, 0);
        }
    }

    /* ================================================================ *
     * 主题应用
     * ================================================================ */

    /*
     * apply(themeObj)：幂等。每次先清空全部自定义变量，再按 mode 写入，
     * 保证任意状态切换都不残留、连续调用结果一致。
     * 变量消费方（dev-integrate 已按契约 §5 接线）：
     *   --fy-bg-image / --fy-bg-color 同时被 body（带原图回退）与 #fy-bg-layer 消费；
     *   --fy-bg-blur 只被 #fy-bg-layer 的 filter 消费（绝不落到 body / #kw / 任何祖先）；
     *   --fy-bg-overlay / --fy-bg-overlay-color 只被 #fy-bg-overlay 消费。
     */
    function apply(themeObj) {
        var style = rootStyle();
        if (!style) { return; }

        clearAll(style);

        var t = (themeObj && typeof themeObj === 'object') ? themeObj : null;
        if (!t) { return; }
        var mode = t.mode;

        // bing：纯同步、零网络，用 cache.url 回填（首屏防闪烁关键）。
        if (mode === 'bing') {
            var b = (t.bing && typeof t.bing === 'object') ? t.bing : {};
            var c = (b.cache && typeof b.cache === 'object') ? b.cache : {};
            setVar(style, '--fy-bg-blur', clampNum(t.blur, 0, 24, 0) + 'px');
            setVar(style, '--fy-bg-overlay', String(clampNum(t.overlay, 0, 0.8, 0)));
            setVar(style, '--fy-bg-overlay-color', safeColor(t.overlayColor, OVERLAY_COLOR_DEFAULT));
            var bu = safeBingUrl(c.url);
            if (bu) { setVar(style, '--fy-bg-image', 'url("' + bu + '")'); }
            return;
        }

        if (mode !== 'image' && mode !== 'color' && mode !== 'gradient') {
            return; // default / 非法 mode：保持清空，CSS 回退到原背景
        }

        // 修饰层：三种自定义 mode 通用（blur 钳 0~24，overlay 钳 0~0.8）
        var blur = clampNum(t.blur, 0, 24, 0);
        var overlay = clampNum(t.overlay, 0, 0.8, 0);
        setVar(style, '--fy-bg-blur', blur + 'px');
        setVar(style, '--fy-bg-overlay', String(overlay));
        setVar(style, '--fy-bg-overlay-color', safeColor(t.overlayColor, OVERLAY_COLOR_DEFAULT));

        // 背景主体：按 mode 组合字段
        if (mode === 'image') {
            var src = safeImage(t.image);
            // image 为空/非法时不写主体变量（回退透明，透出 body 原背景），绝不写死外链
            if (src) { setVar(style, '--fy-bg-image', 'url("' + src + '")'); }
        } else if (mode === 'color') {
            setVar(style, '--fy-bg-image', 'none');
            setVar(style, '--fy-bg-color', safeColor(t.color, COLOR_DEFAULT));
        } else {
            setVar(style, '--fy-bg-image', safeGradient(t.gradient));
        }
    }

    // 从 FYSettings 读 theme 段并应用；任何异常/缺失都静默降级为默认背景，绝不抛。
    // bing 模式在此只用 cache.url 回填，绝不发起网络请求。
    function applyFromStorage() {
        apply(readThemeSection());
    }

    /* ================================================================ *
     * 图片压缩（P4：file, cb, opts；不传 opts 默认 PRESET_BG）
     * ================================================================ */

    function compressImage(file, cb, opts) {
        if (typeof cb !== 'function') { cb = function () {}; }
        if (!file || typeof file.type !== 'string' || !/^image\//i.test(file.type) ||
            /svg/i.test(file.type)) {
            return cb(new Error('仅支持 PNG / JPEG / WebP 等位图图片'), null);
        }
        var o = (opts && typeof opts === 'object') ? opts : PRESET_BG;
        var maxEdge = posNum(o.maxEdge, PRESET_BG.maxEdge);
        var maxChars = posNum(o.maxChars, PRESET_BG.maxChars);
        var quality = qualityNum(o.quality, PRESET_BG.quality);

        var reader;
        try { reader = new FileReader(); }
        catch (e) { return cb(new Error('当前浏览器不支持图片读取'), null); }

        reader.onerror = function () { cb(new Error('图片读取失败'), null); };
        reader.onload = function (ev) {
            var img;
            try { img = new Image(); }
            catch (e) { return cb(new Error('图片解码失败'), null); }
            img.onerror = function () { cb(new Error('图片解码失败'), null); };
            img.onload = function () {
                var w = img.naturalWidth || img.width;
                var h = img.naturalHeight || img.height;
                if (!w || !h) { return cb(new Error('图片尺寸无效'), null); }
                var scale = Math.min(1, maxEdge / Math.max(w, h));
                var nw = Math.max(1, Math.round(w * scale));
                var nh = Math.max(1, Math.round(h * scale));
                var canvas = document.createElement('canvas');
                canvas.width = nw;
                canvas.height = nh;
                var out;
                try {
                    canvas.getContext('2d').drawImage(img, 0, 0, nw, nh);
                    out = canvas.toDataURL('image/jpeg', quality);
                } catch (e) { return cb(new Error('图片压缩失败'), null); }
                if (out.length > maxChars) {
                    return cb(new Error('图片过大（压缩后仍超 ' + maxChars + ' 字符），建议改用 http(s) 图片 URL'), null);
                }
                cb(null, out);
            };
            img.src = ev.target.result;
        };
        try { reader.readAsDataURL(file); }
        catch (e) { cb(new Error('图片读取失败'), null); }
    }

    /* ================================================================ *
     * 订阅 fy:settings-change（幂等，只注册一次）
     * ================================================================ */

    var subscribed = false;
    function onSettingsChange(e) {
        var d = e && e.detail;
        if (!d) { return; }
        if (d.section !== 'theme' && d.section !== '*') { return; }
        if (bingSelfPatch) { return; }   // 自己回写缓存：不重放（applyBing 负责 image 变量）
        applyFromStorage();               // 回填（零网络）
        if (d.source !== 'patch') { return; }   // import/reset/storage 只回填，避免跨标签回环
        var section = readThemeSection();
        if (section && section.mode === 'bing' && !bingInFlight &&
            !(section.bing && section.bing.refresh === 'manual')) {
            doFetchBing(section.bing);   // 用户主动 patch（如切到 bing / 改地区）→ 强制重取
        }
    }
    function subscribeOnce() {
        if (subscribed) { return; }
        try {
            if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
                document.addEventListener('fy:settings-change', onSettingsChange, false);
                subscribed = true;
            }
        } catch (e) {}
    }

    global.FYTheme = {
        apply: apply,
        applyFromStorage: applyFromStorage,
        compressImage: compressImage,
        PRESET_ICON: PRESET_ICON,
        PRESET_BG: PRESET_BG,
        BING_SOURCES: BING_SOURCES,
        loadBing: loadBing,
        applyBing: applyBing,
        refreshBing: refreshBing,
        startBingRefresh: startBingRefresh
    };

    subscribeOnce();

})(typeof window !== 'undefined' ? window : this);
