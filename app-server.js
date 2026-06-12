/**
 * 六盘山 app-server.js V3.2
 * 静态文件服务器 + gzip/brotli压缩 + ETag缓存 + 策略引擎触发接口
 * 启动: node app-server.js
 * 地址: http://localhost:9090
 */

const http = require("http");
const zlib = require("zlib");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = 9090;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
};

const REDIRECTS = {
  "/gumo-app": "/",
  "/gumo-app.html": "/",
  "/gumo": "/",
};

// ========== 策略引擎触发接口 ==========
function runStrategy(phase, callback) {
  const cmd = "cd " + ROOT + " && git fetch origin && git reset --hard origin/main && /usr/bin/node run-strategy.js " + phase;
  console.log("[策略触发] " + phase + " @ " + new Date().toISOString());
  exec(cmd, { timeout: 120000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    const output = (stdout || "") + (stderr || "");
    if (err && err.killed) {
      callback(null, { success: false, output: output + "\n[超时] 策略执行超过120秒", phase: phase });
    } else if (err) {
      callback(null, { success: false, output: output + "\n[错误] " + err.message, phase: phase });
    } else {
      console.log("[策略完成] " + phase);
      callback(null, { success: true, output: output, phase: phase });
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  let urlPath = req.url.split("?")[0];
  
  // ========== 策略引擎 API ==========
  if (urlPath === "/api/run-phase1" && req.method === "POST") {
    runStrategy("phase1", (err, result) => {
      res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    });
    return;
  }
  
  if (urlPath === "/api/run-phase2" && req.method === "POST") {
    runStrategy("phase2", (err, result) => {
      res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    });
    return;
  }
  
  // 策略执行状态查询
  if (urlPath === "/api/strategy-status") {
    try {
      const marketData = JSON.parse(fs.readFileSync(path.join(ROOT, "market-data.json"), "utf-8"));
      const top2Data = fs.existsSync(path.join(ROOT, "top2.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "top2.json"), "utf-8")) : null;
      res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        phase: marketData.phase || "unknown",
        date: marketData.date,
        candidates: marketData.totalCandidates || 0,
        stocks: (marketData.stocks || []).length,
        top2: top2Data ? top2Data.top2 : null,
        phaseTime: marketData.phaseTime
      }));
      return;
    } catch(e) {
      res.writeHead(500, { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  // ========== 静态文件 ==========
  if (REDIRECTS[urlPath]) {
    res.writeHead(302, { "Location": REDIRECTS[urlPath] });
    res.end();
    return;
  }
  
  if (urlPath === "/") urlPath = "/gumo-app.html";
  
  const filePath = path.join(ROOT, urlPath);
  
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  
  // Stat first for ETag + Content-Length + conditional request
  fs.stat(filePath, (statErr, stat) => {
    if (statErr) {
      res.writeHead(302, { "Location": "/" });
      res.end();
      return;
    }

    // ETag: inode-size-mtime
    const etag = '"' + stat.ino + "-" + stat.size + "-" + Math.floor(stat.mtimeMs) + '"';
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch === etag) {
      res.writeHead(304, { "ETag": etag, "Cache-Control": "no-cache" });
      res.end();
      return;
    }

    // Check if client supports compression
    const acceptEncoding = req.headers["accept-encoding"] || "";
    const canGzip = /\bgzip\b/.test(acceptEncoding) && stat.size > 1024;
    const canBrotli = /\bbr\b/.test(acceptEncoding) && stat.size > 1024;

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(302, { "Location": "/" });
        res.end();
        return;
      }

      // Cache strategy: HTML 5min, static assets 1h, SW never cache
      let cacheControl;
      if (urlPath.endsWith("sw.js")) {
        cacheControl = "no-store";
      } else if (ext === ".html") {
        cacheControl = "public, max-age=300";
      } else if (ext === ".json") {
        cacheControl = "public, max-age=60";
      } else {
        cacheControl = "public, max-age=3600, immutable";
      }

      const baseHeaders = {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": cacheControl,
        "ETag": etag,
        "Vary": "Accept-Encoding",
      };

      if (urlPath.endsWith("sw.js")) {
        baseHeaders["Service-Worker-Allowed"] = "/";
      }

      // Compress response
      if (canBrotli) {
        const compressed = zlib.brotliCompressSync(data);
        baseHeaders["Content-Encoding"] = "br";
        baseHeaders["Content-Length"] = compressed.length;
        res.writeHead(200, baseHeaders);
        res.end(compressed);
      } else if (canGzip) {
        const compressed = zlib.gzipSync(data, { level: 6 });
        baseHeaders["Content-Encoding"] = "gzip";
        baseHeaders["Content-Length"] = compressed.length;
        res.writeHead(200, baseHeaders);
        res.end(compressed);
      } else {
        baseHeaders["Content-Length"] = data.length;
        res.writeHead(200, baseHeaders);
        res.end(data);
      }
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  ◆ 六盘山 V3.2 服务器 + 策略引擎");
  console.log("  ──────────────────────────────");
  console.log("  本地:    http://localhost:" + PORT);
  console.log("  压缩:    gzip/brotli 自动");
  console.log("  缓存:    ETag + Cache-Control");
  console.log("  API:     POST /api/run-phase1  (触发6张)");
  console.log("  API:     POST /api/run-phase2  (触发2张)");
  console.log("  API:     GET  /api/strategy-status");
  console.log("  管理后台: http://localhost:" + PORT + "/admin.html");
  console.log("  退出:    Ctrl+C");
  console.log("");
});
