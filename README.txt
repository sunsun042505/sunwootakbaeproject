선우택배 - '기기 공용 데이터' 고정팩 (build 2025-12-31 15:13:16 KST)

✅ 해결한 것
- 시간 안 뜸/클릭 먹통: 모든 스크립트를 DOMContentLoaded로 감싸고 clock 업데이트를 안전하게 처리
- 기기마다 데이터 다름: localStorage가 아니라 Netlify Functions + Netlify Blobs(서버 저장) 사용

구성
- index.html / kiosk.html / tracking.html / label.html
- netlify/functions/api.mjs
- netlify.toml (중요: /api/* -> functions redirect)
- package.json (@netlify/blobs)

배포(중요)
1) 이 폴더 내용 전부를 GitHub repo 루트에 업로드/커밋
2) Netlify가 그 repo를 자동배포하도록 연결되어 있어야 함
3) 배포 후 확인
   - https://<도메인>/api/ping  → JSON { "ok": true, ... }
   - index.html에서 기능 클릭 시 경고창 없이 정상 동작
