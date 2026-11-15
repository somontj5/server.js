/* Stored preference, system following, and native bars use the same resolved theme. */
(function(){
 var key='sugd_theme',media=window.matchMedia('(prefers-color-scheme: dark)'),preference='system';
 try{preference=localStorage.getItem(key)||'system'}catch(e){}
 if(!/^(system|light|dark)$/.test(preference))preference='system';
 function apply(){var dark=preference==='dark'||preference==='system'&&media.matches;
  document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';
  var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=dark?'#101a17':'#f7f8f2';
  try{if(window.Android&&Android.setTheme)Android.setTheme(dark)}catch(e){}
  var choice=document.getElementById('themeChoice');if(choice)choice.value=preference;
 }
 window.SugdTheme={choice:function(){return preference},apply:apply,set:function(value){if(!/^(system|light|dark)$/.test(value))return;preference=value;try{localStorage.setItem(key,value)}catch(e){}apply()}};
 if(media.addEventListener)media.addEventListener('change',apply);else media.addListener(apply);
 document.addEventListener('DOMContentLoaded',apply);apply();
})();
