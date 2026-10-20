#!/bin/zsh
# 双击：打开伴奏管理页（浏览器里拖 m4a 上架、改信息）。改完再双击「发布.command」上线。
cd "$(dirname "$0")" || exit 1
URL="http://localhost:3100"
if curl -s -o /dev/null -m 2 "$URL/api/status"; then open "$URL"; exit 0; fi
(sleep 1; open "$URL") &
node tools/beat-admin.mjs
