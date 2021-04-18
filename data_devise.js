window.onload =function (){
    document.getElementById("google").onclick =so1;

    document.getElementById("baidu").onclick =so2;
    document.querySelector(".image_study").onmouseleave=more_lease;
    document.getElementById("study_more").onmousemove=more;
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
function more_lease()
    {
      var obj=document.getElementById("frame_study");
      obj.style.display="none";
    }
function more()
  {
    var obj=document.getElementById("frame_study");
    obj.style.display="block";
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
