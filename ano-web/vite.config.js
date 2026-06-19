// build前エラー回避用コメント
/* global __dirname */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        // ① デフォルトのReact画面（index.html）
        main: resolve(__dirname, 'index.html'),
        // ② AI処理を行うスクリプトをビルド対象として追加
        background: resolve(__dirname, 'src/background.js')
      },
      output: {
        // ビルド後のファイル名にランダムな文字列（ハッシュ）を付けない設定
        // （manifest.jsonで "background.js" と名前を固定しているため必須）
        entryFileNames: '[name].js'
      }
    }
  }
})