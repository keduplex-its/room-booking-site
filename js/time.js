/**
 * [time.js] — 타임존 고정 시간 계산.
 *
 * 무엇을 한다: 날짜 키('2026-09-10')와 분(hh*60+mm) 단위로 시간을 다루고, Date 객체와 상호 변환한다.
 *              모든 계산은 RB.config.TIMEZONE(Asia/Jakarta) 기준이다.
 * 의존:        config.js
 * 호출됨:      board.js, bookingForm.js, myBookings.js, approvals.js, mock.js
 * 주의:        Date 객체는 항상 절대 시각(UTC 기준)이고, "날짜 키 + 분" 은 Jakarta 벽시계다.
 *              둘을 섞어 쓰지 말 것. 변환은 반드시 여기 함수로만 한다.
 * 정책 근거:   D-09(30분 단위, 표시 시간대)
 */
window.RB = window.RB || {};

RB.time = (function () {
  var OFFSET_MS = RB.config.TZ_OFFSET_MIN * 60 * 1000;

  /** Date → Jakarta 벽시계 구성요소 {y, m(1-12), d, h, mi, dow(0=일)} */
  function parts(date) {
    var shifted = new Date(date.getTime() + OFFSET_MS);
    return {
      y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate(),
      h: shifted.getUTCHours(), mi: shifted.getUTCMinutes(), dow: shifted.getUTCDay()
    };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Date → '2026-09-10' (Jakarta 기준 날짜) */
  function dateKey(date) {
    var p = parts(date);
    return p.y + '-' + pad(p.m) + '-' + pad(p.d);
  }

  /** '2026-09-10' + 분(예: 14*60) → Date (Jakarta 벽시계를 절대 시각으로) */
  function make(key, minutes) {
    var s = key.split('-').map(Number);
    return new Date(Date.UTC(s[0], s[1] - 1, s[2], 0, minutes || 0) - OFFSET_MS);
  }

  /** Date → Jakarta 기준 하루 중 분 */
  function minutesOfDay(date) {
    var p = parts(date);
    return p.h * 60 + p.mi;
  }

  /** '07:00' → 420 */
  function parseHM(text) {
    var m = String(text || '').match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }

  /** 420 → '07:00' */
  function fmtHM(minutes) {
    return pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);
  }

  /** Date → '14:00' */
  function fmtTime(date) { return fmtHM(minutesOfDay(date)); }

  /** 날짜 키에 n일 더하기 */
  function addDays(key, n) {
    return dateKey(new Date(make(key, 12 * 60).getTime() + n * 86400000));
  }

  /** 오늘(Jakarta) 날짜 키 */
  function today() { return dateKey(new Date()); }

  /** 그 주의 월요일 날짜 키 */
  function weekStart(key) {
    var dow = parts(make(key, 12 * 60)).dow; // 0=일
    var back = dow === 0 ? 6 : dow - 1;
    return addDays(key, -back);
  }

  /** 요일 인덱스(0=일) */
  function dayOfWeek(key) { return parts(make(key, 12 * 60)).dow; }

  /**
   * 날짜 키 → 사람이 읽는 형태. 언어별 요일 표기.
   * ko: '9/10(수)', en: 'Wed 9/10'
   */
  function fmtDate(key, lang, withYear) {
    var s = key.split('-').map(Number);
    var dow = dayOfWeek(key);
    var names = lang === 'ko'
      ? ['일', '월', '화', '수', '목', '금', '토']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var md = s[1] + '/' + s[2];
    if (withYear) md = s[0] + '/' + md;
    return lang === 'ko' ? md + '(' + names[dow] + ')' : names[dow] + ' ' + md;
  }

  /** 일정 한 줄 요약: '9/10(수) 14:00–16:00' */
  function fmtRange(start, end, lang) {
    return fmtDate(dateKey(start), lang) + ' ' + fmtTime(start) + '–' + fmtTime(end);
  }

  /** 날짜+시각 한 줄: '9/4(금) 05:34' */
  function fmtDateTime(date, lang) {
    return fmtDate(dateKey(date), lang) + ' ' + fmtTime(date);
  }

  /** 두 구간이 겹치는가 (경계 접촉은 겹침 아님) */
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  return {
    parts: parts, dateKey: dateKey, make: make, minutesOfDay: minutesOfDay,
    parseHM: parseHM, fmtHM: fmtHM, fmtTime: fmtTime, addDays: addDays, today: today,
    weekStart: weekStart, dayOfWeek: dayOfWeek, fmtDate: fmtDate, fmtRange: fmtRange, fmtDateTime: fmtDateTime,
    overlaps: overlaps
  };
})();
