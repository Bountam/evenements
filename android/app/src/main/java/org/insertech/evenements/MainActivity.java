package org.insertech.evenements;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Les plugins maison (lots suivants) s'enregistrent ici, avant super.onCreate : registerPlugin(...)
        super.onCreate(savedInstanceState);

        // Sauvegarde SQLite hors du navigateur (window.InsertechStockage), voir src/utils/sqliteBackup.ts
        getBridge().getWebView().addJavascriptInterface(new StorageBridge(getApplicationContext()), "InsertechStockage");
    }
}
