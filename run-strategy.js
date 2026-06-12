#!/usr/bin/env node
/**
 * 六盘山 run-strategy.js — DEEPSEEK V5.0 竞价共振模型
 * 数据源: 腾讯财经(qt.gtimg.cn) + 淘股吧(tgb.cn)
 * 部署在腾讯云香港
 */

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var { execSync } = require('child_process');

var ROOT = __dirname;
var MARKET_DATA_PATH = path.join(ROOT, 'market-data.json');
var TOP2_PATH = path.join(ROOT, 'top2.json');

// ==================== HTTP ====================

function httpGet(hostname, pathname, opts) {
    opts = opts || {};
    return new Promise(function(resolve, reject) {
        var mod = hostname.indexOf('qt.gtimg') >= 0 || hostname.indexOf('push2.eastmoney') >= 0 ? http : https;
        var req = mod.get({
            hostname: hostname, path: pathname,
            headers: Object.assign({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': hostname.indexOf('tgb') >= 0 ? 'https://www.tgb.cn/' : 'https://finance.sina.com.cn/'
            }, opts.headers || {}),
            timeout: opts.timeout || 15000
        }, function(res) {
            var bufs = [];
            res.on('data', function(c) { bufs.push(c); });
            res.on('end', function() { resolve(Buffer.concat(bufs).toString('utf-8')); });
        });
        req.on('error', function(e) { reject(e); });
    });
}

// ==================== 腾讯财经解析 ====================

function parseTencent(text) {
    var stocks = {};
    var lines = text.split(/\r?\n/).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.indexOf('="') < 0) continue;
        var m = line.match(/v_(?:sh|sz)(\d+)="([^"]*)"/);
        if (!m) continue;
        var code = m[1];
        var parts = m[2].split('~');
        if (parts.length < 40) continue;
        var name = parts[1] || '';
        if (!name || name.indexOf('ST') >= 0 || name.indexOf('退') >= 0) continue;
        var price = parseFloat(parts[3]) || 0;
        var prevClose = parseFloat(parts[4]) || 0;
        var open = parseFloat(parts[5]) || 0;
        var volume = parseFloat(parts[6]) || 0;
        var high = parseFloat(parts[33]) || 0;
        var low = parseFloat(parts[34]) || 0;
        var amount = volume * price * 100;
        var chg = prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0;
        if (chg < -5 || chg > 9.9) continue;
        var bp1 = parseFloat(parts[9]) || 0;
        var sp1 = parseFloat(parts[19]) || 0;
        var buyStr = 50;
        if (bp1 > 0 && sp1 > 0) buyStr = price >= (price + prevClose) / 2 ? 60 : 45;
        stocks[code] = {
            code: code, name: name,
            price: price, prevClose: prevClose, open: open,
            high: high, low: low, volume: volume, amount: amount,
            changePercent: Math.round(chg * 100) / 100,
            buyStrength: buyStr
        };
    }
    return stocks;
}


var PASS_LINE = 90;
var LOGIC_PASS = 45;
var EAGLE_V4_MIN = 50;
var EAGLE_V3_MIN = 40;

var MAIN_BOARD = { chgGold:[0.01,6], chgGoldScore:10, chgMid:[6,9.5], chgMidScore:5, limitUpScore:15, limitUpBonus:5, turnoverHigh:0.8, turnoverMid:0.5, turnoverHighScore:25, turnoverMidScore:15, turnoverLowScore:5, amtHigh:5000, amtMid:3000, amtHighScore:20, amtMidScore:10, amtLowScore:5, ratioHigh:3, ratioScore:5, ratioLowScore:2 };

var CHINEXT = { chgGold:[0.01,6], chgGoldScore:10, chgMid:[6,18], chgMidScore:5, limitUpScore:15, limitUpBonus:5, turnoverHigh:1.5, turnoverMid:0.8, turnoverHighScore:25, turnoverMidScore:15, turnoverLowScore:5, amtHigh:8000, amtMid:5000, amtHighScore:20, amtMidScore:10, amtLowScore:5, ratioHigh:5, ratioScore:5, ratioLowScore:2 };

var MOAT_DB = {
    "300124":{moat:20,sector:"工控",desc:"伺服系统龙头"},
    "300274":{moat:19,sector:"逆变器",desc:"全球逆变器龙头"},
    "300308":{moat:20,sector:"光模块",desc:"全球800G龙头"},
    "300394":{moat:15,sector:"光模块",desc:"光器件龙头"},
    "300502":{moat:18,sector:"光模块",desc:"800G核心供应商"},
    "300750":{moat:20,sector:"电池",desc:"全球动力电池龙头"},
    "300760":{moat:20,sector:"医疗器械",desc:"医疗器械龙头"},
    "301308":{moat:18,sector:"存储",desc:"存储模组龙头"},
    "600760":{moat:20,sector:"军工",desc:"战斗机龙头"},
    "600893":{moat:19,sector:"航发",desc:"航空发动机"},
    "603986":{moat:17,sector:"存储",desc:"NOR Flash龙头"},
    "688017":{moat:18,sector:"机器人",desc:"谐波减速器龙头"},
    "688256":{moat:18,sector:"AI芯片",desc:"国产AI芯片龙头"},
    "688981":{moat:20,sector:"晶圆代工",desc:"大陆第一"},
    "002049":{moat:20,sector:"特种IC",desc:"特种芯片龙头"},
    "002896":{moat:15,sector:"机器人",desc:"行星减速器"},
    "002703":{moat:16,sector:"自动驾驶",desc:"转向龙头,L3准入"},
    "002475":{moat:19,sector:"消费电子",desc:"精密制造龙头"}
};

var EARNINGS_DB = {
    "300308":{qoq:45,cashflow:true,desc:"Q1+45%,800G放量"},
    "300502":{qoq:200,cashflow:true,desc:"Q1暴增200%+"},
    "301308":{qoq:55,cashflow:true,desc:"存储涨价,Q1爆发"},
    "002049":{qoq:40,cashflow:true,desc:"特种IC订单饱满"},
    "688256":{qoq:65,cashflow:false,desc:"AI芯片出货暴增"},
    "688017":{qoq:30,cashflow:true,desc:"减速器放量"},
    "300750":{qoq:52,cashflow:true,desc:"Q1+52%,份额提升"},
    "300274":{qoq:48,cashflow:true,desc:"海外订单暴增"},
    "002703":{qoq:120,cashflow:true,desc:"L3准入,量价齐升"},
    "300124":{qoq:35,cashflow:true,desc:"伺服系统放量"}
};


// ==================== DEEPSEEK V5.0 综合评分系统 ====================

function getTrack(code) {
    return (code.indexOf("300")===0 || code.indexOf("301")===0) ? "CHINEXT" : "MAIN";
}

function isDisqualified(s) {
    if (s.name && (s.name.indexOf("ST")>=0 || s.name.indexOf("退")>=0)) return true;
    return false;
}

function scoreV3Logic(s, hotTopics) {
    var code = s.code;
    var name = s.name;
    
    var moatScore = 5;
    var moatDetail = "普通标的";
    if (MOAT_DB[code]) {
        moatScore = MOAT_DB[code].moat;
        moatDetail = MOAT_DB[code].desc;
    }
    
    var earnScore = 5;
    var earnDetail = "未收录";
    if (EARNINGS_DB[code]) {
        var e = EARNINGS_DB[code];
        if (e.qoq >= 50 && e.cashflow) { earnScore = 20; earnDetail = e.desc; }
        else if (e.qoq >= 20) { earnScore = 10; earnDetail = e.desc; }
    }
    
    var eventScore = 5;
    var eventDetail = "";
    if (MOAT_DB[code] && MOAT_DB[code].moat >= 18 && s.buyStrength >= 65) {
        eventScore = 20;
    } else if (s.buyStrength >= 60) {
        eventScore = 15;
    } else if (s.buyStrength >= 50) {
        eventScore = 10;
    }
    
    for (var i = 0; i < (hotTopics||[]).length; i++) {
        var t = hotTopics[i].title || "";
        if (name && t.indexOf(name.substring(0,1)) >= 0) {
            eventScore = Math.max(eventScore, 15);
            eventDetail = t;
            break;
        }
    }
    
    var total3D = moatScore + earnScore + eventScore;
    var logicScore = Math.round(total3D * 100 / 60);
    
    return {
        total3D: total3D,
        logicScore: logicScore,
        passed: total3D >= LOGIC_PASS,
        moatScore: moatScore,
        earnScore: earnScore,
        eventScore: eventScore,
        moatDetail: moatDetail,
        earnDetail: earnDetail,
        eventDetail: eventDetail
    };
}

function scoreV4Auction(s) {
    var code = s.code;
    var chg = s.changePercent || 0;
    var amt = (s.amount || 0) / 1e4;
    var tRate = s.turnoverRate || 0;
    var track = getTrack(code);
    var cfg = (track === "CHINEXT") ? CHINEXT : MAIN_BOARD;
    var isLimitUp = (track === "CHINEXT") ? (chg >= 19.8) : (chg >= 9.8);
    
    var spaceScore = 0;
    if (isLimitUp) {
        spaceScore = cfg.limitUpScore;
    } else if (chg >= cfg.chgGold[0] && chg <= cfg.chgGold[1]) {
        spaceScore = cfg.chgGoldScore;
    } else if (chg > cfg.chgGold[1] && chg <= cfg.chgMid[1]) {
        spaceScore = cfg.chgMidScore;
    } else if (chg > 0) {
        spaceScore = 3;
    }
    
    var turnoverScore = tRate >= cfg.turnoverHigh ? cfg.turnoverHighScore :
        (tRate >= cfg.turnoverMid ? cfg.turnoverMidScore : cfg.turnoverLowScore);
    
    var amtScore = amt >= cfg.amtHigh ? cfg.amtHighScore :
        (amt >= cfg.amtMid ? cfg.amtMidScore : cfg.amtLowScore);
    
    var ratioScore = cfg.ratioLowScore;
    
    var v4Total = spaceScore + turnoverScore + amtScore + ratioScore;
    if (isLimitUp) v4Total += cfg.limitUpBonus;
    
    return {
        total: v4Total,
        spaceScore: spaceScore,
        turnoverScore: turnoverScore,
        amtScore: amtScore,
        ratioScore: ratioScore,
        track: track,
        isLimitUp: isLimitUp,
        detail: track + "空" + spaceScore + "+换" + turnoverScore + "+金" + amtScore + "+量" + ratioScore + "=" + v4Total
    };
}

function scoreV5(s, hotTopics) {
    var v3 = scoreV3Logic(s, hotTopics);
    var v4 = scoreV4Auction(s);
    
    var passed = v3.passed;
    var eagle = false;
    
    if (!v3.passed && v4.total >= EAGLE_V4_MIN && v3.total3D >= EAGLE_V3_MIN) {
        passed = true;
        eagle = true;
    }
    
    if (isDisqualified(s)) passed = false;
    
    var finalScore = v3.logicScore + v4.total;
    
    return {
        finalScore: finalScore,
        v3LogicScore: v3.logicScore,
        v4AuctionScore: v4.total,
        passed: passed,
        eagleExempt: eagle,
        v3Detail: v3,
        v4Detail: v4,
        track: v4.track,
        code: s.code,
        name: s.name,
        summary: v3.logicScore + "+" + v4.total + "=" + finalScore + " " + v4.track + (eagle ? " [EAGLE]" : ""),
        total3D: v3.total3D
    };
}


// ==================== 步骤1: 盘前热点 ====================

async function fetchTGB() {
    console.log('  淘股吧博主(ID:3729365)...');
    try {
        var html = await httpGet('www.tgb.cn', '/blog/3729365', { timeout: 15000 });
        var topics = [];
        var re = /<a[^>]*class=['"]title['"][^>]*>([^<]+)<\/a>/gi;
        var m;
        while ((m = re.exec(html)) !== null) {
            var text = m[1].trim();
            if (text && text.length > 5) topics.push({ source: 'TGB博主', title: text });
        }
        if (topics.length === 0) {
            re = /<a[^>]*>([^<]{10,80})<\/a>/gi;
            while ((m = re.exec(html)) !== null) {
                var t = m[1].trim();
                if (t.indexOf('股') >= 0 || t.indexOf('盘') >= 0 || t.indexOf('涨') >= 0 || t.indexOf('跌') >= 0 || t.indexOf('板') >= 0) {
                    topics.push({ source: 'TGB博主', title: t });
                }
            }
        }
        console.log('    获取 ' + topics.length + ' 条');
        return topics.slice(0, 10);
    } catch(e) {
        console.log('    不可用: ' + e.message);
        return [];
    }
}

async function fetchETFSectors() {
    console.log('  板块ETF(腾讯财经)...');
    try {
        var etfCodes = ['sh512480','sh512760','sh516160','sh512660','sh512010','sh512880','sh512690','sh515790','sh515070','sh588000'];
        var text = await httpGet('qt.gtimg.cn', '/q=' + etfCodes.join(','), { timeout: 10000 });
        var parsed = parseTencent(text);
        var hot = Object.values(parsed).map(function(s) {
            return { source: '腾讯ETF', name: s.name, change_pct: s.changePercent };
        });
        hot.sort(function(a, b) { return b.change_pct - a.change_pct; });
        console.log('    获取 ' + hot.length + ' 个板块ETF');
        return hot;
    } catch(e) {
        console.log('    不可用: ' + e.message);
        return [];
    }
}

// ==================== 步骤2: 暗面扫描 ====================

async function scanUSOvernight() {
    console.log('  美股夜盘映射...');
    var indices = { 'IXIC': '纳斯达克', 'DJI': '道琼斯', 'INX': '标普500' };
    var results = [];
    for (var code in indices) {
        try {
            var text = await httpGet('hq.sinajs.cn', '/list=gb_' + code.toLowerCase(), { timeout: 10000 });
            var m = text.match(/"([^"]*)"/);
            if (m) {
                var parts = m[1].split(',');
                if (parts.length > 2) {
                    results.push({ name: indices[code], code: code, change_pct: parseFloat(parts[2]) || 0 });
                }
            }
        } catch(e) {}
    }
    var events = [];
    var nasdaq = results.find(function(r) { return r.code === 'IXIC'; });
    if (nasdaq) {
        console.log('  ' + nasdaq.name + ': ' + (nasdaq.change_pct > 0 ? '+' : '') + nasdaq.change_pct.toFixed(2) + '%');
        if (nasdaq.change_pct > 1) events.push({ event: '纳指大涨→利好科技/AI', sector: '半导体/科技', weight: 3 });
        else if (nasdaq.change_pct < -2) events.push({ event: '纳指大跌→避险情绪', sector: '避险', weight: 3 });
    }
    return { usIndices: results, darkEvents: events };
}

// ==================== 步骤3: 竞价选股 ====================

// A股重要标的池(覆盖科创板+创业板+主板)
var WATCH_POOL = [
    '688981','688012','688111','688036','688599','688396','688008','688009','688126','688256',
    '688185','688561','688187','688303','688390','688516','688005','688116','688169','688390',
    '300750','300059','300033','300394','300308','300502','300124','300760','300014','300015',
    '300274','300413','300433','300763','300770','300782','300474','300476','300598','300624',
    '002475','002230','002415','002594','002142','000858','000568','000651','000333','000977',
    '002371','002049','002916','002920','002241','002600','002625','002236','002384','002703',
    '601899','600519','601318','600036','601857','600900','603259','601012','600276','601888',
    '600809','600585','600031','600030','601688','600438','601919','600104','601398','600028'
];

async function fetchCandidates() {
    console.log('  腾讯财经海选 ' + WATCH_POOL.length + ' 只标的...');
    var allStocks = {};
    
    for (var i = 0; i < WATCH_POOL.length; i += 50) {
        var batch = WATCH_POOL.slice(i, i + 50);
        var codes = batch.map(function(c) {
            if (c.startsWith('6') || c.startsWith('9')) return 'sh' + c;
            return 'sz' + c;
        }).join(',');
        try {
            var text = await httpGet('qt.gtimg.cn', '/q=' + codes, { timeout: 15000 });
            var parsed = parseTencent(text);
            var keys = Object.keys(parsed);
            for (var k = 0; k < keys.length; k++) {
                allStocks[keys[k]] = parsed[keys[k]];
            }
        } catch(e) {}
    }
    
    var result = Object.values(allStocks);
    console.log('    获取 ' + result.length + ' 只有效标的');
    return result;
}

// ==================== 主流程 ====================

async function main() {
    var phase = process.argv[2] || 'phase1';
    var now = new Date(new Date().getTime() + 8 * 3600000);
    var dateStr = now.toISOString().split('T')[0];
    var timeStr = now.toISOString().replace('T', ' ').substring(0, 19);
    
    console.log('');
    console.log('═══════════════════════════════');
    console.log('  ⛰ 六盘山 V5.0 | ' + phase.toUpperCase() + ' | ' + timeStr);
    console.log('═══════════════════════════════');
    
    // 步骤1
    console.log('\n[步骤1] 盘前热点');
    var tgbTopics = await fetchTGB();
    var etfSectors = await fetchETFSectors();
    var allTopics = tgbTopics.concat(etfSectors.map(function(s) { return { source: 'ETF', title: s.name + '(' + (s.change_pct > 0 ? '+' : '') + s.change_pct + '%)' }; }));
    
    // 步骤2
    console.log('\n[步骤2] 暗面扫描');
    var usData = await scanUSOvernight();
    
    // 步骤3
    console.log('\n[步骤3] 竞价选股+评分');
    var candidates = await fetchCandidates();
    
    for (var i = 0; i < candidates.length; i++) {
        var v5 = scoreV5(candidates[i], {});
        candidates[i].v5Score = v5.finalScore;
        candidates[i].v3LogicScore = v5.v3LogicScore; candidates[i].v4AuctionScore = v5.v4AuctionScore; candidates[i].passed = v5.passed; candidates[i].eagleExempt = v5.eagleExempt;
    }
    
    // 热点匹配
    var hotNames = etfSectors.map(function(h) { return h.name || ''; });
    for (var i = 0; i < candidates.length; i++) {
        var s = candidates[i];
        s.hotMatch = false;
        s.sectorBonus = 0;
        for (var j = 0; j < hotNames.length; j++) {
            if (hotNames[j] && s.name && s.name.indexOf(hotNames[j].substring(0, 1)) >= 0) {
                s.hotMatch = true; s.hotSector = hotNames[j]; s.sectorBonus = 5; break;
            }
        }
        for (var j = 0; j < (usData.darkEvents || []).length; j++) {
            if (usData.darkEvents[j].sector.indexOf('半导体') >= 0 && (s.code.indexOf('688') === 0 || s.name.indexOf('芯') >= 0 || s.name.indexOf('微') >= 0)) {
                s.hotMatch = true; s.sectorBonus = 10;
            }
        }
        s.finalScore = (s.v5Score || 0);
    }
    
    candidates = candidates.filter(function(s) { return s.passed && s.v5Score >= 100; });
    candidates.sort(function(a, b) { return (b.finalScore || 0) - (a.finalScore || 0); });
    
    console.log('    有效候选(竞价≥20): ' + candidates.length);
    console.log('    Top6:');
    for (var i = 0; i < Math.min(6, candidates.length); i++) {
        var s = candidates[i];
        console.log('      #' + (i+1) + ' ' + s.name + '(' + s.code + ') 竞价' + s.auctionScore + ' 综合' + s.finalScore + ' ' + (s.changePercent > 0 ? '+' : '') + s.changePercent.toFixed(2) + '%' + (s.hotMatch ? ' 🔥' : ''));
    }
    
    var top6 = candidates.slice(0, 6).map(function(s) {
        return {
            name: s.name, code: s.code,
            currentPrice: Math.round((s.price || 0) * 100) / 100,
            bidPrice: Math.round((s.open || 0) * 100) / 100,
            changePercent: s.changePercent || 0, entityGain: s.changePercent || 0,
            amount: s.amount || 0, volume: s.volume || 0,
            high: s.high || 0, low: s.low || 0, prevClose: s.prevClose || 0,
            v6Score: s.finalScore || 0, v3LogicScore: s.v3LogicScore || 0, v4AuctionScore: s.v4AuctionScore || 0, eagleExempt: s.eagleExempt || false, passed: s.passed || false,
            buyStrength: s.buyStrength || 50,
            hotMatch: s.hotMatch || false, hotSector: s.hotSector || ''
        };
    });
    
    var marketData = {
        date: dateStr, phase: phase, phaseTime: timeStr,
        totalCandidates: candidates.length,
        hotTopics: allTopics.slice(0, 10),
        darkEvents: usData.darkEvents || [],
        hotSectors: etfSectors.slice(0, 5).map(function(h) { return { name: h.name, change_pct: h.change_pct }; }),
        stocks: top6
    };
    
    fs.writeFileSync(MARKET_DATA_PATH, JSON.stringify(marketData, null, 2), 'utf8');
    console.log('\n✅ market-data.json (' + top6.length + '只)');
    
    if (phase === 'phase2') {
        var top2 = candidates.slice(0, 2).map(function(s) {
            return { name: s.name, code: s.code, auctionScore: s.auctionScore, finalScore: s.finalScore, changePercent: s.changePercent, currentPrice: Math.round((s.price || 0) * 100) / 100, rank: candidates.indexOf(s) + 1 };
        });
        fs.writeFileSync(TOP2_PATH, JSON.stringify({ date: dateStr, time: timeStr, top2: top2 }, null, 2), 'utf8');
        console.log('✅ top2.json: ' + top2.map(function(s) { return s.name; }).join(', '));
        marketData.phase = 'phase2_done';
        marketData.top2 = top2;
        fs.writeFileSync(MARKET_DATA_PATH, JSON.stringify(marketData, null, 2), 'utf8');
    }
    
    console.log('\n📤 推送GitHub...');
    try {
        execSync('cd ' + ROOT + ' && git config user.name "六盘山 Bot" && git config user.email "bot@liupanshan.app" && git add market-data.json top2.json && (git diff --quiet && git diff --staged --quiet || (git commit -m "[V6] ' + phase + ' ' + dateStr + '" && git push))', { encoding: 'utf-8', timeout: 30000 });
        console.log('✅ 已推送');
    } catch(e) { console.log('⚠ 推送失败: ' + e.message.substring(0, 100)); }
    
    console.log('\n═══════════════════════════════');
    console.log('  6强(V6): ' + top6.map(function(s) { return s.name; }).join(', '));
    if (phase === 'phase2' && candidates.length >= 2) console.log('  2强(V6): ' + candidates[0].name + ', ' + candidates[1].name);
    console.log('═══════════════════════════════');
}

main().catch(function(e) { console.error('❌', e.message); process.exit(1); });
