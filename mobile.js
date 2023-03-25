window.onload =function (){
    // document.getElementById("google").onclick =so1;
    //
    // document.getElementById("baidu").onclick =so2;
}
function so1()
    {
      document.getElementById("kw").name="q";
      document.soform.action="https://g.teareading.app/search?";
      document.soform.submit();
    }
function so2()
    {
      document.soform.action="https://www.baidu.com/s?";
      document.soform.submit();
    }
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
            "tmpSize": "56",
            "cityColor": "434343",
            "citySize": "56",
            "aqiColor": "FF9900",
            "aqiSize": "66",
            "weatherIconSize": "94",
            "alertIconSize": "58",
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
      console.log("获取天气参数完成");

  })

  .catch(error => console.error(error))