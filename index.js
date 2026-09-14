/* =========================================================================
 * foryouos 导航页 · PC 端页面逻辑
 * -------------------------------------------------------------------------
 * 搜索相关逻辑已统一收敛到 search.js（引擎表、快捷键、联想都在那里）。
 *
 * 说明：图标环（`.icon-wrapper` 主图标 + `.sub-icon` 子项）都是带 href 的真实 <a>，
 * 展开靠 CSS :hover，不需要 JS 绑定 window.open —— 也就不会出现
 * 「元素被删掉后脚本报空指针」的老问题。
 * ========================================================================= */

/* ---------------- 图标环：鼠标离开后延迟收起 ----------------
 * 光靠 CSS :hover 有个老毛病：主图标与子项之间那道缝、以及手抖滑出，
 * 都会让 :hover 立刻失效，子项带着 pointer-events:none 一起消失，根本点不到。
 * 这里在 mouseleave 后延迟 280ms 才摘掉 .is-open，鼠标在这段时间内落到子项上
 * （会再次触发 mouseenter）就取消收起，点击就稳了。
 * CSS 侧对应 `.icon-wrapper.is-open .sub-icon`，纯 CSS 的 :hover 仍然保留作为兜底。 */
document.addEventListener('DOMContentLoaded', function () {
  var CLOSE_DELAY = 280;   // ms，够鼠标从主图标挪到子项上

  Array.prototype.forEach.call(document.querySelectorAll('.icon-wrapper'), function (wrap) {
    var timer = null;

    function keepOpen() {
      if (timer) { clearTimeout(timer); timer = null; }
      wrap.classList.add('is-open');
    }
    function closeLater() {
      if (timer) { clearTimeout(timer); }
      timer = window.setTimeout(function () {
        wrap.classList.remove('is-open');
        timer = null;
      }, CLOSE_DELAY);
    }

    wrap.addEventListener('mouseenter', keepOpen);
    wrap.addEventListener('mouseleave', closeLater);
    wrap.addEventListener('focusin', keepOpen);      // 键盘 Tab 进来也展开
    wrap.addEventListener('focusout', closeLater);
  });
});

/* ---------------- 和风天气：先 IP 定位，再查城市 ID ---------------- */
// IP 定位接口：https://ip.zxinc.org/api.php?type=json
loc_id = "0";  //初始值是新乡
let searchZh = "河南";
let searchShi = "开封";
let searchXian = "";

fetch('https://ip.zxinc.org/api.php?type=json')
  .then(response => response.json())
  .then(data =>
  {
      const loc=data["data"]["country"]
      const parts = loc.split(/省|市/);
      console.log(parts)
      searchZh = parts[0];
      searchShi = parts[1];
      searchXian = parts[1];
    // 获取天气ID
fetch("city.json")
    .then(function (response) {
      if(response.status === 200){
        return response.json();
      }
      else{
        console.log("读取城市地址数据错误")
      }
      })

    .then(data=>{
      // 循环省份
      for(let i = 0;i<  data.length;i++)
      {
        if(data[i].zh === searchZh )
        {
          for(let j = 0; j < data[i].children.length;j++)
          {
             if(data[i].children[j].zh === searchShi)
               {
                 for(let k = 0 ; k < data[i].children[j].children.length; k++ )
                 {
                     if(data[i].children[j].children[k].zh === searchXian)
                     {
                        var loc_id=String("CN"+data[i].children[j].children[k].id);
                     }
                 }
               }
          }

          break;
        }
      }

    console.log(String(loc_id));
    WIDGET = {
          "CONFIG": {
            "modules": "01234",
            "background": "5",
            "tmpColor": "E6B8AF",
            "tmpSize": "16",
            "cityColor": "434343",
            "citySize": "16",
            "aqiColor": "FF9900",
            "aqiSize": "16",
            "weatherIconSize": "18",
            "alertIconSize": "18",
            "padding": "10px 10px 10px 10px",
            "shadow": "1",
            "language": "auto",
            "borderRadius": "10",
            "fixed": "true",
            "vertical": "center",
            "horizontal": "left",
            "city": String(loc_id),
            "left": "40",
            "top": "20",
            "key": "6cfd3807500d4af38572be5b6b6d0f24"
          }
        }
    })
  })

  .catch(error => console.error(error))
