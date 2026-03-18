# ProseMirror 패턴 기반 메모 에디터 개선 계획

> Tiptap/ProseMirror를 통째로 도입하지 않고, 아키텍처 패턴만 차용하여 현재 contenteditable 코드를 개선하는 방안

## 1. 현재 코드 문제점 분석

### items.js 핵심 문제

| 문제 | 위치 | 심각도 |
|------|------|--------|
| HTML 정규화 다단계 파이프라인 | `normalizeMemoHtml()` 957-1009 | 높음 |
| Selection/Range 수동 조작 (20곳+) | `insertParagraphBreakAtSelection()` 등 633-804 | 높음 |
| 타이머 기반 Undo 동기화 | input/blur 핸들러 1579-1730 | 중간 |
| 750줄 `setupItemEvents()` 메가 함수 | 1420-2170 | 높음 |
| 3단계 붙여넣기 fallback | paste 핸들러 1903-1942 | 중간 |
| `execCommand` deprecated API 의존 | bold/italic/heading | 중간 |
| 브라우저 quirk 워크어라운드 산재 | 전체 | 중간 |

### 문제의 근본 원인

ProseMirror가 해결한 것과 동일한 문제:
- **DOM이 곧 상태** → 정규화/검증 반복 필요
- **명령형 DOM 조작** → 브라우저마다 다른 결과
- **이벤트 핸들러 집중** → 유지보수 불가

## 2. 차용할 ProseMirror 패턴 5가지

### 패턴 ①: Document Model (경량 문서 모델)

**현재**: `item.content`가 raw HTML 문자열 → 매번 DOM 파싱/정규화

**개선**:
```javascript
class MemoDocument {
  constructor(blocks = []) { this.blocks = blocks; }
  static fromHTML(html) { /* 1회 파싱 */ }
  toHTML() { /* 1회 직렬화 */ }
}

// 블록 구조
{ type: 'paragraph', marks: ['bold'], text: '내용', align: 'left' }
{ type: 'heading', level: 2, text: '제목' }
{ type: 'list', ordered: true, items: [...] }
```

**제거 가능한 코드**: `normalizeMemoHtml()`, `convertTopLevelLegacyBreaksToParagraphs()` 등 정규화 파이프라인

### 패턴 ②: Command 패턴 (서식 적용)

**현재**: `document.execCommand('bold')` + 잔여 스타일 수동 정리

**개선**:
```javascript
const commands = {
  toggleBold(editor) {
    const sel = editor.getSelection();
    sel.hasMark('bold') ? editor.removeMark('bold', sel) : editor.addMark('bold', sel);
  },
  toggleHeading(editor, level) {
    const block = editor.getBlockAtCursor();
    block.type = block.type === 'heading' ? 'paragraph' : 'heading';
    editor.updateBlock(block);
  }
};
```

**제거 가능한 코드**: `execCommand` 호출, `toggleHeading()` 잔여 스타일 정리(2560-2579)

### 패턴 ③: Transaction 기반 Undo/Redo

**현재**: 타이머 debounce + `contentBeforeEdit` 플래그 + 전체 캔버스 스냅샷

**개선**:
```javascript
class MemoTransaction {
  constructor(before, after, itemId) {
    this.before = before;   // MemoDocument snapshot
    this.after = after;
    this.itemId = itemId;
  }
  invert() { return new MemoTransaction(this.after, this.before, this.itemId); }
}
```

**제거 가능한 코드**: 타이머 debounce 로직, `hasUnsavedChanges` 플래그

### 패턴 ④: Plugin 분리 (이벤트 핸들러)

**현재**: `setupItemEvents()` 750줄에 모든 로직 혼재

**개선**:
```javascript
const memoPlugins = [
  formattingPlugin,    // bold/italic/heading 툴바
  listPlugin,          // 리스트 자동 연속
  paragraphPlugin,     // Enter → 단락 분할
  pastePlugin,         // 붙여넣기 처리
  selectionPlugin,     // 선택 상태 + 툴바 위치
];

function setupMemoEditor(item, memoBody) {
  const editor = new MemoEditor(memoBody, item);
  memoPlugins.forEach(p => p.attach(editor));
  return editor;
}
```

### 패턴 ⑤: 단일 Paste Parser

**현재**: 3단계 fallback + 각 단계에서 재정규화

**개선**:
```javascript
function parsePaste(clipboardData) {
  const internal = clipboardData.getData('application/x-knotpad-memo');
  if (internal) return MemoDocument.fromHTML(internal);

  const html = clipboardData.getData('text/html');
  if (html && isSemanticHtml(html)) return MemoDocument.fromHTML(sanitize(html));

  return MemoDocument.fromPlainText(clipboardData.getData('text/plain'));
}
// 결과: 항상 MemoDocument → DOM 반영 1회
```

## 3. 난이도 vs 효과 매트릭스

| 패턴 | 난이도 | 효과 | 영향 범위 | 기존 데이터 호환 |
|------|--------|------|-----------|----------------|
| ① Document Model | 높음 | 매우 높음 | items.js 전체 | 마이그레이션 필요 |
| ② Command 패턴 | 중간 | 높음 | 서식 관련만 | 호환 |
| ③ Transaction Undo | 중간 | 중간 | undo/redo만 | 호환 |
| ④ Plugin 분리 | 중간 | 높음 | setupItemEvents | 호환 |
| ⑤ Paste Parser | 낮음 | 중간 | paste만 | 호환 |

## 4. 권장 구현 순서

### Phase 1: 낮은 리스크 개선 (기존 데이터 100% 호환)
1. **⑤ Paste Parser 통합** — paste fallback 로직을 단일 파서로 정리
2. **④ setupItemEvents 플러그인 분리** — 750줄 메가함수를 기능별 모듈로 분할

### Phase 2: 중간 리스크 개선
3. **② Command 패턴 도입** — `execCommand` 제거, 커스텀 서식 커맨드
4. **③ Transaction Undo** — 메모 레벨 정밀 undo/redo

### Phase 3: 구조적 전환 (마이그레이션 필요)
5. **① Document Model** — 경량 문서 모델 도입, 정규화 코드 제거

### 점진적 vs 일괄 전환

- **점진적 (⑤→④→②→③→①)**: 각 단계에서 기존 데이터 호환 유지, 리스크 분산
- **일괄 (①부터)**: ①을 하면 나머지가 자연스럽게 따라오지만 리스크 집중

**권장: 점진적 접근** — KnotPad은 사용자 데이터가 localStorage/IndexedDB에 있으므로 호환성 유지가 중요

## 5. 참고: ProseMirror에서 배운 핵심 원칙

| 원칙 | KnotPad 적용 |
|------|-------------|
| State가 source of truth (DOM이 아님) | MemoDocument 모델 도입 |
| 변경은 Transaction으로 기록 | Undo/Redo 정밀화 |
| Schema가 구조를 보장 | 정규화 코드 제거 |
| Plugin으로 기능 분리 | setupItemEvents 분할 |
| 브라우저 입력을 관찰 후 정규화 | execCommand 탈피 |
