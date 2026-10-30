package ru.glassmarket.app;
import android.app.*;import android.content.*;import android.os.*;import android.graphics.*;
import java.net.*;import java.io.*;import org.json.*;
/* Фоновая служба: раз в 15 с спрашивает сервер о новых сообщениях и показывает системные уведомления */
public class MsgService extends Service {
  static final String CH="msgs",CH_BG="bg";static final int FG_ID=1;
  Handler h;HandlerThread ht;boolean run;
  static void start(Context c){SharedPreferences p=c.getSharedPreferences("gm",0);if(p.getString("token","").isEmpty())return;
    Intent i=new Intent(c,MsgService.class);try{if(Build.VERSION.SDK_INT>=26)c.startForegroundService(i);else c.startService(i);}catch(Exception e){}}
  static void cancelAll(Context c){NotificationManager nm=(NotificationManager)c.getSystemService(NOTIFICATION_SERVICE);
    try{for(android.service.notification.StatusBarNotification n:nm.getActiveNotifications())if(n.getId()!=FG_ID)nm.cancel(n.getId());}catch(Exception e){}}
  @Override public IBinder onBind(Intent i){return null;}
  void channels(){if(Build.VERSION.SDK_INT<26)return;NotificationManager nm=getSystemService(NotificationManager.class);
    NotificationChannel a=new NotificationChannel(CH,"Сообщения",NotificationManager.IMPORTANCE_HIGH);a.setDescription("Новые сообщения от покупателей и продавцов");a.enableVibration(true);a.setVibrationPattern(new long[]{0,60,40,60});a.setLightColor(0xff00aaff);a.enableLights(true);nm.createNotificationChannel(a);
    NotificationChannel b=new NotificationChannel(CH_BG,"Фоновая связь",NotificationManager.IMPORTANCE_MIN);b.setShowBadge(false);b.setDescription("Можно скрыть: долгое нажатие → отключить");nm.createNotificationChannel(b);}
  Notification.Builder nb(String ch){return Build.VERSION.SDK_INT>=26?new Notification.Builder(this,ch):new Notification.Builder(this);}
  PendingIntent open(String tid,int rc){Intent i=new Intent(this,MainActivity.class);i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);if(tid!=null)i.putExtra("tid",tid);
    return PendingIntent.getActivity(this,rc,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  @Override public int onStartCommand(Intent in,int f,int id){channels();
    Notification fg=nb(CH_BG).setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle("СтеклоМаркет").setContentText("Уведомления о сообщениях включены").setContentIntent(open(null,0)).setOngoing(true).setColor(0xff00aaff).build();
    try{if(Build.VERSION.SDK_INT>=34)startForeground(FG_ID,fg,ServiceInfo_REMOTE);else startForeground(FG_ID,fg);}catch(Exception e){stopSelf();return START_NOT_STICKY;}
    if(!run){run=true;ht=new HandlerThread("gm");ht.start();h=new Handler(ht.getLooper());h.post(tick);}
    return START_STICKY;}
  static final int ServiceInfo_REMOTE=0x200; // FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
  final Runnable tick=new Runnable(){public void run(){try{poll();}catch(Throwable e){} if(run)h.postDelayed(this,15000);}};
  @Override public void onDestroy(){run=false;if(ht!=null)ht.quitSafely();super.onDestroy();}
  String get(String u,String tok)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(u).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(15000);
    c.setRequestProperty("authorization","Bearer "+tok);int code=c.getResponseCode();if(code==401){getSharedPreferences("gm",0).edit().remove("token").apply();run=false;stopSelf();return null;}
    if(code!=200)return null;BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream(),"UTF-8"));StringBuilder sb=new StringBuilder();String l;while((l=r.readLine())!=null)sb.append(l);r.close();return sb.toString();}
  String srvUrl(SharedPreferences p){ // адрес сервера меняется при каждом запуске workflow — берём свежий с GitHub
    long last=p.getLong("srvAt",0);if(System.currentTimeMillis()-last>10*60000){try{HttpURLConnection c=(HttpURLConnection)new URL("https://raw.githubusercontent.com/somontj5/server.js/main/server-url.txt?t="+System.currentTimeMillis()).openConnection();
      c.setConnectTimeout(8000);c.setReadTimeout(8000);if(c.getResponseCode()==200){BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream()));String s=r.readLine();r.close();
      if(s!=null&&s.trim().startsWith("http"))p.edit().putString("srv",s.trim()).apply();}}catch(Exception e){}p.edit().putLong("srvAt",System.currentTimeMillis()).apply();}
    return p.getString("srv","").replaceAll("/+$","");}
  void poll()throws Exception{SharedPreferences p=getSharedPreferences("gm",0);String tok=p.getString("token","");if(tok.isEmpty()){run=false;stopSelf();return;}
    String srv=srvUrl(p);if(srv.isEmpty())return;long since=p.getLong("since",0);boolean first=since==0;
    String body=get(srv+"/updates?since="+since,tok);if(body==null){p.edit().putLong("srvAt",0).apply();return;}
    JSONObject o=new JSONObject(body);long now=o.optLong("now",System.currentTimeMillis());p.edit().putLong("since",now).apply();
    if(first||MainActivity.visible)return; // в открытом приложении показывает свой баннер
    JSONArray a=o.optJSONArray("items");if(a==null)return;NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
    for(int i=0;i<a.length();i++){JSONObject t=a.getJSONObject(i);String tid=t.optString("tid"),name=t.optString("name","Новое сообщение"),item=t.optString("item","");
      JSONArray ms=t.optJSONArray("messages");if(ms==null||ms.length()==0)continue;
      Notification.InboxStyle st=new Notification.InboxStyle();String lastTxt="";for(int k=Math.max(0,ms.length()-5);k<ms.length();k++){lastTxt=ms.getString(k);st.addLine(lastTxt);}
      if(!item.isEmpty())st.setSummaryText(item);
      int nid=Math.abs(tid.hashCode())%100000+10;
      Notification.Builder b=nb(CH).setSmallIcon(android.R.drawable.stat_notify_chat).setLargeIcon(avatar(name)).setContentTitle(name).setContentText(lastTxt)
        .setSubText(item.isEmpty()?null:item).setStyle(ms.length()>1?st:new Notification.BigTextStyle().bigText(lastTxt)).setAutoCancel(true).setColor(0xff00aaff)
        .setContentIntent(open(tid,nid)).setCategory(Notification.CATEGORY_MESSAGE).setNumber(ms.length()).setWhen(System.currentTimeMillis()).setShowWhen(true)
        .setGroup("gm_msgs");
      if(Build.VERSION.SDK_INT<26)b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
      nm.notify(nid,b.build());}}
  Bitmap avatar(String name){int s=128;Bitmap bm=Bitmap.createBitmap(s,s,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(bm);Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
    int[] cols={0xff00aaff,0xff02d15c,0xffff8a00,0xff965eeb,0xffff4053,0xff00b8a9};p.setColor(cols[Math.abs(name.hashCode())%cols.length]);c.drawCircle(s/2f,s/2f,s/2f,p);
    p.setColor(0xffffffff);p.setTextSize(58);p.setTypeface(Typeface.DEFAULT_BOLD);p.setTextAlign(Paint.Align.CENTER);String l=name.isEmpty()?"?":name.substring(0,1).toUpperCase();
    c.drawText(l,s/2f,s/2f-(p.descent()+p.ascent())/2,p);return bm;}
}
