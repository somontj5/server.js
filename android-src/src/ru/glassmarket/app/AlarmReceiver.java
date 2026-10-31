package ru.glassmarket.app;
import android.content.*;
public class AlarmReceiver extends BroadcastReceiver{@Override public void onReceive(final Context c,Intent i){
  if(!MsgService.logged(c))return;final PendingResult r=goAsync();MsgService.next(c,60000);
  new Thread(new Runnable(){public void run(){try{MsgService.pollNow(c);}finally{r.finish();}}}).start();}}
