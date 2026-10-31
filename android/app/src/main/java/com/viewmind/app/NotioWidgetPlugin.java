package com.viewmind.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="NotioWidget")
public class NotioWidgetPlugin extends Plugin {
    @PluginMethod public void configure(PluginCall call) {
        String account=call.getString("accountId"),token=call.getString("accessToken");
        if(account==null||token==null||account.isEmpty()||token.isEmpty()) { call.reject("Missing session");return; }
        try {
            NotioWidgetStore.session(getContext(),account,token,Boolean.TRUE.equals(call.getBoolean("privateTitles",false)),call.getString("assignment",""));
            NotioWidgetSyncWorker.schedule(getContext());NotioWidgetProvider.refresh(getContext());call.resolve();
        }catch(Exception error) { call.reject("Couldn't save widget session"); }
    }
    @PluginMethod public void clear(PluginCall call) {
        NotioWidgetSyncWorker.cancel(getContext());NotioWidgetStore.clear(getContext());NotioWidgetProvider.refresh(getContext());call.resolve();
    }
    @PluginMethod public void pause(PluginCall call) {
        NotioWidgetSyncWorker.cancel(getContext());
        try { NotioWidgetStore.pause(getContext(),call.getString("accountId",""));NotioWidgetProvider.refresh(getContext());call.resolve(); }
        catch(Exception error) {call.reject("Couldn't pause widget");}
    }
}
