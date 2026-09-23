#!/bin/bash

# Kiểm tra nếu chưa có node_modules thì cài đặt
if [ ! -d "node_modules/puppeteer" ]; then
  echo "Đang cài đặt puppeteer..."
  pnpm i puppeteer -w
fi

PAGES=$1
if [ -z "$PAGES" ]; then
  read -p "Nhập số trang cần scrape (ví dụ 198): " PAGES
fi

if ! [[ "$PAGES" =~ ^[0-9]+$ ]]; then
  echo "Số trang không hợp lệ. Vui lòng nhập số."
  exit 1
fi

echo "Bắt đầu thu thập thông tin anime từ trang 1 đến trang $PAGES..."
# Sử dụng tsx để chạy file typescript
npx tsx scrape_anime.ts "$PAGES"

echo "Hoàn thành!"
