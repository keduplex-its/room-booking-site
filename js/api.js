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
  var recent = [];   // 최근 호출 기록 [{action, total, server, steps, at}] — Settings 탭 성능표
  function log(action, t0, meta, err) {
    recent.unshift({ action: action, total: Date.now() - t0, server: meta ? meta.ms : null, steps: meta ? meta.steps : null, error: err ? (err.code || 'ERR') : '', at: new Date() });
    if (recent.length > 25) recent.pop();
  }

  function call(action, params) {
    var t0 = Date.now();
    RB.ui.progress(true);
    var p = isMock()
      ? RB.mock.handle(action, params || {}).then(function (d) { return { data: d, meta: null }; })
      : RB.auth.ensureFresh().then(function () { return post(action, params); });
    return p.then(function (r) { RB.ui.progress(false); log(action, t0, r.meta); return r.data; },
      function (err) { RB.ui.progress(false); log(action, t0, null, err); throw err; });
  }

  function post(action, params) {
    // 세션 토큰이 있으면 그걸로, 없으면(session 교환 직전) Google ID 토큰으로 인증한다
    var body = JSON.stringify({
      sessionToken: RB.auth.sessionToken(),
      idToken: RB.auth.sessionToken() ? undefined : RB.auth.token(),
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
        return { data: json.data, meta: json.meta || null };
      });
  }

  return { call: call, isMock: isMock, recent: function () { return recent.slice(); } };
})();
