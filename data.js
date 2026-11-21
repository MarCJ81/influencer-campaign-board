/* ============================================================
   체험단 매칭 보드 · data.js
   데모 캠페인 1건 + 지원자 12건. 인물·핸들·수치·연락 수단은
   전부 가상이며 실제 개인정보가 없습니다.
   ============================================================ */
(function (root, factory) {
  const api = factory(root && root.CORE ? root.CORE : (typeof require === 'function' ? require('./core.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DATA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  if (!C) throw new Error('core.js가 먼저 로드되어야 합니다.');
  const add = (base, n) => C.addDays(base, n);

  function demoBrief(now) {
    const base = now || new Date();
    return {
      brand: '샘플뷰티',
      product: '비건 수분 선크림 50ml',
      productPrice: 39000,
      fee: 50000,
      headcount: 10,
      channels: ['instagram', 'blog', 'youtube', 'threads'],
      hashtags: ['#샘플뷰티', '#비건선크림', '#수분선크림', '#체험단'],
      mission: '아침 루틴에서 선크림을 바르는 장면과, 외출 후 세안 전 피부 상태를 3장 이상의 사진(또는 15초 이상 영상)으로 보여 주세요.',
      applyUntil: add(base, 7),
      announceOn: add(base, 10),
      uploadDays: 14,
      contact: '인스타 DM @sample.beauty 또는 sample@example.com',
      extra: '',
    };
  }

  function demoApplicants(now) {
    const base = now || new Date();
    const rows = [
      {
        id: 'a01', name: '데일리글로우', handle: '@daily.glow', channel: 'instagram',
        followers: 12400, avgViews: 48000, fee: 50000, stage: 'uploaded',
        dueDate: add(base, -6), joinedAt: add(base, -18),
        views: 62400, likes: 3120, comments: 214,
        reviewUrl: 'https://example.com/r/daily-glow',
        note: 'DM 응답 빠름 · 주소 확인 완료 · 릴스 2편 업로드',
      },
      {
        id: 'a02', name: '키친노트', handle: '@kitchen.note', channel: 'blog',
        followers: 8900, avgViews: 21000, fee: 50000, stage: 'shipped',
        dueDate: add(base, 5), joinedAt: add(base, -16),
        reviewUrl: '',
        note: '운송장 1234-5678-9012 (샘플) · 수령 확인',
      },
      {
        id: 'a03', name: '러닝메이트', handle: '@run.with.me', channel: 'youtube',
        followers: 34000, avgViews: 96000, fee: 70000, stage: 'uploaded',
        dueDate: add(base, -2), joinedAt: add(base, -21),
        views: 118200, likes: 4230, comments: 386,
        reviewUrl: 'https://example.com/r/run-with-me',
        note: '쇼츠 1편 + 롱폼 1편 · 자막 검수 요청 1회',
      },
      {
        id: 'a04', name: '민지의 스레드', handle: '@threads.minji', channel: 'threads',
        followers: 5600, avgViews: 14000, fee: 40000, stage: 'settled',
        dueDate: add(base, -11), joinedAt: add(base, -25),
        views: 19800, likes: 640, comments: 41,
        reviewUrl: 'https://example.com/r/threads-minji',
        note: '원고료 지급 완료 (샘플)',
      },
      {
        id: 'a05', name: '스킨다이어리', handle: '@skin.diary', channel: 'instagram',
        followers: 22300, avgViews: 74000, fee: 60000, stage: 'selected',
        dueDate: add(base, 3), joinedAt: add(base, -9),
        reviewUrl: '',
        note: '주소 회신 대기 · 3일 내 미회신 시 다음 순번',
      },
      {
        id: 'a06', name: '슬로우모닝', handle: '@slow.morning', channel: 'blog',
        followers: 3200, avgViews: 6400, fee: 30000, stage: 'applied',
        dueDate: '', joinedAt: add(base, -2),
        note: '블로그 상위 노출 경험 있음 · 샘플 원고 요청',
      },
      {
        id: 'a07', name: '비디오하나', handle: '@video.hana', channel: 'youtube',
        followers: 51000, avgViews: 140000, fee: 80000, stage: 'settled',
        dueDate: add(base, -14), joinedAt: add(base, -28),
        views: 205400, likes: 8920, comments: 723,
        reviewUrl: 'https://example.com/r/video-hana',
        note: '2차 활용 동의 완료 · 정산 완료 (샘플)',
      },
      {
        id: 'a08', name: '네일미니', handle: '@nail.mini', channel: 'instagram',
        followers: 1850, avgViews: 4200, fee: 0, stage: 'shipped',
        dueDate: add(base, -2), joinedAt: add(base, -14),
        reviewUrl: '',
        note: '제품만 제공 · 마감 2일 지남 · 리마인드 DM 발송',
      },
      {
        id: 'a09', name: '그린테이블', handle: '@green.table', channel: 'blog',
        followers: 15700, avgViews: 9800, fee: 45000, stage: 'uploaded',
        dueDate: add(base, -1), joinedAt: add(base, -19),
        views: 11200, likes: 382, comments: 27,
        reviewUrl: 'https://example.com/r/green-table',
        note: '사진 원본 6장 회신 · 링크 확인 완료',
      },
      {
        id: 'a10', name: '데일리핏', handle: '@daily.fit', channel: 'threads',
        followers: 9400, avgViews: 33000, fee: 40000, stage: 'applied',
        dueDate: '', joinedAt: add(base, -1),
        note: '운동 루틴 글 위주 · 제품 카테고리 적합',
      },
      {
        id: 'a11', name: '카메라리', handle: '@camera.lee', channel: 'youtube',
        followers: 7800, avgViews: 12500, fee: 35000, stage: 'selected',
        dueDate: add(base, 9), joinedAt: add(base, -7),
        note: '촬영 일정 주말 협의 · 제품 발송 예정',
      },
      {
        id: 'a12', name: '홈카페', handle: '@home.cafe', channel: 'instagram',
        followers: 4100, avgViews: 18900, fee: 0, stage: 'settled',
        dueDate: add(base, -9), joinedAt: add(base, -23),
        views: 24600, likes: 1050, comments: 96,
        reviewUrl: 'https://example.com/r/home-cafe',
        note: '제품만 제공 · 정산 완료 · 재참여 의사 있음',
      },
    ];
    return rows;
  }

  function demoPrefs() {
    return { theme: 'light', boardView: 'kanban', sort: 'due', cpm: 8000, revenue: 1850000 };
  }

  return { demoBrief: demoBrief, demoApplicants: demoApplicants, demoPrefs: demoPrefs };
});
