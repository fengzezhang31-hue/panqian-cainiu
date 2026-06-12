#!/usr/bin/env node
/**
 * 六盘山 strategy-engine.js — 全自动策略引擎 V4.0
 * 
 * 数据源：东方财富(主) + 新浪(备用)
 * Phase1(08:26): 全A股海选→V3评分→Top6
 * Phase2(09:25): 重新评分→Top2
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MARKET_DATA_PATH = path.join(__dirname, '..', 'market-data.json');
const TOP2_PATH = path.join(__dirname, '..', 'top2.json');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

// ===================== 数据源 =====================

/** HTTP GET helper */
function httpGet(hostname, pathname, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
        https.get({
            hostname: hostname,
            path: pathname,
            headers: opts.headers || { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
            timeout: opts.timeout || 15000
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/** 东方财富 push2 API（中国服务器友好，海外可能被墙） */
function fetchEastMoney(fid, count, retries) {
    if (retries === undefined) retries = 2;
    return new Promise((resolve) => {
        var attempt = function(n) {
            const fs_param = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23';
            const fields = 'f2,f3,f6,f12,f14,f15,f16,f17,f18';
            const url = '/api/qt/clist/get?pn=1&pz=' + count + '&po=1&np=1&fltt=2&invt=2&fid=' + fid + '&fs=' + encodeURIComponent(fs_param) + '&fields=' + fields;
            
            https.get({
                hostname: 'push2.eastmoney.com',
                path: url,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/' },
                timeout: 12000
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.data && json.data.diff && json.data.diff.length > 0) {
                            resolve(json.data.diff);
                        } else if (n < retries) {
                            setTimeout(() => attempt(n + 1), 2000);
                        } else {
                            resolve([]);
                        }
                    } catch(e) {
                        if (n < retries) {
                            setTimeout(() => attempt(n + 1), 2000);
                        } else {
                            resolve([]);
                        }
                    }
                });
            }).on('error', () => {
                if (n < retries) setTimeout(() => attempt(n + 1), 2000);
                else resolve([]);
            });
        };
        attempt(1);
    });
}

/** 新浪行情 */
function fetchSina(codes) {
    return new Promise((resolve, reject) => {
        if (codes.length === 0) { resolve(''); return; }
        const sc = codes.map(c => {
            if (c.startsWith('6') || c.startsWith('9')) return 'sh' + c;
            return 'sz' + c;
        }).join(',');
        https.get({
            hostname: 'hq.sinajs.cn',
            path: '/list=' + sc,
            headers: { 'Referer': 'https://finance.sina.com.cn/' },
            timeout: 10000
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        }).on('error', reject);
    });
}

function parseSina(text) {
    const stocks = {};
    const lines = text.split(';');
    for (const line of lines) {
        if (!line.trim()) continue;
        const m = line.match(/"([^"]*)"/);
        if (!m) continue;
        const parts = m[1].split(',');
        if (parts.length < 30) continue;
        const codeMatch = line.match(/hq_str_(?:sh|sz)(\d+)/);
        const code = codeMatch ? codeMatch[1] : '';
        if (!code) continue;
        const price = parseFloat(parts[3]) || 0;
        const prevClose = parseFloat(parts[2]) || 0;
        const chg = prevClose ? ((price - prevClose) / prevClose * 100) : 0;
        stocks[code] = {
            name: parts[0], code, price, prevClose,
            open: parseFloat(parts[1]) || 0,
            high: parseFloat(parts[4]) || 0,
            low: parseFloat(parts[5]) || 0,
            volume: parseFloat(parts[8]) || 0,
            amount: parseFloat(parts[9]) || 0,
            changePercent: Math.round(chg * 100) / 100
        };
    }
    return stocks;
}

// ===================== V3.0 策略评分 =====================

function scoreV3(s) {
    const amt = s.amount || 0;
    const chg = s.changePercent || 0;
    
    let industry = 0;
    if (amt > 5e9) industry = 20;
    else if (amt > 2e9) industry = 16;
    else if (amt > 5e8) industry = 12;
    else if (amt > 1e8) industry = 8;
    else industry = 4;
    
    let perf = 0;
    const cp = Math.abs(chg);
    if (cp > 5) perf = 20;
    else if (cp > 3) perf = 18;
    else if (cp > 1) perf = 14;
    else if (cp > 0.3) perf = 10;
    else perf = 6;
    if (chg < 0) perf = Math.max(0, perf - 4);
    
    let fund = 0;
    if (amt > 5e9) fund = 20;
    else if (amt > 2e9) fund = 16;
    else if (amt > 5e8) fund = 12;
    else if (amt > 1e8) fund = 8;
    else fund = 4;
    
    const total = industry + perf + fund;
    return { industry, perf, fund, total, detail: 'I' + industry + '+P' + perf + '+F' + fund + '=' + total };
}

// ===================== 预置候选池（防止API失败时空跑） =====================

const FALLBACK_POOL = [
    '300308','300624','002703','300394','300502','002230',
    '300033','300059','002415','000977','600519','000858',
    '601318','000333','002475','300750','601899','600036',
    '002594','601857','000651','600900','000568','002142'
];

// ===================== 核心逻辑 =====================

async function main() {
    const phase = process.argv[2] || 'phase1';
    const today = new Date();
    const bjStr = new Date(today.getTime() + 8 * 3600000).toISOString().split('T')[0];
    const timeStr = new Date(today.getTime() + 8 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
    
    console.log('═══════════════════════════════════');
    console.log('  六盘山 策略引擎 V4.0 — ' + phase.toUpperCase());
    console.log('  北京时间: ' + timeStr);
    console.log('═══════════════════════════════════');
    
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    
    // ======== Step 1: 东方财富海选（海外可能失败，达3次重试） ========
    console.log('\n[Step 1] 东方财富海选...');
    
    var gainers = await fetchEastMoney('f3', 80, 2);
    var amounters = await fetchEastMoney('f8', 80, 2);
    var candidates = [];
    
    if (gainers.length === 0 && amounters.length === 0) {
        console.log('  东方财富不可用，启用新浪预置池海选...');
        // Fallback: 用新浪拉预置池30只
        var sinaText = await fetchSina(FALLBACK_POOL);
        var sinaData = parseSina(sinaText);
        candidates = Object.values(sinaData);
        console.log('  预置池获取: ' + candidates.length + ' 只');
    } else {
        console.log('  涨幅榜抓取: ' + gainers.length + ' 只');
        console.log('  成交额榜抓取: ' + amounters.length + ' 只');
        
        var stockMap = {};
        for (var i = 0; i < gainers.length; i++) {
            var s = gainers[i];
            if (!s.f12 || !s.f14) continue;
            stockMap[s.f12] = {
                code: s.f12, name: s.f14,
                price: parseFloat(s.f2) || 0,
                changePercent: Math.round((parseFloat(s.f3) || 0) * 100) / 100,
                amount: parseFloat(s.f6) || 0,
                volume: 0, high: 0, low: 0,
                open: parseFloat(s.f17) || 0,
                prevClose: parseFloat(s.f18) || 0,
                source: '涨幅榜'
            };
        }
        for (var i = 0; i < amounters.length; i++) {
            var s = amounters[i];
            if (!s.f12 || !s.f14 || stockMap[s.f12]) continue;
            stockMap[s.f12] = {
                code: s.f12, name: s.f14,
                price: parseFloat(s.f2) || 0,
                changePercent: Math.round((parseFloat(s.f3) || 0) * 100) / 100,
                amount: parseFloat(s.f6) || 0,
                volume: 0, high: 0, low: 0,
                open: parseFloat(s.f17) || 0,
                prevClose: parseFloat(s.f18) || 0,
                source: '成交额榜'
            };
        }
        candidates = Object.values(stockMap);
        console.log('  合并候选: ' + candidates.length + ' 只');
        
        // 用新浪修正数据
        if (candidates.length > 0) {
            console.log('\n[Step 1.5] 新浪实时行情修正...');
            var codes = candidates.map(function(s) { return s.code; });
            var sinaData = {};
            for (var i = 0; i < codes.length; i += 80) {
                var batch = codes.slice(i, i + 80);
                var text = await fetchSina(batch);
                var parsed = parseSina(text);
                Object.assign(sinaData, parsed);
            }
            var updatedCount = 0;
            for (var i = 0; i < candidates.length; i++) {
                var sd = sinaData[candidates[i].code];
                if (sd) {
                    candidates[i].price = sd.price;
                    candidates[i].changePercent = sd.changePercent;
                    candidates[i].volume = sd.volume;
                    candidates[i].amount = sd.amount;
                    candidates[i].open = sd.open;
                    candidates[i].high = sd.high;
                    candidates[i].low = sd.low;
                    candidates[i].prevClose = sd.prevClose;
                    updatedCount++;
                }
            }
            console.log('  修正: ' + updatedCount + ' 只');
        }
    }
    
    // ======== Step 2: V3策略评分 ========
    console.log('\n[Step 2] V3策略评分...');
    for (var i = 0; i < candidates.length; i++) {
        var v3 = scoreV3(candidates[i]);
        candidates[i].v3Score = v3.total;
        candidates[i].v3Detail = v3.detail;
        candidates[i].v3Industry = v3.industry;
        candidates[i].v3Perf = v3.perf;
        candidates[i].v3Fund = v3.fund;
    }
    
    // 排除ST
    candidates = candidates.filter(function(s) { return !s.name.includes('ST') && !s.name.includes('退'); });
    
    // 按V3降序
    candidates.sort(function(a, b) { return (b.v3Score || 0) - (a.v3Score || 0); });
    
    // 排除弱势
    candidates = candidates.filter(function(s) {
        if (s.changePercent <= -3 && s.amount < 3e9) return false;
        return true;
    });
    
    console.log('  有效候选: ' + candidates.length + ' 只');
    console.log('\n  Top6预览:');
    for (var i = 0; i < Math.min(6, candidates.length); i++) {
        var s = candidates[i];
        console.log('    #' + (i+1) + ' ' + s.name + '(' + s.code + ') V3=' + s.v3Score + ' chg=' + (s.changePercent > 0 ? '+' : '') + s.changePercent + '% amt=' + ((s.amount || 0) / 1e8).toFixed(1) + '亿 [' + (s.source || '预置池') + ']');
    }
    
    // ======== Step 3: 输出 ========
    var top6 = candidates.slice(0, 6).map(function(s) {
        return {
            name: s.name, code: s.code,
            currentPrice: Math.round((s.price || 0) * 100) / 100,
            bidPrice: Math.round((s.open || s.price || 0) * 100) / 100,
            changePercent: s.changePercent || 0,
            entityGain: s.changePercent || 0,
            amount: s.amount || 0, volume: s.volume || 0,
            high: s.high || 0, low: s.low || 0,
            prevClose: s.prevClose || 0,
            v3Score: s.v3Score || 0,
            v3Detail: s.v3Detail || '',
            v3Industry: s.v3Industry || 0,
            v3Perf: s.v3Perf || 0,
            v3Fund: s.v3Fund || 0
        };
    });
    
    var marketData = {
        date: bjStr,
        phase: phase,
        phaseTime: timeStr,
        totalCandidates: candidates.length,
        stocks: top6,
        allCandidates: candidates.slice(0, 20).map(function(s) {
            return { name: s.name, code: s.code, changePercent: s.changePercent, amount: s.amount, v3Score: s.v3Score };
        })
    };
    
    fs.writeFileSync(MARKET_DATA_PATH, JSON.stringify(marketData, null, 2), 'utf8');
    console.log('\n[Step 3] market-data.json 已写入 (' + top6.length + ' 只)');
    
    // Phase2: 2强
    if (phase === 'phase2') {
        console.log('\n[Phase2] 生成 top2.json...');
        var top2 = candidates.slice(0, 2).map(function(s) {
            return {
                name: s.name, code: s.code,
                v3Score: s.v3Score, changePercent: s.changePercent,
                currentPrice: Math.round((s.price || 0) * 100) / 100,
                amount: s.amount, rank: candidates.indexOf(s) + 1
            };
        });
        
        var top2Data = { date: bjStr, time: timeStr, top2: top2 };
        fs.writeFileSync(TOP2_PATH, JSON.stringify(top2Data, null, 2), 'utf8');
        console.log('  top2.json 已写入: ' + top2.map(function(s) { return s.name; }).join(', '));
        
        marketData.phase = 'phase2_done';
        marketData.top2 = top2;
        fs.writeFileSync(MARKET_DATA_PATH, JSON.stringify(marketData, null, 2), 'utf8');
    }
    
    console.log('\n═══════════════════════════════════');
    console.log('  策略引擎完成!');
    console.log('  6强: ' + top6.map(function(s) { return s.name; }).join(', '));
    if (phase === 'phase2') {
        var t2 = candidates.slice(0, 2);
        console.log('  2强: ' + t2.map(function(s) { return s.name; }).join(', '));
    }
    console.log('═══════════════════════════════════');
}

main().catch(function(e) {
    console.error('[Engine] FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
});
