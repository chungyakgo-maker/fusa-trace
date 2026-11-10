# FuSa Trace

기능안전 산출물(FSR → TSR → FMEA → SSR/HSR → 시험)의 추적성과, DIA 기준 산출물 일정·작성 현황을
한눈에 보여 주는 **오프라인 Windows 앱**입니다. 인터넷에 연결하지 않고, 관리자 권한 없이 설치됩니다.

## 설치 파일 받기

**Releases** 페이지(오른쪽 메뉴)에서 최신 버전을 열고, 아래 중 **하나만** 받으면 됩니다.

| 파일 | 설명 |
|---|---|
| `FuSaTrace-<버전>-Setup.exe` | **설치형 (권장)**. 내 계정에만 설치되어 관리자 권한이 필요 없습니다. |
| `FuSaTrace-<버전>-Portable.exe` | 설치 없이 실행합니다. |
| `FuSaTrace-<버전>-win-x64.zip` | 원하는 폴더에 압축을 풀고 `FuSaTrace.exe`를 실행합니다. 위 두 가지가 막힐 때 씁니다. |

- 코드 서명이 없어서 처음 실행할 때 "Windows의 PC 보호" 창이 뜰 수 있습니다 → **추가 정보 → 실행**
- 개발 중인 최신 빌드는 **Actions** 탭 → 가장 위의 초록색 실행 → 아래쪽 **Artifacts**에서 받을 수 있습니다 (GitHub 로그인 필요).
- 설치 위치: `%LOCALAPPDATA%\Programs\FuSa Trace` / 데이터: `%APPDATA%\FuSaTrace`
- 지우기: Windows 설정 → 앱 → 설치된 앱 → FuSa Trace → 제거 (데이터 폴더는 남습니다)

## 지금 되는 것 (v0.2.0)

- **산출물 일정** (DIA 엑셀): 산출물별 담당·계획·실적·상태, 간트, VR 작성 O/X, 엑셀 출력 (작성 리스트, 담당자별 요약)
- **시스템 추적성** (FSR 엑셀 + TSC 워드): FSR → TSR 연결, 누락·확인 필요·없는 ID 참조·ID 중복
- **ID 대응표**: 애매한 연결을 한 번 고르면 다음 버전 문서에도 기억
- **문서 관리**: 버전 이력, 가져오기 결과 다시 보기, DIA 산출물 연결 바꾸기
- 다음: 연결 지도(M3), FMEA·SRS(M4), 하드웨어·처음 보는 양식(M5)

## 문서

- [`docs/SPEC.md`](docs/SPEC.md) — 무엇을 만드는지 (범위, 화면, 상태 규칙, 출력, 마일스톤)
- [`docs/FORMATS.md`](docs/FORMATS.md) — 문서별로 어떻게 읽는지
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — 결정 기록

## 개발 (GitHub Actions에서 자동으로 실행됨)

```
npm ci            패키지 설치
npm run typecheck 타입 검사
npm test          단위 테스트
npm run dist:win  Windows 설치 파일 빌드 (dist/)
npm run smoke     빌드된 앱 실행 확인
```

이 저장소에는 실제 회사 문서·고객사 이름·실제 ID를 올리지 않습니다. 테스트에는 가짜 문서만 씁니다.

글꼴: [Pretendard](https://github.com/orioncactus/pretendard) (SIL Open Font License 1.1) — 앱 안에 포함되어 있습니다.
