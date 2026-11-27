(function () {
  "use strict";

  var TMDB_API_KEY = "5a43b1e87a10078ffb8f8e43df5e546e";
  var TMDB_CACHE_KEY = "jj_tmdb_tv_cache_v1";

  function isTvEnvironment() {
    var ua = navigator.userAgent || "";
    return /JJTV/i.test(ua) || /[?&]tv=1/i.test(window.location.search);
  }

  if (!isTvEnvironment()) return;
  if (window.__JJ_TV_UI_LOADED) return;
  window.__JJ_TV_UI_LOADED = true;

  var tvAllItems = [];
  var tvCurrentSection = "home";
  var tvSelectedCategory = "all";
  var tvHeroItems = [];
  var tvHeroIndex = 0;
  var tvHeroTimer = null;
  var tvLastFocusedBeforeDetails = null;
  var tvTmdbMemoryCache = {};

  try {
    var savedTmdb = localStorage.getItem(TMDB_CACHE_KEY);
    if (savedTmdb) tvTmdbMemoryCache = JSON.parse(savedTmdb) || {};
  } catch (e) {}

  function saveTmdbCache() {
    try {
      localStorage.setItem(TMDB_CACHE_KEY, JSON.stringify(tvTmdbMemoryCache));
    } catch (e) {}
  }

  function esc(val) {
    return String(val == null ? "" : val).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function showTvToast(msg) {
    var el = document.getElementById("jjTvToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "jjTvToast";
      el.style.cssText = "position:fixed;bottom:34px;left:50%;transform:translateX(-50%);z-index:999998;background:rgba(13,21,38,0.96);border:1.5px solid #ff2450;color:#fff;padding:12px 24px;border-radius:12px;font-size:15px;font-weight:800;box-shadow:0 12px 32px rgba(0,0,0,0.9);pointer-events:none;transition:opacity 0.2s;";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.style.opacity = "0";
    }, 2600);
  }

  function isPlayableItem(m) {
    if (!m) return false;
    if (String(m.type || m.content_type || "").toLowerCase() === "series") return true;
    return Boolean(m.stream1 || m.stream2 || m.stream_url_1 || m.stream_url_2);
  }

  function isDolbyMovie(m) {
    if (!m) return false;
    var s1 = String(m.stream1 || m.stream_url_1 || "");
    var s2 = String(m.stream2 || m.stream_url_2 || "");
    var blob = [
      m.title,
      m.description,
      m.pinLabel || m.pin_label,
      m.category,
      s1,
      s2
    ].join(" ");

    if (/dolby|atmos|ddp|dd\+|eac3|ac3|5\.1/i.test(blob)) return true;
    if (/^(?:https?:\/\/)?b2_[a-zA-Z0-9_-]+\//i.test(s1) || /^(?:https?:\/\/)?b2_[a-zA-Z0-9_-]+\//i.test(s2)) return true;
    if (/\.workers\.dev\//i.test(s1) || /\.workers\.dev\//i.test(s2)) return true;
    if (!/^https?:\/\//i.test(s1) && /\.(mkv|mp4)$/i.test(s1)) return true;
    return false;
  }

  function getHighResImage(url, preferBackdrop) {
    var raw = String(url || "").trim();
    if (!raw || raw.indexOf("http") !== 0) return "";
    if (raw.indexOf("image.tmdb.org/t/p/") !== -1) {
      return raw.replace(/\/t\/p\/[^\/]+/, preferBackdrop ? "/t/p/w1280" : "/t/p/w500");
    }
    return raw;
  }

  function cleanTitleForTmdb(rawTitle) {
    return String(rawTitle || "")
      .replace(/[\(\[\{].*?[\)\]\}]/g, " ")
      .replace(/\b(1080p|720p|480p|2160p|4k|uhd|hdr|dolby|atmos|ddp5\.1|dd5\.1|5\.1|eac3|ac3|hevc|x264|x265|bluray|web-dl|webrip|hdrip|telugu|hindi|tamil|english|dual audio|multi audio)\b/gi, " ")
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function fetchTmdbMeta(movie) {
    var fallbackBackdrop = getHighResImage(movie.poster, true);
    var fallbackPoster = getHighResImage(movie.poster, false);
    var fallbackObj = {
      backdrop: fallbackBackdrop,
      poster: fallbackPoster,
      overview: movie.description || "",
      vote: ""
    };

    if (!TMDB_API_KEY) return fallbackObj;

    var cacheKey = (movie.type === "series" ? "tv_" : "mv_") + String(movie.id || movie.title).toLowerCase();
    if (tvTmdbMemoryCache[cacheKey]) {
      var cached = tvTmdbMemoryCache[cacheKey];
      return {
        backdrop: cached.backdrop || fallbackBackdrop,
        poster: fallbackPoster || cached.poster || "",
        overview: movie.description || cached.overview || "",
        vote: cached.vote || ""
      };
    }

    var cleanTitle = cleanTitleForTmdb(movie.title);
    if (!cleanTitle) return fallbackObj;

    var kind = movie.type === "series" ? "tv" : "movie";
    var yearParam = movie.year
      ? (kind === "tv" ? "&first_air_date_year=" + encodeURIComponent(movie.year) : "&year=" + encodeURIComponent(movie.year))
      : "";

    try {
      var url = "https://api.themoviedb.org/3/search/" + kind +
        "?api_key=" + encodeURIComponent(TMDB_API_KEY) +
        "&include_adult=false&language=en-US&query=" + encodeURIComponent(cleanTitle) + yearParam;
      var res = await fetch(url);
      var data = await res.json();
      var hit = data && Array.isArray(data.results) ? data.results[0] : null;

      if (!hit && yearParam) {
        var retryUrl = "https://api.themoviedb.org/3/search/" + kind +
          "?api_key=" + encodeURIComponent(TMDB_API_KEY) +
          "&include_adult=false&language=en-US&query=" + encodeURIComponent(cleanTitle);
        var retryRes = await fetch(retryUrl);
        var retryData = await retryRes.json();
        hit = retryData && Array.isArray(retryData.results) ? retryData.results[0] : null;
      }

      if (hit) {
        var entry = {
          backdrop: hit.backdrop_path ? ("https://image.tmdb.org/t/p/w1280" + hit.backdrop_path) : "",
          poster: hit.poster_path ? ("https://image.tmdb.org/t/p/w500" + hit.poster_path) : "",
          overview: hit.overview || "",
          vote: hit.vote_average && hit.vote_average > 0 ? Number(hit.vote_average).toFixed(1) : ""
        };
        tvTmdbMemoryCache[cacheKey] = entry;
        saveTmdbCache();
        return {
          backdrop: entry.backdrop || fallbackBackdrop,
          poster: fallbackPoster || entry.poster || "",
          overview: movie.description || entry.overview || "",
          vote: entry.vote
        };
      }
    } catch (e) {}

    return fallbackObj;
  }

  // ---------- Direct Native LibVLC Launcher ----------
  async function resolveAndPlayInVlc(title, rawStream, backupStream, meta) {
    var chosen = String(rawStream || "").trim() || String(backupStream || "").trim();
    if (!chosen) {
      showTvToast("Stream link not available");
      return;
    }

    showTvToast("⚡ Loading in VLC Player...");

    try {
      var playableUrl = "";

      if (/^https?:\/\//i.test(chosen) && /[?&]sig=/i.test(chosen)) {
        playableUrl = chosen;
      } else if (/(?:pixeldrain\.com\/(?:u|api\/file)\/|^([A-Za-z0-9_-]{6,20})$)/i.test(chosen)) {
        var m = chosen.match(/pixeldrain\.com\/(?:u|api\/file)\/([A-Za-z0-9_-]+)/i);
        var pid = m ? m[1] : chosen;
        playableUrl = "https://pixeldrain.com/api/file/" + pid;
      } else {
        var workerFile = "";
        var b2Match = chosen.match(/^https?:\/\/(b2_[a-zA-Z0-9_-]+)\/(.+)$/i);
        if (b2Match) {
          workerFile = b2Match[1] + "/" + decodeURIComponent(b2Match[2].split("?")[0]);
        } else if (/^https?:\/\/[^\/]+\.workers\.dev\//i.test(chosen)) {
          try {
            var u = new URL(chosen);
            workerFile = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
          } catch (e) {}
        } else if (!/^https?:\/\//i.test(chosen)) {
          workerFile = chosen.replace(/^\/+/, "");
        }

        if (workerFile) {
          var qp = new URLSearchParams();
          qp.set("file", workerFile);
          if (meta && meta.id) qp.set("id", String(meta.id));
          if (meta && meta.episodeId) qp.set("episode_id", String(meta.episodeId));
          var tokRes = await fetch("./api/get-token?" + qp.toString(), { cache: "no-store" });
          if (!tokRes.ok) throw new Error("Token error (" + tokRes.status + ")");
          var tokData = await tokRes.json();
          if (!tokData || !tokData.url) throw new Error("Stream URL not found");
          playableUrl = String(tokData.url).trim();
        } else {
          playableUrl = chosen;
        }
      }

      if (window.AndroidVlc && typeof window.AndroidVlc.playVideo === "function") {
        window.AndroidVlc.playVideo(playableUrl, title || "JJ Movies TV");
      } else if (typeof window.openServerSelection === "function") {
        window.openServerSelection(title, playableUrl, backupStream, "token", meta);
      } else {
        window.location.href = playableUrl;
      }
    } catch (err) {
      if (backupStream && backupStream !== chosen) {
        resolveAndPlayInVlc(title, backupStream, "", meta);
      } else {
        showTvToast("Stream Error: " + (err && err.message ? err.message : "Failed"));
      }
    }
  }

  function getCustomLogoSrc() {
    try {
      if (window.__JJ_APP_LOGO__) return window.__JJ_APP_LOGO__;
      if (window.AndroidTV && typeof window.AndroidTV.getAppLogo === "function") {
        var logoData = window.AndroidTV.getAppLogo();
        if (logoData && logoData.indexOf("data:image") === 0) {
          window.__JJ_APP_LOGO__ = logoData;
          return logoData;
        }
      }
    } catch (e) {}
    return "";
  }

  function getJjSvgLogo(size) {
    var customSrc = getCustomLogoSrc();
    if (customSrc) {
      return '<img src="' + customSrc + '" alt="JJ Movies" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;border-radius:22%;display:block;position:relative;z-index:2;" />';
    }
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:2;">' +
        '<defs>' +
          '<linearGradient id="jjRedGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">' +
            '<stop offset="0%" stop-color="#ff2a38"/>' +
            '<stop offset="100%" stop-color="#b8000c"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<rect x="6" y="6" width="88" height="88" rx="22" fill="url(#jjRedGrad)"/>' +
        '<text x="50" y="66" text-anchor="middle" fill="#ffffff" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="46" letter-spacing="-2">JJ</text>' +
      '</svg>'
    );
  }

  function buildTvShell() {
    document.body.classList.add("jj-tv-active");

    if (!document.getElementById("jjTvSplash")) {
      var dots = "";
      for (var i = 1; i <= 12; i++) {
        dots += '<span style="--i:' + i + '"></span>';
      }
      var splash = document.createElement("div");
      splash.id = "jjTvSplash";
      splash.innerHTML =
        '<div class="jj-splash-logo-wrap">' +
          '<div class="jj-splash-glow"></div>' +
          getJjSvgLogo(106) +
        '</div>' +
        '<div class="jj-dot-spinner">' + dots + '</div>';
      document.body.appendChild(splash);
    }

    if (!document.getElementById("jjTvApp")) {
      var app = document.createElement("div");
      app.id = "jjTvApp";
      app.innerHTML =
        '<aside id="jjTvSidebar">' +
          '<div class="jj-tv-brand">' + getJjSvgLogo(52) + '</div>' +
          '<div class="jj-tv-nav-list">' +
            '<button type="button" class="jj-tv-nav-item active" data-nav="home">' +
              '<svg viewBox="0 0 24 24"><path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/></svg>' +
              '<span>Home</span>' +
            '</button>' +
            '<button type="button" class="jj-tv-nav-item" data-nav="series">' +
              '<svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zM10 8v6l5-3-5-3z"/></svg>' +
              '<span>Series</span>' +
            '</button>' +
            '<button type="button" class="jj-tv-nav-item" data-nav="movies">' +
              '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>' +
              '<span>Movies</span>' +
            '</button>' +
            '<button type="button" class="jj-tv-nav-item" data-nav="categories">' +
              '<svg viewBox="0 0 24 24"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>' +
              '<span>Categories</span>' +
            '</button>' +
            '<button type="button" class="jj-tv-nav-item" data-nav="search">' +
              '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>' +
              '<span>Search</span>' +
            '</button>' +
          '</div>' +
        '</aside>' +
        '<main id="jjTvMain">' +
          '<section id="jjTvHero"></section>' +
          '<div id="jjTvRows"></div>' +
          '<section id="jjTvSearchPanel">' +
            '<div class="jj-tv-search-bar">' +
              '<span style="font-size:20px;">🔍</span>' +
              '<input type="text" id="jjTvSearchInput" placeholder="Search movies, series, Dolby 5.1..." autocomplete="off" />' +
            '</div>' +
            '<div id="jjTvSearchGrid" class="jj-tv-search-grid"></div>' +
          '</section>' +
        '</main>' +
        '<section id="jjTvDetails"></section>';
      document.body.appendChild(app);

      app.querySelectorAll(".jj-tv-nav-item").forEach(function (btn) {
        btn.addEventListener("click", function () {
          switchTvNav(btn.getAttribute("data-nav"));
        });
      });

      var sInput = document.getElementById("jjTvSearchInput");
      if (sInput) {
        sInput.addEventListener("input", renderTvSearchResults);
      }
    }
  }

  function hideSplashScreen() {
    var splash = document.getElementById("jjTvSplash");
    if (splash && !splash.classList.contains("hide")) {
      setTimeout(function () {
        splash.classList.add("hide");
      }, 650);
    }
  }

  function normalizeItems(rawList) {
    return (Array.isArray(rawList) ? rawList : []).map(function (item) {
      var s1 = item.stream1 || item.stream_url_1 || item.stream_url || "";
      var s2 = item.stream2 || item.stream_url_2 || "";
      var mapped = {
        id: item.id,
        title: item.title || "Untitled",
        year: item.year || item.release_year || "",
        runtime: item.runtime || "",
        category: item.category || "",
        type: String(item.type || item.content_type || "movie").toLowerCase() === "series" ? "series" : "movie",
        poster: item.poster || item.poster_url || "",
        description: item.description || "",
        pinned: Boolean(item.pinned || item.is_pinned === true),
        pinLabel: String(item.pinLabel || item.pin_label || "").trim(),
        linkType: String(item.linkType || item.link_type || "token").toLowerCase().trim(),
        trailer: item.trailer || item.trailer_url || "",
        stream1: s1,
        stream2: s2
      };
      mapped.isDolby = isDolbyMovie(mapped);
      return mapped;
    }).filter(isPlayableItem);
  }

  function switchTvNav(navKey) {
    tvCurrentSection = navKey;
    document.querySelectorAll(".jj-tv-nav-item").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-nav") === navKey);
    });

    var hero = document.getElementById("jjTvHero");
    var rows = document.getElementById("jjTvRows");
    var searchPanel = document.getElementById("jjTvSearchPanel");

    if (navKey === "search") {
      if (hero) hero.style.display = "none";
      if (rows) rows.style.display = "none";
      if (searchPanel) searchPanel.classList.add("open");
      renderTvSearchResults();
      var inp = document.getElementById("jjTvSearchInput");
      if (inp) setTvFocus(inp);
      return;
    }

    if (searchPanel) searchPanel.classList.remove("open");
    if (hero) hero.style.display = "block";
    if (rows) rows.style.display = "block";

    renderHeroAndRows();
  }

  function getFilteredBaseItems() {
    if (tvCurrentSection === "series") {
      return tvAllItems.filter(function (m) { return m.type === "series"; });
    }
    if (tvCurrentSection === "movies") {
      return tvAllItems.filter(function (m) { return m.type === "movie"; });
    }
    if (tvCurrentSection === "categories" && tvSelectedCategory !== "all") {
      return tvAllItems.filter(function (m) {
        return String(m.category || "").toLowerCase() === tvSelectedCategory.toLowerCase();
      });
    }
    return tvAllItems;
  }

  function renderHeroAndRows() {
    var base = getFilteredBaseItems();
    var pinned = base.filter(function (m) { return m.pinned; });
    tvHeroItems = (pinned.length ? pinned : base).slice(0, 5);
    tvHeroIndex = 0;

    renderHeroSlide(0);
    if (tvHeroTimer) clearInterval(tvHeroTimer);
    if (tvHeroItems.length > 1) {
      tvHeroTimer = setInterval(function () {
        if (document.getElementById("jjTvDetails").classList.contains("open")) return;
        tvHeroIndex = (tvHeroIndex + 1) % tvHeroItems.length;
        renderHeroSlide(tvHeroIndex);
      }, 6500);
    }

    var rowsContainer = document.getElementById("jjTvRows");
    if (!rowsContainer) return;
    rowsContainer.innerHTML = "";

    if (tvCurrentSection === "categories") {
      var cats = ["all"];
      tvAllItems.forEach(function (m) {
        if (m.category && cats.indexOf(m.category) === -1) cats.push(m.category);
      });
      var catBar = document.createElement("div");
      catBar.className = "jj-det-seasons";
      catBar.style.marginBottom = "20px";
      cats.forEach(function (cat) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "jj-det-season-tab" + (tvSelectedCategory === cat ? " active" : "");
        btn.textContent = cat === "all" ? "ALL CATEGORIES" : cat.toUpperCase();
        btn.addEventListener("click", function () {
          tvSelectedCategory = cat;
          renderHeroAndRows();
        });
        catBar.appendChild(btn);
      });
      rowsContainer.appendChild(catBar);
    }

    var top10List = base.slice(0, 10);
    if (top10List.length) {
      var topTitle = tvCurrentSection === "series"
        ? "Top 10 Series in JJ Movies Today"
        : "Top 10 Movies in JJ Movies Today";
      rowsContainer.appendChild(buildRowElement(topTitle, top10List, true));
    }

    var dolbyList = base.filter(function (m) { return m.isDolby; });
    if (dolbyList.length) {
      rowsContainer.appendChild(buildRowElement("Dolby 5.1 Surround Audio", dolbyList, false));
    }

    if (tvCurrentSection === "home") {
      var latestMovies = base.filter(function (m) { return m.type === "movie"; });
      if (latestMovies.length) {
        rowsContainer.appendChild(buildRowElement("Latest Movies", latestMovies, false));
      }
      var seriesList = base.filter(function (m) { return m.type === "series"; });
      if (seriesList.length) {
        rowsContainer.appendChild(buildRowElement("Popular Web Series", seriesList, false));
      }
    }

    var categoryMap = {};
    base.forEach(function (m) {
      var c = String(m.category || "").trim();
      if (!c) return;
      if (!categoryMap[c]) categoryMap[c] = [];
      categoryMap[c].push(m);
    });
    Object.keys(categoryMap).forEach(function (catName) {
      if (categoryMap[catName].length) {
        rowsContainer.appendChild(buildRowElement(catName + " Collection", categoryMap[catName], false));
      }
    });
  }

  async function renderHeroSlide(idx) {
    var heroEl = document.getElementById("jjTvHero");
    if (!heroEl) return;
    var movie = tvHeroItems[idx];
    if (!movie) {
      heroEl.style.display = "none";
      return;
    }
    heroEl.style.display = "block";
    var tmdb = await fetchTmdbMeta(movie);
    var bgUrl = tmdb.backdrop;
    var descText = tmdb.overview || "Stream in Full HD with instant playback on JJ Movies TV.";
    var dotsHtml = tvHeroItems.map(function (_, i) {
      return '<span class="jj-hero-dot' + (i === idx ? " active" : "") + '"></span>';
    }).join("");

    var hadPlayFocus = document.activeElement && document.activeElement.id === "jjHeroPlayBtn";

    heroEl.innerHTML =
      (bgUrl ? '<img class="jj-hero-bg" src="' + esc(bgUrl) + '" alt="' + esc(movie.title) + '">' : '') +
      '<div class="jj-hero-gradient"></div>' +
      '<div class="jj-hero-content">' +
        '<div class="jj-hero-brand-tag">' +
          '<span class="jj-tag-red">' + esc(movie.pinLabel || (movie.type === "series" ? "JJ SERIES" : "JJ FILM")) + '</span>' +
          (movie.isDolby ? '<span class="jj-tag-dolby">DOLBY 5.1</span>' : '') +
          '<span class="jj-tag-meta">HD</span>' +
          (tmdb.vote ? '<span class="jj-tag-meta" style="color:#facc15;">★ ' + esc(tmdb.vote) + '</span>' : '') +
          (movie.year ? '<span class="jj-tag-meta">' + esc(movie.year) + '</span>' : '') +
          (movie.runtime ? '<span class="jj-tag-meta">' + esc(movie.runtime) + '</span>' : '') +
        '</div>' +
        '<h1 class="jj-hero-title">' + esc(movie.title) + '</h1>' +
        '<p class="jj-hero-desc">' + esc(descText) + '</p>' +
        '<div class="jj-hero-actions">' +
          '<button type="button" id="jjHeroPlayBtn" class="jj-btn-play-white">▶ Play Now</button>' +
          '<button type="button" id="jjHeroInfoBtn" class="jj-btn-info-dark">ⓘ Details</button>' +
        '</div>' +
        '<div class="jj-hero-dots">' + dotsHtml + '</div>' +
      '</div>';

    var playBtn = document.getElementById("jjHeroPlayBtn");
    var infoBtn = document.getElementById("jjHeroInfoBtn");
    if (playBtn) {
      playBtn.addEventListener("click", function () {
        if (movie.type === "series") {
          openTvDetails(movie);
        } else {
          resolveAndPlayInVlc(movie.title, movie.stream1, movie.stream2, { id: movie.id });
        }
      });
      if (hadPlayFocus || !document.querySelector(".tv-focused")) {
        setTvFocus(playBtn);
      }
    }
    if (infoBtn) {
      infoBtn.addEventListener("click", function () {
        openTvDetails(movie);
      });
    }
  }

  function buildRowElement(title, items, isTop10) {
    var sec = document.createElement("section");
    sec.className = "jj-tv-row";

    var h2 = document.createElement("h2");
    h2.className = "jj-tv-row-title";
    h2.textContent = title;
    sec.appendChild(h2);

    var track = document.createElement("div");
    track.className = "jj-tv-row-track";

    items.forEach(function (movie, idx) {
      track.appendChild(buildCardElement(movie, isTop10 ? (idx + 1) : 0));
    });

    sec.appendChild(track);
    return sec;
  }

  function buildCardElement(movie, rankNum) {
    var card = document.createElement("div");
    card.className = "jj-tv-card" + (rankNum > 0 ? " top10-card" : "");
    card.setAttribute("tabindex", "0");

    var posterSrc = getHighResImage(movie.poster, false);
    var innerPoster =
      (movie.isDolby ? '<span class="jj-card-dolby-pill">DOLBY 5.1</span>' : '') +
      (posterSrc
        ? '<img src="' + esc(posterSrc) + '" alt="' + esc(movie.title) + '" loading="lazy">'
        : '<div class="jj-card-fallback">' + esc(movie.title) + '</div>') +
      '<span class="jj-card-bottom-tag">' + (rankNum > 0 ? "Recently added" : (movie.type === "series" ? "Series" : "Watch Now")) + '</span>';

    if (rankNum > 0) {
      card.innerHTML =
        '<span class="jj-top10-rank">' + rankNum + '</span>' +
        '<div class="jj-top10-poster-box">' + innerPoster + '</div>';
    } else {
      card.innerHTML = innerPoster;
    }

    var img = card.querySelector("img");
    if (img) {
      img.onerror = function () {
        fetchTmdbMeta(movie).then(function (tmdb) {
          if (tmdb.poster && img.src !== tmdb.poster) {
            img.src = tmdb.poster;
          } else {
            var fb = document.createElement("div");
            fb.className = "jj-card-fallback";
            fb.textContent = movie.title;
            img.replaceWith(fb);
          }
        });
      };
    } else {
      fetchTmdbMeta(movie).then(function (tmdb) {
        if (tmdb.poster) {
          var fbEl = card.querySelector(".jj-card-fallback");
          if (fbEl) {
            var newImg = document.createElement("img");
            newImg.src = tmdb.poster;
            newImg.alt = movie.title;
            newImg.loading = "lazy";
            fbEl.replaceWith(newImg);
          }
        }
      });
    }

    card.addEventListener("click", function () {
      openTvDetails(movie);
    });

    return card;
  }

  // ---------- Clean Full-Screen Details (Zero Telegram / Zero Downloads) ----------
  async function openTvDetails(movie) {
    var det = document.getElementById("jjTvDetails");
    if (!det) return;
    tvLastFocusedBeforeDetails = document.activeElement;

    var tmdb = await fetchTmdbMeta(movie);
    var bgUrl = tmdb.backdrop;
    var descText = tmdb.overview || "Watch in high definition with instant streaming on JJ Movies TV.";
    var isSeriesItem = movie.type === "series";
    var audioLabel = movie.isDolby
      ? "Dolby 5.1 Surround • Multi Audio"
      : "Stereo HD Audio • Direct Stream";

    var actionsHtml = "";
    if (!isSeriesItem) {
      actionsHtml += '<button type="button" id="jjDetPlayMain" class="jj-det-btn primary">▶ Play</button>';
      if (movie.stream1 && movie.stream2) {
        actionsHtml += '<button type="button" id="jjDetPlayS2" class="jj-det-btn">🚀 Server 2</button>';
      }
    }
    if (movie.trailer) {
      actionsHtml += '<a href="' + esc(movie.trailer) + '" target="_blank" rel="noopener noreferrer" class="jj-det-btn">🎬 Trailer</a>';
    }
    actionsHtml += '<button type="button" id="jjDetBackBtn" class="jj-det-btn">← Back</button>';

    det.innerHTML =
      (bgUrl ? '<img class="jj-det-backdrop" src="' + esc(bgUrl) + '" alt="' + esc(movie.title) + '">' : '') +
      '<div class="jj-det-vignette"></div>' +
      '<div class="jj-det-body">' +
        '<div class="jj-det-top-brand">' +
          '<span class="jj-tag-red">' + (isSeriesItem ? "JJ SERIES" : "JJ MOVIES") + '</span>' +
          (movie.category ? '<span class="jj-tag-meta">' + esc(movie.category) + '</span>' : '') +
        '</div>' +
        '<h1 class="jj-det-title">' + esc(movie.title) + '</h1>' +
        '<div class="jj-det-meta-row">' +
          (movie.year ? '<span>' + esc(movie.year) + '</span>' : '') +
          (tmdb.vote ? '<span style="color:#facc15;">★ ' + esc(tmdb.vote) + ' TMDB</span>' : '') +
          '<span class="jj-det-badge">U/A 13+</span>' +
          (movie.runtime ? '<span>' + esc(movie.runtime) + '</span>' : '') +
          '<span class="jj-det-badge">HD</span>' +
          (movie.isDolby ? '<span class="jj-det-badge dolby">DOLBY 5.1</span>' : '') +
        '</div>' +
        '<div class="jj-det-audio-line">' + esc(audioLabel) + '</div>' +
        '<p class="jj-det-desc">' + esc(descText) + '</p>' +
        '<div class="jj-det-actions">' + actionsHtml + '</div>' +
        (isSeriesItem ? '<div id="jjDetSeriesArea"><p style="color:#94a3b8;">Loading episodes...</p></div>' : '') +
        '<div id="jjDetMoreLike"></div>' +
      '</div>';

    det.classList.add("open");
    det.scrollTop = 0;

    var playMain = document.getElementById("jjDetPlayMain");
    if (playMain) {
      playMain.addEventListener("click", function () {
        resolveAndPlayInVlc(movie.title, movie.stream1, movie.stream2, { id: movie.id });
      });
      setTvFocus(playMain);
    }

    var playS2 = document.getElementById("jjDetPlayS2");
    if (playS2) {
      playS2.addEventListener("click", function () {
        resolveAndPlayInVlc(movie.title, movie.stream2, movie.stream1, { id: movie.id });
      });
    }

    var backBtn = document.getElementById("jjDetBackBtn");
    if (backBtn) {
      backBtn.addEventListener("click", closeTvDetails);
      if (!playMain) setTvFocus(backBtn);
    }

    if (isSeriesItem) {
      loadTvSeriesEpisodes(movie);
    }

    var related = tvAllItems.filter(function (x) {
      return String(x.id) !== String(movie.id) &&
        ((movie.category && x.category === movie.category) || x.type === movie.type);
    }).slice(0, 10);
    var moreBox = document.getElementById("jjDetMoreLike");
    if (moreBox && related.length) {
      moreBox.appendChild(buildRowElement("More Like This", related, false));
    }
  }

  async function loadTvSeriesEpisodes(movie) {
    var area = document.getElementById("jjDetSeriesArea");
    if (!area) return;
    try {
      var res = await fetch("./api/movies?type=episodes&movie_id=" + encodeURIComponent(movie.id), { cache: "no-store" });
      var eps = await res.json();
      if (!Array.isArray(eps) || !eps.length) {
        area.innerHTML = '<p style="color:#94a3b8;">No episodes available yet.</p>';
        return;
      }

      var seasons = [];
      eps.forEach(function (e) {
        var s = Number(e.season_number) || 1;
        if (seasons.indexOf(s) === -1) seasons.push(s);
      });
      seasons.sort(function (a, b) { return a - b; });
      var activeSeason = seasons[0];

      function renderSeason() {
        var tabsHtml = '<div class="jj-det-seasons">' + seasons.map(function (s) {
          return '<button type="button" class="jj-det-season-tab' + (s === activeSeason ? " active" : "") + '" data-s="' + s + '">Season ' + s + '</button>';
        }).join("") + '</div>';

        var list = eps.filter(function (e) {
          return (Number(e.season_number) || 1) === activeSeason && (e.stream_url_1 || e.stream_url_2);
        });

        var gridHtml = '<div class="jj-det-ep-grid">' + list.map(function (ep) {
          return (
            '<button type="button" class="jj-det-ep-card" data-epid="' + esc(ep.id) + '">' +
              '<strong style="font-size:14px;">▶ Episode ' + esc(ep.episode_number) + '</strong>' +
              '<span style="font-size:11px;opacity:0.85;">' + esc(ep.title || (movie.isDolby ? "Dolby 5.1 Audio" : "HD Stream")) + '</span>' +
            '</button>'
          );
        }).join("") + '</div>';

        area.innerHTML = tabsHtml + gridHtml;

        area.querySelectorAll(".jj-det-season-tab").forEach(function (tab) {
          tab.addEventListener("click", function () {
            activeSeason = Number(tab.getAttribute("data-s"));
            renderSeason();
          });
        });

        var firstEp = area.querySelector(".jj-det-ep-card");
        if (firstEp) setTvFocus(firstEp);

        area.querySelectorAll(".jj-det-ep-card").forEach(function (epBtn) {
          epBtn.addEventListener("click", function () {
            var ep = eps.find(function (x) { return String(x.id) === epBtn.getAttribute("data-epid"); });
            if (!ep) return;
            var label = movie.title + " • S" + activeSeason + " E" + ep.episode_number;
            resolveAndPlayInVlc(label, ep.stream_url_1, ep.stream_url_2, { id: movie.id, episodeId: ep.id });
          });
        });
      }

      renderSeason();
    } catch (err) {
      area.innerHTML = '<p style="color:#f87171;">Unable to load episodes.</p>';
    }
  }

  function closeTvDetails() {
    var det = document.getElementById("jjTvDetails");
    if (!det || !det.classList.contains("open")) return;
    det.classList.remove("open");
    det.innerHTML = "";
    if (tvLastFocusedBeforeDetails && document.body.contains(tvLastFocusedBeforeDetails)) {
      setTvFocus(tvLastFocusedBeforeDetails);
    } else {
      var fallback = document.getElementById("jjHeroPlayBtn") || document.querySelector(".jj-tv-card");
      if (fallback) setTvFocus(fallback);
    }
  }

  function renderTvSearchResults() {
    var grid = document.getElementById("jjTvSearchGrid");
    var inp = document.getElementById("jjTvSearchInput");
    if (!grid) return;
    var q = (inp ? inp.value : "").trim().toLowerCase();
    var matches = tvAllItems.filter(function (m) {
      if (!q) return true;
      if (q === "dolby" && m.isDolby) return true;
      return (m.title || "").toLowerCase().indexOf(q) !== -1 ||
        (m.category || "").toLowerCase().indexOf(q) !== -1 ||
        (m.description || "").toLowerCase().indexOf(q) !== -1;
    });
    grid.innerHTML = "";
    matches.forEach(function (m) {
      grid.appendChild(buildCardElement(m, 0));
    });
  }

  // ---------- Spatial D-Pad Remote Navigation ----------
  function setTvFocus(el) {
    if (!el) return;
    document.querySelectorAll(".tv-focused").forEach(function (prev) {
      prev.classList.remove("tv-focused");
    });
    el.classList.add("tv-focused");
    try {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    } catch (e) {}
  }

  function getActiveFocusPool() {
    var det = document.getElementById("jjTvDetails");
    if (det && det.classList.contains("open")) {
      return Array.from(det.querySelectorAll("button, a, .jj-tv-card")).filter(function (el) {
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    }
    return Array.from(document.querySelectorAll("#jjTvSidebar .jj-tv-nav-item, #jjTvMain button, #jjTvMain input, #jjTvMain .jj-tv-card")).filter(function (el) {
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function navigateDpad(dir) {
    var pool = getActiveFocusPool();
    if (!pool.length) return;
    var cur = document.querySelector(".tv-focused") || document.activeElement;
    if (!cur || pool.indexOf(cur) === -1) {
      setTvFocus(pool[0]);
      return;
    }

    var cr = cur.getBoundingClientRect();
    var cx = cr.left + cr.width / 2;
    var cy = cr.top + cr.height / 2;
    var best = null;
    var bestScore = Infinity;

    pool.forEach(function (el) {
      if (el === cur) return;
      var r = el.getBoundingClientRect();
      var tx = r.left + r.width / 2;
      var ty = r.top + r.height / 2;
      var dx = tx - cx;
      var dy = ty - cy;

      var ok = false;
      var score = Infinity;
      if (dir === "ArrowRight" && dx > 10) {
        ok = true;
        score = dx + Math.abs(dy) * 2.8;
      } else if (dir === "ArrowLeft" && dx < -10) {
        ok = true;
        score = Math.abs(dx) + Math.abs(dy) * 2.8;
      } else if (dir === "ArrowDown" && dy > 10) {
        ok = true;
        score = dy + Math.abs(dx) * 1.6;
      } else if (dir === "ArrowUp" && dy < -10) {
        ok = true;
        score = Math.abs(dy) + Math.abs(dx) * 1.6;
      }

      if (ok && score < bestScore) {
        bestScore = score;
        best = el;
      }
    });

    if (best) setTvFocus(best);
  }

  window.handleTvBack = function () {
    var det = document.getElementById("jjTvDetails");
    if (det && det.classList.contains("open")) {
      closeTvDetails();
      return "handled";
    }
    if (tvCurrentSection !== "home") {
      switchTvNav("home");
      return "handled";
    }
    return "exit";
  };

  document.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      navigateDpad(k);
    } else if (k === "Enter") {
      var cur = document.querySelector(".tv-focused") || document.activeElement;
      if (cur && cur.tagName !== "INPUT") {
        e.preventDefault();
        cur.click();
      }
    } else if (k === "Escape" || k === "Backspace") {
      var active = document.activeElement;
      if (active && active.tagName === "INPUT" && active.value) return;
      if (window.handleTvBack() === "handled") {
        e.preventDefault();
      }
    }
  }, true);

  function ingestMovies(list) {
    tvAllItems = normalizeItems(list);
    renderHeroAndRows();
    hideSplashScreen();
  }

  var origApply = window.applyMoviesData;
  window.applyMoviesData = function (data) {
    if (typeof origApply === "function") {
      try { origApply(data); } catch (e) {}
    }
    ingestMovies(data);
  };

  buildTvShell();

  if (Array.isArray(window.movies) && window.movies.length) {
    ingestMovies(window.movies);
  } else {
    fetch("./api/movies?type=movies", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!tvAllItems.length) ingestMovies(data);
      })
      .catch(function () {
        hideSplashScreen();
      });
  }
})();
