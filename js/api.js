/**
 * [api.js] — 백엔드 호출 래퍼.
 *
 * 무엇을 한다: {idToken, action, params} 를 Apps Script 웹앱에 POST 하고 {ok, data|error} 를 돌려준다.
 *              mock 모드면 네트워크 대신 RB.mock.handle() 로 보낸다.
 * 의존:        config.js, auth.js(토큰), mock.js(선택)
 * 호출됨:      board.js, bookingForm.js, myBookings.js, approvals.js, app.js
 * 주의:        Content-Type 을 text/plain 으로 보내야 CORS 프리플라이트 없이 Apps Script 에 닿는다.
 *              (application/json 은 프리플라이트가 붙고 Apps Script 가 이를 처리하지 못한다.)
 *              오류는 예외로 던진다: {code, message}. code 'AUTH' 면 호출부가 재로그인 처리.
 * 정책 근거:   D-02, D-03 · 계약은 docs/02-아키텍처.md 3절
 */
window.RB = window.RB || {};

RB.api = (function () {
  function isMock() {
    return RB.config.MOCK || /[?&]mock=1/.test(location.search);
  }

  /**
   * 액션 호출. 성공 시 data, 실패 시 {code, message} 예외.
   * @param {string} action  'me' | 'resources' | 'board' | 'book' | ...
   * @param {Object} params
   * @returns {Promise<*>}
   */
  function call(action, params) {
    RB.ui.progress(true);
    var p = isMock()
      ? RB.mock.handle(action, params || {})
      : RB.auth.ensureFresh().then(function () { return post(action, params); });
    return p.then(function (data) { RB.ui.progress(false); return data; },
      function (err) { RB.ui.progress(false); throw err; });
  }

  function post(action, params) {
    var body = JSON.stringify({
      idToken: RB.auth.token(),
      action: action,
      params: params || {}
    });

    return fetch(RB.config.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    })
      .then(function (res) { return res.json(); })
      .catch(function () { throw { code: 'NETWORK', message: RB.i18n.t('error.network') }; })
      .then(function (json) {
        if (!json || json.ok !== true) {
          var err = (json && json.error) || { code: 'UNKNOWN', message: '' };
          if (err.code === 'AUTH') RB.auth.onAuthError(err);
          throw err;
        }
        return json.data;
      });
  }

  return { call: call, isMock: isMock };
})();
