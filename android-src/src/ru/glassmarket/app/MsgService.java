package ru.glassmarket.app;
import android.app.*;import android.app.job.*;import android.content.*;import android.os.*;import android.graphics.*;
import java.net.*;import java.io.*;import org.json.*;
/* Уведомления о сообщениях БЕЗ постоянного значка в шторке (как у мессенджеров):
   будильник AlarmManager ~раз в минуту (в режиме сна Android сам реже) + резервная задача JobScheduler раз в 15 мин. */
public class MsgService {
  static final String CH="msgs";static final int JOB=4242;
  final Context c;MsgService(Context c){this.c=c.getApplicationContext();}
  static boolean logged(Context c){return !c.getSharedPreferences("gm",0).getString("token","").isEmpty();}
  static PendingIntent alarmPi(Context c){Intent i=new Intent(c,AlarmReceiver.class);return PendingIntent.getBroadcast(c,1,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  static void start(Context c){c=c.getApplicationContext();if(!logged(c))return;
    try{NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);nm.cancel(1);if(Build.VERSION.SDK_INT>=26)nm.deleteNotificationChannel("bg");}catch(Exception e){}
    try{c.stopService(new Intent().setClassName(c,"ru.glassmarket.app.MsgServiceOld"));}catch(Exception e){}
    next(c,60000);
    try{JobScheduler js=(JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);if(js.getPendingJob(JOB)==null)
      js.schedule(new JobInfo.Builder(JOB,new ComponentName(c,PollJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60000).setPersisted(true).build());}catch(Exception e){}}
  static void next(Context c,long ms){try{AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
    am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,SystemClock.elapsedRealtime()+ms,alarmPi(c));}catch(Exception e){}}
  static void stop(Context c){c=c.getApplicationContext();c.getSharedPreferences("gm",0).edit().remove("token").apply();
    try{((AlarmManager)c.getSystemService(Context.ALARM_SERVICE)).cancel(alarmPi(c));}catch(Exception e){}
    try{((JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(JOB);}catch(Exception e){}}
  static synchronized void pollNow(Context c){try{new MsgService(c).poll();}catch(Throwable e){}}
  static void cancelAll(Context c){NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);try{nm.cancelAll();}catch(Exception e){}}
  void channels(){if(Build.VERSION.SDK_INT<26)return;NotificationManager nm=c.getSystemService(NotificationManager.class);
    NotificationChannel a=new NotificationChannel(CH,"Сообщения",NotificationManager.IMPORTANCE_HIGH);a.setDescription("Новые сообщения от покупателей и продавцов");a.enableVibration(true);a.setVibrationPattern(new long[]{0,60,40,60});a.setLightColor(0xff00aaff);a.enableLights(true);nm.createNotificationChannel(a);}
  static Notification.Builder nb(Context c,String ch){return Build.VERSION.SDK_INT>=26?new Notification.Builder(c,ch):new Notification.Builder(c);}
  static PendingIntent open(Context c,String tid,int rc){Intent i=new Intent(c,MainActivity.class);i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);if(tid!=null)i.putExtra("tid",tid);
    return PendingIntent.getActivity(c,rc,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  String get(String u,String tok)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(u).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(15000);
    c.setRequestProperty("authorization","Bearer "+tok);int code=c.getResponseCode();if(code==401){MsgService.this.c.getSharedPreferences("gm",0).edit().remove("token").apply();return null;}
    if(code!=200)return null;BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream(),"UTF-8"));StringBuilder sb=new StringBuilder();String l;while((l=r.readLine())!=null)sb.append(l);r.close();return sb.toString();}
  String srvUrl(SharedPreferences p){ // адрес сервера меняется при каждом запуске workflow — берём свежий с GitHub
    long last=p.getLong("srvAt",0);if(System.currentTimeMillis()-last>10*60000){try{HttpURLConnection c=(HttpURLConnection)new URL("https://raw.githubusercontent.com/somontj5/server.js/main/server-url.txt?t="+System.currentTimeMillis()).openConnection();
      c.setConnectTimeout(8000);c.setReadTimeout(8000);if(c.getResponseCode()==200){BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream()));String s=r.readLine();r.close();
      if(s!=null&&s.trim().startsWith("http"))p.edit().putString("srv",s.trim()).apply();}}catch(Exception e){}p.edit().putLong("srvAt",System.currentTimeMillis()).apply();}
    return p.getString("srv","").replaceAll("/+$","");}
  void poll()throws Exception{channels();SharedPreferences p=c.getSharedPreferences("gm",0);String tok=p.getString("token","");if(tok.isEmpty()){stop(c);return;}
    String srv=srvUrl(p);if(srv.isEmpty())return;long since=p.getLong("since",0);boolean first=since==0;
    String body=get(srv+"/updates?since="+since,tok);if(body==null){p.edit().putLong("srvAt",0).apply();return;}
    JSONObject o=new JSONObject(body);long now=o.optLong("now",System.currentTimeMillis());p.edit().putLong("since",now).apply();
    if(first||MainActivity.visible)return; // в открытом приложении показывает свой баннер
    JSONArray a=o.optJSONArray("items");if(a==null)return;NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
    for(int i=0;i<a.length();i++){JSONObject t=a.getJSONObject(i);String tid=t.optString("tid"),name=t.optString("name","Новое сообщение"),item=t.optString("item","");
      JSONArray ms=t.optJSONArray("messages");if(ms==null||ms.length()==0)continue;
      Notification.InboxStyle st=new Notification.InboxStyle();String lastTxt="";for(int k=Math.max(0,ms.length()-5);k<ms.length();k++){lastTxt=ms.getString(k);st.addLine(lastTxt);}
      if(!item.isEmpty())st.setSummaryText(item);
      int nid=Math.abs(tid.hashCode())%100000+10;
      Notification.Builder b=nb(c,CH).setSmallIcon(android.R.drawable.stat_notify_chat).setLargeIcon(avatar(name)).setContentTitle(name).setContentText(lastTxt)
        .setSubText(item.isEmpty()?null:item).setStyle(ms.length()>1?st:new Notification.BigTextStyle().bigText(lastTxt)).setAutoCancel(true).setColor(0xff00aaff)
        .setContentIntent(open(c,tid,nid)).setCategory(Notification.CATEGORY_MESSAGE).setNumber(ms.length()).setWhen(System.currentTimeMillis()).setShowWhen(true)
        .setGroup("gm_msgs");
      if(Build.VERSION.SDK_INT<26)b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
      nm.notify(nid,b.build());}}
  Bitmap avatar(String name){int s=128;Bitmap bm=Bitmap.createBitmap(s,s,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(bm);Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
    int[] cols={0xff00aaff,0xff02d15c,0xffff8a00,0xff965eeb,0xffff4053,0xff00b8a9};p.setColor(cols[Math.abs(name.hashCode())%cols.length]);c.drawCircle(s/2f,s/2f,s/2f,p);
    p.setColor(0xffffffff);p.setTextSize(58);p.setTypeface(Typeface.DEFAULT_BOLD);p.setTextAlign(Paint.Align.CENTER);String l=name.isEmpty()?"?":name.substring(0,1).toUpperCase();
    c.drawText(l,s/2f,s/2f-(p.descent()+p.ascent())/2,p);return bm;}
}
