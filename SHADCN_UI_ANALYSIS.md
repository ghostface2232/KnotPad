# UI 라이브러리 적용 가능성 분석 보고서

> **분석 일자**: 2026-03-09
> **대상 프로젝트**: KnotPad (Vanilla JS 기반 무한 캔버스 노트앱)
> **분석 대상**: shadcn/ui, Web Awesome

---

## 1. 현재 프로젝트 현황

| 항목 | 현재 상태 |
|------|-----------|
| 프레임워크 | 없음 (Vanilla JS, ES6 Modules) |
| 빌드 시스템 | 없음 (정적 파일 직접 서빙) |
| 의존성 | 없음 (package.json 자체가 없음) |
| CSS | 순수 CSS (2,085줄), CSS 변수 기반 테마 |
| JS | 11개 모듈, 약 9,500줄 |
| UI 컴포넌트 | 95개 이상의 고유 UI 요소 |
| 배포 방식 | 정적 파일 서빙, PWA (Service Worker) |

---

## 2. shadcn/ui 필수 전제 조건

shadcn/ui는 독립 라이브러리가 아니라 다음 스택 위에서만 동작하는 컴포넌트 컬렉션입니다:

| 필수 의존성 | 역할 | KnotPad 현재 상태 |
|------------|------|-------------------|
| **React** (또는 Next.js 등) | UI 렌더링 프레임워크 | 없음 |
| **Radix UI** | 접근성 기반 헤드리스 컴포넌트 | 없음 |
| **Tailwind CSS** | 유틸리티 CSS 프레임워크 | 없음 |
| **빌드 시스템** (Vite, webpack 등) | 번들링/트랜스파일 | 없음 |
| **TypeScript** (권장) | 타입 안전성 | 없음 |

---

## 3. 난이도 평가: 매우 높음 (전면 재작성 수준)

### 3.1 인프라 구축 (대규모)
- package.json, Vite/webpack 등 빌드 시스템 도입
- React 설치 및 설정
- Tailwind CSS 설정
- shadcn/ui CLI로 컴포넌트 설치

### 3.2 아키텍처 전환 (핵심 난제)
- 전체 HTML → JSX/React 컴포넌트로 변환 (index.html 50.8KB 분량)
- Proxy 기반 상태 관리 → React 상태 관리 (useState, Context, Zustand 등)로 전환
- 명령형 DOM 조작 → 선언형 렌더링으로 패러다임 전환
- 이벤트 버스 → React 패턴 (props, context, 커스텀 훅)으로 교체

### 3.3 UI 컴포넌트 마이그레이션
- 모달 4종 → shadcn Dialog
- 컨텍스트 메뉴 4종 → shadcn ContextMenu
- 드롭다운 → shadcn DropdownMenu
- 사이드바 → shadcn Sidebar/Sheet
- 토스트 → shadcn Toast
- 버튼/입력 등 → shadcn Button/Input

---

## 4. 구현이 불가능하거나 매우 어려운 부분

| 영역 | 이유 |
|------|------|
| **캔버스 무한 스크롤/줌/팬** | shadcn/ui에 해당 컴포넌트 없음. 커스텀 구현 필수. React에서 고성능 캔버스 조작은 오히려 복잡해질 수 있음 |
| **SVG 커넥션 라인** | 커넥션, 화살표, 곡선 경로 등은 shadcn 범위 밖. 직접 SVG 관리 필요 |
| **드래그 앤 드롭 노드 조작** | 현재 네이티브 이벤트로 정밀 제어 중. React에서 동일 성능 보장이 어려움 |
| **Service Worker / PWA** | 프레임워크와 무관하지만 빌드 파이프라인 변경 시 캐시 전략 재설계 필요 |
| **IndexedDB 미디어 저장** | 프레임워크와 무관하지만 React 라이프사이클과의 통합 필요 |
| **File System Access API** | 브라우저 API 직접 호출이므로 프레임워크 전환과 무관하나 래핑 필요 |

---

## 5. 장점

| 장점 | 설명 |
|------|------|
| **디자인 일관성** | shadcn/ui의 통일된 디자인 시스템 (색상, 간격, 타이포그래피) |
| **접근성(a11y)** | Radix UI 기반으로 키보드 네비게이션, 스크린리더, ARIA 자동 지원 |
| **다크/라이트 테마** | Tailwind + CSS 변수 기반 테마 시스템이 기본 제공 |
| **컴포넌트 품질** | 모달, 드롭다운, 컨텍스트 메뉴 등이 엣지 케이스까지 처리됨 |
| **생태계** | React 생태계의 풍부한 라이브러리 활용 가능 |
| **유지보수성** | 컴포넌트 단위 코드 분리, 재사용성 향상 |

---

## 6. 단점

| 단점 | 설명 |
|------|------|
| **전면 재작성 필수** | 점진적 마이그레이션이 사실상 불가. React 없이 shadcn/ui를 쓸 수 없음 |
| **번들 크기 급증** | 현재 0KB 의존성 → React(~40KB) + Radix + Tailwind 등 수백KB 추가 |
| **성능 리스크** | 캔버스 위 수백 개 노드를 React로 렌더링 시 가상 DOM 오버헤드 발생 가능 |
| **빌드 복잡성** | 현재 빌드 없이 바로 서빙 가능한 단순함을 잃음 |
| **PWA 재설계** | sw.js 캐시 전략을 빌드 출력물 기준으로 전면 재설계 필요 |
| **작업량** | 9,500줄+ JS + 2,085줄 CSS + 50KB HTML을 모두 React로 전환 (수주~수개월) |
| **기존 기능 회귀 위험** | 재작성 과정에서 미묘한 동작 차이, 버그 유입 가능성 높음 |

---

## 7. 대안 제안

| 대안 | 설명 | 난이도 |
|------|------|--------|
| **shadcn/ui 디자인 토큰만 차용** | 색상, 간격, 라운딩 등 CSS 변수를 shadcn 스타일로 통일. React 없이 가능 | 낮음 |
| **Tailwind CSS만 도입** | 빌드 시스템(Vite) 추가 + Tailwind로 CSS 리팩터링. React 불필요 | 중간 |
| **현재 CSS 변수 기반 디자인 시스템 정비** | 기존 CSS 변수를 체계화하고 일관성 있는 디자인 토큰으로 재정리 | 낮음 |
| **Web Awesome (권장)** | Web Components 기반, 프레임워크 무관, CDN 즉시 사용 가능 | 중간~낮음 |

---

## 8. shadcn/ui 결론

shadcn/ui를 KnotPad에 적용하는 것은 기술적으로는 가능하지만, 실질적으로는 **프로젝트 전체를 React로 재작성하는 것과 동일**합니다. 현재 프로젝트는 의존성 0, 빌드 0의 순수 바닐라 JS 아키텍처인데, shadcn/ui는 React + Radix + Tailwind라는 완전히 다른 스택을 전제합니다.

---

# Part 2: Web Awesome 적용 가능성 분석

## 9. Web Awesome 개요

[Web Awesome](https://webawesome.com/)은 [Shoelace](https://shoelace.style/)의 후속작으로, Font Awesome 팀이 개발한 **Web Components 기반 UI 컴포넌트 라이브러리**입니다.

### 핵심 특성
- **프레임워크 무관**: React, Vue, Svelte뿐 아니라 순수 HTML/CSS/JS에서도 동작
- **빌드 불필요**: CDN `<link>` + `<script>` 2줄로 즉시 사용 가능
- **W3C 표준**: Web Components 표준 기반, 모든 주요 브라우저 지원
- **50+ Free 컴포넌트**: MIT 라이선스, 핵심 컴포넌트 무료
- **11종 테마**: 라이트/다크 모드 포함, 9종 컬러 팔레트

---

## 10. shadcn/ui vs Web Awesome 비교

| 항목 | shadcn/ui | Web Awesome |
|------|-----------|-------------|
| 필수 의존성 | React + Radix + Tailwind | **없음** (순수 HTML/CSS/JS) |
| 빌드 시스템 | 필수 | **불필요** (CDN 가능) |
| 설치 방법 | npm + CLI | **CDN 2줄** |
| 컴포넌트 방식 | JSX React 컴포넌트 | **Web Components (커스텀 HTML 요소)** |
| 프레임워크 락인 | React 전용 | 프레임워크 무관 |
| KnotPad 호환성 | **불가** (전면 재작성) | **호환** (점진적 도입 가능) |
| 마이그레이션 난이도 | 매우 높음 | **중간~낮음** |

---

## 11. KnotPad에 Web Awesome 적용 시 난이도: 중간~낮음

### 도입이 쉬운 이유

1. **빌드 시스템 불필요** — CDN에서 `<link>`와 `<script>` 2줄만 추가
2. **점진적 마이그레이션 가능** — 기존 HTML 요소를 하나씩 `<wa-*>` 컴포넌트로 교체
3. **Vanilla JS 완벽 호환** — 어댑터, 래퍼 없이 네이티브 HTML 요소처럼 사용
4. **이벤트 시스템 호환** — `wa-*` 커스텀 이벤트를 기존 이벤트 버스에 연결 가능
5. **아키텍처 변경 없음** — state.js, events-bus.js 등 기존 코드 그대로 유지

### 마이그레이션 예시

```html
<!-- 기존 KnotPad -->
<button id="addMemoBtn" class="toolbar-btn">메모</button>

<!-- Web Awesome 적용 후 -->
<wa-button id="addMemoBtn" variant="default" size="small">메모</wa-button>
```

```html
<!-- 기존 모달 -->
<div class="modal" id="linkModal">...</div>

<!-- Web Awesome 적용 후 -->
<wa-dialog id="linkModal" label="링크 추가">...</wa-dialog>
```

---

## 12. 컴포넌트 매핑 (KnotPad UI → Web Awesome)

| KnotPad 현재 UI | Web Awesome 컴포넌트 | Free/Pro | 난이도 |
|-----------------|---------------------|----------|--------|
| 툴바 버튼들 | `<wa-button>`, `<wa-button-group>` | Free | 낮음 |
| 설정/링크 모달 | `<wa-dialog>` | Free | 낮음 |
| 컬러 피커 드롭다운 | `<wa-dropdown>` + `<wa-color-picker>` | Free | 낮음 |
| 사이드바 | `<wa-drawer>` | Free | 중간 |
| 캔버스 리스트 (트리) | `<wa-tree>`, `<wa-tree-item>` | Free | 중간 |
| 컨텍스트 메뉴 | `<wa-dropdown>` (커스텀 트리거) | Free | 중간 |
| 토스트 알림 | `<wa-alert>` (toast 패턴) | Free | 낮음 |
| 검색바 | `<wa-input>` (검색 아이콘) | Free | 낮음 |
| 설정 탭 | `<wa-tab-group>`, `<wa-tab>` | Free | 낮음 |
| 스위치/체크박스 | `<wa-switch>`, `<wa-checkbox>` | Free | 낮음 |
| 줌 슬라이더 | `<wa-range>` | Free | 낮음 |
| 사이드바 리사이즈 | `<wa-split-panel>` | Free | 중간 |
| 툴팁 | `<wa-tooltip>` | Free | 낮음 |

---

## 13. Web Awesome 범위 밖인 부분 (커스텀 유지 필요)

| 영역 | 이유 |
|------|------|
| **캔버스 줌/팬/무한 스크롤** | Web Awesome에 해당 컴포넌트 없음 |
| **SVG 커넥션 라인/화살표** | 순수 SVG 조작, UI 라이브러리 범위 밖 |
| **드래그 앤 드롭 노드** | 캔버스 위 아이템 조작은 커스텀 유지 |
| **미니맵** | 커스텀 구현 유지 |
| **메모 마크다운 에디터** | 커스텀 유지 (contenteditable) |

> 이 부분들은 shadcn/ui를 쓰든 Web Awesome을 쓰든 어차피 커스텀 구현이 필요한 영역입니다.

---

## 14. Web Awesome 장점

| 장점 | 설명 |
|------|------|
| **점진적 도입** | 한 번에 전부 바꿀 필요 없음. 버튼부터 시작 가능 |
| **빌드 불필요** | CDN 2줄로 시작. 현재 아키텍처 유지 |
| **아키텍처 변경 없음** | state.js, events-bus.js 등 기존 코드 그대로 |
| **접근성(a11y)** | 키보드 네비게이션, ARIA, 포커스 관리 내장 |
| **테마 시스템** | 11종 테마 + 라이트/다크 모드 기본 제공 |
| **디자인 일관성** | 통일된 디자인 토큰 (색상, 간격, 타이포) |
| **50+ Free 컴포넌트** | 핵심 UI 컴포넌트 대부분 무료 (MIT) |
| **W3C 표준** | Web Components 표준 기반, 장기적 안정성 보장 |
| **Font Awesome 통합** | 아이콘 시스템과 자연스럽게 통합 |

---

## 15. Web Awesome 단점 / 고려사항

| 단점 | 설명 |
|------|------|
| **CSS 이중 관리** | 캔버스 아이템은 기존 CSS, UI 크롬은 Web Awesome — 두 스타일 시스템 공존 |
| **번들 크기 증가** | CDN 로드 시 추가 네트워크 비용 (오프라인 시 sw.js 캐시 필요) |
| **Shadow DOM 커스터마이징** | 내부 스타일링이 CSS Parts/Variables로 제한됨 |
| **컨텍스트 메뉴** | 네이티브 우클릭 컨텍스트 메뉴가 별도 컴포넌트로 제공되지 않아 커스텀 필요 |
| **Pro 유혹** | Data Grid, Charts, Theme Builder 등 고급 기능은 유료 (~$120/년) |
| **sw.js 업데이트 필요** | CDN 리소스를 Service Worker 캐시 전략에 추가해야 함 |
| **학습 곡선** | Shadow DOM, CSS Parts, 슬롯 등 Web Components 개념 이해 필요 |

---

## 16. 권장 마이그레이션 단계

1. **Phase 1** — CDN 추가 + 버튼/입력 필드 교체 (1~2일)
2. **Phase 2** — 모달을 `<wa-dialog>`로 전환 (1~2일)
3. **Phase 3** — 사이드바, 탭, 트리 교체 (2~3일)
4. **Phase 4** — 테마 시스템 통합 (기존 CSS 변수 → WA 테마) (2~3일)
5. **Phase 5** — 기존 커스텀 CSS 정리 및 일관성 마무리 (1~2일)

---

## 17. 최종 결론

| 옵션 | 적합성 | 이유 |
|------|--------|------|
| **shadcn/ui** | 부적합 | 전면 재작성 필수 (React + 빌드 시스템 도입) |
| **Web Awesome** | **적합 (권장)** | 현재 아키텍처 유지, 점진적 도입, 빌드 불필요 |

**Web Awesome은 KnotPad에 매우 적합한 선택입니다.** shadcn/ui가 "전면 재작성"을 요구하는 반면, Web Awesome은 현재 바닐라 JS 아키텍처를 그대로 유지하면서 점진적으로 도입할 수 있습니다. 캔버스 핵심 기능(줌, 팬, 노드, 커넥션)은 어차피 커스텀 유지해야 하므로, **UI 크롬(툴바, 모달, 사이드바 등)만 Web Awesome으로 교체**하는 것이 가장 효과적입니다.
