# 결정 기록 (DECISIONS)

SPEC·FORMATS와 다르게 하거나, 문서에 없던 것을 정한 내용을 날짜와 함께 남깁니다.

## 2026-11-10 (M0)

- **저장소를 퍼블릭으로 운영** (SPEC §3 "비공개"에서 변경)
  - 이유: GitHub Actions를 시간 제한 없이 쓰기 위해 (사용자 결정)
  - 대책: 고객사·제품·회사 이름과 실제 ID는 자리 표시나 가짜 값으로 바꿈
    (고객사 이름 → `<고객사>`, 예시 ID의 제어기 약어 → `CTL`, DRM 제품명 삭제).
    DRM 판별 글자 `DocuRay`는 판별 코드에 필요해서 남김.
  - 퍼블릭이라 Release 설치 파일은 GitHub 로그인 없이 받을 수 있음
- **push마다 Windows 설치 파일 빌드** (CLAUDE.md "push는 테스트만"에서 변경)
  - push마다: 테스트 → Windows 빌드 → 빌드된 exe 실행 확인(메뉴 표시, 외부 요청 0건, 화면 캡처) → Actions 아티팩트
  - `v*` 태그: 위와 같고 Release에도 올림
  - 이유: 퍼블릭이라 Actions 시간 제한이 없고, 빌드가 깨진 것을 바로 알 수 있음
- **설치 파일 3종**: NSIS 사용자 단위 설치(Setup.exe) + portable exe + zip
  - zip 추가 이유: portable exe는 실행할 때마다 임시 폴더에 풀어서 실행하는데, 회사 보안 프로그램이 임시 폴더 실행을 막으면 안 될 수 있음. zip은 원하는 폴더에 풀어 바로 실행
- **빌드 도구 electron-vite 사용**: main / preload / renderer 빌드를 한 설정으로 관리 (Vite 기반이라 SPEC의 React + Vite와 같음)
- **폰트 Pretendard(OFL) 포함**: 화면 글꼴을 앱 안에 넣음(외부 요청 0건)
- **외부 요청 차단 두 겹**: 화면의 CSP + 메인 프로세스에서 `file:`·`devtools:`·`data:` 외 모든 요청 취소. 맞춤법 사전 다운로드 끔, Electron 기본 메뉴(홈페이지 링크) 제거, 새 창 열기·페이지 이동 막음
- **버전**: M0 = `0.0.1`. 마일스톤마다 태그 `vX.Y.Z` (package.json 버전과 같아야 빌드됨)
