package com.viewmind.app;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;

/** JobScheduler owns delivery while the WebView is closed. The encrypted queue survives restarts. */
public class NotioWidgetSyncWorker extends JobService {
    static final int JOB_ID=78401;
    public static void schedule(Context context) {
        JobScheduler jobs=(JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        jobs.schedule(new JobInfo.Builder(JOB_ID,new ComponentName(context,NotioWidgetSyncWorker.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
            .setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());
    }
    public static void cancel(Context context) { ((JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(JOB_ID); }
    private volatile boolean stopped=false;
    @Override public boolean onStartJob(JobParameters params) {
        stopped=false;
        new Thread(() -> { boolean retry=deliver(); NotioWidgetProvider.refresh(this); if(!stopped)jobFinished(params,retry); }).start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) { stopped=true; return true; }
    private JSONObject request(String path,String token,JSONObject body) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL("https://notiolive.com"+path).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
        connection.setRequestProperty("Authorization","Bearer "+token);
        try {
            if(body!=null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setRequestProperty("Content-Type","application/json");
                try(java.io.OutputStream output=connection.getOutputStream()) { output.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
            }
            int status=connection.getResponseCode();
            if(status!=200) return new JSONObject().put("httpStatus",status);
            try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[4096];int size;
                while((size=input.read(buffer))!=-1) { output.write(buffer,0,size); if(output.size()>262144)throw new Exception("Oversized widget response"); }
                return new JSONObject(output.toString("UTF-8")).put("httpStatus",status);
            }
        } finally { connection.disconnect(); }
    }
    private boolean deliver() {
        String epoch="";
        try {
            JSONObject state=NotioWidgetStore.read(this); epoch=state.optString("epoch");
            if(state.optString("accessToken").isEmpty()||state.optBoolean("authRequired")||state.optBoolean("paused"))return false;
            String token=state.getString("accessToken"),account=state.getString("accountId");
            JSONArray queue=state.optJSONArray("outbox");
            if(queue!=null)for(int i=0;i<queue.length();i++) {
                if(stopped)return true;
                JSONObject current=NotioWidgetStore.read(this);
                if(!epoch.equals(current.optString("epoch"))||current.optBoolean("paused"))return false;
                JSONObject command=queue.getJSONObject(i),result=request("/api/v1/widgets/completion",token,command);
                int status=result.getInt("httpStatus");
                if(status==401) { NotioWidgetStore.error(this,epoch,"Open NotioX to sign in",true);return false; }
                if(status==409||status==400||status==404) {
                    NotioWidgetStore.reject(this,epoch,command.getString("actionId"));continue;
                }
                if(status!=200||!account.equals(result.optString("accountId")))return true;
                NotioWidgetStore.acknowledge(this,epoch,command.getString("actionId"),result);
            }
            String assignment=state.optString("assignment");
            JSONObject snapshot=request("/api/v1/widgets/snapshot"+(assignment.isEmpty()?"":"?assignment="+java.net.URLEncoder.encode(assignment,"UTF-8")),token,null);
            if(snapshot.optInt("httpStatus")==401) { NotioWidgetStore.error(this,epoch,"Open NotioX to sign in",true);return false; }
            if(snapshot.optInt("httpStatus")!=200)return true;
            NotioWidgetStore.snapshot(this,epoch,snapshot);return false;
        } catch(Exception error) {
            try { NotioWidgetStore.error(this,epoch,"Waiting to sync",false); }catch(Exception ignored){}
            return true;
        }
    }
}
