#!/usr/bin/env bash
# ============================================================================
# UMP DL — Áp patch & push lên nhánh 019f7b7f (dùng trong Termux)
#
# Cách dùng (Termux):
#   1) Đưa file .patch vào thư mục repo (vd: mv /sdcard/Download/ai-iframe-filter.patch .)
#   2) Chạy lệnh dưới (thay <ten-patch> bằng tên file):
#        bash scripts/apply-push.sh <ten-patch>.patch "Mô tả thay đổi"
#
# Lệnh này sẽ:
#   - Kiểm tra bạn đang ở branch 019f7b7f (nhắc nếu chưa)
#   - Áp patch (git apply)
#   - Commit
#   - Push lên origin 019f7b7f
# ============================================================================
set -euo pipefail

PATCH_FILE="${1:-}"
COMMIT_MSG="${2:-patch update}"

if [[ -z "$PATCH_FILE" || ! -f "$PATCH_FILE" ]]; then
  echo "❌ Thiếu hoặc không tìm thấy file patch: $PATCH_FILE"
  echo "Cách dùng: bash scripts/apply-push.sh <ten-patch>.patch \"Mô tả\""
  exit 1
fi

BRANCH="019f7b7f"
CURRENT="$(git rev-parse --abbrev-ref HEAD)"

echo "📌 Branch hiện tại: $CURRENT"
if [[ "$CURRENT" != "$BRANCH" ]]; then
  echo "⚠️  Bạn đang ở branch '$CURRENT', cần chuyển sang '$BRANCH'."
  echo "   Chạy: git checkout $BRANCH"
  echo "   Rồi chạy lại lệnh này."
  exit 1
fi

echo "🔍 Kiểm tra patch áp được không..."
git apply --check "$PATCH_FILE"
echo "✅ Patch hợp lệ, đang áp..."
git apply "$PATCH_FILE"

echo "📝 Commit..."
git add -A
git commit -m "$COMMIT_MSG"

echo "🚀 Push lên origin/$BRANCH..."
git push origin "$BRANCH"

echo ""
echo "🎉 Hoàn tất! Đã push lên branch $BRANCH"
