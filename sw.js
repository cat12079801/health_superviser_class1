// Service Worker。PWA としてのインストール要件（fetch ハンドラ）を満たし、
// オフラインでもアプリシェルと問題データを提供する。
//
// 方針:
// - 同一オリジンの GET のみを扱う。Supabase・CDN（esm.sh）等のクロスオリジンは
//   一切介入せずネットワークへ素通しする（認証・同期を壊さないため）。
// - network-first + キャッシュフォールバックとする。オンライン時は常に最新を取得し、
//   「問題を更新」機能（cache-bust）とも整合する。オフライン時のみキャッシュを返す。
// - キャッシュのキーは検索クエリを除いた URL に正規化する。cache-bust の `?t=...` で
//   キャッシュが無限に増えるのを防ぎ、オフライン時のフォールバックを一致させるため。
// - CACHE_VERSION を上げると古いキャッシュを activate 時に破棄する。

const CACHE_VERSION = "v1";
const CACHE = `hsc-${CACHE_VERSION}`;

// インストール時に先読みするアプリシェルと初期データ。
// これらが揃えば初回オフラインでも学習を開始できる。
const PRECACHE = [
  ".",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/quiz.js",
  "js/store.js",
  "js/sync.js",
  "js/config.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "data/categories.json",
  "data/law_general.json",
  "data/law_hazardous.json",
  "data/hygiene_general.json",
  "data/hygiene_hazardous.json",
  "data/physiology.json",
];

// クエリを除いた URL を保存キーとして使う。
function cacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  return url.toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 一部の先読みが失敗してもインストール自体は成功させる（堅牢性のため）。
      await Promise.allSettled(
        PRECACHE.map(async (path) => {
          try {
            const res = await fetch(path, { cache: "reload" });
            if (res.ok) await cache.put(cacheKey(new Request(path)), res.clone());
          } catch {
            /* 個別失敗は無視する */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET 以外は扱わない。
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // クロスオリジン（Supabase / esm.sh CDN 等）は素通しする。
  if (url.origin !== self.location.origin) return;

  const key = cacheKey(request);

  event.respondWith(
    (async () => {
      try {
        // オンライン時は最新を取得し、成功したらキャッシュを更新する。
        const res = await fetch(request);
        if (res && res.ok && res.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(key, res.clone());
        }
        return res;
      } catch {
        // オフライン等でネットワークが失敗した場合はキャッシュで応答する。
        const cache = await caches.open(CACHE);
        const cached = await cache.match(key);
        if (cached) return cached;
        // ナビゲーション要求はアプリシェル（index.html）を返す。
        if (request.mode === "navigate") {
          const shell =
            (await cache.match(cacheKey(new Request("index.html")))) ||
            (await cache.match(cacheKey(new Request("."))));
          if (shell) return shell;
        }
        throw new Error("offline and no cached response");
      }
    })()
  );
});
