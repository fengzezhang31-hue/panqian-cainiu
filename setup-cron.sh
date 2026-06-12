#!/bin/bash
# ??? ?????? ? ??????????????
# SSH???????: bash /www/wwwroot/panqian-cainiu/setup-cron.sh

echo "=== ??? ??????? ==="

# ??Token???????crontab??
TOKEN="YOUR_GITHUB_TOKEN_HERE"

# ??crontab??
# Phase1: ???? 8:36 ??
(crontab -l 2>/dev/null | grep -v "cron-trigger.js") | crontab -
(crontab -l 2>/dev/null; echo "36 8 * * 1-5 LPS_TOKEN= /usr/bin/node /www/wwwroot/panqian-cainiu/cron-trigger.js phase1 >> /var/log/liupanshan-trigger.log 2>&1") | crontab -
(crontab -l 2>/dev/null; echo "38 8 * * 1-5 LPS_TOKEN= /usr/bin/node /www/wwwroot/panqian-cainiu/cron-trigger.js phase1 >> /var/log/liupanshan-trigger.log 2>&1") | crontab -

# Phase2: ???? 9:27 ??
(crontab -l 2>/dev/null; echo "27 9 * * 1-5 LPS_TOKEN= /usr/bin/node /www/wwwroot/panqian-cainiu/cron-trigger.js phase2 >> /var/log/liupanshan-trigger.log 2>&1") | crontab -
(crontab -l 2>/dev/null; echo "29 9 * * 1-5 LPS_TOKEN= /usr/bin/node /www/wwwroot/panqian-cainiu/cron-trigger.js phase2 >> /var/log/liupanshan-trigger.log 2>&1") | crontab -

echo "Crontab ???:"
crontab -l
echo ""
echo "=== ???? ==="
echo "Phase1: ???? 8:36 + 8:38 (?????)"
echo "Phase2: ???? 9:27 + 9:29 (?????)"
echo "??: /var/log/liupanshan-trigger.log"
