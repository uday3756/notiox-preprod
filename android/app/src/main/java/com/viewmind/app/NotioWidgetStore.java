package com.viewmind.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** One encrypted, atomic account snapshot/outbox. Tokens never enter RemoteViews. */
public final class NotioWidgetStore {
    private static final String KEY = "notio_widget_key_v1";
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(KEY)) return (SecretKey) store.getKey(KEY, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    public static synchronized JSONObject read(Context context) throws Exception {
        String stored = context.getSharedPreferences("notio_widget", Context.MODE_PRIVATE).getString("encrypted", "");
        if (stored.isEmpty()) return new JSONObject();
        String[] parts = stored.split(":", 2);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8));
    }
    public static synchronized void write(Context context, JSONObject value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
            Base64.encodeToString(cipher.doFinal(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!context.getSharedPreferences("notio_widget", Context.MODE_PRIVATE).edit().putString("encrypted", encrypted).commit())
            throw new Exception("Widget storage unavailable");
    }
    public static synchronized void session(Context context, String account, String token, boolean privateTitles, String assignment) throws Exception {
        JSONObject state = read(context);
        if (!account.equals(state.optString("accountId"))) state = new JSONObject().put("epoch", UUID.randomUUID().toString());
        else if(!token.equals(state.optString("accessToken")))state.put("epoch",UUID.randomUUID().toString());
        state.put("accountId", account).put("accessToken", token).put("privateTitles", privateTitles)
            .put("assignment", assignment).put("authRequired", false).put("paused",false);
        write(context, state);
    }
    public static synchronized void clear(Context context) {
        context.getSharedPreferences("notio_widget", Context.MODE_PRIVATE).edit().clear().commit();
    }
    public static synchronized void pause(Context context,String account) throws Exception {
        JSONObject state=read(context);
        if(!account.equals(state.optString("accountId"))) { clear(context);return; }
        state.put("paused",true).put("error","Widget temporarily unavailable");write(context,state);
    }
    public static synchronized boolean queue(Context context, String id) throws Exception {
        JSONObject state = read(context), snapshot = state.optJSONObject("snapshot");
        if (snapshot == null || state.optBoolean("authRequired") || state.optBoolean("paused") || !state.has("accountId")) return false;
        JSONArray queue = state.optJSONArray("outbox"); if (queue == null) queue = new JSONArray();
        for (int i=0; i<queue.length(); i++) if (id.equals(queue.getJSONObject(i).optString("entityId"))) return false;
        JSONArray tasks = snapshot.optJSONArray("tasks"); if (tasks == null) return false;
        for (int i=0; i<tasks.length(); i++) {
            JSONObject task = tasks.getJSONObject(i);
            if (!id.equals(task.optString("id"))) continue;
            queue.put(new JSONObject().put("entityId", id).put("desiredState", true)
                .put("expectedRevision", task.getInt("revision")).put("actionId", UUID.randomUUID().toString()).put("source", "android-widget"));
            state.put("outbox", queue); state.remove("error"); write(context, state); return true;
        }
        return false;
    }
    public static synchronized void acknowledge(Context context, String epoch, String actionId, JSONObject result) throws Exception {
        JSONObject state = read(context); if (!epoch.equals(state.optString("epoch"))) return;
        JSONArray old = state.optJSONArray("outbox"), next = new JSONArray();
        if (old != null) for (int i=0; i<old.length(); i++) if (!actionId.equals(old.getJSONObject(i).optString("actionId"))) next.put(old.get(i));
        JSONObject snapshot=state.optJSONObject("snapshot");
        if(snapshot!=null) {
            snapshot.put("confirmedXp",result.optInt("confirmedXp")).put("level",result.optInt("level",1));
            JSONArray tasks=snapshot.optJSONArray("tasks");
            if(tasks!=null)for(int i=0;i<tasks.length();i++) {
                JSONObject task=tasks.getJSONObject(i);
                if(result.optString("entityId").equals(task.optString("id")))task.put("completed",true).put("revision",result.optInt("revision"));
            }
        }
        state.put("outbox", next); write(context,state);
    }
    public static synchronized void snapshot(Context context, String epoch, JSONObject snapshot) throws Exception {
        JSONObject state = read(context);
        if (!epoch.equals(state.optString("epoch")) || !state.optString("accountId").equals(snapshot.optString("accountId"))) return;
        state.put("snapshot", snapshot);
        if(state.optJSONArray("failedActions")==null||state.getJSONArray("failedActions").length()==0)state.remove("error");
        write(context,state);
    }
    public static synchronized void reject(Context context, String epoch, String actionId) throws Exception {
        JSONObject state=read(context);if(!epoch.equals(state.optString("epoch")))return;
        JSONArray queue=state.optJSONArray("outbox"),next=new JSONArray(),failed=state.optJSONArray("failedActions");
        if(failed==null)failed=new JSONArray();
        if(queue!=null)for(int i=0;i<queue.length();i++) {
            JSONObject action=queue.getJSONObject(i);
            if(actionId.equals(action.optString("actionId")))failed.put(action);else next.put(action);
        }
        state.put("outbox",next).put("failedActions",failed).put("error","Task changed. Review in NotioX.");write(context,state);
    }
    public static synchronized void error(Context context, String epoch, String message, boolean auth) throws Exception {
        JSONObject state=read(context); if (!epoch.equals(state.optString("epoch"))) return;
        state.put("error",message).put("authRequired",auth); write(context,state);
    }
}
