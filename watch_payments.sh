#!/bin/bash
BOT_TOKEN="8514669574:AAEm2ZxUYezlesHLkB1c7TcdQlc7CoW5x4M"
CHAT_ID="1592739225"
LAST=$(sqlite3 /home/brack/brackoracle/oracle.db "SELECT total_revenue_usdc FROM stats WHERE id=1;")

while true; do
  sleep 60
  CURRENT=$(sqlite3 /home/brack/brackoracle/oracle.db "SELECT total_revenue_usdc FROM stats WHERE id=1;")
  if [ "$(echo "$CURRENT > $LAST" | bc -l)" = "1" ]; then
    QUERIES=$(sqlite3 /home/brack/brackoracle/oracle.db "SELECT total_queries FROM stats WHERE id=1;")
    curl -s "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -d "chat_id=${CHAT_ID}" \
      -d "text=💰 BrackOracle payment received! Total revenue: \$${CURRENT} USDC across ${QUERIES} queries."
    LAST=$CURRENT
  fi
done
