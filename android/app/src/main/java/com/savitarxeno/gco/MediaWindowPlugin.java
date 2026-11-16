package com.savitarxeno.gco;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Rational;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="MediaWindow")
public class MediaWindowPlugin extends Plugin {
 @PluginMethod public void enterPip(PluginCall call){
  getActivity().runOnUiThread(()->{
   if(Build.VERSION.SDK_INT<26){call.reject("Picture-in-picture requiere Android 8 o posterior.");return;}
   try{int w=call.getInt("width",16),h=call.getInt("height",9);double ratio=Math.max(.42,Math.min(2.38,(double)Math.max(1,w)/Math.max(1,h)));
    MainActivity activity=(MainActivity)getActivity();activity.mediaPipParams=new PictureInPictureParams.Builder().setAspectRatio(new Rational((int)(ratio*10000),10000)).build();
    boolean entered=activity.enterPictureInPictureMode(activity.mediaPipParams);activity.mediaPipEnabled=entered;JSObject result=new JSObject();result.put("entered",entered);call.resolve(result);
   }catch(Exception error){call.reject("No se pudo abrir la ventana flotante. Revisa el permiso Picture-in-picture de GCO.",error);}
  });
 }
 @PluginMethod public void setAutoPip(PluginCall call){getActivity().runOnUiThread(()->{((MainActivity)getActivity()).mediaPipEnabled=call.getBoolean("enabled",false);call.resolve();});}
 @PluginMethod public void overlayStatus(PluginCall call){JSObject result=new JSObject();result.put("granted",Build.VERSION.SDK_INT<23||Settings.canDrawOverlays(getContext()));call.resolve(result);}
 @PluginMethod public void openOverlaySettings(PluginCall call) {
  getActivity().runOnUiThread(() -> {
   Intent intent = new Intent("android.settings.PICTURE_IN_PICTURE_SETTINGS", Uri.parse("package:" + getContext().getPackageName()));
   try {
    getActivity().startActivity(intent);
    call.resolve();
   } catch (Exception unavailable) {
    try {
     getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
     call.resolve();
    } catch (Exception error) { call.reject("Abre Ajustes > Aplicaciones > GCO > Imagen en imagen.", error); }
   }
  });
 }
}
