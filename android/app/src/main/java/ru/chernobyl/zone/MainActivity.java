package ru.chernobyl.zone;
import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.*;
import android.view.View;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.util.Collections;

public final class MainActivity extends Activity {
    private WebView web;
    private static final String LOCAL="appassets.androidplatform.net";
    private static final String SERVER="213-176-92-184.sslip.io";
    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        web=new WebView(this);setContentView(web);
        web.setBackgroundColor(0xff101510);
        web.setOnApplyWindowInsetsListener((view,insets)->{
            view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
        });
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(false);
        final WebViewAssetLoader loader=new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if(!"https".equals(uri.getScheme()))return blocked();
                if(LOCAL.equals(uri.getHost())){
                    WebResourceResponse response=loader.shouldInterceptRequest(uri);
                    return response==null?blocked():response;
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
