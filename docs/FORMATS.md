# 문서별 읽기 규칙 (FORMATS)

> 실제 회사 문서를 분석해서 정리한 규칙입니다. 실제 문서는 저장소에 없습니다.
> 예시의 ID·파일명은 형태만 같은 가짜 값입니다 (`<고객>`, `<제품>`, `<제어기>` 등은 자리 표시).
> 원칙: **셀 위치가 아니라 헤더 글자로 찾는다. 못 읽으면 건너뛴 이유를 남긴다.**

---

## 1. DRM 파일 판별

- 회사 DRM이 걸린 파일은 앞부분(32바이트 안)에 ASCII `DocuRay` 글자가 있고, 나머지는 암호화되어 있음
- 정상 .xlsx/.docx는 zip이므로 `PK\x03\x04`로 시작, .xls/.doc은 OLE(`D0 CF 11 E0`)로 시작
- 판별 순서: 앞 32바이트에 `DocuRay` 포함 → DRM 안내 / zip도 OLE도 아님 → "읽을 수 없는 파일" 안내
- 안내 문구 예: "보안(DRM)이 걸린 파일입니다. 보안 해제 후 다시 넣어 주세요."

## 2. 문서 종류 자동 판별 (내용 기준, 파일명은 보조)

| 종류 | 판별 신호 |
|---|---|
| DIA | 엑셀. 시트 이름에 `Detailed Agreement` 포함, 또는 어떤 시트에 `Work products`와 `In charge of Team` 헤더가 함께 있음 |
| FSR | 엑셀. `ID_FSR`(또는 동의어 §4) 헤더가 있는 시트가 있음. 보통 `2. 안전 목표` 시트도 있음 |
| FMEA | 엑셀. 헤더에 `Failure Cause` 또는 `고장 원인 (FC)`가 있는 시트가 있음 |
| TSC | 워드. 첫 행이 `Ref ID`, `TSR ID`로 시작하는 표가 1개 이상 |
| SRS | 워드. 첫 행이 `Item`, `Description` 2칸이고 아래에 `Requirement Identifier` 행이 있는 표가 1개 이상 |
| VR | 파일명에 `Verification Report`(공백·`_`·대소문자 무관) 포함 → **내용은 열지 않음** (.xls 포함) |
| 기타 | 위에 해당 없음 → 사용자가 종류 선택 + 필요시 칸 지정(§13) |

신호가 둘 이상 맞으면 사용자에게 고르게 함.

## 3. 공통 규칙

### 3.1 헤더 찾기
- 시트(또는 표) 위쪽에서 기대하는 헤더 글자가 가장 많이 들어 있는 행을 헤더 행으로 봄
- 비교 전 정리: 줄바꿈·연속 공백을 공백 1개로, 앞뒤 공백 제거, 대소문자 무시, 전각 문자 → 반각
  - 예: `FTTI/EOTI\n[ms]` ≈ `FTTI/EOTI [ms]`, `TSR  ID`(공백 2개) ≈ `TSR ID`
- 헤더가 2줄(영문 줄 + 한글 줄, 또는 그룹 줄 + 세부 줄)인 경우가 있음 → 위아래 2~3줄을 함께 보고 칸을 찾음
- 헤더 칸 **바깥의 열**(팀원이 양식 왼쪽·오른쪽에 덧붙인 메모, 임시 매핑 등)은 읽지 않음

### 3.2 병합 셀
- 엑셀: 병합 범위의 값은 왼쪽 위 셀에만 있음 → 범위 전체에 같은 값으로 채워서 읽음
- 워드: 가로 병합(`gridSpan`)은 한 칸으로, 세로 병합(`vMerge`)은 위 셀 값을 이어받음. 같은 셀이 여러 번 나오지 않게 중복 제거

### 3.3 값 정리
- 빈 값으로 볼 것: 빈칸, `-`, `—`, `N/A`(단, 상태값의 N/A는 "대상 아님"으로 따로 처리), `T.B.D.`, `TBD`, `YYYY.MM.DD`(자리 표시)
  - `T.B.D.`/`TBD`/`(정의필요)`는 "미정" 경고로도 기록
- 셀 안 줄바꿈은 본문에서는 유지, 목록(ID 여러 개)에서는 구분자로 사용
- 표 아래에 떨어져 있는 메모 행(헤더와 무관한 칸에만 값이 있는 행)은 무시
- 표의 끝: ID 칸과 본문 칸이 모두 빈 행이 나오면 끝 (단, DIA는 §6 규칙)

### 3.4 동의어 사전 (기본값, 설정에서 추가 가능)

| 의미 | 동의어 |
|---|---|
| FSR ID | `ID_FSR`, `FSR ID`, `식별번호`, `FSR ID/식별번호` |
| FSR 내용 | `내용`, `FSR` |
| Safe State | `ID_SafeState`, `SS_ID`, `Safe State`, `Safe state`, `Safety State` |
| FTTI | `FTTI/EOTI [ms]`, `FTTI`, `FTTI / FTHI`, `감지/응답시간`, `FRTI`(오타) |
| 허용 기준 | `Acceptance Criteria`, `Acceptance criteria`, `허용기준` |
| 요소 | `Element`, `Name of Functional Block` |
| Safety Mechanism | `Safety Mechanism`, `SM` |
| 요구 내용(SRS) | `Detailed Requirements`, `Requirement Description` |
| 상위 요구(SRS) | `Higher-Level Requirement`, `higher-level requirements` |
| FMEA TSR | `TSR ID`, `TSR  ID` |

---

## 4. FSR (고객 기능안전 요구사양서, 엑셀)

### 4.1 시트 구성 (예)
`표지`, `목차`, `제정 및 개정이력`, `1. 개요`, `2. 안전 목표`, `3.1. 기능안전 요구사항 (SG001)`, `3.2. … (SG002)` …, 그 외 작업용 시트(`Sheet1`, `기타` 등)는 무시

### 4.2 버전
- `제정 및 개정이력` 시트에서 `버전` 헤더 표의 마지막 값이 있는 행 (예: `R00`)

### 4.3 안전목표·안전상태 (`2. 안전 목표` 시트)
- `ID_SafetyGoal` 헤더가 있는 표가 **여러 개** 있음 → 같이 있는 헤더로 구분
  - SG 정의: `ID_SafetyGoal` + `안전 목표 (Safety Goal)` + `ASIL` + `재난요인 (Hazard)`
  - FTTI: `ID_SafetyGoal` + `FTTI [ms]`
  - 요약: `ID_SafetyGoal` + `ASIL` + `ID_SafeState` + `FTTI/EOTI [ms]` + `Acceptance Criteria`
- Safe State: `ID_SafeState` + `안전 상태 (Safe State)` + `상세 내용`
- 같은 시트에 SG와 무관한 표(상태 천이 조건 등)도 있음 → 무시

### 4.4 FSR 표 (`3.x … (SGxxx)` 시트, SG마다 1장)
- 시트 이름 괄호 안이 SG ID (예: `SG001`). 시트 위쪽 제목 셀에도 `SG001 <안전목표 문장>`이 있음
- 한 시트에 FSR 헤더 표가 **3개**, 순서대로:
  1. 자체 FSR (`3.x.2 기능안전 요구사항 상세`)
  2. 타 ECU에 요구 (`External requirements to other ECUs`) — 비어 있을 수 있음
  3. 타 ECU로부터 받은 요구 (`External requirements from other ECUs`)
  - 표 바로 위의 절 제목 글자(`to other ECUs`, `from other ECUs`)로도 확인
- 헤더 예: `ID_FSR` | `내용` | `ID_SafeState` | `ASIL` | `FTTI/EOTI [ms]` | `Acceptance Criteria` | `Allocation`
- 다른 제어기 양식 변형 예: `FSR ID`(또는 `식별번호`) | `Type` | `Allocation` | `FSR` | `감지/응답시간` | `허용기준` | `SG_ID` | `ASIL` | `SS_ID`
  - 이 경우 SG는 `SG_ID` 칸에서 읽음
- FSR ID 형태가 고객·제어기마다 다름 → **패턴을 가정하지 말 것**
  - 예: `FSR.001.009`(가운데가 SG 번호), `FSR.006.055`(다른 시스템 SG의 요구), `<차종코드><제어기>SR110`
- Allocation 값 예: `General`(일반 요구), `<자기 제어기명>\n(<설명>)`, `<타 제어기명>`
  - `General` → 분류 "일반", 그 외는 그대로 보관
- Safe State 값 예: `SS001`, `-`, `SS001\n(필요 시 SS002)`, `T.B.D.`
- 양식 왼쪽 열(A~C 등)에 팀이 덧붙인 TSR 매핑·라벨, 오른쪽에 메모가 있을 수 있음 → **읽지 않음** (TSR 연결의 원본은 TSC)

## 5. TSC (사내 기술안전개념서, 워드)

### 5.1 TSR 표
- 첫 행: `Ref ID` | `TSR ID` | `Technical Safety Requirements` | `분류` | `ASIL` | `Allocation`
- 둘째 행: 위 순서대로 값
- 셋째 행부터: 2칸짜리 속성 행 (키 | 값). 키 동의어는 §3.4
  - `Element`/`Name of Functional Block`, `Operating Mode`, `Safe State`, `Safety Mechanism`/`SM`, `FTTI`/`FTTI / FTHI`, `Acceptance criteria`, `Status`
- **한 표 안에 TSR이 2개 이상 붙어 있을 수 있음** → 표 중간에 `Ref ID`로 시작하는 행이 다시 나오면 새 TSR로 나눔 (사이에 빈 행이 있을 수 있음)
- 병합 셀 때문에 같은 칸이 여러 번 나오지 않게 중복 제거

### 5.2 값
- `Ref ID`: FSR ID 여러 개. 구분자는 줄바꿈, `,`, `/`, 공백이 섞여 있음 (예: `FSR.001.002, \nFSR.001.006, \nFSR.001.029`)
- `TSR ID` 형태 예: `TSR-<제어기>-SG001-017`, `TSR-<제어기>-GEN-001`, `TSR-<제어기>-<기능>-026`
  - **같은 문서 안에서 같은 TSR ID가 다른 내용으로 2~3번 나오는 경우가 실제로 있음** → 각각 보존하고 "ID 중복"
  - 번호가 비어 있는 경우도 있음 (예: 024 없음) → 오류 아님
- `분류` 값: `일반`, `공통`, `입력`, `제어`, `출력`, `통신` (`일반`/`공통` = 일반 요구)
- `ASIL` 값: `A`, `B`, `B(D)`, `QM` … → 원문 보관 + 앞 글자(A~D/QM) 따로
- `Allocation` 값: `H/W`, `HW`, `S/W`, `SW`, `SW, H/W`, `S/W (<고객사>)`, `S/W (<고객사>))`(괄호 오타), `S/W (<협력사>)`
  - 정규화: HW / SW / BOTH + 괄호 안 담당 주체는 메모로
- `Status` 값: `평가 완료`, `Complete` → 완료 / `설계 진행중`, `Design in progress` → 진행 / `미적용`, `미해당`, `N/A` → **대상 아님**(커버리지 제외)
- `Safe State` 칸에 `Normal Mode`, `S N/A` 같은 잘못 들어간 값이 있을 수 있음 → 그대로 보관(1단계에서는 검사하지 않음)

### 5.3 요소(Element)
- 표의 `Element`/`Name of Functional Block` 값 우선 (예: `MCU [ELE-009]`, `General`)
- 없으면 표 앞의 가장 가까운 제목 2(Heading 2) 글자 (예: `Element 21 [Main MCU]`, `ELE-009 (MCU)`)
- 제목 스타일은 `word/styles.xml`에서 스타일 ID → 이름으로 바꿔서 판단 (`heading 2`, `제목 2` 모두 인정). 목차 스타일(`toc 1~3`)은 무시

### 5.4 그 밖
- 문서 버전: `Document Change History` 표(`Date` | `Ver.` | `Editor` | `Chap.` | `Description` | `CR#`)의 마지막 값이 있는 행
- 문서 3장 등에 FSR 표 사본(`FSR ID`/`식별번호` | `Type` | `Allocation` …)이 있음 → 1단계에서는 **읽지 않음** (FSR 원본은 FSR 엑셀)
- Safety Mechanism 목록 표(`SM ID` | `Description` | `관련 TSR` …)도 1단계에서는 무시
- 문서가 큼: 본문 XML 약 20MB, 표 300개 이상, OLE·EMF 그림 다수 → 그림·첨부는 건너뛰고 표·제목만 스트리밍으로 읽기
- TSR 제목(Heading 3)과 표 안 문장이 조금 다를 수 있음(앞 번호, 오타) → **표 안 문장을 사용**

## 6. DIA (고객 개발 인터페이스 협약서, 엑셀) — 일정의 원본

### 6.1 읽는 것과 안 읽는 것
- **읽음**: `No.`, `Part-clause No.`, `Work products`, `Actual work product name / Identifier / Version`, PLAN `Start`/`End`, Real `Start`/`End`, `In charge of Team`
- **안 읽음**: R/S/A 책임, Delivery type, Who sends to whom, 이견·협의 칸, `Status`, 코멘트, 다른 시트(`Cover`, `History`, `Organization`, `Review Plan` 등)

### 6.2 시트·헤더
- 시트 이름에 `Detailed Agreement` 포함 (없으면 `Work products` 헤더가 있는 시트)
- 헤더가 여러 줄(예: 4~7행):
  - 한 줄에 `Part-clause No.` | `Clause title` | `No.` | `Work products …` | `Details of content to be exchanged` …
  - 다른 줄에 `Actual work product name \n/ Identifier / Version` | `Work product link` | `Start` | `End` | `Start` | `End` | `In charge of Team` | `Status` | `commnet`(오타)
  - 그 위 줄에 그룹 이름 `PLAN`, `Real`
- `Start`/`End`가 두 번씩 나옴 → 바로 위 그룹 줄에서 **왼쪽으로 가장 가까운 그룹 이름**(`PLAN` / `Real`)으로 구분
- R/S/A 기호 행(`R`, `S`, `A`만 있는 행)은 헤더의 일부 → 데이터 아님

### 6.3 데이터 행
- `No.` 칸에 숫자가 있는 행이 산출물 행 (약 120행)
- 시트의 사용 범위가 100만 행 근처까지 잡혀 있음 → **빈 행이 20줄 연속되면 중단**
- `Part-clause No.`는 병합(그룹 첫 행에만 값) → 아래로 채움. 값 예: `2-5`, `2-6`, `3-6`, `4-6`, `5-7`, `6-C`, `8-9`
  - 구분: 앞 숫자 2·8 → 관리, 3·4 → 시스템, 5 → HW, 6 → SW, 그 외 → 기타

### 6.4 한 행에 파일이 여러 개
- `Actual work product name` 칸에 줄바꿈으로 여러 줄:
  - 파일명 줄: 확장자(.xlsx .xls .docx .doc .pdf)가 있음 → 산출물 1줄씩 생성
  - 파일명이 아닌 줄: `FMEDA 대체`, `FTA / DFA 제외`, 작성 안내문(예: "… 정확히 기재 할 것") → 메모로만
- 날짜 칸도 같은 행에서 여러 줄, 형식 `라벨: 날짜`
  - 라벨 예: `FMEA`, `DFA`, `FTA `, `TSC VR`, `HSI VR`, `FMEDA VR`, `HSD VR` (콜론 앞뒤 공백 있음/없음 섞임)
  - 날짜 없는 줄(`FTA / DFA 제외`)은 메모
- 짝짓기
  1. 파일명에서 문서 토큰 추출: 괄호 안 글자(예: `(TSC)`), 알려진 토큰(TSC, FMEA, FTA, DFA, HSI, HSR, HSD, FMEDA, SSR, SRS, TSR, FSR …), 파일명에 Verification Report가 있으면 `VR`
  2. 날짜 줄 라벨의 토큰이 파일 토큰에 모두 포함되면 짝 (예: `TSC VR` ↔ `…(TSC) Verification Report_R1.xls`, `FMEA` ↔ `…_시스템 FMEA_R1.xlsx`)
  3. 라벨로 안 맞으면, 파일 줄 수와 날짜 줄 수가 같을 때 순서대로 짝
  4. 그래도 안 되면 날짜를 행 전체에 적용하고 경고
- 파일명 칸이 비어 있고 날짜만 있으면 → 파일명 없는 산출물 1줄
- 날짜 칸이 엑셀 날짜 하나뿐이면 → 그 행의 모든 줄에 적용

### 6.5 날짜
- 엑셀 날짜 셀 → 날짜
- 글자: `2026-04-27`, `2026-6-05`(한 자리 월), `2026.06.05` 인정
- 해석 불가 → 경고: `2026-06-`(일 없음), `2026-05-`, 그 외
- `N/A`, 빈칸, `YYYY.MM.DD` → 없음
- 경고: 계획 종료 < 계획 시작 (실제로 있음), 실적 종료 < 실적 시작

### 6.6 담당
- 값 예: `<팀명>\n<이름> <직급>`, 여러 명이면 줄바꿈이나 `,`로 이어짐
- 첫 줄 = 팀, 나머지 = 사람. 팀만 있으면 사람은 비움
- `N/A` → 그 행은 일정 대상에서 **제외**
- 빈칸 → "담당 미지정"으로 **포함**
- 담당 주체(고객사 / 당사 / 사내 타 팀)는 구분하지 않음

### 6.7 VR 산출물
- `Work products`에 `Verification`이 들어 있거나, 파일명 줄에 Verification Report가 있으면 VR 산출물로 표시 → 작성 여부 O/X 관리 대상

## 7. ID 정규화와 참조 해석

### 7.1 정규화
- 앞뒤 공백 제거, 유니코드 NFC, 전각 → 반각, 대문자
- 공백·`_` → `-`, `-` 여러 개 → 하나, 끝의 `,` `.` `)` 제거
- 예: `ABC_XYZ_TSR_009` → `ABC-XYZ-TSR-009`

### 7.2 참조 문자열에서 ID 뽑기
참조 칸은 자유 글이 섞여 있음. 칸 종류에 따라 기대하는 ID 종류가 정해짐.

| 칸 | 기대 종류 | 원문 예 | 뽑힌 ID |
|---|---|---|---|
| TSC `Ref ID` | FSR | `FSR.001.009 / FSR.001.010` | FSR.001.009, FSR.001.010 |
| TSC `Ref ID` | FSR | `FSR.001.002, \nFSR.001.006, \nFSR.001.029` | 3개 |
| TSC `Ref ID` | FSR | `XXXCTLSR110\nXXXCTLSR210\nYYYCTLSR810` | 3개 |
| SRS `Functional Safety Related` | TSR | `Yes (TSR-017, TSR-037)` | TSR-017, TSR-037 |
| SRS `Functional Safety Related` | TSR | `Yes(TSR-017, TSR-018)` | 2개 |
| SRS `Functional Safety Related` | TSR | `Yes` | 없음 → **"Yes인데 TSR 없음" 확인 필요** |
| SRS `Functional Safety Related` | TSR | `No`, 빈칸, `-` | 없음 (안전 무관) |
| FMEA `TSR ID` | TSR | `\nABC_XYZ_TSR_009\nABC_XYZ_TSR_010` | 2개 |

- FSR 참조: 구분자(줄바꿈 `,` `/` 공백)로 나눈 조각 중 숫자가 들어 있는 것
- TSR 참조: `TSR`이 들어 있고 숫자로 끝나는 덩어리 (`TSR-017`, `TSR_017`, `TSR 017`, `ABC_XYZ_TSR_009`, `TSR-<제어기>-SG001-017`)
- 뽑은 값이 0개인데 칸이 비어 있지 않고 안전 관련 표시(`Yes`)가 있으면 경고

### 7.3 해석 순서 (SPEC §7과 동일)
1. 별칭표 → 2. 그대로 일치 → 3. 정규화 일치 → 4. 끝 번호 일치
- 끝 번호: 마지막 숫자 덩어리를 정수로 (`017` = `17`)
- 종류 토큰(`TSR`, `FSR`, `SSR`)이 같은 항목끼리만 비교. 형식이 `FSR.001.009`처럼 점으로 된 경우 전체 정규화 비교를 우선
- SG 번호(`SG001`, `SG_01` → 1)가 참조와 대상 양쪽에 있으면 같아야 함
- 결과: 후보 1개 = 자동(약식 표기), 2개 이상 = 확인 필요, 0개 = 없는 ID
- 대상 ID가 정의 문서에서 중복이면 = 확인 필요

## 8. 파일명 정규화와 DIA 매칭

- 경로 제거 → 확장자 제거 → NFC → 소문자
- 구분자 `_` `-` `.` 공백 `[` `]` `(` `)`로 토큰 분리 (괄호 안 글자는 토큰으로 남김)
- 버릴 토큰: 버전(`r1`, `r00`, `r2.0`, `v1.5`, `v1.1`, `rev00`), 날짜·일련 숫자(4~8자리 숫자: `260424`, `20260504`, `0421`), 언어(`eng`, `kor`), `draft`, `final`, 복사본 표시(`(1)`)
- 남은 토큰 순서가 같으면 같은 문서 → 자동 연결
- 다르면 토큰 겹침 비율(자카드) 0.8 이상을 후보로 보여 주고 사용자가 확인
- 예: `[기능안전]_<프로젝트>_시스템 FMEA_R1.xlsx`와 `[기능안전]_<프로젝트>_시스템 FMEA_R2.xlsx` → 같음
- 주의: 파일명과 실제 내용이 다른 경우가 있음 (예: 파일명은 "System Requirement Specification Verification Report"인데 내용은 TSC VR). 1단계는 파일명 기준으로만 연결하고, 사용자가 화면에서 연결을 바꿀 수 있게 함

## 9. 테스트용 가짜 문서에 재현할 특이점

가짜 문서 생성 스크립트는 아래를 **모두** 포함할 것. 각 항목은 단위 테스트 1개 이상과 연결.

**FSR**
- [ ] 안전목표 시트에 `ID_SafetyGoal` 헤더 표 3개(정의/FTTI/요약) + 무관한 표
- [ ] SG 시트 2장, 각 시트에 FSR 표 3개(자체 / to other ECUs(빈 표) / from other ECUs)
- [ ] 헤더 셀 안 줄바꿈 (`FTTI/EOTI\n[ms]`, `Acceptance\nCriteria`)
- [ ] 병합 셀(내용 칸이 가로 병합)
- [ ] 양식 왼쪽에 팀이 덧붙인 TSR 매핑 열, 오른쪽 메모 열 (읽으면 안 됨)
- [ ] 표 아래 떨어진 메모 행
- [ ] `T.B.D.`, `-`, `SS001\n(필요 시 SS002)` 값
- [ ] 다른 ID 형식(`<차종코드><제어기>SR110`)과 `FSR ID`/`Type`/`SG_ID` 헤더 변형 파일 1개

**TSC**
- [ ] TSR 표 40개 이상 + 300개 이상짜리 대용량 파일 1개(성능 확인)
- [ ] 한 표 안에 TSR 2개 붙은 경우(사이 빈 행)
- [ ] 같은 TSR ID가 다른 내용으로 2번, 3번 나오는 경우
- [ ] 번호 건너뜀(024 없음)
- [ ] 속성 키 변형(`Element` vs `Name of Functional Block`, `SM` vs `Safety Mechanism`, `FTTI` vs `FTTI / FTHI`)
- [ ] Status 한글/영문/미적용 혼합, Allocation 변형(`S/W (<고객사>))` 오타 포함)
- [ ] Ref ID 구분자 혼합(줄바꿈, `, \n`, ` / `)
- [ ] 목차(toc 스타일) 안의 같은 문장, 제목과 표 문장 불일치
- [ ] 없는 FSR을 가리키는 Ref ID, TSR이 하나도 없는 FSR

**FMEA**
- [ ] 영문 헤더 줄 + 한글 헤더 줄, `TSR  ID`는 한글 줄(그룹 `Remark` 아래)에만 있음
- [ ] `↑`로 위 값 반복, 병합 셀
- [ ] `N/A` 고장원인 행, TSR ID 셀이 줄바꿈으로 시작
- [ ] ASIL B인데 TSR ID 없는 행
- [ ] TSR 칸이 아예 없는 옛 양식 파일 1개

**SRS**
- [ ] `Item | Description` 표 50개 이상, 키 이름 변형(§3.4)
- [ ] `No separate identifier assigned`, 빈 ID 표(개발 제약 항목)
- [ ] `Functional Safety Related` 값 변형(`Yes (…)`, `Yes(…)`, `Yes`, `No`, 빈칸, `-`)
- [ ] ASIL B인데 TSR 없음, 약식 `TSR-0xx`가 TSC의 중복 ID를 가리킴

**DIA**
- [ ] 헤더 여러 줄, `Start`/`End` 두 번(PLAN/Real 그룹), R/S/A 기호 행
- [ ] 사용 범위가 매우 큰 시트(빈 행 다수)
- [ ] Part-clause 병합
- [ ] 한 칸에 파일명 3~5개 + `라벨: 날짜` 여러 줄, 라벨 공백 변형
- [ ] 파일명 아닌 줄(`FMEDA 대체`, `FTA / DFA 제외`, 안내문)
- [ ] 날짜 오류(`2026-6-05`, `2026-06-`, 종료 < 시작), `YYYY.MM.DD` 자리 표시
- [ ] 담당 여러 명 / 빈칸 / `N/A`
- [ ] VR 산출물 행

**공통**
- [ ] 앞부분에 `DocuRay` 글자가 든 가짜 DRM 파일
- [ ] .xls 형식의 VR 파일(내용 불필요)
- [ ] 같은 문서의 R1 → R2 개정(항목 추가·삭제·변경) — 비교 결과 확인용

## 10. FMEA (AIAG-VDA 양식, 엑셀)

### 10.1 시트
- 헤더에 `Failure Cause`(또는 `고장 원인 (FC)`)가 있는 시트를 모두 읽음 (예: `FMEA_SG001`, `FMEA_SG002`)
- 그 외 시트(`History`, `Architecture`, `System Element`, `AP … risk matrix`, `… Rating Criteria`, `Failure Mode Classification`, 작성 예제·작성법 시트)는 무시

### 10.2 헤더 (2줄)
- 그룹 줄: `STRUCTURE ANALYSIS (STEP2)`, `FUNCTION ANALYSIS (STEP 3)`, `FAILURE ANALYSIS (STEP 4)`, `RISK ANALYSIS (STEP 5)`, `OPTIMIZATION (STEP 6)`
- 영문 줄 예: `1. Next Higher Level` | `2. Focus Element` | `3. Next Lower Level or Characteristic Type …` | … | `2. Failure Mode(FM) of the Focus Element` | `3. Failure Cause(FC) of the Next Lower Element or Characteristic` | … | `System FMEA AP`(또는 `DFMEA AP`) | … | `Remark`
- 한글 줄 예: `다음 단계` | `초점 요소` | … | `TSR  ID` | `ASIL` | `비고`
- **`TSR ID`와 `ASIL`은 한글 줄에만 있음** → 두 줄을 함께 봐야 함

### 10.3 데이터
- 한글 헤더 줄 다음 행부터
- 고장원인 칸이 비었거나 `N/A`인 행 → 건너뜀(이유: 대상 아님)
- `↑` = 바로 위 값과 같음 → 위 값으로 채움. 병합 셀도 채움
- 읽을 칸: 요소(`3. Next Lower Level …`, 첫 줄을 그룹 이름으로: 예 `Power Control (Element 1)`), 고장모드, 고장원인, TSR ID(여러 줄), ASIL, AP
- 지도 표시: 요소별로 묶어 "고장원인 n건" 카드
- TSR ID 칸이 없는 FMEA → 가져오기 결과에 "TSR 연결 칸 없음 — 작성 여부만 관리" 표시

## 11. SRS (소프트웨어 요구사양서, 워드)

- 요구사항 1개 = 첫 행이 `Item` | `Description`인 2칸 표 1개, 아래는 키 | 값 행
- 키: `Requirement Identifier`(ID), `Requirement Title`, 요구 내용(동의어 §3.4), `Requirement Supported`, `Variants`, `Requirement Reuse`, `Requirement Priority`, `Requirement Verification`, `Functional Safety Related`, `ASIL`, `FTTI`/`FRTI`, `Safety State`, 상위 요구(동의어 §3.4)
- ID 예: `FS_SSR-123456`
- ID가 빈칸이거나 `No separate identifier assigned`인 표 → 요구사항 아님(코딩 규칙, 스택 설정 등 개발 제약) → 건너뜀(이유 기록)
- TSR 참조는 `Functional Safety Related`에서 뽑음(§7.2)
- 역방향: ASIL이 A~D인데 TSR 참조가 없으면 "TSR 없는 안전 관련 SSR"
- 문서 안의 참조 문서 표(`Document Name (or CodeBeamer Tracker Name)` 등)는 무시

## 12. Verification Report (동료검토 결과)

- **내용을 열지 않음.** 파일명만 사용
- 파일명 판별: `verification[\s_-]*report` (대소문자 무시)
- 어떤 산출물의 VR인지: ① DIA 예상 파일명과 매칭(§8) ② 파일명의 괄호 토큰이나 알려진 문서 토큰(TSC, FMEA, FTA, DFA, HSI, HSR, HSD, FMEDA …)
- 못 정하면 사용자가 고름 → 기억
- .xls, .xlsx 모두 허용

## 13. 처음 보는 양식 (칸 지정)

HSR, SW 요구사항 시험 명세처럼 아직 양식이 없는 문서, 또는 위 규칙으로 못 읽은 문서용.

1. 엑셀: 시트 선택 → 헤더 행 선택 / 워드: "이런 모양의 표" 예시 표 하나 선택
2. 미리보기에서 칸 역할 지정: 내 ID, 위 단계 ID(참조), 제목, ASIL, 할당, 상태 (필수: 내 ID)
3. 문서 종류(HSR / SWTEST / 기타) 지정
4. 저장 → 같은 모양 문서는 다음부터 자동
