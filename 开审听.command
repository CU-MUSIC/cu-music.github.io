#!/bin/bash
# 双击：给一首歌开通审听页。选它的任意一个 bounce，
# 同文件夹里这首歌的所有版本（V1、V2…）都会加上去并自动上线，之后的新 bounce 由 Hazel 自动加。
cd "$(dirname "$0")" || exit 1
HOOK="$PWD/tools/review-hook.sh"

F=$(osascript -e 'POSIX path of (choose file with prompt "选这首歌的任意一个 bounce（m4a / mp3 / wav）" of type {"public.audio"})' 2>/dev/null)
[[ -n "$F" ]] || exit 0

DIR=$(dirname "$F"); NAME=$(basename "$F")
SONG=$(echo "${NAME%.*}" | sed -E 's/_V[0-9]+_[0-9]{4}$//; s/_[0-9]+$//; s/@ChefDao.*$//; s/[[:space:]]+$//; s/[[:space:]]+(Edit|Mix|Master)$//')
echo "开通审听：$SONG"

# 每个版本只取一个格式（m4a > mp3 > wav），按版本号从小到大加
shopt -s nullglob
LIST=$(for f in "$DIR/$SONG"*"@ChefDao_V"*_[0-9][0-9][0-9][0-9].{m4a,mp3,wav}; do
  b=$(basename "$f"); v=$(echo "$b" | sed -E 's/.*@ChefDao_V([0-9]+)_[0-9]{4}\..*/\1/')
  e="${f##*.}"; p=3; [[ "$e" == "mp3" ]] && p=2; [[ "$e" == "m4a" ]] && p=1
  printf '%05d\t%d\t%s\n' "$v" "$p" "$f"
done | sort -k1,1n -k2,2n | awk -F'\t' '!seen[$1]++ {print $3}')
[[ -n "$LIST" ]] || LIST="$F"

COUNT=$(echo "$LIST" | wc -l | tr -d ' ')
echo "找到 $COUNT 个版本，正在加密上传…（最后一个版本上线后，微信会收到可以转发给客户的链接）"
i=0
while IFS= read -r f; do
  i=$((i+1)); echo "  [$i/$COUNT] $(basename "$f")"
  if [[ $i -lt $COUNT ]]; then REVIEW_PUBLISH=0 bash "$HOOK" "$f" --enable; else bash "$HOOK" "$f" --enable; fi
done <<< "$LIST"

tail -n 3 "$PWD/chefdao/review/_secret/hook.log"
echo; read -r -p "完成。按回车关闭窗口…"
