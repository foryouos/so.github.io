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






UI redesign  by foryouos&瓶子的跋涉

[^1]:https://imgse.com/
