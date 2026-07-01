// ===== 【要変更】設定 =====
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw9AbSNrKe6Uox6yWZd883UTT3NiybtiqkcgHbtBve0ksD3QvELgilX12jxkZQH2Oq4/exec';
const ADMIN_PIN = '1423';
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD2rPXVNfX-Rr4ggmjds9pLm2aWk8A52zg',
  authDomain: 'hydration-v2.firebaseapp.com',
  projectId: 'hydration-v2',
  storageBucket: 'hydration-v2.firebasestorage.app',
  messagingSenderId: '347969374865',
  appId: '1:347969374865:web:b7e47a8ecd0a2de1d8cd30'
};
const VAPID_KEY = 'BF3hSqNizcMk5kYnP7-c-nneSnNIh8cCMQdCp-kV0UP6AmsbWSd7OB06YQ3yC23Ds86ykT-CNm94UIgEYCxMHEw';

// ===== 【要変更】部署・メンバー設定 =====
const DEPARTMENTS = [
  { name: '管理者',       members: ['伊藤', '有側'] },
  { name: '品質保証チーム', members: ['堀江', '吉村', '南', '東木谷'] },
  { name: '技術チーム',   members: ['山本', '細江', '本城', '林', '四ツ木', '横塚'] },
  { name: '生産管理チーム', members: ['平林', '森﨑'] },
  { name: '岩本班',       members: ['岩本A', '岩本B', '岩本C'] }
];
const MEMBERS = DEPARTMENTS.flatMap(d => d.members);

function getMemberDept(name) {
  return DEPARTMENTS.find(d => d.members.includes(name))?.name || '';
}

const CONDITION_EMOJI = { 良好: '😊', 普通: '😐', だるい: '😓', 不調: '🤒', 未選択: '💧' };
const COND_RANK = { 不調: 0, だるい: 1, 普通: 2, 良好: 3, 未選択: 4 };

// ===== Firebase 初期化 =====
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();
const recordsCol = db.collection('records');

// ===== 状態 =====
let currentWeekStart = getWeekStart(new Date());
let currentDay = toDateStr(new Date());
let allWeekRecords = [];
let holidayDates = [];
let weekWbgt = {};
let allDayRecords = [];
let selectedMember = 'all';
let selectedDept = DEPARTMENTS[0].name;

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
    this.renderDeptFilter();
    this.loadWeek();
    this.loadDay();
    if (localStorage.getItem('admin_notify_registered') === '1') {
      document.querySelector('.admin-notify-bar').style.display = 'none';
    }
  },

  renderDeptFilter() {
    const el = document.getElementById('admin-dept-filter');
    if (!el) return;
    el.innerHTML = DEPARTMENTS.map(d => `
      <button class="dept-filter-btn ${selectedDept === d.name ? 'active' : ''}"
        onclick="Admin.selectDept('${d.name}')">${d.name}</button>
    `).join('');
  },

  selectDept(name) {
    selectedDept = name;
    selectedMember = 'all';
    this.renderDeptFilter();
    this.renderWeekTable(toDateStr(currentWeekStart), toDateStr(new Date(currentWeekStart.getTime() + 6 * 86400000)));
    this.renderSummaryCards();
    this.applyDayFilter();
    this.renderMemberFilter();
    if (!document.getElementById('tab-trend').classList.contains('hidden')) this.renderTrendChart();
  },

  switchTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'trend') this.renderTrendChart();
    if (tab === 'holidays') this.loadHolidays();
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
      // Firestore から週次記録取得
      const snap = await recordsCol
        .where('date', '>=', startStr)
        .where('date', '<=', endStr)
        .get();
      allWeekRecords = snap.docs.map(d => d.data()).sort((a, b) => a.date.localeCompare(b.date));

      // 休日・WBGT は GAS から取得（変更なし）
      const [holRes, wbgtRes] = await Promise.all([
        gasGet({ action: 'getHolidays', startDate: startStr, endDate: endStr }),
        gasGet({ action: 'getWbgtWeek', startDate: startStr, endDate: endStr })
      ]);
      holidayDates = holRes.holidays || [];
      weekWbgt = wbgtRes.dates || {};

      this.renderWeekTable(startStr, endStr);
      this.renderSummaryCards();
      if (!document.getElementById('tab-trend').classList.contains('hidden')) this.renderTrendChart();
    } catch (e) {
      console.error(e);
    }
  },

  renderWeekTable(startStr, endStr) {
    const dates = getDatesInRange(startStr, endStr);
    const header = document.getElementById('week-header');
    const body = document.getElementById('week-body');

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

    const deptMembers = (DEPARTMENTS.find(d => d.name === selectedDept) || DEPARTMENTS[0]).members;
    body.innerHTML = deptMembers.map(member => {
      const cells = dates.map(d => {
        const dayRecs = allWeekRecords.filter(r => r.date === d && r.name === member);
        return this._buildCell(d, member, dayRecs);
      }).join('');
      return `<tr><td class="name-cell">${member}</td>${cells}</tr>`;
    }).join('');
  },

  _buildCell(date, name, recs) {
    const dow = new Date(date + 'T00:00:00').getDay();
    if (dow === 0 || dow === 6 || holidayDates.includes(date))
      return `<td><span class="badge badge-off">休</span></td>`;
    if (!recs.length)
      return `<td><button class="cell-btn" onclick="Admin.showDetail('${date}','${name}')"><span class="badge badge-none">-</span></button></td>`;
    const worst = recs.sort((a, b) => COND_RANK[a.condition] - COND_RANK[b.condition])[0];
    const condClass = { 不調: 'badge-danger', だるい: 'badge-warn', 普通: 'badge-ok', 良好: 'badge-ok', 未選択: 'badge-ok' }[worst.condition] || 'badge-ok';
    return `<td><button class="cell-btn" onclick="Admin.showDetail('${date}','${name}')"><span class="badge ${condClass}">${recs.length} ${CONDITION_EMOJI[worst.condition]||'💧'}</span></button></td>`;
  },

  renderSummaryCards() {
    const endDate = new Date(currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const dates = getDatesInRange(toDateStr(currentWeekStart), toDateStr(endDate))
      .filter(d => { const dow = new Date(d + 'T00:00:00').getDay(); return dow !== 0 && dow !== 6 && !holidayDates.includes(d); });
    const deptMembers = (DEPARTMENTS.find(d => d.name === selectedDept) || DEPARTMENTS[0]).members;
    document.getElementById('summary-cards').innerHTML = deptMembers.map(member => {
      const recs = allWeekRecords.filter(r => r.name === member);
      const recorded = dates.filter(d => recs.some(r => r.date === d)).length;
      const worst = recs.length > 0 ? recs.sort((a, b) => COND_RANK[a.condition] - COND_RANK[b.condition])[0].condition : null;
      const rate = dates.length > 0 ? recorded / dates.length : 1;
      const rateColor = rate >= 0.8 ? 'var(--ok)' : rate >= 0.5 ? 'var(--warn)' : 'var(--danger)';
      return `<div class="summary-card">
        <div class="s-name">${member}</div>
        <div class="s-count" style="color:${rateColor}">${recorded}<span style="font-size:.9rem;font-weight:400;color:var(--sub)">/${dates.length}日</span></div>
        <div class="s-label">記録日数</div>
        ${worst ? `<div class="s-cond">最低体調: ${CONDITION_EMOJI[worst]}${worst}</div>` : ''}
      </div>`;
    }).join('');
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
        return allWeekRecords.filter(r => r.date === d && r.name === member).length || '-';
      });
      return [member, ...cols];
    });
    downloadCsv_(`水分補給記録_週次_${toDateStr(currentWeekStart)}_${toDateStr(new Date(currentWeekStart.getTime()+6*86400000))}.csv`, [header, ...rows]);
  },

  prevWeek() { currentWeekStart.setDate(currentWeekStart.getDate() - 7); this.loadWeek(); },
  nextWeek() { currentWeekStart.setDate(currentWeekStart.getDate() + 7); this.loadWeek(); },
  goToThisWeek() { currentWeekStart = getWeekStart(new Date()); this.loadWeek(); },

  // ===== 日次 =====
  async loadDay() {
    currentDay = document.getElementById('day-picker').value || currentDay;
    this.renderMemberFilter();

    const snap = await recordsCol
      .where('date', '==', currentDay)
      .get();
    allDayRecords = snap.docs.map(d => d.data()).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    this.applyDayFilter();
    this.loadDayWbgt();
  },

  async loadDayWbgt() {
    const el = document.getElementById('day-wbgt');
    if (!el) return;
    el.innerHTML = '<span style="color:var(--sub);font-size:.8rem">🌡 WBGT 読み込み中...</span>';
    try {
      const today = toDateStr(new Date());
      const res = currentDay === today
        ? await gasGet({ action: 'getWbgt' })
        : await gasGet({ action: 'getWbgtMax', date: currentDay });
      if (res.wbgt != null || res.max != null) {
        const val = res.wbgt ?? res.max;
        const label = currentDay === today ? '現在のWBGT' : '最高WBGT';
        el.innerHTML = `🌡 ${label}: <span style="color:${res.color};font-size:1rem">${val}℃（${res.level}）</span>`;
      } else {
        el.innerHTML = '<span style="color:var(--sub);font-size:.8rem">🌡 WBGTデータなし</span>';
      }
    } catch (e) { el.innerHTML = ''; }
  },

  renderMemberFilter() {
    const el = document.getElementById('member-filter');
    if (!el) return;
    const deptMembers = (DEPARTMENTS.find(d => d.name === selectedDept) || DEPARTMENTS[0]).members;
    el.innerHTML = ['all', ...deptMembers].map(m => `
      <button class="filter-btn ${selectedMember === m ? 'active' : ''}" onclick="Admin.selectMember('${m}')">
        ${m === 'all' ? '全員' : m}
      </button>`).join('');
  },

  selectMember(name) {
    selectedMember = name;
    this.renderMemberFilter();
    this.applyDayFilter();
  },

  applyDayFilter() {
    const deptMembers = (DEPARTMENTS.find(d => d.name === selectedDept) || DEPARTMENTS[0]).members;
    let filtered = allDayRecords.filter(r => deptMembers.includes(r.name) || getMemberDept(r.name) === selectedDept);
    if (selectedMember !== 'all') filtered = filtered.filter(r => r.name === selectedMember);
    this.renderDayTable(filtered);
    this.renderDaySummary(filtered, deptMembers);
  },

  renderDayTable(records) {
    const body = document.getElementById('day-body');
    if (!records.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px">記録がないよ</td></tr>';
      return;
    }
    body.innerHTML = records.map(r => `
      <tr>
        <td>${r.time || ''}</td>
        <td><strong>${r.name}</strong></td>
        <td><span class="dept-tag">${r.dept || getMemberDept(r.name)}</span></td>
        <td><div class="cond-cell">${CONDITION_EMOJI[r.condition] || '💧'} ${r.condition || ''}</div></td>
        <td style="color:var(--sub)">${r.comment || '-'}</td>
      </tr>`).join('');
  },

  renderDaySummary(records, deptMembers) {
    const total = records.length;
    const members = [...new Set(records.map(r => r.name))].length;
    const targetCount = selectedMember === 'all' ? deptMembers.length : 1;
    const unrecorded = targetCount - members;
    const bad = records.filter(r => r.condition === '不調' || r.condition === 'だるい').length;
    document.getElementById('day-summary').innerHTML = `
      <div class="day-stat"><div class="ds-num">${total}</div><div class="ds-label">記録件数</div></div>
      <div class="day-stat"><div class="ds-num">${members}</div><div class="ds-label">記録メンバー</div></div>
      <div class="day-stat"><div class="ds-num" style="color:${unrecorded > 0 ? 'var(--danger)' : 'var(--ok)'}">${unrecorded}</div><div class="ds-label">未記録</div></div>
      <div class="day-stat"><div class="ds-num" style="color:${bad > 0 ? 'var(--warn)' : 'var(--ok)'}">${bad}</div><div class="ds-label">体調不良</div></div>`;
  },

  downloadDayCsv() {
    if (!allDayRecords.length) { alert('記録がないよ'); return; }
    const header = ['時刻', '名前', '部署', '体調', 'コメント'];
    const rows = allDayRecords.map(r => [r.time || '', r.name, r.dept || getMemberDept(r.name), r.condition || '', r.comment || '']);
    downloadCsv_(`水分補給記録_日次_${currentDay}.csv`, [header, ...rows]);
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

  // ===== トレンドグラフ =====
  renderTrendChart() {
    const endDate = new Date(currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const dates = getDatesInRange(toDateStr(currentWeekStart), toDateStr(endDate));
    const deptMembers = (DEPARTMENTS.find(d => d.name === selectedDept) || DEPARTMENTS[0]).members;

    document.getElementById('trend-week-label').textContent =
      `${formatDate(currentWeekStart)} 〜 ${formatDate(endDate)}`;

    const COLORS = { '良好': '#22c55e', '普通': '#60a5fa', 'だるい': '#fb923c', '不調': '#ef4444' };
    const CONDITIONS = ['不調', 'だるい', '普通', '良好'];
    const DOW = ['日', '月', '火', '水', '木', '金', '土'];

    const dayData = dates.map(d => {
      const recs = allWeekRecords.filter(r => r.date === d && deptMembers.includes(r.name));
      const dow = new Date(d + 'T00:00:00').getDay();
      const isOff = dow === 0 || dow === 6 || holidayDates.includes(d);
      const counts = { '良好': 0, '普通': 0, 'だるい': 0, '不調': 0 };
      recs.forEach(r => { if (counts[r.condition] !== undefined) counts[r.condition]++; });
      return { d, dow, isOff, counts, total: recs.length };
    });

    const W = 700, H = 280;
    const PAD = { top: 24, right: 20, bottom: 56, left: 36 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;
    const maxCount = Math.max(...dayData.map(d => d.total), 4);
    const gap = chartW / dates.length;
    const barW = gap * 0.6;

    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (chartH / 4) * i;
      const val = Math.round(maxCount * (4 - i) / 4);
      grid += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#1e293b" stroke-width="1"/>`;
      grid += `<text x="${PAD.left - 5}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${val}</text>`;
    }

    let bars = '';
    dayData.forEach((day, i) => {
      const cx = PAD.left + i * gap + gap / 2;
      const bx = cx - barW / 2;
      const dowColor = day.dow === 0 ? '#f87171' : day.dow === 6 ? '#60a5fa' : '#94a3b8';

      if (day.isOff) {
        bars += `<rect x="${bx}" y="${PAD.top}" width="${barW}" height="${chartH}" fill="#1e293b" rx="3" opacity="0.5"/>`;
        bars += `<text x="${cx}" y="${PAD.top + chartH / 2 + 4}" text-anchor="middle" font-size="10" fill="#475569">休</text>`;
      } else {
        let yOff = PAD.top + chartH;
        CONDITIONS.forEach(cond => {
          const cnt = day.counts[cond];
          if (!cnt) return;
          const h = (cnt / maxCount) * chartH;
          yOff -= h;
          bars += `<rect x="${bx}" y="${yOff}" width="${barW}" height="${h}" fill="${COLORS[cond]}" rx="2"/>`;
          if (h > 16) bars += `<text x="${cx}" y="${yOff + h / 2 + 4}" text-anchor="middle" font-size="10" fill="white" font-weight="bold">${cnt}</text>`;
        });
        if (day.total === 0) {
          bars += `<rect x="${bx}" y="${PAD.top + chartH - 3}" width="${barW}" height="3" fill="#334155" rx="1"/>`;
        }
      }

      bars += `<text x="${cx}" y="${H - 30}" text-anchor="middle" font-size="10" fill="#64748b">${day.d.slice(5).replace('-', '/')}</text>`;
      bars += `<text x="${cx}" y="${H - 14}" text-anchor="middle" font-size="12" fill="${dowColor}" font-weight="bold">${DOW[day.dow]}</text>`;
    });

    document.getElementById('trend-chart').innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">
        ${grid}${bars}
      </svg>`;

    document.getElementById('trend-legend').innerHTML =
      [...CONDITIONS].reverse().map(c =>
        `<span class="trend-leg-item"><span style="background:${COLORS[c]}" class="trend-leg-dot"></span>${c}</span>`
      ).join('');

    const workDays = dayData.filter(d => !d.isOff);
    const totalRecs = dayData.reduce((s, d) => s + d.total, 0);
    const badRecs = dayData.reduce((s, d) => s + d.counts['不調'] + d.counts['だるい'], 0);
    const recordedDays = workDays.filter(d => d.total > 0).length;
    document.getElementById('trend-summary').innerHTML = `
      <div class="day-stat"><div class="ds-num">${totalRecs}</div><div class="ds-label">週間記録件数</div></div>
      <div class="day-stat"><div class="ds-num">${recordedDays}<span style="font-size:.85rem;color:var(--sub)">/${workDays.length}日</span></div><div class="ds-label">記録のあった日</div></div>
      <div class="day-stat"><div class="ds-num" style="color:${badRecs > 0 ? 'var(--warn)' : 'var(--ok)'}">${badRecs}</div><div class="ds-label">体調不良件数</div></div>`;
  },

  // ===== 管理者通知登録 =====
  async registerNotification() {
    const statusEl = document.getElementById('admin-notify-status');
    if (!('Notification' in window)) { statusEl.textContent = '❌ このブラウザは通知に対応していないよ'; return; }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { statusEl.textContent = '❌ 通知が拒否されたよ'; return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const messaging = firebase.messaging();
      const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      await db.collection('adminTokens').doc('main').set({ token, updatedAt: new Date().toISOString() });
      localStorage.setItem('admin_notify_registered', '1');
      document.querySelector('.admin-notify-bar').style.display = 'none';
    } catch (e) {
      statusEl.textContent = '❌ エラー: ' + e.message;
    }
  },

  // ===== 詳細モーダル =====
  showDetail(date, name) {
    const recs = allWeekRecords.filter(r => r.date === date && r.name === name);
    document.getElementById('modal-title').textContent = `${date}　${name}さんの記録（${recs.length}件）`;
    const body = document.getElementById('modal-body');
    body.innerHTML = recs.length
      ? recs.map(r => `
          <tr>
            <td>${r.time || ''}</td>
            <td>${r.name}</td>
            <td><span class="dept-tag">${r.dept || getMemberDept(r.name)}</span></td>
            <td>${CONDITION_EMOJI[r.condition] || '💧'} ${r.condition || ''}</td>
            <td style="color:var(--sub)">${r.comment || '-'}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:16px">記録なし</td></tr>';
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
  const qs = new URLSearchParams({ ...params, _t: Date.now() }).toString();
  const res = await fetch(`${GAS_URL}?${qs}`, { cache: 'no-store' });
  return res.json();
}

function downloadCsv_(filename, rows) {
  const bom = '﻿';
  const csv = bom + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

function wbgtHeaderColor_(level) {
  return { 'ほぼ安全': '#bbf7d0', '注意': '#fef08a', '警戒': '#fed7aa', '厳重警戒': '#fecaca', '危険': '#fecaca' }[level] || '#ffffff';
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getWeekStart(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
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

// ===== 休日管理 =====
const holidaysCol = db.collection('holidays');

const HolidayAdmin = {
  async load() {
    const el = document.getElementById('holiday-list');
    try {
      const snap = await holidaysCol.orderBy('date', 'asc').get();
      if (snap.empty) { el.innerHTML = '<div class="holiday-empty">登録された休日はないよ</div>'; return; }
      el.innerHTML = snap.docs.map(doc => {
        const d = doc.data();
        return `<div class="holiday-row-item">
          <span class="holiday-date">${d.date}</span>
          <span class="holiday-type-badge">${d.type || ''}</span>
          <span class="holiday-memo">${d.memo || ''}</span>
          <button class="btn-holiday-del" onclick="HolidayAdmin.delete('${doc.id}')">削除</button>
        </div>`;
      }).join('');
    } catch (e) {
      el.innerHTML = '<div class="holiday-empty">読み込みエラー</div>';
      console.error(e);
    }
  },

  async add() {
    const date = document.getElementById('holiday-input-date').value;
    const type = document.getElementById('holiday-input-type').value;
    const memo = document.getElementById('holiday-input-memo').value.trim();
    if (!date) { alert('日付を選んでね'); return; }
    await holidaysCol.doc(date).set({ date, type, memo });
    document.getElementById('holiday-input-date').value = '';
    document.getElementById('holiday-input-memo').value = '';
    this.load();
  },

  async delete(id) {
    if (!confirm(`${id} を削除してもいい？`)) return;
    await holidaysCol.doc(id).delete();
    this.load();
  }
};

// Admin に委譲
Object.assign(Admin, {
  loadHolidays() { HolidayAdmin.load(); },
  addHoliday()   { HolidayAdmin.add(); }
});

window.addEventListener('DOMContentLoaded', () => Pin.init());
