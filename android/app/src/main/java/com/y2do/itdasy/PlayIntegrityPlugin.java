package com.y2do.itdasy;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest;

@CapacitorPlugin(name = "PlayIntegrity")
public class PlayIntegrityPlugin extends Plugin {
    private StandardIntegrityManager manager;
    private StandardIntegrityTokenProvider tokenProvider;
    private long preparedProjectNumber = 0L;

    @PluginMethod
    public void prepare(PluginCall call) {
        Long projectNumber = call.getLong("cloudProjectNumber");
        if (projectNumber == null || projectNumber <= 0L) {
            call.reject("cloudProjectNumber is required");
            return;
        }
        if (tokenProvider != null && preparedProjectNumber == projectNumber) {
            JSObject result = new JSObject();
            result.put("prepared", true);
            result.put("cached", true);
            call.resolve(result);
            return;
        }
        if (manager == null) {
            manager = IntegrityManagerFactory.createStandard(getContext());
        }
        manager.prepareIntegrityToken(
            PrepareIntegrityTokenRequest.builder()
                .setCloudProjectNumber(projectNumber)
                .build()
        ).addOnSuccessListener(provider -> {
            tokenProvider = provider;
            preparedProjectNumber = projectNumber;
            JSObject result = new JSObject();
            result.put("prepared", true);
            result.put("cached", false);
            call.resolve(result);
        }).addOnFailureListener(exception -> {
            tokenProvider = null;
            preparedProjectNumber = 0L;
            call.reject("prepare failed", exception);
        });
    }

    @PluginMethod
    public void requestToken(PluginCall call) {
        String requestHash = call.getString("requestHash", "");
        if (requestHash == null || requestHash.trim().isEmpty()) {
            call.reject("requestHash is required");
            return;
        }
        if (tokenProvider == null) {
            call.reject("token provider is not prepared");
            return;
        }
        tokenProvider.request(
            StandardIntegrityTokenRequest.builder()
                .setRequestHash(requestHash)
                .build()
        ).addOnSuccessListener(response -> {
            JSObject result = new JSObject();
            result.put("token", response.token());
            call.resolve(result);
        }).addOnFailureListener(exception -> call.reject("request failed", exception));
    }
}
