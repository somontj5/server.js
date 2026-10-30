package ru.glassmarket.app;
import android.content.*;
public class BootReceiver extends BroadcastReceiver{@Override public void onReceive(Context c,Intent i){MsgService.start(c);}}
