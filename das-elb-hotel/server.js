const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT, 10) || 5000;
const PUBLIC_DIR = path.join(__dirname, "public");
const API_BASE_URL = process.env.PUBLIC_API_BASE_URL || "http://localhost:8000/api";
const HOTEL_PROPERTY_ID = parseInt(process.env.PUBLIC_HOTEL_PROPERTY_ID || "546", 10) || 546;
const RESTAURANT_ID = parseInt(process.env.PUBLIC_RESTAURANT_ID || "4240", 10) || 4240;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const COMPRESSIBLE = new Set([
  "text/html; charset=utf-8",
  "text/css; charset=utf-8",
  "application/javascript; charset=utf-8",
  "application/json; charset=utf-8",
  "image/svg+xml",
]);

const HTML_EXTENSIONS = new Set([".html", ""]);

// ETag / stat cache — cleared on SIGHUP for zero-downtime refresh
const statCache = new Map();

function getCachedStat(filePath) {
  if (!statCache.has(filePath)) {
    try {
      const s = fs.statSync(filePath);
      statCache.set(filePath, {
        etag: `"${s.size.toString(36)}-${s.mtimeMs.toString(36)}"`,
        mtime: s.mtime.toUTCString(),
        size: s.size,
      });
    } catch {
      return null;
    }
  }
  return statCache.get(filePath);
}

process.on("SIGHUP", () => statCache.clear());

function getCacheControl(urlPath, ext) {
  if (urlPath.startsWith("/_next/static/")) {
    // Content-hashed bundles: cache forever
    return "public, max-age=31536000, immutable";
  }
  if ([".jpg",".jpeg",".webp",".avif",".png",".ico",
       ".mp4",".webm",".woff",".woff2",".ttf"].includes(ext)) {
    return "public, max-age=604800, stale-while-revalidate=86400";
  }
  if ([".css",".js"].includes(ext)) {
    return "public, max-age=3600, stale-while-revalidate=3600";
  }
  return "no-cache, must-revalidate";
}

function buildInjectedScripts() {
  return [
    "<script id=\"das-elb-runtime-config\">",
    `window.API_BASE_URL=${JSON.stringify(API_BASE_URL)};`,
    `window.HOTEL_PROPERTY_ID=${JSON.stringify(HOTEL_PROPERTY_ID)};`,
    `window.RESTAURANT_ID=${JSON.stringify(RESTAURANT_ID)};`,
    "</script>",
    "<script src=\"/assets/api-integration.js\"></script>",
    "<script src=\"/assets/landing-performance.js\" defer></script>",
    "<script src=\"/assets/sw-register.js\" defer></script>",
  ].join("");
}

function stripNextFontAssetReferences(html) {
  if (!html) {
    return html;
  }

  return html
    .replace(/<link rel="preload" as="font"[^>]+href="\/_next\/static\/media\/[^"]+"[^>]*>/g, "")
    .replace(/:HL\[[^\]]+\](?:\\n|\n)?/g, "");
}

function stripNextFontFaceBlocks(css) {
  if (!css) {
    return css;
  }

  return css.replace(/@font-face\{[^}]*src:url\(\/_next\/static\/media\/[^)]+\)[^}]*\}/g, "");
}

function injectClientScripts(html) {
  let result = stripNextFontAssetReferences(html);

  if (!result.includes("das-elb-runtime-config")) {
    result = result.replace(
      "</head>",
      [
        "<script id=\"das-elb-runtime-config\">",
        `window.API_BASE_URL=${JSON.stringify(API_BASE_URL)};`,
        `window.HOTEL_PROPERTY_ID=${JSON.stringify(HOTEL_PROPERTY_ID)};`,
        `window.RESTAURANT_ID=${JSON.stringify(RESTAURANT_ID)};`,
        "</script>",
        "</head>",
      ].join(""),
    );
  }

  const scriptTags = [
    "<script src=\"/assets/api-integration.js\"></script>",
    "<script src=\"/assets/landing-performance.js\" defer></script>",
    "<script src=\"/assets/sw-register.js\" defer></script>",
  ];

  for (const tag of scriptTags) {
    const srcMatch = tag.match(/src="([^"]+)"/);
    const src = srcMatch ? srcMatch[1] : "";
    if (src && result.includes(src)) {
      continue;
    }
    if (result.includes("</head>")) {
      result = result.replace("</head>", `${tag}</head>`);
    } else if (result.includes("</body>")) {
      result = result.replace("</body>", `${tag}</body>`);
    } else {
      result += tag;
    }
  }

  return result;
}

process.on("uncaughtException", (err) => console.error("Uncaught:", err.message));
process.on("unhandledRejection", (reason) => console.error("Unhandled:", reason));

const server = http.createServer((req, res) => {
  req.on("error", () => { if (!res.writableEnded) res.end(); });

  try {
    let urlPath = req.url.split("?")[0];
    if (urlPath === "/") urlPath = "/index.html";

    let filePath = path.join(PUBLIC_DIR, urlPath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const requestedExt = path.extname(urlPath).toLowerCase();
    const isHtmlRequest = HTML_EXTENSIONS.has(requestedExt);

    if (!fs.existsSync(filePath)) {
      if (isHtmlRequest) {
        const htmlPath = filePath.endsWith(".html") ? filePath : filePath + ".html";
        if (fs.existsSync(htmlPath)) {
          filePath = htmlPath;
        } else {
          const notFoundPath = path.join(PUBLIC_DIR, "404.html");
          if (fs.existsSync(notFoundPath)) {
            res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
            fs.createReadStream(notFoundPath).pipe(res);
          } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
          }
          return;
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const cacheControl = getCacheControl(urlPath, ext);
    const info = getCachedStat(filePath);

    // Conditional GET via ETag
    if (!isHtmlRequest && info && req.headers["if-none-match"] === info.etag) {
      res.writeHead(304, {
        "ETag": info.etag,
        "Cache-Control": cacheControl,
        "Last-Modified": info.mtime,
      });
      res.end();
      return;
    }

    // Range request (video seeking)
    if (req.headers.range && [".mp4", ".webm"].includes(ext)) {
      const fileSize = info ? info.size : fs.statSync(filePath).size;
      const m = req.headers.range.match(/bytes=(\d*)-(\d*)/);
      if (m) {
        const start = parseInt(m[1], 10) || 0;
        const end = m[2] ? parseInt(m[2], 10) : fileSize - 1;
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
          "Content-Type": contentType,
          "Cache-Control": cacheControl,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    const acceptEncoding = req.headers["accept-encoding"] || "";
    const shouldBrotli = COMPRESSIBLE.has(contentType) && acceptEncoding.includes("br");
    const shouldGzip = !shouldBrotli && COMPRESSIBLE.has(contentType) && acceptEncoding.includes("gzip");

    const headers = {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "Accept-Ranges": "bytes",
      // Security headers
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    };

    if (isHtmlRequest) {
      const html = injectClientScripts(fs.readFileSync(filePath, "utf8"));
      const body = Buffer.from(html, "utf8");
      const etag = `"${body.length.toString(36)}-${(info?.mtime || new Date(0).toUTCString()).length.toString(36)}-html"`;

      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, {
          "ETag": etag,
          "Cache-Control": cacheControl,
          "Last-Modified": info?.mtime || new Date(0).toUTCString(),
        });
        res.end();
        return;
      }

      headers["ETag"] = etag;
      if (info) {
        headers["Last-Modified"] = info.mtime;
      }
      if (shouldBrotli) {
        headers["Content-Encoding"] = "br";
        headers["Vary"] = "Accept-Encoding";
      } else if (shouldGzip) {
        headers["Content-Encoding"] = "gzip";
        headers["Vary"] = "Accept-Encoding";
      } else {
        headers["Content-Length"] = String(body.length);
      }

      res.writeHead(200, headers);

      if (shouldBrotli) {
        zlib.brotliCompress(body, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
        }, (err, compressed) => {
          if (err) {
            if (!res.writableEnded) res.end();
            return;
          }
          res.end(compressed);
        });
      } else if (shouldGzip) {
        zlib.gzip(body, { level: 6, memLevel: 8 }, (err, compressed) => {
          if (err) {
            if (!res.writableEnded) res.end();
            return;
          }
          res.end(compressed);
        });
      } else {
        res.end(body);
      }
      return;
    }

    if (ext === ".css") {
      const css = stripNextFontFaceBlocks(fs.readFileSync(filePath, "utf8"));
      const body = Buffer.from(css, "utf8");
      const etag = `"${body.length.toString(36)}-${(info?.mtime || new Date(0).toUTCString()).length.toString(36)}-css"`;

      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, {
          "ETag": etag,
          "Cache-Control": cacheControl,
          "Last-Modified": info?.mtime || new Date(0).toUTCString(),
        });
        res.end();
        return;
      }

      headers["ETag"] = etag;
      if (info) {
        headers["Last-Modified"] = info.mtime;
      }
      if (shouldBrotli) {
        headers["Content-Encoding"] = "br";
        headers["Vary"] = "Accept-Encoding";
      } else if (shouldGzip) {
        headers["Content-Encoding"] = "gzip";
        headers["Vary"] = "Accept-Encoding";
      } else {
        headers["Content-Length"] = String(body.length);
      }

      res.writeHead(200, headers);

      if (shouldBrotli) {
        zlib.brotliCompress(body, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
        }, (err, compressed) => {
          if (err) {
            if (!res.writableEnded) res.end();
            return;
          }
          res.end(compressed);
        });
      } else if (shouldGzip) {
        zlib.gzip(body, { level: 6, memLevel: 8 }, (err, compressed) => {
          if (err) {
            if (!res.writableEnded) res.end();
            return;
          }
          res.end(compressed);
        });
      } else {
        res.end(body);
      }
      return;
    }

    if (info) {
      headers["ETag"] = info.etag;
      headers["Last-Modified"] = info.mtime;
      if (!shouldGzip && !shouldBrotli) headers["Content-Length"] = String(info.size);
    }
    if (shouldBrotli) {
      headers["Content-Encoding"] = "br";
      headers["Vary"] = "Accept-Encoding";
    } else if (shouldGzip) {
      headers["Content-Encoding"] = "gzip";
      headers["Vary"] = "Accept-Encoding";
    }

    res.writeHead(200, headers);

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => { if (!res.writableEnded) res.end(); });
    res.on("error", () => stream.destroy());

    if (shouldBrotli) {
      const br = zlib.createBrotliCompress({
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
      });
      br.on("error", () => { if (!res.writableEnded) res.end(); });
      stream.pipe(br).pipe(res);
    } else if (shouldGzip) {
      const gz = zlib.createGzip({ level: 6, memLevel: 8 });
      gz.on("error", () => { if (!res.writableEnded) res.end(); });
      stream.pipe(gz).pipe(res);
    } else {
      stream.pipe(res);
    }
  } catch (err) {
    if (!res.headersSent) res.writeHead(500);
    if (!res.writableEnded) res.end();
  }
});

server.on("error", (err) => console.error("Server error:", err.message));

server.listen(PORT, HOST, () => {
  console.log(`Das Elb Hotel running at http://${HOST}:${PORT}`);
});
