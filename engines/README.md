# engines/ — 이 앱에 그대로 들어 있는 독립 모듈 2개

`apps/influencer-campaign-board/`를 폴더째 복사하면 이 두 파일도 함께 가서 바로 동작합니다.
빌드·번들러·npm 설치가 필요 없는 의존성 0의 UMD 모듈이라, 정적 서버에서 `<script>` 두 줄만 넣으면 됩니다.
(브라우저는 `window.CopyPsych` · `window.AiBridge`, node는 `require()`)

| 파일 | 역할 | 크기 |
| --- | --- | --- |
| `copy-psych-engine.js` | 8대 심리 트리거 진단, PAS·BAB·AIDA·4U 생성, 추상어·공급자어 탐지·교정 | ~54KB |
| `ai-bridge.js` | ChatGPT·Claude·Gemini 새 창 링크, AI 답변 분리, Gemini API 요청/응답 | ~16KB |

두 파일 모두 **공용 사본을 그대로** 넣었습니다. `copy-psych-engine.js`는 `packages/copy-psych-engine.js`와
바이트 단위로 같은 파일이고(단위 테스트가 검사), `ai-bridge.js`는 다른 앱(`blog-seo-studio`)과 같은 모듈입니다.
공용 엔진을 고치면 이 파일도 함께 복사해 주세요.

```html
<script src="engines/copy-psych-engine.js"></script>
<script src="engines/ai-bridge.js"></script>
<script src="core.js"></script>
```

이 앱에서의 쓰임은 `app.js`와 `core.js`가 나눠 맡습니다.

- `core.js` — 체험단용 가중치(`PSYCH_GROUPS` 42/43/15, `PSYCH_WEIGHTS`), `psychProfile()`, `wordFixGroups()`,
  `introDefaults()`, `buildReport()`, `buildAiPrompt()`, `parseAiAnswer()`, `auditNumbers()`
- `app.js` — 화면 렌더링, 문서별 AI 적용본, 클립보드·새 창, Gemini 호출

## 1. 8대 트리거 (가중치 합 100)

| id | 이름 | 가중치 | 보는 신호 |
| --- | --- | --- | --- |
| `loss` | 손실 회피 | 15 | 놓치면·그대로 두면·되돌릴 수 없음 |
| `anchor` | 구체적 숫자 | 13 | 단위 숫자, 정가→판가, 배수, 시간 약속 |
| `curiosity` | 호기심 갭 | 8 | 질문, 왜, 아무도 모르는, 알고 보니 |
| `interrupt` | 인지 반전 | 7 | ~하지 마세요, 반대로, 상식 깨기 |
| `social` | 사회적 증거 | 16 | 후기, N명 선택, 재구매, 평점 |
| `scarcity` | 희소성·기한 | 15 | 한정, 선착순, 마감, 잔여 |
| `authority` | 권위·실측 | 14 | 실측, 데이터, 인증, 직접 써봄 |
| `cta` | 초저마찰 CTA | 12 | 클릭, 무료, 3초, 가입 없이 |

체험단 공고는 판매 페이지가 아니라 **지원 결정** 페이지라서, 기본 엔진 가중치 대신
지원(42: 희소성·손실·CTA) · 신뢰(43: 사회적 증거·권위·숫자) · 관심(15: 호기심·반전)로 다시 묶습니다.

## 2. 프레임워크 4종

```js
const CP = window.CopyPsych;
const out = CP.build('PAS', {
  product: '비건 수분 선크림 50ml',
  target: '인스타·블로그 크리에이터',
  problem: '사기 전에 내게 맞는지 알 수 없어 망설이는 것',
  solution: '제품을 먼저 받아 써 보고, 쓴 그대로를 후기로 남기는 것',
  proof: '모집 10명 · 인당 혜택 89,000원 상당',
  cta: '신청서 보내기',
  urgency: '2026.11.28(토) 23:59 마감'
});
out.title; out.sections; out.body; out.psych;
```

- `PAS`(문제·자극·해결) · `BAB`(이전·이후·다리) · `AIDA`(주의·흥미·욕구·행동) · `4U`(유용·긴급·독특·구체)
- 입력이 비어도 기본값으로 완성되고, `generateAll(input)`은 4종 + 비교표 + `best` + 추천을 돌려줍니다.
- 한국어 조사(은/는, 이/가, 을/를, 으로/로)를 받침으로 자동 선택합니다.

## 3. 추상어·공급자어 교정

```js
CP.detect(text);   // { friction, issues, groups }  규칙 30여 개
CP.correct(text);  // { text, applied, before, after, improved }
```

`correct()`는 **문법·군더더기만** 바꿉니다(`매우 ` 삭제, `저희는 … 제공합니다` → `지금 바로 받아보세요`).
`최고의`, `다양한`, `100%`처럼 사실을 새로 만들어야 하는 표현은 자동 치환하지 않고 대안만 제시합니다.
이 앱의 **[안전 치환 적용]** 이 `correct()`를 호출하고, 문서 아래 **[되돌리기]** 로 되돌립니다.

## 4. AI 브리지

```js
const B = window.AiBridge;
B.linkFor('chatgpt', prompt);  // { url:'https://chatgpt.com/?q=…', prefilled:true|false, note }
B.linkFor('claude', prompt);   // { url:'https://claude.ai/new?q=…' }
B.linkFor('gemini', prompt);   // { url:'https://gemini.google.com/app', prefilled:false }
```

- ChatGPT·Claude는 주소의 `q` 파라미터로 입력창을 채우지만 공식 보장 기능이 아닙니다.
  이 앱의 프롬프트(3,000~4,500자)는 주소 한도를 넘어 **붙여넣기 모드**로 안내하고, 버튼은 항상 클립보드에도 복사합니다.
- ```js
  const req = B.buildGeminiRequest({ apiKey, model, prompt });
  const res = await fetch(req.url, req.init);
  const out = B.parseGeminiResponse(await res.json());
  ```
  키는 주소의 `key` 파라미터로만 나가고(Authorization 헤더 없음), 이 브라우저(localStorage)에만 저장됩니다.
  키가 비어 있으면 앱은 외부 요청을 **한 건도** 보내지 않습니다.

이 앱이 프롬프트를 만드는 코드는 `core.js`의 `buildAiPrompt({ mode:'brief'|'report', … })`입니다.

- 지원자 이름·핸들은 기본적으로 `지원자 A` / `@creator_a`로 익명 처리하고, **메모·리뷰 링크는 어떤 경우에도 넣지 않습니다.**
- `auditNumbers(answer, source)`가 AI 답변의 숫자 중 원본 데이터에 없는 값을 찾아 경고합니다.
- `parseAiAnswer(raw, mode)`가 ```코드블록```·`공고문:`·`리포트:` 머리말을 걷어내고, 대가성 문구·개인정보 안내·최상급 표현 누락을 점검합니다.

## 키·개인정보

이 폴더의 두 파일에는 **API 키도, 실제 지원자 정보도 들어 있지 않습니다**(단위 테스트가 검사합니다).
키는 사용자가 화면에서 넣는 값이며 저장소에 커밋되지 않습니다.
