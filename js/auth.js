/**
 * [auth.js] — Google 로그인(GIS)과 토큰 보관.
 *
 * 무엇을 한다: Google Identity Services 버튼을 그리고, 받은 ID 토큰을 메모리에 보관한다.
 *              토큰 만료(exp)를 스스로 확인하고, 백엔드가 AUTH 오류를 주면 로그아웃 처리한다.
 *              mock 모드에서는 가짜 사용자 선택 UI 를 대신 보여준다.
 * 의존:        config.js, i18n.js, (실모드) https://accounts.google.com/gsi/client
 * 호출됨:      app.js 가 init() 을 부르고 onSignedIn 콜백을 받는다. api.js 가 token() 을 읽는다.
 * 주의:        토큰은 sessionStorage 에 보관한다(탭을 닫으면 사라짐). 새로고침해도 만료 전이면 다시 묻지 않는다.
 *              만료가 가까우면 ensureFresh() 가 GIS 에 조용히 새 토큰을 요청한다(같은 Google 세션이면 클릭 없이 끝남).
 * 정책 근거:   D-03
 */
window.RB = window.RB || {};

RB.auth = (function () {
  var STORAGE_KEY = 'rb.idt';
  var idToken = null;
  var profile = null;      // {email, name, picture} — 토큰 payload 에서 읽음. 서버가 최종 검증.
  var onSignedIn = null;
  var onSignedOut = null;
  var gisReady = false;
  var refreshWaiters = [];  // ensureFresh 가 새 토큰을 기다리는 콜백들

  /** JWT payload 디코딩 (검증은 하지 않는다 — 서버 몫) */
  function decode(jwt) {
    try {
      var payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(payload))));
    } catch (e) { return null; }
  }

  function token() { return idToken; }
  function user() { return profile; }

  /** 만료 60초 전부터는 만료로 본다 */
  function isExpired() {
    if (!idToken) return true;
    var p = decode(idToken);
    return !p || !p.exp || (p.exp * 1000 - 60000) < Date.now();
  }

  function handleCredential(response) {
    var wasSignedIn = !!idToken;
    idToken = response.credential;
    var p = decode(idToken) || {};
    profile = { email: p.email, name: p.name, picture: p.picture };
    try { sessionStorage.setItem(STORAGE_KEY, idToken); } catch (e) { /* 저장소 차단 */ }
    // 토큰 갱신 대기 중이던 호출들을 깨운다
    var waiters = refreshWaiters; refreshWaiters = [];
    waiters.forEach(function (w) { w.resolve(); });
    if (!wasSignedIn && onSignedIn) onSignedIn(profile);
  }

  function signOut() {
    idToken = null; profile = null;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    if (onSignedOut) onSignedOut();
  }

  /**
   * API 호출 전에 토큰이 살아 있는지 확인하고, 만료(임박)면 GIS 에 새 토큰을 요청한다.
   * 8초 안에 새 토큰이 오지 않으면 AUTH 오류 → 로그인 화면.
   */
  function ensureFresh() {
    if (idToken === 'mock' || !isExpired()) return Promise.resolve();
    if (!gisReady) return Promise.reject({ code: 'AUTH', message: RB.i18n.t('login.expired') });
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        refreshWaiters = refreshWaiters.filter(function (w) { w.resolve !== resolve; });
        onAuthError({ message: 'expired' });
        reject({ code: 'AUTH', message: RB.i18n.t('login.expired') });
      }, 8000);
      refreshWaiters.push({ resolve: function () { clearTimeout(timer); resolve(); } });
      try { google.accounts.id.prompt(); } catch (e) { clearTimeout(timer); reject({ code: 'AUTH', message: RB.i18n.t('login.expired') }); }
    });
  }

  /** 백엔드가 AUTH 오류를 돌려줬을 때 (만료·비허용 도메인) */
  function onAuthError(err) {
    signOut();
    RB.ui.toast(err && /domain|allowed/i.test(err.message) ? RB.i18n.t('login.denied') : RB.i18n.t('login.expired'), 'error');
  }

  /**
   * 로그인 UI 초기화.
   * @param {{signedIn:function, signedOut:function, buttonEl:Element}} opts
   */
  function init(opts) {
    onSignedIn = opts.signedIn;
    onSignedOut = opts.signedOut;

    if (RB.api.isMock()) { RB.mock.renderLogin(opts.buttonEl, mockSignIn); return; }

    // 클라이언트 ID 가 아직 없으면 GIS 를 띄우지 않는다(Google 400 오류 화면 대신 안내).
    if (!RB.config.CLIENT_ID) {
      opts.buttonEl.appendChild(RB.ui.el('p.note', null, [RB.i18n.t('login.notConfigured')]));
      return;
    }

    // 새로고침: 만료 전 토큰이 남아 있으면 GIS 를 기다리지 않고 바로 들어간다
    var saved = null;
    try { saved = sessionStorage.getItem(STORAGE_KEY); } catch (e) { saved = null; }
    if (saved) {
      idToken = saved;
      if (isExpired()) { idToken = null; try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ } }
      else {
        var p = decode(idToken) || {};
        profile = { email: p.email, name: p.name, picture: p.picture };
        if (onSignedIn) onSignedIn(profile);
      }
    }

    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = function () {
      google.accounts.id.initialize({
        client_id: RB.config.CLIENT_ID,
        callback: handleCredential,
        auto_select: true,
        itp_support: true,
        use_fedcm_for_prompt: true
      });
      gisReady = true;
      google.accounts.id.renderButton(opts.buttonEl, { theme: 'outline', size: 'large', width: 280 });
      if (!idToken) google.accounts.id.prompt(); // One Tap: 이미 로그인된 브라우저면 클릭 없이 진행
    };
    document.head.appendChild(script);
  }

  /** mock 모드 로그인: mock.js 가 고른 가짜 사용자를 그대로 받는다 */
  function mockSignIn(fakeProfile) {
    idToken = 'mock';
    profile = fakeProfile;
    if (onSignedIn) onSignedIn(profile);
  }

  return { init: init, token: token, user: user, isExpired: isExpired, signOut: signOut, onAuthError: onAuthError, ensureFresh: ensureFresh };
})();
