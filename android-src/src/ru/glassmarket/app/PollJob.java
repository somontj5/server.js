package ru.glassmarket.app;
import android.app.job.*;
public class PollJob extends JobService{
  @Override public boolean onStartJob(final JobParameters p){if(!MsgService.logged(this))return false;MsgService.next(this,60000);
    new Thread(new Runnable(){public void run(){MsgService.pollNow(PollJob.this);jobFinished(p,false);}}).start();return true;}
  @Override public boolean onStopJob(JobParameters p){return false;}}
