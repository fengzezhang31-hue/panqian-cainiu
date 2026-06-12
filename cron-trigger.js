#!/usr/bin/env node
/**
 * 六盘山 cron-trigger.js
 * 腾讯云服务器端定时触发器（双保险）
 * 用法: node cron-trigger.js phase1|phase2
 */

const https = require('https');

// 从环境变量读取Token，或使用默认值
const TOKEN = process.env.LPS_TOKEN || '';
const OWNER = 'fengzezhang31-hue';
const REPO = 'panqian-cainiu';
const WORKFLOW_MAP = {
    phase1: 'strategy-phase1-6strong.yml',
    phase2: 'strategy-phase2-2strong.yml'
};

var phase = process.argv[2] || 'phase1';
var workflowFile = WORKFLOW_MAP[phase] || WORKFLOW_MAP.phase1;

if (!TOKEN) {
    console.error('[Trigger] 错误: 未设置LPS_TOKEN环境变量');
    process.exit(1);
}

var body = JSON.stringify({ ref: 'main' });
var options = {
    hostname: 'api.github.com',
    path: '/repos/' + OWNER + '/' + REPO + '/actions/workflows/' + workflowFile + '/dispatches',
    method: 'POST',
    headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'liupanshan-trigger/1.0',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    }
};

var req = https.request(options, function(res) {
    var d = '';
    res.on('data', function(c) { d += c; });
    res.on('end', function() {
        var now = new Date(new Date().getTime() + 8 * 3600000);
        var timeStr = now.toISOString().replace('T', ' ').substring(0, 19);
        var ok = res.statusCode >= 200 && res.statusCode < 300;
        console.log('[' + timeStr + '] ' + phase + ' -> HTTP ' + res.statusCode + ' ' + (ok ? 'OK' : d.substring(0, 100)));
    });
});
req.on('error', function(e) { console.error('[Trigger Error]', e.message); });
req.write(body);
req.end();
