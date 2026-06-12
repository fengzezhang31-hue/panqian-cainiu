/**
 * 六盘山 app-server.js V3.2
 * 静态文件服务器 + gzip/brotli压缩 + ETag缓存 + 策略引擎触发接口
 * 启动: node app-server.js
 * 地址: http://localhost:9090
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var crypto = require('crypto');
var { exec } = require('child_process');

var PORT = process.env.PORT || 9090;
var ROOT = process.env.ROOT || __dirname;

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

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
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function getETag(content) {
  return '"' + crypto.createHash('md5').update(content).digest('hex').substring(0, 12) + '"';
}

function compressStream(req, res, raw, contentType, filePath, callback) {
  var acceptEncoding = (req.headers['accept-encoding'] || '').toLowerCase();
  var useBrotli = acceptEncoding.includes('br');
  var useGzip = !useBrotli && acceptEncoding.includes('gzip');
  
  var etag = getETag(raw);
  var reqEtag = req.headers['if-none-match'];
  
  if (reqEtag && reqEtag === etag) {
    res.writeHead(304, {
      ...corsHeaders(),
      'ETag': etag,
      'Cache-Control': 'public, max-age=300'
    });
    res.end();
    return;
  }

  var headers = {
    ...corsHeaders(),
    'Content-Type': contentType,
    'ETag': etag,
    'Cache-Control': 'public, max-age=300',
    'Vary': 'Accept-Encoding'
  };

  if (useBrotli && raw.length > 1024) {
    zlib.brotliCompress(raw, (err, compressed) => {
      if (err) { fallback(); return; }
      headers['Content-Encoding'] = 'br';
      headers['Content-Length'] = compressed.length;
      res.writeHead(200, headers);
      res.end(compressed);
    });
  } else if (useGzip && raw.length > 1024) {
    zlib.gzip(raw, (err, compressed) => {
      if (err) { fallback(); return; }
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = compressed.length;
      res.writeHead(200, headers);
      res.end(compressed);
    });
  } else {
    fallback();
  }

  function fallback() {
    headers['Content-Length'] = raw.length;
    res.writeHead(200, headers);
    res.end(raw);
  }
}

var server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  var urlPath = (new URL(req.url, 'http://localhost')).pathname;
  if (urlPath === '/') urlPath = '/gumo-app.html';

  // API routes
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

  if (urlPath === "/api/strategy-status") {
    try {
      const marketData = fs.existsSync(path.join(ROOT, "market-data.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "market-data.json"), "utf8")) : {};
      const top2Data = fs.existsSync(path.join(ROOT, "top2.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "top2.json"), "utf8")) : null;
      const status = {
        phase: marketData.phase || "unknown",
        date: marketData.date || "",
        candidates: marketData.totalCandidates || 0,
        stocks: marketData.stocks ? marketData.stocks.length : 0,
        top2: top2Data ? top2Data.top2 : [],
        phaseTime: marketData.phaseTime || ""
      };
      res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(status));
    } catch(e) {
      res.writeHead(500, { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Static files
  var filePath = path.join(ROOT, urlPath.replace(/^\//, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, corsHeaders());
    res.end("403 Forbidden");
    return;
  }

  try {
    var raw = fs.readFileSync(filePath);
    var ext = path.extname(filePath).toLowerCase();
    var contentType = MIME[ext] || 'application/octet-stream';
    
    if (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.json' || ext === '.svg' || ext === '.txt' || ext === '.md') {
      compressStream(req, res, raw, contentType, filePath);
    } else {
      res.writeHead(200, {
        ...corsHeaders(),
        'Content-Type': contentType,
        'Content-Length': raw.length,
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(raw);
    }
  } catch(e) {
    if (e.code === 'ENOENT') {
      res.writeHead(404, corsHeaders());
      res.end("404 Not Found");
    } else {
      res.writeHead(500, corsHeaders());
      res.end("500 Internal Server Error");
    }
  }
});

server.listen(PORT, () => {
  console.log("");
  console.log("  六盘山 app-server V3.2");
  console.log("  地址:     http://localhost:" + PORT);
  console.log("  压缩:     gzip + brotli 自适应");
  console.log("  缓存:     ETag + Cache-Control");
  console.log("  API:     POST /api/run-phase1  (触发6张)");
  console.log("  API:     POST /api/run-phase2  (触发2张)");
  console.log("  API:     GET  /api/strategy-status");
  console.log("  管理后台: http://localhost:" + PORT + "/admin.html");
  console.log("  退出:     Ctrl+C");
  console.log("");
});
