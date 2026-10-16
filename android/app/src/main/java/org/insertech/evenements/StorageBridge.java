package org.insertech.evenements;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

/**
 * Sauvegarde SQLite de la tablette, exposée à la page sous window.InsertechStockage.
 * Même format que le compagnon du lanceur PC : une table records(tbl, id, event_id, json) remplacée en entier à
 * chaque sauvegarde, et un instantané sans activité refusé (« vide ») tant que la page ne l'autorise pas, pour
 * qu'une base du navigateur effacée n'écrase pas la sauvegarde.
 */
public class StorageBridge extends SQLiteOpenHelper {

    private static final String DB_NAME = "insertech.db";
    private static final String[] TABLES = {"events", "tickets", "technicians", "participants", "attendees"};
    private static final int BACKUPS_KEPT = 10;

    public StorageBridge(Context context) {
        super(context, DB_NAME, null, 1);
        backupOnStart(context);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE records (tbl TEXT NOT NULL, id TEXT NOT NULL, event_id TEXT, json TEXT NOT NULL, PRIMARY KEY (tbl, id))");
        db.execSQL("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
    }

    /** Copie la base au lancement (avant toute écriture) dans sauvegardes-sqlite/, en gardant les 10 dernières. */
    private static void backupOnStart(Context context) {
        try {
            File source = context.getDatabasePath(DB_NAME);
            if (!source.exists() || source.length() == 0) return;
            File dir = new File(context.getFilesDir(), "sauvegardes-sqlite");
            if (!dir.exists() && !dir.mkdirs()) return;
            String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
            try (InputStream in = new FileInputStream(source);
                 OutputStream out = new FileOutputStream(new File(dir, "insertech-" + stamp + ".db"))) {
                byte[] buffer = new byte[16384];
                int n;
                while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            }
            File[] copies = dir.listFiles((d, name) -> name.startsWith("insertech-") && name.endsWith(".db"));
            if (copies != null && copies.length > BACKUPS_KEPT) {
                Arrays.sort(copies, (a, b) -> a.getName().compareTo(b.getName()));
                for (int i = 0; i < copies.length - BACKUPS_KEPT; i++) copies[i].delete();
            }
        } catch (Exception ignored) {
            // Une copie manquée ne doit pas empêcher l'application de démarrer.
        }
    }

    @JavascriptInterface
    public synchronized String save(String body) {
        try {
            JSONObject root = new JSONObject(body);
            JSONObject tables = root.optJSONObject("tables");
            if (tables == null) return "{\"ok\":false,\"error\":\"format\"}";
            boolean allowEmpty = root.optBoolean("allowEmpty", false);
            long savedAt = root.optLong("savedAt", 0);
            JSONArray events = tables.optJSONArray("events");
            int incomingEvents = events == null ? 0 : events.length();

            SQLiteDatabase db = getWritableDatabase();
            db.beginTransaction();
            try {
                if (incomingEvents == 0 && !allowEmpty) {
                    try (Cursor c = db.rawQuery("SELECT COUNT(*) FROM records WHERE tbl = 'events'", null)) {
                        if (c.moveToFirst() && c.getLong(0) > 0) return "{\"ok\":false,\"error\":\"vide\"}";
                    }
                }
                db.delete("records", null, null);
                for (String table : TABLES) {
                    JSONArray rows = tables.optJSONArray(table);
                    if (rows == null) continue;
                    for (int i = 0; i < rows.length(); i++) {
                        JSONObject row = rows.optJSONObject(i);
                        if (row == null || !row.has("id")) continue;
                        ContentValues values = new ContentValues();
                        values.put("tbl", table);
                        values.put("id", String.valueOf(row.opt("id")));
                        Object eventId = "events".equals(table) ? row.opt("id") : row.opt("eventId");
                        if (eventId != null && eventId != JSONObject.NULL) values.put("event_id", String.valueOf(eventId));
                        values.put("json", row.toString());
                        db.insertWithOnConflict("records", null, values, SQLiteDatabase.CONFLICT_REPLACE);
                    }
                }
                ContentValues meta = new ContentValues();
                meta.put("key", "savedAt");
                meta.put("value", String.valueOf(savedAt));
                db.insertWithOnConflict("meta", null, meta, SQLiteDatabase.CONFLICT_REPLACE);
                db.setTransactionSuccessful();
            } finally {
                db.endTransaction();
            }
            return "{\"ok\":true}";
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"erreur\"}";
        }
    }

    /** Renvoie {"savedAt":…,"tables":{…}}, ou null si rien n'a encore été sauvegardé. */
    @JavascriptInterface
    public synchronized String load() {
        try {
            SQLiteDatabase db = getReadableDatabase();
            JSONObject tables = new JSONObject();
            int count = 0;
            for (String table : TABLES) {
                JSONArray rows = new JSONArray();
                try (Cursor c = db.rawQuery("SELECT json FROM records WHERE tbl = ?", new String[]{table})) {
                    while (c.moveToNext()) {
                        rows.put(new JSONObject(c.getString(0)));
                        count++;
                    }
                }
                tables.put(table, rows);
            }
            if (count == 0) return "null";
            long savedAt = 0;
            try (Cursor c = db.rawQuery("SELECT value FROM meta WHERE key = 'savedAt'", null)) {
                if (c.moveToFirst()) savedAt = Long.parseLong(c.getString(0));
            }
            JSONObject result = new JSONObject();
            result.put("savedAt", savedAt);
            result.put("tables", tables);
            return result.toString();
        } catch (Exception e) {
            return "null";
        }
    }
}
