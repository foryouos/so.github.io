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

// 抓取哔嘀影视最新网址
// 发送请求
// 设置标头
// var myHeaders = new Headers();
// // user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36
// //myHeaders.append('authority' ,'www.bdys.me')
// myHeaders.append(
//     'authority','www.bdys.me',
//           'method', 'GET',
//           'path', '/',
//           'scheme', 'https',
//           'accept','text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
//             'accept-encoding', 'gzip, deflate, br',
//             'accept-language',  'zh-CN,zh;q=0.9',
//             'cache-control', 'max-age=0',
//             'dnt', '1',
//             'sec-ch-ua', '"Chromium";v="110", "Not A(Brand";v="24", "Google Chrome";v="110"',
//             'sec-ch-ua-mobile',  '?0',
//             'sec-ch-ua-platform', '"Windows"',
//             'sec-fetch-dest', 'document',
//             'sec-fetch-mode',  'navigate',
//             'sec-fetch-site', 'none',
//             'sec-fetch-user', '?1',
//             'upgrade-insecure-requests', '1',
// )
// myHeaders.append('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
// fetch('https://www.bdys.me/',
//     {
//   method: 'GET',
//   headers: myHeaders,
//           })
//   .then(function(response) {
//     if (response.ok) {
//       return response.text();
//     }
//     throw new Error('Network response was not ok.');
//   })
//   .then(function(text) {
//     console.log(text);
//   })
//   .catch(function(error) {
//     console.error('There was a problem with the fetch operation:', error);
//   });



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


});

// 修改和风天气








