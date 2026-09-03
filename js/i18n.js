/**
 * [i18n.js] — 문구 조회와 언어 전환.
 *
 * 무엇을 한다: RB.I18N[lang] 사전에서 키로 문구를 꺼내고 {변수}를 치환한다. data-i18n 속성이 붙은
 *              DOM 요소의 텍스트를 일괄 갱신한다. 선택 언어는 localStorage 에 기억한다.
 * 의존:        config.js, i18n/en.js
 * 호출됨:      모든 화면 모듈이 RB.i18n.t() 를 쓴다.
 * 주의:        키가 없으면 en 사전 → 키 문자열 순으로 대체하고 콘솔 경고. 화면이 깨지지는 않는다.
 * 정책 근거:   D-12 (영어만 사용. 구조는 다국어 가능하게 남겨 둠)
 */
window.RB = window.RB || {};

RB.i18n = (function () {
  var STORAGE_KEY = 'rb.lang';
  var current = 'en';

  /** 브라우저 언어 → 지원 언어. 기억된 선택이 있으면 그것을 우선한다. */
  function detect() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* 저장소 차단 환경 */ }
    if (saved && RB.config.LANGS.indexOf(saved) !== -1) return saved;
    var nav = (navigator.language || 'en').slice(0, 2);
    return RB.config.LANGS.indexOf(nav) !== -1 ? nav : RB.config.LANGS[0];
  }

  function set(lang) {
    if (RB.config.LANGS.indexOf(lang) === -1) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* 무시 */ }
    document.documentElement.lang = lang;
    applyDom();
  }

  function get() { return current; }

  /** 문구 조회. vars: {name: value} 로 {name} 치환. */
  function t(key, vars) {
    var dict = RB.I18N[current] || {};
    var text = dict[key];
    if (text === undefined) {
      text = (RB.I18N.en || {})[key];
      if (text === undefined) { console.warn('i18n missing:', key); text = key; }
    }
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        text = text.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return text;
  }

  /** data-i18n="key" 요소의 텍스트, data-i18n-ph="key" 요소의 placeholder 를 갱신 */
  function applyDom(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    var phs = scope.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < phs.length; j++) phs[j].setAttribute('placeholder', t(phs[j].getAttribute('data-i18n-ph')));
  }

  current = detect();
  document.documentElement.lang = current;

  return { t: t, set: set, get: get, applyDom: applyDom };
})();
