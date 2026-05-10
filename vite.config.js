import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";
import path from "path";

// ESM 환경에서 __dirname을 안전하게 가져오는 방법
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  // index.html이 들어있는 폴더
  root: "templates",
  // 정적 자산(favicon, svg 등)이 들어있는 폴더
  publicDir: "../public",
  build: {
    // 빌드 결과물을 프로젝트 루트의 dist 폴더로 전송
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // 엔트리 포인트 경로 설정
        main: resolve(__dirname, "templates/index.html"),
      },
    },
  },
});
