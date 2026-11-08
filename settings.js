/*
 * settings.js —— FYSettings 配置核心
 * 依据：CONTRACT.md §2 / 05-settings-schema.md / 契约补丁 v1.2 (P1/P3/P10/P11) / 06-bing-wallpaper-api.md
 * 纯 ES5、IIFE、零 DOM 依赖；可在浏览器 / Node(require|vm) / 无 window 环境加载。
 * 唯一持久化键 foryouos.customize.v1；绝不读写三个只读兼容键
 * (foryouos.search.engine / foryouos.ai.key / foryouos.ai.model)。
 */
(function () {
  var STORAGE_KEY = 'foryouos.customize.v1';
  var SCHEMA_VERSION = 1;
  var SECTIONS = ['icons', 'search', 'theme', 'ui'];
  var THEME_MODES = ['default', 'image', 'color', 'gradient', 'bing'];
  var BING_SOURCES = ['auto', 'biturl-json', 'biturl-image', 'bing-th', 'qqsuu', 'vvhan', 'oioweb', 'pearktrue', 'custom'];
  var BING_MKTS = ['zh-CN', 'en-US', 'ja-JP', 'en-GB', 'de-DE', 'fr-FR', 'random'];
  var BING_RESOLUTIONS = ['1920x1080', 'UHD', '1366x768'];
  var BING_REFRESH = ['daily', 'every-load', 'manual'];
  var BING_CACHE_KEYS = ['date', 'url', 'copyright', 'copyrightLink', 'source'];
  var IMAGE_MAX = 1400000;   // theme.image / icon 的 dataURL 字符上限（§4）
  var URL_MAX = 2048;
  var TITLE_MAX = 40;
  var CHILDREN_MAX = 6;

  var CTRL_RE = /[\u0000-\u001F\u007F]/;
  var ITEM_ID_RE = /^ic-[A-Za-z0-9_-]{1,64}$/;
  var ENGINE_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
  var PARAM_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
  var EXTRA_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
  var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  var IMAGE_DATA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/i;
  var HTTP_RE = /^https?:\/\//i;
  var ASSERT_RE = /^assert\/[^\s"'<>]+$/;
  var DANGEROUS_RE = /^\s*(javascript|vbscript|data|file|about|blob)\s*:/i;
  var GRADIENT_START_RE = /^(linear|radial|conic)-gradient\(/i;
  var GRADIENT_BAD_RE = /url\(|@import|expression\(|;|<|>/i;
  var TRIM_RE = /^\s+|\s+$/g;

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isPlainObject(x) { return Object.prototype.toString.call(x) === '[object Object]'; }
  function trimStr(s) { return s.replace(TRIM_RE, ''); }
  function isFiniteNum(x) { return typeof x === 'number' && isFinite(x); }
  function deepClone(x) {
    if (x === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(x)); } catch (e) { return {}; }
  }

  /* ------------------------------------------------------------------ *
   * 默认配置：icons 来自 02-icons-spec §1.1，engines 来自 03-search-spec §1，
   * theme.bing 来自 06-bing-wallpaper-api.md §2（契约补丁 v1.2 P1）
   * ------------------------------------------------------------------ */
  var DEFAULTS_TEMPLATE = {
    version: 1,
    icons: {
      rows: [
        {
          id: 'top',
          items: [
            {
              id: 'ic-d-study', type: 'group', title: '中国大学MOOC',
              url: 'https://www.icourse163.org/', icon: 'assert/brand-icourse163.png', iconText: '',
              children: [
                { id: 'ic-d-study-open163', title: '网易公开课', url: 'https://open.163.com/', icon: 'assert/brand-netease-open.png', iconText: '' },
                { id: 'ic-d-study-chinesemooc', title: '华文慕课', url: 'http://www.chinesemooc.org/', icon: '', iconText: '华文' },
                { id: 'ic-d-study-xuetangx', title: '学堂在线', url: 'https://www.xuetangx.com/', icon: 'assert/brand-xuetangx.png', iconText: '' }
              ]
            },
            { id: 'ic-d-baidu-photo', type: 'link', title: '一刻相册', url: 'https://photo.baidu.com/', icon: 'https://i.imgtg.com/2023/03/09/YcDna.png', iconText: '' },
            { id: 'ic-d-zhihu', type: 'link', title: '知乎', url: 'https://www.zhihu.com', icon: 'https://i.imgtg.com/2023/03/09/YcRQs.png', iconText: '' },
            {
              id: 'ic-d-video', type: 'group', title: '豆瓣',
              url: 'https://www.douban.com/', icon: 'assert/brand-douban.png', iconText: '',
              children: [
                { id: 'ic-d-video-tencent', title: '腾讯视频', url: 'https://v.qq.com/', icon: 'assert/brand-tencent-video.svg', iconText: '' },
                { id: 'ic-d-video-iqiyi', title: '爱奇艺', url: 'https://www.iqiyi.com/', icon: 'assert/brand-iqiyi.png', iconText: '' },
                { id: 'ic-d-video-bilibili', title: 'B站', url: 'https://www.bilibili.com/', icon: 'assert/brand-bilibili.png', iconText: '' },
                { id: 'ic-d-video-cctv', title: 'CCTV', url: 'https://www.cctv.com/', icon: 'assert/brand-cctv.png', iconText: '' }
              ]
            },
            {
              id: 'ic-d-canva', type: 'group', title: 'Canva 可画',
              url: 'https://www.canva.cn/', icon: 'assert/brand-canva.svg', iconText: '',
              children: [
                { id: 'ic-d-canva-wechat', title: '微信公众号', url: 'https://www.canva.cn/wechat-official-account/', icon: 'assert/brand-wechat.png', iconText: '' }
              ]
            }
          ]
        },
        {
          id: 'movie',
          items: [
            { id: 'ic-d-csdn', type: 'link', title: 'CSDN', url: 'https://www.csdn.net/', icon: 'https://i.imgtg.com/2023/03/09/Yc7rG.png', iconText: '' },
            {
              id: 'ic-d-read', type: 'group', title: '微信读书',
              url: 'https://weread.qq.com/', icon: 'assert/brand-weread.png', iconText: '',
              children: [
                { id: 'ic-d-read-bookan', title: '博看书苑', url: 'https://zq.bookan.com.cn/?t=index&id=20999', icon: 'assert/brand-bookan.png', iconText: '' }
              ]
            },
            {
              id: 'ic-d-ai', type: 'group', title: 'WorkBuddy 网页版',
              url: 'https://www.workbuddy.cn/', icon: 'assert/brand-workbuddy.svg', iconText: '',
              children: [
                { id: 'ic-d-ai-deepseek', title: 'DeepSeek', url: 'https://chat.deepseek.com/', icon: 'assert/brand-deepseek.svg', iconText: '' },
                { id: 'ic-d-ai-doubao', title: '豆包', url: 'https://www.doubao.com/chat/', icon: 'assert/brand-doubao.png', iconText: '' },
                { id: 'ic-d-ai-chatgpt', title: 'ChatGPT', url: 'https://chatgpt.com/', icon: 'assert/brand-chatgpt.svg', iconText: '' },
                { id: 'ic-d-ai-gemini', title: 'Gemini', url: 'https://gemini.google.com/', icon: 'assert/brand-gemini.png', iconText: '' }
              ]
            },
            { id: 'ic-d-netease-music', type: 'link', title: '网易云音乐', url: 'https://music.163.com/', icon: 'https://i.imgtg.com/2023/03/09/YcybP.png', iconText: '' },
            {
              id: 'ic-d-tools', type: 'group', title: 'Cloudflare',
              url: 'https://dash.cloudflare.com/', icon: 'assert/brand-cloudflare.png', iconText: '',
              children: [
                { id: 'ic-d-tools-page', title: 'Page', url: 'https://dash.cloudflare.com/', icon: 'assert/brand-cloudflare.png', iconText: '' },
                { id: 'ic-d-tools-imgtg', title: '图床', url: 'https://imgtg.com/', icon: 'assert/brand-imgtg.png', iconText: '' },
                { id: 'ic-d-tools-hitokoto', title: '一言', url: 'https://hitokoto.cn/', icon: 'assert/brand-hitokoto.png', iconText: '' },
                { id: 'ic-d-tools-iconfont', title: '矢量图', url: 'https://www.iconfont.cn/', icon: 'assert/brand-iconfont.svg', iconText: '' }
              ]
            }
          ]
        }
      ]
    },
    search: {
      defaultEngine: 'bing',
      openInNewTab: false,
      enableSuggest: true,
      engines: [
        { id: 'bing', name: '必应', url: 'https://cn.bing.com/search', param: 'q', extra: {}, suggest: 'bing', builtin: true },
        { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s', param: 'wd', extra: {}, suggest: 'baidu', builtin: true },
        { id: 'google', name: 'Google', url: 'https://www.google.com/search', param: 'q', extra: {}, suggest: null, builtin: true },
        { id: 'ai', name: 'AI 搜索', url: '', param: '', extra: {}, suggest: 'bing', ai: true, placeholder: '输入关键词，让 AI 跨平台找并排序', builtin: true },
        { id: 'bilibili', name: 'B站', url: 'https://search.bilibili.com/all', param: 'keyword', extra: {}, suggest: null, builtin: true },
        { id: 'github', name: 'GitHub', url: 'https://github.com/search', param: 'q', extra: { type: 'repositories' }, suggest: null, builtin: true },
        { id: 'douban', name: '豆瓣', url: 'https://www.douban.com/search', param: 'q', extra: {}, suggest: null, builtin: true }
      ],
      hidden: []
    },
    theme: {
      mode: 'default', image: '', color: '#b1ddbc',
      gradient: 'linear-gradient(135deg,#b1ddbc,#e8f5ec)',
      blur: 0, overlay: 0, overlayColor: '#000000',
      bing: {
        source: 'auto', customApi: '', mkt: 'zh-CN', resolution: '1920x1080',
        index: 0, refresh: 'daily', showCopyright: true,
        cache: { date: '', url: '', copyright: '', copyrightLink: '', source: '' }
      }
    },
    ui: { hasCustomized: false }
  };

  function defaults() { return deepClone(DEFAULTS_TEMPLATE); }
  function aiEngine() { return deepClone(DEFAULTS_TEMPLATE.search.engines[3]); }

  /* ------------------------------------------------------------------ *
   * 底层合法性判断（coerce 与 validate 共用，保证两条路径一致）
   * ------------------------------------------------------------------ */
  function isValidHttpUrl(v) {
    if (typeof v !== 'string' || CTRL_RE.test(v)) return false;
    if (v.length > URL_MAX) return false;
    return HTTP_RE.test(trimStr(v));
  }
  function isValidImage(v) {
    if (typeof v !== 'string') return false;
    if (v === '') return true;                       // 空串＝走 iconText 兜底
    if (CTRL_RE.test(v)) return false;
    if (HTTP_RE.test(trimStr(v))) return v.length <= URL_MAX;
    if (IMAGE_DATA_RE.test(v)) return v.length <= IMAGE_MAX;
    if (ASSERT_RE.test(v) && v.indexOf('..') === -1) return v.length <= URL_MAX;
    return false;
  }
  function isValidGradient(v) {
    if (typeof v !== 'string' || v.length > 256) return false;
    if (!GRADIENT_START_RE.test(v)) return false;
    if (GRADIENT_BAD_RE.test(v)) return false;
    if (CTRL_RE.test(v)) return false;
    return true;
  }
  function isValidIconText(v) {
    return typeof v === 'string' && v.length <= 40 && !CTRL_RE.test(v);
  }
  // P3：validate 与 FYSearchCustomize.apply 共用的参数名规则，由 FYSettings.isValidParam 导出
  function isValidParam(name) {
    return typeof name === 'string' && PARAM_RE.test(name);
  }

  /* ------------------------------------------------------------------ *
   * validate：严格、纯函数，不改入参、不读存储、不抛异常
   * ------------------------------------------------------------------ */
  function err(list, code, path, reason) { list.push(code + ' ' + path + ': ' + reason); }

  function checkUrl(v, path, errors) {
    if (v === undefined || v === null) { err(errors, 'MISSING_REQUIRED', path, '缺少链接'); return false; }
    if (typeof v !== 'string') { err(errors, 'INVALID_TYPE', path, '须为字符串'); return false; }
    if (CTRL_RE.test(v)) { err(errors, 'UNSAFE_SCHEME', path, '含控制字符'); return false; }
    var t = trimStr(v);
    if (DANGEROUS_RE.test(t)) { err(errors, 'UNSAFE_SCHEME', path, '不安全的协议或数据'); return false; }
    if (v.length > URL_MAX) { err(errors, 'TOO_LONG', path, '链接超过 2048 字符'); return false; }
    if (!HTTP_RE.test(t)) { err(errors, 'INVALID_URL', path, '仅支持 http/https 链接'); return false; }
    return true;
  }

  function checkImage(v, path, errors) {
    if (v === undefined) return true;               // 可选字段，缺失合法
    if (typeof v !== 'string') { err(errors, 'INVALID_TYPE', path, '须为字符串'); return false; }
    if (v === '') return true;
    if (CTRL_RE.test(v)) { err(errors, 'UNSAFE_SCHEME', path, '含控制字符'); return false; }
    var t = trimStr(v);
    if (IMAGE_DATA_RE.test(v) && v.length > IMAGE_MAX) {
      err(errors, 'IMAGE_TOO_LARGE', path, '内嵌图片过大，请改填 http(s) 图片 URL'); return false;
    }
    if (HTTP_RE.test(t) && v.length > URL_MAX) { err(errors, 'TOO_LONG', path, '图片地址超过 2048 字符'); return false; }
    if (isValidImage(v)) return true;
    if (DANGEROUS_RE.test(t)) { err(errors, 'UNSAFE_SCHEME', path, '不安全的协议或数据'); return false; }
    err(errors, 'INVALID_URL', path, '仅支持 http(s)、assert/ 本地库或合法内嵌图片'); return false;
  }

  function validateTitle(v, path, errors) {
    if (v === undefined || v === null) { err(errors, 'MISSING_REQUIRED', path, '缺少标题'); return; }
    if (typeof v !== 'string') { err(errors, 'INVALID_TYPE', path, '须为字符串'); return; }
    if (CTRL_RE.test(v)) { err(errors, 'UNSAFE_SCHEME', path, '含控制字符'); return; }
    if (v.length < 1) { err(errors, 'MISSING_REQUIRED', path, '标题不能为空'); return; }
    if (v.length > TITLE_MAX) { err(errors, 'TOO_LONG', path, '最多 40 字'); return; }
  }

  function validateIconText(v, path, errors) {
    if (v === undefined) return;
    if (typeof v !== 'string') { err(errors, 'INVALID_TYPE', path, '须为字符串'); return; }
    if (v.length > 40) { err(errors, 'TOO_LONG', path, '最多 40 字'); return; }
    if (CTRL_RE.test(v)) err(errors, 'UNSAFE_SCHEME', path, '含控制字符');
  }

  function validateId(id, path, re, errors, ids) {
    if (id === undefined || id === null || id === '') { err(errors, 'MISSING_REQUIRED', path, '缺少 id'); return; }
    if (typeof id !== 'string' || !re.test(id)) { err(errors, 'INVALID_ID', path, 'id 格式非法'); return; }
    if (ids[id]) { err(errors, 'DUPLICATE_ID', path, 'id 重复'); return; }
    ids[id] = true;
  }

  function validateItem(item, path, errors, ids) {
    if (!isPlainObject(item)) { err(errors, 'INVALID_TYPE', path, '须为对象'); return; }
    validateId(item.id, path + '.id', ITEM_ID_RE, errors, ids);
    if (item.type === undefined) err(errors, 'MISSING_REQUIRED', path + '.type', '缺少 type');
    else if (item.type !== 'link' && item.type !== 'group') err(errors, 'INVALID_ENUM', path + '.type', '仅 link/group');
    validateTitle(item.title, path + '.title', errors);
    checkUrl(item.url, path + '.url', errors);
    checkImage(item.icon, path + '.icon', errors);
    validateIconText(item.iconText, path + '.iconText', errors);
    if (item.children !== undefined) {
      if (!Array.isArray(item.children)) err(errors, 'INVALID_TYPE', path + '.children', '须为数组');
      else {
        // P10：children 0..6 均合法（0 为编辑中间态，render 降级 link），无下限
        if (item.type === 'link' && item.children.length > 0) err(errors, 'INVALID_TYPE', path + '.children', 'link 不允许子项');
        if (item.children.length > CHILDREN_MAX) err(errors, 'OUT_OF_RANGE', path + '.children', '子项最多 6 个');
        for (var i = 0; i < item.children.length; i++) validateChild(item.children[i], path + '.children[' + i + ']', errors, ids);
      }
    }
  }

  function validateChild(c, path, errors, ids) {
    if (!isPlainObject(c)) { err(errors, 'INVALID_TYPE', path, '须为对象'); return; }
    validateId(c.id, path + '.id', ITEM_ID_RE, errors, ids);
    validateTitle(c.title, path + '.title', errors);
    checkUrl(c.url, path + '.url', errors);
    checkImage(c.icon, path + '.icon', errors);
    validateIconText(c.iconText, path + '.iconText', errors);
  }

  function validateIcons(icons, errors) {
    if (!isPlainObject(icons)) { err(errors, 'INVALID_TYPE', 'icons', '须为对象'); return; }
    if (!Array.isArray(icons.rows)) { err(errors, 'MISSING_REQUIRED', 'icons.rows', '须为数组'); return; }
    var rows = icons.rows;
    if (rows.length !== 2) err(errors, 'INVALID_TYPE', 'icons.rows', '须恰含 top/movie 两行');
    var seenRows = {}, found = {}, ids = {}, i, j;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i], path = 'icons.rows[' + i + ']';
      if (!isPlainObject(row)) { err(errors, 'INVALID_TYPE', path, '须为对象'); continue; }
      var rid = row.id;
      if (rid !== 'top' && rid !== 'movie') err(errors, 'UNKNOWN_ROW', path + '.id', '未知行 id');
      if (seenRows[rid]) err(errors, 'DUPLICATE_ID', path + '.id', '行 id 重复');
      seenRows[rid] = true; found[rid] = true;
      if (!Array.isArray(row.items)) { err(errors, 'INVALID_TYPE', path + '.items', '须为数组'); continue; }
      for (j = 0; j < row.items.length; j++) validateItem(row.items[j], path + '.items[' + j + ']', errors, ids);
    }
    if (!found['top']) err(errors, 'MISSING_REQUIRED', 'icons.rows', '缺少 top 行');
    if (!found['movie']) err(errors, 'MISSING_REQUIRED', 'icons.rows', '缺少 movie 行');
  }

  function validateEngine(e, path, errors, ids, counter) {
    if (!isPlainObject(e)) { err(errors, 'INVALID_TYPE', path, '须为对象'); return; }
    validateId(e.id, path + '.id', ENGINE_ID_RE, errors, ids);
    var isAi = (e.ai === true || e.id === 'ai');
    if (isAi) counter.n++;
    validateTitle(e.name, path + '.name', errors);
    if (isAi) {
      if (e.url !== '') err(errors, 'INVALID_URL', path + '.url', 'AI 伪引擎 url 须为空');
      if (e.param !== '') err(errors, 'INVALID_TYPE', path + '.param', 'AI 伪引擎 param 须为空');
    } else {
      checkUrl(e.url, path + '.url', errors);
      if (e.param === undefined) err(errors, 'MISSING_REQUIRED', path + '.param', '缺少参数名');
      else if (!isValidParam(e.param)) err(errors, 'INVALID_TYPE', path + '.param', '参数名非法');
    }
    if (e.ai !== undefined && typeof e.ai !== 'boolean') err(errors, 'INVALID_TYPE', path + '.ai', '须为布尔');
    if (e.ai === true && (e.id !== 'ai' || e.url !== '' || e.param !== '' || e.builtin !== true))
      err(errors, 'INVALID_TYPE', path, 'AI 伪引擎只读且不可伪造');
    if (typeof e.builtin !== 'boolean') err(errors, 'INVALID_TYPE', path + '.builtin', '须为布尔');
    if (e.extra !== undefined) {
      if (!isPlainObject(e.extra)) err(errors, 'INVALID_TYPE', path + '.extra', '须为对象');
      else {
        for (var k in e.extra) if (hasOwn(e.extra, k)) {
          if (!EXTRA_KEY_RE.test(k)) err(errors, 'INVALID_TYPE', path + '.extra.' + k, '键名非法');
          else {
            var val = e.extra[k];
            if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean')
              err(errors, 'INVALID_TYPE', path + '.extra.' + k, '值须为字符串/数字/布尔');
          }
        }
      }
    }
    if (e.suggest !== undefined && e.suggest !== null && e.suggest !== 'bing' && e.suggest !== 'baidu')
      err(errors, 'INVALID_ENUM', path + '.suggest', '仅 null/bing/baidu');
    if (e.placeholder !== undefined) {
      if (typeof e.placeholder !== 'string') err(errors, 'INVALID_TYPE', path + '.placeholder', '须为字符串');
      else if (e.placeholder.length > 120) err(errors, 'TOO_LONG', path + '.placeholder', '最多 120 字');
      else if (CTRL_RE.test(e.placeholder)) err(errors, 'UNSAFE_SCHEME', path + '.placeholder', '含控制字符');
    }
  }

  function validateSearch(search, errors) {
    if (!isPlainObject(search)) { err(errors, 'INVALID_TYPE', 'search', '须为对象'); return; }
    if (!Array.isArray(search.engines)) { err(errors, 'MISSING_REQUIRED', 'search.engines', '须为数组'); return; }
    var engines = search.engines;
    if (engines.length === 0) err(errors, 'MISSING_REQUIRED', 'search.engines', '至少 1 项');
    var ids = {}, engineIds = {}, counter = { n: 0 }, i;
    for (i = 0; i < engines.length; i++) {
      if (isPlainObject(engines[i]) && typeof engines[i].id === 'string') engineIds[engines[i].id] = true;
      validateEngine(engines[i], 'search.engines[' + i + ']', errors, ids, counter);
    }
    if (counter.n === 0) err(errors, 'MISSING_AI', 'search.engines', '缺少内置 AI 搜索伪引擎');
    else if (counter.n > 1) err(errors, 'INVALID_TYPE', 'search.engines', 'AI 搜索项重复');
    var hidden = [];
    if (search.hidden !== undefined) {
      if (!Array.isArray(search.hidden)) err(errors, 'INVALID_TYPE', 'search.hidden', '须为数组');
      else {
        for (i = 0; i < search.hidden.length; i++) {
          var h = search.hidden[i];
          if (typeof h !== 'string') err(errors, 'INVALID_TYPE', 'search.hidden[' + i + ']', '须为字符串');
          else if (!engineIds[h]) err(errors, 'INVALID_ENUM', 'search.hidden[' + i + ']', '隐藏的引擎 id 不存在');
          else hidden.push(h);
        }
      }
    }
    // P11：ai 允许被设为默认引擎（engineIds 含 ai）；ai/url/param 仍只读、不可删除
    var de = search.defaultEngine;
    if (de === undefined || de === null) err(errors, 'MISSING_REQUIRED', 'search.defaultEngine', '缺少默认引擎');
    else if (typeof de !== 'string') err(errors, 'INVALID_TYPE', 'search.defaultEngine', '须为字符串');
    else if (!engineIds[de]) err(errors, 'INVALID_ENUM', 'search.defaultEngine', '默认引擎不存在');
    else if (hidden.indexOf(de) !== -1) err(errors, 'INVALID_ENUM', 'search.defaultEngine', '默认引擎已被隐藏');
    if (typeof search.openInNewTab !== 'boolean') err(errors, 'INVALID_TYPE', 'search.openInNewTab', '须为布尔');
    if (typeof search.enableSuggest !== 'boolean') err(errors, 'INVALID_TYPE', 'search.enableSuggest', '须为布尔');
  }

  // P1 / 06 §2：bing 为可选段（兼容旧配置），存在则严格校验
  function validateBing(bing, errors) {
    if (bing === undefined) return;
    if (!isPlainObject(bing)) { err(errors, 'INVALID_TYPE', 'theme.bing', '须为对象'); return; }
    if (typeof bing.source !== 'string' || BING_SOURCES.indexOf(bing.source) === -1)
      err(errors, 'INVALID_ENUM', 'theme.bing.source', '来源非法');
    if (typeof bing.customApi !== 'string')
      err(errors, 'INVALID_TYPE', 'theme.bing.customApi', '须为字符串');
    else if (bing.customApi !== '' && !isValidHttpUrl(bing.customApi))
      err(errors, 'INVALID_URL', 'theme.bing.customApi', '仅支持 http/https 自定义接口');
    if (typeof bing.mkt !== 'string' || BING_MKTS.indexOf(bing.mkt) === -1)
      err(errors, 'INVALID_ENUM', 'theme.bing.mkt', '地区非法');
    if (typeof bing.resolution !== 'string' || BING_RESOLUTIONS.indexOf(bing.resolution) === -1)
      err(errors, 'INVALID_ENUM', 'theme.bing.resolution', '分辨率非法');
    if (bing.index !== 'random' &&
        (!isFiniteNum(bing.index) || Math.floor(bing.index) !== bing.index || bing.index < 0 || bing.index > 7))
      err(errors, 'OUT_OF_RANGE', 'theme.bing.index', '须为 0~7 整数或 random');
    if (typeof bing.refresh !== 'string' || BING_REFRESH.indexOf(bing.refresh) === -1)
      err(errors, 'INVALID_ENUM', 'theme.bing.refresh', '刷新频率非法');
    if (typeof bing.showCopyright !== 'boolean')
      err(errors, 'INVALID_TYPE', 'theme.bing.showCopyright', '须为布尔');
    if (bing.cache !== undefined) {
      if (!isPlainObject(bing.cache)) err(errors, 'INVALID_TYPE', 'theme.bing.cache', '须为对象');
      else {
        for (var i = 0; i < BING_CACHE_KEYS.length; i++) {
          var k = BING_CACHE_KEYS[i], v = bing.cache[k];
          if (v !== undefined) {
            if (typeof v !== 'string' || CTRL_RE.test(v) || v.length > URL_MAX)
              err(errors, 'INVALID_TYPE', 'theme.bing.cache.' + k, '须为字符串');
            else if (k === 'url' && v !== '' && DANGEROUS_RE.test(trimStr(v)))
              err(errors, 'UNSAFE_SCHEME', 'theme.bing.cache.url', '不安全的图片地址（cache 只存 URL，不存图片本体）');
          }
        }
      }
    }
  }

  function validateTheme(theme, errors) {
    if (!isPlainObject(theme)) { err(errors, 'INVALID_TYPE', 'theme', '须为对象'); return; }
    if (typeof theme.mode !== 'string' || THEME_MODES.indexOf(theme.mode) === -1)
      err(errors, 'INVALID_ENUM', 'theme.mode', '仅 default/image/color/gradient/bing');
    checkImage(theme.image, 'theme.image', errors);
    if (typeof theme.color !== 'string' || !COLOR_RE.test(theme.color))
      err(errors, 'INVALID_TYPE', 'theme.color', '颜色格式非法');
    if (typeof theme.gradient !== 'string' || !isValidGradient(theme.gradient))
      err(errors, 'INVALID_TYPE', 'theme.gradient', '渐变格式非法');
    if (!isFiniteNum(theme.blur) || theme.blur < 0 || theme.blur > 24)
      err(errors, 'OUT_OF_RANGE', 'theme.blur', '须在 0~24');
    if (!isFiniteNum(theme.overlay) || theme.overlay < 0 || theme.overlay > 0.8)
      err(errors, 'OUT_OF_RANGE', 'theme.overlay', '须在 0~0.8');
    if (typeof theme.overlayColor !== 'string' || !COLOR_RE.test(theme.overlayColor))
      err(errors, 'INVALID_TYPE', 'theme.overlayColor', '颜色格式非法');
    validateBing(theme.bing, errors);
  }

  function validateUi(ui, errors) {
    if (!isPlainObject(ui)) { err(errors, 'INVALID_TYPE', 'ui', '须为对象'); return; }
    if (typeof ui.hasCustomized !== 'boolean') err(errors, 'INVALID_TYPE', 'ui.hasCustomized', '须为布尔');
  }

  function validateRaw(obj) {
    var errors = [];
    if (!isPlainObject(obj)) { err(errors, 'INVALID_TYPE', 'root', '顶层须为对象'); return { ok: false, errors: errors }; }
    if (obj.version === undefined) err(errors, 'MISSING_REQUIRED', 'version', '缺少版本');
    else if (typeof obj.version === 'number' && obj.version > SCHEMA_VERSION)
      err(errors, 'UNSUPPORTED_VERSION', 'version', '版本高于本站支持');
    else if (obj.version !== SCHEMA_VERSION) err(errors, 'INVALID_VERSION', 'version', '版本须为 1');
    validateIcons(obj.icons, errors);
    validateSearch(obj.search, errors);
    validateTheme(obj.theme, errors);
    validateUi(obj.ui, errors);
    return { ok: errors.length === 0, errors: errors };
  }

  /* ------------------------------------------------------------------ *
   * coerce：宽松自愈，产出一定通过 validate 的 v1 对象
   * ------------------------------------------------------------------ */
  function coerceChild(rc, ids) {
    if (!isPlainObject(rc)) return null;
    var id = rc.id;
    if (typeof id !== 'string' || !ITEM_ID_RE.test(id) || ids[id]) return null;
    if (typeof rc.title !== 'string' || rc.title.length < 1 || rc.title.length > TITLE_MAX || CTRL_RE.test(rc.title)) return null;
    if (!isValidHttpUrl(rc.url)) return null;
    ids[id] = true;
    var out = { id: id, title: rc.title, url: rc.url, icon: '', iconText: '' };
    if (typeof rc.icon === 'string' && isValidImage(rc.icon)) out.icon = rc.icon;
    if (isValidIconText(rc.iconText)) out.iconText = rc.iconText;
    return out;
  }

  function coerceItem(ri, ids) {
    if (!isPlainObject(ri)) return null;
    var id = ri.id;
    if (typeof id !== 'string' || !ITEM_ID_RE.test(id) || ids[id]) return null;
    var type = (ri.type === 'group') ? 'group' : (ri.type === 'link' ? 'link' : null);
    if (!type) return null;
    if (typeof ri.title !== 'string' || ri.title.length < 1 || ri.title.length > TITLE_MAX || CTRL_RE.test(ri.title)) return null;
    if (!isValidHttpUrl(ri.url)) return null;
    ids[id] = true;
    var out = { id: id, type: type, title: ri.title, url: ri.url, icon: '', iconText: '' };
    if (typeof ri.icon === 'string' && isValidImage(ri.icon)) out.icon = ri.icon;
    if (isValidIconText(ri.iconText)) out.iconText = ri.iconText;
    if (type === 'group') {
      // P10：0 项合法（编辑中间态），不设下限
      var children = [];
      if (Array.isArray(ri.children)) {
        for (var i = 0; i < ri.children.length && children.length < CHILDREN_MAX; i++) {
          var c = coerceChild(ri.children[i], ids);
          if (c) children.push(c);
        }
      }
      out.children = children;
    }
    return out;                                     // link 不带 children
  }

  function coerceIcons(raw, def) {
    if (!isPlainObject(raw) || !Array.isArray(raw.rows)) return deepClone(def);
    var byId = {}, i, r;
    for (i = 0; i < raw.rows.length; i++) {
      r = raw.rows[i];
      if (isPlainObject(r) && (r.id === 'top' || r.id === 'movie') && !byId[r.id]) byId[r.id] = r;
    }
    var ids = {}, out = { rows: [] }, order = ['top', 'movie'];
    for (i = 0; i < order.length; i++) {
      var rid = order[i], rr = byId[rid], items = [];
      if (rr && Array.isArray(rr.items)) {
        for (var j = 0; j < rr.items.length; j++) {
          var ci = coerceItem(rr.items[j], ids);
          if (ci) items.push(ci);
        }
      }
      out.rows.push({ id: rid, items: items });
    }
    return out;
  }

  function coerceEngine(re, seen) {
    if (!isPlainObject(re)) return null;
    var id = re.id;
    if (typeof id !== 'string' || !ENGINE_ID_RE.test(id) || seen[id] || id === 'ai') return null;
    if (typeof re.name !== 'string' || re.name.length < 1 || re.name.length > 40 || CTRL_RE.test(re.name)) return null;
    if (!isValidHttpUrl(re.url)) return null;
    var param = isValidParam(re.param) ? re.param : 'q';   // P3：与 apply 共用 isValidParam
    var builtin = (typeof re.builtin === 'boolean') ? re.builtin : false;
    var out = { id: id, name: re.name, url: re.url, param: param, extra: {}, suggest: null, builtin: builtin };
    if (isPlainObject(re.extra)) {
      for (var k in re.extra) if (hasOwn(re.extra, k) && EXTRA_KEY_RE.test(k)) {
        var val = re.extra[k];
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') out.extra[k] = val;
      }
    }
    if (re.suggest === 'bing' || re.suggest === 'baidu') out.suggest = re.suggest;
    if (typeof re.placeholder === 'string' && re.placeholder.length <= 120 && !CTRL_RE.test(re.placeholder))
      out.placeholder = re.placeholder;
    seen[id] = true;
    return out;
  }

  function engineExists(engines, id) {
    for (var i = 0; i < engines.length; i++) if (engines[i].id === id) return true;
    return false;
  }

  function coerceSearch(raw, def) {
    var out = deepClone(def);
    if (!isPlainObject(raw)) return out;
    if (Array.isArray(raw.engines)) {
      var engines = [], seen = {}, aiAdded = false;
      for (var i = 0; i < raw.engines.length; i++) {
        var re = raw.engines[i];
        if (!isPlainObject(re)) continue;
        if (re.id === 'ai' || re.ai === true) {      // ai 只读，恒用内置定义
          if (!aiAdded) { engines.push(aiEngine()); aiAdded = true; }
          continue;
        }
        var ce = coerceEngine(re, seen);
        if (ce) engines.push(ce);
      }
      if (!aiAdded) engines.push(aiEngine());
      if (engines.length === 0) engines = deepClone(def.engines);
      out.engines = engines;
    }
    var hidden = [];
    if (Array.isArray(raw.hidden)) {
      for (var j = 0; j < raw.hidden.length; j++) {
        var h = raw.hidden[j];
        if (typeof h === 'string' && engineExists(out.engines, h) && hidden.indexOf(h) === -1) hidden.push(h);
      }
    }
    out.hidden = hidden;
    // P11：defaultEngine='ai' 合法（ai 恒在 engines）；仍不可指向不存在或已 hidden 的 id
    var de = (typeof raw.defaultEngine === 'string') ? raw.defaultEngine : 'bing';
    if (!engineExists(out.engines, de) || hidden.indexOf(de) !== -1) de = 'bing';
    if (!engineExists(out.engines, de) || hidden.indexOf(de) !== -1) {
      de = '';
      for (var k = 0; k < out.engines.length; k++)
        if (hidden.indexOf(out.engines[k].id) === -1) { de = out.engines[k].id; break; }
    }
    out.defaultEngine = de || 'bing';
    out.openInNewTab = (typeof raw.openInNewTab === 'boolean') ? raw.openInNewTab : false;
    out.enableSuggest = (typeof raw.enableSuggest === 'boolean') ? raw.enableSuggest : true;
    return out;
  }

  // P1 / 06 §2：脏数据逐字段回退到默认 bing 配置；cache 只允许字符串 URL，不存图片本体
  function coerceBing(raw, defBing) {
    var out = deepClone(defBing);
    if (!isPlainObject(raw)) return out;
    if (typeof raw.source === 'string' && BING_SOURCES.indexOf(raw.source) !== -1) out.source = raw.source;
    if (typeof raw.customApi === 'string' && (raw.customApi === '' || isValidHttpUrl(raw.customApi))) out.customApi = raw.customApi;
    if (typeof raw.mkt === 'string' && BING_MKTS.indexOf(raw.mkt) !== -1) out.mkt = raw.mkt;
    if (typeof raw.resolution === 'string' && BING_RESOLUTIONS.indexOf(raw.resolution) !== -1) out.resolution = raw.resolution;
    if (raw.index === 'random') out.index = 'random';
    else if (isFiniteNum(raw.index) && Math.floor(raw.index) === raw.index && raw.index >= 0 && raw.index <= 7) out.index = raw.index;
    if (typeof raw.refresh === 'string' && BING_REFRESH.indexOf(raw.refresh) !== -1) out.refresh = raw.refresh;
    if (typeof raw.showCopyright === 'boolean') out.showCopyright = raw.showCopyright;
    if (isPlainObject(raw.cache)) {
      var cache = {}, i, k, v;
      for (i = 0; i < BING_CACHE_KEYS.length; i++) {
        k = BING_CACHE_KEYS[i]; v = raw.cache[k];
        var badUrl = (k === 'url' && v !== '' && typeof v === 'string' && DANGEROUS_RE.test(trimStr(v)));
        cache[k] = (typeof v === 'string' && !CTRL_RE.test(v) && v.length <= URL_MAX && !badUrl) ? v : '';
      }
      out.cache = cache;
    }
    return out;
  }

  function coerceTheme(raw, def) {
    var out = deepClone(def);
    if (!isPlainObject(raw)) return out;
    if (typeof raw.mode === 'string' && THEME_MODES.indexOf(raw.mode) !== -1) out.mode = raw.mode;
    if (typeof raw.image === 'string' && isValidImage(raw.image)) out.image = raw.image;
    if (typeof raw.color === 'string' && COLOR_RE.test(raw.color)) out.color = raw.color;
    if (typeof raw.gradient === 'string' && isValidGradient(raw.gradient)) out.gradient = raw.gradient;
    if (isFiniteNum(raw.blur) && raw.blur >= 0 && raw.blur <= 24) out.blur = raw.blur;
    if (isFiniteNum(raw.overlay) && raw.overlay >= 0 && raw.overlay <= 0.8) out.overlay = raw.overlay;
    if (typeof raw.overlayColor === 'string' && COLOR_RE.test(raw.overlayColor)) out.overlayColor = raw.overlayColor;
    out.bing = coerceBing(raw.bing, out.bing);
    return out;
  }

  function coerceUi(raw, def) {
    var out = deepClone(def);
    if (isPlainObject(raw) && typeof raw.hasCustomized === 'boolean') out.hasCustomized = raw.hasCustomized;
    return out;
  }

  function coerce(raw) {
    var out;
    try { out = defaults(); } catch (e) { return defaults(); }
    if (!isPlainObject(raw)) return out;
    out.version = 1;                               // 未知/高版本一律只读降级为 v1
    try {
      out.icons = coerceIcons(raw.icons, out.icons);
      out.search = coerceSearch(raw.search, out.search);
      out.theme = coerceTheme(raw.theme, out.theme);
      out.ui = coerceUi(raw.ui, out.ui);
      var v = validateRaw(out);
      if (!v.ok) return defaults();                // 纵深兜底：恒返回合法对象
    } catch (e) { return defaults(); }
    return out;
  }

  function migrate(raw) { return raw; }           // v1 恒等；高版本只读降级由 coerce 完成，绝不回写

  /* ------------------------------------------------------------------ *
   * 存储适配器 / 状态
   * ------------------------------------------------------------------ */
  function memoryFallback() {
    var data = {};
    return {
      getItem: function (k) { return hasOwn(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; }
    };
  }

  function getGlobal() {
    if (typeof window !== 'undefined') return window;
    if (typeof globalThis !== 'undefined') return globalThis;
    if (typeof global !== 'undefined') return global;
    return this;
  }

  var store = null;
  var storageProbeOK = false;

  function resolveStore() {
    var g = getGlobal(), ls = null;
    try { ls = g && g.localStorage; } catch (e) { ls = null; }
    if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function' && typeof ls.removeItem === 'function') {
      store = ls;
      try {
        ls.setItem('__foryouos_settings_probe__', '1');
        ls.removeItem('__foryouos_settings_probe__');
        storageProbeOK = true;
      } catch (e) { storageProbeOK = false; }
    } else {
      store = memoryFallback();
      storageProbeOK = false;
    }
  }

  function classifyStorageError(e) {
    var name = e && e.name, code = e && e.code;
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014)
      return 'QUOTA_EXCEEDED: 浏览器本地存储已满，本次设置未能保存。请改用更小的背景图，或把背景改成纯色/渐变/图片网址。';
    if (name === 'SecurityError' || storageProbeOK === false)
      return 'STORAGE_DISABLED: 当前浏览器禁用了本地存储（如无痕/隐私模式），设置只在本次打开期间有效，关闭后不会保留。请关闭无痕模式后重试。';
    return 'STORAGE_ERROR: 本地存储写入失败，本次设置未能保存，请稍后重试。';
  }

  var current;
  var listeners = [];

  function load() {                                // 启动读取：不写盘、不广播
    var raw = null;
    try { raw = store.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (raw == null) { current = defaults(); return; }
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { current = defaults(); return; }   // 不删除坏键
    try { current = coerce(migrate(parsed)); } catch (e) { current = defaults(); }
  }

  function broadcast(config, section, source) {
    var payload = { config: deepClone(config), section: section, source: source };
    var snap = listeners.slice(), i;
    for (i = 0; i < snap.length; i++) {
      try { snap[i](payload.config, payload); } catch (e) {}
    }
    if (typeof document !== 'undefined' && document && typeof document.dispatchEvent === 'function') {
      try {
        var ev;
        if (typeof CustomEvent === 'function') ev = new CustomEvent('fy:settings-change', { detail: payload });
        else { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('fy:settings-change', false, false, payload); }
        document.dispatchEvent(ev);
      } catch (e) {}
    }
  }

  // P1：旧配置（无 theme.bing）导入后也保证写盘配置含完整 bing 段，get() 恒可用
  function ensureThemeBing(next) {
    if (isPlainObject(next.theme) && !isPlainObject(next.theme.bing)) {
      next.theme.bing = deepClone(DEFAULTS_TEMPLATE.theme.bing);
    }
  }

  function commit(next, section, source) {          // 唯一写盘点，原子
    var text;
    ensureThemeBing(next);
    try { text = JSON.stringify(next); } catch (e) { return { ok: false, error: 'VALIDATION_FAILED: 配置不可序列化' }; }
    try { store.setItem(STORAGE_KEY, text); } catch (e) {
      return { ok: false, error: classifyStorageError(e) };   // 失败：不替换 current、不广播
    }
    current = next;
    broadcast(current, section, source);
    return { ok: true };
  }

  function onStorage(e) {                           // 只读重载，绝不回写（防回环）
    if (!e || e.key !== STORAGE_KEY) return;
    if (e.storageArea && store && e.storageArea !== store) return;
    if (e.newValue === e.oldValue) return;
    var next;
    if (e.newValue == null) next = defaults();
    else {
      try { next = coerce(migrate(JSON.parse(e.newValue))); } catch (err) { next = defaults(); }
    }
    current = next;
    broadcast(current, '*', 'storage');
  }

  /* ------------------------------------------------------------------ *
   * 公开 API 实现
   * ------------------------------------------------------------------ */
  function shallowMerge(base, extra) {              // 深度 1：直属属性浅覆盖
    var out = {}, k;
    for (k in base) if (hasOwn(base, k)) out[k] = base[k];
    for (k in extra) if (hasOwn(extra, k)) out[k] = deepClone(extra[k]);
    return out;
  }

  function patchImpl(section, partial) {
    if (SECTIONS.indexOf(section) === -1) return { ok: false, error: 'INVALID_ARGUMENT: section 非法' };
    if (!isPlainObject(partial)) return { ok: false, error: 'INVALID_ARGUMENT: partial 须为对象' };
    var keys = Object.keys(partial), i;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'version') return { ok: false, error: 'INVALID_ARGUMENT: 不允许修改 version' };
      if (SECTIONS.indexOf(k) !== -1 && k !== section) return { ok: false, error: 'INVALID_ARGUMENT: 跨 section 键 ' + k };
    }
    var next = deepClone(current);
    next[section] = shallowMerge(next[section], partial);
    var v = validateRaw(next);
    if (!v.ok) return { ok: false, error: 'VALIDATION_FAILED: ' + (v.errors[0] || '配置不合法') };
    return commit(next, section, 'patch');
  }

  function setAllImpl(obj) {
    if (!isPlainObject(obj)) return { ok: false, error: 'VALIDATION_FAILED: 顶层须为对象' };
    if (typeof obj.version === 'number' && obj.version > SCHEMA_VERSION)
      return { ok: false, error: 'UNSUPPORTED_VERSION: 配置版本(' + obj.version + ')高于本站支持(' + SCHEMA_VERSION + ')，请用更新版站点导出后再导入。现有配置未改动。' };
    var v = validateRaw(obj);
    if (!v.ok) return { ok: false, error: 'VALIDATION_FAILED: ' + (v.errors[0] || '配置不合法') };
    return commit(deepClone(obj), '*', 'import');
  }

  function resetImpl(section, hasSection) {
    var next;
    if (hasSection) {
      if (SECTIONS.indexOf(section) === -1) return { ok: false, error: 'INVALID_ARGUMENT: section 非法' };
      next = deepClone(current);
      next[section] = defaults()[section];
      return commit(next, section, 'reset');
    }
    return commit(defaults(), '*', 'reset');        // 写回默认 JSON，不用 removeItem
  }

  function importImpl(text) {
    if (typeof text !== 'string') return { ok: false, error: 'PARSE_ERROR: 输入不是字符串，现有配置未改动。' };
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) {
      return { ok: false, error: 'PARSE_ERROR: 导入失败：文件不是有效的配置 JSON，现有配置未改动。' };
    }
    if (!isPlainObject(parsed)) return { ok: false, error: 'PARSE_ERROR: 导入失败：配置顶层须为对象，现有配置未改动。' };
    if (typeof parsed.version === 'number' && parsed.version > SCHEMA_VERSION)
      return { ok: false, error: 'UNSUPPORTED_VERSION: 导入失败：该配置版本(' + parsed.version + ')高于本站支持(' + SCHEMA_VERSION + ')，请用对应版本站点导出后再导入。现有配置未改动。' };
    var v = validateRaw(parsed);
    if (!v.ok) return { ok: false, error: 'VALIDATION_FAILED: ' + (v.errors[0] || '配置不合法') };
    return setAllImpl(parsed);
  }

  function subscribeImpl(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    var active = true;
    return function () {
      if (!active) return;
      active = false;
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    isValidParam: isValidParam,                     // P3：供 FYSearchCustomize.apply 共用
    defaults: function () { try { return defaults(); } catch (e) { return deepClone(DEFAULTS_TEMPLATE); } },
    get: function () { try { return deepClone(current); } catch (e) { return defaults(); } },
    getSection: function (name) {
      try { return SECTIONS.indexOf(name) === -1 ? undefined : deepClone(current[name]); }
      catch (e) { return undefined; }
    },
    patch: function (section, partial, meta) {     // meta 为 v1 预留参数，完全忽略
      try { return patchImpl(section, partial); } catch (e) { return { ok: false, error: 'STORAGE_ERROR: 内部错误' }; }
    },
    setAll: function (obj) {
      try { return setAllImpl(obj); } catch (e) { return { ok: false, error: 'VALIDATION_FAILED: 内部错误' }; }
    },
    reset: function (section) {
      var hasSection = arguments.length > 0 && section !== undefined && section !== null;
      try { return resetImpl(section, hasSection); } catch (e) { return { ok: false, error: 'STORAGE_ERROR: 内部错误' }; }
    },
    subscribe: function (fn) {
      try { return subscribeImpl(fn); } catch (e) { return function () {}; }
    },
    validate: function (obj) {
      try { return validateRaw(obj); } catch (e) { return { ok: false, errors: ['INVALID_TYPE root: 校验内部错误'] }; }
    }
  };
  api['export'] = function () {
    try { return JSON.stringify(current, null, 2); } catch (e) { return '{}'; }
  };
  api['import'] = function (text) {
    try { return importImpl(text); } catch (e) { return { ok: false, error: 'PARSE_ERROR: 导入失败，现有配置未改动。' }; }
  };

  /* ------------------------------------------------------------------ *
   * 初始化与挂载
   * ------------------------------------------------------------------ */
  resolveStore();
  load();
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    try { window.addEventListener('storage', onStorage, false); } catch (e) {}
  }

  var root = getGlobal();
  try { if (root) root.FYSettings = api; } catch (e) {}
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})();
