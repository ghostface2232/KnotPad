# KnotPad Memo Editor Review

> 작성일: 2026-06-22  
> 범위: 메모 작성·편집, 서식, 줄바꿈, 복사/붙여넣기, 빠른 노드 전환, undo/redo, autosave, 편집 성능 및 UX  
> 방법: 정적 코드 감사, 이벤트·상태 흐름 추적, 로컬 Chromium 상호작용 재현, 현재 자동화 테스트 범위 확인

> 구현 상태: P0-1과 P0-2는 2026-06-22에 1차 수정 완료. 편집기 내부 undo/redo를 canvas history에서 분리했고, 입력 중에는 live DOM을 모델과 직접 동기화하며 blur commit에서만 canonical normalization을 수행한다.

---

## 1. Executive Summary

KnotPad 메모 편집기에서 반복적으로 나타나는 작은 오류들은 독립적인 UI 버그라기보다, 하나의 편집 내용을 여러 상태가 동시에 소유하는 구조에서 발생한다.

현재 메모 한 개의 내용은 다음 네 표현에 걸쳐 존재한다.

```text
contenteditable DOM
        ↓ input 시 전체 HTML 정규화
item.content
        ↓ 1초 단위 전체 캔버스 snapshot
undo / redo history
        ↓ 1.5초 단위 전체 직렬화
localStorage / File System
```

이들 사이에는 단일 transaction, revision, 명시적인 commit 경계가 없다. 그 결과 다음 현상이 가능하다.

- 사용자가 보는 DOM과 저장되는 HTML이 서로 다르다.
- 메모 내부 undo가 캔버스 전체 undo로 처리된다.
- 한글 조합 중간 상태가 history 또는 저장 데이터에 포함될 수 있다.
- 빠르게 다른 메모로 이동할 때 편집 중인 노드와 선택된 노드가 달라질 수 있다.
- 붙여넣은 블록 서식이 문단 안에 중첩되어 Enter 동작이 불안정해진다.
- 긴 메모와 큰 캔버스에서는 한 글자 입력도 전체 DOM 파싱과 전체 캔버스 저장으로 확대된다.

### 종합 판정

| 평가 항목 | 현재 상태 | 핵심 이유 |
|---|---|---|
| 데이터 무결성 | 위험 | editor DOM, item model, history, persistence 간 원자성 부재 |
| Undo 신뢰성 | 위험 | 편집기 undo와 캔버스 undo가 분리되지 않음 |
| IME/한글 입력 | 취약 | composition lifecycle을 transaction으로 취급하지 않음 |
| 서식 안정성 | 취약 | 브라우저 `execCommand`와 자체 DOM 변형 혼용 |
| 붙여넣기 안정성 | 취약 | inline/block 삽입 규칙이 없고 clipboard 경로가 분산됨 |
| 성능 확장성 | 취약 | 매 입력 전체 HTML 정규화, 매 저장 전체 history 직렬화 |
| UX 일관성 | 개선 필요 | active editor와 selected node 의미가 분리됨 |
| 테스트 방어력 | 매우 낮음 | 현재 테스트는 sanitizer 중심이며 편집 동작 E2E가 없음 |

가장 먼저 해결해야 할 항목은 다음 다섯 가지다.

1. editable 내부 undo와 앱 전체 undo를 분리한다.
2. IME composition 중에는 저장·history·구조 정규화를 수행하지 않는다.
3. 메모 HTML의 canonical block schema를 정의하고 DOM과 모델을 같은 표현으로 유지한다.
4. 빠른 노드 전환을 `commit current → activate next` 단일 transaction으로 만든다.
5. 전체 snapshot 저장을 편집 transaction과 분리하고 revision 기반 저장 큐를 도입한다.

---

## 2. 조사 범위와 검증 방법

### 2.1 주요 감사 대상

| 영역 | 주요 위치 |
|---|---|
| 메모 HTML 변환·정규화 | `js/items.js:197-1153` |
| 메모 DOM 생성 | `js/items.js:1248-1431` |
| 메모 입력·focus·blur·paste | `js/items.js:1589-2185` |
| heading·정렬 | `js/items.js:2444-2611` |
| 전역 키보드 단축키 | `js/events.js:294-383` |
| copy/paste 라우팅 | `js/events.js:424-536` |
| undo/redo snapshot | `js/ui.js:202-330` |
| 캔버스 저장·전환 | `js/ui.js:463-730` |
| autosave·beforeunload | `js/ui.js:2998-3068` |
| 편집 UI CSS | `style.css:420-458` |

### 2.2 브라우저에서 확인한 대표 동작

- 일반 문단 입력 후 `Enter`, `Shift+Enter`
- heading 단축키 적용 후 실제 DOM과 reload 결과 비교
- 메모 입력 직후 `Ctrl+Z`
- 겹쳐 생성된 메모 사이의 focus 전환
- autosave 대기 후 reload하여 저장 HTML 확인
- 콘솔 warning/error 확인

### 2.3 확인된 실제 재현 결과

#### 메모 내부 Undo

메모에 한 글자를 입력한 직후 `Ctrl+Z`를 실행했을 때 글자 단위 native undo가 아니라 앱 전체 undo가 실행됐다. 직전에 생성한 다른 노드까지 제거됐고 편집 focus도 사라졌다.

#### Shift+Enter DOM

`Shift+Enter` 뒤 입력한 메모의 실제 DOM에는 보이지 않는 zero-width 문자가 남았다.

```html
<div data-knotpad-paragraph="true">
  beta<br>soft​​
</div>
```

저장 정규화에서는 이 문자가 제거되므로 편집 중 DOM과 reload 후 DOM이 다르다.

#### Heading 구조

일반 문단 안의 soft break 뒤에서 heading을 적용했을 때 다음 구조가 생성됐다.

```html
<div data-knotpad-paragraph="true">
  beta<br>
  <h1>soft</h1>
</div>
```

즉, 최상위 블록이어야 할 heading이 paragraph block 내부에 중첩됐다.

#### 새 메모 겹침

같은 화면 중앙에서 두 메모를 연속 생성하면 약간의 좌표 차이만 적용되어 두 번째 메모가 첫 번째 메모 대부분을 덮었다. 첫 번째 메모를 다시 클릭하기 어려웠고, 빠른 전환 경험을 악화시켰다.

---

## 3. Severity 기준

| 등급 | 의미 |
|---|---|
| P0 | 데이터 손실, 보안 문제, 사용자의 기본 편집 기대를 직접 위반하는 결함 |
| P1 | 자주 노출되거나 여러 기능의 불안정성을 유발하는 구조적 결함 |
| P2 | 규모가 커질수록 성능·완성도를 저하시키는 문제 |
| P3 | 접근성, 안내, 시각적 일관성 등 제품 완성도 문제 |

---

## 4. 상세 발견 사항

## P0-1. 메모 내부 `Ctrl+Z`가 캔버스 전체 Undo를 실행한다 — 1차 해결

### 관련 코드

- `js/events.js:301-325`
- `js/ui.js:277-294`
- `js/ui.js:296-330`

### 현재 동작

전역 `keydown` listener는 이벤트 target이 contenteditable인지 확인하기 전에 `Ctrl+Z`를 가로채고 `undo()`를 호출한다.

```javascript
if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
    return;
}
```

앱 undo는 현재 DOM을 부분 수정하지 않는다. 전체 아이템 DOM을 제거하고 snapshot에서 다시 생성한다. 따라서 사용자의 caret, selection, scroll 위치, active composition, 편집 focus가 모두 사라진다.

### 리스크 예시

1. 사용자가 메모 A를 편집한다.
2. 직전에 메모 B를 추가했다.
3. A에서 오타 한 글자를 입력하고 `Ctrl+Z`를 누른다.
4. 오타뿐 아니라 메모 B 전체가 사라진다.
5. 사용자는 앱이 임의로 데이터를 삭제했다고 인식한다.

### 추가 결함: `Ctrl+Shift+Z`

일반 `Ctrl+Z` 분기가 먼저 실행되며 `Shift` 여부를 검사하지 않는다. 따라서 뒤에 있는 redo 조건은 `Ctrl+Shift+Z`에 대해 도달할 수 없다.

### 개선안

- editable 내부에서는 native history 또는 editor-local history를 사용한다.
- 앱 전체 undo는 editable 바깥에서만 실행한다.
- `Ctrl+Shift+Z`를 일반 `Ctrl+Z`보다 먼저 판정한다.
- editor commit 이전의 canvas undo는 활성 편집기를 먼저 안전하게 종료하거나 commit해야 한다.

### 수용 기준

- 메모에서 한 글자 입력 후 undo하면 그 글자만 복구된다.
- 다른 노드의 생성·삭제·위치는 변하지 않는다.
- undo 후 focus와 caret이 같은 메모에 유지된다.
- `Ctrl+Shift+Z`와 `Ctrl+Y`가 같은 redo 결과를 만든다.

---

## P0-2. 편집 DOM과 `item.content`가 서로 다른 HTML을 보유한다 — 1차 해결

### 관련 코드

- `js/items.js:279-282`
- `js/items.js:958-1010`
- `js/items.js:1684-1723`

### 현재 동작

모든 `input` 이벤트에서 `mb.innerHTML`을 읽고 `normalizeMemoHtml()`을 수행해 `item.content`에 저장한다. 정규화는 별도 임시 DOM을 만들고 구조를 다시 작성한다. 하지만 정규화 결과를 현재 `mb`에는 적용하지 않는다.

```text
사용자가 보는 mb.innerHTML = A
저장 모델 item.content = normalize(A) = B
```

이후 reload, undo, redo 또는 캔버스 전환으로 node가 재생성되면 B가 화면에 나타난다.

### 리스크 예시

- 편집 중에는 빈 줄이 한 줄인데 다시 열면 두 줄이 된다.
- heading 옆에서 삭제했을 때 화면에서는 정상이나 reload 후 heading 상속이 달라진다.
- selection 기준이 DOM A에 있었지만 undo history에는 DOM B가 저장된다.
- 외부 export 결과와 사용자가 화면에서 본 구조가 다르다.

### 성능 리스크

`normalizeMemoHtml()`은 매 입력마다 다음을 수행한다.

- 새 DOM container 생성
- `innerHTML` 파싱
- 전체 text node TreeWalker 순회
- 전체 `div, p` query
- 노드 이동 및 삭제
- 결과 HTML 재직렬화

본문 길이를 `N`이라 할 때 한 글자 입력 비용이 사실상 `O(N)`이다. 한 문장을 입력하는 전체 비용은 길이에 따라 `O(N²)`에 가까워질 수 있다.

### 개선안

- input 중에는 현재 editor state만 dirty로 표시한다.
- 정규화는 paste, import/load, explicit formatting transaction, blur commit에서만 수행한다.
- commit 결과를 DOM과 `item.content` 양쪽에 동일하게 적용한다.
- 가능하면 HTML 문자열이 아니라 editor model을 canonical source로 사용한다.

### 수용 기준

다음 불변식이 항상 성립해야 한다.

```javascript
serialize(editorDOM) === item.content
serialize(deserialize(item.content)) === item.content
```

---

## P0-3. 한글 IME composition을 하나의 편집 transaction으로 처리하지 않는다

### 관련 코드

- `js/items.js:1684-1754`
- `js/items.js:1959-2121`

### 현재 동작

코드에는 `compositionstart`, `compositionupdate`, `compositionend` handler가 없다. `keydown`의 Enter 처리에서 `e.isComposing`만 확인한다.

IME 입력 중에도 여러 `input` 이벤트가 발생할 수 있으며 현재 코드는 각 이벤트마다 다음을 수행한다.

- 전체 HTML 정규화
- `item.content` 변경
- autosave 예약
- undo snapshot debounce 예약

### 리스크 예시

- 사용자가 `한`을 조합하는 중 `ㅎ`, `하`, `한` 상태가 각각 내부 모델에 반영된다.
- 조합 도중 1초 이상 멈추면 미완성 후보가 undo snapshot이 될 수 있다.
- 조합 중 다른 메모를 클릭하면 blur와 compositionend 순서에 따라 중간 글자가 저장될 수 있다.
- 일부 브라우저에서 IME Enter가 문단 Enter로 함께 처리되어 의도하지 않은 줄바꿈이 생길 수 있다.
- Android/WebView/Safari에서는 `isComposing`만으로 충분하지 않고 legacy `keyCode === 229` 방어가 필요할 수 있다.

### 개선안

```text
compositionstart → editor.isComposing = true
compositionupdate → DOM만 브라우저가 관리
compositionend → editor.isComposing = false → 단일 input transaction commit
```

- composing 중 history와 persistence를 만들지 않는다.
- `beforeinput`과 `keydown` 양쪽에서 composition 상태를 확인한다.
- blur 시 composition이 끝나지 않았다면 commit을 microtask 또는 다음 input까지 지연한다.

### 수용 기준

- 한글 한 글자 조합이 undo 한 번에 제거된다.
- 조합 중 메모 A에서 B로 이동해도 완성된 문자열만 저장된다.
- 후보 선택 Enter가 문단 생성으로 중복 처리되지 않는다.

---

## P0-4. 내부 clipboard HTML 경로가 sanitizer를 우회한다

### 관련 코드

- `js/items.js:297-300`
- `js/items.js:1105-1137`
- `js/items.js:1918-1957`

### 현재 동작

일반 외부 HTML은 `sanitizeClipboardHtml()`을 통과한다. 그러나 다음 두 경로는 sanitizer 없이 `normalizeMemoHtml()`만 수행한다.

- `application/x-knotpad-memo`
- `<!--KNOTPAD_MEMO-->` marker가 포함된 `text/html`

`normalizeMemoHtml()`은 보안 sanitizer가 아니다. 태그와 event handler를 제거하지 않는다.

### 리스크 예시

KnotPad 내부 형식처럼 보이는 clipboard payload에 다음 내용이 포함될 수 있다.

```html
<img src="invalid" onerror="/* injected script */">
```

이를 selection에 fragment로 삽입하면 저장 전이라도 live DOM에서 event handler가 실행될 가능성이 있다. “내부 MIME이므로 신뢰한다”는 가정은 OS clipboard나 다른 앱이 같은 MIME을 생성할 수 있으므로 안전하지 않다.

### 개선안

- 모든 clipboard 입력을 동일한 sanitizer로 통과시킨다.
- 내부 marker는 서식 보존 우선순위를 정하는 hint로만 사용한다.
- paste boundary 이후 canonical schema validator를 추가한다.
- sanitizer와 normalizer를 명확히 분리한다.

```text
untrusted clipboard
  → sanitize
  → parse to editor schema
  → normalize schema
  → transaction insert
```

---

## P1-1. 줄바꿈 sentinel인 zero-width 문자가 편집 DOM에 누적된다

### 관련 코드

- `js/items.js:11`
- `js/items.js:434-471`
- `js/items.js:634-655`
- `js/events.js:453-471`

### 현재 동작

soft break 뒤에 caret을 배치하기 위해 `\u200B` text node를 삽입한다. 사용자가 이어서 입력해도 sentinel은 남는다. 저장 시 normalizer가 제거하지만 live DOM에서는 유지된다.

### 리스크 예시

- 화살표 키를 한 번 눌렀는데 caret이 시각적으로 움직이지 않는다.
- Backspace가 먼저 invisible character를 지워 “한 번 안 먹힌 것”처럼 느껴진다.
- 외부 앱에 복사하면 zero-width 문자가 포함될 수 있다.
- 검색 결과 문자열과 화면 텍스트가 미세하게 달라진다.
- 문서 diff나 export 결과에는 문자가 없지만 clipboard 결과에는 존재한다.

### 개선안

- 가능하면 `<br>`과 Range만으로 caret을 배치한다.
- sentinel이 불가피하다면 DOM 전용 decoration으로 관리하고 다음 input 직후 제거한다.
- copy/cut/search/serialize 경계에서 editor artifact 제거를 보장한다.
- artifact가 실제 사용자 문자와 섞이지 않도록 별도 node metadata 또는 decoration layer를 사용한다.

---

## P1-2. Paragraph 안에 Heading/List 같은 블록이 중첩될 수 있다

### 관련 코드

- `js/items.js:567-631`
- `js/items.js:729-782`
- `js/items.js:2444-2611`

### 현재 동작

`flattenParagraphBlocksForInsertion()`은 일부 paragraph block만 `<br>` 형태로 평탄화한다. heading, list, blockquote 등의 semantic block을 현재 paragraph 중간에 붙여넣을 때 현재 block을 앞/뒤로 split하지 않는다.

heading 전환도 selection anchor가 top-level paragraph 내부에 있으면 브라우저 `execCommand('formatBlock')` 결과에 의존한다.

### 위험 구조 예시

```html
<div data-knotpad-paragraph="true">
  before
  <h1>heading</h1>
  <ul><li>item</li></ul>
  after
</div>
```

### 리스크

- Enter가 heading을 종료하지 않고 paragraph 전체를 복제한다.
- Backspace로 블록 경계를 합치면 font-size/font-weight가 인접 텍스트에 잔류한다.
- CSS margin과 paragraph spacing이 중첩 적용된다.
- Chrome, Safari, Firefox의 contenteditable 보정 결과가 달라진다.
- serialize/reload 후 구조가 다시 변할 수 있다.

### 개선안

canonical top-level schema를 강제한다.

```text
MemoRoot
├─ Paragraph
├─ Heading1
├─ Heading2
├─ BulletList
│  └─ ListItem
├─ Quote
└─ HorizontalRule
```

block paste가 paragraph 중간에서 발생하면 다음 transaction을 수행한다.

```text
Paragraph("before | after")
  → Paragraph("before")
  → pasted block(s)
  → Paragraph("after")
```

---

## P1-3. 편집 중인 메모와 선택된 메모가 다를 수 있다

### 관련 코드

- `js/items.js:1445-1463`
- `js/items.js:1599-1682`
- `js/items.js:2678-2712`

### 현재 동작

canvas item의 `mousedown`에서 z-index는 올리지만, contenteditable이면 selection 처리 전에 반환한다. 본문 focus는 `.editing` class만 제어한다.

따라서 다음 상태가 가능하다.

```text
state.selectedItem = memo A
state.selectedItems = { memo A }
document.activeElement = memo B body
memo B class = editing
```

### 리스크 예시

- B를 편집하면서 전역 색상 버튼을 누르면 A의 색상이 바뀐다.
- 선택 outline은 A에 남아 있지만 caret은 B에 있어 사용자가 현재 대상을 오해한다.
- 빠르게 B→C로 이동하는 동안 B의 blur save와 C의 focus baseline 설정이 교차한다.
- Delete/Context menu/toolbar가 서로 다른 target 정책을 사용한다.

### 개선안

다음 상태를 명확히 분리하되 전환 규칙을 통일한다.

```javascript
selectedNodeIds       // canvas graph operation 대상
activeEditorItemId    // 텍스트 입력 대상, 최대 1개
editorSelection       // 활성 editor 내부 Range/model selection
```

본문을 클릭하면 최소한 다음 동작을 하나의 transaction으로 처리해야 한다.

```text
commit previous active editor
→ update selected node policy
→ activate clicked editor
→ restore caret
```

제품 정책상 “편집 focus와 canvas selection을 항상 동일하게” 만들 수도 있다. 현재 UI에는 이 정책이 가장 이해하기 쉽다.

---

## P1-4. 새 노드 위치 충돌 검사가 실제 노드 크기를 고려하지 않는다

### 관련 코드

- `js/utils.js:209-218`
- `js/items.js:2980-3005`

### 현재 동작

`findFreePosition()`은 기존 노드와 x/y 좌표가 각각 10px 미만 차이인지 확인한다. 충돌하면 6px씩 이동한다. 노드의 `w`, `h`는 고려하지 않는다.

기본 메모는 약 220×140이므로 위치가 12px 달라도 사실상 전체가 겹친다.

### 리스크

- 연속 생성한 메모가 카드 더미처럼 겹친다.
- 아래 노드의 본문을 클릭할 수 없다.
- 어떤 노드가 활성화됐는지 파악하기 어렵다.
- 빠른 메모 작성 흐름에서 사용자가 매번 노드를 먼저 이동해야 한다.

### 개선안

- axis-aligned bounding box 충돌 검사를 사용한다.
- viewport 내 spiral/grid placement를 적용한다.
- 새 메모를 만든 뒤 바로 편집한다면 기존 active node 옆 또는 viewport의 명확한 빈 영역에 배치한다.
- 겹침이 의도된 기능이라면 cascade offset을 최소 24~32px 이상 두고 header/edge가 항상 노출되게 한다.

---

## P1-5. Paste 정책과 설정의 의미가 일치하지 않는다

### 관련 코드

- `js/items.js:1105-1153`
- `js/items.js:1916-1957`
- `js/events.js:482-535`
- `index.html:417-421`

### 현재 동작

메모 paste 주석은 plain text를 우선한다고 설명하지만 실제 옵션은 `preferPlainText: false`다. 캔버스 paste 설정을 꺼도 `enablePlainTextFormatting`만 비활성화되며 semantic HTML은 여전히 우선될 수 있다.

### 리스크 예시

- 사용자가 “Auto-format canvas paste”를 껐는데 웹페이지의 heading/list 서식이 계속 유지된다.
- 같은 clipboard가 메모 내부 paste와 빈 캔버스 paste에서 다른 DOM을 만든다.
- plain text와 HTML representation의 사소한 차이가 semantic formatting으로 오인된다.
- 이미지를 메모에 붙여넣으면 이벤트가 조용히 취소되어 아무 반응이 없다.

### 개선안

설정을 다음처럼 명확히 구분한다.

- Plain text only
- Preserve safe formatting
- Convert Markdown-like plain text

paste pipeline과 UI 설명이 같은 정책 객체를 사용하게 한다.

```javascript
const pastePolicy = {
    preserveRichText: true,
    parseMarkdown: false,
    imageBehavior: 'create-node'
};
```

---

## P1-6. Autosave와 캔버스 전환에 revision/flush 계약이 없다

### 관련 코드

- `js/ui.js:463-521`
- `js/ui.js:653-730`
- `js/ui.js:2998-3068`

### 현재 동작

autosave timer는 `saveCurrentCanvas()`를 `await`하지 않고 호출한 뒤 바로 `hasPendingChanges = false`로 만든다. 저장 payload와 canvas ID도 하나의 immutable save job으로 캡처되지 않는다.

### 리스크 예시

- File System 저장이 실패해도 dirty flag가 이미 해제되어 visibilitychange에서 재시도하지 않는다.
- 이전 save와 캔버스 전환 save가 겹치면 완료 순서가 바뀔 수 있다.
- 저장 await 이후 metadata 갱신 시점의 `state.currentCanvasId`가 payload를 만든 캔버스와 다를 수 있다.
- localStorage quota 오류가 발생하면 같은 `try` 블록 뒤의 File System 저장에 도달하지 못한다.

### 개선안

```javascript
saveQueue.enqueue({
    canvasId,
    revision,
    payload,
    reason: 'autosave'
});
```

- canvas ID와 payload를 함수 시작 시 캡처한다.
- canvas별 save를 직렬화한다.
- 성공한 최신 revision까지만 clean으로 표시한다.
- localStorage와 File System 결과를 독립적으로 처리한다.
- canvas switch, visibilitychange, beforeunload에 명시적인 `flush()` 계약을 둔다.
- async 저장 실패를 swallow하지 말고 status와 retry queue에 반영한다.

---

## P2-1. 전체 캔버스 Snapshot History가 입력 규모에 비해 과도하다

### 관련 코드

- `js/ui.js:204-251`
- `js/ui.js:472-504`

### 현재 동작

메모 입력이 1초 동안 멈출 때마다 캔버스의 모든 item과 connection을 복제한다. 중복 검사도 이전 snapshot과 현재 전체 snapshot을 각각 `JSON.stringify()`하여 비교한다.

저장할 때 현재 문서와 undo/redo snapshot 전체를 다시 직렬화한다.

### 비용 예시

100개 메모, history 50단계가 있을 때 메모 본문이 여러 snapshot에 반복 저장된다. 메모 평균 본문이 5KB라면 본문 중복만으로도 대략 수십 MB 수준까지 커질 수 있다. `localStorage`의 일반적인 quota와 동기 직렬화 특성을 고려하면 저장 실패와 UI 멈춤 가능성이 높다.

### 개선안

- editor history와 canvas history를 분리한다.
- 텍스트 편집은 operation/transaction 또는 editor engine history를 사용한다.
- canvas history에는 editor commit 한 건만 기록한다.
- 현재 문서와 history persistence를 분리한다.
- history를 반드시 재시작 후 복원해야 하는 제품 요구가 없다면 memory-only로 유지한다.
- persistence는 IndexedDB 기반 비동기 저장을 우선한다.

---

## P2-2. 모든 메모가 항상 완전한 편집기와 툴바를 보유한다

### 관련 코드

- `js/items.js:1292-1345`
- `js/items.js:1589-2185`
- `style.css:439-446`

### 현재 동작

각 메모 노드는 다음을 개별 생성한다.

- 항상 활성화된 contenteditable
- 다수 버튼과 SVG로 구성된 floating toolbar
- input, blur, focus, paste, beforeinput, keydown, mouseup, dblclick, scroll, keyup listener
- selectionchange debounce timer
- undo save timer
- formatting closure와 selection 계산 함수

### 리스크

- 메모 수에 비례해 DOM node와 listener가 증가한다.
- hidden toolbar까지 layout tree에 포함된다.
- selection 변경 시 toolbar를 임시 활성화하고 `offsetWidth/offsetHeight`를 읽어 forced layout이 발생한다.
- 많은 메모가 있는 캔버스에서 초기 로드와 undo restore 비용이 커진다.

### 개선안

단일 활성 편집기 패턴을 권장한다.

```text
비활성 메모: static sanitized renderer
활성 메모: contenteditable/editor instance 1개
툴바: 앱 전체 공유 1개
selection listener: 활성 editor용 1개
```

툴바 크기는 캐시하거나 `ResizeObserver`로 갱신하고 위치 변경은 `requestAnimationFrame`으로 합친다.

---

## P2-3. `execCommand`와 수동 DOM 조작이 혼합돼 있다

### 관련 코드

- `js/events.js:331-354`
- `js/items.js:2123-2184`
- `js/items.js:2553-2611`

### 현재 동작

bold, italic, strike, underline, heading 일부는 deprecated된 `document.execCommand()`에 의존한다. 정렬과 heading cycle 일부는 직접 DOM을 교체한다.

### 리스크

- 브라우저마다 생성 tag와 inline style이 다르다.
- 어떤 command는 `input` 이벤트를 만들고 어떤 직접 DOM 변경은 만들지 않는다.
- selection이 여러 block을 걸칠 때 anchor block만 바뀔 수 있다.
- toolbar 클릭 과정에서 selection collapse와 focus 복구가 불안정해진다.

### 개선안

- 모든 서식을 editor transaction API로 통일한다.
- selection bookmark를 저장하고 transaction 후 logical position으로 복원한다.
- inline mark와 block type을 명확히 분리한다.
- 자체 편집기를 유지한다면 `beforeinput`과 Range 기반 command를 한 모듈에 캡슐화한다.

---

## P3-1. 편집 상태와 저장 상태에 대한 사용자 피드백이 부족하다

### 문제

현재 사용자는 다음을 알기 어렵다.

- 어느 노드가 선택됐고 어느 노드가 편집 중인지
- 저장이 예약됐는지 완료됐는지 실패했는지
- 이미지 paste가 왜 동작하지 않았는지
- rich formatting이 유지되는지 plain text로 붙는지

### 개선안

- selected와 editing 시각 상태를 분명하게 정의한다.
- `Saving…`, `Saved`, `Save failed` 상태를 topbar에 제공한다.
- 차단된 paste에는 toast 또는 inline 안내를 표시한다.
- 서식 toolbar 버튼에 현재 selection 상태(`aria-pressed`)를 표시한다.
- keyboard-only focus ring과 명확한 tab order를 제공한다.
- `spellcheck=false`를 고정하지 말고 설정 또는 언어 환경에 따라 선택 가능하게 한다.

---

## 5. 권장 편집기 아키텍처

## 5.1 상태 소유권

```text
CanvasState
├─ nodes / connections
├─ selectedNodeIds
└─ activeEditorItemId

MemoEditorSession (0 or 1)
├─ itemId
├─ documentModel
├─ selection
├─ compositionState
├─ localHistory
├─ dirtyRevision
└─ committedRevision

PersistenceQueue
├─ canvasId
├─ revision
├─ payload
└─ status
```

핵심은 메모 내용의 편집 중 소유자를 `MemoEditorSession` 하나로 제한하는 것이다.

## 5.2 명시적 lifecycle

```text
activate(item)
  → parse canonical content
  → mount editor
  → restore selection or place caret

edit transaction
  → mutate editor model
  → render minimal DOM change
  → update local history
  → mark revision dirty

commit(reason)
  → finish composition
  → normalize once
  → update item.content
  → create one canvas operation
  → enqueue persistence

deactivate()
  → commit
  → unmount editor
  → render static HTML
```

## 5.3 Canonical document schema

HTML 문자열을 계속 저장하더라도 내부 규칙은 명시해야 한다.

```html
<div data-knotpad-paragraph="true">Normal text<br>soft break</div>
<h1>Heading</h1>
<blockquote>Quote</blockquote>
<ul><li>Item</li></ul>
<hr>
```

금지할 구조:

- paragraph 안의 heading/list/blockquote
- list 밖의 top-level `li`
- 의미 없는 중첩 `div`
- editor artifact인 zero-width text
- 지원하지 않는 inline style
- event handler 또는 unsafe URL attribute

## 5.4 편집 엔진 선택

### 선택지 A: 자체 editor 유지

적합한 경우:

- 지원 서식이 heading, bold, italic, underline, strike, 정렬, 단순 list 정도로 제한됨
- bundle과 dependency를 최소화해야 함
- 모바일 복잡 편집 기능 확장 계획이 크지 않음

필수 조건:

- `js/memo-editor.js` 또는 동등한 독립 모듈로 분리
- canonical schema validator
- composition-aware transaction
- editor-local history
- 실제 브라우저 E2E 테스트

### 선택지 B: Lexical/ProseMirror 계열 도입

적합한 경우:

- 중첩 list, 링크, 체크리스트, slash command, 모바일 편집 등 확장 계획이 있음
- cross-browser selection/history 문제를 자체 유지보수하고 싶지 않음

주의점:

- 메모 노드마다 editor instance를 만들면 안 된다.
- 하나의 공유 editor instance를 현재 active memo에만 mount하는 구조가 필요하다.
- 기존 HTML을 새 schema로 migration하는 단계가 필요하다.

현재 제품 범위에서는 먼저 선택지 A로 lifecycle과 불변식을 바로잡고, 기능 확장 계획이 확정되면 선택지 B를 검토하는 것이 비용 대비 합리적이다.

---

## 6. 단계별 실행 계획

## Phase 0. 회귀 테스트 선행

예상 범위: 2~4일

- Playwright 기반 editor E2E 환경 추가
- 기존 사용자 메모 HTML fixture 수집
- serialize round-trip golden test 추가
- 현재 발견된 결함을 failing test로 고정

완료 조건:

- 코드 수정 전 현재 결함이 테스트에서 재현됨
- 최소 Chromium에서 자동 실행 가능

## Phase 1. P0 안정화

예상 범위: 3~7일

- undo scope 수정
- `Ctrl+Shift+Z` 분기 수정
- composition lifecycle 추가
- clipboard 모든 경로 sanitize
- zero-width artifact copy/serialize 제거
- active editor와 selected node 동기화
- canvas switch/delete/undo 전 editor flush

완료 조건:

- 데이터 손실 및 IME 핵심 시나리오 통과
- 기존 메모 load 결과에 회귀 없음

## Phase 2. Canonical editor transaction

예상 범위: 1~3주

- memo formatting/parsing을 독립 모듈로 추출
- top-level block schema 도입
- Enter/Shift+Enter/list/heading을 동일 transaction API로 구현
- 매 입력 전체 normalize 제거
- shared toolbar 도입
- 비활성 노드 static rendering 적용

완료 조건:

- supported operation 후 항상 schema validator 통과
- save/reload round-trip HTML 변화 없음

## Phase 3. History와 Persistence 개편

예상 범위: 1~2주

- editor-local history와 canvas history 분리
- 전체 snapshot 중복 감소
- revision 기반 save queue
- IndexedDB 중심 비동기 저장 검토
- 저장 상태 UI 및 retry 처리

완료 조건:

- 큰 캔버스에서도 입력 중 동기 JSON serialization이 발생하지 않음
- 저장 실패 후 dirty 상태와 재시도가 유지됨

## Phase 4. UX와 접근성 정리

예상 범위: 3~7일

- editing/selected 시각 상태 정리
- 새 노드 충돌 회피
- paste 정책 UI 개선
- toolbar keyboard navigation 및 ARIA
- 저장 상태 표시
- 모바일 selection/IME 검증

---

## 7. 필수 테스트 매트릭스

## 7.1 입력과 IME

| 시나리오 | 기대 결과 |
|---|---|
| 한글 한 글자 조합 후 undo | 완성 글자 전체가 한 단계로 제거 |
| 조합 중 메모 A→B 전환 | A에는 완성된 문자열만 저장 |
| 조합 후보 Enter | 문단이 추가로 생성되지 않음 |
| 조합 중 Backspace | 브라우저/IME 후보 처리와 충돌 없음 |
| 빠른 20회 노드 전환 | 내용 누락, focus 유실, 잘못된 node commit 없음 |

## 7.2 줄바꿈과 블록

| 위치 | Enter | Shift+Enter |
|---|---|---|
| 일반 문단 중간 | 문단 두 개로 분리 | 같은 문단의 `<br>` |
| 빈 문단 | 새 빈 문단 | soft break |
| heading 중간 | heading split 정책대로 처리 | heading 내부 soft break 정책대로 처리 |
| list item 중간 | 새 item | item 내부 soft break |
| 빈 list item | list 종료 | item 내부 soft break |

각 결과는 save → reload → undo → redo 후에도 동일해야 한다.

## 7.3 Copy/Paste source

- KnotPad 메모 내부
- 서로 다른 KnotPad 메모 사이
- VS Code/plain text editor
- Microsoft Word
- Google Docs
- 일반 웹페이지
- Markdown 텍스트
- URL 한 줄
- 다중 문단 plain text
- heading/list가 포함된 rich HTML
- 이미지 clipboard
- 비정상 custom MIME과 공격성 HTML

## 7.4 History

- 편집기 undo가 다른 노드에 영향을 주지 않음
- canvas undo 후 editor가 dangling item을 참조하지 않음
- editor commit 후 canvas undo/redo round-trip
- undo 직전 autosave와 canvas switch 동시 실행
- history 최대치 eviction 후 현재 내용 보존

## 7.5 성능

측정 fixture:

- 10,000자 단일 메모
- 500개 메모 노드
- 100개 메모 × history 50단계
- 100개 연결이 있는 캔버스

권장 목표:

| 지표 | 목표 |
|---|---|
| 일반 입력 handler p95 | 16ms 이하 |
| editor commit p95 | 50ms 이하 |
| 메모 A→B 활성 전환 | 100ms 이하 |
| 입력 중 Long Task | 50ms 이상 task 없음 |
| autosave | 입력 프레임을 동기 block하지 않음 |
| round-trip | HTML 구조 변화 0건 |

---

## 8. 제품·디자인 개선 제안

### 편집 상태 표현

- 선택된 노드: canvas operation 대상이라는 의미의 outline
- 편집 중인 노드: caret과 별도의 editing 강조 표시
- 두 상태를 분리한다면 색상과 모양을 명확히 다르게 사용
- 단순성을 우선한다면 본문 클릭 시 선택과 편집을 항상 같은 노드로 통일

### Toolbar

- 노드마다 생성하지 않고 공유 floating toolbar 사용
- selection이 collapse되어도 keyboard shortcut 상태를 보여줄 수 있는 block toolbar 고려
- 버튼에 `aria-label`, `aria-pressed`, tooltip 제공
- 화면 가장자리와 zoom 변환에서 위치 안정성 보장

### Paste 경험

- 설정에서 “서식 유지”, “일반 텍스트”, “Markdown 변환”을 명확히 구분
- 이미지 paste는 메모 안에 넣지 않는 정책이라면 새 이미지 노드 생성 여부를 안내
- 안전하지 않거나 지원하지 않는 서식은 제거했다는 짧은 피드백 제공 가능

### 저장 신뢰감

- `Saving…`, `Saved`, `Save failed — retrying` 상태 제공
- unload 직전에만 의존하지 않고 revision 기준으로 저장 완료 여부 표시
- 실패 toast 한 번으로 끝내지 말고 dirty 상태 유지

### 새 메모 작성 흐름

- 새 메모 생성 즉시 편집 focus 제공
- 기존 활성 메모와 겹치지 않는 위치에 생성
- 연속 생성 시 grid/cascade로 최소한 title/body 접근 영역을 노출

---

## 9. 구현 시 지켜야 할 불변식

다음 항목은 코드 리뷰와 테스트의 공통 기준으로 사용해야 한다.

1. 한 시점에 active memo editor는 최대 하나다.
2. composition은 중간 저장되지 않는 하나의 transaction이다.
3. editor commit 후 DOM과 `item.content`는 동일한 canonical 문서를 표현한다.
4. serialize → deserialize → serialize 결과는 동일하다.
5. paragraph 안에는 block node가 들어가지 않는다.
6. editor artifact는 copy, search, save, export에 노출되지 않는다.
7. editable 내부 undo는 다른 canvas node를 변경하지 않는다.
8. 저장 성공이 확인된 revision만 clean 상태가 된다.
9. canvas switch는 현재 editor commit과 save flush 이후 완료된다.
10. 모든 clipboard/import HTML은 신뢰하지 않고 sanitize한다.

---

## 10. 현재 자동화 테스트 평가

현재 `npm test`는 13개 sanitizer 테스트를 통과한다. 이는 URL과 memo load sanitizer의 일부 보안 회귀를 방어하지만, 편집기 신뢰성에 대해서는 실질적인 보호가 없다.

현재 빠져 있는 핵심 영역:

- contenteditable selection과 Range
- beforeinput/input/composition event 순서
- Enter/Shift+Enter DOM 결과
- editor-local undo와 canvas undo scope
- copy/paste 실제 ClipboardEvent
- focus/blur를 포함한 빠른 노드 전환
- autosave와 canvas switch 경쟁 조건
- 큰 메모 입력 성능
- 브라우저별 DOM 차이

편집기 변경은 jsdom 단위 테스트만으로 안전성을 보장할 수 없다. 실제 Chromium Playwright E2E를 필수 gate로 두고, 가능하다면 WebKit도 보조 검증해야 한다.

---

## 11. 최종 권고

단기적으로 개별 줄바꿈 예외를 계속 추가하는 방식은 위험하다. 현재 `items.js`에는 paste, paragraph split, list continuation, heading 정리, zero-width 처리 등 서로 영향을 주는 보정 로직이 이미 누적되어 있다. 한 증상을 고칠 때 다른 DOM 형태의 caret·selection·legacy rendering이 깨질 가능성이 높다.

권장 방향은 다음과 같다.

1. 먼저 P0 회귀 테스트와 데이터 손실 방지 패치를 적용한다.
2. 메모 편집 lifecycle을 독립 모듈로 분리한다.
3. canonical block schema와 transaction API를 도입한다.
4. 하나의 공유 active editor와 toolbar 구조로 전환한다.
5. editor history, canvas history, persistence를 서로 다른 책임으로 분리한다.

이 순서를 따르면 단순히 현재 버그를 줄이는 것을 넘어 다음 효과를 얻을 수 있다.

- 한글 입력과 빠른 노드 전환의 예측 가능성
- 저장·undo에 대한 사용자 신뢰 회복
- paste source에 따른 예외 감소
- 긴 메모와 큰 캔버스에서의 입력 성능 향상
- 서식 기능 추가 시 회귀 범위 축소
- 디자인과 접근성을 개선할 수 있는 명확한 편집 상태 모델 확보

핵심 성공 기준은 “사용자가 편집 중 본 내용이 그대로 저장되고, undo와 재로드 후에도 같은 구조로 돌아오는가”이다. 이 불변식을 편집기의 최상위 품질 기준으로 삼아야 한다.
