/* =========================================================================
 * foryouos 导航页 · PC 端页面逻辑
 * -------------------------------------------------------------------------
 * 搜索相关逻辑已统一收敛到 search.js（引擎表、快捷键、联想都在那里），
 * 本文件只保留：环形菜单跳转 + 和风天气定位。
 * ========================================================================= */

/* ---------------- 环形菜单：点击各子图标跳转 ---------------- */
document.addEventListener('DOMContentLoaded', function () {
  var pairs = [
    ['.main-icon',          'https://www.cupfox.com/'],   // 茶杯狐
    ['.sub-icon.top',       'https://www.bdys03.com/'],   // 哔嘀影视
    ['.sub-icon.right',     'https://www.wangfei.tv/'],   // 网飞
    ['.sub-icon.bottom',    'https://www.douyin.com/'],   // 抖音
    ['.sub-icon.left',      'https://www.iqiyi.com/']     // 爱奇艺
  ];

  pairs.forEach(function (item) {
    var el = document.querySelector(item[0]);
    if (!el) { return; }                       // 元素不存在时跳过，避免整段脚本报错中断
    el.style.cursor = 'pointer';
    el.addEventListener('click', function () { window.open(item[1]); });
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
