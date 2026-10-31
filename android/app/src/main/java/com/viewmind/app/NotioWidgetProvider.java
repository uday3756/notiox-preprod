package com.viewmind.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

public class NotioWidgetProvider extends AppWidgetProvider {
    static final String COMPLETE="com.viewmind.app.NOTIO_COMPLETE";
    public static void refresh(Context context) {
        AppWidgetManager manager=AppWidgetManager.getInstance(context);
        for(int id:manager.getAppWidgetIds(new ComponentName(context,NotioWidgetProvider.class)))render(context,manager,id);
    }
    @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids) { for(int id:ids)render(c,m,id);NotioWidgetSyncWorker.schedule(c); }
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options) { render(c,m,id); }
    @Override public void onReceive(Context context,Intent intent) {
        super.onReceive(context,intent);
        if(!COMPLETE.equals(intent.getAction()))return;
        try { if(NotioWidgetStore.queue(context,intent.getStringExtra("taskId")))NotioWidgetSyncWorker.schedule(context); }
        catch(Exception ignored) { /* Never show success when durable storage failed. */ }
        refresh(context);
    }
    private static void render(Context context,AppWidgetManager manager,int id) {
        RemoteViews views=new RemoteViews(context.getPackageName(),R.layout.notio_widget);
        int[] rows={R.id.notio_row1,R.id.notio_row2,R.id.notio_row3};
        int[] labels={R.id.notio_task1,R.id.notio_task2,R.id.notio_task3};
        int[] checks={R.id.notio_check1,R.id.notio_check2,R.id.notio_check3};
        for(int row:rows)views.setViewVisibility(row,View.GONE);
        try {
            JSONObject state=NotioWidgetStore.read(context),snapshot=state.optJSONObject("snapshot");
            JSONArray queue=state.optJSONArray("outbox"),tasks=snapshot==null?null:snapshot.optJSONArray("tasks");
            String status=state.optString("error",snapshot==null?"Open NotioX to set up":"");
            if(queue!=null&&queue.length()>0&&!state.optBoolean("authRequired")&&!state.optBoolean("paused"))status="Done locally - waiting to sync";
            views.setTextViewText(R.id.notio_status,status);
            views.setTextViewText(R.id.notio_level,snapshot==null?"NotioX":"Level "+snapshot.optInt("level",1)+" - "+snapshot.optInt("confirmedXp")+" XP");
            int count=manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,140)>=215?3:1;
            if(tasks!=null)for(int i=0;i<Math.min(count,tasks.length());i++) {
                JSONObject task=tasks.getJSONObject(i);String taskId=task.getString("id");boolean pending=false;
                if(queue!=null)for(int q=0;q<queue.length();q++)if(taskId.equals(queue.getJSONObject(q).optString("entityId")))pending=true;
                views.setViewVisibility(rows[i],View.VISIBLE);
                String title=state.optBoolean("privateTitles")?"Next step":task.optString("title");
                String parent=state.optBoolean("privateTitles")?"":task.optString("parentTitle","");
                if(parent.equals("null"))parent="";
                views.setTextViewText(labels[i],parent.isEmpty()?title:parent+"\n"+title);
                boolean done=pending||task.optBoolean("completed");
                views.setTextViewText(checks[i],done?"✓":"□");
                views.setBoolean(checks[i],"setEnabled",!done&&!state.optBoolean("authRequired")&&!state.optBoolean("paused"));
                Intent command=new Intent(context,NotioWidgetProvider.class).setAction(COMPLETE)
                    .setData(Uri.parse("notio-widget://complete/"+taskId)).putExtra("taskId",taskId);
                views.setOnClickPendingIntent(checks[i],PendingIntent.getBroadcast(context,0,command,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
            }
            views.setViewVisibility(R.id.notio_dolphin,snapshot!=null&&!snapshot.optBoolean("companionEnabled",true)?View.GONE:View.VISIBLE);
        }catch(Exception ignored) { views.setTextViewText(R.id.notio_status,"Open NotioX to set up"); }
        Intent open=new Intent(context,MainActivity.class).setAction(Intent.ACTION_VIEW).setData(Uri.parse("https://notiolive.com/home"));
        views.setOnClickPendingIntent(R.id.notio_level,PendingIntent.getActivity(context,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(id,views);
    }
}
