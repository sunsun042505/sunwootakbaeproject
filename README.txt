선우택배 패치팩 v1.0 (기존 UI 유지)
build: 2026-01-01 14:04:30 KST

핵심 수정:
1) Netlify Function 라우트 추가
- GET /ping (디버그용)
- DELETE /kv/set (index가 키 삭제할 때 필요)

2) 기존 index UI 유지 + 버전 표시 (v1.0) 추가
- 배송조회 버튼/배송흐름/기사메뉴/점포 입고/고객전달 기능은 index 내부 원본 그대로

3) kiosk 기능 복구(기존 UI 유지)
- 점포 로그인(점포명+점포코드) 게이트 추가 (/api/stores/login)
- 발급 시 rec.storeName/storeCode 기록 + /api/reservations/upsert 서버 저장
- 라벨 출력/배송조회 버튼 제공 (label.html / tracking.html 이동)
- 버전 표시 v1.0

업데이트(1.1/1.2...):
- APP_VERSION 문자열만 올려서 배포하면 화면에 버전이 바뀜.
