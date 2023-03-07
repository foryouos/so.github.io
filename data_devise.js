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
WIDGET = {
  CONFIG: {
    "layout": 2,
    "width": "230",
    "height": "295",
    "background": 5,
    "dataColor": "50E3C2",
    "borderRadius": "10",
    "key": "b086b636b64a49aeb9136adfd37d3c61"
  }
}
//环形图标




const element = document.querySelector('.icon-wrapper');

function handleMouseMove(e) {
  const { clientX, clientY } = e;
  const boundingRect = element.getBoundingClientRect();
  const centerX = boundingRect.left + boundingRect.width / 2;
  const centerY = boundingRect.top + boundingRect.height / 2;
  const deltaX = clientX - centerX;
  const deltaY = clientY - centerY;
  const percentX = deltaX / (boundingRect.width / 2);
  const percentY = deltaY / (boundingRect.height / 2);
  const rotateX = -10 * percentY;
  const rotateY = 10 * percentX;
  element.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

}

// 点击class对象跳转页面
document.addEventListener('DOMContentLoaded', () => {
  const mainIcon = document.querySelector('.main-icon');
  mainIcon.addEventListener('click', () => {
    window.open(  'https://www.cupfox.com/');
  });
  const icon_top = document.querySelector('.sub-icon.top');
  icon_top.addEventListener('click', () => {
    window.open('https://www.bdys03.com/');
  });
  // 其他代码
  const icon_right = document.querySelector('.sub-icon.right');
  icon_right.addEventListener('click', () => {
    window.open('https://www.wangfei.tv/');
  });

  const icon_bottom= document.querySelector('.sub-icon.bottom');
  icon_bottom.addEventListener('click', () => {
    window.open ('https://www.douyin.com/');
  });
  const icon_left= document.querySelector('.sub-icon.left');
  icon_left.addEventListener('click', () => {
    window.open ('https://www.iqiyi.com/');
  });


//   https://www.iqiyi.com/
});



