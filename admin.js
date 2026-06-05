// ============================================================
// 管理者ダッシュボード
// ============================================================

// ===== 【要変更】設定 =====
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxeueMWOxm-wLt3G6T70Oc6zldEqTTBXBQeqyx5dewwB-2vnXZoJBRHsdT847Tr81hJ/exec'; // app.jsと同じURL
const ADMIN_PIN = '0000';              // ← 管理者用PINに変更
const MEMBERS = ['田中', '佐藤', '鈴木', '山田', '伊藤', '渡辺'];
const CONDITION_EMOJI = { 良好: '😊', 普通: '😐', だるい: '😓', 不調: '🤒', 未選択: '💧' };
// 体調の優先度（悪い順）
const COND_RANK = { 不調: 0, だるい: 1, 普通: 2, 良好: 3, 未選択: 4 };

// ===== 状態 =====
let currentWeekStart = getWeekStart(new Date());
let currentDay = toDateStr(new Date());
let allWeekRecords = [];
let holidayDates = []; // 休日マスター＋手動設定の休日リスト

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
      const [recRes, holRes] = await Promise.all([
        gasGet({action:'getWeekRecords', startDate:startStr, endDate:endStr}),
        gasGet({action:'getHolidays', startDate:startStr, endDate:endStr})
      ]);
      allWeekRecords = recRes.records || [];
      holidayDates = holRes.holidays || [];
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
        return `<th><div class="date-header">${d.slice(5).replace('-', '/')}</div><div class="dow-header ${dowClass}">${dow}</div></th>`;
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
      return `<div class="summary-card">
        <div class="s-name">${member}</div>
        <div class="s-count">${recorded}<span style="font-size:.9rem;font-weight:400;color:var(--sub)">/${dates.length}日</span></div>
        <div class="s-label">記録日数</div>
        ${worst ? `<div class="s-cond">最低体調: ${CONDITION_EMOJI[worst]}${worst}</div>` : ''}
      </div>`;
    }).join('');
    document.getElementById('summary-cards').innerHTML = cards;
  },

  prevWeek() { currentWeekStart.setDate(currentWeekStart.getDate() - 7); this.loadWeek(); },
  nextWeek() { currentWeekStart.setDate(currentWeekStart.getDate() + 7); this.loadWeek(); },
  goToThisWeek() { currentWeekStart = getWeekStart(new Date()); this.loadWeek(); },

  // ===== 日次 =====
  async loadDay() {
    currentDay = document.getElementById('day-picker').value || currentDay;
    try {
      const res = await gasGet({ action: 'getRecords', date: currentDay });
      const records = res.records || [];
      this.renderDayTable(records);
      this.renderDaySummary(records);
    } catch (e) { console.error(e); }
  },

  renderDayTable(records) {
    const body = document.getElementById('day-body');
    if (!records.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px">記録がないよ</td></tr>';
      return;
    }
    body.innerHTML = records.map(r => `
      <tr>
        <td>${r.time || ''}</td>
        <td><strong>${r.name}</strong></td>
        <td><div class="cond-cell">${CONDITION_EMOJI[r.condition] || '💧'} ${r.condition || ''}</div></td>
        <td style="color:var(--sub)">${r.comment || '-'}</td>
      </tr>`).join('');
  },

  renderDaySummary(records) {
    const total = records.length;
    const members = [...new Set(records.map(r => r.name))].length;
    const unrecorded = MEMBERS.length - members;
    const bad = records.filter(r => r.condition === '不調' || r.condition === 'だるい').length;
    document.getElementById('day-summary').innerHTML = `
      <div class="day-stat"><div class="ds-num">${total}</div><div class="ds-label">総記録件数</div></div>
      <div class="day-stat"><div class="ds-num">${members}</div><div class="ds-label">記録したメンバー</div></div>
      <div class="day-stat"><div class="ds-num" style="color:${unrecorded > 0 ? 'var(--danger)' : 'var(--ok)'}">${unrecorded}</div><div class="ds-label">未記録メンバー</div></div>
      <div class="day-stat"><div class="ds-num" style="color:${bad > 0 ? 'var(--warn)' : 'var(--ok)'}">${bad}</div><div class="ds-label">体調不良・だるい</div></div>`;
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

// ===== ユーティリティ =====
async function gasGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GAS_URL}?${qs}`);
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
