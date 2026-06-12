
var ADMIN_PWD = '888888';
var GITHUB_TOKEN = '';
var GITHUB_OWNER = 'fengzezhang31-hue';
var GITHUB_REPO = 'panqian-cainiu';
var PET_NAMES = ['鍐插姩鐗?,'钀岃悓鐔?,'鎭愭儳榫?,'绌轰粨鐚?,'澶х姛椹?,'鎮熼亾楣?];
var fetchedStocks = null;

var safeStorage = {
    getItem: function(key) { try { return localStorage.getItem(key); } catch(e) { return null; } },
    setItem: function(key, val) { try { localStorage.setItem(key, val); } catch(e) {} },
    removeItem: function(key) { try { localStorage.removeItem(key); } catch(e) {} }
};

function doLogin() {
    var pwd = document.getElementById('adminPwd').value.trim();
    var token = document.getElementById('adminToken').value.trim();
    if (pwd === ADMIN_PWD) {
        if (token) GITHUB_TOKEN = token;
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('adminPage').style.display = 'block';
    } else {
        alert('瀵嗙爜閿欒');
    }
}

function switchTab(tab) {
    document.getElementById('tabStock').className = tab === 'stock' ? 'tab active' : 'tab';
    document.getElementById('tabHot').className = tab === 'hot' ? 'tab active' : 'tab';
    document.getElementById('tabCredit').className = tab === 'credit' ? 'tab active' : 'tab';
    document.getElementById('tabHistory').className = tab === 'history' ? 'tab active' : 'tab';
    document.getElementById('panelStock').style.display = tab === 'stock' ? 'block' : 'none';
    document.getElementById('panelHot').style.display = tab === 'hot' ? 'block' : 'none';
    document.getElementById('panelCredit').style.display = tab === 'credit' ? 'block' : 'none';
    document.getElementById('panelHistory').style.display = tab === 'history' ? 'block' : 'none';
    if (tab === 'history') loadHistory();
}

// ========== 绛栫暐閫夎偂锛氫唬鐮佽浆涓滄柟璐㈠瘜 secid ==========
function codeToSecid(code) {
    // 6寮€澶?娌競(sh), 0/3寮€澶?娣卞競(sz), 68寮€澶?绉戝垱鏉?sh)
    if (code.startsWith('6')) return '1.' + code;
    return '0.' + code;
}

// ========== 绛栫暐閫夎偂锛氭姄鍙栧疄鏃惰鎯?==========


// ========== 股票名称→代码自动识别 ==========
function resolveNameToCode(name) {
    return new Promise(function(resolve) {
        name = name.trim();
        // 已经是6位数字
        if (/^\d{6}$/.test(name)) { resolve(name); return; }
        // 去掉常见后缀
        var clean = name.replace(/[\.\s,，、。;；]+/g, '');
        
        var cbName = '_srcb_' + Date.now();
        var resolved = false;
        var timer = setTimeout(function() {
            if (!resolved) { resolved = true; cleanup(); resolve(null); }
        }, 5000);
        
        function cleanup() {
            clearTimeout(timer);
            try { delete window[cbName]; } catch(e) {}
            var s = document.getElementById('_searchScript');
            if (s && s.parentNode) s.parentNode.removeChild(s);
        }
        
        window[cbName] = function(json) {
            if (resolved) return;
            resolved = true;
            try {
                if (json && json.QuotationCodeTable && json.QuotationCodeTable.Data) {
                    var results = json.QuotationCodeTable.Data.filter(function(d) {
                        return (d.SecurityTypeName === 'A股' || d.SecurityTypeName === '深A' || d.SecurityTypeName === '沪A') && (d.Market === 'SH' || d.Market === 'SZ' || d.MktNum === '0' || d.MktNum === '1');
                    });
                    if (results.length > 0) {
                        for (var i = 0; i < results.length; i++) {
                            if (results[i].Name === clean || results[i].Code.indexOf(clean) >= 0) {
                                cleanup(); resolve(results[i].Code); return;
                            }
                        }
                        cleanup(); resolve(results[0].Code); return;
                    }
                }
                cleanup(); resolve(null);
            } catch(e) {
                cleanup(); resolve(null);
            }
        };
        
        var script = document.createElement('script');
        script.id = '_searchScript';
        script.src = 'https://searchapi.eastmoney.com/api/suggest/get?input=' + encodeURIComponent(clean) + 
            '&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=5&cb=' + cbName;
        script.onerror = function() { if (!resolved) { resolved = true; cleanup(); resolve(null); } };
        document.head.appendChild(script);
    });
}


function fetchAndPreview() {
    var codes = [];
    var btnFetch = document.getElementById('btnFetch');
    btnFetch.disabled = true;
    btnFetch.textContent = '识别中...';

    // Step 1: Resolve all names to codes
    for (var i = 0; i < 6; i++) {
        var c = document.getElementById('stk' + i).value.trim();
        if (!c) {
            alert('第' + (i+1) + '只股票信息为空');
            btnFetch.disabled = false;
            btnFetch.textContent = '抓取实时行情';
            return;
        }
        // 尝试解析：名称 -> 代码
        if (!/^\d{6}$/.test(c)) {
            var resolved = await resolveNameToCode(c);
            if (!resolved) {
                alert('无法识别: ' + c + '\n请直接输入6位数字代码');
                btnFetch.disabled = false;
                btnFetch.textContent = '抓取实时行情';
                return;
            }
            c = resolved;
        }
        codes.push(c);
    }

    btnFetch.textContent = '抓取中...';

    var secids = codes.map(codeToSecid).join(',');
    var cbName = '_admcb_' + Date.now();

    window[cbName] = function(json) {
        try { delete window[cbName]; } catch(e) {}
        var script = document.getElementById('_fetchScript');
        if (script) script.parentNode.removeChild(script);
        btnFetch.disabled = false;
        btnFetch.textContent = '抓取实时行情';

        if (!json || !json.data || !json.data.diff || json.data.diff.length < 6) {
            alert('行情数据获取不完整，请检查股票代码');
            return;
        }
        var stockMap = {};
        json.data.diff.forEach(function(s) { stockMap[s.f12] = s; });

        fetchedStocks = [];
        var html = '<div style="color:#00ccaa;font-weight:700;margin-bottom:8px">抓取成功，请确认：</div>';
        for (var i = 0; i < codes.length; i++) {
            var s = stockMap[codes[i]];
            if (!s) {
                alert('股票 ' + codes[i] + ' 未找到数据');
                return;
            }
            fetchedStocks.push({
                name: s.f14,
                code: s.f12,
                bidPrice: s.f18,
                currentPrice: s.f2,
                openPrice: s.f17,
                yesterdayClose: s.f18,
                changePercent: s.f3,
                entityGain: s.f3
            });
            var cls = s.f3 >= 0 ? 'color:#ff4466' : 'color:#44cc88';
            var sign = s.f3 >= 0 ? '+' : '';
            html += '<div style="border-bottom:1px solid #1a3a5a;padding:4px 0">' +
                '<span style="color:#ffd966">' + PET_NAMES[i] + '</span>@' +
                '<b>' + s.f14 + '</b>(' + s.f12 + ') ' +
                '昨收:' + s.f18 + ' 现价:<b>' + s.f2 + '</b> ' +
                '<span style="' + cls + '">' + sign + s.f3 + '%</span></div>';
        }
        document.getElementById('previewContent').innerHTML = html;
        document.getElementById('stockPreview').style.display = 'block';
        document.getElementById('pushStatus').style.display = 'none';
    };

    var script = document.createElement('script');
    script.id = '_fetchScript';
    script.src = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=' + secids +
        '&fields=f2,f3,f12,f14,f17,f18&cb=' + cbName;
    script.onerror = function() {
        try { delete window[cbName]; } catch(e) {}
        btnFetch.disabled = false;
        btnFetch.textContent = '抓取实时行情';
        alert('网络请求失败，请重试');
        var s = document.getElementById('_fetchScript');
        if (s) s.parentNode.removeChild(s);
    };
    document.head.appendChild(script);
}

function pushToApp() {
    if (!fetchedStocks || fetchedStocks.length !== 6) {
        alert('璇峰厛鎶撳彇琛屾儏');
        return;
    }
    if (!GITHUB_TOKEN) {
        alert('璇峰厛鍦ㄧ櫥褰曢〉濉啓 GitHub Token');
        return;
    }
    document.getElementById('btnPush').disabled = true;
    document.getElementById('btnPush').textContent = '鎺ㄩ€佷腑...';
    var statusEl = document.getElementById('pushStatus');
    statusEl.style.display = 'block';
    statusEl.style.background = '#1a2a40';
    statusEl.style.color = '#88aacc';
    statusEl.innerHTML = '姝ｅ湪鎺ㄩ€佸埌 GitHub...';

    var today = new Date();
    var dateStr = today.getFullYear() + '-' +
        String(today.getMonth()+1).padStart(2,'0') + '-' +
        String(today.getDate()).padStart(2,'0');

    var marketData = {
        date: dateStr,
        stocks: fetchedStocks.map(function(s) {
            return {
                name: s.name,
                code: s.code,
                bidPrice: s.bidPrice,
                currentPrice: s.currentPrice,
                openPrice: s.openPrice,
                yesterdayClose: s.yesterdayClose,
                changePercent: s.changePercent,
                entityGain: s.entityGain
            };
        }),
        news: [],
        twitterTrends: []
    };

    var jsonStr = JSON.stringify(marketData, null, 2);
    var b64 = btoa(unescape(encodeURIComponent(jsonStr)));

    // 鍏堣幏鍙栧綋鍓嶆枃浠?SHA
    fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/market-data.json', {
        headers: { 'Authorization': 'token ' + GITHUB_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(info) {
        var body = {
            message: '绛栫暐閫夎偂 ' + dateStr + ': ' + fetchedStocks.map(function(s){return s.name}).join(','),
            content: b64,
            sha: info.sha
        };
        return fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/market-data.json', {
            method: 'PUT',
            headers: {
                'Authorization': 'token ' + GITHUB_TOKEN,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
        document.getElementById('btnPush').disabled = false;
        document.getElementById('btnPush').textContent = '纭鎺ㄩ€佸埌APP';
        if (result.content) {
            statusEl.style.background = '#0a2a1a';
            statusEl.style.color = '#44cc88';
            statusEl.innerHTML = '鎺ㄩ€佹垚鍔燂紒APP灏嗗湪鍑犲垎閽熷唴鏇存柊銆?br><span style="font-size:11px;color:#5a7a99">' +
                dateStr + ' 路 ' + fetchedStocks.map(function(s){return s.name}).join('銆?) + '</span>';
            // 淇濆瓨璁板綍
            var records = JSON.parse(safeStorage.getItem('pqcn_admin_records') || '[]');
            records.unshift({
                code: '绛栫暐閫夎偂',
                phone: '-',
                pts: 0,
                note: fetchedStocks.map(function(s){return s.name + '(' + s.changePercent + '%)'}).join(', '),
                time: new Date().toLocaleString('zh-CN'),
                ts: Date.now()
            });
            safeStorage.setItem('pqcn_admin_records', JSON.stringify(records));
        } else {
            statusEl.style.background = '#2a0a0a';
            statusEl.style.color = '#ff4466';
            statusEl.innerHTML = '鎺ㄩ€佸け璐? ' + (result.message || '鏈煡閿欒');
        }
    })
    .catch(function(e) {
        document.getElementById('btnPush').disabled = false;
        document.getElementById('btnPush').textContent = '纭鎺ㄩ€佸埌APP';
        statusEl.style.background = '#2a0a0a';
        statusEl.style.color = '#ff4466';
        statusEl.innerHTML = '鎺ㄩ€佸け璐? ' + e.message;
    });
}

// ========== 鐩樺墠鐑偣鎺ㄩ€?==========
function pushHotTopics() {
    var content = document.getElementById('hotContent').value.trim();
    var note = document.getElementById('hotNote').value.trim();
    if (!content) { alert('璇疯緭鍏ョ儹鐐瑰唴瀹?); return; }
    if (!GITHUB_TOKEN) { alert('璇峰厛鍦ㄧ櫥褰曢〉濉啓 GitHub Token'); return; }

    var trends = content.split('\n').map(function(line) {
        return line.trim();
    }).filter(function(line) {
        return line.length > 0;
    }).map(function(title) {
        return { title: title, gain: 0, source: 'tgb_manual' };
    });

    var btn = document.getElementById('btnHotPush');
    var statusEl = document.getElementById('hotStatus');
    btn.disabled = true;
    btn.textContent = '鎺ㄩ€佷腑...';
    statusEl.style.display = 'block';
    statusEl.style.background = '#1a2a40';
    statusEl.style.color = '#88aacc';
    statusEl.innerHTML = '姝ｅ湪鎺ㄩ€佺儹鐐瑰埌 GitHub...';

    var today = new Date();
    var dateStr = today.getFullYear() + '-' +
        String(today.getMonth()+1).padStart(2,'0') + '-' +
        String(today.getDate()).padStart(2,'0');

    var hotData = {
        date: dateStr,
        trends: trends,
        note: note,
        updateTime: new Date().toISOString()
    };

    var jsonStr = JSON.stringify(hotData, null, 2);
    var b64 = btoa(unescape(encodeURIComponent(jsonStr)));

    fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/hot-topics.json', {
        headers: { 'Authorization': 'token ' + GITHUB_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(info) {
        var body = {
            message: 'hot: ' + dateStr + ' ' + trends.map(function(t){return t.title}).join(','),
            content: b64
        };
        if (info.sha) body.sha = info.sha;
        return fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/hot-topics.json', {
            method: 'PUT',
            headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
        btn.disabled = false;
        btn.textContent = '鎺ㄩ€佺儹鐐瑰埌APP';
        if (result.content) {
            statusEl.style.background = '#0a2a1a';
            statusEl.style.color = '#44cc88';
            statusEl.innerHTML = '鎺ㄩ€佹垚鍔燂紒APP灏嗗湪鍑犲垎閽熷唴鏇存柊鐑偣銆?br><span style="font-size:11px;color:#5a7a99">' +
                dateStr + ' 路 ' + trends.length + '鏉＄儹鐐? + (note ? ' 路 ' + note : '') + '</span>';
            var records = JSON.parse(safeStorage.getItem('pqcn_admin_records') || '[]');
            records.unshift({
                code: '鐩樺墠鐑偣', phone: '-', pts: 0,
                note: trends.map(function(t){return t.title}).join(', ') + (note ? ' | ' + note : ''),
                time: new Date().toLocaleString('zh-CN'), ts: Date.now()
            });
            safeStorage.setItem('pqcn_admin_records', JSON.stringify(records));
        } else {
            statusEl.style.background = '#2a0a0a';
            statusEl.style.color = '#ff4466';
            statusEl.innerHTML = '鎺ㄩ€佸け璐? ' + (result.message || '鏈煡閿欒');
        }
    })
    .catch(function(e) {
        btn.disabled = false;
        btn.textContent = '鎺ㄩ€佺儹鐐瑰埌APP';
        statusEl.style.background = '#2a0a0a';
        statusEl.style.color = '#ff4466';
        statusEl.innerHTML = '鎺ㄩ€佸け璐? ' + e.message;
    });
}

// ========== 鍏呭€煎厬鎹㈢爜 ==========
function generateCode() {
    var phone = document.getElementById('creditPhone').value.trim();
    var pts = parseInt(document.getElementById('creditPts').value);
    var note = document.getElementById('creditNote').value.trim();
    if (!phone || phone.length < 4) { alert('璇疯緭鍏ユ墜鏈哄彿鍚?浣?); return; }
    if (!pts || pts <= 0) { alert('璇疯緭鍏ユ纭殑绉垎鏁?); return; }
    var ts = Date.now();
    var code = 'PQCN-' + phone + '-' + pts + '-' + ('' + ts).slice(-6);
    var records = JSON.parse(safeStorage.getItem('pqcn_admin_records') || '[]');
    records.unshift({ code: code, phone: phone, pts: pts, note: note, time: new Date().toLocaleString('zh-CN'), ts: ts });
    safeStorage.setItem('pqcn_admin_records', JSON.stringify(records));
    document.getElementById('generatedCode').textContent = code;
    document.getElementById('codeInfo').innerHTML = '鎵嬫満灏惧彿 ' + phone + ' 路 ' + pts + '绉垎' + (note ? ' 路 ' + note : '') + '<br>璇峰皢姝ゅ厬鎹㈢爜鍙戠粰鐢ㄦ埛锛屽湪APP"鍏戞崲绉垎"澶勮緭鍏ュ嵆鍙埌璐?;
    document.getElementById('codeDisplay').style.display = 'block';
    document.getElementById('creditPhone').value = '';
    document.getElementById('creditPts').value = '';
    document.getElementById('creditNote').value = '';
}

function copyCode() {
    var code = document.getElementById('generatedCode').textContent;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(function() { alert('宸插鍒? ' + code); });
    } else {
        var ta = document.createElement('textarea'); ta.value = code;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        alert('宸插鍒? ' + code);
    }
}

function loadHistory() {
    var records = JSON.parse(safeStorage.getItem('pqcn_admin_records') || '[]');
    var html = '';
    if (records.length === 0) {
        html = '<p style="font-size:12px;color:#5a7a99;text-align:center;padding:20px">鏆傛棤璁板綍</p>';
    } else {
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.code === '绛栫暐閫夎偂') {
                html += '<div class="record-item"><span style="color:#00ccaa;font-weight:700">馃搳 绛栫暐閫夎偂</span><br>' +
                    r.note + '<br><span class="time">' + r.time + '</span></div>';
            } else if (r.code === '鐩樺墠鐑偣') {
                html += '<div class="record-item"><span style="color:#ffaa00;font-weight:700">馃敟 鐩樺墠鐑偣</span><br>' +
                    r.note + '<br><span class="time">' + r.time + '</span></div>';
            } else {
                html += '<div class="record-item">' +
                    '<span class="pts">+' + r.pts + '绉垎</span> 鈫?鎵嬫満灏惧彿 ' + r.phone +
                    (r.note ? '<br>澶囨敞: ' + r.note : '') +
                    '<br>鍏戞崲鐮? <span style="color:#ffd966">' + r.code + '</span>' +
                    '<br><span class="time">' + r.time + '</span></div>';
            }
        }
    }
    document.getElementById('historyList').innerHTML = html;
}

function clearHistory() {
    if (confirm('纭畾娓呯┖鎵€鏈夋搷浣滆褰曪紵')) {
        safeStorage.removeItem('pqcn_admin_records');
        loadHistory();
    }
}

document.getElementById('adminPwd').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doLogin();
});


