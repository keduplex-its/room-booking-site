/**
 * [app.js] — 진입점. 로그인 → 사용자·설정·장소 로드 → 탭 전환.
 *
 * 무엇을 한다: 전역 상태(RB.app.state)를 보관하고, 로그인 전후 화면을 바꾸고, 탭을 그린다.
 * 의존:        모든 모듈. index.html 맨 마지막에 로드된다.
 * 호출됨:      DOMContentLoaded
 * 주의:        상태는 여기 한 곳에만 둔다. 다른 모듈은 RB.app.state 를 읽기만 한다.
 */
window.RB = window.RB || {};

RB.app = (function () {
  var U = RB.ui, t = function (k, v) { return RB.i18n.t(k, v); };

  var state = { user: null, config: null, resources: [], tab: 'board' };
  var TABS = ['board', 'mine', 'approvals', 'settings'];

  var $ = function (id) { return document.getElementById(id); };

  function init() {
    RB.i18n.applyDom();

    if (RB.api.isMock()) $('mock-banner').hidden = false;

    RB.auth.init({ buttonEl: $('login-button'), signedIn: onSignedIn, signedOut: onSignedOut });
    $('signout').addEventListener('click', function () { RB.auth.signOut(); });

    TABS.forEach(function (tab) {
      $('tab-' + tab).addEventListener('click', function () { showTab(tab); });
    });
  }

  function onSignedIn(profile) {
    var range = RB.board.initialRange();
    RB.api.call('init', range).then(function (res) {
      state.user = res.me; state.config = res.me.config; state.resources = res.resources;
      if (res.board) RB.board.preload(range, res.board);
      $('login').hidden = true; $('app').hidden = false;
      $('user-name').textContent = state.user.name || state.user.email;
      $('tab-approvals').hidden = !(state.user.isSuperAdmin || (state.user.approverOf || []).length);
      $('tab-settings').hidden = !state.user.isSuperAdmin;
      updateBadge(state.user.pendingApprovals || 0);
      showTab('board');
      var m = location.search.match(/[?&]complete=(R-\d+)/i);
      if (m) RB.bookingForm.openComplete(m[1].toUpperCase());
    }).catch(function (err) {
      U.toast(err.message || t('error.network'), 'error');
      RB.auth.signOut();
    });
  }

  function onSignedOut() {
    state.user = null;
    $('app').hidden = true; $('login').hidden = false;
    if (RB.api.isMock()) RB.auth.init({ buttonEl: $('login-button'), signedIn: onSignedIn, signedOut: onSignedOut });
  }

  function showTab(tab) {
    state.tab = tab;
    TABS.forEach(function (k) {
      $('tab-' + k).classList.toggle('active', k === tab);
      $('view-' + k).hidden = k !== tab;
    });
    if (tab === 'board') RB.board.render($('view-board'));
    if (tab === 'mine') RB.myBookings.render($('view-mine'));
    if (tab === 'approvals') RB.approvals.render($('view-approvals'));
    if (tab === 'settings') RB.settings.render($('view-settings'));
  }

  /** 승인 탭의 대기 건수 배지. 승인 탭이 처리할 때마다 갱신한다. */
  function updateBadge(n) {
    var b = $('approvals-badge');
    b.hidden = !n;
    b.textContent = n ? t('approvals.badge', { n: n }) : '';
  }

  document.addEventListener('DOMContentLoaded', init);

  return { state: state, showTab: showTab, updateBadge: updateBadge };
})();
