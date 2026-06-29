// ============================================================
// 熱中症対策 水分補給記録アプリ - フロントエンド
// ============================================================

// ===== 【要変更】設定 =====
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxeueMWOxm-wLt3G6T70Oc6zldEqTTBXBQeqyx5dewwB-2vnXZoJBRHsdT847Tr81hJ/exec',   // GAS WebアプリのURL
  FIREBASE: {
    apiKey: 'AIzaSyAX1QmJoIVN67GKMoXV1oIbNmV1bk-E2aM',
    authDomain: 'hydration-850bd.firebaseapp.com',
    projectId: 'hydration-850bd',
    storageBucket: 'hydration-850bd.firebasestorage.app',
    messagingSenderId: '385339912693',
    appId: '1:385339912693:web:4db23ab0e1e6f8c35630bc'
  },
  VAPID_KEY: 'BF3hSqNizcMk5kYnP7-c-nneSnNIh8cCMQdCp-kV0UP6AmsbWSd7OB06YQ3yC23Ds86ykT-CNm94UIgEYCxMHEw'
};

// ===== PINコード設定 =====
const PIN_CODE = '4277'; // ← 好きな4桁に変更してね

// ===== PIN認証 =====
const Pin = {
  _entered: '',

  init() {
    if (localStorage.getItem('pin_auth') === '1') return; // 認証済みはスキップ
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
    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < this._entered.length);
    });
  },

  _check() {
    if (this._entered === PIN_CODE) {
      localStorage.setItem('pin_auth', '1');
      document.getElementById('pin-screen').classList.add('hidden');
    } else {
      document.getElementById('pin-error').classList.remove('hidden');
      this._entered = '';
      this._updateDots();
      setTimeout(() => {
        document.getElementById('pin-error').classList.add('hidden');
      }, 2000);
    }
  }
};

// ===== 【要変更】部署・メンバー設定 =====
const DEPARTMENTS = [
  { name: '管理者',       members: ['伊藤', '有側'] },
  { name: '品質保証チーム', members: ['堀江', '吉村', '南', '東木谷'] },
  { name: '技術チーム',   members: ['山本', '細江', '本城', '林', '四ツ木', '横塚'] },
  { name: '生産管理チーム', members: ['平林', '森﨑'] },
  { name: '岩本班',       members: ['岩本A', '岩本B', '岩本C'] }
];
const MEMBERS = DEPARTMENTS.flatMap(d => d.members);
const CONDITION_EMOJI = { 良好: '😊', 普通: '😐', だるい: '😓', 不調: '🤒' };

// ===== アプリ状態 =====
let state = {
  member: localStorage.getItem('member') || '',
  dept:   localStorage.getItem('dept')   || DEPARTMENTS[0].name,
  condition: '',
  salt: 'なし',
  today: toDateStr(new Date())
};

// ===== 初期化 =====
window.addEventListener('DOMContentLoaded', async () => {
  Pin.init();
  renderHeader();
  renderDeptSelector();
  renderMemberGrid();
  initTabs();   // ← 最初に呼ぶ（タブをすぐ触れるように）
  initFirebase();

  // 履歴日付の初期値
  document.getElementById('history-date').value = state.today;
  document.getElementById('history-date').addEventListener('change', e => loadHistoryRecords(e.target.value));

  // GAS通信（非同期で後から読み込む）
  await loadTodayRecords();
  await checkHolidayStatus();
  loadWbgt();
  setInterval(loadWbgt, 20 * 60 * 1000);

  // 今日の記録を5分おきに自動更新
  setInterval(() => App.refreshRecords(), 5 * 60 * 1000);

  // 通知許可を自動リクエスト
  App.requestNotification();
});

// ===== ヘッダー =====
function renderHeader() {
  const update = () => {
    const d = new Date();
    const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]}）`;
    const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    document.getElementById('date-display').textContent = `${date}　${time}`;
  };
  update();
  setInterval(update, 60000);
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

// ===== タブ切替 =====
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ===== Firebase初期化 =====
function initFirebase() {
  try {
    firebase.initializeApp(CONFIG.FIREBASE);
  } catch (e) { }
}

// ===== App公開API =====
const App = {

  // 部署選択
  selectDept(name) {
    state.dept = name;
    state.member = '';
    localStorage.setItem('dept', name);
    localStorage.removeItem('member');
    renderMemberGrid();
    loadTodayRecords();
  },

  // メンバー選択
  selectMember(name, el) {
    state.member = name;
    localStorage.setItem('member', name);
    document.querySelectorAll('.member-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    App.requestNotification();
  },

  // 記録モーダルを開く
  openRecordModal() {
    if (!state.member) { showToast('⚠️ 名前を選んでね'); return; }
    state.condition = '';
    state.salt = 'なし';
    document.getElementById('comment-input').value = '';
    document.querySelectorAll('.cond-btn').forEach(b => b.classList.remove('active'));
    // 塩分ボタン初期化（水のみをアクティブに）
    document.querySelectorAll('.salt-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.value === 'なし');
    });
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  // モーダルを閉じる
  closeModal(e) {
    if (!e || e.target === document.getElementById('modal-overlay')) {
      document.getElementById('modal-overlay').classList.add('hidden');
    }
  },

  // 体調選択
  selectCondition(el) {
    document.querySelectorAll('.cond-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    state.condition = el.dataset.value;
  },

  // 塩分選択
  selectSalt(el) {
    document.querySelectorAll('.salt-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    state.salt = el.dataset.value;
  },

  // 記録送信
  async submitRecord() {
    const comment = document.getElementById('comment-input').value.trim();
    const now = new Date();
    const today = toDateStr(now); // 送信時点の日付を毎回取得（page load時の固定値を使わない）
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const body = {
      action: 'record',
      date: today,
      time: timeStr,
      name: state.member,
      dept: state.dept,
      condition: state.condition || '未選択',
      salt: state.salt,
      comment
    };

    try {
      const res = await gasPost(body);
      if (res.success) {
        document.getElementById('modal-overlay').classList.add('hidden');
        showToast('✅ 記録したよ！');
        await loadTodayRecords();
      } else {
        showToast('❌ 保存に失敗したよ...');
      }
    } catch (e) {
      showToast('❌ 通信エラー: ' + e.message);
    }
  },

  // 通知許可 & FCMトークン登録
  async requestNotification() {
    const statusEl = document.getElementById('notify-status');
    if (!('Notification' in window)) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      if (isIOS && !isStandalone) {
        statusEl.innerHTML = '📱 iOSの場合はSafariで<br>「共有 → ホーム画面に追加」してから<br>ホーム画面のアイコンで起動してね';
      } else {
        statusEl.textContent = '❌ このブラウザは通知に対応していないよ';
      }
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      statusEl.textContent = '❌ 通知が拒否されたよ。設定から許可してね';
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const messaging = firebase.messaging();
      const token = await messaging.getToken({
        vapidKey: CONFIG.VAPID_KEY,
        serviceWorkerRegistration: reg
      });
      if (!state.member) { statusEl.textContent = '⚠️ 先に名前を選んでね'; return; }
      await gasPost({ action: 'registerToken', name: state.member, token });
      statusEl.textContent = '✅ 通知を設定したよ！';
    } catch (e) {
      statusEl.textContent = '❌ エラー: ' + e.message;
    }
  },

  // 手動更新（記録＋WBGT）
  async refreshAll() {
    const btn = document.getElementById('btn-refresh');
    if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
    await Promise.all([loadTodayRecords(), loadWbgt()]);
    if (btn) { btn.disabled = false; btn.classList.remove('spinning'); }
  },

  // 休日トグル（個人休）
  async toggleHoliday(checked) {
    if (!state.member) { showToast('⚠️ 先に名前を選んでね'); document.getElementById('holiday-toggle').checked = false; return; }
    const action = checked ? 'setHoliday' : 'removeHoliday';
    await gasPost({ action, date: toDateStr(new Date()), name: state.member });
    showToast(checked ? '🏖 今日は休みに設定したよ' : '🔔 今日の休み設定を解除したよ');
  }
};

// ===== 今日の記録を取得 =====
async function loadTodayRecords() {
  try {
    const res = await gasGet({ action: 'getRecords', date: toDateStr(new Date()) });
    const deptRecords = (res.records || []).filter(r =>
      (r.dept || getMemberDept(r.name)) === state.dept
    );
    renderRecords('today-records', deptRecords);
    const el = document.getElementById('last-updated');
    if (el) {
      const now = new Date();
      el.textContent = `最終更新: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    }
  } catch (e) {
    document.getElementById('today-records').innerHTML = '<div class="empty-msg">読み込み失敗...</div>';
  }
}

// ===== 履歴を取得 =====
async function loadHistoryRecords(date) {
  try {
    const res = await gasGet({ action: 'getRecords', date });
    renderRecords('history-records', res.records || []);
  } catch (e) {
    document.getElementById('history-records').innerHTML = '<div class="empty-msg">読み込み失敗...</div>';
  }
}

// ===== 部署取得ヘルパー =====
function getMemberDept(name) {
  const dept = DEPARTMENTS.find(d => d.members.includes(name));
  return dept ? dept.name : '';
}

// ===== 記録レンダリング（チーム別） =====
function renderRecords(elId, records, groupByDept = false) {
  const el = document.getElementById(elId);
  if (!records.length) {
    el.innerHTML = '<div class="empty-msg">記録がないよ</div>';
    return;
  }

  if (!groupByDept) {
    el.innerHTML = [...records].reverse().map(r => recordItemHtml(r)).join('');
    return;
  }

  // チーム別にグループ化（DEPARTMENTSの順）
  const groups = DEPARTMENTS.map(d => ({
    name: d.name,
    records: records.filter(r => (r.dept || getMemberDept(r.name)) === d.name)
  })).filter(g => g.records.length > 0);

  // どのチームにも属さない記録（旧データなど）
  const ungrouped = records.filter(r => {
    const dept = r.dept || getMemberDept(r.name);
    return !dept;
  });

  el.innerHTML = groups.map(g => `
    <div class="dept-section">
      <div class="dept-section-header">${g.name} <span class="dept-count">${g.records.length}件</span></div>
      ${[...g.records].reverse().map(r => recordItemHtml(r)).join('')}
    </div>
  `).join('') + (ungrouped.length ? `
    <div class="dept-section">
      <div class="dept-section-header">その他</div>
      ${[...ungrouped].reverse().map(r => recordItemHtml(r)).join('')}
    </div>
  ` : '');
}

function recordItemHtml(r) {
  return `
    <div class="record-item">
      <span class="record-time">${r.time}</span>
      <span class="record-condition">${CONDITION_EMOJI[r.condition] || '💧'}</span>
      <div class="record-info">
        <div class="record-name">${r.name} <small style="color:var(--text-sub);font-weight:400">${r.condition}</small></div>
        ${r.comment ? `<div class="record-comment">${r.comment}</div>` : ''}
      </div>
    </div>`;
}

// ===== 休日状態を確認 =====
async function checkHolidayStatus() {
  const toggle = document.getElementById('holiday-toggle');
  const hint = document.getElementById('holiday-hint');
  try {
    const res = await gasGet({action:'isHoliday', date:toDateStr(new Date()), name: state.member || ''});
    toggle.checked = res.isHoliday;
    if(res.isHoliday && res.reason !== '個人休') {
      toggle.disabled = true;
      hint.textContent = `🔕 ${res.reason}のため通知は自動でOFFだよ`;
    } else {
      toggle.disabled = false;
      hint.textContent = 'ONにすると今日の通知が届かないよ（有給・個人休用）';
    }
  } catch(e) {}
}

// ===== WBGT表示 =====
async function loadWbgt() {
  try {
    const res = await gasGet({action: 'getWbgt'});
    const header = document.getElementById('wbgt-display');
    const card = document.getElementById('wbgt-card-body');
    if (!res || res.error || res.wbgt == null) {
      if (header) header.innerHTML = '';
      if (card) card.innerHTML = '<span class="wbgt-card-loading">データ取得できなかったよ</span>';
      return;
    }
    if (card) {
      card.innerHTML = `
        <div class="wbgt-card-val" style="color:${res.color}">${res.wbgt}℃</div>
        <div>
          <div class="wbgt-card-level" style="color:${res.color}">${res.level}</div>
          <div class="wbgt-card-sub">${res.forecastTime} 予測</div>
        </div>`;
    }
  } catch(e) {
    const card = document.getElementById('wbgt-card-body');
    if (card) card.innerHTML = '<span class="wbgt-card-loading">データ取得できなかったよ</span>';
  }
}

// ===== GAS通信 =====
async function gasPost(body) {
  const res = await fetch(CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function gasGet(params) {
  const qs = new URLSearchParams({ ...params, _t: Date.now() }).toString();
  const res = await fetch(`${CONFIG.GAS_URL}?${qs}`, { cache: 'no-store' });
  return res.json();
}

// ===== ユーティリティ =====
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2500);
}

// ===== Service Worker登録 =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./firebase-messaging-sw.js?v=2').catch(console.error);
}
