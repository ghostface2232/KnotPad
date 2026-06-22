# KnotPad 테스트 전략 및 계획

> 현재 자동화 테스트가 전무한 상태(테스트 프레임워크/`package.json` 없음, 순수 브라우저 ES 모듈, ~10k LOC)에서, **회귀 위험이 가장 큰 핵심 동작**부터 잠그기 위한 테스트 계획. REVIEW.md의 P1/P2 발견과 최근 수정(XSS sanitizer, 지연 미디어 GC, undo 모델)을 기준으로 우선순위화했다.

## 현황 분석

| 항목 | 상태 |
|---|---|
| 테스트 프레임워크 | 없음 (`package.json` 부재) |
| 코드 규모 | js/ 11개 모듈, ~10k LOC. 최대 파일 `items.js`(3.5k), `ui.js`(3.2k) |
| 순수/로직 함수 | sanitizer, 기하(curvePath/bezier), 파싱/마이그레이션, GC 참조 스캔, 스택 연산 — **단위 테스트 저비용** |
| 브라우저 결합 | 선택영역(contenteditable), SVG 레이아웃(`getTotalLength`), IndexedDB, File System API, `getBoundingClientRect` — **실제 브라우저 필요** |
| 가장 큰 리스크 | 데이터 손실(미디어/undo) > 저장 XSS > 그래프/직렬화 손상 > 레거시 노트 렌더 회귀 |

## 도구 선정 (2계층)

코드가 "순수 로직"과 "브라우저 결합"으로 갈리므로 두 계층으로 간다.

1. **Vitest + jsdom** — 단위/로직 계층 (빠르고 ESM 네이티브, CI 친화)
   - 대상: `utils.js` 전부, `items.js`의 파싱/정규화/마이그레이션/GC 참조 스캔, `connections.js` 기하, `state.js` 스택 연산, 직렬화 shape.
   - 보조: `fake-indexeddb`로 `storage.js`의 IndexedDB 래퍼 + 실제 `deleteMedia`까지 검증.
2. **Playwright (Chromium)** — 통합/E2E 계층 (실제 레이아웃·선택·SVG·IndexedDB 동작)
   - 대상: undo/redo end-to-end, 미디어 삭제→undo 실제 복원, XSS 로드/Import 시 **무실행** 확인, 연결선 렌더, export/import 왕복, 레거시 노트 골든 렌더.

> 권장: 1계층(Vitest)을 먼저 깔아 핵심 보안·로직을 즉시 잠그고, 2계층(Playwright)은 데이터 손실/XSS의 "실제 실행" 검증으로 확장.

## 선행 리팩토링 (테스트 가능성 확보)

핵심 로직 함수 다수가 모듈 비공개라 단위 테스트 불가. 최소 침습으로 노출 필요:

- `items.js`: `parseContent`, `normalizeMemoHtml`, `migrateLegacyMarkdown`, `isLegacyMarkdown`, `convertTopLevelLegacyBreaksToParagraphs`, `extractPlainTextFromMemoHtml`, `collectReferencedMediaIds` 를 `export`.
  - 영향 최소화를 위해 별도 `js/memo-format.js`로 추출하거나, 단순히 `export` 키워드만 추가(런타임 동작 불변).
- `connections.js`: `bezierPoint`, `bezierTangent` `export` (이미 일부 사용 중일 수 있음 — 확인 후).
- `ui.js`의 `saveState`/`restoreState`/`undo`/`redo`는 이미 export됨. 단, DOM 의존이라 2계층(Playwright)에서 검증.

---

## 우선순위 테스트 카탈로그

### Tier 0 — 보안 회귀 (최근 수정, 1계층 단위 + 2계층 실행확인)

**T0-1. `sanitizeUrl()` 스킴 검증** — `utils.js:23` *(Vitest, 순수)*
- `javascript:alert(1)`, `vbscript:...`, `data:text/html,...` → `''`
- `https://ex.com` → 그대로, `ex.com`(스킴 없음) → `https://ex.com`로 보정
- 공백 trim, 잘못된 URL → `''`
- 불변식: http/https만 통과, 스킴 없는 bare만 https 승격, 그 외 전부 거부.

**T0-2. `sanitizeMemoHtml()` 정화 + 레거시 보존** — `utils.js:48` *(Vitest, jsdom)*
- `<img onerror=...>` → onerror 제거, img 유지 / `<svg onload=...>`,`<script>`,`<iframe>` → 태그 제거
- `<a href="javascript:...">` → href 제거 / `<div style="expression(...)">` → style 제거
- **보존(중요)**: `<div>`, `<p>`, `<h1-3>`, `<ul/ol/li>`, `<strong/em/u/s>`, 정렬 클래스·인라인 `text-align` 그대로.
- 불변식: 위험 벡터만 제거, 레거시 메모 구조 무손상.

**T0-3. 이미지/링크 XSS 로드 시 무실행** — `createItem()` `items.js:1248` *(Playwright)*
- 악성 JSON Import: image `content='x" onerror="window.__xss=1"'`, link `url='javascript:window.__xss=1'`, memo `'<img src=x onerror="window.__xss=1">'`
- 불변식: 로드/클릭 후 `window.__xss` 미정의(실행 안 됨), 링크 앵커에 `rel="noopener noreferrer"`.

### Tier 1 — 데이터 손실 (최우선)

**T1-1. 다중삭제 → undo 복원 (P1-B)** — `deleteSelectedItems()` `items.js:2794`, `saveState/undo` *(Playwright; 로직 일부 Vitest)*
- 시나리오 (a): 새 캔버스 로드(undoStack 길이 1) → 다중선택 삭제 → `Ctrl+Z` → 삭제분 정확히 복원.
- 시나리오 (b): 히스토리 있는 상태 삭제 → 메모 추가 → undo → **삭제분 부활 안 함 + 추가 메모만 되돌림**.
- 불변식: 스냅샷이 삭제 **후** 1회 push, 부활/desync 없음.

**T1-2. 미디어 삭제 → undo 바이트 복원 (P1-A)** — `deleteItem()`+`gcOrphanMedia()` *(Playwright + fake-indexeddb)*
- 이미지 추가 → 삭제 → `Ctrl+Z` → 이미지 정상 표시(placeholder 아님).
- 불변식: 삭제 시 `pendingMediaDeletes`에 기록·blobURLCache 유지, undo 후 src 복원.

**T1-3. 지연 GC 정확성 (P1-A)** — `collectReferencedMediaIds()`/`gcOrphanMedia()` `items.js:2854/2869` *(Vitest + fake-indexeddb)*
- live items + undoStack + **redoStack** 스캔 검증(redo 누락 시 redo 바이트 조기 삭제 회귀 차단).
- 50개 초과 evict 후에만 미참조 미디어 hard-delete.
- 불변식: 참조가 하나라도 남으면 보존, 전부 사라지면 회수.

**T1-4. 복제 공유 미디어 안전 (P1-A 인접)** — `duplicateItem()`+`deleteItem()` *(Vitest)*
- 이미지 복제(같은 `media_` id) → 원본 삭제 → GC가 복제본 참조 발견 → **미삭제**. 둘 다 삭제 시에만 회수.

**T1-5. 캔버스 전환 시 교차 히스토리 보존 (P1-A 영속성)** — `clearItemsAndConnections()` `state.js:261` *(Vitest/Playwright)*
- 캔버스 A에서 미디어 삭제(pending) → B로 전환 → A의 영속 undo가 참조하는 바이트가 **삭제되지 않음**(pending만 clear).

### Tier 2 — 직렬화·그래프·마이그레이션 무결성

**T2-1. 레거시 노트 마이그레이션 골든 테스트** — `parseContent`/`migrateLegacyMarkdown`/`normalizeMemoHtml` *(Vitest, jsdom)*
- 레거시 마크다운 입력 → 기대 HTML 골든 파일 비교. HTML 입력은 **재변환 안 됨(멱등)**.
- AGENTS.md 강제 제약("레거시 렌더 불변")을 잠그는 핵심. 실제 사용자 노트 샘플 몇 개를 픽스처로 고정.

**T2-2. undo/redo 라운드트립 — z-index·manuallyResized·연결** — `saveState`/`restoreState` `ui.js:204/293` *(Playwright)*
- 아이템/연결 생성 → 편집 → undo×2 → redo → z-index, manuallyResized, 연결 from/to 매핑 동일.

**T2-3. 연결 정리·복원** — `deleteItem`/`deleteConnection`/`restoreState` *(Playwright)*
- A→B→C 연결 후 B 삭제 → 연결 2개 + DOM(label/hitArea/arrow) 제거 → undo 시 유효 참조로 재구축, 고아 연결 없음.

**T2-4. export → import 왕복 완전성 (P3, REVIEW)** — `app.js` export/import `218-363` *(Vitest 로직 + Playwright)*
- REVIEW.md 지적: export가 `z`/`manuallyResized`/`view` 누락. 수정 후 왕복 시 적층순서·자동크기·뷰포트 보존 검증.

### Tier 3 — 신뢰성(P2 로직 테스트 가능 항목)

- **T3-1. localStorage 쿼터 초과 시 FS 저장 지속** — `saveCurrentCanvas` `ui.js:503` (setItem mock throw → FS 경로 도달 확인).
- **T3-2. 캔버스 삭제 시 미디어 고아 정리** — `deleteCanvas` `ui.js:818` (해당 캔버스 전용 media id 회수).
- **T3-3. `saveMedia`/`saveMediaBatch` reject reason** — `storage.js:38,98` (서술적 Error + 호출부 catch).

---

## 단계별 실행 계획

| 단계 | 내용 | 산출물 |
|---|---|---|
| **0. 인프라** | `package.json` + Vitest + jsdom + fake-indexeddb 설치, `npm test` 스크립트, `tests/` 디렉터리 | 실행 가능한 테스트 러너 |
| **1. 보안 잠금** | T0-1, T0-2 (순수/jsdom). 선행 export 리팩토링 동반 | sanitizer 회귀 차단 |
| **2. 데이터 손실 로직** | T1-3, T1-4, T1-5 (Vitest + fake-indexeddb) | GC/undo 모델 단위 커버 |
| **3. Playwright 도입** | Chromium E2E 셋업, T0-3, T1-1, T1-2 | XSS 무실행 + 미디어 undo 실측 |
| **4. 무결성 회귀** | T2-1(골든), T2-2, T2-3, T2-4 | 마이그레이션/직렬화/그래프 |
| **5. 신뢰성** | T3-1~3, CI(GitHub Actions)에 `npm test` 연결 | 지속 회귀 방지 |

### CI 연동(권장)
- GitHub Actions: PR마다 Vitest(1계층) 필수 게이트 + Playwright(2계층) 별도 잡. 현재 `.github/` 없음 → 신규.

## 테스트 작성 가이드(공통)
- `beforeEach`에서 `clearItemsAndConnections()`로 상태 초기화.
- eventBus 검증: `STATE_SAVE`/`AUTOSAVE_TRIGGER` emit 스파이.
- IndexedDB는 `fake-indexeddb`, File System은 더블/스킵, 네트워크(favicon/link preview)는 mock.
- 메모 HTML은 골든 스냅샷으로 고정(레거시 회귀 조기 감지).
- **변경 시 체크리스트**(AGENTS.md): 메모 paste/load 변경은 반드시 T2-1 골든 통과 확인.
