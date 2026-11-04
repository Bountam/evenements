package org.insertech.evenements;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Plugins maison : enregistrés avant super.onCreate
        registerPlugin(InsertechNatifPlugin.class);
        registerPlugin(ServeurLocalPlugin.class);
        super.onCreate(savedInstanceState);

        // Sauvegarde SQLite hors du navigateur (window.InsertechStockage), voir src/utils/sqliteBackup.ts
        getBridge().getWebView().addJavascriptInterface(new StorageBridge(getApplicationContext()), "InsertechStockage");
    }
}
