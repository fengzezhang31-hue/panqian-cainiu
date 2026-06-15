/**
 * 六盘山 app-server.js
 * 本地开发服务器，提供静态文件服务
 * 启动: node app-server.js
 * 地址: http://localhost:9090
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9090;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

const REDIRECTS = {
  '/gumo-app': '/',
  '/gumo-app.html': '/',
  '/gumo': '/',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  
  if (REDIRECTS[urlPath]) {
    res.writeHead(302, { 'Location': REDIRECTS[urlPath] });
    res.end();
    return;
  }
  
  if (urlPath === '/') urlPath = '/gumo-app.html';
  
  const filePath = path.join(ROOT, urlPath);
  
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(302, { 'Location': '/' });
      res.end();
      return;
    }
    
    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': ext === '.json' || ext === '.html' ? 'no-store' : 'max-age=300',
    };
    
    if (urlPath.endsWith('sw.js')) {
      headers['Service-Worker-Allowed'] = '/';
      headers['Cache-Control'] = 'no-store';
    }
    
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ⛰ 六盘山 V3.0 本地服务器');
  console.log('  ──────────────────────────');
  console.log('  本地:    http://localhost:' + PORT);
  console.log('  管理后台: http://localhost:' + PORT + '/admin.html');
  console.log('  退出:    Ctrl+C');
  console.log('');
});
