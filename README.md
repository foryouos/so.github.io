# foryouos 导航栏
#### 导航栏


### 图床存储
* [路过图床](https://imgse.com/)[^1]
* 云储存使用cloudflare


### 技术问题
#### 监控class标签进行跳转
```javascript
// 点击class对象跳转页面
document.addEventListener('DOMContentLoaded', () => {
  const mainIcon = document.querySelector('.main-icon');
  mainIcon.addEventListener('click', () => {
    window.location.href = 'https://www.cupfox.com/';
  });
  const icon_top = document.querySelector('.sub-icon.top');
  icon_top.addEventListener('click', () => {
    window.location.href = 'https://www.bdys03.com/';
  });
  // 其他代码
  const icon_right = document.querySelector('.sub-icon.right');
  icon_right.addEventListener('click', () => {
    window.location.href = 'https://www.wangfei.tv/';
  });
});
```
#### 点击选择不同的搜索引擎
```javascript
window.onload =function (){
    document.getElementById("google").onclick =so1;
    document.getElementById("baidu").onclick =so2;
    // 上面搜索

}
function so1()
    {
      document.getElementById("kw").name="q";
      document.soform.action="https://www.google.com/search?";
      document.soform.submit();
    }
function so2()
    {
      document.soform.action="https://www.baidu.com/s?";
      document.soform.submit();
    }
```
#### 打开新窗口的方式
```javascript
οnclick="window.open('你所要跳转的页面')"
```


#### 抓取哔嘀影视的最新链接 跨域问题解决方案
```javascript


```

#### 和风天气GPS不准确解决
> 修改天气窗口 通过IP地址获取位置
```shell
https://ip.zxinc.org/api.php?type=json
```
```js

// 修改和风天气
// 使用https://ip.zxinc.org/api.php?type=json获取ip位置
//城市id
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
      // console.log(parts[0])
      // console.log(parts[1])
    // 获取天气ID
fetch("city.json")
    .then(function (response) {
      if(response.status === 200){
        // console.log("读取城市数据成功")
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
          // console.log(data[i]);
          for(let j = 0; j < data[i].children.length;j++)
          {
             if(data[i].children[j].zh === searchShi)
               {
                 // console.log(data[i].children[j]);
                 for(let k = 0 ; k < data[i].children[j].children.length; k++ )
                 {
                     if(data[i].children[j].children[k].zh === searchXian)
                     {
                        // console.log("县数据找到成功")
                        // console.log(data[i].children[j].children[k]);
                        // console.log("CN"+ data[i].children[j].children[k].id);
                        // return data[i].children[j].children[k].id
                        var loc_id=String("CN"+data[i].children[j].children[k].id);
                        // console.log(String(loc_id));
                     }
                     else {
                       // console.log(k);
                     }
                 }
               }
             // else{
             //   console.log(j);
             // }
          }

          break;
        }
        // else{
        //   console.log(i)
        // }
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
            "key": "换成自己的和风天气key"
          }
        }
    })
      
  })

  .catch(error => console.error(error))

```




UI redesign  by foryouos&瓶子的跋涉

[^1]:https://imgse.com/
