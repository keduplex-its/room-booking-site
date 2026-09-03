/**
 * [settings.js] — 관리자 설정 탭 (슈퍼 관리자 전용).
 *
 * 무엇을 한다: 설정 시트 링크, 현재 정책값 요약, 장소 재가져오기 버튼, 설정 점검 실행, 관리자 알림 안내를 보여준다.
 *              값을 직접 편집하는 화면은 만들지 않는다 — 편집은 시트에서(D-13 ⑤).
 * 의존:        i18n.js, ui.js, api.js, app.js(state)
 * 호출됨:      app.js (isSuperAdmin 일 때만 탭 노출)
 * 주의:        importRooms / healthCheck 는 백엔드에서 수십 초 걸릴 수 있다. 버튼을 처리 중 비활성화한다.
 * 정책 근거:   D-13 ⑤, docs/03-운영-FAQ.md
 */
window.RB = window.RB || {};

RB.settings = (function () {
  var U = RB.ui, t = function (k, v) { return RB.i18n.t(k, v); };

  function render(host) {
    U.clear(host);
    var user = RB.app.state.user, cfg = RB.app.state.config;

    var importBtn = U.el('button.btn', { type: 'button', onclick: function () { run(importBtn, 'importRooms', importResult); } }, [t('settings.import')]);
    var importOut = U.el('p.muted');
    function importResult(data) {
      importOut.textContent = t('settings.import.done', { added: data.added, total: data.total });
      RB.api.call('resources').then(function (list) { RB.app.state.resources = list; });
    }

    var healthBtn = U.el('button.btn', { type: 'button', onclick: function () { run(healthBtn, 'healthCheck', healthResult); } }, [t('settings.health')]);
    var healthOut = U.el('div');
    function healthResult(data) {
      U.clear(healthOut);
      var bad = data.checks.filter(function (c) { return !c.ok; }).length;
      healthOut.appendChild(U.el('p.' + (bad ? 'error' : 'muted'), null, [bad ? t('settings.health.issues', { n: bad }) : t('settings.health.ok')]));
      healthOut.appendChild(U.el('ul.check-list', null, data.checks.map(function (c) {
        return U.el('li.' + (c.ok ? 'ok' : 'bad'), null, [(c.ok ? '✓ ' : '✗ ') + c.label + (c.detail ? ' — ' + c.detail : '')]);
      })));
    }

    host.appendChild(U.el('div.settings', null, [
      U.el('div.card', null, [
        U.el('h3', null, [t('settings.title')]),
        U.el('p', null, [t('settings.intro')]),
        U.el('a.btn.btn-primary', { href: user.sheetUrl || '#', target: '_blank', rel: 'noopener' }, [t('settings.openSheet')])
      ]),
      U.el('div.card', null, [
        U.el('h3', null, [t('settings.rooms')]),
        U.el('p.muted', null, [t('settings.rooms.hint')]),
        U.el('div.actions', { style: { justifyContent: 'flex-start' } }, [importBtn]), importOut,
        U.el('table.kv-table', null, RB.app.state.resources.map(function (r) {
          return U.el('tr', null, [
            U.el('td', null, [r.name + (r.aliases && r.aliases.length ? ' · ' + r.aliases.join(', ') : '')]),
            U.el('td', null, [t('mode.' + r.mode) + (r.capacity ? ' · ' + r.capacity : '') + (r.approvers ? ' · ' + r.approvers.join(', ') : '')])
          ]);
        }))
      ]),
      U.el('div.card', null, [
        U.el('h3', null, [t('settings.policy')]),
        U.el('table.kv-table', null, [
          kv('settings.policy.businessHours', cfg.businessHours),
          kv('settings.policy.escalation', cfg.escalationHours),
          kv('settings.policy.expiry', cfg.expiryHours),
          kv('settings.policy.minLead', cfg.minLeadHours),
          kv('settings.policy.protect', cfg.protectHours),
          kv('settings.policy.slot', cfg.slotMinutes),
          kv('settings.policy.display', cfg.displayHours),
          kv('settings.policy.advance', cfg.maxAdvanceDays),
          kv('settings.policy.domains', (cfg.domains || []).join(', ')),
          kv('settings.policy.superAdmins', (cfg.superAdmins || []).join(', ')),
          kv('settings.policy.grades', (cfg.grades || []).map(function (g) { return t('grade.' + g.code); }).join(' > '))
        ]),
        U.el('div.actions', { style: { justifyContent: 'flex-start' } }, [healthBtn]), healthOut
      ]),
      U.el('div.card', null, [
        U.el('h3', null, [t('settings.notify')]),
        U.el('p', null, [t('settings.notify.text')])
      ])
    ]));
  }

  function kv(key, value) {
    return U.el('tr', null, [U.el('td', null, [t(key)]), U.el('td', null, [value === undefined || value === null ? '' : String(value)])]);
  }

  /** 버튼을 잠그고 액션을 실행한 뒤 결과 콜백 */
  function run(btn, action, onDone) {
    btn.disabled = true;
    RB.api.call(action).then(onDone)
      .catch(function (err) { U.toast(t('result.error', { message: err.message || err.code }), 'error'); })
      .then(function () { btn.disabled = false; });
  }

  return { render: render };
})();
