/* ============================================================
   체험단 매칭 보드 · core.js
   DOM 없는 순수 로직: 숫자/날짜 포맷, 캠페인 공고문 생성,
   지원자 파이프라인, CSV 파싱/내보내기, 성과(CPV·ROI) 계산.
   브라우저에서는 window.CORE, Node에서는 module.exports.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ── 상수 ─────────────────────────────────────────── */
  const CHANNELS = [
    { id: 'instagram', label: '인스타그램 릴스', short: '인스타', color: '#e1306c' },
    { id: 'blog', label: '네이버 블로그', short: '블로그', color: '#03c75a' },
    { id: 'youtube', label: '유튜브 (쇼츠 포함)', short: '유튜브', color: '#ff2d2d' },
    { id: 'threads', label: '스레드', short: '스레드', color: '#4338ca' },
  ];

  const STAGES = [
    { id: 'applied', label: '모집 지원', short: '지원', color: '#94a3b8' },
    { id: 'selected', label: '선정 완료', short: '선정', color: '#7c5cff' },
    { id: 'shipped', label: '제품 발송', short: '발송', color: '#0ea5e9' },
    { id: 'uploaded', label: '리뷰 업로드', short: '업로드', color: '#f59e0b' },
    { id: 'settled', label: '정산·마감', short: '정산', color: '#16a34a' },
  ];

  const CHANNEL_ALIASES = {
    instagram: ['instagram', 'insta', 'ig', '인스타', '인스타그램', '릴스', 'reels', '인스타릴스', '인스타그램릴스'],
    blog: ['blog', 'naver', 'naverblog', '블로그', '네이버 블로그', '네이버블로그', '네이버'],
    youtube: ['youtube', 'yt', 'shorts', '유튜브', '쇼츠', '유튜브쇼츠'],
    threads: ['threads', 'thread', '스레드', '쓰레드'],
  };

  const STAGE_ALIASES = {
    applied: ['applied', 'apply', '지원', '모집지원', '지원접수', '신청', '대기'],
    selected: ['selected', 'select', '선정', '선정완료', '선정됨'],
    shipped: ['shipped', 'shipping', '발송', '제품발송', '배송', '배송중'],
    uploaded: ['uploaded', 'upload', '업로드', '리뷰업로드', '게시', '게시완료'],
    settled: ['settled', 'settle', '정산', '정산완료', '정산마감', '마감', '완료'],
  };

  const HEADER_ALIASES = {
    name: ['이름', '성명', '활동명', '지원자', '지원자명', 'name', 'creator', 'nickname', '닉네임'],
    handle: ['핸들', '아이디', '계정', '계정명', 'handle', 'username', 'account', 'id'],
    channel: ['채널', '플랫폼', '매체', 'channel', 'platform', 'sns'],
    followers: ['팔로워', '팔로워수', '구독자', '구독자수', 'followers', 'follower', 'subscribers'],
    avgViews: ['평균조회수', '평균조회', '평균뷰', '평균조회수(회)', 'avgviews', 'avg_views', 'avgview', 'avg'],
    fee: ['원고료', '원고료(원)', '단가', '예상단가', 'fee', 'payment', 'cost', '비용'],
    dueDate: ['마감일', '업로드마감', '업로드마감일', '마감', 'due', 'due_date', 'deadline', 'duedate'],
    note: ['메모', '연락처메모', '연락처', '비고', 'note', 'memo', 'contact', 'etc'],
    reviewUrl: ['리뷰url', '리뷰링크', '게시물url', '게시물링크', 'review_url', 'reviewurl', 'url', 'link', '링크'],
    views: ['조회수', '실제조회수', '실조회수', 'views', 'view', '조회'],
    likes: ['좋아요', '좋아용수', '좋아요수', 'likes', 'like'],
    comments: ['댓글', '댓글수', 'comments', 'comment'],
    stage: ['진행상태', '진행단계', '상태', '단계', 'stage', 'status'],
    joinedAt: ['신청일', '지원일', '지원날짜', 'joined', 'joined_at', 'appliedat', 'applied_at'],
  };

  const POSITIONAL_ORDER = ['name', 'handle', 'channel', 'followers', 'avgViews', 'fee', 'dueDate', 'note', 'reviewUrl', 'views', 'likes', 'comments', 'stage'];
  const DEFAULT_CPM = 8000;

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  /* ── 숫자 ─────────────────────────────────────────── */
  function num(v, fallback) {
    if (v === null || v === undefined || v === '') return fallback === undefined ? 0 : fallback;
    if (typeof v === 'number') return isFinite(v) ? v : (fallback === undefined ? 0 : fallback);
    const n = Number(v);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }

  function parseNumber(value, fallback) {
    const fb = fallback === undefined ? 0 : fallback;
    if (value === null || value === undefined) return fb;
    if (typeof value === 'number') return isFinite(value) ? value : fb;
    let s = String(value).trim();
    if (!s) return fb;
    s = s.replace(/\s|,/g, '');
    s = s.replace(/(원|명|회|건|개|팔로워|followers?)$/i, '');
    const m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return fb;
    let n = parseFloat(m[0]);
    const unitMatch = s.match(/\d(억|만|천|k|m)/i);
    if (unitMatch) {
      const u = unitMatch[1].toLowerCase();
      if (u === '억') n *= 1e8;
      else if (u === '만') n *= 1e4;
      else if (u === '천') n *= 1e3;
      else if (u === 'k') n *= 1e3;
      else if (u === 'm') n *= 1e6;
    }
    return Math.round(n);
  }

  function trim1(v) {
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  function group1(v) {
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r)
      ? r.toLocaleString('en-US')
      : r.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function formatNumber(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function formatCount(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const v = Math.round(n);
    const abs = Math.abs(v);
    if (abs < 10000) return v.toLocaleString('en-US');
    if (abs < 1e8) return group1(v / 1e4) + '만';
    return group1(v / 1e8) + '억';
  }

  function formatWon(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US') + '원';
  }

  function formatWonShort(n) {
    if (n === null || n === undefined || !isFinite(n) || n === 0) return n === 0 ? '0원' : '—';
    const v = Math.round(n);
    const abs = Math.abs(v);
    if (abs >= 1e8) return group1(v / 1e8) + '억원';
    if (abs >= 1e4) return group1(v / 1e4) + '만원';
    return v.toLocaleString('en-US') + '원';
  }

  function formatCpv(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    if (n === 0) return '0원';
    if (Math.abs(n) < 1) return n.toFixed(2) + '원';
    if (Math.abs(n) < 10) return n.toFixed(2) + '원';
    if (Math.abs(n) < 100) return n.toFixed(1) + '원';
    return Math.round(n).toLocaleString('en-US') + '원';
  }

  function formatPercent(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const d = digits === undefined ? 1 : digits;
    return n.toFixed(d) + '%';
  }

  /* ── 날짜 ─────────────────────────────────────────── */
  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    const s = String(value).trim();
    const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const m2 = s.match(/^(\d{1,2})[-./](\d{1,2})$/);
    if (m2) return new Date(new Date().getFullYear(), +m2[1] - 1, +m2[2]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function startOfDay(d) {
    const x = d instanceof Date ? d : parseDate(d);
    if (!x) return null;
    return new Date(x.getFullYear(), x.getMonth(), x.getDate());
  }

  function toIsoDate(value) {
    const d = parseDate(value);
    if (!d) return '';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function addDays(value, days) {
    const d = parseDate(value) || new Date();
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + num(days));
    return toIsoDate(x);
  }

  function todayIso(now) {
    return toIsoDate(now || new Date());
  }

  function daysLeft(due, now) {
    const d = startOfDay(due);
    if (!d) return null;
    const n = startOfDay(now || new Date());
    return Math.round((d.getTime() - n.getTime()) / 86400000);
  }

  function ddayLabel(days) {
    if (days === null || days === undefined) return '—';
    if (days === 0) return 'D-DAY';
    return days > 0 ? 'D-' + days : 'D+' + Math.abs(days);
  }

  function formatKoreanDate(value) {
    const d = parseDate(value);
    if (!d) return '';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + '(' + WEEKDAYS[d.getDay()] + ')';
  }

  function formatShortDate(value) {
    const d = parseDate(value);
    if (!d) return '';
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getMonth() + 1) + '.' + p(d.getDate());
  }

  /* ── 목록/라벨 ────────────────────────────────────── */
  function channelById(id) {
    return CHANNELS.find((c) => c.id === id) || CHANNELS[0];
  }
  function channelLabel(id) {
    return channelById(id).label;
  }
  function channelShort(id) {
    return channelById(id).short;
  }
  function stageById(id) {
    return STAGES.find((s) => s.id === id) || STAGES[0];
  }
  function stageLabel(id) {
    return stageById(id).label;
  }
  function stageIndex(id) {
    const i = STAGES.findIndex((s) => s.id === id);
    return i < 0 ? 0 : i;
  }
  function nextStage(id) {
    const i = stageIndex(id);
    return STAGES[Math.min(STAGES.length - 1, i + 1)].id;
  }
  function prevStage(id) {
    const i = stageIndex(id);
    return STAGES[Math.max(0, i - 1)].id;
  }

  function normToken(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s()\[\]{}·:/.\\_-]/g, '');
  }

  function matchAlias(groups, value) {
    const raw = normToken(value);
    if (!raw) return '';
    const keys = Object.keys(groups);
    for (const id of keys) {
      if (groups[id].some((a) => normToken(a) === raw)) return id;
    }
    for (const id of keys) {
      if (groups[id].some((a) => {
        const t = normToken(a);
        return t.length >= 3 && raw.indexOf(t) >= 0;
      })) return id;
    }
    return '';
  }

  function normalizeChannel(value) {
    return matchAlias(CHANNEL_ALIASES, value);
  }

  function normalizeStage(value) {
    return matchAlias(STAGE_ALIASES, value);
  }

  function splitList(value) {
    if (Array.isArray(value)) {
      return value.flatMap((v) => splitList(v));
    }
    return String(value || '')
      .split(/[,\n;、]+|\s{1,}/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function normalizeHashtags(value) {
    const seen = new Set();
    const out = [];
    splitList(value).forEach((token) => {
      const tag = String(token).replace(/^#+/, '').replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ_]/g, '').trim();
      if (!tag) return;
      const key = tag.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push('#' + tag);
    });
    return out.slice(0, 12);
  }

  function normalizeChannels(value) {
    const list = Array.isArray(value) ? value : splitList(value);
    const ids = list.map((v) => normalizeChannel(v) || v).filter((v) => CHANNELS.some((c) => c.id === v));
    const uniq = Array.from(new Set(ids));
    return CHANNELS.filter((c) => uniq.includes(c.id)).map((c) => c.id);
  }

  function clamp(n, lo, hi) {
    n = parseNumber(n);
    return Math.min(hi, Math.max(lo, n));
  }

  /* ── 캠페인 입력 정규화 ──────────────────────────── */
  function normalizeBrief(raw) {
    const r = raw || {};
    const channels = normalizeChannels(r.channels || ['instagram']);
    const brief = {
      brand: String(r.brand || '').trim().slice(0, 40),
      product: String(r.product || '').trim().slice(0, 80),
      productPrice: clamp(r.productPrice, 0, 100000000),
      fee: clamp(r.fee, 0, 100000000),
      headcount: Math.round(clamp(r.headcount === undefined || r.headcount === '' ? 10 : r.headcount, 1, 500)),
      channels: channels.length ? channels : ['instagram'],
      hashtags: normalizeHashtags(r.hashtags),
      mission: String(r.mission || '').trim().slice(0, 600),
      applyUntil: toIsoDate(r.applyUntil),
      announceOn: toIsoDate(r.announceOn),
      uploadDays: Math.round(clamp(r.uploadDays === undefined || r.uploadDays === '' ? 14 : r.uploadDays, 1, 90)),
      contact: String(r.contact || '').trim().slice(0, 120),
      extra: String(r.extra || '').trim().slice(0, 300),
    };
    return brief;
  }

  function perPersonValue(b) {
    return num(b.productPrice) + num(b.fee);
  }
  function campaignName(b) {
    return (b.product ? b.product + ' ' : '') + '체험단';
  }

  /* ── 공고문 텍스트 ───────────────────────────────── */
  function missionLine(b) {
    return b.mission || '제품을 처음 쓴 순간의 인상과 일상에서 어떻게 쓰고 있는지를 3장 이상의 사진(또는 15초 이상 영상)으로 담아 주세요.';
  }

  function benefitLines(b) {
    const out = [];
    const product = b.product || '제품';
    if (b.productPrice > 0) out.push('· ' + product + ' 1개 (' + formatWon(b.productPrice) + ' 상당)');
    else out.push('· ' + product + ' 1개');
    if (b.fee > 0) out.push('· 원고료 ' + formatWon(b.fee) + ' (리뷰 업로드와 링크 회신 확인 후 지급)');
    else if (b.productPrice > 0) out.push('· 별도 원고료 없이 제품만 제공됩니다.');
    if (b.extra) out.push('· 추가 혜택 : ' + b.extra);
    if (perPersonValue(b) > 0) out.push('· 인당 혜택가 : ' + formatWon(perPersonValue(b)) + ' 상당');
    if (b.fee > 0) out.push('· 총 지급 원고료 : ' + formatWon(b.fee * b.headcount) + ' (' + b.headcount + '명 기준)');
    return out;
  }

  function disclosureBasic(b) {
    const brand = b.brand || '브랜드';
    const product = b.product || '제품';
    if (b.fee > 0 && b.productPrice > 0) {
      return '본 콘텐츠는 ' + brand + '로부터 ' + product + '와 원고료 ' + formatWon(b.fee) + '을 제공받아 작성했습니다.';
    }
    if (b.fee > 0) {
      return '본 콘텐츠는 ' + brand + '로부터 원고료 ' + formatWon(b.fee) + '을 제공받아 작성했습니다.';
    }
    return '본 콘텐츠는 ' + brand + '로부터 ' + product + '를 제공받아 작성했습니다.';
  }

  function channelAudienceLine(id) {
    switch (id) {
      case 'instagram': return '· 인스타그램 릴스나 피드에 직접 촬영한 일상 콘텐츠를 꾸준히 올려 온 분';
      case 'blog': return '· 네이버 블로그에 직접 써 본 후기를 글로 정리해 본 분';
      case 'youtube': return '· 유튜브에 직접 촬영·편집한 영상(쇼츠 포함)을 올려 본 분';
      case 'threads': return '· 스레드에 짧은 글과 사진으로 일상을 공유하는 분';
      default: return '';
    }
  }

  function buildPosting(b) {
    const brand = b.brand || '브랜드';
    const product = b.product || '제품';
    const channels = b.channels.map(channelLabel);
    const tags = b.hashtags;
    const title = '[' + brand + '] 「' + product + '」 체험단 ' + b.headcount + '명 모집';
    const L = [];

    L.push('안녕하세요, ' + brand + '입니다.');
    L.push('');
    L.push(product + '를 먼저 써 보고, 써 본 사람만 쓸 수 있는 이야기를 남겨 주실 체험단 ' + b.headcount + '명을 모집합니다.');
    L.push('잘 만든 광고 문구보다, 며칠 써 보고 느낀 구체적인 경험이 더 믿음이 간다고 생각합니다.');
    L.push('');
    L.push('■ 모집 개요');
    L.push('· 모집 인원 : ' + b.headcount + '명');
    L.push('· 모집 채널 : ' + channels.join(', '));
    L.push('· 신청 마감 : ' + (b.applyUntil ? formatKoreanDate(b.applyUntil) + ' 23:59' : '모집 인원 충족 시 조기 마감'));
    if (b.announceOn) L.push('· 결과 안내 : ' + formatKoreanDate(b.announceOn) + ' 개별 연락');
    L.push('· 업로드 기한 : 제품 수령 후 ' + b.uploadDays + '일 이내');
    L.push('');
    L.push('■ 제공 내역');
    benefitLines(b).forEach((line) => L.push(line));
    L.push('');
    L.push('■ 이런 분을 찾습니다');
    L.push('· 최근 3개월 안에 ' + channels.join(', ') + ' 중 한 곳 이상에 콘텐츠를 꾸준히 올리신 분');
    L.push('· 직접 촬영한 사진·영상으로 후기를 남길 수 있는 분');
    L.push('· 제품을 7일 이상 사용한 뒤, 좋았던 점과 아쉬운 점을 함께 적어 주실 분');
    L.push('· 안내드린 기한 안에 업로드와 링크 회신이 가능한 분');
    b.channels.map(channelAudienceLine).filter(Boolean).forEach((line) => L.push(line));
    L.push('');
    L.push('■ 미션');
    L.push('1. ' + product + '를 받은 날부터 7일 이상 사용한 뒤, 사용 전과 후의 느낌을 구체적으로 적어 주세요.');
    L.push('2. ' + missionLine(b));
    if (tags.length) L.push('3. 본문에 필수 해시태그를 모두 넣어 주세요 : ' + tags.join(' '));
    else L.push('3. 콘텐츠에 제품명과 브랜드명을 한 번 이상 적어 주세요.');
    L.push('4. 업로드 후 리뷰 링크를 회신해 주세요.');
    L.push('');
    L.push('■ 작성 가이드');
    L.push('· 대가성 표시(필수) : 콘텐츠 제목 또는 첫 부분에 아래 문구를 그대로 넣어 주세요.');
    L.push('  「' + disclosureBasic(b) + '」');
    L.push('  블로그는 제목이나 첫 문단, 영상은 초반 자막과 설명란 첫 줄, 인스타·스레드는 캡션 첫 줄에 넣어 주세요.');
    L.push('· 직접 촬영한 사진·영상만 사용해 주세요. (타사 이미지, 구매한 이미지, AI 생성 이미지 사용 금지)');
    L.push('· 효능·효과를 단정하는 표현(치료, 완치, 100%, 최고, 유일)은 쓰지 마세요. 표시·광고법 위반이 될 수 있습니다.');
    L.push('· 제품의 전체 구성과 용량을 확인할 수 있는 컷을 1장 이상 넣어 주세요.');
    L.push('· 사실과 다른 내용은 수정을 요청하지 않습니다. 오탈자·브랜드명 표기만 1회까지 요청드릴 수 있습니다.');
    L.push('');
    L.push('■ 신청 방법');
    L.push('1. 아래 양식을 채워 보내 주세요.' + (b.contact ? ' (문의처 : ' + b.contact + ')' : ''));
    L.push('   - 이름(활동명) :');
    L.push('   - 채널 링크 :');
    L.push('   - 팔로워 수 / 평균 조회수 :');
    L.push('   - 사용해 보고 싶은 이유(3줄) :');
    L.push('2. 선정되신 분께는 ' + (b.announceOn ? formatKoreanDate(b.announceOn) + '까지' : '개별') + ' 연락드립니다.');
    L.push('3. 제품 발송 후 리뷰 링크를 회신해 주시면 확인 뒤 원고료를 지급합니다.');
    L.push('');
    L.push('■ 유의사항');
    L.push('· 선정 후 3일 안에 연락이 닿지 않으면 다음 순번으로 넘어갑니다.');
    L.push('· 구매한 팔로워·조회수, 도용 이미지, 미션 미이행이 확인되면 선정이 취소되고 원고료는 지급되지 않습니다.');
    L.push('· 캠페인 종료 전에는 리뷰를 삭제하거나 비공개로 바꾸지 말아 주세요.');
    L.push('· 업로드한 콘텐츠는 브랜드 홍보 목적으로 2차 활용될 수 있으며, 활용 전 별도 동의를 받습니다.');
    L.push('· 제공된 제품은 반납하지 않으셔도 됩니다. (단순 변심에 의한 교환·환불은 불가)');
    L.push('');
    L.push('■ 개인정보');
    L.push('· 신청 시 받은 이름·연락처·주소는 제품 발송과 원고료 지급 목적으로만 사용합니다.');
    L.push('· 캠페인 종료 후 3개월 안에 파기하며, 동의 없이 제3자에게 제공하지 않습니다.');
    L.push('');
    L.push('문의 : ' + (b.contact || '캠페인 담당자'));
    L.push(brand + ' 드림');
    return { title: title, body: L.join('\n') };
  }

  function buildDm(b) {
    const brand = b.brand || '브랜드';
    const product = b.product || '제품';
    const L = [];
    L.push('안녕하세요, ○○님. ' + brand + '입니다.');
    L.push('');
    L.push('「' + product + '」 체험단에 선정되셨습니다. 신청해 주셔서 감사합니다.');
    L.push('');
    L.push('· 제공 : ' + product + (b.productPrice > 0 ? ' 1개(' + formatWon(b.productPrice) + ' 상당)' : ' 1개') + (b.fee > 0 ? ' + 원고료 ' + formatWon(b.fee) : ''));
    L.push('· 채널 : ' + b.channels.map(channelLabel).join(', '));
    L.push('· 업로드 기한 : 제품 수령 후 ' + b.uploadDays + '일 이내');
    if (b.hashtags.length) L.push('· 필수 해시태그 : ' + b.hashtags.join(' '));
    L.push('· 대가성 문구 : 「' + disclosureBasic(b) + '」');
    L.push('');
    L.push('진행을 위해 아래 3가지를 회신해 주세요.');
    L.push('1. 받으실 주소 (우편번호 포함)');
    L.push('2. 연락 가능한 번호');
    L.push('3. 업로드 예정일');
    L.push('');
    L.push('제품을 보낸 뒤 운송장 번호를 다시 안내드리겠습니다.');
    L.push('콘텐츠를 올리실 때는 첫 부분에 대가성 문구를 꼭 넣어 주세요. 링크를 보내 주시면 확인 후 원고료를 지급합니다.');
    L.push('');
    L.push('감사합니다.');
    L.push(brand + ' 드림');
    return { text: L.join('\n') };
  }

  function buildEmail(b) {
    const brand = b.brand || '브랜드';
    const product = b.product || '제품';
    const subject = '[' + brand + '] 「' + product + '」 체험단 선정 안내 (업로드 기한 포함)';
    const L = [];
    L.push('안녕하세요, ○○님.');
    L.push(brand + ' 캠페인 담당자입니다.');
    L.push('');
    L.push('「' + product + '」 체험단에 선정되신 것을 축하드립니다. 신청서에 남겨 주신 내용을 읽고, 남겨 주실 후기가 궁금해져서 선정했습니다.');
    L.push('');
    L.push('■ 제공 내역');
    benefitLines(b).forEach((line) => L.push(line));
    L.push('');
    L.push('■ 진행 일정');
    L.push('· 회신 기한 : 본 메일 수신 후 3일 이내 (주소·연락처·업로드 예정일)');
    L.push('· 제품 발송 : 회신 확인 후 2~3일 이내');
    L.push('· 업로드 기한 : 제품 수령 후 ' + b.uploadDays + '일 이내');
    L.push('· 원고료 지급 : 리뷰 링크 확인 후 7일 이내');
    L.push('');
    L.push('■ 미션');
    L.push('1. ' + product + '를 7일 이상 사용한 뒤, 사용 전과 후의 느낌을 구체적으로 적어 주세요.');
    L.push('2. ' + missionLine(b));
    if (b.hashtags.length) L.push('3. 본문에 필수 해시태그를 모두 넣어 주세요 : ' + b.hashtags.join(' '));
    L.push('4. 업로드 후 회신 메일에 리뷰 링크를 보내 주세요.');
    L.push('');
    L.push('■ 작성 가이드');
    L.push('· 콘텐츠 제목 또는 첫 부분에 아래 대가성 문구를 그대로 넣어 주세요.');
    L.push('  「' + disclosureBasic(b) + '」');
    L.push('· 블로그는 제목이나 첫 문단, 영상은 초반 자막과 설명란 첫 줄, 인스타·스레드는 캡션 첫 줄에 넣어 주세요.');
    L.push('· 직접 촬영한 사진·영상만 사용해 주세요.');
    L.push('· 효능·효과를 단정하는 표현(치료, 완치, 100%, 최고)은 쓰지 마세요.');
    L.push('');
    L.push('■ 회신 양식');
    L.push('1. 받으실 주소 (우편번호 포함) :');
    L.push('2. 연락 가능한 번호 :');
    L.push('3. 업로드 예정일 :');
    L.push('4. 리뷰에 꼭 담아 주셨으면 하는 점(선택) :');
    L.push('');
    L.push('회신이 확인되면 제품을 발송하고 운송장 번호를 안내드리겠습니다.');
    L.push('궁금한 점은 이 메일로 회신해 주세요. 감사합니다.');
    L.push('');
    L.push(brand + ' 캠페인 담당자 드림');
    L.push('문의 : ' + (b.contact || '본 메일 회신'));
    return { subject: subject, body: L.join('\n') };
  }

  function buildDisclosure(b) {
    const brand = b.brand || '브랜드';
    const product = b.product || '제품';
    const items = [];
    items.push({ key: 'basic', label: '기본형', where: '블로그·인스타 캡션 첫 줄', text: disclosureBasic(b) });
    items.push({
      key: 'productOnly',
      label: '제품만 제공',
      where: '원고료 없이 제품만 받은 경우',
      text: '본 콘텐츠는 ' + brand + '로부터 ' + product + '를 제공받아 작성했습니다.',
    });
    items.push({
      key: 'hashtag',
      label: '해시태그형',
      where: '본문 맨 앞 또는 첫 줄에 함께',
      text: '#광고 #유료광고 #' + (brand.replace(/\s/g, '') || '브랜드') + '_체험단',
    });
    items.push({
      key: 'video',
      label: '영상 자막·멘트',
      where: '영상 초반 자막과 음성, 설명란 첫 줄',
      text: '이 영상은 ' + brand + '의 ' + (b.fee > 0 ? '제품과 원고료를' : '제품을') + ' 지원받아 제작했습니다.',
    });
    items.push({ key: 'short', label: '짧은 표기', where: '제목·썸네일에 짧게', text: brand + ' 협찬' });

    const rules = [
      '콘텐츠를 보는 사람이 바로 알 수 있게 — 접어 두거나 작은 글씨로 숨기지 않습니다.',
      '앞부분에 — 블로그·카페는 제목 또는 첫 부분(2024.12.1 개정), 사진·영상은 초반 장면·자막·설명란 첫 줄에 넣습니다.',
      '명확하게 — "소정의 수수료를 받을 수 있음" 같은 조건부·불확정 표현 대신, 받은 것(제품·원고료·수수료)을 그대로 적습니다.',
    ];
    const byChannel = [
      { id: 'blog', label: '네이버 블로그', how: '글 제목 앞 또는 첫 문단. 본문이 길면 글 끝에 한 번 더 넣어도 좋습니다.' },
      { id: 'instagram', label: '인스타그램', how: '캡션 첫 줄 + 광고 표시(유료 광고 도구) 또는 #광고 해시태그.' },
      { id: 'youtube', label: '유튜브', how: '영상 초반 자막과 음성 멘트 + 설명란 첫 줄, "유료 프로모션" 표시.' },
      { id: 'threads', label: '스레드', how: '첫 글 첫 문장 + #광고. 답글에만 적는 것은 부족합니다.' },
    ];
    return {
      items: items,
      rules: rules,
      byChannel: byChannel,
      note: '공정거래위원회 「추천·보증 등에 관한 표시·광고 심사지침」(2024.12.1 개정)과 「경제적 이해관계 표시 안내서」를 참고한 예시입니다. 법률 자문이 아니므로 집행 전 최신 지침을 확인하세요. 구매 링크 수수료·구매 대금 환급처럼 나중에 받기로 한 대가도 표시 대상입니다.',
    };
  }

  function buildGuide(b) {
    const brand = b.brand || '브랜드';
    const product = b.product || '제품';
    const d = buildDisclosure(b);
    const L = [];
    L.push('■ 작성 가이드 · ' + product);
    L.push('');
    L.push('1. 콘텐츠 구성');
    L.push('· 도입 : 어떤 상황에서 써 봤는지 한 줄');
    L.push('· 사용 : 7일 이상 쓴 뒤의 사용감 (양, 발림성, 흡수, 향 등 직접 느낀 점)');
    L.push('· 장점과 아쉬운 점 : 각각 1가지 이상');
    L.push('· 마무리 : 다시 살지, 누구에게 권할지');
    L.push('· 사진·영상 : 제품 전신 1장, 사용 장면 1장 이상 (직접 촬영)');
    L.push('');
    L.push('2. 하지 말아야 할 표현');
    L.push('· 치료·완치·부작용 없음 등 의학적 효능 단정');
    L.push('· "최고", "유일", "100%", "국내 1위" 같은 최상급·비교 표현 (근거 없으면 표시·광고법 위반)');
    L.push('· 실제로 써 보지 않은 사용감, 타인의 사진·후기 도용');
    L.push('· 대가성 문구를 숨기거나 조건부로 흐리는 표현');
    L.push('');
    L.push('3. 대가성 문구 — 이렇게 넣으세요');
    d.items.forEach((it) => {
      L.push('· [' + it.label + '] ' + it.where);
      L.push('  「' + it.text + '」');
    });
    L.push('');
    L.push('4. 꼭 지켜야 할 3가지');
    d.rules.forEach((r, i) => L.push('  ' + (i + 1) + ') ' + r));
    L.push('');
    L.push('5. 채널별 표시 위치');
    d.byChannel.forEach((c) => L.push('· ' + c.label + ' : ' + c.how));
    L.push('');
    L.push('6. 제출물');
    L.push('· 콘텐츠 링크 (게시 후 3일 안에 회신)');
    L.push('· 원본 사진·영상 2장 이상 (브랜드 2차 활용 동의 시에만 요청)');
    L.push('');
    L.push('7. 유의');
    L.push('· ' + d.note);
    L.push('');
    L.push('문의 : ' + (b.contact || brand + ' 캠페인 담당자'));
    return { text: L.join('\n') };
  }

  function briefWarnings(b) {
    const out = [];
    if (!b.brand) out.push({ level: 'warn', text: '브랜드명이 비어 있어 "브랜드"로 표시됩니다.' });
    if (!b.product) out.push({ level: 'warn', text: '제품명이 비어 있어 "제품"으로 표시됩니다.' });
    if (!b.hashtags.length) out.push({ level: 'warn', text: '필수 해시태그가 없습니다. 해시태그가 없으면 공고의 미션 항목이 줄어듭니다.' });
    if (!b.mission) out.push({ level: 'info', text: '미션을 비우면 기본 미션 문구(사용 전후 사진 3장)로 채워집니다.' });
    if (b.fee === 0 && b.productPrice > 0) out.push({ level: 'info', text: '원고료가 0원입니다. 공고문과 대가성 문구가 "제품만 제공" 형태로 바뀝니다.' });
    if (b.fee === 0 && b.productPrice === 0) out.push({ level: 'warn', text: '제품가와 원고료가 모두 0원입니다. 제공 내역을 확인해 주세요.' });
    if (b.applyUntil && daysLeft(b.applyUntil, new Date()) < 0) {
      out.push({ level: 'warn', text: '신청 마감일이 이미 지났습니다. 날짜를 다시 확인해 주세요.' });
    }
    if (b.contact.length === 0) out.push({ level: 'warn', text: '신청 받을 연락처(DM·이메일)가 비어 있습니다.' });
    if (b.headcount > 100) out.push({ level: 'info', text: '모집 인원이 100명을 넘습니다. 관리 비용과 발송 일정을 다시 확인해 보세요.' });
    return out;
  }

  function buildBrief(raw) {
    const b = normalizeBrief(raw);
    const posting = buildPosting(b);
    const dm = buildDm(b);
    const email = buildEmail(b);
    const guide = buildGuide(b);
    const disclosure = buildDisclosure(b);
    const totals = {
      perPerson: perPersonValue(b),
      budget: perPersonValue(b) * b.headcount,
      feeTotal: b.fee * b.headcount,
      productTotal: b.productPrice * b.headcount,
    };
    return {
      input: b,
      campaignName: campaignName(b),
      posting: { title: posting.title, body: posting.body, text: posting.title + '\n\n' + posting.body },
      dm: { text: dm.text },
      email: { subject: email.subject, body: email.body, text: '제목 : ' + email.subject + '\n\n' + email.body },
      guide: { text: guide.text },
      disclosure: disclosure,
      totals: totals,
      warnings: briefWarnings(b),
      lengths: {
        posting: posting.title.length + posting.body.length,
        dm: dm.text.length,
        email: email.body.length,
        guide: guide.text.length,
      },
    };
  }

  /* ── 지원자 모델 ─────────────────────────────────── */
  function newId(prefix) {
    return (prefix || 'a') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function handleKey(handle) {
    return String(handle || '').trim().toLowerCase().replace(/^@+/, '');
  }

  function normalizeApplicant(raw, opts) {
    const r = raw || {};
    const o = opts || {};
    const channel = normalizeChannel(r.channel) || (o.defaultChannel && normalizeChannel(o.defaultChannel)) || 'instagram';
    const stage = normalizeStage(r.stage) || 'applied';
    const a = {
      id: r.id ? String(r.id) : newId(),
      name: String(r.name || '').trim().slice(0, 40),
      handle: String(r.handle || '').trim().slice(0, 40),
      channel: channel,
      followers: Math.max(0, parseNumber(r.followers, 0)),
      avgViews: Math.max(0, parseNumber(r.avgViews, 0)),
      fee: Math.max(0, parseNumber(r.fee, 0)),
      note: String(r.note || '').trim().slice(0, 240),
      reviewUrl: String(r.reviewUrl || '').trim().slice(0, 300),
      dueDate: toIsoDate(r.dueDate),
      stage: stage,
      views: Math.max(0, parseNumber(r.views, 0)),
      likes: Math.max(0, parseNumber(r.likes, 0)),
      comments: Math.max(0, parseNumber(r.comments, 0)),
      joinedAt: toIsoDate(r.joinedAt) || toIsoDate(o.now || new Date()),
    };
    if (a.handle && a.handle[0] !== '@') a.handle = '@' + a.handle.replace(/^@+/, '');
    return a;
  }

  function applicantCost(a, productPrice) {
    return parseNumber(a.fee) + parseNumber(productPrice);
  }

  function addApplicant(list, applicant, opts) {
    const a = normalizeApplicant(applicant, opts);
    if (!a.name) return { list: list, added: null, error: '이름(활동명)을 입력해 주세요.' };
    const key = handleKey(a.handle);
    if (key && list.some((x) => handleKey(x.handle) === key)) {
      return { list: list, added: null, error: '이미 등록된 핸들입니다: ' + a.handle };
    }
    return { list: list.concat([a]), added: a, error: null };
  }

  function mergeApplicants(list, rows, opts) {
    const out = list.slice();
    const added = [];
    const duplicates = [];
    const o = opts || {};
    rows.forEach((row) => {
      const a = normalizeApplicant(row, o);
      const key = handleKey(a.handle);
      if (key && out.some((x) => handleKey(x.handle) === key)) {
        duplicates.push(a.handle || a.name);
        return;
      }
      out.push(a);
      added.push(a);
    });
    return { list: out, added: added, duplicates: duplicates };
  }

  function updateApplicant(list, id, patch) {
    return list.map((a) => {
      if (a.id !== id) return a;
      return normalizeApplicant(Object.assign({}, a, patch, { id: a.id }));
    });
  }

  function moveApplicant(list, id, stage) {
    const s = normalizeStage(stage);
    if (!s) return list.slice();
    return list.map((a) => (a.id === id ? Object.assign({}, a, { stage: s }) : a));
  }

  function removeApplicant(list, id) {
    return list.filter((a) => a.id !== id);
  }

  function ddayInfo(a, now) {
    const stage = a.stage || 'applied';
    if (stage === 'settled') return { days: null, label: '정산 완료', tone: 'done' };
    if (stage === 'uploaded') return { days: null, label: '제출 완료', tone: 'done' };
    if (stage === 'applied') return { days: null, label: '선정 대기', tone: 'idle' };
    const days = daysLeft(a.dueDate, now);
    if (days === null) return { days: null, label: '마감 미정', tone: 'idle' };
    let tone = 'ok';
    if (days < 0) tone = 'late';
    else if (days <= 3) tone = 'danger';
    else if (days <= 7) tone = 'warn';
    return { days: days, label: ddayLabel(days), tone: tone };
  }

  const SORTS = [
    { id: 'due', label: '마감 임박순' },
    { id: 'name', label: '이름순' },
    { id: 'cost', label: '단가 높은순' },
    { id: 'followers', label: '팔로워 많은순' },
    { id: 'recent', label: '최근 신청순' },
  ];

  function sortApplicants(list, sort, opts) {
    const o = opts || {};
    const arr = list.slice();
    const productPrice = o.productPrice || 0;
    switch (sort) {
      case 'name':
        return arr.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
      case 'cost':
        return arr.sort((a, b) => applicantCost(b, productPrice) - applicantCost(a, productPrice));
      case 'followers':
        return arr.sort((a, b) => num(b.followers) - num(a.followers));
      case 'recent':
        return arr.sort((a, b) => String(b.joinedAt || '').localeCompare(String(a.joinedAt || '')));
      case 'due':
      default:
        return arr.sort((a, b) => {
          const done = (x) => x.stage === 'uploaded' || x.stage === 'settled' || !x.dueDate;
          const pa = done(a) ? 1 : 0;
          const pb = done(b) ? 1 : 0;
          if (pa !== pb) return pa - pb;
          if (pa === 1) return 0;
          return daysLeft(a.dueDate, o.now) - daysLeft(b.dueDate, o.now);
        });
    }
  }

  function filterApplicants(list, opts) {
    const o = opts || {};
    const q = String(o.query || '').trim().toLowerCase();
    const ch = o.channel || 'all';
    const st = o.stage || 'all';
    const out = list.filter((a) => {
      if (ch !== 'all' && a.channel !== ch) return false;
      if (st !== 'all' && a.stage !== st) return false;
      if (!q) return true;
      const hay = [a.name, a.handle, a.note, a.reviewUrl, channelLabel(a.channel), stageLabel(a.stage)].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    return sortApplicants(out, o.sort, { productPrice: o.productPrice, now: o.now });
  }

  /* ── CSV ─────────────────────────────────────────── */
  function detectDelimiter(text) {
    const firstLine = String(text || '').split(/\r?\n/).find((l) => l.trim().length > 0) || '';
    const tabs = (firstLine.match(/\t/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const semis = (firstLine.match(/;/g) || []).length;
    if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
    if (semis > commas) return ';';
    return ',';
  }

  function parseCsvRows(text, delimiter) {
    const d = delimiter || ',';
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const src = String(text || '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quoted) {
        if (c === '"') {
          if (src[i + 1] === '"') { cell += '"'; i++; }
          else quoted = false;
        } else cell += c;
      } else if (c === '"') {
        quoted = true;
      } else if (c === d) {
        row.push(cell); cell = '';
      } else if (c === '\n') {
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else {
        cell += c;
      }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim().length > 0));
  }

  function headerKeyOf(cell) {
    const raw = String(cell || '').trim().toLowerCase().replace(/[\s()\[\]{}·:]/g, '');
    for (const key of Object.keys(HEADER_ALIASES)) {
      if (HEADER_ALIASES[key].some((alias) => {
        const a = alias.toLowerCase().replace(/[\s()\[\]{}·:]/g, '');
        return a === raw;
      })) return key;
    }
    return null;
  }

  function parseApplicantsCsv(text, opts) {
    const o = opts || {};
    const delimiter = detectDelimiter(text);
    const rows = parseCsvRows(text, delimiter);
    const errors = [];
    if (!rows.length) return { rows: [], errors: [{ line: 0, message: '내용이 비어 있습니다.' }], headerDetected: false, duplicates: [] };

    let map = {};
    let start = 0;
    let headerDetected = false;
    const first = rows[0];
    const mapped = first.map(headerKeyOf);
    const recognized = mapped.filter(Boolean).length;
    if (recognized >= 2) {
      headerDetected = true;
      mapped.forEach((key, i) => { if (key && !(key in map)) map[key] = i; });
      start = 1;
    } else {
      POSITIONAL_ORDER.forEach((key, i) => { map[key] = i; });
    }
    if (!('name' in map)) {
      errors.push({ line: 1, message: '이름 열을 찾지 못했습니다. 첫 줄에 "이름, 핸들, 채널, 팔로워, 평균 조회수, 원고료, 마감일, 메모" 헤더를 넣어 주세요.' });
      return { rows: [], errors: errors, headerDetected: headerDetected, duplicates: [] };
    }

    const out = [];
    for (let i = start; i < rows.length; i++) {
      const cells = rows[i];
      const lineNo = i + 1;
      const get = (key) => (key in map ? String(cells[map[key]] === undefined ? '' : cells[map[key]]).trim() : '');
      const name = get('name');
      if (!name) {
        errors.push({ line: lineNo, message: '이름이 비어 있어 건너뜁니다.' });
        continue;
      }
      const rawChannel = get('channel');
      const channel = rawChannel ? normalizeChannel(rawChannel) : '';
      if (rawChannel && !channel) {
        errors.push({ line: lineNo, message: '채널을 알아볼 수 없습니다: "' + rawChannel + '" (인스타·블로그·유튜브·스레드)' });
        continue;
      }
      const rawStage = get('stage');
      const stage = rawStage ? normalizeStage(rawStage) : '';
      if (rawStage && !stage) {
        errors.push({ line: lineNo, message: '진행 상태를 알아볼 수 없습니다: "' + rawStage + '"' });
        continue;
      }
      const rawDue = get('dueDate');
      let dueDate = '';
      if (rawDue) {
        dueDate = toIsoDate(rawDue);
        if (!dueDate) {
          errors.push({ line: lineNo, message: '마감일 형식을 읽지 못했습니다: "' + rawDue + '" (예: 2026-12-05)' });
        }
      }
      const a = normalizeApplicant({
        name: name,
        handle: get('handle'),
        channel: channel || (o.defaultChannel || 'instagram'),
        followers: get('followers'),
        avgViews: get('avgViews'),
        fee: get('fee') === '' ? (o.defaultFee || 0) : get('fee'),
        dueDate: dueDate,
        note: get('note'),
        reviewUrl: get('reviewUrl'),
        views: get('views'),
        likes: get('likes'),
        comments: get('comments'),
        stage: stage || 'applied',
        joinedAt: get('joinedAt') || o.now || new Date(),
      }, o);
      out.push(a);
    }
    if (!out.length && !errors.length) errors.push({ line: 0, message: '추가할 수 있는 행이 없습니다.' });
    return { rows: out, errors: errors, headerDetected: headerDetected, delimiter: delimiter === '\t' ? 'tab' : delimiter, duplicates: [] };
  }

  function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const CSV_HEADERS = ['진행 단계', '이름', '핸들', '채널', '팔로워', '평균 조회수', '원고료', '제품가', '총 단가', '마감일', '리뷰 URL', '조회수', '좋아요', '댓글', '신청일', '메모'];

  function toCsv(applicants, opts) {
    const o = opts || {};
    const productPrice = num(o.productPrice);
    const lines = [CSV_HEADERS.join(',')];
    (applicants || []).forEach((a) => {
      lines.push([
        stageLabel(a.stage),
        a.name,
        a.handle,
        channelLabel(a.channel),
        num(a.followers),
        num(a.avgViews),
        num(a.fee),
        productPrice,
        applicantCost(a, productPrice),
        a.dueDate || '',
        a.reviewUrl || '',
        num(a.views),
        num(a.likes),
        num(a.comments),
        a.joinedAt || '',
        a.note || '',
      ].map(csvCell).join(','));
    });
    const text = lines.join('\r\n');
    return o.bom === false ? text : '\ufeff' + text;
  }

  /* ── 성과 계산 ───────────────────────────────────── */
  function summarize(applicants, opts) {
    const o = opts || {};
    const productPrice = num(o.productPrice);
    const now = o.now || new Date();
    const cpmRate = o.cpm === undefined ? DEFAULT_CPM : num(o.cpm);
    const revenue = num(o.revenue);
    const list = applicants || [];
    const active = list.filter((a) => a.stage !== 'applied');
    const costs = list.map((a) => applicantCost(a, productPrice));
    const cost = active.reduce((s, a) => s + applicantCost(a, productPrice), 0);
    const pipelineCost = costs.reduce((s, c) => s + c, 0);

    let measuredViews = 0, estimatedViews = 0, likes = 0, comments = 0;
    let measuredCount = 0, pendingCount = 0;
    active.forEach((a) => {
      if (num(a.views) > 0) {
        measuredViews += num(a.views);
        likes += num(a.likes);
        comments += num(a.comments);
        measuredCount++;
      } else {
        estimatedViews += num(a.avgViews);
        pendingCount++;
      }
    });
    const views = measuredViews + estimatedViews;
    const cpv = views > 0 ? cost / views : null;
    const cpvMeasured = measuredViews > 0 ? cost / measuredViews : null;
    const engagementRate = measuredViews > 0 ? ((likes + comments) / measuredViews) * 100 : null;
    const adValue = views * cpmRate / 1000;
    const roiAd = cost > 0 ? ((adValue - cost) / cost) * 100 : null;
    const roiRevenue = revenue > 0 && cost > 0 ? ((revenue - cost) / cost) * 100 : null;

    let lateCount = 0, dueSoonCount = 0, weekCount = 0;
    list.forEach((a) => {
      const d = ddayInfo(a, now);
      if (d.tone === 'late') lateCount++;
      else if (d.tone === 'danger') dueSoonCount++;
      else if (d.tone === 'warn') weekCount++;
    });

    return {
      count: list.length,
      activeCount: active.length,
      appliedCount: list.length - active.length,
      cost: cost,
      pipelineCost: pipelineCost,
      productPrice: productPrice,
      avgCost: active.length ? cost / active.length : 0,
      measuredViews: measuredViews,
      estimatedViews: estimatedViews,
      views: views,
      measuredCount: measuredCount,
      pendingCount: pendingCount,
      likes: likes,
      comments: comments,
      engagementRate: engagementRate,
      cpv: cpv,
      cpvMeasured: cpvMeasured,
      cpm: cpv === null ? null : cpv * 1000,
      cpmRate: cpmRate,
      adValue: adValue,
      roiAd: roiAd,
      revenue: revenue,
      roiRevenue: roiRevenue,
      lateCount: lateCount,
      dueSoonCount: dueSoonCount,
      weekCount: weekCount,
      headroom: o.headcount ? num(o.headcount) * (productPrice + num(o.fee)) - pipelineCost : null,    };
  }

  function channelStats(applicants, opts) {
    const o = opts || {};
    const productPrice = num(o.productPrice);
    const active = (applicants || []).filter((a) => a.stage !== 'applied');
    const rows = CHANNELS.map((c) => {
      const items = active.filter((a) => a.channel === c.id);
      const cost = items.reduce((s, a) => s + applicantCost(a, productPrice), 0);
      let mViews = 0, eViews = 0, lk = 0, cm = 0;
      items.forEach((a) => {
        if (num(a.views) > 0) { mViews += num(a.views); lk += num(a.likes); cm += num(a.comments); }
        else eViews += num(a.avgViews);
      });
      const views = mViews + eViews;
      return {
        id: c.id,
        label: c.label,
        short: c.short,
        color: c.color,
        count: items.length,
        allCount: (applicants || []).filter((a) => a.channel === c.id).length,
        cost: cost,
        views: views,
        measuredViews: mViews,
        cpv: views > 0 ? cost / views : null,
        engagementRate: mViews > 0 ? ((lk + cm) / mViews) * 100 : null,
        followers: items.reduce((s, a) => s + num(a.followers), 0),
      };
    });
    return rows;
  }

  function stageStats(applicants, opts) {
    const productPrice = num((opts || {}).productPrice);
    return STAGES.map((s) => {
      const items = (applicants || []).filter((a) => a.stage === s.id);
      return {
        id: s.id,
        label: s.label,
        short: s.short,
        color: s.color,
        count: items.length,
        cost: items.reduce((sum, a) => sum + applicantCost(a, productPrice), 0),
      };
    });
  }

  function dueList(applicants, now, filter) {
    const rows = (applicants || []).map((a) => ({ a: a, d: ddayInfo(a, now) }));
    return rows
      .filter((r) => (filter === 'late' ? r.d.tone === 'late' : r.d.tone === 'late' || r.d.tone === 'danger' || r.d.tone === 'warn'))
      .sort((x, y) => (x.d.days === null ? 99 : x.d.days) - (y.d.days === null ? 99 : y.d.days));
  }

  function topPerformers(applicants, opts) {
    const o = opts || {};
    const productPrice = num(o.productPrice);
    return (applicants || [])
      .filter((a) => a.stage !== 'applied' && num(a.views) > 0)
      .map((a) => {
        const cost = applicantCost(a, productPrice);
        return {
          applicant: a,
          cost: cost,
          views: num(a.views),
          cpv: num(a.views) > 0 ? cost / num(a.views) : null,
          engagementRate: num(a.views) > 0 ? ((num(a.likes) + num(a.comments)) / num(a.views)) * 100 : null,
        };
      })
      .sort((x, y) => (x.cpv === null ? Infinity : x.cpv) - (y.cpv === null ? Infinity : y.cpv));
  }

  /* ── JSON 백업 ───────────────────────────────────── */
  function toBackup(brief, applicants, prefs) {
    return {
      app: 'influencer-campaign-board',
      version: 1,
      exportedAt: new Date().toISOString(),
      brief: normalizeBrief(brief),
      applicants: (applicants || []).map((a) => normalizeApplicant(a)),
      prefs: prefs || {},
    };
  }

  function parseBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'JSON을 읽지 못했습니다. 내보낸 파일인지 확인해 주세요.', data: null }; }
    if (!data || (data.app && data.app !== 'influencer-campaign-board')) {
      return { error: '체험단 매칭 보드에서 내보낸 파일이 아닙니다.', data: null };
    }
    if (!data.brief || !Array.isArray(data.applicants)) {
      return { error: '캠페인 설정이나 지원자 목록이 없습니다.', data: null };
    }
    return {
      error: null,
      data: {
        brief: normalizeBrief(data.brief),
        applicants: data.applicants.map((a) => normalizeApplicant(a)),
        prefs: data.prefs && typeof data.prefs === 'object' ? data.prefs : {},
      },
    };
  }

  /* ── 공통 ────────────────────────────────────────── */
  /* ==========================================================
     카피 심리학 — 체험단 공고용 가중치
     ========================================================== */

  /** 공고는 판매 페이지가 아니라 '지원 결정' 페이지다. 지원·신뢰를 먼저 본다. */
  const PSYCH_GROUPS = [
    { id: 'apply', label: '지원', desc: '신청 버튼까지 가는 힘 — 마감·한정·놓치면 아까운 것', triggers: ['scarcity', 'loss', 'cta'], target: 42 },
    { id: 'trust', label: '신뢰', desc: '지원 전에 확인하는 근거 — 숫자·후기·실측', triggers: ['anchor', 'social', 'authority'], target: 43 },
    { id: 'attention', label: '관심', desc: '공고를 끝까지 읽게 하는 힘 — 질문·반전', triggers: ['curiosity', 'interrupt'], target: 15 },
  ];

  /** 가중치 합 100 (지원 42 · 신뢰 43 · 관심 15) */
  const PSYCH_WEIGHTS = {
    loss: 15, anchor: 13, curiosity: 8, interrupt: 7,
    social: 16, scarcity: 15, authority: 14, cta: 12,
  };

  function psychGrade(total) {
    const s = Number(total) || 0;
    if (s >= 75) return { id: 'S', label: 'S', title: '지원 설계 좋음', tone: 's', desc: '마감·후기·숫자가 함께 살아 있어요. 이대로 올려도 됩니다.' };
    if (s >= 60) return { id: 'A', label: 'A', title: '거의 다 됐어요', tone: 'a', desc: '한두 축만 채우면 됩니다. 아래 빈틈부터 보세요.' };
    if (s >= 45) return { id: 'B', label: 'B', title: '한두 곳 보완', tone: 'b', desc: '정보는 있지만 급함이나 근거가 비어 있어요.' };
    return { id: 'C', label: 'C', title: '약한 축이 있어요', tone: 'c', desc: '마감·후기·숫자 중 비어 있는 축이 있습니다. 아래 빈틈부터 채우세요.' };
  }

  /**
   * 엔진 diagnose() 결과를 이 앱 화면에 맞게 묶는다.
   * @param {{triggers:Array, total:number, gaps:Array, flags:object}} diag
   */
  function psychProfile(diag) {
    const d = diag || {};
    const list = Array.isArray(d.triggers) ? d.triggers : [];
    if (!list.length) return { total: 0, rawTotal: 0, grade: psychGrade(0), groups: [], gaps: [], empty: true, coverage: 0 };

    const byId = {};
    list.forEach(function (t) { byId[t.id] = t; });

    let sum = 0, weightSum = 0;
    list.forEach(function (t) {
      const w = PSYCH_WEIGHTS[t.id] == null ? 0 : PSYCH_WEIGHTS[t.id];
      sum += t.score * w;
      weightSum += w;
    });
    const total = weightSum ? Math.round(sum / weightSum) : 0;

    const groups = PSYCH_GROUPS.map(function (g) {
      let gs = 0, gw = 0;
      const triggers = g.triggers.map(function (id) {
        const t = byId[id];
        if (!t) return null;
        const w = PSYCH_WEIGHTS[id] == null ? 1 : PSYCH_WEIGHTS[id];
        gs += t.score * w;
        gw += w;
        return { id: t.id, name: t.name, score: t.score, weight: w, level: t.level, hits: (t.hits || []).slice(0, 3), fix: t.fix || '' };
      }).filter(Boolean);
      const score = gw ? Math.round(gs / gw) : 0;
      return { id: g.id, label: g.label, desc: g.desc, target: g.target, score: score, met: score >= g.target, triggers: triggers };
    });

    const empty = !!(d.flags && d.flags.empty);
    const gaps = empty ? [] : list.filter(function (t) { return t.score < 70; })
      .map(function (t) {
        const w = PSYCH_WEIGHTS[t.id] == null ? 0 : PSYCH_WEIGHTS[t.id];
        return { id: t.id, name: t.name, score: t.score, weight: w, impact: Math.round(w * (100 - t.score) / 100), fix: t.fix || '' };
      })
      .sort(function (a, b) { return b.impact - a.impact; })
      .slice(0, 3);

    return {
      total: clamp(total, 0, 100),
      rawTotal: clamp(Math.round(Number(d.total) || 0), 0, 100),
      grade: psychGrade(total),
      groups: groups,
      gaps: gaps,
      coverage: list.filter(function (t) { return t.score >= 50; }).length,
      empty: empty,
    };
  }

  /* ── 추상어·공급자어 묶음 ─────────────────────────── */
  const WORD_FIX_PRIMARY = ['abstract', 'supplier'];
  const WORD_FIX_SECONDARY = ['risk', 'passive', 'vague', 'weak'];
  const WORD_FIX_META = {
    abstract: { label: '추상어', desc: '형용사를 숫자·조건·소재로 바꾸세요' },
    supplier: { label: '공급자어', desc: '회사가 아니라 지원자를 주어로 세우세요' },
    risk: { label: '표시광고 위험', desc: '근거를 붙이거나 표현을 낮추세요' },
    passive: { label: '피동·번역체', desc: '짧은 능동문으로 끊으세요' },
    vague: { label: '모호한 약속', desc: '기준 시각·수치를 붙이세요' },
    weak: { label: '군더더기', desc: '강조 부사는 지우세요' },
  };

  /** 엔진 detect() 결과를 추상어·공급자어 우선으로 묶는다. */
  function wordFixGroups(det) {
    const d = det || {};
    const issues = Array.isArray(d.issues) ? d.issues : [];
    const make = function (type) {
      const seen = {};
      const items = [];
      issues.forEach(function (is) {
        if (is.type !== type) return;
        const key = is.phrase;
        if (seen[key]) { seen[key].count++; return; }
        const item = {
          phrase: is.phrase, count: 1,
          alternative: is.alternative || '',
          example: is.example || '',
          canAutoFix: !!is.canAutoFix,
          severity: is.severity || 0,
        };
        seen[key] = item;
        items.push(item);
      });
      const total = items.reduce(function (a, b) { return a + b.count; }, 0);
      return { type: type, label: (WORD_FIX_META[type] || {}).label || type, desc: (WORD_FIX_META[type] || {}).desc || '', count: total, items: items };
    };
    const primary = WORD_FIX_PRIMARY.map(make).filter(function (g) { return g.count; });
    const secondary = WORD_FIX_SECONDARY.map(make).filter(function (g) { return g.count; });
    return {
      primary: primary,
      secondary: secondary,
      total: primary.concat(secondary).reduce(function (a, g) { return a + g.count; }, 0),
      primaryTotal: primary.reduce(function (a, g) { return a + g.count; }, 0),
      friction: Number(d.friction) || 0,
      grade: d.grade || null,
    };
  }

  /**
   * 도입부 생성기(copy-psych-engine)에 넣을 입력.
   * 빈 칸은 캠페인 조건에서 자동으로 채운다.
   */
  function introDefaults(raw, override) {
    const b = normalizeBrief(raw);
    const o = override || {};
    const channels = b.channels.map(channelLabel).join(' · ');
    const product = b.product || '제품';
    const auto = {
      product: product,
      target: channels ? channels + '에 글을 올리는 크리에이터' : '체험단을 찾는 크리에이터',
      problem: '사기 전에 내게 맞는지 알 수 없어 망설이는 것',
      solution: product + '를 먼저 받아 써 보고, 쓴 그대로를 후기로 남기는 것',
      proof: '모집 ' + b.headcount + '명 · 인당 혜택 ' + formatWon(perPersonValue(b)) + ' 상당',
      cta: '신청서 보내기',
      urgency: b.applyUntil ? formatKoreanDate(b.applyUntil) + ' 23:59 마감' : '인원 충족 시 조기 마감',
      brand: b.brand,
      tone: 'casual',
    };
    return {
      product: String(o.product || auto.product),
      target: String(o.target || auto.target),
      problem: String(o.problem || auto.problem),
      solution: String(o.solution || auto.solution),
      proof: String(o.proof || auto.proof),
      cta: String(o.cta || auto.cta),
      urgency: String(o.urgency || auto.urgency),
      brand: auto.brand,
      tone: 'casual',
      auto: auto,
    };
  }

  /* ==========================================================
     광고주 보고용 성과 리포트 (규칙 기반 · AI 없이도 나온다)
     ========================================================== */

  function reportMetrics(brief, applicants, prefs, opts) {
    const b = normalizeBrief(brief);
    const o = opts || {};
    const p = prefs || {};
    const cpm = p.cpm === undefined ? DEFAULT_CPM : num(p.cpm);
    const revenue = num(p.revenue);
    const now = o.now || new Date();
    const s = summarize(applicants, { productPrice: b.productPrice, cpm, revenue, headcount: b.headcount, now });
    const chans = channelStats(applicants, { productPrice: b.productPrice }).filter(function (c) { return c.count > 0; });
    const stages = stageStats(applicants, { productPrice: b.productPrice });
    const tops = topPerformers(applicants, { productPrice: b.productPrice });
    const sorted = chans.slice().sort(function (x, y) {
      const cx = x.cpv === null ? Infinity : x.cpv;
      const cy = y.cpv === null ? Infinity : y.cpv;
      return cx - cy;
    });
    return {
      brief: b, now: now, summary: s, channels: chans, channelByCpv: sorted,
      stages: stages, tops: tops,
      best: sorted[0] || null,
      worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
      breakeven: cpm > 0 ? s.cost / (cpm / 1000) : null,
      measuredShare: s.views > 0 ? s.measuredViews / s.views : 0,
    };
  }

  function buildReport(brief, applicants, prefs, opts) {
    const m = reportMetrics(brief, applicants, prefs, opts);
    const b = m.brief;
    const s = m.summary;
    const roi = s.roiRevenue !== null ? s.roiRevenue : s.roiAd;
    const roiLabel = s.roiRevenue !== null ? '매출 ROI' : '광고 환산 ROI';
    const L = [];
    const warnings = [];

    L.push('[' + (b.brand || '브랜드') + '] 「' + (b.product || '제품') + '」 체험단 성과 리포트');
    L.push('기준일 ' + formatKoreanDate(m.now) +
      ' · 모집 ' + b.headcount + '명' +
      ' · ' + b.channels.length + '개 채널' +
      (b.applyUntil ? ' · 신청 마감 ' + formatKoreanDate(b.applyUntil) : ''));
    L.push('');

    const lead = [];
    lead.push('선정 이후 ' + s.activeCount + '명에게 ' + formatWon(s.cost) + '을 집행해');
    if (s.measuredCount > 0) lead.push('리뷰 ' + s.measuredCount + '편에서 총 ' + formatCount(s.views) + '회 조회가 나왔고');
    else lead.push('아직 실측 조회수가 없어 평균 조회수 기준으로 총 ' + formatCount(s.views) + '회를 예상했고');
    lead.push('CPV는 ' + formatCpv(s.cpv) + '입니다.');
    if (roi !== null && s.cost > 0) {
      lead.push((s.roiRevenue !== null ? '매출' : '기준 CPM ' + formatWon(s.cpmRate) + ' 환산') +
        ' ROI는 ' + formatPercent(roi, 0) + '입니다.');
    }
    L.push('■ 한 줄 결론');
    L.push(lead.join(' '));
    L.push('');

    L.push('■ 핵심 지표');
    L.push('· 집행 비용 : ' + formatWon(s.cost) + ' (선정 이후 ' + s.activeCount + '명 · 인당 평균 ' + formatWon(Math.round(s.avgCost)) + ')');
    L.push('· 총 조회수 : ' + formatCount(s.views) + '회 (실측 ' + s.measuredCount + '명 ' + formatCount(s.measuredViews) + '회 + 예상 ' + s.pendingCount + '명 ' + formatCount(s.estimatedViews) + '회)');
    L.push('· CPV : ' + formatCpv(s.cpv) + (s.cpm === null ? '' : ' (1,000회당 ' + formatWon(s.cpm) + ')'));
    L.push('· 참여율 : ' + formatPercent(s.engagementRate) + ' (좋아요 ' + formatCount(s.likes) + ' + 댓글 ' + formatCount(s.comments) + ' ÷ 실측 조회 ' + formatCount(s.measuredViews) + ')');
    L.push('· 환산 광고가치 : ' + formatWon(s.adValue) + ' (기준 CPM ' + formatWon(s.cpmRate) + ' 가정)');
    L.push('· ' + roiLabel + ' : ' + (roi === null ? '—' : formatPercent(roi, 0)));
    L.push('· 손익분기 조회수 : ' + (m.breakeven === null ? '—' : formatCount(m.breakeven) + '회'));
    L.push('');

    if (m.channels.length) {
      L.push('■ 채널별 성과');
      m.channels.forEach(function (c) {
        const share = s.views > 0 ? Math.round((c.views / s.views) * 100) : 0;
        L.push('· ' + c.short + ' ' + c.count + '명 · ' + formatWon(c.cost) + ' · ' + formatCount(c.views) + '회(' + share + '%) · CPV ' + formatCpv(c.cpv) +
          (c.engagementRate === null ? '' : ' · 참여율 ' + formatPercent(c.engagementRate)));
      });
      if (m.best) {
        L.push('가장 효율이 좋은 채널은 ' + m.best.short + '(CPV ' + formatCpv(m.best.cpv) + ')' +
          (m.worst && m.worst.id !== m.best.id ? ', 가장 높은 채널은 ' + m.worst.short + '(CPV ' + formatCpv(m.worst.cpv) + ')' : '') + '입니다.');
      }
      L.push('');
    }

    L.push('■ 진행 현황');
    L.push('· ' + m.stages.map(function (st) { return st.short + ' ' + st.count; }).join(' · '));
    const dueBits = [];
    if (s.lateCount) dueBits.push('마감 지남 ' + s.lateCount + '명');
    if (s.dueSoonCount) dueBits.push('3일 내 마감 ' + s.dueSoonCount + '명');
    if (s.weekCount) dueBits.push('7일 내 마감 ' + s.weekCount + '명');
    if (dueBits.length) L.push('· ' + dueBits.join(' · '));
    L.push('');

    L.push('■ 잘 된 점');
    const goods = [];
    if (s.roiRevenue !== null && s.roiRevenue > 0) {
      goods.push('직접 매출 ' + formatWon(s.revenue) + '이 비용 ' + formatWon(s.cost) + '보다 커서 매출 ROI가 ' + formatPercent(s.roiRevenue, 0) + '입니다.');
    } else if (s.roiAd !== null && s.roiAd > 0) {
      goods.push('같은 조회수를 유료 광고로 샀다면 ' + formatWon(s.adValue) + '이 들었을 계산이라, 집행 비용 ' + formatWon(s.cost) + ' 대비 ' + formatPercent(s.roiAd, 0) + '의 광고 환산 ROI가 나옵니다.');
    }
    if (m.best && m.best.count > 0) {
      goods.push(m.best.short + ' 채널의 CPV가 ' + formatCpv(m.best.cpv) + '으로 가장 낮습니다.');
    }
    if (m.measuredShare >= 0.5 && s.measuredCount > 0) {
      goods.push('실측 조회수가 전체의 ' + Math.round(m.measuredShare * 100) + '%를 차지해 추정 비중이 낮습니다.');
    }
    if (s.pendingCount === 0 && s.activeCount > 0) goods.push('선정자 전원이 리뷰를 제출했습니다.');
    if (!goods.length) goods.push('아직 실측 조회수가 쌓이지 않아 예상치로 계산했습니다. 리뷰 링크가 들어오면 이 자리에 실제 성과가 채워집니다.');
    goods.slice(0, 3).forEach(function (g) { L.push('· ' + g); });
    L.push('');

    L.push('■ 다음 캠페인 제안');
    const nexts = [];
    if (m.worst && m.best && m.worst.id !== m.best.id && m.worst.count > 0) {
      nexts.push(m.worst.short + '는 CPV ' + formatCpv(m.worst.cpv) + '로 가장 높습니다. 단가를 조정하거나 다음 모집에서 비중을 줄여 보세요.');
    }
    if (m.best && s.cost > 0) {
      nexts.push('CPV가 가장 낮은 ' + m.best.short + ' 비중을 늘리면 같은 예산으로 조회수를 더 확보할 수 있습니다.');
    }
    if (s.pendingCount > 0) {
      nexts.push('리뷰 미제출 ' + s.pendingCount + '명의 조회수를 채우면 CPV가 예상치가 아닌 실제 값에 가까워집니다.');
    }
    if (s.lateCount > 0) {
      nexts.push('마감이 지난 ' + s.lateCount + '명을 정리하면 다음 캠페인 일정이 밀리지 않습니다.');
    }
    if (s.activeCount < b.headcount) {
      nexts.push('모집 ' + b.headcount + '명 중 ' + s.activeCount + '명만 선정됐습니다. 남은 인원만큼 채널을 넓히거나 모집 기간을 늘려 보세요.');
    }
    if (!nexts.length) nexts.push('지표가 안정적입니다. 같은 조건으로 한 번 더 돌려 채널별 CPV를 비교해 보세요.');
    nexts.slice(0, 4).forEach(function (n, i) { L.push((i + 1) + '. ' + n); });
    L.push('');

    L.push('※ 수치는 앱에 입력된 실측 조회수와 지원자 평균 조회수로 계산했습니다. 예상 조회수가 섞여 있으면 CPV는 확정값이 아닙니다.');
    if (s.roiRevenue === null) L.push('※ 환산 광고가치는 기준 CPM ' + formatWon(s.cpmRate) + ' 가정에 따른 추정이며 실제 매출이 아닙니다. 직접 매출을 입력하면 매출 ROI가 함께 나옵니다.');

    if (!s.measuredCount) warnings.push({ level: 'warn', text: '실측 조회수가 0건입니다. 모든 조회수를 평균값으로 예상했으니, 리뷰 링크와 조회수를 채운 뒤 다시 뽑으세요.' });
    if (s.pendingCount > 0) warnings.push({ level: 'info', text: '리뷰 미제출 ' + s.pendingCount + '명은 평균 조회수로 예상했습니다.' });
    if (s.roiRevenue === null) warnings.push({ level: 'info', text: '직접 매출을 넣지 않아 매출 ROI 대신 광고 환산 ROI를 썼습니다.' });
    if (s.activeCount < b.headcount) warnings.push({ level: 'info', text: '모집 ' + b.headcount + '명 중 ' + s.activeCount + '명만 선정 이후 단계입니다.' });

    const text = L.join('\n');
    return {
      title: '[' + (b.brand || '브랜드') + '] 「' + (b.product || '제품') + '」 체험단 성과 리포트',
      text: text,
      chars: text.length,
      metrics: {
        cost: s.cost, views: s.views, measuredViews: s.measuredViews, estimatedViews: s.estimatedViews,
        measuredCount: s.measuredCount, pendingCount: s.pendingCount, activeCount: s.activeCount,
        cpv: s.cpv, cpm: s.cpm, cpmRate: s.cpmRate, engagementRate: s.engagementRate,
        adValue: s.adValue, roi: roi, roiLabel: roiLabel, breakeven: m.breakeven,
        revenue: s.revenue, lateCount: s.lateCount, dueSoonCount: s.dueSoonCount, weekCount: s.weekCount,
      },
      channels: m.channels.map(function (c) {
        return { id: c.id, label: c.short, count: c.count, cost: c.cost, views: c.views, cpv: c.cpv, engagementRate: c.engagementRate };
      }),
      goodPoints: goods.slice(0, 3),
      nextSteps: nexts.slice(0, 4),
      warnings: warnings,
    };
  }

  /* ==========================================================
     내 구독 AI 프롬프트 · 답변 처리
     ========================================================== */

  const MASK_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  /** 지원자 개인정보를 걷어낸 목록. 메모·리뷰 링크는 어떤 경우에도 넣지 않는다. */
  function maskApplicants(applicants, opts) {
    const o = opts || {};
    const personal = !!o.personal;
    return (applicants || []).map(function (a, i) {
      const letter = MASK_LETTERS[i % MASK_LETTERS.length] + (i >= MASK_LETTERS.length ? String(Math.floor(i / MASK_LETTERS.length) + 1) : '');
      return {
        label: personal && a.name ? a.name : '지원자 ' + letter,
        handle: personal && a.handle ? '@' + String(a.handle).replace(/^@/, '') : '@creator_' + letter.toLowerCase(),
        channel: channelShort(a.channel),
        followers: num(a.followers),
        avgViews: num(a.avgViews),
        views: num(a.views),
        likes: num(a.likes),
        comments: num(a.comments),
        fee: num(a.fee),
        stage: stageLabel(a.stage),
      };
    });
  }

  function applicantLine(row, productPrice) {
    const cost = row.fee + num(productPrice);
    const bits = [
      row.label + ' (' + row.handle + ')',
      row.channel,
      '팔로워 ' + formatCount(row.followers),
      '평균 조회 ' + formatCount(row.avgViews),
      row.stage,
    ];
    if (row.views > 0) {
      bits.push('실측 ' + formatCount(row.views) + '회');
      if (row.likes + row.comments > 0) bits.push('좋아요 ' + formatCount(row.likes) + '·댓글 ' + formatCount(row.comments));
      bits.push('CPV ' + formatCpv(row.views > 0 ? cost / row.views : null));
    }
    return '· ' + bits.join(' · ');
  }

  function buildAiPrompt(opts) {
    const o = opts || {};
    const mode = o.mode === 'report' ? 'report' : 'brief';
    const b = normalizeBrief(o.brief);
    const list = o.applicants || [];
    const personal = !!o.personal;
    const rows = maskApplicants(list, { personal: personal });
    const m = reportMetrics(b, list, o.prefs, { now: o.now });
    const s = m.summary;
    const L = [];
    let title = '';

    if (mode === 'brief') {
      const built = o.built || buildBrief(b);
      const docText = o.docText || built.posting.text;
      title = '모집 공고 다듬기 · ' + campaignName(b);
      L.push('너는 체험단 모집 공고를 쓰는 카피라이터야. 아래 캠페인 조건과 현재 공고문을 바탕으로, 지원자가 더 많이 신청하는 공고문으로 다시 써 줘.');
      L.push('');
      L.push('[캠페인 조건]');
      L.push('· 브랜드 : ' + (b.brand || '브랜드'));
      L.push('· 제품 : ' + (b.product || '제품') + ' (제품가 ' + formatWon(b.productPrice) + ')');
      L.push('· 원고료 : ' + (b.fee > 0 ? formatWon(b.fee) + ' (1인)' : '없음 — 제품만 제공'));
      L.push('· 모집 인원 : ' + b.headcount + '명');
      L.push('· 모집 채널 : ' + b.channels.map(channelLabel).join(', '));
      L.push('· 필수 해시태그 : ' + (b.hashtags.length ? b.hashtags.join(' ') : '없음'));
      L.push('· 미션 : ' + missionLine(b));
      L.push('· 신청 마감 : ' + (b.applyUntil ? formatKoreanDate(b.applyUntil) + ' 23:59' : '인원 충족 시 조기 마감'));
      if (b.announceOn) L.push('· 결과 안내 : ' + formatKoreanDate(b.announceOn));
      L.push('· 업로드 기한 : 제품 수령 후 ' + b.uploadDays + '일 이내');
      if (b.extra) L.push('· 추가 혜택 : ' + b.extra);
      if (b.contact) L.push('· 신청·문의처 : ' + b.contact);
      L.push('· 인당 혜택가 : ' + formatWon(perPersonValue(b)) + ' 상당');
      L.push('');
      L.push('[현재 공고문]');
      L.push(docText);
      L.push('');
      if (o.psych && o.psych.total !== undefined) {
        L.push('[카피 진단 — 8대 심리 트리거]');
        L.push('· 종합 ' + o.psych.total + '점 (' + (o.psych.grade ? o.psych.grade.id : '-') + ')');
        (o.psych.groups || []).forEach(function (g) {
          L.push('· ' + g.label + ' ' + g.score + ' / 목표 ' + g.target);
        });
        if (o.psych.gaps && o.psych.gaps.length) {
          L.push('· 먼저 채울 빈틈 :');
          o.psych.gaps.forEach(function (g, i) { L.push('  ' + (i + 1) + '. ' + g.name + ' ' + g.score + '점 — ' + g.fix); });
        }
        L.push('');
      }
      L.push('[지원자 현황]' + (personal ? ' (이름·핸들 포함)' : ' (개인정보 제외 — 이름·핸들·메모·리뷰 링크 없음)'));
      L.push('· 지원 ' + s.count + '명 · 선정 이후 ' + s.activeCount + '명 · 모집 ' + b.headcount + '명');
      const byChannel = {};
      rows.forEach(function (r) {
        const k = r.channel;
        if (!byChannel[k]) byChannel[k] = { count: 0, followers: 0, avg: 0, active: 0 };
        byChannel[k].count++;
        byChannel[k].followers += r.followers;
        byChannel[k].avg += r.avgViews;
        if (r.stage !== stageLabel('applied')) byChannel[k].active++;
      });
      Object.keys(byChannel).forEach(function (k) {
        const v = byChannel[k];
        L.push('· ' + k + ' ' + v.count + '명 (선정 이후 ' + v.active + '명 · 평균 팔로워 ' + formatCount(Math.round(v.followers / v.count)) + ' · 평균 조회 ' + formatCount(Math.round(v.avg / v.count)) + ')');
      });
      rows.slice(0, 8).forEach(function (r) { L.push(applicantLine(r, b.productPrice)); });
      if (rows.length > 8) L.push('· (나머지 ' + (rows.length - 8) + '명 생략)');
      L.push('');
      L.push('[요청]');
      L.push('1. 공고문 전체를 한국어로 다시 써 줘. 첫 줄은 제목, 그 아래는 본문.');
      L.push('2. 첫 3줄 안에 지원자가 "내 이야기"라고 느낄 장면을 넣고, 손실 회피 표현을 1회 이상 써 줘.');
      L.push('3. 모집 인원·혜택·마감 시각·업로드 기한은 위 값 그대로. 없는 숫자를 새로 만들지 마.');
      L.push('4. 사회적 증거(후기·선정 사례·누적 인원)는 위 데이터에 있는 것만 쓰고, 없으면 지어내지 마.');
      L.push('5. "최고·유일·100%·완벽한" 같은 최상급과 "다양한·혁신적인·차별화된" 같은 추상어를 쓰지 마.');
      L.push('6. 공정위 대가성 문구(제공받아 작성했습니다)와 개인정보·유의사항 항목은 빼지 마.');
      L.push('7. 출력은 공고문 텍스트만. 인사말·설명·머리말을 붙이지 마.');
    } else {
      const report = o.report || buildReport(b, list, o.prefs, { now: o.now });
      title = '광고주 성과 리포트 · ' + campaignName(b);
      L.push('너는 체험단 캠페인 성과를 광고주에게 보고하는 마케터야. 아래 데이터만 사용해서 1페이지 성과 리포트를 써 줘.');
      L.push('');
      L.push('[캠페인]');
      L.push('· 브랜드 : ' + (b.brand || '브랜드'));
      L.push('· 제품 : ' + (b.product || '제품') + ' (제품가 ' + formatWon(b.productPrice) + ')');
      L.push('· 모집 ' + b.headcount + '명 · 채널 ' + b.channels.map(channelLabel).join(', '));
      if (b.applyUntil) L.push('· 신청 마감 : ' + formatKoreanDate(b.applyUntil));
      L.push('· 업로드 기한 : 제품 수령 후 ' + b.uploadDays + '일 이내');
      L.push('');
      L.push('[성과 지표]');
      L.push('· 집행 비용 : ' + formatWon(s.cost) + ' (선정 이후 ' + s.activeCount + '명)');
      L.push('· 총 조회수 : ' + formatCount(s.views) + '회 (실측 ' + s.measuredCount + '명 ' + formatCount(s.measuredViews) + '회 + 평균 조회수로 예상한 ' + s.pendingCount + '명 ' + formatCount(s.estimatedViews) + '회)');
      L.push('· CPV : ' + formatCpv(s.cpv) + ' · 기준 CPM : ' + formatWon(s.cpmRate));
      L.push('· 참여율 : ' + formatPercent(s.engagementRate) + ' (좋아요 ' + formatCount(s.likes) + ' + 댓글 ' + formatCount(s.comments) + ')');
      L.push('· 환산 광고가치 : ' + formatWon(s.adValue) + ' (기준 CPM 가정)');
      L.push('· ' + (s.roiRevenue !== null ? '매출 ROI : ' + formatPercent(s.roiRevenue, 0) + ' (직접 매출 ' + formatWon(s.revenue) + ')' : '광고 환산 ROI : ' + (s.roiAd === null ? '—' : formatPercent(s.roiAd, 0))));
      L.push('· 진행 단계 : ' + m.stages.map(function (st) { return st.short + ' ' + st.count; }).join(' · '));
      L.push('· 마감 지남 ' + s.lateCount + '명 · 3일 내 ' + s.dueSoonCount + '명');
      L.push('');
      if (m.channels.length) {
        L.push('[채널별]');
        m.channels.forEach(function (c) {
          L.push('· ' + c.short + ' ' + c.count + '명 · 비용 ' + formatWon(c.cost) + ' · 조회 ' + formatCount(c.views) + ' · CPV ' + formatCpv(c.cpv) + (c.engagementRate === null ? '' : ' · 참여율 ' + formatPercent(c.engagementRate)));
        });
        L.push('');
      }
      const measured = rows.filter(function (r) { return r.views > 0; }).sort(function (x, y) {
        return (x.fee + num(b.productPrice)) / x.views - (y.fee + num(b.productPrice)) / y.views;
      });
      if (measured.length) {
        L.push('[지원자별 효율 — CPV 낮은 순]' + (personal ? '' : ' (개인정보 제외)'));
        measured.slice(0, 5).forEach(function (r) { L.push(applicantLine(r, b.productPrice)); });
        L.push('');
      }
      L.push('[자동 생성 초안]');
      L.push(report.text);
      L.push('');
      L.push('[요청]');
      L.push('1. 숫자는 위에 있는 값만 인용해. 새 수치를 만들거나 반올림해서 다른 값으로 쓰지 마.');
      L.push('2. 구성 : ① 한 줄 결론 ② 핵심 지표 표 ③ 채널 해석 ④ 다음 캠페인 제안 3개.');
      L.push('3. 실측 조회수와 예상 조회수를 구분해서 표기하고, 환산 광고가치는 "기준 CPM 가정"이라고 밝혀.');
      L.push('4. 좋은 점만 쓰지 말고 CPV가 높은 채널·미제출 인원 같은 약점도 한 줄씩 넣어.');
      L.push('5. 한국어로 700~1,000자. 광고주가 3분 안에 읽는 분량.');
      L.push('6. 출력은 리포트 본문만. 인사말이나 "다음은" 같은 말은 붙이지 마.');
    }

    const prompt = L.join('\n');
    return {
      mode: mode,
      title: title,
      prompt: prompt,
      chars: prompt.length,
      lines: L.length,
      personal: personal,
      applicants: rows.length,
      includes: {
        names: personal ? rows.filter(function (r) { return r.label.indexOf('지원자 ') !== 0; }).length : 0,
        memos: 0,
        links: 0,
      },
    };
  }

  /** AI 답변에서 코드블록·머리말을 걷어내고 바로 쓸 수 있는 본문으로 만든다. */
  function parseAiAnswer(raw, mode) {
    const m = mode === 'report' ? 'report' : 'brief';
    let text = String(raw === null || raw === undefined ? '' : raw).replace(/\r\n?/g, '\n');
    let fences = 0;
    text = text.split('\n').filter(function (line) {
      if (/^\s*```/.test(line)) { fences++; return false; }
      return true;
    }).join('\n');
    text = text.replace(/^\s*(?:공고문|모집\s*공고문|성과\s*리포트|리포트|보고서|초안)\s*[:：]\s*/, '');
    text = text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

    const warnings = [];
    const chars = text.length;
    if (fences) warnings.push('코드블록 표시(```) ' + fences + '개를 지웠어요.');
    if (!chars) warnings.push('붙여넣은 글이 비어 있어요.');
    else if (m === 'brief' && chars < 300) warnings.push('공고문이 ' + chars + '자로 짧아요. AI 답변이 잘렸는지 확인하세요.');
    else if (m === 'report' && chars < 200) warnings.push('리포트가 ' + chars + '자로 짧아요. 답변이 잘렸는지 확인하세요.');
    if (m === 'brief' && chars >= 300) {
      if (!/제공받아\s*작성|제공받았|협찬|대가성/.test(text)) {
        warnings.push('대가성 문구가 보이지 않아요. 그대로 올리면 표시광고 위험이 있습니다.');
      }
      if (!/개인정보/.test(text)) warnings.push('개인정보 처리 안내가 빠졌어요. 신청자 주소·연락처를 받는다면 꼭 넣으세요.');
      if (/최고의|최상의|유일한|100%|완벽한/.test(text)) warnings.push('최상급 표현이 남아 있어요. 근거가 없으면 표시광고법 위반이 될 수 있습니다.');
    }
    return { mode: m, text: text, chars: chars, lines: text ? text.split('\n').length : 0, fences: fences, warnings: warnings };
  }

  /**
   * AI가 쓴 숫자 중 원본 데이터에 없는 값을 찾는다(지어낸 수치 점검).
   * 단위가 붙은 숫자와 4자리 이상 숫자만 본다.
   */
  function auditNumbers(text, sourceText) {
    /* 날짜는 AI가 '2026년 11월 28일'처럼 다시 쓸 수 있으니 검사에서 뺀다. */
    const DATE_RE = /\d{4}\s*년(?:\s*\d{1,2}\s*월)?(?:\s*\d{1,2}\s*일)?|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g;
    const RE = /(\d[\d,]*(?:\.\d+)?)\s*(원|%|회|명|편|만|억|배|건)/g;
    const NUM_ONLY = /\b\d[\d,]{3,}\b/g;
    const norm = function (v) { return String(v).replace(/,/g, ''); };
    const collect = function (src, withBare) {
      const set = {};
      let m;
      const re = new RegExp(RE.source, 'g');
      while ((m = re.exec(String(src))) !== null) set[norm(m[1]) + (m[2] || '')] = 1;
      if (withBare) {
        const re2 = new RegExp(NUM_ONLY.source, 'g');
        while ((m = re2.exec(String(src))) !== null) set[norm(m[0])] = 1;
      }
      return set;
    };
    const source = collect(sourceText, true);
    const seen = {};
    const unknown = [];
    let m;
    const re = new RegExp(RE.source, 'g');
    const body = String(text || '').replace(DATE_RE, ' ');
    while ((m = re.exec(body)) !== null) {
      const key = norm(m[1]) + (m[2] || '');
      if (source[key] || seen[key]) continue;
      seen[key] = 1;
      const start = Math.max(0, m.index - 12);
      unknown.push({ value: m[0].trim(), context: body.slice(start, m.index + m[0].length + 8).replace(/\n/g, ' ') });
    }
    return { ok: unknown.length === 0, checked: Object.keys(seen).length, unknown: unknown.slice(0, 8) };
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return {
    CHANNELS, STAGES, SORTS, DEFAULT_CPM,
    CHANNEL_ALIASES, STAGE_ALIASES,
    num, parseNumber, formatNumber, formatCount, formatWon, formatWonShort, formatCpv, formatPercent,
    parseDate, toIsoDate, addDays, todayIso, daysLeft, ddayLabel, formatKoreanDate, formatShortDate,
    channelById, channelLabel, channelShort, stageById, stageLabel, stageIndex, nextStage, prevStage,
    normalizeChannel, normalizeStage, normalizeChannels, normalizeHashtags, splitList, clamp,
    normalizeBrief, perPersonValue, campaignName, buildBrief, briefWarnings,
    normalizeApplicant, applicantCost, addApplicant, mergeApplicants, updateApplicant, moveApplicant,
    removeApplicant, ddayInfo, sortApplicants, filterApplicants,
    detectDelimiter, parseCsvRows, parseApplicantsCsv, toCsv, csvCell,
    summarize, channelStats, stageStats, dueList, topPerformers,
    PSYCH_GROUPS, PSYCH_WEIGHTS, psychGrade, psychProfile, wordFixGroups,
    WORD_FIX_PRIMARY, WORD_FIX_SECONDARY, introDefaults,
    reportMetrics, buildReport, buildAiPrompt, parseAiAnswer, auditNumbers,
    maskApplicants,
    toBackup, parseBackup, escapeHtml, newId,
    _internal: { buildPosting, buildDm, buildEmail, buildDisclosure, buildGuide, headerKeyOf, POSITIONAL_ORDER, CSV_HEADERS },
  };
});
