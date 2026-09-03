/**
 * [board.js] — 현황판 (장소 × 시간 격자).
 *
 * 무엇을 한다: 일 보기(세로=장소, 가로=시간)와 주 보기(장소 하나, 세로=요일)를 그린다.
 *              빈 칸 클릭 → 예약 폼, 일정 클릭 → 상세 팝오버.
 * 의존:        config.js, time.js, i18n.js, ui.js, api.js, bookingForm.js, app.js(state)
 * 호출됨:      app.js 가 render() 를 부른다.
 * 주의:        일정 블록은 트랙 위에 절대 위치로 놓는다. 좌표 = (분 - 표시 시작 분) / 슬롯 분 × SLOT_PX.
 *              표시 범위 밖으로 걸친 일정은 잘라서 그린다.
 * 정책 근거:   D-13(현황판 규칙은 02-아키텍처.md 8절)
 */
window.RB = window.RB || {};

RB.board = (function () {
  var U = RB.ui, T = RB.time, t = function (k, v) { return RB.i18n.t(k, v); };

  var state = { view: 'day', date: T.today(), weekResource: null, events: [], pending: [], preloaded: null };

  function cfg() { return RB.app.state.config; }
  function resources() { return RB.app.state.resources.filter(function (r) { return r.reservable !== false; }); }

  /** 표시 범위(분) */
  function range() {
    var hm = (cfg().displayHours || '07:00-21:00').split('-');
    return { from: T.parseHM(hm[0]), to: T.parseHM(hm[1]) };
  }
  function slotMin() { return cfg().slotMinutes || 30; }
  function px(minutes) { return (minutes / slotMin()) * RB.config.SLOT_PX; }

  // ---- 데이터 로드 ----------------------------------------------------------
  /** 현재 보기의 조회 구간 {from,to} (ISO). app.js 의 init 호출도 이걸 쓴다. */
  function currentRange() {
    var fromKey = state.view === 'day' ? state.date : T.weekStart(state.date);
    var days = state.view === 'day' ? 1 : 7;
    return { from: T.make(fromKey, 0).toISOString(), to: T.make(T.addDays(fromKey, days), 0).toISOString() };
  }
  function initialRange() { return currentRange(); }

  /** init 응답에 실려 온 첫 현황판 데이터. 같은 구간이면 load() 가 한 번 재사용한다. */
  function preload(range, data) { state.preloaded = { range: range, data: data }; }

  function load() {
    var range = currentRange();
    var pre = state.preloaded;
    state.preloaded = null;
    var p = (pre && pre.range.from === range.from && pre.range.to === range.to)
      ? Promise.resolve(pre.data)
      : RB.api.call('board', range);
    return p.then(function (data) {
      state.events = data.events.map(hydrate);
      state.pending = (data.pending || []).map(hydrate);
    });
  }
  function hydrate(e) { e.start = new Date(e.start); e.end = new Date(e.end); return e; }

  // ---- 렌더링 --------------------------------------------------------------
  function render(host) {
    U.clear(host);
    host.appendChild(toolbar());
    var wrap = U.el('div.board-wrap.loading');
    host.appendChild(wrap);
    // 로딩 중에는 직전 데이터로 그려 두어 화면이 비지 않게 한다(첫 로드면 안내문)
    if (resources().length && state.events.length) wrap.appendChild(state.view === 'day' ? dayGrid() : weekGrid());
    else wrap.appendChild(U.el('p.muted', null, [t('loading')]));
    load().then(function () {
      U.clear(wrap); wrap.classList.remove('loading');
      if (!resources().length) { wrap.appendChild(U.el('p.muted', null, [t('board.empty')])); return; }
      wrap.appendChild(state.view === 'day' ? dayGrid() : weekGrid());
      wrap.appendChild(legend());
    }).catch(function (err) {
      U.clear(wrap);
      wrap.appendChild(U.el('p.error', null, [err.message || t('error.network')]));
    });
  }

  function toolbar() {
    var lang = RB.i18n.get();
    var label = state.view === 'day'
      ? T.fmtDate(state.date, lang, true)
      : T.fmtDate(T.weekStart(state.date), lang, true) + ' ~ ' + T.fmtDate(T.addDays(T.weekStart(state.date), 6), lang);

    var step = state.view === 'day' ? 1 : 7;
    var bar = U.el('div.toolbar', null, [
      U.el('div.toolbar-group', null, [
        U.el('button.btn', { type: 'button', onclick: function () { state.date = T.today(); rerender(); } }, [t('btn.today')]),
        U.el('button.icon-btn', { type: 'button', 'aria-label': 'prev', onclick: function () { state.date = T.addDays(state.date, -step); rerender(); } }, ['‹']),
        U.el('input.date-input', { type: 'date', value: state.date, onchange: function (e) { if (e.target.value) { state.date = e.target.value; rerender(); } } }),
        U.el('button.icon-btn', { type: 'button', 'aria-label': 'next', onclick: function () { state.date = T.addDays(state.date, step); rerender(); } }, ['›']),
        U.el('span.toolbar-label', null, [label])
      ]),
      U.el('div.toolbar-group', null, [
        segment('day'), segment('week'),
        state.view === 'week' ? resourcePicker() : null,
        U.el('button.btn.btn-primary', { type: 'button', onclick: function () { RB.bookingForm.open({}); } }, ['+ ' + t('btn.book')])
      ])
    ]);
    return bar;
  }

  function segment(view) {
    return U.el('button.seg' + (state.view === view ? '.active' : ''), {
      type: 'button', onclick: function () { state.view = view; rerender(); }
    }, [t('view.' + view)]);
  }

  function resourcePicker() {
    var sel = U.el('select.select', { onchange: function (e) { state.weekResource = e.target.value; rerender(); } });
    resources().forEach(function (r) {
      sel.appendChild(U.el('option', { value: r.calendarId, selected: r.calendarId === currentWeekResource() }, [r.name]));
    });
    return sel;
  }
  function currentWeekResource() {
    if (!state.weekResource || !resources().some(function (r) { return r.calendarId === state.weekResource; })) {
      state.weekResource = resources()[0].calendarId;
    }
    return state.weekResource;
  }

  function rerender() { render(document.getElementById('view-board')); }

  /** 시간 눈금 헤더 (한 시간마다 라벨) */
  function timeHeader() {
    var rg = range();
    var head = U.el('div.track.track-head');
    for (var m = rg.from; m < rg.to; m += 60) {
      head.appendChild(U.el('div.hour-label', { style: { left: px(m - rg.from) + 'px', width: px(60) + 'px' } }, [String(Math.floor(m / 60))]));
    }
    head.style.width = px(rg.to - rg.from) + 'px';
    return head;
  }

  /** 일 보기: 행 = 장소 */
  function dayGrid() {
    var grid = U.el('div.grid');
    grid.appendChild(row(U.el('div.row-label.row-label-head', null, ['']), timeHeader()));
    resources().forEach(function (r) {
      var label = U.el('div.row-label', { title: r.mode === 'APPROVAL' ? t('mode.APPROVAL') : '' }, [
        U.el('div.row-name', null, [r.name, r.mode === 'APPROVAL' ? U.el('span.approval-mark', null, ['*']) : null]),
        U.el('div.row-sub', null, [[(r.aliases || []).join(', '), r.capacity ? String(r.capacity) : ''].filter(String).join(' · ')])
      ]);
      var evs = state.events.filter(function (e) { return e.calendarId === r.calendarId; });
      grid.appendChild(row(label, track(r, state.date, evs)));
    });
    return grid;
  }

  /** 주 보기: 행 = 요일, 장소 하나 */
  function weekGrid() {
    var rid = currentWeekResource();
    var r = resources().filter(function (x) { return x.calendarId === rid; })[0];
    var grid = U.el('div.grid');
    grid.appendChild(row(U.el('div.row-label.row-label-head', null, [r.name, r.mode === 'APPROVAL' ? U.el('span.approval-mark', null, ['*']) : null]), timeHeader()));
    var start = T.weekStart(state.date);
    for (var i = 0; i < 7; i++) {
      var key = T.addDays(start, i);
      var label = U.el('div.row-label' + (key === T.today() ? '.is-today' : ''), null, [
        U.el('div.row-name', null, [T.fmtDate(key, RB.i18n.get())])
      ]);
      var evs = state.events.filter(function (e) { return e.calendarId === rid && T.dateKey(e.start) === key; });
      grid.appendChild(row(label, track(r, key, evs)));
    }
    return grid;
  }

  function row(label, track) { return U.el('div.row', null, [label, track]); }

  /**
   * 트랙 하나: 배경 슬롯 + 일정 블록.
   * 빈 곳 클릭 → 클릭한 x 좌표를 슬롯으로 환산해 예약 폼을 연다.
   */
  function track(resource, dateKey, evs) {
    var rg = range();
    var node = U.el('div.track', { style: { width: px(rg.to - rg.from) + 'px' } });
    var now = new Date();

    // 지난 시간 음영
    var nowMin = T.dateKey(now) === dateKey ? T.minutesOfDay(now) : (T.make(dateKey, 0) < now ? rg.to : rg.from);
    if (nowMin > rg.from) {
      node.appendChild(U.el('div.past-shade', { style: { width: px(Math.min(nowMin, rg.to) - rg.from) + 'px' } }));
    }
    // 시간 눈금선
    for (var m = rg.from + 60; m < rg.to; m += 60) {
      node.appendChild(U.el('div.hour-line', { style: { left: px(m - rg.from) + 'px' } }));
    }

    node.addEventListener('click', function (e) {
      if (e.target !== node && !e.target.classList.contains('past-shade') && !e.target.classList.contains('hour-line')) return;
      var rect = node.getBoundingClientRect();
      var minute = rg.from + Math.floor((e.clientX - rect.left) / RB.config.SLOT_PX) * slotMin();
      var start = T.make(dateKey, minute);
      if (start < now) { U.toast(t('form.err.past'), 'error'); return; }
      RB.bookingForm.open({ calendarId: resource.calendarId, date: dateKey, startMin: minute, endMin: Math.min(minute + 60, rg.to) });
    });

    evs.forEach(function (ev) { node.appendChild(block(ev, resource, dateKey, rg)); });
    // 선점 대기 요청은 빗금 테두리로 얹는다 (승인되면 기존 예약이 밀려남을 예고)
    state.pending.filter(function (q) { return q.calendarId === resource.calendarId && T.dateKey(q.start) === dateKey; })
      .forEach(function (q) { node.appendChild(block(Object.assign({}, q, { status: 'PENDING', isPreempt: true }), resource, dateKey, rg)); });
    return node;
  }

  function block(ev, resource, dateKey, rg) {
    var s = Math.max(T.minutesOfDay(ev.start), rg.from);
    var e = T.dateKey(ev.end) === dateKey ? Math.min(T.minutesOfDay(ev.end), rg.to) : rg.to;
    if (T.dateKey(ev.start) !== dateKey) s = rg.from;
    if (e <= s) return U.el('span');
    var cls = 'event' + (ev.isMine ? '.mine' : '') + (ev.status === 'PENDING' ? '.pending' : '') + (ev.isPreempt ? '.preempt' : '') + (ev.warning ? '.warning' : '') + (ev.end < new Date() ? '.past' : '');
    var node = U.el('div.' + cls.replace(/^event/, 'event'), {
      style: { left: px(s - rg.from) + 'px', width: (px(e - s) - 2) + 'px' },
      title: ev.title + ' · ' + (ev.organizerName || ev.requesterName || '') + (ev.warning ? ' ⚠' : ''),
      onclick: function (evt) { evt.stopPropagation(); popover(ev, resource); }
    }, [U.el('span.event-title', null, [(ev.warning ? '⚠ ' : '') + ev.title])]);
    node.className = cls.split('.').join(' ');
    return node;
  }

  /** 일정 상세 */
  function popover(ev, resource) {
    var lang = RB.i18n.get();
    var me = RB.app.state.user;
    var isPast = ev.end < new Date();
    var canCancel = !isPast && !ev.isPreempt && (ev.isMine || me.isSuperAdmin || me.approverOf.indexOf(resource.calendarId) !== -1);
    var canPreempt = !isPast && !ev.isMine && !ev.isPreempt && resource.mode === 'AUTO' && ev.status === 'CONFIRMED';

    var body = U.el('div', null, [
      U.el('div.kv', null, [U.el('b', null, [resource.name]), ' · ', T.fmtRange(ev.start, ev.end, lang)]),
      U.el('div.kv', null, [t('popover.organizer') + ': ', ev.organizerName || ev.requesterName || ev.organizerEmail || '']),
      ev.warning ? U.el('p.note', null, [t('board.directWarning')]) : null,
      U.el('div.kv', null, [
        U.el('span.badge.' + (ev.status === 'PENDING' ? 'badge-pending' : 'badge-ok'), null, [t(isPast ? 'popover.past' : 'popover.status.' + ev.status)]),
        ' ', U.gradeBadge(ev.grade, cfg().grades)
      ]),
      U.el('div.actions', null, [
        canPreempt ? U.el('button.btn', { type: 'button', onclick: function () {
          U.closeModal();
          RB.bookingForm.open({ calendarId: resource.calendarId, date: T.dateKey(ev.start), startMin: T.minutesOfDay(ev.start), endMin: T.minutesOfDay(ev.end) });
        } }, [t('btn.preempt')]) : null,
        canCancel ? U.el('button.btn.btn-danger', { type: 'button', onclick: function () {
          U.closeModal();
          U.confirm(t('confirm.cancel')).then(function (yes) {
            if (!yes) return;
            RB.api.call('cancel', { key: ev.eventId || ev.requestId, calendarId: resource.calendarId }).then(function () { U.toast(t('toast.cancelled'), 'ok'); rerender(); })
              .catch(function (err) { U.toast(t('result.error', { message: err.message }), 'error'); });
          });
        } }, [t('btn.cancelBooking')]) : null
      ])
    ]);
    U.modal(body, { title: ev.title });
  }

  function legend() {
    return U.el('div.legend', null, [
      U.el('span.legend-item', null, [U.el('i.swatch.swatch-confirmed'), t('legend.confirmed')]),
      U.el('span.legend-item', null, [U.el('i.swatch.swatch-pending'), t('legend.pending')]),
      U.el('span.legend-item', null, [U.el('i.swatch.swatch-mine'), t('legend.mine')]),
      resources().some(function (r) { return r.mode === 'APPROVAL'; }) ? U.el('span.legend-item', null, [t('legend.approval')]) : null,
      U.el('span.legend-hint', null, [t('legend.hint')])
    ]);
  }

  return { render: render, refresh: rerender, state: state, initialRange: initialRange, preload: preload };
})();
