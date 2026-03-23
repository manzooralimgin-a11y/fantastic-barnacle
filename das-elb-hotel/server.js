const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PORT = parseInt(process.env.PORT, 10) || 5000;
const PUBLIC_DIR = path.join(__dirname, "public");

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
    if (info && req.headers["if-none-match"] === info.etag) {
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
    const shouldGzip = COMPRESSIBLE.has(contentType) && acceptEncoding.includes("gzip");

    const headers = {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "Accept-Ranges": "bytes",
    };
    if (info) {
      headers["ETag"] = info.etag;
      headers["Last-Modified"] = info.mtime;
      if (!shouldGzip) headers["Content-Length"] = String(info.size);
    }
    if (shouldGzip) {
      headers["Content-Encoding"] = "gzip";
      headers["Vary"] = "Accept-Encoding";
    }

    res.writeHead(200, headers);

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => { if (!res.writableEnded) res.end(); });
    res.on("error", () => stream.destroy());

    if (shouldGzip) {
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Das Elb Hotel running at http://0.0.0.0:${PORT}`);
});
