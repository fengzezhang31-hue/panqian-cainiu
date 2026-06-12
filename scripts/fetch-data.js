#!/usr/bin/env node
/**
 * 六盘山 fetch-data.js
 * 定时任务: 刷新market-data.json中的股票价格
 * 调用: node scripts/fetch-data.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MARKET_DATA_PATH = path.join(__dirname, '..', 'market-data.json');

function httpGet(host, pathname) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: host,
      path: pathname,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://finance.sina.com.cn/'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function refreshPrices() {
  console.log('[六盘山] 开始刷新数据...');
  
  let marketData;
  try {
    marketData = JSON.parse(fs.readFileSync(MARKET_DATA_PATH, 'utf-8'));
  } catch(e) {
    console.error('[六盘山] 无法读取market-data.json:', e.message);
    return;
  }
  
  if (!marketData.stocks || marketData.stocks.length === 0) {
    console.log('[六盘山] 无股票数据，跳过');
    return;
  }
  
  const codes = marketData.stocks.map(s => {
    const c = s.code || '';
    if (c.startsWith('6') || c.startsWith('9')) return 'sh' + c;
    if (c.startsWith('0') || c.startsWith('3')) return 'sz' + c;
    return c;
  }).join(',');
  
  try {
    const text = await httpGet('hq.sinajs.cn', '/list=' + codes);
    const lines = text.split(';');
    
    lines.forEach(line => {
      if (!line.trim()) return;
      const m = line.match(/"([^"]*)"/);
      if (!m) return;
      const parts = m[1].split(',');
      if (parts.length < 4) return;
      
      const name = parts[0];
      const openPrice = parseFloat(parts[1]) || 0;
      const yesterdayClose = parseFloat(parts[2]) || 0;
      const currentPrice = parseFloat(parts[3]) || 0;
      
      for (const stock of marketData.stocks) {
        const codeCheck = stock.code || '';
        if (line.includes(codeCheck)) {
          stock.name = name || stock.name;
          stock.currentPrice = currentPrice;
          stock.yesterdayClose = yesterdayClose;
          stock.openPrice = openPrice;
          stock.changePercent = yesterdayClose ? parseFloat(((currentPrice - yesterdayClose) / yesterdayClose * 100).toFixed(2)) : 0;
          stock.entityGain = stock.changePercent;
          console.log('  ' + stock.name + '(' + stock.code + '): ' + yesterdayClose + ' → ' + currentPrice + ' (' + (stock.changePercent > 0 ? '+' : '') + stock.changePercent + '%)');
        }
      }
    });
    
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 3600000);
    marketData.date = beijingTime.toISOString().split('T')[0];
    
    fs.writeFileSync(MARKET_DATA_PATH, JSON.stringify(marketData, null, 2), 'utf-8');
    console.log('[六盘山] 数据刷新完成');
    
    const backupPath = path.join(DATA_DIR, 'market-data-' + marketData.date + '.json');
    fs.writeFileSync(backupPath, JSON.stringify(marketData, null, 2), 'utf-8');
    
  } catch(e) {
    console.error('[六盘山] 刷新失败:', e.message);
  }
}

refreshPrices();
