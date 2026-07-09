# KnotPad — UI 디자인 디테일 & 완성도 감사

> **작성일:** 2026-07-09
> **범위:** `style.css` (2089줄), `index.html`, `js/` 인라인 스타일 · 런타임 주입 스타일
> **기준:** `make-interfaces-feel-better` 디자인 엔지니어링 원칙 (concentric radius, optical alignment, shadows-over-borders, interruptible/staggered motion, tabular-nums, image outlines, scale-on-press, 40×40 hit area 등)
> **방법:** 6개 분야(타이포그래피 · 컬러/대비 · 디자인 시스템 · 레이아웃/위계 · 모션/마이크로인터랙션 · 표면/디테일)를 병렬 서브에이전트로 심층 조사 후 교차 검증·종합
> **참고:** 모든 라인 번호는 실측값이며, 기존 검토 문서와 무관하게 소스에서 새로 도출함.

---

## 0. 요약 — 이 앱의 디자인 현주소

KnotPad는 **잘 짜인 토큰 기반 다크-퍼스트 디자인 시스템**을 이미 갖추고 있다. `.canvas-item → .item-content`의 border 보정 concentric radius(`calc(--radius-md - 1px)`), 사이드바 chevron 회전 트랜지션, search-bar / conn-label 모달의 enter/exit 애니메이션, 비디오 타임의 `tabular-nums` 등은 **레퍼런스로 삼을 만큼 정확**하다.

그러나 완성도를 한 단계 끌어올리려면 **체계적 공백 4가지**를 메워야 한다:

1. **글리프 획 두께의 붕괴** — `font-weight: 600`을 약 15곳에서 쓰지만 600 페이스가 없어 전부 **Bold 700으로 렌더**된다. semibold 위계가 사라진다.
2. **접근성 3종 세트 전면 부재** — `:focus-visible`, `prefers-reduced-motion`, 픽처블 press 피드백이 앱 전체에서 **거의 0**이다.
3. **라이트 테마 대비 미세조정 누락** — 7개 태그 컬러가 `:root.light`에 오버라이드되지 않아 노랑/초록/주황 계열이 라이트 배경에서 **1.7–2.6:1**로 사실상 보이지 않는다.
4. **토큰 우회 드리프트** — spacing 스케일 · z-index 스케일 토큰이 없어 매직 넘버가 누적되고, `transition: all` 11곳, 중복 스크롤 마스크 블록 ~210줄 등이 쌓여 있다.

### 우선순위 Top 10 (교차 검증된 고임팩트 항목)

| # | 항목 | 근거 | 등급 |
|---|---|---|---|
| 1 | `font-weight:600` → 600 페이스 부재로 **Bold 700 렌더**, semibold 위계 붕괴 | `style.css:1-3` (400/500/700만) + 15개 사용처 | **High** |
| 2 | `:focus-visible` 규칙 **전무** — 모든 버튼 키보드 포커스 불가시 | 전역 grep 0건 | **High** |
| 3 | `prefers-reduced-motion` **전무** — 무한 `mediaPulse` 포함 | 전역 grep 0건 | **High** |
| 4 | `transition: all` **11곳** — 성능·원칙 위반 | `style.css:442,967,1048,1206,1352,1422,1492,1537,1548,1708,1737` | **High** |
| 5 | 라이트 태그 컬러 미조정 → 노랑/초록/주황 **1.7–2.6:1**, 흰 글자 칩 **1.9:1** | `:root.light`에 `--tag-*` 부재 + `COLOR_MAP` 하드코딩 | **High** |
| 6 | 이미지/썸네일 **outline 전무** — 다크 캔버스에서 엣지 분리 없음 | `.item-image`, `.link-preview-img`, `.canvas-icon` 등 | **High** |
| 7 | press 피드백 사실상 없음 + 유일한 `:active`가 `scale(0.95)` (규칙은 0.96) | `style.css:445` | **High** |
| 8 | `--text-muted` 사용되나 **양쪽 테마 모두 미정의** (latent bug) | `style.css:1069` | **Med** |
| 9 | z-index 스케일 부재 + `toast(10000)`가 `modal(9999)` 위 렌더 | `style.css:966` vs `877` | **Med** |
| 10 | `@font-face`에 `font-display` 부재 → 기본 폰트 FOIT | `style.css:1-3` | **Med** |

> **주의:** 1·5·6·8·9번은 사용자가 지금 화면에서 "왜인지 미묘하게 어긋나 보이는" 체감을 만드는 핵심 원인이다. 5·6·8은 특히 **라이트 모드에서만** 드러나므로 다크 모드만 보면 놓치기 쉽다.

---

## 1. 타이포그래피 & 글리프 획 두께

### 1.1 [High] `font-weight:600` — 600 페이스가 없어 전부 Bold 700로 렌더

`@font-face`(`style.css:1-3`)는 SFKR을 **400 / 500 / 700 세 가지**만 정의한다(`fonts/` 폴더 실측: `SFKR-Regular/Medium/Bold.otf`). CSS 폰트 매칭 규칙상 500 초과 요청이 정확히 매칭되지 않으면 **위쪽 700으로 스냅**된다. 따라서 앱 전역의 "semibold 600" 요소가 실제로는 **Bold 700**으로 그려지고, 의도한 `400 → 500 → 600 → 700` 위계가 `400 / 500 / 700`으로 붕괴된다. **사용자가 명시적으로 요청한 "글리프 획 두께" 관점의 최대 결함이다.**

`font-weight:600` 사용처(전부 700로 렌더): `.memo-body h2/h3`(428-429, → h1과 동일 두께), `.add-child-btn`(327), `.conn-label-btn`(743), `.modal-box h3`(886), `.sidebar-title`(1011), `.group-name`(1057), `.canvas-icon .icon-letter`(1149), `.picker-section-label`(1185), 설정 `h3/h4`(1379/1469), `.storage-card-title`(1755) 등.

| Before | After |
| --- | --- |
| `@font-face` 400/500/700만 정의, UI는 `font-weight:600`을 15곳 사용 | 실제 600 페이스 추가 `@font-face{font-family:'SFKR';src:url('./fonts/SFKR-Semibold.otf');font-weight:600;font-display:swap;}` **또는** 600 OTF가 없다면 전 사용처를 `500`으로 통일 |
| `.memo-body h1{700}` / `h2,h3{600}` → 700/700/700 동일 두께 | h1=700, h2=600(페이스 필요), h3=500 으로 세 단계를 획 두께로 실제 구분 |
| 루트에 폰트 합성 방어 없음 | `html,body`에 `font-synthesis: none;` 추가 — 페이스 부재 시 브라우저의 faux-bold(불균일 획) 차단 |

### 1.2 [Med] `@font-face`에 `font-display` 부재 → FOIT

`style.css:1-3` 세 페이스 모두 `font-display` 미지정 → 기본 block 기간 동안 **모든 텍스트 불가시**(콜드 로드 시 최대 ~3s).

| Before | After |
| --- | --- |
| `@font-face{…format('opentype');font-weight:400;}` | 세 페이스에 `font-display: swap;` 추가 + `<head>`에 400·500 페이스 `<link rel="preload" as="font" crossorigin>` |

### 1.3 [High] 동적 숫자에 `tabular-nums` 누락

`.video-time`(377)만 올바르게 적용됨. 아래는 값이 바뀔 때마다 폭이 흔들려 레이아웃이 떨린다.

| 요소 | 라인 | 내용 |
|---|---|---|
| `.zoom-display` | 700 | 줌 `100%` — 휠 스텝마다 갱신 |
| `.search-nav span`(`#searchCount`) | 934 | `0/0` 매치 카운터 |
| `.group-count` | 1068 | 그룹별 항목 수 |

| Before | After |
| --- | --- |
| 위 3개 요소에 numeric variant 없음 | 공통 유틸(또는 각 규칙)에 `font-variant-numeric: tabular-nums;` |

### 1.4 [Med] 폰트 스무딩 & 폴백 스택

- `-webkit-font-smoothing: antialiased`(56)는 있으나 **`-moz-osx-font-smoothing: grayscale` 누락** → Firefox/macOS에서 더 두껍게 렌더(획 두께 체감 불일치).
- 스택 `'SFKR', -apple-system, BlinkMacSystemFont, sans-serif`(54, 186)는 **Windows(사용자 플랫폼)에서 `-apple-system`이 무시**되어 SFKR 로드 전/실패 시 Arial로 급락하고, **한글 폴백이 없다**.

| Before | After |
| --- | --- |
| `html,body{ … -webkit-font-smoothing:antialiased; }` | 같은 규칙에 `-moz-osx-font-smoothing: grayscale;` |
| `'SFKR', -apple-system, BlinkMacSystemFont, sans-serif` | `'SFKR', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif` |

### 1.5 [Med] SVG 아이콘 획: caps/joins & stroke-width 불일치

- **`stroke-linecap/linejoin` 혼재** — 다수 아이콘은 미지정(기본 butt/miter, 날카롭게 잘린 터미널), 일부만 `round`. `addGroupBtn`(25)은 한 path는 미지정 + 다른 path는 `round`로 **아이콘 하나 안에서도 혼재**.
- **stroke-width 아웃라이어** — 표준은 `2`인데 두 개의 "+" 버튼이 `2.5`(`index.html:31`, `js/ui.js:1133`), drop 아이콘이 `1.5`(102). 특히 `addGroupBtn`(2)과 `addCanvasBtn`(2.5)이 **같은 14px 사이드바 헤더에 나란히** 있어 획 두께 차이가 눈에 띈다.

| Before | After |
| --- | --- |
| 아이콘별 ad-hoc caps/joins | 라인형 아이콘 전역 `stroke-linecap:round; stroke-linejoin:round;` 통일 |
| `addGroupBtn` 2 vs `addCanvasBtn` 2.5 (14px 나란히) | 동일 크기 인접 아이콘은 한 값으로(권장 `2`). 48px drop만 `1.5` 유지(대형 보정, 문서화) |

### 1.6 [Low] `text-wrap` · `text-rendering` · display 헤딩 트래킹

- `text-wrap: balance`를 헤딩(`.modal-box h3`, 설정 h3/h4, `.drop-content h3`, 메모 h1–h3)에 미적용 → 마지막 단어 orphan 위험.
- `text-wrap: pretty`를 본문/설명(`.settings-description`, `.storage-card-desc`, `.drop-content p`, `.link-title`)에 미적용.
- `text-rendering` 전역 미설정 — SVG 라벨(`.connection-label-text`)은 `geometricPrecision` 권장.
- 18px+ display 헤딩에 `letter-spacing:-0.01em` 살짝 조여주면 정돈됨(마이크로 uppercase 라벨의 `0.5px`는 이미 잘 되어 있음).

---

## 2. 컬러 & 대비 & 테마

> 대비값은 WCAG 2.1 상대휘도로 계산하고, 반투명 토큰은 실제 backing surface(다크 카드 `#1f1f23`, 다크 베이스 `#09090b`, 라이트 카드 `#ffffff`, 라이트 베이스 `#f4f4f5`)에 flatten 후 산출.

### 2.1 [High] 라이트 테마 태그 컬러 미조정 + JS가 토큰을 우회

`:root.light`(38-50)는 거의 모든 토큰을 오버라이드하지만 **`--tag-red … --tag-pink` 7개는 오버라이드하지 않는다**. 게다가 `js/constants.js`의 `COLOR_MAP`이 동일 hex를 **하드코딩**해 `js/connections.js`·`items.js`·`ui.js`에서 요소 스타일에 직접 주입한다 → CSS 토큰을 재조정해도 노드 컬러바·연결선·화살표·칩은 **따라오지 않는다**.

라이트 베이스에서 2px stroke/3px 바 기준 대비:

| 태그 | 라이트 대비 | 판정 |
|---|---|---|
| yellow `#eab308` | **1.74:1** | ✗ |
| green `#22c55e` | **2.07:1** | ✗ |
| orange `#f97316` | **2.55:1** | ✗ |
| pink/blue/red/purple | 3.2–3.9:1 | ✓(marginal) |

추가로 `js/ui.js:1071`이 활성 캔버스 칩을 `background:태그색; color:white`로 렌더 → 흰 글자 대비 yellow **1.91:1**, green **2.28:1**, orange **2.76:1** (✗).

| Before | After |
| --- | --- |
| `:root.light`에 `--tag-*` 없음 | 라이트 전용 어두운 변형 추가: yellow `#a16207`, green `#15803d`, orange `#c2410c` 등(700 계열) |
| `el.style.stroke = COLOR_MAP[color]` | `el.style.stroke = 'var(--tag-'+color+')'` 로 바꿔 JS가 테마 토큰을 상속 |
| 칩 `color: white` (모든 태그) | hue별 전경 계산(yellow/green/orange엔 dark ink, 나머지는 white) |
| 7색 휘도 편차 0.196–0.498 | 테마별 공통 휘도 밴드로 재타겟(다크 L≈0.30–0.40, 라이트 L≈0.20–0.28) → "무게" 일관 + 라이트 3:1 통과 |

> 참고: fill-mode 배경(557-629)은 이미 테마별 수작업 튜닝(`#3e2528…` / `#fde9e9…`)이 되어 있다 — **이 방식을 기본 태그 토큰에도 적용**하는 것이 정답.

### 2.2 [High] 라이트 모드 연결선 대비 2.09:1

| 토큰 | 값 | 대비 | 판정 |
|---|---|---|---|
| `--conn-default` 라이트 | `rgba(0,0,0,0.3)` | **2.09:1** | ✗ (<3:1) |
| `--conn-default` 다크 | `rgba(255,255,255,0.35)` | 3.12:1 | ✓(marginal) |

| Before | After |
| --- | --- |
| `--conn-default` 라이트 `rgba(0,0,0,0.3)` (2.09:1) | `rgba(0,0,0,0.42)` (≈3.0:1) |

### 2.3 [High] solid accent 위 흰 글자 3.72:1

`--accent:#3b82f6`(다크) 위 흰 글자 = **3.72:1** (본문 4.5:1 미달). `.toolbar-btn.active`, `.modal-btn-submit`, `.settings-option-btn.active`, `.sidebar-add`, `.topbar-btn.active` 등 solid fill 버튼에 해당. (라이트 `#2563eb`는 5.17:1로 정상.)

| Before | After |
| --- | --- |
| solid fill 버튼에 `--accent:#3b82f6` + 흰 글자 (3.72:1) | 별도 `--accent-solid:#2563eb`(흰 글자 ≈4.6:1) 도입, accent-as-text는 `#3b82f6` 유지 |

### 2.4 [Med] `--text-muted` 미정의 (latent bug)

`.group-count`(1069)가 `color: var(--text-muted)`를 쓰지만 `--text-muted`는 **양쪽 테마 어디에도 정의되지 않는다**(검증: grep 결과 정의부 0건). 현재는 헤더의 `--text-secondary`를 상속해 "우연히" 렌더되지만, 상속 구조가 바뀌면 깨진다. — **타이포·레이아웃·컬러 에이전트가 독립적으로 동일 지적**.

| Before | After |
| --- | --- |
| `.group-count{ color: var(--text-muted); }` | 양쪽 테마에 `--text-muted` 정의(다크 `rgba(255,255,255,0.4)` / 라이트 `rgba(0,0,0,0.4)`) 또는 `var(--text-secondary)`로 교체 |

### 2.5 [Med] placeholder 토큰이 실제 정보 텍스트에 쓰임

`--text-placeholder`(0.32)는 입력 placeholder라면 관대하게 봐줄 수 있으나, **실제 안내 텍스트**에도 사용됨: `.memo-body:empty::before`(빈 노트 안내), `.context-submenu-empty`(872), `.storage-modal-note`(1327), `.preview-label`(2067) → 2.2–2.9:1.

| Before | After |
| --- | --- |
| 정보 텍스트에 `var(--text-placeholder)` | `--text-tertiary`(다크 `rgba(255,255,255,0.50)` / 라이트 `rgba(0,0,0,0.45)`, ≈4.6:1) 신설, placeholder 토큰은 실제 `::placeholder`에만 |

### 2.6 [Med] 입력 border 1.22:1 + ::selection 부재

- `.modal-input` 등 기본 border가 `--border-subtle`(0.08) = **1.22:1** → WCAG 1.4.11(3:1) 미달, 필드 경계가 사실상 안 보임 → `--border-input`(≈0.28) 신설.
- `::selection` 규칙 전무 → OS 기본 하이라이트가 브랜드와 불일치. `::selection{ background:var(--accent-glow); color:var(--text-primary); }` 추가.

### 2.7 [Low] 토큰 우회 하드코딩 컬러

`rgba(239,68,68,0.2)`(1088,1163), `rgba(34,197,94,0.1)`(1256), `rgba(249,115,22,0.1)`(1258), `#dc2626`(738,1323) 등은 토큰 재조정을 따라오지 못함 → `color-mix(in srgb, var(--danger) 20%, transparent)` 식으로 파생. `index.html:7` `theme-color`는 다크 고정 — 라이트용 `media` meta 추가 권장.

> **정정 기록:** 조사 가설이었던 "`--text-secondary`(0.64)가 대비 미달"은 실측 결과 **7.4:1로 정상**임을 확인. 과잉 수정을 피하기 위해 명시해 둔다.

---

## 3. 디자인 시스템 & 토큰/컴포넌트 일관성

기존 토큰: `--radius-sm/md/lg`, `--transition`, `--shadow-md/lg`. **spacing 스케일 토큰 없음, z-index 스케일 없음** — 아래 대부분 드리프트의 근본 원인.

### 3.1 [High] spacing 스케일 부재

발견된 단축 spacing 값: `2,3,4,5,6,8,10,12,14,16,18,20,24,28,36,48,64px`. 대체로 2/4 그리드지만 (a) 잦은 `10px`·`14px`(4배수 아님), (b) off-grid `3px`·`5px`, (c) 동일 개념 간격이 4~6개 값으로 흩어짐(gap: 4/6/8/10/12/16 혼용).

| Before | After |
| --- | --- |
| spacing 100% 리터럴 px, 단일 출처 없음 | `--space-1:4px … --space-6:24px` 스케일 도입, 컨트롤 세로 패딩(10 vs 12 혼용)을 한 값으로 통일 |
| `padding:5px 10px`(1771, 유일한 5px) | `4px 8px` |

### 3.2 [High] radius 토큰 우회 + 부분적 non-concentric

- 리터럴 `6px`(357,637,660,1144,1196)은 사실 `--radius-sm` → 토큰화. `4px`(9곳)은 토큰이 없음 → `--radius-xs:4px` 신설. 파일형 pill `9999px`(5곳)·`10px`(1070)·`12px`(1538) → `--radius-pill`.
- **concentric radius**: `.canvas-item→.item-content`(7=8-1)는 **정확**(레퍼런스). 반면 `.context-menu`(8, pad4)→item(6)은 이상적 4px보다 큼, `.conn-direction-picker`(6, pad4)→btn(4)도 미세 과라운드.

### 3.3 [High] `transition: all` 11곳 + press 피드백 부재

`--transition`(0.15s ease)은 있으나 ad-hoc 지속시간이 산재(0.1/0.15/0.2/0.25/0.3/0.4/1.5s). 특히 **`transition: all` 11곳**(3장/5장 참조)은 레이아웃 속성까지 감시해 성능·원칙 위반. 유일한 press 상태 `.md-btn:active`(445)는 `scale(0.95)`로 규칙(0.96) 미달.

| Before | After |
| --- | --- |
| 지속시간 리터럴 산재 | `--transition-slow:0.2s ease`(≈10곳), `--transition-enter:0.25s ease-out`, `--ease-spring:cubic-bezier(0.32,0.72,0,1)` 토큰화 |

### 3.4 [High] 대규모 중복 — 스크롤 마스크 ~210줄, 스크롤바 7회

| 패턴 | 발생 | 조치 |
|---|---|---|
| scroll-mask wrapper(마스크 그라디언트 + can-scroll-up/down) | `.shortcuts/.storage/.nodestyle-scroll-wrapper` **3× 약 210줄** | 단일 `.scroll-mask` 클래스로 통합 (파일 내 최대 중복) |
| `::-webkit-scrollbar`(4px)+thumb | **7×** (423,1132,1444,1572,1637,1900,1975) | 공유 셀렉터 리스트/유틸로 추출 |
| 아이콘 버튼 hover 트랜지션 3-prop | 1005,1018,1027 | 공유 클래스 |
| `.sidebar-icon-btn`≡`.sidebar-pin-btn` (사실상 동일 블록) | 1013 vs 1022 | `.icon-btn` 베이스 + `.pinned` modifier로 병합 |

### 3.5 [Med] 아이콘 버튼 ~13종의 재발명

크기(20/24/28/32/36/40) · radius(radius-sm/4px/50%) · hover 레시피(bg-hover / bg-hover-solid+border / accent-glow) · 아이콘비(14/16/18)가 컨트롤마다 제각각. `.color-opt`/`.filter-opt`/`.canvas-color-opt`도 22 vs 24만 다른 3중 복제.

| Before | After |
| --- | --- |
| 13종 버튼이 각자 sizing/hover 정의 | `.icon-btn` 베이스 + size/round modifier, secondary hover 레시피 1종으로 통일, `50%`는 진짜 원형(색상 dot/handle)만 |
| swatch 3중 복제 | `.swatch` 베이스 + 크기 modifier |

### 3.6 [High] z-index 스케일 부재 + toast/modal 충돌

값: `1,5,10,20,50,100,101,150,200,201,210,300,9999,10000,10001`. **`.toast`=10000(966), `.context-menu`=10000(819), `.memo-toolbar`=10000(440)가 `.modal`=9999(877) 위 렌더** — 모달 열린 상태에서 토스트/컨텍스트 메뉴가 백드롭 위로 그려진다(의도 불명).

| Before | After |
| --- | --- |
| 매직 넘버 15종 | 6단 스케일 `--z-canvas-ui:10 / --z-panel:100 / --z-sidebar:200 / --z-overlay:1000 / --z-modal:2000 / --z-toast:3000`, modal>context-menu 순서 명시 |

### 제안 통합 토큰 세트

```css
:root {
  /* Spacing (4px base) */
  --space-1:4px; --space-2:8px; --space-3:12px;
  --space-4:16px; --space-5:20px; --space-6:24px;
  /* Radius */
  --radius-xs:4px;           /* NEW: 4px 리터럴 ~9곳 대체 */
  --radius-sm:6px; --radius-md:8px; --radius-lg:14px;
  --radius-pill:9999px;      /* NEW */
  /* 50%는 진짜 원형(dot/handle)만 */
  /* Motion */
  --transition:0.15s ease;
  --transition-slow:0.2s ease;      /* NEW */
  --transition-enter:0.25s ease-out;/* NEW */
  --ease-spring:cubic-bezier(0.32,0.72,0,1); /* NEW */
  /* Elevation / rings */
  --shadow-border:0 0 0 1px rgba(255,255,255,0.06); /* NEW */
  --ring-accent:0 0 0 3px var(--accent-glow);       /* NEW */
  /* Z-index */
  --z-canvas-ui:10; --z-panel:100; --z-sidebar:200;
  --z-overlay:1000; --z-modal:2000; --z-toast:3000;
  /* Color 보강 */
  --accent-solid:#2563eb;   /* NEW: solid fill용 */
  --text-tertiary:rgba(255,255,255,0.50); /* NEW */
  --text-muted:rgba(255,255,255,0.40);    /* NEW: 현재 미정의 */
  --border-input:rgba(255,255,255,0.28);  /* NEW */
  --danger-bg:rgba(239,68,68,0.2);        /* NEW */
}
```

---

## 4. 레이아웃 · 위계 · 스페이싱

### 4.1 [High] 반응형 부재 + 뷰포트 확대 잠금

- `index.html:5` `maximum-scale=1.0, user-scalable=no` → **WCAG 1.4.4 위반**(저시력 사용자 확대 차단). → `viewport-fit=cover`만 남기고 확대 잠금 제거, 캔버스 더블탭 줌은 `touch-action`으로 제어.
- **`@media` 쿼리 0건**(2089줄). 사이드바 고정 280px가 320–360px 폰에서 화면 전체를 덮고, 하단 툴바 11개 컨트롤(~500px)이 좁은 화면에서 오버플로.

| Before | After |
| --- | --- |
| 확대 잠금 뷰포트 | `content="width=device-width, initial-scale=1.0, viewport-fit=cover"` |
| `@media` 0건 | `@media(max-width:480px){ .sidebar{width:min(280px,85vw)} .toolbar{flex-wrap:wrap; max-width:calc(100vw-32px)} }` |

### 4.2 [High] `:focus-visible` 전무 — 키보드 포커스 불가시

모든 버튼(toolbar/topbar/sidebar/settings/context-menu-item)이 `border:none`/outline 없음 → 키보드 포커스가 **완전히 안 보임**, Tab 순서 추적 불가. — **레이아웃·컬러·표면 에이전트 동시 지적**.

| Before | After |
| --- | --- |
| 포커스 스타일 없음 | 전역 `:where(button,[tabindex],input,.context-menu-item):focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }`; 입력은 border 유지 + `box-shadow:0 0 0 3px var(--accent-glow)` |

### 4.3 [Med] 상태 전환 시 1px 레이아웃 점프

`.canvas-item-entry.active`(1141)만 `border:1px solid var(--accent)`를 가지고 base(1135)엔 border가 없음 → 캔버스 전환 시 행이 **1px 밀린다**.

| Before | After |
| --- | --- |
| base entry border 없음, active만 1px | base에 `border:1px solid transparent` → active는 색만 바뀜(리플로 없음) |

### 4.4 [Med] toolbar non-concentric radius

`.toolbar` radius 8px(pad 8px) → btn 6px. concentric이면 outer=6+8=14.

| Before | After |
| --- | --- |
| `.toolbar{ border-radius:var(--radius-md) }` (8px) | `border-radius:var(--radius-lg)` (14px) |

### 4.5 [Med] 빈 상태 & 위계 강조 부재

- `renderCanvasList()`(`js/ui.js:1156`)에서 캔버스 0개일 때 `innerHTML=''` → **빈 사이드바**, 안내/CTA 없음. `.canvas-list-empty` placeholder 추가.
- 빈 그룹은 ~0px로 접혀 렌더 글리치처럼 보임 → `.context-submenu-empty` 스타일 재사용한 placeholder 행.
- 툴바 생성 액션(메모/키워드/링크/파일)이 줌·정렬 유틸과 **시각적으로 동급** → 생성 그룹만 resting color를 `--text-primary`로 살짝 강조.

### 4.6 [Low] 세로 리듬 & optical 정렬

- `.canvas-group-header`(8px 12px) vs `.canvas-item-entry`(10px 12px) 세로 패딩 불일치 → 한 스텝으로.
- 사이드바 header(16)/list(8)/footer(12) 좌우 인셋 3종 → 통일.
- icon+text 버튼(`.modal-btn` 등)은 아이콘 쪽 패딩을 텍스트 쪽보다 2px 작게(optical).

---

## 5. 마이크로인터랙션 · 모션 · 애니메이션

### 5.1 [High] `transition: all` 11곳 — 정확한 속성 명시로 교체

| 라인 | 셀렉터 | 실제 변하는 속성 → After |
|---|---|---|
| 442 | `.md-btn` | background,color,transform → `background .15s ease, color .15s ease, transform .15s ease` |
| 967 | `.toast` | opacity,transform → `opacity .3s ease, transform .3s ease` |
| 1048 | `.canvas-group-header` | background |
| 1206 | `.canvas-color-opt` | transform(hover scale) |
| 1352 | `.sidebar-settings-btn` | background,color,border-color |
| 1422 | `.settings-tab` | background,color,border-color |
| 1492 | `.settings-option-btn` | background,color,border-color |
| 1537 | `.settings-toggle-slider` | background,border-color |
| 1548 | `.settings-toggle-slider:before` | transform,background |
| 1708 | `.storage-card` | border-color,background |
| 1737 | `.storage-card-icon` | background,color |

### 5.2 [High] press 피드백 — 앱 전체에 `:active` 단 1개

`.md-btn:active`(445)가 유일하고 그마저 `scale(0.95)`(규칙 0.96). 나머지 모든 주요 버튼(toolbar/topbar/modal/sidebar/context-menu/settings/search)에 press 피드백 없음.

| Before | After |
| --- | --- |
| `.md-btn:active{ transform:scale(0.95); }` | `scale(0.96)` |
| 주요 버튼에 `:active` 없음 | 공유 `.pressable{ transition:transform .15s ease } .pressable:active{ transform:scale(0.96) }` 적용 (단, 드래그 대상 `.canvas-item`엔 적용 금지) |

### 5.3 [High] `prefers-reduced-motion` 전무 (무한 `mediaPulse` 포함)

CSS keyframes(`connectionFadeOut`, `itemDeleteFade`, `appear`, 무한 `mediaPulse` 398-403 등) + JS rAF(zoom/fit/pan)에 감속 가드가 전혀 없음 → WCAG 2.3.3 gap.

| Before | After |
| --- | --- |
| 가드 없음 | `@media(prefers-reduced-motion:reduce){ *,*::before,*::after{ animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important } }` + 무한 `mediaPulse` 별도 정지 + JS에서 `matchMedia` 체크해 zoom/fit/pan 즉시 종료 상태로 |

### 5.4 [Med] 아이콘 스왑이 하드 토글

`updateThemeIcon()`(`js/ui.js:89-93`)이 sun/moon을 `display:none/block`으로 즉시 교체 — **스킬이 지목하는 대표 케이스(테마 토글)**. 비디오 play/pause·mute도 동일(364-370).

| Before | After |
| --- | --- |
| `style.display` 토글 | 두 아이콘 DOM 유지(하나 `position:absolute`), 클래스 토글로 cross-fade: `transition:opacity .3s cubic-bezier(0.2,0,0,1), transform .3s …, filter .3s;` inactive `opacity:0; transform:scale(0.25); filter:blur(4px)` |

> **레퍼런스(수정 금지):** 그룹 chevron 회전(1051-1055), search-bar enter/exit(914-927), conn-label 모달 scale 애니메이션(751-778 + `connections.js`)은 이미 올바르다.

### 5.5 [Med] 모달·메뉴·피커가 즉시 등장

`.modal`/`.modal-box`(874/881), `.context-menu`(816), 각종 dropdown/picker가 `display:none→flex`로 **enter/exit 없이 팝**. 특히 560×600 설정 모달이 무톤으로 튀어나온다.

| Before | After |
| --- | --- |
| `.modal.active{ display:flex }` 즉시 등장 | Enter: `opacity 0→1`, `transform:translateY(8px) scale(0.98)→none`, `.2s`; Exit: 짧게(`.15s`) `translateY(-8px)`+fade (exit는 enter보다 subtle) |

### 5.6 [Low] 기타

- color-group fade가 keyframe이라 빠른 재토글 시 스냅 가능 → base 클래스 opacity 트랜지션으로.
- exit에 방향성 `translateY(-8px)` 부재, 설정 모달 split/stagger 없음.
- `will-change` 0건은 **정상**(스터터 관측 시 `#canvas`에만 추가). 선제 남발 금지.

---

## 6. 표면 & 디테일 폴리시

### 6.1 [High] 이미지/썸네일 outline 전무

`--bg-thumbnail` 토큰이 있음에도 어떤 이미지에도 outline이 없음 → 다크 캔버스에서 밝은 사진이 카드와 분리되지 않음.

| 요소 | 라인 |
|---|---|
| `.item-image` | 338 |
| `.link-preview-img` | 656 |
| `.video-container` | 341 |
| `.canvas-icon`(썸네일) | 1142 |
| `.link-favicon` | 637 |

| Before | After |
| --- | --- |
| outline 없음 | `outline:1px solid rgba(255,255,255,0.1); outline-offset:-1px;` + `:root.light … { outline-color:rgba(0,0,0,0.1); }`. **`--border-subtle`(0.08, 틴티드 위험) 재사용 금지 — 순수 흑/백 하드코딩** |

### 6.2 [High] 40×40 미만 hit area 다수 (pseudo-element 확장 0건)

준수 컨트롤은 `.toolbar-btn`(40×40)·`.sidebar-toggle`(48×48)뿐. `.group-action-btn` **20×20**(1082), 노드 control 24×24(249), 다수 28px 컨트롤이 40 미만.

| Before | After |
| --- | --- |
| `.group-action-btn{ 20×20 }` | `position:relative` + `::after{ inset:-10px }` (가로는 2px gap까지만 확장 — **hit area 겹침 금지**) |
| `.topbar-btn{ 36×36 }` | `40×40`로 상향(최저비용 준수) |
| 노드 delete/color/font 24×24, pitch 28 | `::after{ inset:-2px }` (28px 초과 시 인접 충돌) |

> 좋은 패턴: `.connection-handle`은 `::before`로 hit area 확장 + `.add-child-btn`은 connecting 중 `display:none` — 겹침을 이미 올바르게 회피.

### 6.3 [Med] 단일 평면 shadow + 이중 하드 border

모든 elevated surface가 `--border-subtle` 1px + 단일 `--shadow-md`(평면). 스킬은 1px 링을 **투명 레이어드 box-shadow의 첫 레이어**로 접어 배경 적응형으로 만들 것을 권장.

| Before | After |
| --- | --- |
| `.canvas-item{ border:1px solid var(--border-subtle); box-shadow:var(--shadow-md); }` | border 제거, `box-shadow:0 0 0 1px var(--border-subtle), var(--shadow-md);` — 이미지/비디오/컬러 카드 위에서 링이 적응 |
| `--shadow-md:0 8px 24px rgba(0,0,0,0.4)` (단일) | 링+리프트+앰비언트 레이어드로 |

> divider(`.toolbar-sep`, `.context-menu-sep`, 사이드바 우측 border 등)는 **깊이가 아니라 구분**이므로 border 유지가 맞음.

### 6.4 [Med] concentric radius 위반 (표면)

| 중첩 | 현재 → concentric target | After |
|---|---|---|
| `.toolbar`(8, pad8)→btn(6) | outer 14 | `.toolbar` radius 14 |
| `.memo-toolbar`(8, pad6)→`.md-btn`(6) | outer 12 | `.memo-toolbar` radius 12 |
| `.context-menu`(8, pad4)→item(6) | inner 4 | item radius 4 |
| `.conn-direction-picker`(6, pad4)→btn(4) | outer 8 | picker radius 8 |

> `.canvas-item`(7=8-1)·`.settings-toggle`(11=9+2)는 정확 — 레퍼런스.

### 6.5 [Med] `:focus-visible` 링 + 입력 포커스 (4.2와 연계)

`.modal-input:focus`(893)/`.conn-label-modal-input:focus`(789)는 border-color만 변경 → `box-shadow:0 0 0 3px var(--accent-glow)` 링 추가. `.canvas-item.selected`(230)의 우수한 링 언어를 포커스에도 미러.

### 6.6 [Low] SVG 크리스프니스 & 스크롤바

- `.md-btn svg{ transform:scale(0.8) }`(443) → 18→14.4px 서브픽셀 블러. **`width/height=14`로 명시**.
- `#selectionBox border:1.5px`(202) → `2px`(또는 inset box-shadow 링).
- play triangle(런타임 주입, `js/app.js`)은 `margin-left:2px` optical 보정.
- 스크롤바: Firefox 미지원 → `scrollbar-width:thin; scrollbar-color:var(--scrollbar) transparent;` + thumb hover 상태 추가.

---

## 7. 강점 (유지·레퍼런스로 삼을 것)

이 항목들은 이미 정확하므로 리팩터링 중 **건드리지 말 것**:

- **concentric radius** — `.canvas-item→.item-content`의 `calc(--radius-md - 1px)` border 보정, `.settings-toggle` 트랙/노브.
- **모션** — 그룹 chevron 회전 트랜지션, search-bar enter/exit, conn-label 모달 scale 시퀀스(rAF + animate-in), `.canvas-item.new`의 appear가 로드 시 미발화.
- **타이포** — `.video-time`의 `tabular-nums`, uppercase 마이크로 라벨의 `letter-spacing:0.5px`, 붙여넣기 sanitizer가 인라인 font-size/weight를 제거(`js/items.js`).
- **테마** — fill-mode 배경의 테마별 수작업 튜닝(`#3e2528…`/`#fde9e9…`), 대부분 토큰의 라이트/다크 parity, 오버레이/모달 배경 명시적 오버라이드.
- **디테일** — 이름 truncation(nowrap+ellipsis) 전역 적용, 모달 footer의 cancel/submit 위계, `.connection-handle`의 hit area 확장 + connecting 상태 충돌 회피.

---

## 8. 실행 로드맵 (권장 순서)

**Phase 1 — 접근성·정확성 (1~2일, 저위험 고임팩트)**
1. `--text-muted` 정의(또는 `--text-secondary` 교체) — latent bug 제거.
2. `:focus-visible` 전역 규칙 + 입력 포커스 링.
3. `prefers-reduced-motion` 전역 가드 + 무한 `mediaPulse` 정지.
4. 뷰포트 확대 잠금 해제.
5. `transition: all` 11곳 → 명시 속성.

**Phase 2 — 글리프·컬러 완성도 (체감 직결)**
6. `font-weight:600` 정책 결정(600 페이스 추가 or 500 통일) + `font-synthesis:none` + `font-display:swap`.
7. 라이트 태그 컬러 `:root.light` 오버라이드 + JS `COLOR_MAP`→`var(--tag-*)` 전환.
8. `--conn-default` 라이트 대비, `--accent-solid`, 흰-글자-칩 전경 계산.
9. 동적 숫자 3곳 `tabular-nums`, 폴백 스택·`-moz-osx-font-smoothing`, 아이콘 stroke-width 통일.

**Phase 3 — 시스템 정리 (리팩터, 중위험)**
10. `--space-*` / `--radius-xs,pill` / z-index 스케일 도입 → 매직 넘버·toast/modal 충돌 해소.
11. 스크롤 마스크 ~210줄·스크롤바 7회·`.icon-btn`/`.swatch` 중복 통합.
12. 아이콘 버튼 ~13종 베이스 클래스 통일 + press 피드백 일괄.

**Phase 4 — 마이크로 폴리시**
13. 이미지 outline, 레이어드 shadow, concentric radius(toolbar/memo-toolbar/context-menu), hit area 확장, 모달/메뉴 enter·exit, 테마 아이콘 cross-fade, optical padding.

---

### 부록 — 등급 집계

| 등급 | 건수 | 대표 항목 |
|---|---|---|
| **High** | 12 | 600 페이스 부재·focus-visible·reduced-motion·transition:all·라이트 태그·이미지 outline·hit area·press 피드백 등 |
| **Med** | 15 | text-muted·z-index 충돌·font-display·placeholder 대비·toolbar radius·shadow 레이어·1px 점프 등 |
| **Low** | 14 | text-wrap·optical padding·selectionBox 1.5px·Firefox 스크롤바·색상 하드코딩 등 |

*이 문서는 6개 분야 병렬 조사 후 종합한 것으로, 여러 에이전트가 독립적으로 동일 지적한 항목(`--text-muted` 미정의, `:focus-visible`/`reduced-motion` 부재, 아이콘 stroke-width 불일치)은 신뢰도가 특히 높다.*
