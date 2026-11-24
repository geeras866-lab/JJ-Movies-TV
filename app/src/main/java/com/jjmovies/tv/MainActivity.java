package com.jjmovies.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String SITE_URL = "https://jj-movies.pages.dev/?tv=1";

    public class TvBridge {
        @JavascriptInterface
        public void playVideo(String url) {
            playVideo(url, "JJ Movies");
        }

        @JavascriptInterface
        public void playVideo(String url, String title) {
            if (url == null || url.isEmpty()) return;
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, VlcPlayerActivity.class);
                intent.putExtra("VIDEO_URL", url);
                intent.putExtra("VIDEO_TITLE", title != null ? title : "JJ Movies");
                startActivity(intent);
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString("Mozilla/5.0 (Linux; Android 11; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 JJTV");

        TvBridge bridge = new TvBridge();
        webView.addJavascriptInterface(bridge, "AndroidVlc");
        webView.addJavascriptInterface(bridge, "AndroidTV");

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectTvNavigation();
            }
        });

        webView.requestFocus();
        webView.loadUrl(SITE_URL);
    }

    private void injectTvNavigation() {
        String js = "(function(){"
            + "if(window.__jjTvInit) return; window.__jjTvInit = true;"
            + "const style = document.createElement('style');"
            + "style.innerHTML = `"
            + "  *:focus, .tv-focus { outline: 3px solid #00f0ff !important; box-shadow: 0 0 18px #00f0ff !important; transform: scale(1.04); transition: transform 0.15s ease; z-index: 9999; }"
            + "  body { cursor: none; }"
            + "`;"
            + "document.head.appendChild(style);"
            + "function hookVideos(){"
            + "  document.querySelectorAll('video').forEach(v => {"
            + "    if(v.__vlcHooked) return; v.__vlcHooked = true;"
            + "    v.addEventListener('play', () => {"
            + "      const src = v.currentSrc || v.src;"
            + "      if(src && window.AndroidVlc){ v.pause(); window.AndroidVlc.playVideo(src, document.title || 'JJ Movies'); }"
            + "    });"
            + "  });"
            + "}"
            + "function makeFocusable(){"
            + "  document.querySelectorAll('a, button, input, [onclick], .movie-card, .card').forEach(el => {"
            + "    if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');"
            + "  });"
            + "  hookVideos();"
            + "}"
            + "makeFocusable();"
            + "new MutationObserver(makeFocusable).observe(document.body, {childList:true, subtree:true});"
            + "document.addEventListener('keydown', function(e){"
            + "  const focusables = Array.from(document.querySelectorAll('[tabindex=\"0\"], a, button, input')).filter(el => el.offsetParent !== null);"
            + "  if(!focusables.length) return;"
            + "  let curr = document.activeElement;"
            + "  if(!focusables.includes(curr)){ focusables[0].focus(); return; }"
            + "  const rect = curr.getBoundingClientRect();"
            + "  let best = null, bestDist = Infinity;"
            + "  const dir = e.key;"
            + "  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(dir)){"
            + "    e.preventDefault();"
            + "    focusables.forEach(el => {"
            + "      if(el === curr) return;"
            + "      const r = el.getBoundingClientRect();"
            + "      const dx = (r.left + r.width/2) - (rect.left + rect.width/2);"
            + "      const dy = (r.top + r.height/2) - (rect.top + rect.height/2);"
            + "      if(dir==='ArrowRight' && dx <= 10) return;"
            + "      if(dir==='ArrowLeft' && dx >= -10) return;"
            + "      if(dir==='ArrowDown' && dy <= 10) return;"
            + "      if(dir==='ArrowUp' && dy >= -10) return;"
            + "      const dist = (dir==='ArrowLeft'||dir==='ArrowRight') ? Math.abs(dx) + Math.abs(dy)*3 : Math.abs(dy) + Math.abs(dx)*3;"
            + "      if(dist < bestDist){ bestDist = dist; best = el; }"
            + "    });"
            + "    if(best){ best.focus(); best.scrollIntoView({behavior:'smooth', block:'center', inline:'center'}); }"
            + "  } else if(dir === 'Enter'){"
            + "    curr.click();"
            + "  }"
            + "});"
            + "})();";
        webView.evaluateJavascript(js, null);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
