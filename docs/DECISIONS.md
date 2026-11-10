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
  - main에 push했을 때 package.json 버전(`v0.0.1` 등)의 Release가 아직 없으면: Actions가 Release와 태그를 만들어 설치 파일을 올림
    (이 작업 공간에서는 태그 push가 HTTP 403으로 막혀 있어서, 태그를 직접 올리는 대신 이렇게 함)
  - 이유: 퍼블릭이라 Actions 시간 제한이 없고, 빌드가 깨진 것을 바로 알 수 있음
- **설치 파일 3종**: NSIS 사용자 단위 설치(Setup.exe) + portable exe + zip
  - zip 추가 이유: portable exe는 실행할 때마다 임시 폴더에 풀어서 실행하는데, 회사 보안 프로그램이 임시 폴더 실행을 막으면 안 될 수 있음. zip은 원하는 폴더에 풀어 바로 실행
- **빌드 도구 electron-vite 사용**: main / preload / renderer 빌드를 한 설정으로 관리 (Vite 기반이라 SPEC의 React + Vite와 같음)
- **폰트 Pretendard(OFL) 포함**: 화면 글꼴을 앱 안에 넣음(외부 요청 0건)
- **외부 요청 차단 두 겹**: 화면의 CSP + 메인 프로세스에서 `file:`·`devtools:`·`data:` 외 모든 요청 취소. Electron 기본 메뉴(홈페이지 링크) 제거, 새 창 열기·페이지 이동 막음
- **맞춤법 사전 숨은 접속 차단**: Electron은 맞춤법 검사를 꺼도 시작할 때 영어 사전을 Google 서버(`redirector.gvt1.com`)에서
  받으려 함. 이 접속은 앱의 요청 차단기에 보이지 않음 → 사전 언어 목록을 비워서(`setSpellCheckerLanguages([])`) 시작하지 않게 함
  - 실행 확인 테스트에 Chromium 네트워크 기록(`--log-net-log`) 검사를 추가: 앱 코드 밖의 숨은 접속까지 0건이어야 통과.
    고치기 전 코드로 돌리면 이 검사가 `redirector.gvt1.com`으로 실패하는 것을 확인함
- **버전**: M0 = `0.0.1`. 마일스톤이 끝나면 package.json 버전을 올려 main에 push → Release 자동 생성
