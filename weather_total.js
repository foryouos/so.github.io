(function (d) {
  var c = d.createElement('link')
  c.rel = 'stylesheet'
  c.href = 'https://widget.heweather.net/standard/static/css/he-standard.css?v=1.4.0'
  var s = d.createElement('script')
  s.src = 'weather.js'
  var sn = d.getElementsByTagName('script')[0]
  sn.parentNode.insertBefore(c, sn)
  sn.parentNode.insertBefore(s, sn)
})(document)
