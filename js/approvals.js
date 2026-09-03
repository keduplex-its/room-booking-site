/**
 * [approvals.js] — 승인 탭 (장소 담당자·슈퍼 관리자 전용).
 *
 * 무엇을 한다: 내가 처리할 수 있는 대기 요청을 카드로 보여주고 한 클릭 승인, 사유 입력 후 반려한다.
 *              선점 요청은 밀려날 기존 예약과 사유를 함께 보여준다. 상위 등급은 배지로 강조한다(D-07).
 * 의존:        time.js, i18n.js, ui.js, api.js
 * 호출됨:      app.js (권한이 있을 때만 탭 노출)
 * 주의:        승인 버튼은 두 번 눌리지 않게 처리 중 비활성화한다.
 * 정책 근거:   D-07, D-08, D-13 ④
 */
window.RB = window.RB || {};

RB.approvals = (function () {
  var U = RB.ui, T = RB.time, t = function (k, v) { return RB.i18n.t(k, v); };

  function render(host) {
    U.clear(host);
    host.appendChild(U.el('p.muted', null, [t('loading')]));
    RB.api.call('approvals').then(function (list) {
      U.clear(host);
      RB.app.updateBadge(list.length);
      if (!list.length) { host.appendChild(U.el('p.muted', null, [t('approvals.empty')])); return; }
      host.appendChild(U.el('div.cards', null, list.map(card)));
    }).catch(function (err) { U.clear(host); host.appendChild(U.el('p.error', null, [err.message || t('error.network')])); });
  }

  function card(entry) {
    var q = entry.request, r = entry.resource;
    var lang = RB.i18n.get();
    var grades = RB.app.state.config.grades;
    var approveBtn = U.el('button.btn.btn-primary', { type: 'button', onclick: function () { decide('approve', q, {}, approveBtn); } }, [t('btn.approve')]);
    var rejectBtn = U.el('button.btn.btn-danger', { type: 'button', onclick: function () { rejectDialog(q); } }, [t('btn.reject')]);

    return U.el('div.card' + (q.escalated || q.status === 'ESCALATED' ? '.card-escalated' : ''), null, [
      U.el('div.card-head', null, [
        U.el('span', null, [U.el('b', null, [r.name]), ' · ', U.el('span.badge.badge-type', null, [t('approvals.type.' + q.type)])]),
        U.gradeBadge(q.grade, grades)
      ]),
      U.el('div.card-title', null, [q.title]),
      U.el('div.muted', null, [T.fmtRange(new Date(q.start), new Date(q.end), lang), q.headcount ? ' · ' + q.headcount + ' people' : '']),
      U.el('div.kv', null, [t('approvals.requester') + ': ', q.requesterName || q.requesterEmail, ' (', q.requesterEmail, ')']),
      q.reason ? U.el('div.kv', null, [t('approvals.reason') + ': ', q.reason]) : null,
      q.note ? U.el('div.kv.muted', null, [q.note]) : null,
      q.conflicts && q.conflicts.length ? U.el('div.kv', null, [
        U.el('b', null, [t('approvals.bumps') + ': ']),
        U.el('ul.list', null, q.conflicts.map(function (c) {
          return U.el('li', null, [T.fmtRange(new Date(c.start), new Date(c.end), lang), ' · ', c.title, ' · ', c.organizerName || '']);
        }))
      ]) : null,
      U.el('div.muted.small', null, [
        (q.escalated || q.status === 'ESCALATED') ? '⚠ ' + t('approvals.escalated') + ' · ' : '',
        t('approvals.expires') + ': ' + T.fmtDateTime(new Date(q.expiresAt), lang),
        ' · ', q.requestId
      ]),
      U.el('div.actions', null, [rejectBtn, approveBtn])
    ]);
  }

  function rejectDialog(q) {
    var noteIn = U.el('textarea.input', { rows: 3, placeholder: t('reject.note.ph') });
    var btn = U.el('button.btn.btn-danger', { type: 'button', onclick: function () { decide('reject', q, { note: noteIn.value.trim() }, btn); } }, [t('btn.reject')]);
    U.modal(U.el('div', null, [
      U.el('label.field', null, [U.el('span.field-label', null, [t('reject.note')]), noteIn]),
      U.el('div.actions', null, [U.el('button.btn', { type: 'button', onclick: U.closeModal }, [t('btn.close')]), btn])
    ]), { title: q.title });
  }

  function decide(action, q, extra, btn) {
    var done = U.busy(btn);
    RB.api.call(action, Object.assign({ requestId: q.requestId }, extra))
      .then(function () { U.closeModal(); U.toast(t(action === 'approve' ? 'toast.approved' : 'toast.rejected'), 'ok'); render(document.getElementById('view-approvals')); })
      .catch(function (err) { done(); U.toast(t('result.error', { message: err.message || err.code }), 'error'); });
  }

  return { render: render };
})();
