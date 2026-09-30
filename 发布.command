#!/bin/zsh
# 双击运行：把本文件夹的改动上传到 GitHub（cumusic.work）
cd "$(dirname "$0")" || exit 1

pause_exit() { echo; read -r "?按回车关闭窗口…"; exit "$1"; }

if ! gh auth status >/dev/null 2>&1; then
  echo "第一次使用：需要登录 GitHub（跟着提示用浏览器登录即可）"
  gh auth login --hostname github.com --git-protocol https --web || pause_exit 1
fi
gh auth setup-git >/dev/null 2>&1

echo "① 先同步线上的最新版本…"
if ! git pull --rebase --autostash -q; then
  echo "✗ 同步失败：线上和本地改了同一处。把这个窗口截图发给 Claude 处理。"
  pause_exit 1
fi

git add -A
if git diff --cached --quiet; then
  echo "✓ 没有新改动，线上已经是最新的。"
  pause_exit 0
fi

echo
echo "② 这次要上传的文件："
git diff --cached --name-status | sed 's/^M/  修改/; s/^A/  新增/; s/^D/  删除/; s/^R[0-9]*/  改名/'
echo
read -r "?按回车上传，关闭窗口则取消… "

git commit -q -m "更新网站 $(date '+%Y-%m-%d %H:%M')" || pause_exit 1
if git push -q; then
  echo "✓ 上传完成。1–2 分钟后刷新 https://cumusic.work 就能看到。"
  pause_exit 0
else
  echo "✗ 上传失败。把这个窗口截图发给 Claude 处理。"
  pause_exit 1
fi
