package com.savitarxeno.gco;

import com.getcapacitor.BridgeActivity;
import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
 public boolean mediaPipEnabled=false;
 public PictureInPictureParams mediaPipParams;
 @Override protected void onCreate(Bundle state){registerPlugin(MediaWindowPlugin.class);super.onCreate(state);}
 @Override public void onUserLeaveHint(){super.onUserLeaveHint();if(Build.VERSION.SDK_INT>=26&&mediaPipEnabled&&mediaPipParams!=null&&!isInPictureInPictureMode()){try{enterPictureInPictureMode(mediaPipParams);}catch(Exception ignored){}}}
 @Override public void onPictureInPictureModeChanged(boolean active,Configuration configuration){super.onPictureInPictureModeChanged(active,configuration);if(bridge!=null){bridge.getWebView().post(()->bridge.getWebView().evaluateJavascript("document.body.classList.toggle('gco-native-pip',"+active+");window.dispatchEvent(new CustomEvent('gco:native-pip',{detail:{active:"+active+"}}));",null));}}
}
