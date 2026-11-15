#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
MYSQL_BIN="${MYSQL_BIN:-/opt/homebrew/opt/mysql@8.4/bin}"
mkdir -p .local/mysql
case "${1:-start}" in
 start)
  if [ ! -d .local/mysql/mysql ]; then
   "$MYSQL_BIN/mysqld" --initialize-insecure --datadir="$PWD/.local/mysql" --log-error="$PWD/.local/mysql-init.log"
  fi
  if [ -f .local/mysql.pid ] && kill -0 "$(cat .local/mysql.pid)" 2>/dev/null; then
   echo 'MySQL local ya está activo en 127.0.0.1:3307'; exit 0
  fi
  exec "$MYSQL_BIN/mysqld" --datadir="$PWD/.local/mysql" --socket="$PWD/.local/mysql.sock" --port=3307 --bind-address=127.0.0.1 --mysqlx=OFF --log-error="$PWD/.local/mysql.log" --pid-file="$PWD/.local/mysql.pid"
  ;;
 stop)
  "$MYSQL_BIN/mysqladmin" --socket="$PWD/.local/mysql.sock" -uroot shutdown
  ;;
 *) echo 'Uso: sh scripts/local-mysql.sh start|stop'; exit 1 ;;
esac
