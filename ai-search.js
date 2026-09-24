/*!
 * foryouos 导航页 · AI 搜索模块（PC 端）
 * ---------------------------------------------------------------------------
 * 做什么
 *   用户自带 DeepSeek API key（BYOK），输入关键词后由 DeepSeek 的联网检索能力
 *   跨平台取回**真实网页**，再由模型按「内容质量 + 相关度」重排，
 *   结果以搜索引擎的卡片列表形态从右侧抽屉滑出，覆盖背景插画。
 *
 * 为什么能纯静态跑（不需要后端）
 *   DeepSeek 的 API 对任意 Origin 回显 Access-Control-Allow-Origin，
 *   浏览器可以直接跨域 POST，因此本模块全部在前端完成，key 只存在用户本机。
 *
 * 两个必须知道的现实约束
 *   1. 只有 Responses API（POST /responses）带 web_search 工具；
 *      Chat Completions（/chat/completions）没有检索能力，
 *      若误接那条链路，模型会「凭记忆回答」并编造链接 —— 这是最难排查的坑。
 *   2. 官方**不支持指定检索平台**，只能在提示词里用 site: 语法引导模型分别去
 *      必应 / 百度 / 搜狗 / 微信公众号 / 知乎 检索。所以「跨平台覆盖」是概率性的，
 *      不保证每个平台都有结果，代码里对这一点做了空值兜底。
 *
 * 与站点其它部分的约定
 *   - 抽屉容器 #ai-panel、卡片模板 #ai-card-tpl 由 index.html 提供；
 *     本模块只负责 clone 模板 + 填字段，所以卡片样式在 CSS 里改一处即全局生效。
 *   - mobile.html 没有 #ai-panel，search.js 会自动把「AI 搜索」这个引擎从标签里摘掉。
 * ---------------------------------------------------------------------------
 */
(function (global, doc) {
  'use strict';

  /* ============================== 配置区 ============================== */
  var CFG = {
    endpoint: 'https://api.deepseek.com/responses',
    /**
     * 联网检索可用的模型候选，**按"更可能支持"排序，依次尝试**。
     *
     * 为什么要做成候选 + 自动尝试：
     *   实测 `deepseek-flash` 上即便把 tools / tool_choice 都传齐、instructions 与 input
     *   也做了分离，服务端依然**一次工具都不执行**（output 只有 reasoning / message，
     *   usage 里没有 server_tool_use 计数）；官方 Responses 兼容性文档的 Tools 表也把
     *   `web_search` 列为 Ignored —— 文档与现象是一致的。
     *   而公开实测显示 **`deepseek-v4-pro`** 能真正执行并把次数记进
     *   `usage.server_tool_use.web_search_requests`。
     * 所以这里按顺序试：哪个模型真的触发了检索，就用 localStorage 记住它，
     * 下次直接用。只在"一次都没搜"时才会往下试，真搜到了就不会重复花钱。
     */
    modelCandidates: ['deepseek-v4-pro', 'deepseek-flash'],
    /** 记住"哪个模型真的能搜"的键名 */
    modelStorage: 'foryouos.ai.model',
    /** 是否允许自动换模型重试（关掉就只用第一个候选） */
    autoTryModels: true,
    /**
     * 联网检索工具名。官方 create-response 里 tool_choice.type 的允许值是
     * [function, web_search, web_search_2025_08_26]，所以这个字段是可换的 ——
     * 若某个名字被服务端忽略，换另一个试。
     */
    searchTool: 'web_search',
    /**
     * 是否**强制**模型执行联网检索。
     *
     * 必须为 true —— 这是实测踩出来的：只给 tools 不指定 tool_choice 时，
     * 是否真的去搜由模型自己决定，而它可能选择不搜（实测 output 里只有
     * reasoning / message，没有 web_search_call）。请求成功、格式全对，
     * 但模型手里根本没有检索结果，再叠加"绝不许编造"的约束，
     * 它就只能回一句"未实际联网检索到结果，按要求不编造"。
     *
     * 官方文档给的强制写法是 tool_choice: {type:'web_search'}，
     * 并明确要求此时 tools 里必须含 web_search，否则返回 400 —— 两者要成对出现。
     */
    forceSearch: true,
    /** key 存在 localStorage 的键名 */
    keyStorage: 'foryouos.ai.key',
    /** 上一次的查询记忆（便于刷新后回看） */
    queryStorage: 'foryouos.ai.query',
    /** 联网检索比普通问答慢得多，超时给宽一些 */
    timeout: 120000,
    /** 最多展示多少条 */
    maxItems: 12,
    /** 跨平台引导：不在这些站点里强行凑数，交给模型按实际检索结果决定 */
    platforms: [
      { name: '必应', site: '' },
      { name: '百度', site: '' },
      { name: '搜狗', site: 'sogou.com' },
      {
        name: '微信公众号',
        site: 'weixin.sogou.com',
        /* ⚠️ 微信这一路**必须走搜狗的微信搜索入口**，不要用 site:mp.weixin.qq.com。
           原因：公众号是封闭生态，微信文章不被通用搜索引擎收录，
           直接限定 mp.weixin.qq.com 基本搜不到东西；
           而搜狗有微信的数据授权，它的微信搜索（weixin.sogou.com/weixin?type=2&query=…）
           才是能拿到公众号文章的入口。用户明确指定了这个接口。 */
        hint: '微信文章不被通用搜索引擎收录，请改走**搜狗的微信搜索**入口' +
              '（weixin.sogou.com/weixin，type=2 表示搜文章）'
      },
      { name: '知乎', site: 'zhihu.com' }
    ]
  };
  /* =================================================================== */

  var panel = null, listBox = null, statusBox = null, barQuery = null;
  var cardTpl = null;
  var state = { keyword: '', loading: false, items: [], error: '' };
  if (typeof global.__fyAiInit === 'undefined') { global.__fyAiInit = false; }

  /* ------------------------------ 工具 ------------------------------ */

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** 从 URL 里取域名，失败返回空串 */
  function hostOf(url) {
    try { return new global.URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  /** 只允许 http/https，挡掉模型偶尔给出的 pseudo 链接 */
  function safeUrl(url) {
    var u = String(url == null ? '' : url).trim();
    return /^https?:\/\//i.test(u) ? u : '';
  }

  function store(key, value) {
    try {
      if (value === null) { global.localStorage.removeItem(key); }
      else { global.localStorage.setItem(key, value); }
    } catch (e) { /* 隐私模式忽略 */ }
  }

  function read(key) {
    try { return global.localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  /* --------------------------- key 的管理 --------------------------- */

  function getKey() { return read(CFG.keyStorage).trim(); }
  function setKey(v) { store(CFG.keyStorage, String(v || '').trim()); }
  function clearKey() { store(CFG.keyStorage, null); }
  function maskKey(k) {
    if (!k) { return ''; }
    return k.slice(0, 6) + '••••••••••••' + k.slice(-4);
  }

  /* --------------------------- 模型的选择 --------------------------- */

  /** 这次该先用哪个模型：优先上次真的搜到了的那个，其次按候选顺序 */
  function currentModel() {
    var saved = read(CFG.modelStorage);
    if (saved && CFG.modelCandidates.indexOf(saved) >= 0) { return saved; }
    return CFG.modelCandidates[0];
  }

  /** 记住"这个模型真的触发了检索"，下次直接用 */
  function rememberModel(m) { store(CFG.modelStorage, m); }

  /** 取下一个还没试过的候选；没有了返回 null */
  function nextUntriedModel(tried) {
    for (var i = 0; i < CFG.modelCandidates.length; i++) {
      if (tried.indexOf(CFG.modelCandidates[i]) < 0) { return CFG.modelCandidates[i]; }
    }
    return null;
  }

  /* ---------------------------- 提示词构造 ---------------------------- */

  /**
   * 任务说明 —— 放进请求的 instructions 字段（服务端会把它插成第一条 system message）。
   *
   * ⚠️ **刻意不把用户关键词塞进来**，这是被"不搜"坑出来的：
   * 深寻的服务端检索是**模型自主决定搜不搜**的（tool_choice 默认 auto）。
   * 如果把整段任务说明（"你是采集器…请做联网检索…"）当作 input，
   * 模型会把它读成一个"格式化任务"，判断无需实时信息，于是压根不去检索；
   * 而把关键词本身作为 input 的一个**直接提问**，它才会触发检索。
   * instructions 放长说明、input 只放关键词 —— 这也正是官方示例的结构。
   */
  function buildInstructions() {
    var lines = [];
    lines.push('你是搜索结果的采集与质量分析器。用户会给你一个关键词，');
    lines.push('你必须**先联网检索**再回答，并优先覆盖这些中文平台（能用 site: 限定的就分别检索一次，再合并去重）：');
    for (var i = 0; i < CFG.platforms.length; i++) {
      var p = CFG.platforms[i];
      lines.push('  ' + p.name + (p.site ? '（site:' + p.site + '）' : '（通用网页）') +
                 (p.hint ? ' —— ' + p.hint : ''));
    }
    lines.push('');
    lines.push('检索完成后，按「内容质量 + 与关键词的相关度」重新排序。');
    lines.push('');
    lines.push('硬性要求：');
    lines.push('1. 只输出你**真实检索到**的网页，绝不允许凭记忆编造标题或链接；');
    lines.push('2. 某个平台没检索到就跳过，不要为凑数放低标准；');
    lines.push('3. 整体没检索到任何结果时，items 返回空数组；');
    lines.push('4. url 必须是 https:// 或 http:// 开头的完整网址。');
    lines.push('');
    lines.push('输出格式：**只输出一个 JSON 对象**，不要任何解释文字、不要 markdown 代码围栏：');
    lines.push('{"items":[{"title":"网页标题","url":"完整网址","site":"来源域名或平台名",' +
               '"snippet":"一句话摘要，40 字内","score":85,"reason":"简短排序理由，20 字内"}],' +
               '"summary":"对这批结果的整体判断，60 字内"}');
    lines.push('最多 ' + CFG.maxItems + ' 条，按 score 从高到低。score 是 0-100 的整数。');
    return lines.join('\n');
  }

  /* --------------------------- 响应体解析 --------------------------- */

  /** 把响应里的正文文本捞出来（output_text 优先，失败再遍历 output[]） */
  function readOutputText(data) {
    if (!data) { return ''; }
    if (typeof data.output_text === 'string' && data.output_text) { return data.output_text; }
    var out = data.output || [], buf = [];
    for (var i = 0; i < out.length; i++) {
      var it = out[i];
      if (!it || it.type !== 'message' || !it.content) { continue; }
      for (var j = 0; j < it.content.length; j++) {
        var c = it.content[j];
        if (c && c.text) { buf.push(c.text); }
      }
    }
    return buf.join('\n');
  }

  /**
   * 从文本里抠出 JSON。模型常把 JSON 包在 ```json 围栏里或前后带一句话，
   * 所以先剥围栏、再取第一个 { 到最后一个 }。
   */
  function extractJson(text) {
    if (!text) { return null; }
    var t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    var s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s < 0 || e <= s) { return null; }
    try { return JSON.parse(t.slice(s, e + 1)); } catch (err) { return null; }
  }

  /**
   * 数一数响应里到底执行了几次联网检索。
   *
   * 这条诊断是整个模块最关键的判断依据，原因是：
   *   **DeepSeek 对不认识的参数是静默忽略的**（官方明确说过"传了不认识的参数不会报错、自动忽略"）。
   *   所以如果服务端没有接受 tools 里的 web_search，请求照样成功、模型照样回答，
   *   只是它手里没有检索结果，只能凭记忆答 —— 再叠加我们"绝不许编造"的硬约束，
   *   它就如实回一句"未实际联网检索到结果，按要求不编造"。
   *
   *   这和"真的执行了检索但没找到合适的网页"是**完全不同的两件事**：
   *   前者要改模型/参数，后者只要换个关键词。所以必须在界面上分开提示。
   */
  function countWebSearch(data) {
    var out = (data && data.output) || [], n = 0;
    for (var i = 0; i < out.length; i++) {
      var t = (out[i] && out[i].type) || '';
      if (t.indexOf('web_search') >= 0) { n++; }
    }
    return n;
  }

  /** 兜底：模型没按 JSON 输出时，至少把纯文本当成一段摘要展示 */
  function asFallbackItems(text) {
    var t = String(text || '').trim();
    if (!t) { return { items: [], summary: '' }; }
    return { items: [], summary: t.slice(0, 600) };
  }

  /** 规范化：过滤非法项、去重、按 score 排序、截断条数 */
  function normalize(data) {
    var raw = (data && data.items) || [];
    var seen = {}, out = [];
    for (var i = 0; i < raw.length; i++) {
      var it = raw[i] || {};
      var url = safeUrl(it.url);
      var title = String(it.title || '').trim();
      if (!url || !title) { continue; }
      var key = url.replace(/[#?].*$/, '');
      if (seen[key]) { continue; }
      seen[key] = 1;
      var score = parseInt(it.score, 10);
      out.push({
        title: title,
        url: url,
        host: hostOf(url),
        site: String(it.site || hostOf(url) || '').trim(),
        snippet: String(it.snippet || '').trim(),
        reason: String(it.reason || '').trim(),
        score: isNaN(score) ? null : Math.max(0, Math.min(100, score))
      });
    }
    out.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    return { items: out.slice(0, CFG.maxItems), summary: String((data && data.summary) || '').trim() };
  }

  /* ------------------------------ 渲染 ------------------------------ */

  function setStatus(html, kind) {
    if (!statusBox) { return; }
    statusBox.className = 'ai-status' + (kind ? ' is-' + kind : '');
    statusBox.innerHTML = html || '';
    statusBox.hidden = !html;
  }

  function clearResults() {
    state.items = [];
    state.error = '';
    state.keyword = '';
    store(CFG.queryStorage, null);
    if (listBox) { listBox.innerHTML = ''; }
    if (barQuery) { barQuery.textContent = ''; }
    setStatus('');
  }

  /** 按模板插入一条结果卡片（卡片结构来自 #ai-card-tpl，样式改 CSS 即可） */
  function insertCard(item, index) {
    if (!cardTpl || !listBox) { return; }
    var frag = cardTpl.content.cloneNode(true);
    var link = frag.querySelector('.ai-card-link');
    var favi = frag.querySelector('.ai-card-favicon');
    var badge = frag.querySelector('.ai-card-badge');
    var title = frag.querySelector('.ai-card-title');
    var url = frag.querySelector('.ai-card-url');
    var snip = frag.querySelector('.ai-card-snippet');
    var reason = frag.querySelector('.ai-card-reason');
    var score = frag.querySelector('.ai-card-score');
    var rank = frag.querySelector('.ai-card-rank');

    link.href = item.url;
    link.setAttribute('aria-label', item.title);
    if (title) { title.textContent = item.title; }
    if (url) { url.textContent = item.host || item.site; }
    if (snip) {
      if (item.snippet) { snip.textContent = item.snippet; }
      else { snip.remove(); }
    }
    if (reason) {
      if (item.reason) { reason.textContent = '排序理由：' + item.reason; }
      else { reason.remove(); }
    }
    if (score) {
      score.textContent = item.score == null ? '' : item.score;
      score.hidden = item.score == null;
    }
    if (rank) { rank.textContent = String(index + 1).padStart(2, '0'); }

    // 来源徽标：先试站点自己的 favicon，取不到就退回域名首字母
    var letter = (item.host || item.site || '?').slice(0, 1).toUpperCase();
    if (badge) { badge.textContent = letter; }
    if (favi && item.host) {
      favi.src = 'https://' + item.host + '/favicon.ico';
      favi.addEventListener('error', function () {
        favi.remove();
        if (badge) { badge.hidden = false; }
      });
    } else if (favi) {
      favi.remove();
      if (badge) { badge.hidden = false; }
    }

    frag.querySelector('.ai-card').style.setProperty('--i', String(index));
    listBox.appendChild(frag);
  }

  function renderAll(result, keyword, searched, outTypes, usageText, tried, queries) {
    state.items = result.items;
    state.keyword = keyword;
    if (barQuery) { barQuery.textContent = keyword; }
    if (listBox) { listBox.innerHTML = ''; }

    for (var i = 0; i < result.items.length; i++) { insertCard(result.items[i], i); }

    /* ---------- 情况一：服务端压根没执行检索（最需要说清的一种） ---------- */
    if (!searched) {
      // 把响应里实际的 output 类型与 usage 直接显示出来 —— 不用开控制台就能看着排查
      var shown = '<br><span class="ai-hint">本次响应的 output 项类型：' +
                  '<code>' + esc(outTypes || '(空)') + '</code>' +
                  '（正常联网检索时这里应当出现 <code>web_search_call</code>）' +
                  (usageText ? '；usage：<code>' + esc(usageText) + '</code>' : '') +
                  '；完整原始响应可在控制台查看：<code>__fyAiLastResponse</code></span>';
      if (result.items.length) {
        // 没检索却返回了链接 —— 这些链接很可能是模型凭记忆拼的，必须警示而不是当成结果展示
        setStatus('⚠️ 这次**没有真正联网检索**（服务端未执行 web_search 工具），' +
          '下面这些链接来自模型的记忆、**不保证真实可达**，请自行核实。' +
          shown + '<br><span class="ai-hint">' + diagHint(tried) + '</span>', 'warn');
      } else {
        setStatus('⚠️ 这次**没有真正联网检索** —— 服务端没有执行 web_search 工具，' +
          '模型手里没有检索结果，在"不许编造"的约束下它就如实回复了没找到。' +
          '<br><span class="ai-hint">注意这是「没搜」而不是「没搜到」，换个关键词也没用。' +
          diagHint(tried) + '</span>' + shown, 'error');
      }
      return;
    }

    /* ---------- 情况二：检索执行了，只是没找到可用网页 ---------- */
    if (!result.items.length) {
      var tip = '已执行 ' + searched + ' 次联网检索，但没有拿到可用的网页。' +
                '换个说法、更具体的关键词，或减少平台限定再试。';
      if (result.summary) { tip += '<br>' + esc(result.summary); }
      setStatus(tip, 'empty');
      return;
    }

    /* ---------- 情况三：正常拿到结果 ---------- */
    var head = '共 ' + result.items.length + ' 条，已按内容质量与相关度排序' +
               '（执行了 ' + searched + ' 次联网检索）';
    if (result.summary) { head += '。' + esc(result.summary); }
    /* 把模型实际用过的检索词摊开给用户看 —— 平台的 site: 引导是否生效，看这里最直接。
       服务端不暴露它用的是哪家搜索引擎，所以这串 queries 是唯一能看到"它怎么搜的"的地方。 */
    var extra = '';
    if (queries && queries.length) {
      var li = '';
      for (var q = 0; q < queries.length; q++) { li += '<li>' + esc(queries[q]) + '</li>'; }
      extra = '<details class="ai-queries"><summary>它实际用过的 ' + queries.length +
              ' 个检索词（平台引导是否生效看这里）</summary><ul>' + li + '</ul></details>';
    }
    setStatus('<p class="ai-note">' + head + '</p>' + extra, 'ok');
  }

  /** 把 usage 里的关键计数抽出来 —— 联网检索是按次数计费的，这里能看出到底搜没搜 */
  function describeUsage(data) {
    var u = (data && data.usage) || {};
    var bits = [];
    if (u.input_tokens != null) { bits.push('输入 ' + u.input_tokens); }
    if (u.output_tokens != null) { bits.push('输出 ' + u.output_tokens); }
    // 若服务端回了联网检索的次数（不同实现字段名不同，逐个找一遍）
    var st = u.server_tool_use || u.tool_usage || {};
    for (var k in st) {
      if (Object.prototype.hasOwnProperty.call(st, k)) { bits.push(k + ' ' + st[k]); }
    }
    var od = u.output_tokens_details || {};
    if (od.reasoning_tokens) { bits.push('其中思考 ' + od.reasoning_tokens); }
    return bits.join(' / ');
  }

  /** 「没搜」时给出的排查提示 + 怎么把原始响应调出来看 */
  function diagHint(tried) {
    var list = (tried && tried.length) ? tried.join(' → ') : CFG.modelCandidates.join(' / ');
    return '已把 tools 与 tool_choice 成对传齐，并把长说明放进了 instructions、input 只留关键词；' +
           '联网工具也已依次在模型 <code>' + esc(list) + '</code> 上试过。' +
           '若这些都没让 output 里出现 <code>web_search_call</code>，' +
           '基本可以判定该 key / 账号（或当前端点上）尚未开放服务端联网检索 —— ' +
           '下一步需要换一个真正返回搜索结果的搜索 API（如博查 / Tavily），' +
           '但那会是**第二个 key**，要不要做由你定。';
  }

  /**
   * 把模型**实际用过的检索词**与它主动打开的页面收集出来。
   *
   * 这是回答"它到底怎么搜的"唯一的实证来源。要点：
   *   · DeepSeek 的检索在**服务端**执行，客户端只拿到「动作记录」；
   *   · 它**不暴露用的是哪家搜索引擎** —— 所以你没法指定"用必应还是百度",
   *     我们的 site: 引导最终是通过**影响它生成的这些 queries**来间接生效的；
   *   · search 动作带一组 queries（模型自己拟的检索词，常常多路并行），
   *     open_page 动作带它决定深入打开的 URL。
   * 把这串列出来，就能直接看出平台引导有没有被采纳。
   */
  function collectQueries(data) {
    var out = (data && data.output) || [], res = [];
    for (var i = 0; i < out.length; i++) {
      var it = out[i];
      if (!it || String(it.type || '').indexOf('web_search') < 0) { continue; }
      var act = it.action || {};
      var qs = act.queries || [];
      for (var j = 0; j < qs.length; j++) {
        var q = String(qs[j] || '').trim();
        // 服务端会在 query 尾部拼一个自己的回调标记，展示时剥掉
        q = q.replace(/[\s,]*ws_call_id=\S*\s*$/, '').trim();
        if (q && res.indexOf(q) < 0) { res.push(q); }
      }
      if (act.url) {
        var u = String(act.url).replace(/#?ws_call_id=[^#\s]*/g, '').trim();
        if (u && res.indexOf(u) < 0) { res.push('（深入打开）' + u); }
      }
    }
    return res;
  }

  /** 把响应里 output 的项类型列出来 —— 直接显示在界面上，不用开控制台就能看着排查 */
  function describeOutput(data) {
    var out = (data && data.output) || [];
    if (!out.length) { return '(output 为空)'; }
    var types = [];
    for (var i = 0; i < out.length; i++) {
      types.push((out[i] && out[i].type) || '?');
    }
    return types.join(' / ');
  }

  /* ---------------------------- key 设置区 ---------------------------- */

  function renderKeyGate() {
    if (listBox) { listBox.innerHTML = ''; }
    setStatus(
      '<div class="ai-gate">' +
        '<p class="ai-gate-title">先填一把 DeepSeek API Key</p>' +
        '<p class="ai-gate-desc">Key 只保存在<b>你这台设备的浏览器</b>里（localStorage），' +
        '本站不上传、不收集。它会以 <code>Authorization</code> 头直接发往 api.deepseek.com。</p>' +
        '<div class="ai-gate-row">' +
          '<input type="password" class="ai-key-input" id="ai-key-input" ' +
          'placeholder="sk-..." autocomplete="off" spellcheck="false" aria-label="DeepSeek API Key">' +
          '<button type="button" class="ai-key-save" id="ai-key-save">保存并开始</button>' +
        '</div>' +
        '<p class="ai-gate-tip">在 platform.deepseek.com 的「API Keys」里创建；' +
        '建议单独建一把<b>低额度</b>的 key 专供这里使用。' +
        '注意：输入内容会发送给 DeepSeek，请勿检索敏感信息。</p>' +
      '</div>', 'gate');

    var input = doc.getElementById('ai-key-input');
    var save = doc.getElementById('ai-key-save');
    function doSave() {
      var v = (input && input.value || '').trim();
      if (!v) { if (input) { input.focus(); } return; }
      setKey(v);
      renderKeyState();
      if (state.keyword) { ask(state.keyword); }
    }
    if (save) { save.addEventListener('click', doSave); }
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doSave(); }
      });
      input.focus();
    }
  }

  /** 已配置 key 时的顶部状态条 */
  function renderKeyState() {
    var bar = panel && panel.querySelector('.ai-keybar');
    if (!bar) { return; }
    var k = getKey();
    if (!k) { bar.innerHTML = ''; bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = '<span class="ai-key-dot" aria-hidden="true"></span>' +
      '<span class="ai-key-mask">' + esc(maskKey(k)) + '</span>' +
      '<button type="button" class="ai-key-clear" id="ai-key-clear">更换</button>';
    var btn = doc.getElementById('ai-key-clear');
    if (btn) {
      btn.addEventListener('click', function () {
        clearKey();
        renderKeyState();
        renderKeyGate();
      });
    }
  }

  /* ------------------------------ 主流程 ------------------------------ */

  function open() {
    if (!panel) { return; }
    panel.hidden = false;
    // 下一帧再加 class，保证 transition 生效
    global.requestAnimationFrame(function () { panel.classList.add('is-open'); });
    doc.body.classList.add('ai-open');
  }

  function close() {
    if (!panel) { return; }
    panel.classList.remove('is-open');
    doc.body.classList.remove('ai-open');
    global.setTimeout(function () {
      if (!panel.classList.contains('is-open')) { panel.hidden = true; }
    }, 260);
  }

  function ask(keyword) {
    var kw = String(keyword || '').trim();
    if (!kw) { return; }
    state.keyword = kw;
    store(CFG.queryStorage, kw);
    open();

    if (!getKey()) { renderKeyGate(); return; }

    state.loading = true;
    setStatus('<span class="ai-spin" aria-hidden="true"></span>' +
      '正在跨平台检索并评估内容质量…<span class="ai-elapsed"></span>', 'loading');
    if (listBox) { listBox.innerHTML = ''; }
    if (barQuery) { barQuery.textContent = kw; }

    var t0 = Date.now();
    var elapsed = statusBox && statusBox.querySelector('.ai-elapsed');
    var tick = global.setInterval(function () {
      if (elapsed) { elapsed.textContent = '（' + Math.round((Date.now() - t0) / 1000) + 's）'; }
    }, 500);

    var ctl = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    var timer = global.setTimeout(function () { if (ctl) { ctl.abort(); } }, CFG.timeout);

    function finish() {
      state.loading = false;
      global.clearInterval(tick);
      global.clearTimeout(timer);
    }

    /** 依次尝试候选模型：只有"一次都没搜"时才继续往下试，真搜到了就不再花钱。 */
    var tried = [];

    function attempt(model) {
      tried.push(model);
      var payload = {
        model: model,
        /* ⚠️ instructions / input 分离是刻意为之，见 buildInstructions 的注释：
           长说明放 instructions，input 只放关键词本身，让它成为一个"需要最新信息的提问"。
           把长说明塞进 input 会让模型判断无需检索 —— 实测踩过这个坑。 */
        instructions: buildInstructions(),
        input: kw,
        // tools 与 tool_choice 必须成对：强制作业要求 tools 里含 web_search，否则 400
        tools: [{ type: CFG.searchTool }]
      };
      if (CFG.forceSearch) { payload.tool_choice = { type: CFG.searchTool }; }

      return global.fetch(CFG.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getKey()
        },
        body: JSON.stringify(payload),
        signal: ctl ? ctl.signal : undefined
      }).then(function (res) {
        return res.text().then(function (body) {
          var data = null;
          try { data = JSON.parse(body); } catch (e) { data = null; }
          if (!res.ok) {
            var msg = (data && (data.error && (data.error.message || data.error.code))) ||
                      ('HTTP ' + res.status);
            var err = new Error(msg);
            err.status = res.status;
            err.model = model;
            throw err;
          }
          return data;
        });
      }).then(function (data) {
        global.__fyAiLastResponse = data;
        var n = countWebSearch(data);
        if (n > 0) {
          // 这个模型真的搜了 —— 记下来，下次直接用，不再无谓地试其它模型
          rememberModel(model);
        } else if (CFG.autoTryModels) {
          var nm = nextUntriedModel(tried);
          if (nm) {
            setStatus('<span class="ai-spin" aria-hidden="true"></span>' +
              '模型 ' + esc(model) + ' 没有执行联网检索，改用 ' + esc(nm) + ' 重试…', 'loading');
            return attempt(nm);
          }
        }
        return { data: data, searched: n };
      });
    }

    attempt(currentModel()).then(function (r) {
      finish();
      var text = readOutputText(r.data);
      var parsed = extractJson(text);
      var result = normalize(parsed || asFallbackItems(text));
      renderAll(result, kw, r.searched, describeOutput(r.data), describeUsage(r.data),
                tried, collectQueries(r.data));
    }).catch(function (err) {
      finish();
      var status = err && err.status;
      var html;
      if (err && err.name === 'AbortError') {
        html = '请求超时（超过 ' + Math.round(CFG.timeout / 1000) + ' 秒）。联网检索偶尔会很慢，请重试。';
      } else if (status === 401) {
        html = 'API Key 无效或已被撤销。请点右上角「更换」重新填一把。' +
               '<br><span class="ai-hint">能收到 401 说明网络链路是通的，只是 Key 不对。</span>';
      } else if (status === 402 || status === 403) {
        html = '账户余额不足或无权访问该模型（' + esc(err.model || CFG.modelCandidates[0]) + '）。' +
               '请检查 DeepSeek 的额度；也可以换个模型再试。';
      } else if (status === 429) {
        html = '触发限流了，稍等十几秒再试。';
      } else if (status >= 500) {
        html = 'DeepSeek 服务端出错了（HTTP ' + status + '），稍后重试。';
      } else if (!status) {
        /* 没有 status = fetch 直接抛了 TypeError，请求**根本没发出去**。
           ⚠ 注意这与 CORS 无关：实测 DeepSeek 对预检(OPTIONS)和实际 POST 响应
           都回显了 Access-Control-Allow-Origin，跨域本身是通的。
           所以下面列的全是「本地环境」原因，按可能性排序。 */
        var onLine = !global.navigator || global.navigator.onLine !== false;
        html = '请求没能发出去（网络层失败，不是 API 或 Key 的问题）' +
          '<br><span class="ai-hint">按可能性依次排查：</span>' +
          '<ol class="ai-hint-list">' +
            '<li>页面是在<b>内置预览面板</b>里打开的 —— 预览沙箱不保证放行外部请求。' +
              '请改用线上域名，或本地起个 HTTP 服务再打开。</li>' +
            '<li>浏览器<b>扩展</b>（广告拦截 / 隐私保护类）拦掉了 api.deepseek.com：' +
              '换隐私窗口试试，或把该域名加入白名单。</li>' +
            '<li>代理 / VPN / 校园或企业网络拦截了跨域预检（OPTIONS 请求）。</li>' +
            '<li>当前网络状态：' + (onLine ? '浏览器报告在线' : '<b>已离线</b>') + '。</li>' +
          '</ol>' +
          '<details class="ai-diag"><summary>展开：在控制台自检一行命令</summary>' +
          '<code class="ai-diag-code">fetch("https://api.deepseek.com/responses",{method:"POST",' +
          'headers:{"Content-Type":"application/json","Authorization":"Bearer 你的key"},' +
          'body:JSON.stringify({model:"deepseek-v4-flash",input:"hi",' +
          'tools:[{type:"web_search"}]})}).then(r=&gt;r.text()).then(console.log)' +
          '.catch(e=&gt;console.error("连接失败",e))</code>' +
          '<span class="ai-hint">终端返回 401 就说明链路通畅（只是 Key 无效）；' +
          '若这条命令仍报连接失败，那就是上面第 1~3 条。</span>' +
          '</details>';
      } else {
        html = '检索失败：' + esc((err && err.message) || '未知错误');
      }
      setStatus(html, 'error');
    });
  }

  /* ------------------------------ 初始化 ------------------------------ */

  function init() {
    panel = doc.getElementById('ai-panel');
    if (!panel) { return false; }                 // 移动端没有抽屉，直接退出
    listBox = panel.querySelector('.ai-list');
    statusBox = panel.querySelector('.ai-status');
    barQuery = panel.querySelector('.ai-query');
    cardTpl = doc.getElementById('ai-card-tpl');

    var btnClear = panel.querySelector('.ai-clear');
    var btnClose = panel.querySelector('.ai-close');
    if (btnClear) { btnClear.addEventListener('click', clearResults); }
    if (btnClose) { btnClose.addEventListener('click', close); }

    // Esc 收起抽屉。search.js 里也有一个 Esc 监听，但那个绑在输入框上，
    // 焦点在抽屉里时不会触发，两者不冲突。
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel && !panel.hidden) { close(); }
    });

    // 搜过的关键词下次打开还能看见（不自动重发请求，避免意外扣费）
    var last = read(CFG.queryStorage);
    if (last && barQuery) { barQuery.textContent = last; }

    renderKeyState();
    if (!getKey()) {
      setStatus('<p class="ai-note">还没有配置 API Key —— 点搜索框上方的「AI 搜索」并输入关键词即可开始。</p>', '');
    }
    return true;
  }

  global.FYAI = {
    config: CFG,
    init: init,
    ask: ask,
    open: open,
    close: close,
    clearResults: clearResults,
    hasKey: function () { return !!getKey(); },
    setKey: setKey,
    clearKey: clearKey,
    isOpen: function () { return !!(panel && !panel.hidden); },
    /** 供 search.js 判断当前页面是否支持 AI 搜索 */
    available: function () { return !!doc.getElementById('ai-panel'); }
  };

  function boot() { init(); }
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
