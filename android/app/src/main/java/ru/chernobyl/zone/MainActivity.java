package ru.chernobyl.zone;
import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.*;
import android.view.View;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.util.Collections;

public final class MainActivity extends Activity {
    private WebView web;
    public final class DeviceSession {
        private javax.crypto.SecretKey key() throws Exception {
            java.security.KeyStore store=java.security.KeyStore.getInstance("AndroidKeyStore");store.load(null);
            if(!store.containsAlias("zone-login")) {
                javax.crypto.KeyGenerator generator=javax.crypto.KeyGenerator.getInstance("AES","AndroidKeyStore");
                generator.init(new android.security.keystore.KeyGenParameterSpec.Builder("zone-login",3)
                    .setBlockModes("GCM").setEncryptionPaddings("NoPadding").build());generator.generateKey();
            }
            return (javax.crypto.SecretKey)store.getKey("zone-login",null);
        }
        @JavascriptInterface public synchronized boolean save(String value) {
            try {
                javax.crypto.Cipher cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");cipher.init(javax.crypto.Cipher.ENCRYPT_MODE,key());
                String iv=android.util.Base64.encodeToString(cipher.getIV(),2);
                String encrypted=android.util.Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)),2);
                return getSharedPreferences("private-login",MODE_PRIVATE).edit().putString("value",iv+":"+encrypted).commit();
            }catch(Exception e){return false;}
        }
        @JavascriptInterface public synchronized String read() {
            try {
                String value=getSharedPreferences("private-login",MODE_PRIVATE).getString("value","");if(value.isEmpty())return "";
                String[] parts=value.split(":");javax.crypto.Cipher cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(javax.crypto.Cipher.DECRYPT_MODE,key(),new javax.crypto.spec.GCMParameterSpec(128,android.util.Base64.decode(parts[0],2)));
                return new String(cipher.doFinal(android.util.Base64.decode(parts[1],2)),java.nio.charset.StandardCharsets.UTF_8);
            }catch(Exception e){clear();return "";}
        }
        @JavascriptInterface public synchronized void clear(){getSharedPreferences("private-login",MODE_PRIVATE).edit().clear().commit();}
        @JavascriptInterface public void exit(){runOnUiThread(()->finishAndRemoveTask());}
    }

    private static final String LOCAL="appassets.androidplatform.net";
    private static final String SERVER="213-176-92-184.sslip.io";
    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        android.widget.FrameLayout frame=new android.widget.FrameLayout(this);
        frame.setBackgroundColor(0xff101510);
        web=new WebView(this);frame.addView(web,new android.widget.FrameLayout.LayoutParams(-1,-1));setContentView(frame);
        web.setBackgroundColor(0xff101510);
        frame.setOnApplyWindowInsetsListener((view,insets)->{
            int left,top,right,bottom;
            if(android.os.Build.VERSION.SDK_INT>=30){
                android.graphics.Insets safe=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout()|android.view.WindowInsets.Type.ime());
                left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;
            }else{left=insets.getSystemWindowInsetLeft();top=insets.getSystemWindowInsetTop();right=insets.getSystemWindowInsetRight();bottom=insets.getSystemWindowInsetBottom();}
            view.setPadding(left,top,right,bottom);return insets;
        });
        frame.requestApplyInsets();
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if(!"https".equals(uri.getScheme()))return blocked();
                if(LOCAL.equals(uri.getHost())){
                    String path=uri.getPath();
                    if(path==null||!path.startsWith("/assets/")||path.contains("..")||path.contains("\\"))return blocked();
                    try {
                        InputStream content=getAssets().open(path.substring(8));
                        String extension=MimeTypeMap.getFileExtensionFromUrl(path);
                        String mime=MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
                        if("js".equals(extension))mime="application/javascript";
                        if(mime==null)mime="application/octet-stream";
                        return new WebResourceResponse(mime,"UTF-8",content);
                    } catch(IOException error){return blocked();}
                }
                // Static images never fall back to GitHub or the game server.
                if(SERVER.equals(uri.getHost())&&(uri.getPath().startsWith("/api/")||uri.getPath().startsWith("/avatars/")))return null;
                return blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                return !"https".equals(uri.getScheme())||!LOCAL.equals(uri.getHost())||!uri.getPath().startsWith("/assets/");
            }
        });
        web.addJavascriptInterface(new DeviceSession(),"DeviceSession");
        web.setWebChromeClient(new WebChromeClient());
        web.loadUrl("https://"+LOCAL+"/assets/index.html");
    }
    @Override public void onBackPressed(){
        web.evaluateJavascript("typeof openScreen==='function' ? openScreen('main') : null",null);
    }
    @Override protected void onPause(){super.onPause();web.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
