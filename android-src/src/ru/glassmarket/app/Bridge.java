package ru.glassmarket.app;
import android.content.*;import android.webkit.JavascriptInterface;
public class Bridge {
  final Context c;Bridge(Context c){this.c=c.getApplicationContext();}
  @JavascriptInterface public void share(String t){Intent i=new Intent(Intent.ACTION_SEND);i.setType("text/plain");i.putExtra(Intent.EXTRA_TEXT,t);
    Intent ch=Intent.createChooser(i,"Поделиться");ch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);c.startActivity(ch);}
  @JavascriptInterface public void setAuth(String srv,String token,String uid){
    SharedPreferences p=c.getSharedPreferences("gm",0);boolean ch=!token.equals(p.getString("token",""))||!srv.equals(p.getString("srv",""));
    p.edit().putString("srv",srv).putString("token",token).putString("uid",uid).apply();if(ch)MsgService.start(c);}
  @JavascriptInterface public void clearAuth(){MsgService.stop(c);}
  @JavascriptInterface public boolean notifOn(){return android.os.Build.VERSION.SDK_INT<33||c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")==0;}
}
