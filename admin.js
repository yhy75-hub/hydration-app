// ============================================================
// 管理者ダッシュボード
// ============================================================

// ===== 【要変更】設定 =====
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxeueMWOxm-wLt3G6T70Oc6zldEqTTBXBQeqyx5dewwB-2vnXZoJBRHsdT847Tr81hJ/exec'; // app.jsと同じURL
const ADMIN_PIN = '1423';
// ===== 【要変更】部署・メンバー設定（app.jsと同じ内容に保つ） =====
const DEPARTMENTS = [
  { name: '現場',   members: ['山本', '細江', '本城', '林', '四ツ木', '横塚'] },
  { name: 'テスト', members: ['テストA', 'テストB', 'テストC'] }
];
const MEMBERS = DEPARTMENTS.flatMap(d => d.members);

function getMemberDept(name) {
  const dept = DEPARTMENTS.find(d => d.members.includes(name));
  return dept ? dept.name : '';
}
const CONDITION_EMOJI = { 良好: '😊', 普通: '😐', だるい: '😓', 不調: '🤒', 未選択: '💧' };
// 体調の優先度（悪い順）
const COND_RANK = { 不調: 0, だるい: 1, 普通: 2, 良好: 3, 未選択: 4 };

// ===== 状態 =====
let currentWeekStart = getWeekStart(new Date());
let currentDay = toDateStr(new Date());
let allWeekRecords = [];
let holidayDates = [];
let weekWbgt = {};
let allDayRecords = [];
let selectedMember = 'all'; // 日次フィルター

// ===== PIN認証 =====
const Pin = {
  _entered: '',
  init() {
    if (sessionStorage.getItem('admin_auth') === '1') {
      document.getElementById('pin-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      Admin.init();
    }
  },
  input(num) {
    if (this._entered.length >= 4) return;
    this._entered += num;
    this._updateDots();
    if (this._entered.length === 4) setTimeout(() => this._check(), 100);
  },
  delete() {
    this._entered = this._entered.slice(0, -1);
    this._updateDots();
  },
  _updateDots() {
    document.querySelectorAll('.pin-dot').forEach((d, i) => d.classList.toggle('filled', i < this._entered.length));
  },
  _check() {
    if (this._entered === ADMIN_PIN) {
      sessionStorage.setItem('admin_auth', '1');
      document.getElementById('pin-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      Admin.init();
    } else {
      document.getElementById('pin-error').classList.remove('hidden');
      this._entered = '';
      this._updateDots();
      setTimeout(() => document.getElementById('pin-error').classList.add('hidden'), 2000);
    }
  }
};

// ===== メイン処理 =====
const Admin = {

  init() {
    document.getElementById('day-picker').value = currentDay;
    this.loadWeek();
    this.loadDay();
    if(localStorage.getItem('admin_notify_registered') === '1') {
      document.querySelector('.admin-notify-bar').style.display = 'none';
    }
  },

  switchTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.remove('hidden');
  },

  // ===== 週次 =====
  async loadWeek() {
    const endDate = new Date(currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const startStr = toDateStr(currentWeekStart);
    const endStr = toDateStr(endDate);

    document.getElementById('week-label').textContent =
      `${formatDate(currentWeekStart)} 〜 ${formatDate(endDate)}`;

    try {
      const [recRes, holRes, wbgtRes] = await Promise.all([
        gasGet({action:'getWeekRecords', startDate:startStr, endDate:endStr}),
        gasGet({action:'getHolidays', startDate:startStr, endDate:endStr}),
        gasGet({action:'getWbgtWeek', startDate:startStr, endDate:endStr})
      ]);
      allWeekRecords = recRes.records || [];
      holidayDates = holRes.holidays || [];
      weekWbgt = (wbgtRes.dates) || {};
      this.renderWeekTable(startStr, endStr);
      this.renderSummaryCards();
    } catch (e) {
      console.error(e);
    }
  },

  renderWeekTable(startStr, endStr) {
    const dates = getDatesInRange(startStr, endStr);
    const header = document.getElementById('week-header');
    const body = document.getElementById('week-body');

    // ヘッダー行
    header.innerHTML = `<th class="col-name">メンバー</th>` +
      dates.map(d => {
        const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(d + 'T00:00:00').getDay()];
        const dowClass = dow === '土' ? 'dow-sat' : dow === '日' ? 'dow-sun' : '';
        const w = weekWbgt[d];
        const wbgtHtml = w
          ? `<div class="wbgt-week-val" style="color:${wbgtHeaderColor_(w.level)}">${w.wbgt}℃</div>`
          : `<div class="wbgt-week-val wbgt-week-empty">-</div>`;
        return `<th><div class="date-header">${d.slice(5).replace('-', '/')}</div><div class="dow-header ${dowClass}">${dow}</div>${wbgtHtml}</th>`;
      }).join('');

    // データ行
    body.innerHTML = MEMBERS.map(member => {
      const cells = dates.map(d => {
        const dayRecs = allWeekRecords.filter(r => r.date === d && r.name === member);
        return this._buildCell(d, member, dayRecs);
      }).join('');
      return `<tr><td class="name-cell">${member}</td>${cells}</tr>`;
    }).join('');
  },

  _buildCell(date, name, recs) {
    const dow = new Date(date + 'T00:00:00').getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = holidayDates.includes(date);
    if (isWeekend || isHoliday) return `<td><span class="badge badge-off">休</span></td>`;
    if (recs.length === 0) return `<td><button class="cell-btn" onclick="Admin.showDetail('${date}','${name}')"><span class="badge badge-none">-</span></button></td>`;

    // 最悪の体調を表示
    const worst = recs.sort((a, b) => COND_RANK[a.condition] - COND_RANK[b.condition])[0];
    const condClass = { 不調: 'badge-danger', だるい: 'badge-warn', 普通: 'badge-ok', 良好: 'badge-ok', 未選択: 'badge-ok' }[worst.condition] || 'badge-ok';
    const emoji = CONDITION_EMOJI[worst.condition] || '💧';
    return `<td><button class="cell-btn" onclick="Admin.showDetail('${date}','${name}')"><span class="badge ${condClass}">${recs.length} ${emoji}</span></button></td>`;
  },

  renderSummaryCards() {
    const endDate = new Date(currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const dates = getDatesInRange(toDateStr(currentWeekStart), toDateStr(endDate))
      .filter(d => {
        const dow = new Date(d + 'T00:00:00').getDay();
        return dow !== 0 && dow !== 6 && !holidayDates.includes(d);
      });

    const cards = MEMBERS.map(member => {
      const recs = allWeekRecords.filter(r => r.name === member);
      const recorded = dates.filter(d => recs.some(r => r.date === d)).length;
      const worst = recs.length > 0
        ? recs.sort((a, b) => COND_RANK[a.condition] - COND_RANK[b.condition])[0].condition
        : null;
      const rate = dates.length > 0 ? recorded / dates.length : 1;
      const rateColor = rate >= 0.8 ? 'var(--ok)' : rate >= 0.5 ? 'var(--warn)' : 'var(--danger)';
      return `<div class="summary-card">
        <div class="s-name">${member}</div>
        <div class="s-count" style="color:${rateColor}">${recorded}<span style="font-size:.9rem;font-weight:400;color:var(--sub)">/${dates.length}日</span></div>
        <div class="s-label">記録日数</div>
        ${worst ? `<div class="s-cond">最低体調: ${CONDITION_EMOJI[worst]}${worst}</div>` : ''}
      </div>`;
    }).join('');
    document.getElementById('summary-cards').innerHTML = cards;
  },

  downloadWeekCsv() {
    const endDate = new Date(currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const dates = getDatesInRange(toDateStr(currentWeekStart), toDateStr(endDate));
    const header = ['メンバー', ...dates];
    const rows = MEMBERS.map(member => {
      const cols = dates.map(d => {
        const dow = new Date(d + 'T00:00:00').getDay();
        if (dow === 0 || dow === 6 || holidayDates.includes(d)) return '休';
        const cnt = allWeekRecords.filter(r => r.date === d && r.name === member).length;
        return cnt > 0 ? cnt : '-';
      });
      return [member, ...cols];
    });
    const label = toDateStr(currentWeekStart).slice(0,10) + '_' + toDateStr(endDate).slice(0,10);
    downloadCsv_(`水分補給記録_週次_${label}.csv`, [header, ...rows]);
  },

  downloadDayCsv() {
    if (!allDayRecords.length) { alert('記録がないよ'); return; }
    const header = ['時刻', '名前', '部署', '体調', 'コメント'];
    const rows = allDayRecords.map(r => [r.time || '', r.name, r.dept || getMemberDept(r.name), r.condition || '', r.comment || '']);
    downloadCsv_(`水分補給記録_日次_${currentDay}.csv`, [header, ...rows]);
  },

  prevWeek() { currentWeekStart.setDate(currentWeekStart.getDate() - 7); this.loadWeek(); },
  nextWeek() { currentWeekStart.setDate(currentWeekStart.getDate() + 7); this.loadWeek(); },
  goToThisWeek() { currentWeekStart = getWeekStart(new Date()); this.loadWeek(); },

  // ===== 日次 =====
  async loadDay() {
    currentDay = document.getElementById('day-picker').value || currentDay;
    this.renderMemberFilter();
    const [recRes] = await Promise.allSettled([
      gasGet({action:'getRecords', date:currentDay})
    ]);
    allDayRecords = recRes.status === 'fulfilled' ? (recRes.value.records || []) : [];
    this.applyDayFilter();
    this.loadDayWbgt();
  },

  async loadDayWbgt() {
    const el = document.getElementById('day-wbgt');
    if (!el) return;
    el.innerHTML = '<span style="color:var(--sub);font-size:.8rem">🌡 WBGT 読み込み中...</span>';
    try {
      const today = toDateStr(new Date());
      if (currentDay === today) {
        const res = await gasGet({action: 'getWbgt'});
        if (!res.error && res.wbgt != null) {
          el.innerHTML = `🌡 現在のWBGT: <span style="color:${res.color};font-size:1rem">${res.wbgt}℃（${res.level}）</span> <small style="color:var(--sub);font-weight:400;margin-left:6px">${res.forecastTime} 予測・三国</small>`;
        } else {
          el.innerHTML = '<span style="color:var(--sub);font-size:.8rem">🌡 WBGTデータなし</span>';
        }
      } else {
        const res = await gasGet({action: 'getWbgtMax', date: currentDay});
        if (res.max != null) {
          el.innerHTML = `🌡 最高WBGT: <span style="color:${res.color};font-size:1rem">${res.max}℃（${res.level}）</span> <small style="color:var(--sub);font-weight:400;margin-left:6px">三国</small>`;
        } else {
          el.innerHTML = '<span style="color:var(--sub);font-size:.8rem">🌡 WBGTデータなし（記録期間外）</span>';
        }
      }
    } catch(e) {
      el.innerHTML = '';
    }
  },

  renderMemberFilter() {
    const el = document.getElementById('member-filter');
    if (!el) return;
    el.innerHTML = ['all', ...MEMBERS].map(m => `
      <button class="filter-btn ${selectedMember===m?'active':''}"
        onclick="Admin.selectMember('${m}')">
        ${m==='all'?'全員':m}
      </button>`).join('');
  },

  selectMember(name) {
    selectedMember = name;
    this.renderMemberFilter();
    this.applyDayFilter();
  },

  applyDayFilter() {
    const filtered = selectedMember === 'all'
      ? allDayRecords
      : allDayRecords.filter(r => r.name === selectedMember);
    this.renderDayTable(filtered);
    this.renderDaySummary(filtered);
  },

  renderDayTable(records) {
    const body = document.getElementById('day-body');
    if(!records.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px">記録がないよ</td></tr>';
      return;
    }
    body.innerHTML = records.map(r => `
      <tr>
        <td>${r.time||''}</td>
        <td><strong>${r.name}</strong></td>
        <td><span class="dept-tag">${r.dept || getMemberDept(r.name)}</span></td>
        <td><div class="cond-cell">${CONDITION_EMOJI[r.condition]||'💧'} ${r.condition||''}</div></td>
        <td style="color:var(--sub)">${r.comment||'-'}</td>
      </tr>`).join('');
  },

  renderDaySummary(records) {
    const total = records.length;
    const members = [...new Set(records.map(r => r.name))].length;
    const targetCount = selectedMember === 'all' ? MEMBERS.length : 1;
    const unrecorded = targetCount - members;
    const bad = records.filter(r => r.condition==='不調'||r.condition==='だるい').length;
    document.getElementById('day-summary').innerHTML = `
      <div class="day-stat"><div class="ds-num">${total}</div><div class="ds-label">記録件数</div></div>
      <div class="day-stat"><div class="ds-num">${members}</div><div class="ds-label">記録メンバー</div></div>
      <div class="day-stat"><div class="ds-num" style="color:${unrecorded>0?'var(--danger)':'var(--ok)'}">${unrecorded}</div><div class="ds-label">未記録</div></div>
      <div class="day-stat"><div class="ds-num" style="color:${bad>0?'var(--warn)':'var(--ok)'}">${bad}</div><div class="ds-label">体調不良</div></div>`;
  },

  prevDay() {
    const d = new Date(currentDay + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    currentDay = toDateStr(d);
    document.getElementById('day-picker').value = currentDay;
    this.loadDay();
  },
  nextDay() {
    const d = new Date(currentDay + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    currentDay = toDateStr(d);
    document.getElementById('day-picker').value = currentDay;
    this.loadDay();
  },
  goToToday() {
    currentDay = toDateStr(new Date());
    document.getElementById('day-picker').value = currentDay;
    this.loadDay();
  },

  // ===== 管理者通知登録 =====
  async registerNotification() {
    const statusEl = document.getElementById('admin-notify-status');
    if (!('Notification' in window)) {
      statusEl.textContent = '❌ このブラウザは通知に対応していないよ';
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      statusEl.textContent = '❌ 通知が拒否されたよ。設定から許可してね';
      return;
    }
    try {
      firebase.initializeApp({
        apiKey: 'AIzaSyAX1QmJoIVN67GKMoXV1oIbNmV1bk-E2aM',
        authDomain: 'hydration-850bd.firebaseapp.com',
        projectId: 'hydration-850bd',
        storageBucket: 'hydration-850bd.firebasestorage.app',
        messagingSenderId: '385339912693',
        appId: '1:385339912693:web:4db23ab0e1e6f8c35630bc'
      });
    } catch(e) {}
    try {
      const reg = await navigator.serviceWorker.ready;
      const messaging = firebase.messaging();
      const token = await messaging.getToken({
        vapidKey: 'BF3hSqNizcMk5kYnP7-c-nneSnNIh8cCMQdCp-kV0UP6AmsbWSd7OB06YQ3yC23Ds86ykT-CNm94UIgEYCxMHEw',
        serviceWorkerRegistration: reg
      });
      await gasPost({ action: 'registerAdminToken', token });
      localStorage.setItem('admin_notify_registered', '1');
      document.querySelector('.admin-notify-bar').style.display = 'none';
    } catch(e) {
      statusEl.textContent = '❌ エラー: ' + e.message;
    }
  },

  // ===== 詳細モーダル =====
  showDetail(date, name) {
    const recs = allWeekRecords.filter(r => r.date === date && r.name === name);
    document.getElementById('modal-title').textContent = `${date}　${name}さんの記録（${recs.length}件）`;
    const body = document.getElementById('modal-body');
    if (!recs.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px">記録なし</td></tr>';
    } else {
      body.innerHTML = recs.map(r => `
        <tr>
          <td>${r.time || ''}</td>
          <td>${r.name}</td>
          <td><span class="dept-tag">${r.dept || getMemberDept(r.name)}</span></td>
          <td>${CONDITION_EMOJI[r.condition] || '💧'} ${r.condition || ''}</td>
          <td style="color:var(--sub)">${r.comment || '-'}</td>
        </tr>`).join('');
    }
    document.getElementById('modal').classList.remove('hidden');
  },
  closeModal(e) {
    if (!e || e.target === document.getElementById('modal')) {
      document.getElementById('modal').classList.add('hidden');
    }
  }
};

function downloadCsv_(filename, rows) {
  const bom = '﻿';
  const csv = bom + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  a.download = filename;
  a.click();
}

function wbgtHeaderColor_(level) {
  switch(level) {
    case 'ほぼ安全': return '#ffffff';
    case '注意':     return '#fde047';
    case '警戒':     return '#fb923c';
    case '厳重警戒': return '#fca5a5';
    case '危険':     return '#fca5a5';
    default:         return '#ffffff';
  }
}

// ===== ユーティリティ =====
async function gasGet(params) {
  const qs = new URLSearchParams({ ...params, _t: Date.now() }).toString();
  const res = await fetch(`${GAS_URL}?${qs}`, { cache: 'no-store' });
  return res.json();
}

async function gasPost(body) {
  const res = await fetch(GAS_URL, {method:'POST', body:JSON.stringify(body)});
  return res.json();
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getWeekStart(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // 月曜始まり
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getDatesInRange(startStr, endStr) {
  const dates = [];
  const cur = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (cur <= end) { dates.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}

// ===== 起動 =====
window.addEventListener('DOMContentLoaded', () => Pin.init());
