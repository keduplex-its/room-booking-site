/**
 * [bookingForm.js] — 예약 폼과 결과 처리.
 *
 * 무엇을 한다: 예약 입력 모달을 열고, 제출 결과(확정/충돌/대기/오류)에 따라 다음 화면을 보여준다.
 *              충돌이면 기존 예약·대체안을 보여주고 선점 요청(사유 필수) 또는 가능 회차만 예약을 제안한다.
 * 의존:        time.js, i18n.js, ui.js, api.js, app.js(state), board.js(refresh)
 * 호출됨:      board.js(빈 칸 클릭, 선점 버튼), 상단 "예약하기" 버튼
 * 주의:        시간 선택지는 표시 범위를 슬롯 단위로 잘라 만든다. 종일 예약은 시작 07:00 종료 21:00 로 표현한다.
 * 정책 근거:   D-07(선점 사유 필수), D-09(제한값), D-10(입력 항목)
 */
window.RB = window.RB || {};

RB.bookingForm = (function () {
  var U = RB.ui, T = RB.time, t = function (k, v) { return RB.i18n.t(k, v); };

  function cfg() { return RB.app.state.config; }
  function resources() { return RB.app.state.resources.filter(function (r) { return r.reservable !== false; }); }

  /** 표시 범위를 슬롯으로 나눈 시각 옵션 [{value:분, label:'07:00'}] (endInclusive 면 마지막 경계 포함) */
  function timeOptions(endInclusive) {
    var hm = (cfg().displayHours || '07:00-21:00').split('-');
    var from = T.parseHM(hm[0]), to = T.parseHM(hm[1]), step = cfg().slotMinutes || 30;
    var list = [];
    for (var m = from; endInclusive ? m <= to : m < to; m += step) list.push({ value: m, label: T.fmtHM(m) });
    return list;
  }

  function select(name, options, selected, onchange) {
    var sel = U.el('select.select', { name: name, onchange: onchange || null });
    options.forEach(function (o) {
      sel.appendChild(U.el('option', { value: o.value, selected: String(o.value) === String(selected) }, [o.label]));
    });
    return sel;
  }

  function field(labelKey, control, hint) {
    return U.el('label.field', null, [U.el('span.field-label', null, [t(labelKey), hint ? U.el('small.muted', null, [' ' + hint]) : null]), control]);
  }

  /**
   * 폼 열기.
   * @param {{calendarId?:string, date?:string, startMin?:number, endMin?:number}} preset
   */
  function open(preset) {
    preset = preset || {};
    var list = resources();
    if (!list.length) return;
    var maxDate = T.addDays(T.today(), cfg().maxAdvanceDays || 180);
    var initial = {
      calendarId: preset.calendarId || list[0].calendarId,
      date: preset.date || T.today(),
      startMin: preset.startMin !== undefined ? preset.startMin : timeOptions()[0].value,
      endMin: preset.endMin !== undefined ? preset.endMin : timeOptions()[0].value + 60
    };

    var resSel = select('calendarId', list.map(function (r) { return { value: r.calendarId, label: r.name + (r.aliases && r.aliases.length ? ' · ' + r.aliases[0] : '') }; }), initial.calendarId, updateModeNote);
    var dateIn = U.el('input.input', { type: 'date', name: 'date', value: initial.date, min: T.today(), max: maxDate, required: true });
    var startSel = select('start', timeOptions(false), initial.startMin, function () {
      // 시작을 바꾸면 종료를 시작+1h 로 따라가게 해 "종료가 시작보다 앞" 실수를 줄인다
      var s = Number(startSel.value); if (Number(endSel.value) <= s) endSel.value = String(Math.min(s + 60, timeOptions(true).slice(-1)[0].value));
    });
    var endSel = select('end', timeOptions(true).slice(1), initial.endMin);
    var titleIn = U.el('input.input', { type: 'text', name: 'title', required: true, maxLength: 80, placeholder: t('form.summary.ph') });
    var gradeSel = select('grade', cfg().grades.map(function (g) { return { value: g.code, label: g.label || t('grade.' + g.code) }; }), cfg().grades[cfg().grades.length - 1].code);
    var headIn = U.el('input.input', { type: 'number', name: 'headcount', min: 1, max: 999, placeholder: '' });
    var noteIn = U.el('textarea.input', { name: 'note', rows: 2, placeholder: t('form.note.ph') });
    var recSel = select('recFreq', [
      { value: 'none', label: t('rec.none') }, { value: 'weekly', label: t('rec.weekly') },
      { value: 'biweekly', label: t('rec.biweekly') }, { value: 'daily', label: t('rec.daily') }
    ], 'none', function () { recExtra.hidden = recSel.value === 'none'; });
    var untilIn = U.el('input.input', { type: 'date', name: 'until', min: T.today(), max: maxDate });
    var countIn = U.el('input.input', { type: 'number', name: 'count', min: 2, max: 52, placeholder: '' });
    var recExtra = U.el('div.grid-2', null, [field('form.recurrence.until', untilIn), field('form.recurrence.count', countIn)]);
    recExtra.hidden = true;

    var modeNote = U.el('p.note');
    function updateModeNote() {
      var r = list.filter(function (x) { return x.calendarId === resSel.value; })[0];
      modeNote.textContent = r && r.mode === 'APPROVAL' ? t('form.approvalNote') : '';
      modeNote.hidden = !modeNote.textContent;
    }
    updateModeNote();

    var errBox = U.el('p.error'); errBox.hidden = true;
    var submitBtn = U.el('button.btn.btn-primary', { type: 'submit' }, [t('btn.submit')]);

    var form = U.el('form.form', {
      onsubmit: function (e) {
        e.preventDefault();
        var params = read();
        var problem = validate(params);
        if (problem) { errBox.textContent = problem; errBox.hidden = false; return; }
        errBox.hidden = true; var done = U.busy(submitBtn);
        RB.api.call('book', params).then(function (result) { handleResult(result, params); })
          .catch(function (err) { U.toast(t('result.error', { message: err.message || err.code }), 'error'); })
          .then(done);
      }
    }, [
      field('form.resource', resSel), modeNote,
      U.el('div.grid-3', null, [field('form.date', dateIn), field('form.start', startSel), field('form.end', endSel)]),
      field('form.summary', titleIn),
      U.el('details.optional', null, [
        U.el('summary', null, [t('form.optional')]),
        U.el('div.grid-2', null, [field('form.grade', gradeSel), field('form.headcount', headIn)]),
        field('form.note', noteIn),
        field('form.recurrence', recSel), recExtra
      ]),
      errBox,
      U.el('div.actions', null, [U.el('button.btn', { type: 'button', onclick: U.closeModal }, [t('btn.cancel')]), submitBtn])
    ]);

    function read() {
      var key = dateIn.value;
      var rec = recSel.value === 'none' ? null : { freq: recSel.value, until: untilIn.value || null, count: countIn.value ? Number(countIn.value) : null };
      return {
        calendarId: resSel.value,
        start: T.make(key, Number(startSel.value)).toISOString(),
        end: T.make(key, Number(endSel.value)).toISOString(),
        title: titleIn.value.trim(), grade: gradeSel.value,
        headcount: headIn.value ? Number(headIn.value) : null, note: noteIn.value.trim() || null,
        recurrence: rec
      };
    }
    function validate(p) {
      if (!p.calendarId || !dateIn.value || !p.title) return t('form.err.required');
      if (Number(endSel.value) <= Number(startSel.value)) return t('form.err.order');
      if (new Date(p.start) < new Date()) return t('form.err.past');
      return null;
    }

    U.modal(form, { title: t('form.title') });
    setTimeout(function () { titleIn.focus(); }, 50);
  }

  /** 제출 결과 분기 */
  function handleResult(result, params) {
    if (result.kind === 'CONFIRMED') {
      U.closeModal();
      U.toast(result.skipped ? t('result.confirmedPartial', { ok: result.occurrences, skipped: result.skipped }) : t('result.confirmed'), 'ok');
      RB.board.refresh();
    } else if (result.kind === 'PENDING') {
      U.closeModal();
      U.toast(t('result.pending'), 'ok');
      RB.board.refresh();
    } else if (result.kind === 'CONFLICT') {
      showConflict(result, params);
    } else {
      U.toast(t('result.error', { message: result.message || '' }), 'error');
    }
  }

  /** 충돌 화면: 기존 예약, 대체안, 선점 요청 / 가능 회차만 */
  function showConflict(result, params) {
    var lang = RB.i18n.get();
    var r = resources().filter(function (x) { return x.calendarId === params.calendarId; })[0];
    var recurring = result.occurrences > 1;

    var conflictList = U.el('ul.list', null, result.conflicts.map(function (c) {
      return U.el('li', null, [T.fmtRange(new Date(c.start), new Date(c.end), lang), ' · ', c.title, ' · ', c.organizerName || '']);
    }));

    var altList = U.el('div.alts', null, (result.alternatives || []).map(function (a) {
      return U.el('button.btn.btn-alt', { type: 'button', onclick: function () {
        U.closeModal();
        open({ calendarId: a.calendarId, date: T.dateKey(new Date(a.start)), startMin: T.minutesOfDay(new Date(a.start)), endMin: T.minutesOfDay(new Date(a.end)) });
      } }, [a.resourceName + ' · ' + T.fmtRange(new Date(a.start), new Date(a.end), lang)]);
    }));

    var reasonIn = U.el('textarea.input', { rows: 3, placeholder: t('conflict.reason.ph') });
    var preemptSection = result.preemptAllowed
      ? U.el('div.section', null, [
        field('conflict.reason', reasonIn),
        U.el('button.btn.btn-warn', { type: 'button', onclick: function (e) {
          if (!reasonIn.value.trim()) { reasonIn.focus(); return; }
          var done = U.busy(e.currentTarget);
          RB.api.call('preempt', { intentKey: result.intentKey, reason: reasonIn.value.trim() })
            .then(function () { U.closeModal(); U.toast(t('result.preemptSent'), 'ok'); RB.board.refresh(); })
            .catch(function (err) { done(); U.toast(t('result.error', { message: err.message || err.code }), 'error'); });
        } }, [t('btn.preempt')])
      ])
      : (r && r.mode === 'AUTO' ? U.el('p.note', null, [t('conflict.protected')]) : null);

    var body = U.el('div', null, [
      U.el('p.lead', null, [recurring ? t('result.conflictRecurring', { total: result.occurrences, conflicts: result.conflicts.length }) : t('result.conflict')]),
      U.el('h3', null, [t('conflict.existing')]), conflictList,
      (result.alternatives || []).length ? U.el('h3', null, [t('conflict.alternatives')]) : null, altList,
      preemptSection,
      U.el('div.actions', null, [
        U.el('button.btn', { type: 'button', onclick: U.closeModal }, [t('btn.close')]),
        recurring ? U.el('button.btn.btn-primary', { type: 'button', onclick: function (e) {
          var done = U.busy(e.currentTarget);
          RB.api.call('bookFreeOnly', { intentKey: result.intentKey }).then(function (res) { handleResult(res, params); })
            .catch(function (err) { U.toast(t('result.error', { message: err.message || err.code }), 'error'); })
            .then(done);
        } }, [t('btn.freeOnly')]) : null
      ])
    ]);
    U.modal(body, { title: r ? r.name : '', wide: true });
  }

  /**
   * 캘린더 경로(D-18): 이메일 링크 ?complete=R-xxx 로 들어온 DRAFT 요청에 사유를 넣어 제출한다.
   */
  function openComplete(requestId) {
    RB.api.call('draft', { requestId: requestId }).then(function (q) {
      if (!q || q.status !== 'DRAFT') { U.toast(t('complete.notFound'), 'error'); return; }
      var lang = RB.i18n.get();
      var reasonIn = U.el('textarea.input', { rows: 3, placeholder: t('conflict.reason.ph') });
      var btn = U.el('button.btn.btn-warn', { type: 'button', onclick: function () {
        if (!reasonIn.value.trim()) { reasonIn.focus(); return; }
        var done = U.busy(btn);
        RB.api.call('completePreempt', { requestId: requestId, reason: reasonIn.value.trim() })
          .then(function (res) { U.closeModal(); U.toast(res.message || t('result.preemptSent'), 'ok'); RB.board.refresh(); })
          .catch(function (err) { done(); U.toast(t('result.error', { message: err.message || err.code }), 'error'); });
      } }, [t('complete.submit')]);
      var body = U.el('div', null, [
        U.el('p.lead', null, [q.resourceName + ' · ' + T.fmtRange(new Date(q.start), new Date(q.end), lang)]),
        U.el('div.card-title', null, [q.title]),
        U.el('p.muted', null, [t('complete.intro')]),
        (q.conflicts || []).length ? U.el('h3', null, [t('conflict.existing')]) : null,
        U.el('ul.list', null, (q.conflicts || []).map(function (c) {
          return U.el('li', null, [T.fmtRange(new Date(c.start), new Date(c.end), lang), ' · ', c.title, ' · ', c.organizerName || '']);
        })),
        field('conflict.reason', reasonIn),
        U.el('div.actions', null, [U.el('button.btn', { type: 'button', onclick: U.closeModal }, [t('btn.close')]), btn])
      ]);
      U.modal(body, { title: t('complete.title'), wide: true });
    }).catch(function (err) { U.toast(err.message || t('complete.notFound'), 'error'); });
  }

  return { open: open, openComplete: openComplete };
})();
