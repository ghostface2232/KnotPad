# Tiptap v3 에디터 교체 검토 보고서

> KnotPad 메모(노트) 기능 내부를 Tiptap v3 에디터로 교체 가능한지에 대한 기술 검토

## 1. 현재 메모 에디터 구조

KnotPad의 메모는 **네이티브 `contenteditable`** 기반으로 동작합니다:

| 영역 | 현재 구현 |
|------|-----------|
| 편집 | `contenteditable="true"` on `.memo-body` div |
| 서식 | `document.execCommand()` (bold, italic, strikethrough, underline) |
| 단락 | 커스텀 `<div data-knotpad-paragraph="true">` 블록 |
| 헤딩 | H1/H2/H3 순환 토글 (`toggleHeading()`) |
| 정렬 | 블록별 inline `style.textAlign` |
| 리스트 | Enter 시 자동 마커 연속 (커스텀 구현) |
| 붙여넣기 | 허용 태그 화이트리스트 기반 sanitizer |
| 저장 형식 | HTML 문자열 (`item.content`) |
| Undo/Redo | 캔버스 전체 상태 스냅샷 (에디터 레벨 아님) |

**핵심 파일**: `items.js` (~600줄의 메모 관련 코드), `events.js` (단축키), `ui.js` (검색, 설정)

## 2. 빌드 시스템 현황

KnotPad은 **완전 빌드리스** 구조입니다:
- package.json 없음, node_modules 없음
- 네이티브 ES 모듈 (`<script type="module">`)로 직접 로딩
- Service Worker가 모든 JS 파일을 명시적으로 캐싱

**Tiptap v3는 CDN(esm.sh)을 통해 빌드 없이 사용 가능**합니다:
```javascript
import { Editor } from 'https://esm.sh/@tiptap/core'
import StarterKit from 'https://esm.sh/@tiptap/starter-kit'
```

## 3. 교체 가능성 판단: 가능하지만 영향 범위가 넓음

### 가능한 이유
- Tiptap v3는 Vanilla JS를 공식 지원
- CDN(esm.sh) 경유로 빌드 시스템 없이 도입 가능
- 메모만 `contenteditable` 사용 → 교체 범위가 메모 내부로 한정 가능
- Tiptap의 ProseMirror 기반 구조가 현재 커스텀 구현보다 안정적

### 주의가 필요한 영역

| 영역 | 난이도 | 설명 |
|------|--------|------|
| **HTML 저장 포맷 호환** | 높음 | `<div data-knotpad-paragraph="true">` 커스텀 구조를 Tiptap 스키마로 매핑 필요. 기존 노트 마이그레이션 필수 |
| **붙여넣기 파이프라인** | 높음 | `sanitizeClipboardHtml()`, `getMemoHtmlFromClipboardData()` 등 600줄+ 커스텀 로직 → Tiptap의 `InputRule`/`PasteRule`로 재구현 |
| **Undo/Redo 이중화** | 중간 | Tiptap 자체 히스토리 vs 캔버스 전체 상태 스냅샷 간 충돌 해결 필요 |
| **플로팅 툴바** | 중간 | 현재 커스텀 위치 계산 로직 → Tiptap의 `FloatingMenu`/`BubbleMenu`로 교체 |
| **리스트 자동 연속** | 낮음 | Tiptap의 `ListItem` 익스텐션이 기본 지원 |
| **폰트 크기/정렬** | 낮음 | Tiptap 커스텀 익스텐션으로 구현 가능 |
| **검색** | 낮음 | `editor.getText()` 또는 `editor.getHTML()`로 대체 |
| **오프라인/SW** | 중간 | esm.sh CDN 의존 → 오프라인 시 로딩 실패 가능. SW에서 Tiptap 번들도 캐싱 필요 |

## 4. 교체 계획 (단계별)

### Phase 1: 기반 준비
1. Tiptap v3 CDN 임포트 추가 및 SW 캐시 전략 수립 (esm.sh 번들 캐싱)
2. Tiptap 커스텀 스키마 정의: `KnotpadParagraph` 노드 (data-knotpad-paragraph 호환)
3. HTML 직렬화/역직렬화 어댑터 작성 (기존 `item.content` ↔ Tiptap JSON)

### Phase 2: 에디터 교체
4. `items.js`의 `createItem()` 메모 분기에서 `contenteditable` 대신 Tiptap `Editor` 인스턴스 마운트
5. 서식 툴바를 Tiptap `BubbleMenu`로 교체
6. 단축키 핸들러 이관 (Ctrl+B/I/D/H → Tiptap commands)
7. 붙여넣기 핸들러를 Tiptap `PasteRule`/`clipboardTextSerializer`로 이관

### Phase 3: 상태 통합
8. Undo/Redo 전략 결정: Tiptap 내부 히스토리 사용 + 캔버스 레벨 상태 스냅샷에서 메모 content 동기화
9. `setupItemEvents()`의 메모 관련 이벤트 핸들러 정리 (input, focus, blur, keydown 등)
10. 기존 노트 데이터 마이그레이션 함수 작성 (레거시 HTML → Tiptap 호환 HTML)

### Phase 4: 검증
11. 기존 노트 렌더링 호환성 테스트
12. 오프라인 동작 검증
13. 성능 비교 (다수 메모 동시 렌더링 시)

## 5. 리스크 요약

| 리스크 | 심각도 | 완화 방안 |
|--------|--------|-----------|
| 기존 노트 깨짐 | 높음 | 마이그레이션 함수 + fallback 렌더러 |
| 오프라인 실패 | 높음 | SW에서 esm.sh 응답 캐싱, 또는 셀프호스트 번들 |
| 번들 크기 증가 | 중간 | StarterKit 기본 ~200KB gzip. 필요한 익스텐션만 선택 로딩 |
| `execCommand` 의존 제거 | 낮음 | Tiptap이 완전 대체 |

## 6. 결론

**기술적으로 교체 가능**합니다. 가장 큰 과제는:
1. 기존 HTML 저장 포맷과의 호환성 유지
2. 오프라인 PWA에서의 CDN 의존성 해결

빌드 시스템 도입 없이 esm.sh CDN + SW 캐싱으로 진행할 수 있지만, 안정성을 위해서는 Tiptap 번들을 로컬에 셀프호스트하는 것이 더 나은 선택일 수 있습니다.

## 참고 자료
- [Tiptap CDN Docs](https://tiptap.dev/docs/editor/getting-started/install/cdn)
- [Tiptap Vanilla JS](https://tiptap.dev/docs/editor/getting-started/install/vanilla-javascript)
- [Tiptap v3 Announcement](https://tiptap.dev/tiptap-editor-v3)
- [Tiptap 2026 Roadmap](https://tiptap.dev/blog/release-notes/our-roadmap-for-2026)
