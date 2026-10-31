package ru.glassmarket.app;
import android.app.Activity;import android.content.*;import android.net.Uri;import android.os.*;import android.webkit.*;import android.view.View;
public class MainActivity extends Activity {
  static final int FC=1;static boolean visible=false;WebView w;ValueCallback<Uri[]> cb;
  @Override protected void onCreate(Bundle b){super.onCreate(b);
    w=new WebView(this);WebSettings s=w.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(true);s.setTextZoom(100);s.setMediaPlaybackRequiresUserGesture(false);
    w.setBackgroundColor(0xffffffff);w.addJavascriptInterface(new Bridge(this),"Android");
    w.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,String u){
      if(u.startsWith("file:"))return false;try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(u)));}catch(Exception e){}return true;}});
    w.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> c,FileChooserParams p){
      if(cb!=null)cb.onReceiveValue(null);cb=c;Intent i=new Intent(Intent.ACTION_GET_CONTENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("image/*");i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
      try{startActivityForResult(Intent.createChooser(i,"Выберите фото"),FC);}catch(Exception e){cb=null;return false;}return true;}});
    w.loadUrl("file:///android_asset/www/index.html");setContentView(w);
    getWindow().setStatusBarColor(0xffffffff);getWindow().setNavigationBarColor(0xffffffff);
    if(Build.VERSION.SDK_INT>=23)getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|(Build.VERSION.SDK_INT>=26?View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0));
    if(Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=0)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},7);
    MsgService.start(this);handle(getIntent());}
  @Override protected void onNewIntent(Intent i){super.onNewIntent(i);handle(i);}
  void handle(Intent i){if(i==null)return;final String t=i.getStringExtra("tid");if(t==null)return;i.removeExtra("tid");
    w.postDelayed(new Runnable(){public void run(){w.evaluateJavascript("window.gmOpenTid&&gmOpenTid('"+t.replaceAll("[^A-Za-z0-9_\\-]","")+"')",null);}},700);}
  @Override protected void onResume(){super.onResume();visible=true;MsgService.cancelAll(this);}
  @Override protected void onPause(){super.onPause();visible=false;MsgService.start(this);}
  @Override protected void onActivityResult(int rq,int rs,Intent d){
    if(rq==FC&&cb!=null){Uri[] r=null;if(rs==RESULT_OK&&d!=null){if(d.getClipData()!=null){int n=d.getClipData().getItemCount();r=new Uri[n];for(int k=0;k<n;k++)r[k]=d.getClipData().getItemAt(k).getUri();}else if(d.getData()!=null)r=new Uri[]{d.getData()};}
      cb.onReceiveValue(r);cb=null;return;}super.onActivityResult(rq,rs,d);}
  @Override public void onBackPressed(){if(w.canGoBack())w.goBack();else super.onBackPressed();}
}
