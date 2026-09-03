/**
 * [auth.js] — Google 로그인(GIS)과 토큰 보관.
 *
 * 무엇을 한다: Google Identity Services 버튼을 그리고, 받은 ID 토큰을 메모리에 보관한다.
 *              토큰 만료(exp)를 스스로 확인하고, 백엔드가 AUTH 오류를 주면 로그아웃 처리한다.
 *              mock 모드에서는 가짜 사용자 선택 UI 를 대신 보여준다.
 * 의존:        config.js, i18n.js, (실모드) https://accounts.google.com/gsi/client
 * 호출됨:      app.js 가 init() 을 부르고 onSignedIn 콜백을 받는다. api.js 가 token() 을 읽는다.
 * 주의:        토큰은 localStorage 에 저장하지 않는다(1시간짜리라 이득이 적고 유출 위험만 있다).
 *              페이지를 새로고침하면 다시 로그인한다. GIS 가 자동 로그인(One Tap)을 시도하므로 대개 클릭 없이 끝난다.
 * 정책 근거:   D-03
 */
window.RB = window.RB || {};

RB.auth = (function () {
  var idToken = null;
  var profile = null;      // {email, name, picture} — 토큰 payload 에서 읽음. 서버가 최종 검증.
  var onSignedIn = null;
  var onSignedOut = null;

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
    idToken = response.credential;
    var p = decode(idToken) || {};
    profile = { email: p.email, name: p.name, picture: p.picture };
    if (onSignedIn) onSignedIn(profile);
  }

  function signOut() {
    idToken = null; profile = null;
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    if (onSignedOut) onSignedOut();
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

    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = function () {
      google.accounts.id.initialize({
        client_id: RB.config.CLIENT_ID,
        callback: handleCredential,
        auto_select: true,
        itp_support: true
      });
      google.accounts.id.renderButton(opts.buttonEl, { theme: 'outline', size: 'large', width: 280 });
      google.accounts.id.prompt(); // One Tap: 이미 로그인된 브라우저면 클릭 없이 진행
    };
    document.head.appendChild(script);
  }

  /** mock 모드 로그인: mock.js 가 고른 가짜 사용자를 그대로 받는다 */
  function mockSignIn(fakeProfile) {
    idToken = 'mock';
    profile = fakeProfile;
    if (onSignedIn) onSignedIn(profile);
  }

  return { init: init, token: token, user: user, isExpired: isExpired, signOut: signOut, onAuthError: onAuthError };
})();
