// ===== 【要変更】設定 =====
const CONFIG = {
  FIREBASE: {
    apiKey: 'AIzaSyD2rPXVNfX-Rr4ggmjds9pLm2aWk8A52zg',
    authDomain: 'hydration-v2.firebaseapp.com',
    projectId: 'hydration-v2',
    storageBucket: 'hydration-v2.firebasestorage.app',
    messagingSenderId: '347969374865',
    appId: '1:347969374865:web:b7e47a8ecd0a2de1d8cd30'
  },
  VAPID_KEY: 'BFiPfkbTaBTlvegpsP38QgTm0gs66NDRXWMFWjTMA2neWFuG8Z4kwc8Pp-_29cABp7xbF9fIGYwulK7OJyJzl-k',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw9AbSNrKe6Uox6yWZd883UTT3NiybtiqkcgHbtBve0ksD3QvELgilX12jxkZQH2Oq4/exec'
};
const PIN_CODE = '4277';

// ===== 【要変更】部署・メンバー設定 =====
const DEPARTMENTS = [
  { name: '管理者',       members: ['伊藤', '有側'] },
  { name: '品質保証チーム', members: ['堀江', '吉村', '南', '東木谷'] },
  { name: '技術チーム',   members: ['山本', '細江', '本城', '林', '四ツ木', '横塚'] },
  { name: '生産管理チーム', members: ['平林', '森﨑'] },
  { name: '岩本班',       members: ['岩本A', '岩本B', '岩本C'] }
];

function getMemberDept(name) {
  return DEPARTMENTS.find(d => d.members.includes(name))?.name || '';
}

// ===== Firebase 初期化 =====
firebase.initializeApp(CONFIG.FIREBASE);
const db = firebase.firestore();
const recordsCol = db.collection('records');
const tokensCol  = db.collection('tokens');

// ===== PIN認証 =====
const Pin = {
  _entered: '',
  init() {
    if (localStorage.getItem('pin_auth') === '1') {
      document.getElementById('pin-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      return;
    }
    document.getElementById('pin-screen').classList.remove('hidden');
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
    if (this._entered === PIN_CODE) {
      localStorage.setItem('pin_auth', '1');
      document.getElementById('pin-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
    } else {
      document.getElementById('pin-error').classList.remove('hidden');
      this._entered = '';
      this._updateDots();
      setTimeout(() => document.getElementById('pin-error').classList.add('hidden'), 2000);
    }
  }
};

// ===== アプリ状態 =====
let state = {
  member: localStorage.getItem('member') || '',
  dept:   localStorage.getItem('dept')   || DEPARTMENTS[0].name,
  condition: '',
  salt: 'なし'
};

// ===== 起動 =====
window.addEventListener('DOMContentLoaded', () => {
  Pin.init();
  renderHeader();
  renderDeptSelector();
  renderMemberGrid();
  loadTodayRecords();
  loadWbgt();
  loadHolidayState();
  App.requestNotification();

  document.getElementById('history-date').value = toDateStr(new Date());
  document.getElementById('history-date').addEventListener('change', e => loadHistoryRecords(e.target.value));

  setInterval(() => renderHeader(), 60 * 1000);
  setInterval(() => loadTodayRecords(), 5 * 60 * 1000);
});

// ===== ヘッダー =====
function renderHeader() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  document.getElementById('header-date').textContent =
    `${now.getMonth() + 1}/${now.getDate()}(${days[now.getDay()]}) ${h}:${m}`;
}

// ===== 部署セレクター =====
function renderDeptSelector() {
  const wrap = document.getElementById('dept-selector');
  if (!wrap) return;
  if (DEPARTMENTS.length <= 1) { wrap.style.display = 'none'; return; }
  wrap.innerHTML = `<select class="dept-select" onchange="App.selectDept(this.value)">
    ${DEPARTMENTS.map(d => `<option value="${d.name}" ${state.dept === d.name ? 'selected' : ''}>${d.name}</option>`).join('')}
  </select>`;
}

// ===== メンバーグリッド =====
function renderMemberGrid() {
  const grid = document.getElementById('member-select');
  const dept = DEPARTMENTS.find(d => d.name === state.dept) || DEPARTMENTS[0];
  grid.innerHTML = dept.members.map(name => `
    <button class="member-btn ${state.member === name ? 'active' : ''}"
      onclick="App.selectMember('${name}', this)">${name}</button>
  `).join('');
}

// ===== 記録取得（今日） =====
async function loadTodayRecords() {
  const today = toDateStr(new Date());
  try {
    const snap = await recordsCol
      .where('date', '==', today)
      .get();
    const records = snap.docs.map(d => d.data()).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const deptRecords = records.filter(r =>
      (r.dept || getMemberDept(r.name)) === state.dept
    );
    renderRecords('today-records', deptRecords);
    document.getElementById('last-updated').textContent =
      '更新: ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    console.error(e);
  }
}

// ===== 記録取得（履歴） =====
async function loadHistoryRecords(date) {
  const snap = await recordsCol
    .where('date', '==', date)
    .where('name', '==', state.member)
    .get();
  renderRecords('history-records', snap.docs.map(d => d.data()).sort((a, b) => (a.time || '').localeCompare(b.time || '')));
}

// ===== 記録レンダリング =====
const CONDITION_EMOJI = { 良好: '😊', 普通: '😐', だるい: '😓', 不調: '🤒', 未選択: '💧' };

function renderRecords(elId, records) {
  const el = document.getElementById(elId);
  if (!records.length) {
    el.innerHTML = '<div class="empty-msg">まだ記録がないよ</div>';
    return;
  }
  el.innerHTML = records.map(r => `
    <div class="record-item">
      <span class="record-time">${r.time || ''}</span>
      <span class="record-condition">${CONDITION_EMOJI[r.condition] || '💧'}</span>
      <div class="record-info">
        <div class="record-name">${r.name}${r.salt === 'あり' ? ' 🧂' : ''}</div>
        ${r.comment ? `<div class="record-comment">${r.comment}</div>` : ''}
      </div>
    </div>`).join('');
}

// ===== WBGT =====
const WBGT_COLORS = { '危険': '#ef4444', '厳重警戒': '#f97316', '警戒': '#f59e0b', '注意': '#84cc16', '安全': '#22c55e' };
async function loadWbgt() {
  try {
    const res = await fetch(`${CONFIG.GAS_URL}?action=getWbgt&_t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.wbgt != null) {
      const color = WBGT_COLORS[data.level] || '#64748b';
      document.getElementById('wbgt-card-body').innerHTML = `
        <div class="wbgt-card-val" style="color:${color}">${data.wbgt}℃</div>
        <div>
          <div class="wbgt-card-level" style="color:${color}">${data.level}</div>
          <div class="wbgt-card-sub">熱中症指数（三国観測）</div>
        </div>`;
    }
  } catch (e) { /* silent */ }
}

// ===== 休日状態 =====
async function loadHolidayState() {
  if (!state.member) return;
  const today = toDateStr(new Date());
  try {
    const doc = await db.collection('personalLeave').doc(`${today}_${state.member}`).get();
    const toggle = document.getElementById('holiday-toggle');
    toggle.checked = doc.exists;
  } catch (e) { /* silent */ }
}

// ===== メインアプリ =====
const App = {

  selectDept(name) {
    state.dept = name;
    state.member = '';
    localStorage.setItem('dept', name);
    localStorage.removeItem('member');
    renderMemberGrid();
    loadTodayRecords();
  },

  selectMember(name, el) {
    state.member = name;
    localStorage.setItem('member', name);
    document.querySelectorAll('.member-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    loadHolidayState();
    App.requestNotification();
  },

  switchTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'history') loadHistoryRecords(document.getElementById('history-date').value);
  },

  openRecordModal() {
    if (!state.member) { showToast('⚠️ 名前を選んでね'); return; }
    state.condition = '';
    state.salt = 'なし';
    document.getElementById('comment-input').value = '';
    document.querySelectorAll('.cond-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('salt-water').classList.add('active');
    document.getElementById('salt-yes').classList.remove('active');
    document.getElementById('record-modal').classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('record-modal').classList.add('hidden');
  },

  selectCondition(cond, el) {
    state.condition = cond;
    document.querySelectorAll('.cond-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
  },

  selectSalt(val, el) {
    state.salt = val;
    document.getElementById('salt-water').classList.toggle('active', val === 'なし');
    document.getElementById('salt-yes').classList.toggle('active', val === 'あり');
  },

  async submitRecord() {
    if (!state.member) { showToast('⚠️ 名前を選んでね'); return; }

    const now = new Date();
    const data = {
      date: toDateStr(now),
      time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      name: state.member,
      dept: state.dept,
      condition: state.condition || '未選択',
      salt: state.salt,
      comment: document.getElementById('comment-input').value.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // オプティミスティック：モーダルを即閉じてトースト表示
    this.closeModal();
    showToast('✅ 記録したよ！');
    setSyncBadge(true);

    try {
      await recordsCol.add(data);
    } catch (e) {
      showToast('❌ 送信エラー。再度試してね');
      console.error(e);
    } finally {
      setSyncBadge(false);
    }

    loadTodayRecords();
  },

  async refreshRecords(btn) {
    if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
    await loadTodayRecords();
    await loadWbgt();
    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
  },

  async toggleHoliday(checked) {
    if (!state.member) { showToast('⚠️ 先に名前を選んでね'); document.getElementById('holiday-toggle').checked = false; return; }
    const today = toDateStr(new Date());
    const docRef = db.collection('personalLeave').doc(`${today}_${state.member}`);
    if (checked) {
      await docRef.set({ date: today, name: state.member });
      showToast('🏖 今日は休みに設定したよ');
    } else {
      await docRef.delete();
      showToast('🔔 今日の休み設定を解除したよ');
    }
  },

  async requestNotification() {
    const statusEl = document.getElementById('notify-status');
    if (!('Notification' in window)) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isIOS && !window.navigator.standalone) {
        statusEl.textContent = '📱 ホーム画面に追加してから通知を許可してね';
      }
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const messaging = firebase.messaging();
      const token = await messaging.getToken({ vapidKey: CONFIG.VAPID_KEY, serviceWorkerRegistration: reg });
      if (!state.member) { statusEl.textContent = '⚠️ 先に名前を選んでね'; return; }
      // Firestore にトークンを直接保存
      await tokensCol.doc(state.member).set({ token, updatedAt: new Date().toISOString() });
      statusEl.textContent = '✅ 通知を設定したよ！';
    } catch (e) {
      statusEl.textContent = '❌ エラー: ' + e.message;
    }
  }
};

// ===== 同期バッジ =====
function setSyncBadge(show) {
  document.getElementById('sync-badge').classList.toggle('show', show);
}

// ===== トースト =====
let _toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
}

// ===== ユーティリティ =====
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ===== Service Worker登録 =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./firebase-messaging-sw.js?v=1').catch(console.error);
}
