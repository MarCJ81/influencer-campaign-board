/* ============================================================
   인플루언서 캠페인 보드 · engines/board-engine.js
   ------------------------------------------------------------
   붙인 오픈소스 (상업 배포 가능)
     · SortableJS 1.15.6  MIT   터치·모바일 카드 드래그 정렬
     · Chart.js 4.4.6     MIT   채널별 조회수·CPV 성과 차트

   브라우저: window.BoardEngine / node: require('./engines/board-engine.js')
   Sortable/Chart 가 없으면 hasSortable=false, hasChart=false 로 알리고
   앱은 기존 HTML5 드래그로 그대로 동작한다.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, function (p) {
      try { return require(p); } catch (e) { return null; }
    });
  } else {
    root.BoardEngine = factory(root, null);
  }
})(typeof self !== 'undefined' ? self : this, function (root, req) {
  'use strict';

  var VERSION = '1.0.0';
  var Sortable = null;
  try { Sortable = (root && root.Sortable) || (req ? req('../assets/vendor/sortable.min.js') : null); } catch (e) { Sortable = null; }
  if (Sortable && Sortable.default && typeof Sortable.default === 'function') Sortable = Sortable.default;
  var hasSortable = typeof Sortable === 'function';

  var instances = [];
  var charts = {};

  function cssVar(name, fallback) {
    try {
      if (root && root.getComputedStyle && root.document) {
        var v = root.getComputedStyle(root.document.documentElement).getPropertyValue(name);
        if (v && v.trim()) return v.trim();
      }
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function destroyAll() {
    for (var i = 0; i < instances.length; i++) {
      try { instances[i].destroy(); } catch (e) { /* ignore */ }
    }
    instances = [];
  }

  /**
   * mountColumns(rootEl, handlers)
   * rootEl: #kanban. 각 .col-body 를 하나의 정렬 영역으로 묶는다.
   * handlers: { onMove(id, toStage), onStart(), onEnd() }
   * 반환: mounted 여부(boolean)
   */
  function mountColumns(rootEl, handlers) {
    if (!hasSortable || !rootEl) return false;
    var h = handlers || {};
    destroyAll();
    var bodies = rootEl.querySelectorAll('.col .col-body');
    for (var i = 0; i < bodies.length; i++) {
      var body = bodies[i];
      var col = body.closest('.col');
      var sortable = Sortable.create(body, {
        group: 'influencer-board',
        animation: 160,
        draggable: '.kcard',
        ghostClass: 'is-ghost',
        chosenClass: 'is-chosen',
        dragClass: 'is-dragging',
        delay: 120,                 // 모바일에서 스크롤과 겹치지 않게
        delayOnTouchOnly: true,
        touchStartThreshold: 4,
        forceFallback: false,
        emptyInsertThreshold: 24,
        onStart: function () {
          rootEl.classList.add('is-sorting');
          if (typeof h.onStart === 'function') h.onStart();
        },
        onEnd: function (evt) {
          rootEl.classList.remove('is-sorting');
          var id = evt.item && evt.item.dataset ? evt.item.dataset.id : '';
          var toCol = evt.to && evt.to.closest ? evt.to.closest('.col') : null;
          var stage = toCol && toCol.dataset ? toCol.dataset.stage : (col ? col.dataset.stage : '');
          if (typeof h.onEnd === 'function') h.onEnd();
          if (id && stage && typeof h.onMove === 'function') h.onMove(id, stage);
        }
      });
      instances.push(sortable);
    }
    return instances.length > 0;
  }

  function isMounted() { return instances.length > 0; }

  /* ---------- 채널 성과 차트 (조회수 막대 + CPV 선) ---------- */

  function money(n) {
    var v = Math.round(Number(n) || 0);
    if (v >= 100000000) return (Math.round(v / 10000000) / 10) + '억';
    if (v >= 10000) return (Math.round(v / 1000) / 10) + '만';
    return String(v);
  }

  /**
   * drawChannelChart(canvas, rows, opts)
   * rows: [{ short, views, cpv, count }] — 채널 4~5개.
   */
  function drawChannelChart(canvas, rows, opts) {
    var Chart = root && root.Chart ? root.Chart : null;
    if (!Chart || !canvas) return null;
    var list = (rows || []).filter(function (r) { return r; });
    if (!list.length) return null;
    var key = canvas.id || 'channel-chart';
    if (charts[key]) { charts[key].destroy(); delete charts[key]; }
    var accent = cssVar('--accent', '#2563eb');
    var ok = cssVar('--ok', '#0e9f6e');
    var ink = cssVar('--muted', '#5f6875');
    var line = cssVar('--line', 'rgba(20,24,31,.12)');

    charts[key] = new Chart(canvas.getContext('2d'), {
      data: {
        labels: list.map(function (r) { return r.short; }),
        datasets: [
          {
            type: 'bar',
            label: '조회수',
            data: list.map(function (r) { return r.views; }),
            backgroundColor: accent + 'aa',
            borderColor: accent,
            borderWidth: 1,
            borderRadius: 5,
            maxBarThickness: 54,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'CPV(원)',
            data: list.map(function (r) { return r.cpv === null || r.cpv === undefined ? null : Math.round(r.cpv); }),
            borderColor: ok,
            backgroundColor: ok,
            borderWidth: 2,
            pointRadius: 3.5,
            pointHoverRadius: 5,
            tension: 0.28,
            spanGaps: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 260 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { boxWidth: 10, boxHeight: 10, color: ink, font: { size: 11 }, usePointStyle: true }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                if (ctx.dataset.label === 'CPV(원)') {
                  return ctx.parsed.y === null ? 'CPV —' : 'CPV ' + money(ctx.parsed.y) + '원';
                }
                return '조회수 ' + money(ctx.parsed.y) + '회';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: ink, font: { size: 11 } } },
          y: {
            beginAtZero: true,
            grid: { color: line },
            ticks: { color: ink, font: { size: 10 }, callback: function (v) { return money(v); } },
            title: { display: false }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: { display: false },
            ticks: {
              color: ok, font: { size: 10 }, precision: 0,
              callback: function (v) { return Number(v) >= 10000 ? money(v) : String(Math.round(Number(v) * 10) / 10); }
            }
          }
        }
      }
    });
    return charts[key];
  }

  function destroy(chartId) {
    if (charts[chartId]) { charts[chartId].destroy(); delete charts[chartId]; }
  }

  function destroyAllCharts() {
    for (var k in charts) if (Object.prototype.hasOwnProperty.call(charts, k)) {
      try { charts[k].destroy(); } catch (e) { /* ignore */ }
      delete charts[k];
    }
  }

  return {
    VERSION: VERSION,
    hasSortable: hasSortable,
    hasChart: !!(root && root.Chart),
    mountColumns: mountColumns,
    isMounted: isMounted,
    destroyAll: destroyAll,
    drawChannelChart: drawChannelChart,
    destroy: destroy,
    destroyAllCharts: destroyAllCharts,
    money: money
  };
});
