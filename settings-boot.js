/*
 * settings-boot.js —— 首屏同步应用主题（<head> 内，theme.js 之后）
 * ① FYTheme.applyFromStorage()：head 同步把 --fy-bg-* 写到 documentElement；
 *    bing 模式用 cache.url 直接回填 --fy-bg-image（零网络、零闪烁）。
 * ② FYTheme.startBingRefresh()：把壁纸联网刷新延后到页面就绪之后异步进行。
 * 包 try/catch，失败静默回退到 CSS 默认背景；不查询任何节点、不访问就绪前的 body。
 */
(function (global) {
    'use strict';
    try {
        var T = global.FYTheme;
        if (!T || typeof T.applyFromStorage !== 'function') { return; }
        T.applyFromStorage();
        if (typeof T.startBingRefresh === 'function') { T.startBingRefresh(); }
    } catch (e) {
        /* 静默：任何异常都不阻断首屏，背景回退到 index.css / mobile.css 的默认插画 */
    }
})(typeof window !== 'undefined' ? window : this);
