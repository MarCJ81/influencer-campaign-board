/* ============================================================
   체험단 매칭 보드 · app.js
   화면 렌더링 · localStorage · 드래그앤드롭 · CSV/JSON · 모달
   ============================================================ */
(function () {
  'use strict';

  const C = window.CORE;
  const D = window.DATA;
  const CP = window.CopyPsych || null;   // engines/copy-psych-engine.js
  const B = window.AiBridge || null;     // engines/ai-bridge.js
  const BE = window.BoardEngine || null; // engines/board-engine.js (SortableJS·Chart.js)
  const Pro = window.ProConnector || null; // engines/pro-api-connector.js (무료 AI 맛보기)
  const FREE_APP = 'influencer-campaign-board';
  const LS = {
    brief: 'amb.v1.brief',
    applicants: 'amb.v1.applicants',
    prefs: 'amb.v1.prefs',
    ai: 'amb.v1.ai',
  };

  const state = {
    brief: null,
    applicants: [],
    prefs: { theme: 'light', boardView: 'kanban', sort: 'due', cpm: C.DEFAULT_CPM, revenue: 0 },
    view: 'board',
    doc: 'posting',
    query: '',
    channel: 'all',
    due: 'all',
    built: null,
    csvRows: [],
    csvErrors: [],
    /* 카피 심리학 · 도입부 · AI */
    psych: null,
    introFw: 'PAS',
    intro: { problem: '', solution: '', proof: '' },
    introBuilt: null,
    aiPrompts: { brief: null, report: null },
    geminiBusy: false,
    freeBusy: false,
    ai: {
      docs: { posting: '', dm: '', email: '', guide: '' },
      report: '',
      personal: false,
      geminiKey: '',
      geminiModel: B ? B.GEMINI_DEFAULT_MODEL : 'gemini-3.5-flash-lite',
    },
  };

  const DOCS = {
    posting: '모집 공고문', dm: '선정 안내 DM', email: '선정 안내 메일', guide: '가이드·대가성',
  };

  const BRIDGE = {
    brief: {
      box: '#aiPromptBox', btns: '#aiBridgeBtns', note: '#aiBridgeNote', len: '#aiPromptLen',
      personal: '#aiPersonal', answer: '#aiAnswer', meta: '#aiAnswerMeta',
      status: '#geminiStatus', key: '#geminiKey', model: '#geminiModel',
    },
    report: {
      box: '#repPromptBox', btns: '#repBridgeBtns', note: '#repBridgeNote', len: null,
      personal: '#repPersonal', answer: '#repAnswer', meta: '#repAnswerMeta',
      status: '#repGeminiStatus', key: '#repGeminiKey', model: '#repGeminiModel',
    },
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = C.escapeHtml;

  /* ── 저장소 ─────────────────────────────────────── */
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 공간 부족 */ }
  }

  function seedDemo(silent) {
    state.brief = C.normalizeBrief(D.demoBrief(new Date()));
    state.applicants = D.demoApplicants(new Date()).map((a) => C.normalizeApplicant(a));
    state.prefs = Object.assign({}, D.demoPrefs(), state.prefs || {});
    saveAll();
    if (!silent) toast('데모 캠페인과 지원자 12명을 불러왔습니다.');
  }

  function saveBrief() {
    writeJson(LS.brief, state.brief);
  }
  function saveApplicants() {
    writeJson(LS.applicants, state.applicants);
    renderReport();
  }

  /** 채널별 조회수·CPV 차트 (Chart.js). 채널이 1곳뿐이면 숨긴다. */
  function renderChannelChart(chans) {
    const panel = $('#chartPanel');
    const canvas = $('#channelChart');
    if (!panel) return;
    if (!BE || !BE.hasChart || !BE.drawChannelChart || !chans || chans.length < 2) {
      panel.hidden = true;
      if (BE && BE.destroy) BE.destroy('channelChart');
      return;
    }
    panel.hidden = false;
    const meta = $('#chartMeta');
    if (meta) meta.textContent = chans.length + '개 채널 · 막대 조회수 · 선 CPV';
    try {
      BE.drawChannelChart(canvas, chans.map((c) => ({ short: c.short, views: c.views, cpv: c.cpv, count: c.count })));
    } catch (e) {
      panel.hidden = true;
    }
  }
  function savePrefs() {
    writeJson(LS.prefs, state.prefs);
    renderReport();
  }
  function saveAi() {
    writeJson(LS.ai, {
      docs: state.ai.docs,
      report: state.ai.report,
      personal: state.ai.personal,
      geminiKey: state.ai.geminiKey,
      geminiModel: state.ai.geminiModel,
    });
  }
  function saveAll() {
    saveBrief();
    saveApplicants();
    savePrefs();
  }

  /* ── 테마 ───────────────────────────────────────── */
  function applyTheme() {
    const theme = state.prefs.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#080a0f' : '#ffffff');
    const btn = $('[data-action="toggle-theme"]');
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
  }

  function toast(message, kind) {
    const root = $('#toastRoot');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s ease, transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 260);
    }, 2400);
  }

  /* ── 탭/뷰 ──────────────────────────────────────── */
  function setView(view) {
    if (!['brief', 'board', 'stats'].includes(view)) view = 'board';
    state.view = view;
    ['brief', 'board', 'stats'].forEach((v) => {
      const section = $('#view-' + v);
      if (section) section.hidden = v !== view;
      const tab = $('.tab[data-tab="' + v + '"]');
      if (tab) {
        tab.classList.toggle('is-active', v === view);
        tab.setAttribute('aria-selected', v === view ? 'true' : 'false');
      }
    });
    if (view === 'brief') renderBrief();
    if (view === 'board') renderBoard();
    if (view === 'stats') renderStats();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ── 캠페인 스트립 ──────────────────────────────── */
  function renderCampaignBar() {
    const b = state.brief;
    const s = C.summarize(state.applicants, {
      productPrice: b.productPrice,
      cpm: state.prefs.cpm,
      revenue: state.prefs.revenue,
      headcount: b.headcount,
    });
    const plan = C.perPersonValue(b) * b.headcount;
    $('#cbName').textContent = C.campaignName(b);
    $('#cbMeta').textContent = (b.brand || '브랜드') + ' · ' + C.formatWon(b.productPrice) + ' · ' + b.headcount + '명 모집 · ' + b.channels.length + '개 채널';
    $('#cbCost').textContent = C.formatWonShort(s.cost);
    $('#cbPlan').textContent = C.formatWonShort(plan);
    const pct = plan > 0 ? Math.min(100, Math.round((s.cost / plan) * 100)) : 0;
    $('#cbMeter').style.width = pct + '%';
    $('#cbTag').textContent = b.brand === '샘플뷰티' ? '데모 캠페인' : '진행 캠페인';
    $('#tabBoardCount').textContent = state.applicants.length;
  }

  /* ── 공고 만들기 ────────────────────────────────── */
  const FORM_IDS = {
    brand: 'fBrand', product: 'fProduct', productPrice: 'fPrice', fee: 'fFee',
    headcount: 'fHeadcount', tags: 'fTags', mission: 'fMission', applyUntil: 'fApplyUntil',
    announceOn: 'fAnnounceOn', uploadDays: 'fUploadDays', contact: 'fContact', extra: 'fExtra',
  };

  function fillBriefForm() {
    const b = state.brief;
    Object.keys(FORM_IDS).forEach((key) => {
      const el = $('#' + FORM_IDS[key]);
      if (!el) return;
      if (key === 'tags') el.value = b.hashtags.join(' ');
      else el.value = b[key] === undefined || b[key] === null ? '' : b[key];
    });
    $$('#fChannels input[type="checkbox"]').forEach((input) => {
      const on = b.channels.includes(input.value);
      input.checked = on;
      const card = input.closest('.check-card');
      if (card) card.classList.toggle('is-on', on);
    });
  }

  function readBriefForm() {
    const val = (id) => {
      const el = $('#' + id);
      return el ? el.value : '';
    };
    const channels = $$('#fChannels input[type="checkbox"]').filter((i) => i.checked).map((i) => i.value);
    return C.normalizeBrief({
      brand: val('fBrand'),
      product: val('fProduct'),
      productPrice: val('fPrice'),
      fee: val('fFee'),
      headcount: val('fHeadcount'),
      channels: channels.length ? channels : ['instagram'],
      hashtags: val('fTags'),
      mission: val('fMission'),
      applyUntil: val('fApplyUntil'),
      announceOn: val('fAnnounceOn'),
      uploadDays: val('fUploadDays'),
      contact: val('fContact'),
      extra: val('fExtra'),
    });
  }

  function onBriefInput() {
    const next = readBriefForm();
    state.brief = next;
    saveBrief();
    renderCampaignBar();
    renderBriefOutput();
    $$('#fChannels input[type="checkbox"]').forEach((input) => {
      const card = input.closest('.check-card');
      if (card) card.classList.toggle('is-on', input.checked);
    });
  }

  function renderBrief() {
    fillBriefForm();
    renderBriefTotals();
    renderBriefOutput();
  }

  function renderBriefTotals() {
    const b = state.brief;
    const built = C.buildBrief(b);
    const el = $('#briefTotals');
    el.innerHTML =
      '<div class="stat"><b>' + C.formatWonShort(built.totals.perPerson) + '</b><span>인당 혜택가</span></div>' +
      '<div class="stat"><b>' + C.formatWonShort(built.totals.budget) + '</b><span>총 예산 ' + b.headcount + '명</span></div>' +
      '<div class="stat"><b>' + b.channels.length + '개</b><span>모집 채널</span></div>';
  }

  function baseDocText(built) {
    switch (state.doc) {
      case 'dm': return built.dm.text;
      case 'email': return built.email.text;
      case 'guide': return built.guide.text;
      case 'posting':
      default: return built.posting.text;
    }
  }

  /** 화면에 보여 줄 문서 — AI 적용본이 있으면 그것을, 없으면 자동 생성본을 쓴다. */
  function docText(built) {
    const b = built || state.built || C.buildBrief(state.brief);
    return state.ai.docs[state.doc] || baseDocText(b);
  }

  function hasOverride(doc) {
    return !!(state.ai.docs[doc || state.doc] || '').trim();
  }

  function renderBriefOutput() {
    const built = C.buildBrief(state.brief);
    state.built = built;
    const text = docText(built);
    $('#outBody').textContent = text;
    $('#outCount').textContent = text.length.toLocaleString('ko-KR') + '자';
    const badge = $('#outAiBadge');
    if (badge) badge.hidden = !hasOverride();

    const warn = $('#outWarnings');
    if (built.warnings.length) {
      warn.hidden = false;
      warn.innerHTML = built.warnings.map((w) =>
        '<p class="warn-line ' + w.level + '"><span class="wl-dot"></span><span>' + esc(w.text) + '</span></p>'
      ).join('');
    } else {
      warn.hidden = true;
      warn.innerHTML = '';
    }

    const b = state.brief;
    const foot = $('#outFoot');
    const doc = DOCS[state.doc] || '문서';
    if (state.doc === 'posting') {
      foot.innerHTML = '<span>인당 <b>' + C.formatWon(built.totals.perPerson) + '</b></span>' +
        '<span>총 예산 <b>' + C.formatWon(built.totals.budget) + '</b> (' + b.headcount + '명)</span>' +
        '<span>공고문 1개 + DM + 메일 + 가이드</span>';
    } else if (state.doc === 'dm') {
      foot.innerHTML = '<span>인스타·스레드 DM은 <b>1,000자 이내</b>가 읽기 좋습니다.</span><span>○○ 자리에 선정자 이름을 넣어 보내세요.</span>';
    } else if (state.doc === 'email') {
      foot.innerHTML = '<span>메일 제목까지 함께 복사됩니다.</span><span>회신 기한(3일)과 업로드 기한을 꼭 확인하세요.</span>';
    } else {
      foot.innerHTML = '<span>공정위 심사지침(2024.12.1 개정) 참고 예시</span><span>법률 자문이 아니므로 집행 전 최신 지침을 확인하세요.</span>';
    }
    if (hasOverride()) {
      foot.innerHTML += '<button type="button" class="btn btn-ghost btn-sm out-revert" data-action="revert-doc">' + doc + ' AI 적용본 되돌리기</button>';
    }
    renderBriefTotals();
    renderPsych();
    renderWordFix();
    renderIntro();
    renderBridge('brief');
  }

  /* ── 카피 심리학 8대 트리거 ──────────────────────── */
  function groupOfTrigger(id) {
    for (let i = 0; i < C.PSYCH_GROUPS.length; i++) {
      if (C.PSYCH_GROUPS[i].triggers.indexOf(id) >= 0) return C.PSYCH_GROUPS[i];
    }
    return null;
  }

  function renderPsych() {
    const total = $('#psychTotal');
    if (!total) return;
    const built = state.built || C.buildBrief(state.brief);
    const text = docText(built);
    const docEl = $('#psychDoc');
    if (docEl) docEl.textContent = (DOCS[state.doc] || '문서') + ' 기준 · ' + text.length.toLocaleString('ko-KR') + '자';

    if (!CP) {
      total.textContent = '—';
      $('#psychLabel').textContent = '심리학 엔진을 불러오지 못했어요';
      $('#psychGroupChips').innerHTML = '';
      $('#psychTriggers').innerHTML = '<p class="muted" style="font-size:12px">engines/copy-psych-engine.js 파일이 같은 폴더에 있는지 확인하세요.</p>';
      $('#psychGaps').innerHTML = '';
      return;
    }

    const idle = !text.trim();
    const diag = CP.diagnose(text);
    const p = C.psychProfile(diag);
    state.psych = p;

    total.textContent = idle ? 0 : p.total;
    const gradeEl = $('#psychGrade');
    gradeEl.className = 'badge grade ' + (idle ? 'c' : p.grade.tone);
    gradeEl.textContent = idle ? '—' : p.grade.id;
    $('#psychLabel').textContent = idle ? '공고문이 비어 있어요' : p.grade.title;

    $('#psychGroupChips').innerHTML = p.groups.map(function (g) {
      return '<div class="psy-chip ' + (g.met ? 'met' : '') + '" title="' + esc(g.desc) + ' · 목표 ' + g.target + '">' +
        '<b>' + esc(g.label) + '</b><span>' + (idle ? 0 : g.score) + '</span><em>/ ' + g.target + '</em></div>';
    }).join('');

    $('#psychTriggers').innerHTML = diag.triggers.map(function (t) {
      const g = groupOfTrigger(t.id);
      const pct = idle ? 0 : t.score;
      const cls = pct >= 70 ? '' : pct >= 40 ? 'low' : 'bad';
      const hit = (t.hits || [])[0];
      return '<div class="trig-row" title="' + esc(t.fix || '') + '">' +
        '<span class="t-main"><span class="t-name">' + esc(t.name) + '</span>' +
          (hit && !idle ? '<span class="t-hit">“' + esc(hit.phrase || hit.label) + '”</span>' : '<span class="t-hit muted">—</span>') + '</span>' +
        '<span class="t-group ' + (g ? g.id : '') + '">' + (g ? esc(g.label) : '—') + '</span>' +
        '<span class="t-bar"><i class="' + cls + '" style="width:' + pct + '%"></i></span>' +
        '<b class="t-score">' + pct + '</b></div>';
    }).join('');

    const gaps = idle ? [] : p.gaps;
    $('#psychGaps').innerHTML = !gaps.length ? '' :
      '<h3 class="mini-title">먼저 채울 빈틈 <em>' + gaps.length + '</em></h3>' +
      gaps.map(function (g, i) {
        return '<div class="gap"><b>' + (i + 1) + '. ' + esc(g.name) + ' <span>' + g.score + '점</span></b>' +
          '<p>' + esc(g.fix) + '</p></div>';
      }).join('');
  }

  /* ── 추상어 · 공급자어 교정 ──────────────────────── */
  function renderWordFix() {
    const box = $('#wordFixBody');
    if (!box) return;
    const label = $('#wordFixScore');
    if (!CP) {
      label.textContent = '—';
      box.innerHTML = '<p class="muted" style="font-size:12px">교정 엔진을 불러오지 못했어요.</p>';
      return;
    }
    const built = state.built || C.buildBrief(state.brief);
    const text = docText(built);
    if (!text.trim()) {
      label.textContent = '감점 0';
      box.innerHTML = '<p class="muted" style="font-size:12px">공고문이 비어 있어요.</p>';
      return;
    }

    const det = CP.detect(text);
    const wf = C.wordFixGroups(det);
    label.textContent = '감점 ' + wf.friction + (wf.primaryTotal ? ' · 추상·공급자 ' + wf.primaryTotal + '건' : '');

    if (!wf.total) {
      const examples = (CP.RULES || []).filter(function (r) {
        return (r.type === 'abstract' || r.type === 'supplier') && r.example;
      }).slice(0, 3);
      box.innerHTML = '<div class="wf-clean"><b>추상어·공급자어가 없어요.</b><p>숫자와 지원자 언어로 쓰셨습니다. 이 상태를 유지하세요.</p></div>' +
        (examples.length
          ? '<div class="wf-group"><h3 class="wf-head">자주 걸리는 표현 <span>이렇게 바꾸면 통과</span></h3><div class="wf-items">' +
            examples.map(function (ex) { return '<div class="wf-item"><div class="wf-ex">' + esc(ex.example) + '</div></div>'; }).join('') +
            '</div></div>'
          : '');
      return;
    }

    const groupHTML = function (g) {
      const shown = g.items.slice(0, 6);
      const more = g.items.length - shown.length;
      return '<div class="wf-group">' +
        '<h3 class="wf-head">' + esc(g.label) + ' <em>' + g.count + '</em><span>' + esc(g.desc) + '</span></h3>' +
        '<div class="wf-items">' + shown.map(function (it) {
          return '<div class="wf-item">' +
            '<div class="wf-top"><b>' + esc(it.phrase) + '</b>' +
              (it.count > 1 ? '<span class="wf-count">×' + it.count + '</span>' : '') +
              (it.canAutoFix ? '<span class="wf-auto">자동 치환</span>' : '') + '</div>' +
            (it.alternative ? '<div class="wf-fix">대안: ' + esc(it.alternative) + '</div>' : '') +
            (it.example ? '<div class="wf-ex">' + esc(it.example) + '</div>' : '') +
          '</div>';
        }).join('') +
        (more > 0 ? '<div class="wf-more">' + more + '건 더 있어요. 같은 표현을 찾아 바꿔 주세요.</div>' : '') +
        '</div></div>';
    };

    let html = wf.primary.map(groupHTML).join('');
    if (!wf.primary.length) {
      html += '<div class="wf-clean"><b>추상어·공급자어는 없어요.</b><p>다른 유형의 감점만 남았습니다. 아래 대안을 참고하세요.</p></div>';
    }
    if (wf.secondary.length) {
      html += '<details class="wf-etc"><summary>기타 감점 ' + wf.secondary.reduce(function (a, g) { return a + g.count; }, 0) + '건 보기</summary>' +
        wf.secondary.map(groupHTML).join('') + '</details>';
    }
    box.innerHTML = html;
  }

  function applyWordFix() {
    if (!CP) return;
    const built = state.built || C.buildBrief(state.brief);
    const current = docText(built);
    const fixed = CP.correct(current);
    if (!fixed.applied.length) {
      toast('자동으로 바꿀 수 있는 표현이 없어요. 표시된 대안을 직접 반영해 주세요.', 'warn');
      return;
    }
    state.ai.docs[state.doc] = fixed.text;
    saveAi();
    renderBriefOutput();
    toast('안전 치환 ' + fixed.applied.length + '건을 적용했어요. 문서 아래 [되돌리기]로 원래대로 돌릴 수 있습니다.');
  }

  function revertDoc() {
    if (!hasOverride()) return;
    state.ai.docs[state.doc] = '';
    saveAi();
    renderBriefOutput();
    toast((DOCS[state.doc] || '문서') + '을 자동 생성본으로 되돌렸습니다.');
  }

  /* ── 공고 도입부 PAS · BAB · AIDA · 4U ──────────── */
  function introOptions() {
    return C.introDefaults(state.brief, {
      problem: state.intro.problem,
      solution: state.intro.solution,
      proof: state.intro.proof,
    });
  }

  function renderIntro() {
    const seg = $('#fwSeg');
    if (!seg) return;
    if (!CP) {
      $('#introOut').innerHTML = '<p class="muted" style="font-size:12px">engines/copy-psych-engine.js 파일을 확인하세요.</p>';
      return;
    }
    seg.innerHTML = CP.FRAMEWORKS.map(function (f) {
      return '<button type="button" class="' + (state.introFw === f.id ? 'is-on' : '') + '" data-action="set-fw" data-fw="' + f.id + '" title="' + esc(f.name) + ' · ' + esc((f.bestFor || []).join(', ')) + '">' + f.id + '</button>';
    }).join('');

    const input = introOptions();
    const built = CP.build(state.introFw, input);
    state.introBuilt = built;
    let all = null;
    try { all = CP.generateAll(input); } catch (e) { all = null; }

    $('#introOut').innerHTML =
      '<div class="intro-title"><span class="t-formula">' + esc(built.id) + '</span><span>' + esc(built.title) + '</span></div>' +
      built.sections.map(function (s) {
        return '<div class="intro-sec"><span class="i-label">' + esc(s.label) + '</span><span>' + esc(s.text) + '</span></div>';
      }).join('');

    const mine = all && all.comparison.filter(function (c) { return c.id === built.id; })[0];
    const best = all && all.best;
    $('#introBest').textContent = all
      ? '이 캠페인엔 ' + all.recommendation.name + ' 추천 · ' + built.id + ' ' + (mine ? mine.psychScore + '점' : '—') +
        (best && best.id !== built.id ? ' / 최고 ' + best.id + ' ' + best.psych.total + '점' : '')
      : '';
    $('#introNote').textContent = all && all.recommendation.reasons && all.recommendation.reasons.length
      ? all.recommendation.reasons[0]
      : '';
    if (!$('#iProblem').value) $('#iProblem').placeholder = input.auto.problem;
    if (!$('#iOutcome').value) $('#iOutcome').placeholder = input.auto.solution;
    if (!$('#iProof').value) $('#iProof').placeholder = input.auto.proof;
  }

  function introToPosting() {
    if (!state.introBuilt) return;
    const base = state.built || C.buildBrief(state.brief);
    const baseText = state.ai.docs.posting || base.posting.text;
    state.ai.docs.posting = state.introBuilt.body + '\n\n' + baseText;
    saveAi();
    state.doc = 'posting';
    $$('.out-tab[data-doc]').forEach(function (b) {
      const on = b.dataset.doc === 'posting';
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderBriefOutput();
    toast('도입부를 공고문 맨 위에 넣었어요. [되돌리기]로 원래대로 돌릴 수 있습니다.');
  }

  /* ── 내 구독 AI 원클릭 브리지 ───────────────────── */
  function promptFor(mode) {
    const built = state.built || C.buildBrief(state.brief);
    const postingText = state.ai.docs.posting || built.posting.text;
    // 진단은 항상 '지금 보내는 공고문' 기준으로 다시 계산한다(다른 탭을 보고 있어도 어긋나지 않게).
    const psych = CP ? C.psychProfile(CP.diagnose(postingText)) : null;
    const p = C.buildAiPrompt({
      mode: mode,
      brief: state.brief,
      applicants: state.applicants,
      prefs: state.prefs,
      built: built,
      docText: postingText,
      psych: psych,
      report: mode === 'report' ? buildReportNow() : null,
      personal: !!state.ai.personal,
      now: new Date(),
    });
    state.aiPrompts[mode] = p;
    return p;
  }

  function renderBridge(mode) {
    const cfg = BRIDGE[mode];
    const box = $(cfg.box);
    if (!box) return;
    if (!B) {
      box.textContent = 'AI 브리지를 불러오지 못했어요. engines/ai-bridge.js를 확인하세요.';
      $(cfg.btns).innerHTML = '';
      return;
    }
    const p = promptFor(mode);
    box.textContent = p.prompt;
    if (cfg.len) {
      const lenEl = $(cfg.len);
      if (lenEl) lenEl.textContent = p.chars.toLocaleString('ko-KR') + '자 · 지원자 ' + p.applicants + '명 · ' + (p.personal ? '이름·핸들 포함' : '개인정보 제외');
    }
    $(cfg.btns).innerHTML = B.listProviders().map(function (pr) {
      const link = B.linkFor(pr.id, p.prompt);
      return '<a class="btn btn-ghost btn-sm bridge-btn" href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer" ' +
        'data-action="bridge-open" data-mode="' + mode + '" data-provider="' + esc(pr.id) + '" title="' + esc(link.note) + '">' +
        esc(pr.label) + ' 열기<span class="b-tag' + (link.prefilled ? '' : ' paste') + '">' +
        (link.prefilled ? '자동 입력' : '붙여넣기') + '</span></a>';
    }).join('');
    const personalEl = $(cfg.personal);
    if (personalEl) personalEl.checked = !!state.ai.personal;
    const autoCount = B.listProviders().filter(function (pr) { return B.linkFor(pr.id, p.prompt).prefilled; }).length;
    const note = $(cfg.note);
    if (note) {
      note.textContent = (autoCount
        ? '버튼을 누르면 프롬프트가 클립보드에 복사되고 새 창이 열립니다. ChatGPT·Claude는 입력창에 채워지고, Gemini는 붙여넣기(Ctrl+V)만 하면 됩니다. '
        : '프롬프트가 ' + p.chars.toLocaleString('ko-KR') + '자로 길어 주소에 담지 않습니다. 버튼을 누르면 클립보드에 복사되고 새 창이 열리니, 열린 창에서 Ctrl+V로 붙여넣으세요. ') +
        (p.personal ? '지원자 이름·핸들이 프롬프트에 들어갑니다.' : '지원자 이름·핸들·메모는 익명 처리됩니다.');
    }
  }

  function bridgeOpen(mode, providerId) {
    if (!B) return;
    const p = state.aiPrompts[mode] || promptFor(mode);
    const link = B.linkFor(providerId, p.prompt);
    copyText(p.prompt, link.prefilled
      ? link.label + ' 창에 프롬프트를 채웠습니다. 그대로 보내면 됩니다.'
      : link.label + ' 창을 열었습니다. 클립보드의 프롬프트를 붙여넣으세요(Ctrl+V).');
    window.open(link.url, '_blank', 'noopener');
  }

  function personalChanged() {
    ['brief', 'report'].forEach(function (m) {
      const el = $(BRIDGE[m].personal);
      if (el) el.checked = !!state.ai.personal;
    });
    saveAi();
    renderBridge('brief');
    renderBridge('report');
  }

  function defaultAnswerHint(mode) {
    return mode === 'report'
      ? '붙여넣으면 원본에 없는 숫자가 있는지 검사합니다.'
      : '붙여넣으면 글자 수·심리 점수·대가성 문구·지어낸 숫자를 미리 점검합니다.';
  }

  function renderAnswer(mode) {
    const cfg = BRIDGE[mode];
    const el = $(cfg.answer);
    const meta = $(cfg.meta);
    if (!el || !meta) return;
    const raw = el.value;
    if (!raw.trim()) {
      meta.className = 'ai-draft-meta';
      meta.textContent = defaultAnswerHint(mode);
      return;
    }
    const parsed = C.parseAiAnswer(raw, mode);
    const chips = ['<span class="ai-chip">' + parsed.chars.toLocaleString('ko-KR') + '자</span>'];
    if (mode === 'brief' && CP && parsed.text) {
      const pp = C.psychProfile(CP.diagnose(parsed.text));
      chips.push('<span class="ai-chip score ' + (pp.total >= 75 ? 'ok' : pp.total >= 60 ? '' : 'warn') + '">심리 ' + pp.total + '점 · ' + pp.grade.id + '</span>');
    }
    const prompt = (state.aiPrompts[mode] || {}).prompt || '';
    if (prompt && parsed.text) {
      const audit = C.auditNumbers(parsed.text, prompt);
      chips.push('<span class="ai-chip ' + (audit.ok ? 'ok' : 'warn') + '">' +
        (audit.ok ? '숫자 원본 일치' : '원본에 없는 숫자 ' + audit.unknown.length + '건') + '</span>');
    }
    const warns = parsed.warnings.slice();
    const audit = prompt && parsed.text ? C.auditNumbers(parsed.text, prompt) : null;
    if (audit && !audit.ok) {
      audit.unknown.slice(0, 3).forEach(function (u) {
        warns.push('원본에 없는 숫자: ' + u.value + ' — “' + u.context + '”');
      });
    }
    meta.className = 'ai-draft-meta';
    meta.innerHTML = '<div class="ai-chips">' + chips.join('') + '</div>' +
      (warns.length ? '<ul class="ai-warn">' + warns.slice(0, 5).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '');
  }

  function applyAiAnswer() {
    const parsed = C.parseAiAnswer($('#aiAnswer').value, 'brief');
    if (!parsed.text) { toast('AI가 준 공고문을 먼저 붙여넣으세요.', 'warn'); return; }
    if (parsed.chars < 120) { toast('붙여넣은 글이 너무 짧아 적용하지 않았습니다. 답변 전체를 붙여넣어 주세요.', 'warn'); return; }
    state.ai.docs.posting = parsed.text;
    saveAi();
    if (state.doc !== 'posting') {
      state.doc = 'posting';
      $$('.out-tab[data-doc]').forEach(function (b) {
        const on = b.dataset.doc === 'posting';
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    renderBriefOutput();
    toast('모집 공고문에 AI 적용본을 넣었습니다. 아래 [되돌리기]로 원래대로 돌릴 수 있습니다.');
  }

  function clearAnswer(mode) {
    const el = $(BRIDGE[mode].answer);
    if (!el) return;
    el.value = '';
    renderAnswer(mode);
  }

  function fillGeminiInputs() {
    ['brief', 'report'].forEach(function (m) {
      const key = $(BRIDGE[m].key);
      const model = $(BRIDGE[m].model);
      if (key) key.value = state.ai.geminiKey || '';
      if (model) model.value = state.ai.geminiModel || (B ? B.GEMINI_DEFAULT_MODEL : '');
    });
    const list = $('#geminiModels');
    if (list && B) list.innerHTML = B.GEMINI_MODELS.map(function (m) { return '<option value="' + esc(m) + '"></option>'; }).join('');
  }

  function saveGemini(mode) {
    const cfg = BRIDGE[mode || 'brief'];
    const keyEl = $(cfg.key);
    const modelEl = $(cfg.model);
    if (keyEl) state.ai.geminiKey = keyEl.value.trim();
    if (modelEl) state.ai.geminiModel = modelEl.value.trim() || (B ? B.GEMINI_DEFAULT_MODEL : 'gemini-3.5-flash-lite');
    saveAi();
    fillGeminiInputs();
  }

  /** 무료 AI 맛보기 — 키 없이 공고문·리포트 초안을 받는다. */
  async function freeGenerate(mode) {
    const isReport = mode === 'report';
    const status = $(isReport ? '#repFreeStatus' : '#freeStatus');
    const cardBox = $(isReport ? '#repFreeCard' : '#freeCard');
    if (!Pro) {
      if (status) { status.className = 'form-error'; status.textContent = '무료 AI 엔진을 불러오지 못했어요. engines/pro-api-connector.js를 확인하세요.'; }
      return;
    }
    if (state.freeBusy) return;
    const btn = $('[data-action="free-generate"][data-mode="' + mode + '"]');
    if (btn) btn.disabled = true;
    state.freeBusy = true;
    if (cardBox) cardBox.innerHTML = '';
    if (status) { status.className = 'muted'; status.textContent = '무료 체험으로 생성 중… (10~30초)'; }
    const p = state.aiPrompts[mode] || promptFor(mode);
    try {
      const res = await Pro.generateFree({
        task: 'text', prompt: p.prompt, system: p.system,
      }, { app: FREE_APP, truncate: true, timeoutMs: 45000 });
      if (res.ok) {
        $(isReport ? '#repAnswer' : '#aiAnswer').value = res.text;
        renderAnswer(mode);
        const left = res.quota ? ' · 남은 ' + res.quota.remaining + '/' + res.quota.limit + '회' : '';
        if (status) {
          status.className = 'muted';
          status.textContent = (isReport ? '리포트' : '공고문') + '을 무료 체험으로 받았어요' + left +
            (res.truncated ? ' · 2,000자 제한으로 프롬프트를 줄였습니다' : '') + '. 아래 [적용] 전에 미리 점검을 확인하세요.';
        }
        toast('무료 체험으로 ' + (isReport ? '리포트' : '공고문') + '을 받았어요.');
      } else if (res.upgrade) {
        if (status) { status.className = 'form-error'; status.textContent = res.message; }
        if (cardBox && Pro.freeLimitCard) {
          const c = Pro.freeLimitCard(res);
          cardBox.innerHTML = '<div class="free-card"><b>' + esc(c.title) + '</b><p>' + esc(c.body) + '</p>' +
            '<a href="' + esc(c.primary.href) + '" target="_blank" rel="noopener noreferrer">' + esc(c.primary.label) + ' ↗</a></div>';
        }
      } else if (status) {
        status.className = 'form-error';
        status.textContent = res.message || '무료 체험에 실패했어요.';
      }
    } catch (e) {
      if (status) { status.className = 'form-error'; status.textContent = '무료 체험에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.'; }
    } finally {
      state.freeBusy = false;
      if (btn) btn.disabled = false;
    }
  }

  async function geminiGenerate(mode) {
    const cfg = BRIDGE[mode];
    const status = $(cfg.status);
    if (!B) { if (status) status.textContent = 'AI 브리지를 불러오지 못했어요.'; return; }
    if (state.geminiBusy) return;
    const key = ($(cfg.key).value || '').trim();
    const model = ($(cfg.model).value || '').trim() || B.GEMINI_DEFAULT_MODEL;
    if (!key) {
      if (status) { status.className = 'form-error'; status.textContent = '키를 넣거나, 위의 세 AI 버튼을 쓰세요.'; }
      return;
    }
    state.ai.geminiKey = key;
    state.ai.geminiModel = model;
    saveAi();
    fillGeminiInputs();

    const p = state.aiPrompts[mode] || promptFor(mode);
    let req;
    try { req = B.buildGeminiRequest({ apiKey: key, model: model, prompt: p.prompt }); }
    catch (e) { if (status) { status.className = 'form-error'; status.textContent = e.message; } return; }

    state.geminiBusy = true;
    if (status) { status.className = 'muted'; status.textContent = '생성 중… (10~30초)'; }
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 45000);
    try {
      const res = await fetch(req.url, Object.assign({}, req.init, { signal: controller.signal }));
      clearTimeout(timer);
      const rawText = await res.text();
      let json = null;
      try { json = JSON.parse(rawText); } catch (e) { json = null; }
      if (!res.ok) {
        const detail = json && json.error && json.error.message ? json.error.message : rawText;
        if (status) { status.className = 'form-error'; status.textContent = B.explainStatus(res.status, detail); }
        return;
      }
      const out = B.parseGeminiResponse(json);
      if (!out.ok) { if (status) { status.className = 'form-error'; status.textContent = out.error; } return; }
      $(cfg.answer).value = out.text;
      renderAnswer(mode);
      if (status) {
        status.className = 'muted';
        status.textContent = (mode === 'report' ? '리포트를' : '공고문을') + ' 받았어요. 아래 [적용]을 누르세요.' + (out.warnings.length ? ' ' + out.warnings[0] : '');
      }
      toast('Gemini가 ' + (mode === 'report' ? '리포트' : '공고문') + '을 보냈어요. 미리 점검을 확인하고 적용하세요.');
    } catch (e) {
      clearTimeout(timer);
      if (status) {
        status.className = 'form-error';
        status.textContent = e && e.name === 'AbortError'
          ? '응답이 늦어 취소했어요. 다시 시도하거나 다른 모델을 골라 보세요.'
          : '연결하지 못했어요. 키·네트워크·브라우저 차단을 확인하세요.';
      }
    } finally {
      state.geminiBusy = false;
    }
  }

  /* ── 광고주 보고용 리포트 ─────────────────────────── */
  function buildReportNow() {
    return C.buildReport(state.brief, state.applicants, state.prefs, { now: new Date() });
  }

  function reportText() {
    if (!state.brief) return '';
    return (state.ai.report || '').trim() || buildReportNow().text;
  }

  function renderReport() {
    const pre = $('#reportPreview');
    if (!pre || !state.brief) return;
    const base = buildReportNow();
    const aiText = (state.ai.report || '').trim();
    const showing = aiText || base.text;
    pre.textContent = showing;
    $('#reportChars').textContent = showing.length.toLocaleString('ko-KR') + '자 · ' + (aiText ? 'AI 적용본' : '자동 생성본');
    $('#reportBadge').textContent = aiText ? 'AI 적용본' : '자동 생성';
    $('#reportRevert').hidden = !aiText;
    const warn = $('#reportWarn');
    if (base.warnings.length) {
      warn.hidden = false;
      warn.innerHTML = base.warnings.map(function (w) { return '<p class="' + w.level + '">' + esc(w.text) + '</p>'; }).join('');
    } else {
      warn.hidden = true;
      warn.innerHTML = '';
    }
    if (state.view === 'stats') renderBridge('report');
  }

  function applyRepAnswer() {
    const parsed = C.parseAiAnswer($('#repAnswer').value, 'report');
    if (!parsed.text) { toast('AI가 준 리포트를 먼저 붙여넣으세요.', 'warn'); return; }
    if (parsed.chars < 100) { toast('붙여넣은 글이 너무 짧아 적용하지 않았습니다.', 'warn'); return; }
    state.ai.report = parsed.text;
    saveAi();
    renderReport();
    renderBridge('report');
    toast('리포트에 AI 적용본을 넣었습니다. [자동 생성으로 되돌리기]로 원래대로 돌릴 수 있습니다.');
  }

  function copyReport() {
    copyText(reportText(), '성과 리포트를 클립보드에 복사했습니다.');
  }

  function downloadReport() {
    const text = reportText();
    if (!text) return;
    download('체험단-성과리포트-' + stamp() + '.txt', text);
    toast('.txt 파일로 저장했습니다.');
  }

  async function copyText(text, successMessage) {
    if (!text) return;
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e) { ok = false; }
    }
    toast(ok ? successMessage : '복사하지 못했습니다. 본문을 직접 선택해 주세요.', ok ? null : 'warn');
  }

  /* ── 파일 내려받기 ──────────────────────────────── */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function stamp() {
    return C.todayIso(new Date()).replace(/-/g, '');
  }

  /* ── 지원자 필터 ────────────────────────────────── */
  function dueMatches(a) {
    if (state.due === 'all') return true;
    const d = C.ddayInfo(a, new Date());
    if (state.due === 'late') return d.tone === 'late';
    if (state.due === 'soon') return d.tone === 'late' || d.tone === 'danger';
    if (state.due === 'week') return d.tone === 'late' || d.tone === 'danger' || d.tone === 'warn';
    return true;
  }

  function filteredApplicants() {
    const base = C.filterApplicants(state.applicants, {
      query: state.query,
      channel: state.channel,
      stage: 'all',
      sort: state.prefs.sort,
      productPrice: state.brief.productPrice,
    });
    return base.filter(dueMatches);
  }

  function channelCounts() {
    const counts = { all: state.applicants.length };
    C.CHANNELS.forEach((c) => { counts[c.id] = 0; });
    state.applicants.forEach((a) => { counts[a.channel] = (counts[a.channel] || 0) + 1; });
    return counts;
  }

  function dueCounts() {
    const out = { all: state.applicants.length, late: 0, soon: 0, week: 0 };
    state.applicants.forEach((a) => {
      const tone = C.ddayInfo(a, new Date()).tone;
      if (tone === 'late') { out.late++; out.soon++; out.week++; }
      else if (tone === 'danger') { out.soon++; out.week++; }
      else if (tone === 'warn') { out.week++; }
    });
    return out;
  }

  /* ── 보드 ───────────────────────────────────────── */
  function avatarClass(channel) {
    return 'avatar ch-' + channel;
  }

  function safeUrl(url) {
    const s = String(url || '').trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  function ddayHtml(a) {
    const d = C.ddayInfo(a, new Date());
    return '<span class="dday ' + d.tone + '">' + esc(d.label) + '</span>';
  }

  function cardHtml(a) {
    const cost = C.applicantCost(a, state.brief.productPrice);
    const d = C.ddayInfo(a, new Date());
    const idx = C.stageIndex(a.stage);
    const url = safeUrl(a.reviewUrl);
    const initial = (a.name || '?').trim().slice(0, 1);
    return '<article class="kcard' + (d.tone === 'late' ? ' is-late' : '') + '" draggable="true" data-id="' + esc(a.id) + '">' +
      '<div class="kc-top">' +
        '<span class="' + avatarClass(a.channel) + '" aria-hidden="true" data-i18n-skip>' + esc(initial) + '</span>' +
        '<div class="kc-id">' +
          '<span class="kc-name" title="' + esc(a.name) + '">' + esc(a.name) + '</span>' +
          '<span class="kc-handle">' + esc(a.handle || C.channelLabel(a.channel)) + ' · ' + esc(C.channelShort(a.channel)) + '</span>' +
        '</div>' +
        ddayHtml(a) +
      '</div>' +
      '<div class="kc-metrics">' +
        '<span>팔로워 <b>' + C.formatCount(a.followers) + '</b></span>' +
        '<span>평균 <b>' + C.formatCount(a.avgViews) + '</b></span>' +
        '<span class="kc-cost" title="원고료 + 제품가">단가 <b>' + C.formatWonShort(cost) + '</b></span>' +
      '</div>' +
      (a.note ? '<p class="kc-note">' + esc(a.note) + '</p>' : '') +
      (url ? '<a class="kc-review" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">리뷰 링크 열기</a>' : '') +
      '<div class="kc-actions">' +
        '<button type="button" class="kbtn" data-move="-1" aria-label="이전 단계로"' + (idx <= 0 ? ' disabled' : '') + '>◀</button>' +
        '<button type="button" class="kbtn wide" data-edit>상세</button>' +
        '<button type="button" class="kbtn" data-move="1" aria-label="다음 단계로"' + (idx >= C.STAGES.length - 1 ? ' disabled' : '') + '>▶</button>' +
      '</div>' +
    '</article>';
  }

  function renderChannelChips() {
    const counts = channelCounts();
    const chips = ['<button type="button" class="chip' + (state.channel === 'all' ? ' is-on' : '') + '" data-channel="all">전체 <span class="chip-n">' + counts.all + '</span></button>'];
    C.CHANNELS.forEach((c) => {
      chips.push('<button type="button" class="chip' + (state.channel === c.id ? ' is-on' : '') + '" data-channel="' + c.id + '">' +
        '<span class="chip-dot" style="--c:' + c.color + '"></span>' + c.short + ' <span class="chip-n">' + (counts[c.id] || 0) + '</span></button>');
    });
    $('#channelChips').innerHTML = chips.join('');
  }

  function renderDueChips() {
    const counts = dueCounts();
    const defs = [
      { id: 'all', label: '전체', n: counts.all },
      { id: 'late', label: '마감 지남', n: counts.late },
      { id: 'soon', label: '3일 내', n: counts.soon },
      { id: 'week', label: '이번 주', n: counts.week },
    ];
    $('#dueChips').innerHTML = defs.map((d) =>
      '<button type="button" class="chip' + (state.due === d.id ? ' is-on' : '') + '" data-due="' + d.id + '">' + d.label + ' <span class="chip-n">' + d.n + '</span></button>'
    ).join('<span class="chip-sep" aria-hidden="true"></span>');
  }

  function renderBoardMeta() {
    const rows = filteredApplicants();
    const cost = rows.reduce((s, a) => s + C.applicantCost(a, state.brief.productPrice), 0);
    const filtering = state.query || state.channel !== 'all' || state.due !== 'all';
    $('#boardMeta').innerHTML = '<b>' + rows.length + '명</b> 표시' +
      (filtering ? ' <span class="muted">· 전체 ' + state.applicants.length + '명</span>' : '') +
      ' · 지원자 단가 합계 <b>' + C.formatWon(cost) + '</b>' +
      ' · 마감 지남 <b>' + dueCounts().late + '명</b>';
  }

  function renderKanban(rows) {
    const byStage = {};
    C.STAGES.forEach((s) => { byStage[s.id] = []; });
    rows.forEach((a) => { (byStage[a.stage] || byStage.applied).push(a); });
    $('#kanban').innerHTML = C.STAGES.map((s) => {
      const items = byStage[s.id];
      const cost = items.reduce((sum, a) => sum + C.applicantCost(a, state.brief.productPrice), 0);
      return '<section class="col" data-stage="' + s.id + '" aria-label="' + s.label + '">' +
        '<div class="col-head">' +
          '<span class="col-dot" style="--c:' + s.color + '"></span>' +
          '<h3>' + s.label + '</h3>' +
          '<span class="col-count">' + items.length + '</span>' +
          '<span class="col-cost">' + (cost ? C.formatWonShort(cost) : '') + '</span>' +
        '</div>' +
        '<div class="col-body">' +
          (items.length ? items.map(cardHtml).join('') : '<p class="col-empty">' + (state.due !== 'all' || state.query || state.channel !== 'all' ? '필터로 숨김' : '카드 없음') + '</p>') +
        '</div>' +
      '</section>';
    }).join('');
    mountKanbanSortable();
  }

  /** SortableJS 로 칸반을 다시 묶는다(터치·모바일 드래그 안정화). */
  function mountKanbanSortable() {
    if (!BE || !BE.hasSortable) return false;
    const root = $('#kanban');
    if (!root) return false;
    return BE.mountColumns(root, {
      onMove(id, stage) {
        if (!id || !stage) return;
        state.applicants = C.moveApplicant(state.applicants, id, stage);
        saveApplicants();
        renderBoard();
        renderCampaignBar();
        toast('단계를 옮겼습니다 · ' + C.stageLabel(stage));
      },
    });
  }

  function renderList(rows) {
    const body = $('#listBody');
    if (!rows.length) {
      body.innerHTML = '';
      return;
    }
    body.innerHTML = rows.map((a) => {
      const cost = C.applicantCost(a, state.brief.productPrice);
      const url = safeUrl(a.reviewUrl);
      const ch = C.channelById(a.channel);
      const initial = (a.name || '?').trim().slice(0, 1);
      return '<tr data-id="' + esc(a.id) + '">' +
        '<td><div class="lt-person"><span class="' + avatarClass(a.channel) + '" aria-hidden="true" data-i18n-skip>' + esc(initial) + '</span>' +
          '<span class="kc-id"><span class="lt-name">' + esc(a.name) + '</span><span class="lt-handle">' + esc(a.handle || '—') + '</span>' +
          (a.note ? '<span class="lt-note">' + esc(a.note) + '</span>' : '') + '</span></div></td>' +
        '<td><span class="ch-tag"><span class="chip-dot" style="--c:' + ch.color + '"></span>' + esc(ch.short) + '</span></td>' +
        '<td class="num">' + C.formatCount(a.followers) + '</td>' +
        '<td class="num">' + C.formatCount(a.avgViews) + '</td>' +
        '<td class="num">' + C.formatWonShort(cost) + '</td>' +
        '<td><select class="stage-select" data-stage-select="' + esc(a.id) + '" aria-label="진행 단계">' +
          C.STAGES.map((s) => '<option value="' + s.id + '"' + (s.id === a.stage ? ' selected' : '') + '>' + s.label + '</option>').join('') +
        '</select></td>' +
        '<td>' + ddayHtml(a) + '</td>' +
        '<td>' + (url ? '<a class="link-btn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">보기</a>' : '<span class="link-btn muted">—</span>') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderBoard() {
    renderChannelChips();
    renderDueChips();
    renderBoardMeta();
    const rows = filteredApplicants();
    const isKanban = state.prefs.boardView !== 'list';
    $('#kanban').hidden = !isKanban || rows.length === 0;
    $('#listWrap').hidden = isKanban || rows.length === 0;
    $$('#viewSeg button').forEach((b) => b.classList.toggle('is-on', (b.dataset.boardview === 'list') === !isKanban));
    $('#sortSelect').value = state.prefs.sort;
    if (isKanban) renderKanban(rows);
    else renderList(rows);
    $('#boardEmpty').hidden = rows.length > 0;
    const search = $('#searchInput');
    if (search.value !== state.query) search.value = state.query;
    $('[data-action="clear-search"]').hidden = !state.query;
    $('#tabBoardCount').textContent = state.applicants.length;
  }

  /* ── 성과 대시보드 ──────────────────────────────── */
  function panelHead(title, sub) {
    return '<div class="panel-head"><h2>' + title + '</h2>' + (sub ? '<span class="muted">' + sub + '</span>' : '') + '</div>';
  }

  function renderStats() {
    const b = state.brief;
    const s = C.summarize(state.applicants, {
      productPrice: b.productPrice,
      cpm: state.prefs.cpm,
      revenue: state.prefs.revenue,
      headcount: b.headcount,
    });
    const chans = C.channelStats(state.applicants, { productPrice: b.productPrice });
    const stages = C.stageStats(state.applicants, { productPrice: b.productPrice });
    const tops = C.topPerformers(state.applicants, { productPrice: b.productPrice });
    const dues = C.dueList(state.applicants, new Date(), 'all');

    $('#statsSummary').innerHTML =
      '<div class="stat"><b>' + s.measuredCount + '명</b><span>실측 집계</span></div>' +
      '<div class="stat"><b>' + s.pendingCount + '명</b><span>리뷰 미제출</span></div>' +
      '<div class="stat"><b>' + (s.lateCount + s.dueSoonCount) + '명</b><span>지연·임박</span></div>';

    /* KPI */
    const roi = s.roiRevenue !== null ? s.roiRevenue : s.roiAd;
    const roiLabel = s.roiRevenue !== null ? '매출 ROI' : '광고 환산 ROI';
    const roiSub = s.roiRevenue !== null
      ? '매출 ' + C.formatWonShort(s.revenue) + ' − 비용 ' + C.formatWonShort(s.cost)
      : '환산 광고가치 ' + C.formatWonShort(s.adValue);
    const kpis = [
      { label: '총 투입 비용', value: C.formatWonShort(s.cost), sub: '선정 이후 ' + s.activeCount + '명 · 지원자 포함 예상 ' + C.formatWonShort(s.pipelineCost), cls: '' },
      { label: '총 도달 조회수', value: C.formatCount(s.views), sub: '실측 ' + s.measuredCount + '명 ' + C.formatCount(s.measuredViews) + ' · 예상 ' + s.pendingCount + '명 ' + C.formatCount(s.estimatedViews), cls: '' },
      { label: '조회당 단가 (CPV)', value: C.formatCpv(s.cpv), sub: '1,000회당 ' + (s.cpm === null ? '—' : C.formatWon(s.cpm)), cls: 'hot' },
      { label: '참여율', value: C.formatPercent(s.engagementRate), sub: '좋아요 ' + C.formatCount(s.likes) + ' + 댓글 ' + C.formatCount(s.comments) + ' ÷ 실측 조회', cls: 'teal' },
      { label: roiLabel, value: roi === null ? '—' : C.formatPercent(roi, 0), sub: roiSub, cls: roi !== null && roi > 0 ? 'hot' : '' },
    ];
    $('#kpiGrid').innerHTML = kpis.map((k) =>
      '<div class="kpi-card ' + k.cls + '"><span class="kpi-label">' + k.label + '</span>' +
      '<div class="kpi-value">' + k.value + '</div><div class="kpi-sub">' + k.sub + '</div></div>'
    ).join('');

    /* 계산 기준 */
    const breakeven = state.prefs.cpm > 0 ? s.cost / (state.prefs.cpm / 1000) : null;
    $('#calcPanel').innerHTML = panelHead('성과 계산 기준', '값을 바꾸면 바로 반영') +
      '<div class="calc-fields">' +
        '<div class="calc-field"><label for="cpmInput">기준 CPM (1,000회 노출당)</label>' +
          '<div class="input-unit"><input id="cpmInput" type="number" min="0" step="500" value="' + state.prefs.cpm + '" /><span>원</span></div></div>' +
        '<div class="calc-field"><label for="revenueInput">직접 매출 (선택)</label>' +
          '<div class="input-unit"><input id="revenueInput" type="number" min="0" step="10000" value="' + state.prefs.revenue + '" /><span>원</span></div></div>' +
      '</div>' +
      '<div class="formula-list">' +
        '<div class="formula-row"><span>환산 광고가치</span><b>' + C.formatWon(s.adValue) + '</b></div>' +
        '<div class="formula-row"><span>광고 환산 ROI</span><b>' + (s.roiAd === null ? '—' : C.formatPercent(s.roiAd, 0)) + '</b></div>' +
        '<div class="formula-row"><span>매출 ROI</span><b>' + (s.roiRevenue === null ? '—' : C.formatPercent(s.roiRevenue, 0)) + '</b></div>' +
        '<div class="formula-row"><span>손익분기 조회수</span><b>' + (breakeven === null ? '—' : C.formatCount(breakeven)) + '</b></div>' +
      '</div>' +
      '<p class="calc-note"><code>CPV = 비용 ÷ 조회수</code>, <code>환산 광고가치 = 조회수 × CPM ÷ 1,000</code><br />' +
      '리뷰를 올린 지원자는 실측 조회수로, 아직인 지원자는 평균 조회수로 계산합니다. 직접 매출을 넣으면 그 기준의 ROI를 먼저 보여 줍니다.</p>';

    /* 채널별 */
    const maxViews = Math.max.apply(null, chans.map((c) => c.views).concat([1]));
    $('#channelPanel').innerHTML = panelHead('채널별 성과', '막대는 조회수 비중 · CPV가 낮을수록 효율적') +
      '<div class="channel-table">' +
        '<div class="ct-row head"><span>채널</span><span class="r">인원</span><span class="r">비용</span><span class="r">조회수</span><span class="r">CPV</span></div>' +
        chans.map((c) =>
          '<div class="ct-row"><span class="ctr-name"><span class="chip-dot" style="--c:' + c.color + '"></span>' + c.short + '</span>' +
          '<span class="r">' + c.count + '</span>' +
          '<span class="r">' + C.formatWonShort(c.cost) + '</span>' +
          '<span class="r"><b>' + C.formatCount(c.views) + '</b></span>' +
          '<span class="r">' + C.formatCpv(c.cpv) + '</span></div>' +
          '<div class="bar-row" style="grid-template-columns:1fr;padding:0 0 7px"><span class="bar-track"><i class="bar-fill" style="width:' + Math.round((c.views / maxViews) * 100) + '%"></i></span></div>'
        ).join('') +
      '</div>';

    /* 퍼널 */
    const maxCount = Math.max.apply(null, stages.map((x) => x.count).concat([1]));
    $('#funnelPanel').innerHTML = panelHead('진행 단계', '12명 중 어디에 몰려 있는지') +
      '<div class="funnel">' + stages.map((st) =>
        '<div class="funnel-row"><span class="fl"><span class="chip-dot" style="--c:' + st.color + '"></span>' + st.short + '</span>' +
        '<span class="funnel-track"><i class="funnel-fill" style="width:' + Math.max(4, Math.round((st.count / maxCount) * 100)) + '%"></i></span>' +
        '<span class="fc">' + st.count + '명 <small>' + (st.cost ? C.formatWonShort(st.cost) : '') + '</small></span></div>'
      ).join('') + '</div>';

    /* 마감 관리 */
    const dueHtml = dues.length ? dues.slice(0, 6).map((row) => {
      const a = row.a;
      const url = safeUrl(a.reviewUrl);
      return '<div class="due-item" data-id="' + esc(a.id) + '">' +
        '<div class="di-main"><span class="di-name">' + esc(a.name) + '</span>' +
        '<span class="di-sub">' + esc(C.stageLabel(a.stage)) + ' · ' + esc(C.channelShort(a.channel)) + (a.reviewUrl ? ' · 리뷰 링크 있음' : ' · 리뷰 미제출') + '</span></div>' +
        ddayHtml(a) +
        (url ? '<a class="kbtn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">리뷰</a>' : '') +
        '<button type="button" class="kbtn" data-verify="' + esc(a.id) + '">업로드 확인</button>' +
      '</div>';
    }).join('') : '<p class="due-empty">마감이 임박했거나 지난 지원자가 없습니다. 발송·업로드 단계의 지원자에 마감일을 넣어 두면 여기서 먼저 알려 드립니다.</p>';
    $('#duePanel').innerHTML = panelHead('마감 관리', dues.length ? '지연·임박 ' + dues.length + '명' : '여유 있음') +
      '<div class="due-list">' + dueHtml + '</div>';

    /* TOP */
    $('#topPanel').innerHTML = panelHead('지원자별 효율', '실측 조회수가 있는 ' + tops.length + '명 · CPV 낮은 순') +
      (tops.length
        ? '<div class="top-table-wrap"><table class="top-table"><thead><tr><th></th><th>지원자</th><th class="num">비용</th><th class="num">조회수</th><th class="num">참여율</th><th class="num">CPV</th></tr></thead><tbody>' +
          tops.map((t, i) => '<tr><td><span class="rank-pill' + (i === 0 ? ' top1' : '') + '">' + (i + 1) + '</span></td>' +
            '<td>' + esc(t.applicant.name) + ' <span class="muted" style="font-size:10.5px">' + esc(C.channelShort(t.applicant.channel)) + '</span></td>' +
            '<td class="num">' + C.formatWonShort(t.cost) + '</td>' +
            '<td class="num">' + C.formatCount(t.views) + '</td>' +
            '<td class="num">' + C.formatPercent(t.engagementRate) + '</td>' +
            '<td class="num"><b>' + C.formatCpv(t.cpv) + '</b></td></tr>').join('') +
          '</tbody></table></div>'
        : '<p class="due-empty">아직 실측 조회수가 없습니다. 지원자 상세에서 리뷰 조회수를 넣거나 리뷰 단계로 옮기면 여기에 효율 순위가 나옵니다.</p>');

    renderChannelChart(chans);
    renderReport();
  }

  /* ── 모달 공통 ──────────────────────────────────── */
  let lastFocus = null;

  function openModal(inner) {
    lastFocus = document.activeElement;
    const root = $('#modalRoot');
    root.innerHTML = '<div class="modal-backdrop" data-close></div>' + inner;
    root.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    const focusable = root.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (focusable) setTimeout(() => focusable.focus(), 30);
  }

  function closeModal() {
    const root = $('#modalRoot');
    root.hidden = true;
    root.innerHTML = '';
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (e) { /* noop */ }
    }
    lastFocus = null;
  }

  function modalShell(title, sub, body, foot, extraClass) {
    return '<div class="modal ' + (extraClass || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="modal-head"><div><h2>' + esc(title) + '</h2>' + (sub ? '<div class="modal-sub">' + esc(sub) + '</div>' : '') + '</div>' +
      '<button type="button" class="modal-close" data-close aria-label="닫기">✕</button></div>' +
      '<div class="modal-body">' + body + (foot || '') + '</div></div>';
  }

  /* ── 지원자 추가/수정 ───────────────────────────── */
  function applicantFormHtml(a, isNew) {
    const ch = a.channel || state.brief.channels[0] || 'instagram';
    return '<div class="form-row">' +
        '<div style="flex:1.3"><label class="flabel" for="aName">이름(활동명) <em style="color:var(--brand);font-style:normal">*</em></label>' +
        '<input class="input" id="aName" type="text" maxlength="40" value="' + esc(a.name || '') + '" placeholder="예: 데일리글로우" /></div>' +
        '<div><label class="flabel" for="aHandle">핸들</label>' +
        '<input class="input" id="aHandle" type="text" maxlength="40" value="' + esc(a.handle || '') + '" placeholder="@handle" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div><label class="flabel" for="aChannel">채널</label><select class="input" id="aChannel">' +
          C.CHANNELS.map((c) => '<option value="' + c.id + '"' + (c.id === ch ? ' selected' : '') + '>' + c.label + '</option>').join('') +
        '</select></div>' +
        '<div><label class="flabel" for="aStage">진행 단계</label><select class="input" id="aStage">' +
          C.STAGES.map((s) => '<option value="' + s.id + '"' + (s.id === a.stage ? ' selected' : '') + '>' + s.label + '</option>').join('') +
        '</select></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div><label class="flabel" for="aFollowers">팔로워 수</label><input class="input" id="aFollowers" type="number" min="0" value="' + (a.followers || '') + '" placeholder="0" /></div>' +
        '<div><label class="flabel" for="aAvg">평균 조회수</label><input class="input" id="aAvg" type="number" min="0" value="' + (a.avgViews || '') + '" placeholder="0" /></div>' +
        '<div><label class="flabel" for="aFee">원고료(원)</label><input class="input" id="aFee" type="number" min="0" step="1000" value="' + (a.fee || '') + '" placeholder="0" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div><label class="flabel" for="aDue">업로드 마감일</label><input class="input" id="aDue" type="date" value="' + esc(a.dueDate || '') + '" /></div>' +
        '<div><label class="flabel" for="aJoined">신청일</label><input class="input" id="aJoined" type="date" value="' + esc(a.joinedAt || C.todayIso(new Date())) + '" /></div>' +
      '</div>' +
      '<label class="flabel" for="aReview">리뷰 링크</label>' +
      '<input class="input" id="aReview" type="url" maxlength="300" value="' + esc(a.reviewUrl || '') + '" placeholder="https://" />' +
      '<div class="form-row" style="margin-top:12px">' +
        '<div><label class="flabel" for="aViews">실측 조회수</label><input class="input" id="aViews" type="number" min="0" value="' + (a.views || '') + '" placeholder="업로드 후 입력" /></div>' +
        '<div><label class="flabel" for="aLikes">좋아요</label><input class="input" id="aLikes" type="number" min="0" value="' + (a.likes || '') + '" /></div>' +
        '<div><label class="flabel" for="aComments">댓글</label><input class="input" id="aComments" type="number" min="0" value="' + (a.comments || '') + '" /></div>' +
      '</div>' +
      '<label class="flabel" for="aNote">연락처 메모</label>' +
      '<textarea class="input" id="aNote" rows="2" maxlength="240" style="height:64px" placeholder="예: DM 응답 빠름 · 주소 확인 완료">' + esc(a.note || '') + '</textarea>' +
      '<p class="form-error" id="aError"></p>' +
      (isNew ? '' : '<p class="form-note" style="margin-top:4px">단가는 원고료 + 제품가(' + C.formatWon(state.brief.productPrice) + ')로 계산됩니다.</p>');
  }

  function openApplicant(id) {
    const isNew = !id;
    const a = isNew
      ? { stage: 'applied', channel: state.brief.channels[0] || 'instagram', joinedAt: C.todayIso(new Date()), dueDate: '', fee: state.brief.fee }
      : state.applicants.find((x) => x.id === id);
    if (!a) return;
    const foot = '<div class="modal-foot">' +
      (isNew ? '' : '<button type="button" class="btn btn-ghost danger" data-ask-delete="' + esc(a.id) + '">삭제</button>') +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn-ghost" data-close>취소</button>' +
      '<button type="button" class="btn btn-primary" data-save-applicant="' + (isNew ? 'new' : esc(a.id)) + '">' + (isNew ? '등록' : '저장') + '</button>' +
      '</div>';
    openModal(modalShell(isNew ? '지원자 추가' : a.name, isNew ? '직접 입력하거나 CSV로 한 번에 등록할 수 있습니다.' : '값을 고치면 보드와 성과에 바로 반영됩니다.', applicantFormHtml(a, isNew), foot));
  }

  function readApplicantForm() {
    const v = (id) => { const el = $('#' + id); return el ? el.value : ''; };
    return {
      name: v('aName'), handle: v('aHandle'), channel: v('aChannel'), stage: v('aStage'),
      followers: v('aFollowers'), avgViews: v('aAvg'), fee: v('aFee'),
      dueDate: v('aDue'), joinedAt: v('aJoined'), reviewUrl: v('aReview'),
      views: v('aViews'), likes: v('aLikes'), comments: v('aComments'), note: v('aNote'),
    };
  }

  function saveApplicant(id) {
    const data = readApplicantForm();
    const errEl = $('#aError');
    if (!data.name.trim()) {
      if (errEl) errEl.textContent = '이름(활동명)을 입력해 주세요.';
      const nameEl = $('#aName');
      if (nameEl) nameEl.focus();
      return;
    }
    if (id === 'new') {
      const res = C.addApplicant(state.applicants, data, { defaultChannel: state.brief.channels[0], now: new Date() });
      if (res.error) { if (errEl) errEl.textContent = res.error; return; }
      state.applicants = res.list;
      saveApplicants();
      closeModal();
      renderBoard();
      renderCampaignBar();
      toast(res.added.name + ' 님을 지원자로 등록했습니다.');
    } else {
      state.applicants = C.updateApplicant(state.applicants, id, data);
      saveApplicants();
      closeModal();
      renderBoard();
      renderStats();
      renderCampaignBar();
      toast('저장했습니다.');
    }
  }

  /* ── CSV 모달 ───────────────────────────────────── */
  function csvExample() {
    const today = new Date();
    return [
      '이름,핸들,채널,팔로워,평균 조회수,원고료,마감일,리뷰 URL,조회수,좋아요,댓글,메모',
      '뷰티로그,@beauty.log,인스타,1.2만,3.4만,50000,' + C.addDays(today, 14) + ',,,,' + 'DM 응답 빠름',
      '살림노트,@salim.note,블로그,8600,21000,45000,' + C.addDays(today, 10) + ',,,,' + '주 1회 포스팅',
      '한끼영상,@one.meal,유튜브,24000,88000,60000,' + C.addDays(today, 7) + ',https://example.com/r/one-meal,120000,4200,310,' + '쇼츠와 롱폼',
    ].join('\n');
  }

  function openCsv() {
    const body =
      '<p class="form-note">엑셀·시트에서 복사한 표를 그대로 붙여넣거나 .csv 파일을 고르세요. 첫 줄에 헤더가 있으면 열 이름으로 맞추고, 없으면 <code>이름, 핸들, 채널, 팔로워, 평균 조회수, 원고료, 마감일, 메모</code> 순서로 읽습니다.</p>' +
      '<div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-csv-example>예시 넣기</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-csv-file>파일 선택</button>' +
        '<input type="file" id="csvFile" class="file-input" accept=".csv,text/csv,text/plain" />' +
      '</div>' +
      '<label class="flabel" for="csvText">붙여넣기</label>' +
      '<textarea class="input" id="csvText" spellcheck="false" placeholder="이름,핸들,채널,팔로워,평균 조회수,원고료,마감일,메모&#10;뷰티로그,@beauty.log,인스타,1.2만,3.4만,50000,' + C.addDays(new Date(), 14) + ',DM 응답 빠름"></textarea>' +
      '<div class="csv-preview" id="csvPreview">내용을 붙여넣으면 인식 결과가 여기에 나옵니다.</div>' +
      '<div class="modal-foot"><span class="spacer"></span>' +
        '<button type="button" class="btn btn-ghost" data-close>취소</button>' +
        '<button type="button" class="btn btn-primary" id="csvImport" disabled>가져오기</button>' +
      '</div>';
    openModal(modalShell('CSV 일괄 등록', '여러 명을 한 번에 · 중복 핸들은 가져올 때 자동 제외', body, '', 'large'));
    state.csvRows = [];
    state.csvErrors = [];
  }

  function refreshCsvPreview() {
    const text = $('#csvText') ? $('#csvText').value : '';
    const preview = $('#csvPreview');
    const btn = $('#csvImport');
    if (!preview || !btn) return;
    if (!text.trim()) {
      preview.textContent = '내용을 붙여넣으면 인식 결과가 여기에 나옵니다.';
      btn.disabled = true;
      state.csvRows = [];
      state.csvErrors = [];
      return;
    }
    const res = C.parseApplicantsCsv(text, {
      defaultChannel: state.brief.channels[0] || 'instagram',
      defaultFee: state.brief.fee,
      now: new Date(),
    });
    state.csvRows = res.rows;
    state.csvErrors = res.errors;
    btn.disabled = res.rows.length === 0;
    let html = '<b>' + res.rows.length + '명</b> 인식' +
      (res.headerDetected ? ' · 헤더 자동 인식' : ' · 헤더 없이 순서대로 인식') +
      (res.delimiter === 'tab' ? ' · 탭 구분' : '') +
      (res.errors.length ? ' · <span class="err">오류 ' + res.errors.length + '건</span>' : '');
    if (res.errors.length) {
      html += '<br />' + res.errors.slice(0, 6).map((e) => '<span class="err">' + (e.line ? e.line + '행: ' : '') + esc(e.message) + '</span>').join('<br />');
    }
    html += '<br /><span class="muted">중복 핸들은 가져올 때 건너뜁니다.</span>';
    preview.innerHTML = html;
  }

  function importCsv() {
    if (!state.csvRows.length) return;
    const res = C.mergeApplicants(state.applicants, state.csvRows, { now: new Date() });
    state.applicants = res.list;
    saveApplicants();
    closeModal();
    renderBoard();
    renderCampaignBar();
    let msg = res.added.length + '명을 추가했습니다.';
    if (res.duplicates.length) msg += ' 중복 ' + res.duplicates.length + '명 제외.';
    toast(msg);
  }

  /* ── 내보내기/백업 ──────────────────────────────── */
  function openExport() {
    const body =
      '<div class="export-list">' +
        '<div class="export-item"><div class="ei-main"><span class="ei-title">지원자 CSV (UTF-8 BOM)</span>' +
          '<span class="ei-sub">엑셀에서 바로 열립니다. 단계·단가·마감·리뷰 링크·실측 지표 포함 · ' + state.applicants.length + '건</span></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-export="csv">내려받기</button></div>' +
        '<div class="export-item"><div class="ei-main"><span class="ei-title">전체 백업 JSON</span>' +
          '<span class="ei-sub">캠페인 조건 + 지원자 + 기준 CPM·매출까지 한 파일로</span></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-export="json">내려받기</button></div>' +
        '<div class="export-item"><div class="ei-main"><span class="ei-title">JSON 불러오기</span>' +
          '<span class="ei-sub">백업 파일로 지금 보드를 덮어씁니다</span></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-import-json>파일 선택</button>' +
          '<input type="file" id="jsonFile" class="file-input" accept="application/json,.json" /></div>' +
        '<div class="export-item"><div class="ei-main"><span class="ei-title">데모 데이터로 초기화</span>' +
          '<span class="ei-sub">지금 보드를 지우고 데모 캠페인·지원자 12명으로 되돌립니다</span></div>' +
          '<button type="button" class="btn btn-ghost btn-sm danger" data-reset-demo>초기화</button></div>' +
      '</div>' +
      '<p class="form-note" style="margin-top:12px">모든 파일은 이 브라우저에서 만들어지고 어디로도 전송되지 않습니다. 브라우저 데이터를 지우기 전에 JSON 백업을 받아 두세요.</p>';
    openModal(modalShell('내보내기 · 백업', '파일은 내 컴퓨터에만 저장됩니다', body));
  }

  /* ── 캠페인 설정 ────────────────────────────────── */
  function openCampaign() {
    const b = state.brief;
    const body =
      '<div class="form-row">' +
        '<div><label class="flabel" for="cProduct">제품명</label><input class="input" id="cProduct" type="text" maxlength="80" value="' + esc(b.product) + '" /></div>' +
        '<div><label class="flabel" for="cBrand">브랜드명</label><input class="input" id="cBrand" type="text" maxlength="40" value="' + esc(b.brand) + '" /></div>' +
      '</div>' +
      '<div class="form-row" style="margin-top:10px">' +
        '<div><label class="flabel" for="cPrice">제품가(원)</label><input class="input" id="cPrice" type="number" min="0" step="1000" value="' + b.productPrice + '" /></div>' +
        '<div><label class="flabel" for="cFee">기본 원고료(원)</label><input class="input" id="cFee" type="number" min="0" step="1000" value="' + b.fee + '" /></div>' +
        '<div><label class="flabel" for="cHead">모집 인원</label><input class="input" id="cHead" type="number" min="1" max="500" value="' + b.headcount + '" /></div>' +
      '</div>' +
      '<p class="form-note" style="margin-top:10px">제품가는 지원자 단가(원고료 + 제품가)와 성과 계산에 쓰입니다. 채널·문구·마감일은 <b>캠페인 공고</b> 탭에서 고칩니다.</p>' +
      '<div class="modal-foot"><span class="spacer"></span>' +
        '<button type="button" class="btn btn-ghost" data-close>취소</button>' +
        '<button type="button" class="btn btn-primary" data-save-campaign>저장</button>' +
      '</div>';
    openModal(modalShell('캠페인 설정', C.campaignName(b), body));
  }

  function saveCampaign() {
    const v = (id) => { const el = $('#' + id); return el ? el.value : ''; };
    state.brief = C.normalizeBrief(Object.assign({}, state.brief, {
      product: v('cProduct'), brand: v('cBrand'), productPrice: v('cPrice'), fee: v('cFee'), headcount: v('cHead'),
    }));
    saveBrief();
    closeModal();
    fillBriefForm();
    renderCampaignBar();
    renderBriefOutput();
    renderBoard();
    renderStats();
    toast('캠페인 조건을 저장했습니다.');
  }

  /* ── 이벤트 ─────────────────────────────────────── */
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const t = e.target;

      /* 탭 */
      const tab = t.closest('.tab[data-tab]');
      if (tab) { e.preventDefault(); setView(tab.dataset.tab); return; }

      /* 공통 액션 */
      const actionEl = t.closest('[data-action]');
      if (actionEl) {
        const action = actionEl.dataset.action;
        if (action === 'go-board') { e.preventDefault(); setView('board'); return; }
        if (action === 'toggle-theme') {
          state.prefs.theme = state.prefs.theme === 'dark' ? 'light' : 'dark';
          savePrefs(); applyTheme(); return;
        }
        if (action === 'open-add') { openApplicant(null); return; }
        if (action === 'open-campaign') { openCampaign(); return; }
        if (action === 'copy-out') { copyText(docText(state.built || C.buildBrief(state.brief)), '클립보드에 복사했습니다.'); return; }
        if (action === 'revert-doc') { revertDoc(); return; }
        if (action === 'apply-wordfix') { applyWordFix(); return; }
        if (action === 'set-fw') {
          state.introFw = actionEl.dataset.fw;
          renderIntro();
          return;
        }
        if (action === 'copy-intro') {
          if (state.introBuilt) copyText(state.introBuilt.body, state.introBuilt.id + ' 도입부를 복사했습니다.');
          return;
        }
        if (action === 'intro-to-posting') { introToPosting(); return; }
        if (action === 'copy-ai-prompt') {
          const mode = actionEl.dataset.mode === 'report' ? 'report' : 'brief';
          const p = state.aiPrompts[mode] || promptFor(mode);
          copyText(p.prompt, 'AI 프롬프트(' + p.chars.toLocaleString('ko-KR') + '자)를 복사했습니다. AI 창에 붙여넣으세요.');
          return;
        }
        if (action === 'bridge-open') {
          e.preventDefault();
          bridgeOpen(actionEl.dataset.mode === 'report' ? 'report' : 'brief', actionEl.dataset.provider);
          return;
        }
        if (action === 'apply-ai-answer') { applyAiAnswer(); return; }
        if (action === 'clear-ai-answer') { clearAnswer('brief'); return; }
        if (action === 'apply-rep-answer') { applyRepAnswer(); return; }
        if (action === 'clear-rep-answer') { clearAnswer('report'); return; }
        if (action === 'free-generate') {
          freeGenerate(actionEl.dataset.mode === 'report' ? 'report' : 'brief');
          return;
        }
        if (action === 'gemini-generate') {
          geminiGenerate(actionEl.dataset.mode === 'report' ? 'report' : 'brief');
          return;
        }
        if (action === 'save-gemini') {
          saveGemini(actionEl.dataset.mode === 'report' ? 'report' : 'brief');
          toast(state.ai.geminiKey ? 'Gemini 키를 이 브라우저에 저장했습니다.' : 'Gemini 키를 지웠습니다.');
          return;
        }
        if (action === 'copy-report') { copyReport(); return; }
        if (action === 'download-report') { downloadReport(); return; }
        if (action === 'revert-report') {
          state.ai.report = '';
          saveAi(); renderReport(); renderBridge('report');
          toast('리포트를 자동 생성본으로 되돌렸습니다.');
          return;
        }
        if (action === 'download-out') {
          const names = { posting: '체험단-모집공고', dm: '체험단-선정안내-DM', email: '체험단-선정안내-메일', guide: '체험단-가이드-대가성문구' };
          download(names[state.doc] + '-' + stamp() + '.txt', docText(state.built || C.buildBrief(state.brief)));
          toast('.txt 파일로 저장했습니다.');
          return;
        }
        if (action === 'apply-brief') {
          state.brief = readBriefForm();
          saveBrief(); renderCampaignBar(); renderBrief();
          toast('캠페인 조건을 저장했습니다. 지원자 보드에 바로 반영됩니다.');
          setView('board');
          return;
        }
        if (action === 'reset-brief') {
          state.brief = C.normalizeBrief(D.demoBrief(new Date()));
          saveBrief(); fillBriefForm(); renderCampaignBar(); renderBrief();
          toast('예시 조건으로 되돌렸습니다.');
          return;
        }
        if (action === 'open-csv') { openCsv(); return; }
        if (action === 'open-export') { openExport(); return; }
        if (action === 'clear-search') {
          state.query = ''; renderBoard(); return;
        }
        if (action === 'reset-filters') {
          state.query = ''; state.channel = 'all'; state.due = 'all'; renderBoard(); return;
        }
      }

      /* 공고 결과 탭 */
      const docTab = t.closest('.out-tab[data-doc]');
      if (docTab) {
        state.doc = docTab.dataset.doc;
        $$('.out-tab[data-doc]').forEach((b) => {
          const on = b.dataset.doc === state.doc;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderBriefOutput();
        return;
      }

      /* 채널 칩 */
      const chip = t.closest('[data-channel]');
      if (chip) { state.channel = chip.dataset.channel; renderBoard(); return; }
      const dueChip = t.closest('[data-due]');
      if (dueChip) { state.due = dueChip.dataset.due; renderBoard(); return; }

      /* 보기 방식 */
      const seg = t.closest('[data-boardview]');
      if (seg) {
        state.prefs.boardView = seg.dataset.boardview;
        savePrefs(); renderBoard(); return;
      }

      /* 카드 이동/상세 */
      const moveBtn = t.closest('[data-move]');
      if (moveBtn) {
        const card = moveBtn.closest('.kcard');
        const a = card && state.applicants.find((x) => x.id === card.dataset.id);
        if (a) {
          const next = Number(moveBtn.dataset.move) > 0 ? C.nextStage(a.stage) : C.prevStage(a.stage);
          state.applicants = C.moveApplicant(state.applicants, a.id, next);
          saveApplicants(); renderBoard(); renderCampaignBar();
        }
        return;
      }
      const editBtn = t.closest('[data-edit]');
      if (editBtn) {
        const card = editBtn.closest('.kcard');
        if (card) openApplicant(card.dataset.id);
        return;
      }
      const verify = t.closest('[data-verify]');
      if (verify) {
        state.applicants = C.moveApplicant(state.applicants, verify.dataset.verify, 'uploaded');
        saveApplicants(); renderStats(); renderBoard(); renderCampaignBar();
        toast('리뷰 업로드로 옮겼습니다. 리뷰 링크와 조회수를 상세에서 채워 주세요.');
        return;
      }
      const kcard = t.closest('.kcard');
      if (kcard && !t.closest('a, button')) { openApplicant(kcard.dataset.id); return; }

      /* 모달 내부 */
      const closeEl = t.closest('[data-close]');
      if (closeEl) { closeModal(); return; }

      const saveBtn = t.closest('[data-save-applicant]');
      if (saveBtn) { saveApplicant(saveBtn.dataset.saveApplicant); return; }

      const askDelete = t.closest('[data-ask-delete]');
      if (askDelete) {
        if (askDelete.dataset.confirmed === '1') {
          const id = askDelete.dataset.askDelete;
          const a = state.applicants.find((x) => x.id === id);
          state.applicants = C.removeApplicant(state.applicants, id);
          saveApplicants(); closeModal(); renderBoard(); renderCampaignBar();
          toast((a ? a.name : '지원자') + ' 님을 보드에서 삭제했습니다.');
        } else {
          askDelete.dataset.confirmed = '1';
          askDelete.textContent = '정말 삭제';
          askDelete.classList.add('btn-primary');
          askDelete.classList.remove('btn-ghost');
        }
        return;
      }

      if (t.closest('[data-csv-example]')) {
        $('#csvText').value = csvExample();
        refreshCsvPreview();
        return;
      }
      if (t.closest('[data-csv-file]')) { $('#csvFile').click(); return; }
      if (t.closest('#csvImport')) { importCsv(); return; }

      const exp = t.closest('[data-export]');
      if (exp) {
        if (exp.dataset.export === 'csv') {
          download('체험단-지원자-' + stamp() + '.csv', C.toCsv(state.applicants, { productPrice: state.brief.productPrice }), 'text/csv;charset=utf-8');
          toast('CSV로 내려받았습니다. (UTF-8 BOM · 엑셀 호환)');
        } else {
          download('체험단-백업-' + stamp() + '.json', JSON.stringify(C.toBackup(state.brief, state.applicants, state.prefs), null, 2), 'application/json');
          toast('JSON 백업을 내려받았습니다.');
        }
        return;
      }
      if (t.closest('[data-import-json]')) { $('#jsonFile').click(); return; }
      if (t.closest('[data-reset-demo]')) {
        const btn = t.closest('[data-reset-demo]');
        if (btn.dataset.confirmed === '1') {
          seedDemo(true);
          closeModal(); fillBriefForm(); renderCampaignBar(); renderBoard(); renderStats();
          toast('데모 캠페인과 지원자 12명으로 되돌렸습니다.');
        } else {
          btn.dataset.confirmed = '1';
          btn.textContent = '정말 초기화';
        }
        return;
      }
      if (t.closest('[data-save-campaign]')) { saveCampaign(); return; }
    });

    /* ESC · 포커스 트랩 */
    document.addEventListener('keydown', (e) => {
      const root = $('#modalRoot');
      if (!root || root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key === 'Tab') {
        const focusables = $$('button, [href], input:not(.file-input), select, textarea', root).filter((el) => !el.disabled && el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    /* 공고 폼 */
    const form = $('#briefForm');
    let briefTimer = null;
    const onInput = () => {
      clearTimeout(briefTimer);
      briefTimer = setTimeout(onBriefInput, 120);
    };
    form.addEventListener('input', onInput);
    form.addEventListener('change', () => {
      $$('#fChannels input[type="checkbox"]').forEach((input) => {
        const card = input.closest('.check-card');
        if (card) card.classList.toggle('is-on', input.checked);
      });
      onBriefInput();
    });
    form.addEventListener('submit', (e) => e.preventDefault());

    /* 검색 */
    const search = $('#searchInput');
    let searchTimer = null;
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = search.value.trim();
        renderBoard();
        search.focus();
      }, 140);
    });

    /* 정렬 */
    $('#sortSelect').innerHTML = C.SORTS.map((s) => '<option value="' + s.id + '">' + s.label + '</option>').join('');
    $('#sortSelect').addEventListener('change', (e) => {
      state.prefs.sort = e.target.value;
      savePrefs(); renderBoard();
    });

    /* 리스트 단계 변경 */
    document.addEventListener('change', (e) => {
      if (e.target.id === 'aiPersonal' || e.target.id === 'repPersonal') {
        state.ai.personal = !!e.target.checked;
        personalChanged();
        return;
      }
      const sel = e.target.closest('[data-stage-select]');
      if (sel) {
        state.applicants = C.moveApplicant(state.applicants, sel.dataset.stageSelect, sel.value);
        saveApplicants(); renderBoard(); renderCampaignBar();
        return;
      }
      if (e.target.id === 'csvFile') {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const ta = $('#csvText');
          if (ta) { ta.value = String(reader.result || ''); refreshCsvPreview(); }
        };
        reader.readAsText(file, 'utf-8');
        return;
      }
      if (e.target.id === 'jsonFile') {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const res = C.parseBackup(String(reader.result || ''));
          if (res.error) { toast(res.error, 'warn'); return; }
          state.brief = res.data.brief;
          state.applicants = res.data.applicants;
          state.prefs = Object.assign({}, state.prefs, res.data.prefs);
          saveAll();
          applyTheme();
          closeModal();
          fillBriefForm();
          renderCampaignBar();
          renderBoard();
          renderStats();
          toast('백업을 불러왔습니다. 지원자 ' + state.applicants.length + '명.');
        };
        reader.readAsText(file, 'utf-8');
      }
    });

    /* CSV 미리보기 · 도입부 입력 · AI 답변 */
    let introTimer = null;
    document.addEventListener('input', (e) => {
      if (e.target.id === 'csvText') refreshCsvPreview();
      if (e.target.id === 'cpmInput' || e.target.id === 'revenueInput') {
        state.prefs.cpm = Math.max(0, C.parseNumber($('#cpmInput').value, C.DEFAULT_CPM));
        state.prefs.revenue = Math.max(0, C.parseNumber($('#revenueInput').value, 0));
        savePrefs();
        renderStats();
      }
      if (e.target.id === 'aiAnswer') renderAnswer('brief');
      if (e.target.id === 'repAnswer') renderAnswer('report');
      const introKey = e.target.id === 'iProblem' ? 'problem' : e.target.id === 'iOutcome' ? 'solution' : e.target.id === 'iProof' ? 'proof' : null;
      if (introKey) {
        state.intro[introKey] = e.target.value;
        clearTimeout(introTimer);
        introTimer = setTimeout(renderIntro, 160);
      }
    });

    /* 드래그앤드롭 — SortableJS 가 붙어 있으면 그쪽이 처리한다(중복 이동 방지). */
    let dragId = null;
    document.addEventListener('dragstart', (e) => {
      if (BE && BE.isMounted && BE.isMounted()) return;
      const card = e.target.closest('.kcard');
      if (!card) return;
      dragId = card.dataset.id;
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* noop */ }
      }
    });
    document.addEventListener('dragend', (e) => {
      const card = e.target.closest('.kcard');
      if (card) card.classList.remove('dragging');
      $$('.col.is-over').forEach((c) => c.classList.remove('is-over'));
      dragId = null;
    });
    document.addEventListener('dragover', (e) => {
      const col = e.target.closest('.col');
      if (!col) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      $$('.col.is-over').forEach((c) => { if (c !== col) c.classList.remove('is-over'); });
      col.classList.add('is-over');
    });
    document.addEventListener('dragleave', (e) => {
      const col = e.target.closest('.col');
      if (col && !col.contains(e.relatedTarget)) col.classList.remove('is-over');
    });
    document.addEventListener('drop', (e) => {
      if (BE && BE.isMounted && BE.isMounted()) return;
      const col = e.target.closest('.col');
      if (!col) return;
      e.preventDefault();
      const id = dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (!id) return;
      state.applicants = C.moveApplicant(state.applicants, id, col.dataset.stage);
      saveApplicants();
      $$('.col.is-over').forEach((c) => c.classList.remove('is-over'));
      dragId = null;
      renderBoard();
      renderCampaignBar();
    });

    /* 백드롭 클릭 */
    $('#modalRoot').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) closeModal();
    });
  }

  /* ── 시작 ───────────────────────────────────────── */
  function init() {
    const prefs = readJson(LS.prefs, null);
    const brief = readJson(LS.brief, null);
    const applicants = readJson(LS.applicants, null);

    if (prefs && typeof prefs === 'object') {
      state.prefs = Object.assign({}, D.demoPrefs(), prefs);
    } else {
      state.prefs = D.demoPrefs();
    }
    if (brief && applicants && Array.isArray(applicants)) {
      state.brief = C.normalizeBrief(brief);
      state.applicants = applicants.map((a) => C.normalizeApplicant(a));
    } else {
      seedDemo(true);
    }
    if (!state.prefs.cpm) state.prefs.cpm = C.DEFAULT_CPM;

    applyTheme();
    const savedAi = readJson(LS.ai, null);
    if (savedAi && typeof savedAi === 'object') {
      state.ai.docs = Object.assign({ posting: '', dm: '', email: '', guide: '' }, savedAi.docs || {});
      state.ai.report = typeof savedAi.report === 'string' ? savedAi.report : '';
      state.ai.personal = !!savedAi.personal;
      state.ai.geminiKey = savedAi.geminiKey || '';
      state.ai.geminiModel = savedAi.geminiModel || state.ai.geminiModel;
    }
    bindEvents();
    fillGeminiInputs();
    fillBriefForm();
    renderCampaignBar();
    renderBrief();
    renderBoard();
    renderStats();
    renderReport();
    setView('board');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
