window.onload =function (){
    document.getElementById("google").onclick =so1;

    document.getElementById("baidu").onclick =so2;
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
