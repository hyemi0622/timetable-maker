/* 시간표 커스텀 메이커 — vanilla JS, no build step */
'use strict';

/* ---------- 상수 ---------- */
const DEVICES = [
  ['iPhone 16 / 15 Pro', 1179, 2556], ['iPhone 16 / 15 Pro Max', 1290, 2796],
  ['iPhone 14 / 13 (Pro)', 1170, 2532], ['iPhone 11 / XR', 828, 1792],
  ['iPhone 8 / SE2·SE3', 750, 1334], ['iPhone 8 Plus', 1080, 1920],
  ['iPhone SE (1세대)', 640, 1136], ['갤럭시 S24 / S23', 1080, 2340],
  ['갤럭시 S24 Ultra', 1440, 3120], ['갤럭시 Z 플립', 1080, 2640],
  ['갤럭시 A / 보급형', 720, 1560], ['아이패드 (4:3)', 1620, 2160]
];
const PALETTE = ['#CDDEE3','#8E9CBF','#E8EBDF','#97B4C7','#E5EAEF','#BBCDC0','#D4B2B2','#CA9E9E','#B4A0A0','#E0D9D9',
                 '#F6F3E7','#DAE4DB','#95A797','#BDCAD2','#B3C0BA','#E6E6E6','#A6B6C0','#B9B9B9','#FFFFFF',
                 '#D9CBB8','#C4B39A','#A89078','#8B7355','#6B5B4B','#5C4A3A','#3A2E24','#CFCFCF','#8A8A8A','#5B5B5B'];
const FONTS = [['Pretendard','프리텐다드'],['BMKkubulim','배민 꾸불림체'],['OkDandan','Ok 단단체'],
               ['Fromsol','그리운 프롬솔'],['DungGeunMo','둥근모꼴+'],['UhBeeMysen','어비 마이센']];
const LABEL_FONT = 'OkDandan';   // 요일·시간 라벨은 글꼴을 바꾸지 않는다
const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
// 말풍선별 글자 영역 (이미지 크기 대비 비율)
const BUBBLE_TXT = [[.5,.5,.60],[.5,.43,.68],[.5,.42,.60],[.5,.44,.80],[.5,.42,.60],[.5,.5,.72]];

/* ---------- 상태 ---------- */
const S = {
  device: DEVICES[0],
  bgSrc: 'assets/bg/bg1.jpg', bgImg: null, bgColor: null,
  bubbleIdx: -1, bubbleImg: null, bubbleText: '', bubbleTxt: { dx: 0, dy: 0, k: 1 },
  bubble: { x: .52, y: .18, w: .40 },        // 캔버스 비율 좌표
  stickers: [],                               // {img,x,y,w}
  tt: { x: .5, y: .34, w: .74 },              // 중심x, 상단y, 폭 (비율)
  startHour: 9, endHour: 18, dayCount: 5,
  ttFs: 1, ttLw: 1, txFw: 1,
  items: [], lineColor: '#3A3A3A', fontTable: 'OkDandan', fontBubble: 'Pretendard',
  sel: null, done: false
};
const $ = s => document.querySelector(s);
const toast = (m, t = 1800) => { const e = $('#toast'); e.textContent = m; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), t); };
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = no; i.src = src; });
const fileURL = f => URL.createObjectURL(f);

/* ---------- 화면 전환 ---------- */
function go(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
  if (id === 's3') { fitStage(); draw(); ensureAssets().then(draw); }
}

/* ================= 1. 시간표 이미지 파싱 ================= */
$('#ttFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const img = await loadImg(fileURL(f));
  $('#ttPreview').src = img.src; $('#ttDrop').classList.add('filled');
  $('#parseInfo').textContent = '분석 중…';
  try {
    const r = parseTimetableImage(img);
    S.items = r.items; S.startHour = r.startHour; S.endHour = r.endHour; S.dayCount = r.dayCount;
    S._srcImg = img;
    renderParseInfo();
    runOCR();                      // 업로드하면 과목명까지 자동 인식
  } catch (err) { console.error(err); $('#parseInfo').innerHTML = '자동 인식 실패 — <u id="openEdit">직접 입력하기</u>'; bindEditLinks(); }
});

function renderParseInfo() {
  $('#parseInfo').innerHTML = `${S.items.length}개 과목 인식됨 · <u id="openEdit">확인/수정</u> · <u id="doOcr">글자 다시 인식</u>`;
  bindEditLinks();
}
function bindEditLinks() {
  const a = $('#openEdit'), b = $('#doOcr');
  if (a) a.onclick = openEdit;
  if (b) b.onclick = runOCR;
}

/** 에타 캡쳐본에서 색 블록 + 그리드 라인을 찾아 과목 배열 생성 */
function parseTimetableImage(img) {
  const W = 480, H = Math.round(img.height * W / img.width);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const at = (i, j) => { const k = (j * W + i) * 4; return [d[k], d[k + 1], d[k + 2]]; };

  // 1) 컬러 블록 마스크
  const mask = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [r, g, b] = at(i, j), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 12 && mx > 70 && mn < 250) mask[j * W + i] = 1;
  }
  // 2) 연결 요소
  const seen = new Uint8Array(W * H), comps = [];
  for (let p = 0; p < W * H; p++) {
    if (!mask[p] || seen[p]) continue;
    let qs = [p]; seen[p] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, sr = 0, sg = 0, sb = 0;
    while (qs.length) {
      const q = qs.pop(), qi = q % W, qj = (q / W) | 0;
      n++; x0 = Math.min(x0, qi); x1 = Math.max(x1, qi); y0 = Math.min(y0, qj); y1 = Math.max(y1, qj);
      const [r, g, b] = at(qi, qj); sr += r; sg += g; sb += b;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = qi + di, nj = qj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const np = nj * W + ni; if (!mask[np] || seen[np]) continue;
        const [cr, cg, cb] = at(qi, qj), [nr, ng, nb] = at(ni, nj);
        if (Math.abs(cr - nr) + Math.abs(cg - ng) + Math.abs(cb - nb) > 30) continue;
        seen[np] = 1; qs.push(np);
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (n > 250 && w > 18 && h > 12 && n / (w * h) > .40)
      comps.push({ x0, y0, x1, y1, w, h, color: `rgb(${(sr / n) | 0},${(sg / n) | 0},${(sb / n) | 0})` });
  }
  if (!comps.length) throw new Error('no blocks');

  // 3) 열(요일) 클러스터링
  const cols = [];
  comps.sort((a, b) => a.x0 - b.x0).forEach(m => {
    const cx = (m.x0 + m.x1) / 2;
    const f = cols.find(c2 => Math.abs(c2.cx - cx) < m.w * .6);
    if (f) { f.cx = (f.cx * f.n + cx) / (f.n + 1); f.n++; } else cols.push({ cx, n: 1 });
  });
  cols.sort((a, b) => a.cx - b.cx);
  const colW = cols.length > 1 ? (cols[cols.length - 1].cx - cols[0].cx) / (cols.length - 1) : comps[0].w;
  const gridL = cols[0].cx - colW / 2;

  // 4) 가로 그리드 라인으로 시간 단위(pitch) 추정
  const hist = new Array(32).fill(0);
  for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { const [r, g, b] = at(i, j); hist[((r + g + b) / 3 / 8) | 0]++; }
  const bgV = hist.indexOf(Math.max(...hist)) * 8 + 4;   // 배경 밝기(라이트/다크 자동)
  const rowsGray = [];
  for (let j = 1; j < H - 1; j++) {
    let cnt = 0;
    for (let i = (gridL | 0) + 2; i < W - 2; i++) {
      const [r, g, b] = at(i, j), v = (r + g + b) / 3, dv = Math.abs(v - bgV);
      if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && dv > 4 && dv < 75) cnt++;
    }
    if (cnt > (W - gridL) * .55) rowsGray.push(j);
  }
  const lines = []; rowsGray.forEach(y => { if (!lines.length || y - lines[lines.length - 1] > 4) lines.push(y); });
  let pitch = 0, top = 0;
  if (lines.length > 2) {
    const gaps = []; for (let i = 1; i < lines.length; i++) gaps.push(lines[i] - lines[i - 1]);
    gaps.sort((a, b) => a - b); pitch = gaps[gaps.length >> 1];
    // 블록 경계(30분 격자)와 위상이 맞는 선만 기준선 후보로
    const hp = pitch / 2, ys = [];
    comps.forEach(m => { ys.push(m.y0); ys.push(m.y1); });
    const ph = ys.map(y => ((y % hp) + hp) % hp).sort((a, b) => a - b)[ys.length >> 1];
    const off = y => { const d = Math.abs((((y - ph) % hp) + hp) % hp); return Math.min(d, hp - d); };
    const y0min = Math.min(...comps.map(m => m.y0));
    const cand = lines.filter(y => y >= 3 && off(y) < hp * .3 && y0min - y < pitch * 1.15);
    cand.push(y0min);
    top = Math.min(...cand);
  } else { pitch = Math.min(...comps.map(m => m.h)); top = Math.min(...comps.map(m => m.y0)); }
  if (pitch < 6) pitch = Math.min(...comps.map(m => m.h));

  // 4-b) 붙어 있는 블록을 '수업명(진한 글씨)' 줄 위치로 나눈다
  const parts = [];
  comps.forEach(m => {
    // 글자 픽셀 밝기 분포에서 '진한 글씨(수업명)'만 남길 임계를 정한다
    const vs = [];
    for (let j = m.y0; j <= m.y1; j++) for (let i = m.x0; i <= m.x1; i++) {
      if (mask[j * W + i]) continue;
      const c2 = at(i, j), v = (c2[0] + c2[1] + c2[2]) / 3;
      if (v < 170) vs.push(v);
    }
    if (vs.length < 40) { parts.push(m); return; }
    vs.sort((p2, q2) => p2 - q2);
    const p5 = vs[(vs.length * .05) | 0], p50 = vs[vs.length >> 1];
    const th = p5 + (p50 - p5) * .55;
    const prof = [];
    for (let j = m.y0; j <= m.y1; j++) {
      let n = 0;
      for (let i = m.x0; i <= m.x1; i++) {
        if (mask[j * W + i]) continue;
        const c2 = at(i, j);
        if ((c2[0] + c2[1] + c2[2]) / 3 <= th) n++;
      }
      prof.push(n);
    }
    const need = Math.max(3, (m.w * .15) | 0), gaps = [];
    let st = -1;
    for (let k = 0; k < prof.length; k++) {
      if (prof[k] >= need) { if (st < 0) st = k; }
      else if (st >= 0) { gaps.push([st, k - 1]); st = -1; }
    }
    if (st >= 0) gaps.push([st, prof.length - 1]);
    const grp = [];
    gaps.forEach(g2 => {
      const last = grp[grp.length - 1];
      if (last && g2[0] - last[1] < pitch * .5) last[1] = g2[1]; else grp.push([...g2]);
    });
    // 수업명이라고 보기엔 너무 좁은 덩어리(숫자 한 글자 등)는 새 과목으로 치지 않는다
    const wide = grp.filter(g2 => {
      let mx = 0; for (let k = g2[0]; k <= g2[1]; k++) mx = Math.max(mx, prof[k]);
      return mx > m.w * .18;
    });
    if (wide.length < 2) { parts.push(m); return; }
    const lead = wide[0][0], cuts = [0];
    for (let k = 1; k < wide.length; k++) {
      const y = m.y0 + wide[k][0] - lead, u = (y - top) / pitch * 2;
      if (Math.abs(u - Math.round(u)) > .38) continue;
      const snap = top + Math.round(u) / 2 * pitch - m.y0;
      if (snap > pitch * .3 && snap < m.h - pitch * .3) cuts.push(snap);
    }
    if (cuts.length < 2) { parts.push(m); return; }
    for (let k = 0; k < cuts.length; k++) {
      const y0 = m.y0 + cuts[k];
      const y1 = k < cuts.length - 1 ? m.y0 + cuts[k + 1] - 1 : m.y1;
      parts.push({ ...m, y0, y1, h: y1 - y0 + 1 });
    }
  });
  comps.length = 0; comps.push(...parts);

  // 5) 과목 생성 (pitch = 1시간)
  const startHour = 9, q = v => Math.round(v * 2) / 2;   // 30분 단위 반올림
  const items = comps.map((m, i) => {
    const day = Math.max(0, Math.round((( m.x0 + m.x1) / 2 - gridL - colW / 2) / colW));
    const s = startHour + q((m.y0 - top) / pitch);
    const e = Math.max(s + .5, startHour + q((m.y1 - top) / pitch));
    return { day, s, e, name: '과목 ' + (i + 1), room: '', color: PALETTE[(Math.random() * 18) | 0], box: m };
  }).filter(v => v.day < 7);

  const dayCount = Math.max(5, Math.min(7, Math.max(...items.map(v => v.day)) + 1));
  const endHour = Math.min(24, Math.max(18, Math.ceil(Math.max(...items.map(v => v.e)))));
  return { items, startHour, endHour: endHour, dayCount };
}

/* ---- OCR (선택) ---- */
async function runOCR() {
  if (!S._srcImg || !S.items.length) return;
  toast('글자를 읽는 중이에요… (처음 한 번은 조금 걸려요)', 6000);
  try {
    if (!window.Tesseract) await new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; s.onload = ok; s.onerror = no;
      document.head.appendChild(s);
    });
    const worker = await Tesseract.createWorker(['kor','eng']);
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    const img = S._srcImg, k = img.width / 480;
    for (const it of S.items) {
      const bx = it.box, cvs = document.createElement('canvas');
      const up = 3;                                   // 3배 확대 + 대비 강화
      const W2 = Math.round(bx.w * k * up), H2 = Math.round(bx.h * k * up);
      cvs.width = W2; cvs.height = H2;
      const cx = cvs.getContext('2d', { willReadFrequently: true });
      cx.imageSmoothingQuality = 'high';
      cx.filter = 'grayscale(1) contrast(1.8) brightness(1.08)';
      cx.drawImage(img, bx.x0 * k, bx.y0 * k, bx.w * k, bx.h * k, 0, 0, W2, H2);

      // 글자 진하기로 '수업명'과 '부가정보' 영역을 나눈다 (에타는 수업명만 진하고 크다)
      const px = cx.getImageData(0, 0, W2, H2).data;
      const rowsOf = thr => {
        const pr = [], need = Math.max(2, (W2 * .03) | 0), out = [];
        for (let y = 0; y < H2; y++) {
          let n = 0;
          for (let x = 0; x < W2; x++) if (px[(y * W2 + x) * 4] < thr) n++;
          pr.push(n);
        }
        let rs = -1;
        for (let y = 0; y <= H2; y++) {
          const on = y < H2 && pr[y] >= need;
          if (on) { if (rs < 0) rs = y; }
          else if (rs >= 0) { if (y - rs > up) out.push([rs, y - 1]); rs = -1; }
        }
        return out;
      };
      const vs = [];
      for (let i2 = 0; i2 < px.length; i2 += 4) if (px[i2] < 175) vs.push(px[i2]);
      if (vs.length < 40) continue;
      vs.sort((p2, q2) => p2 - q2);
      const p5 = vs[(vs.length * .05) | 0], p50 = vs[vs.length >> 1];
      const allRuns = rowsOf(175), darkRuns = rowsOf(p5 + (p50 - p5) * .45);
      if (!allRuns.length) continue;
      const rec = async (y0, y1) => {
        if (!(y1 > y0)) return '';
        const c2 = document.createElement('canvas');
        c2.width = W2; c2.height = y1 - y0 + 1;
        c2.getContext('2d').drawImage(cvs, 0, y0, W2, c2.height, 0, 0, W2, c2.height);
        const { data } = await worker.recognize(c2);
        return (data.text || '').replace(/[^가-힣A-Za-z0-9()\-\/\s]/g, ' ');
      };
      const dr = darkRuns.length ? darkRuns : [allRuns[0]];
      let nameEnd = dr[0][1];
      const h0 = dr[0][1] - dr[0][0] + 1;
      for (let i2 = 1; i2 < dr.length && i2 < 3; i2++) {   // 수업명이 여러 줄이면 같은 높이로 바로 아래 이어진다
        if (dr[i2][0] - nameEnd < h0 * 1.35) nameEnd = dr[i2][1]; else break;
      }
      const nameY = [dr[0][0], nameEnd];
      const subs = allRuns.filter(r2 => r2[0] > nameEnd + up);
      const nm = await rec(nameY[0] - up * 2, nameY[1] + up * 3);
      it.name = nm.split('\n').map(t => t.trim()).join('').replace(/ {2,}/g, ' ').trim();   // 줄바꿈만 이어 붙이고 띄어쓰기는 유지
      if (subs.length) {
        const sub = await rec(subs[0][0] - up, subs[subs.length - 1][1] + up * 2);
        it.room = sub.replace(/\s+/g, ' ').trim();
      } else it.room = '';
    }
    await worker.terminate();
    toast('과목명 인식 완료'); renderParseInfo(); if ($('#editModal').classList.contains('open')) renderRows();
  } catch (e) { console.error(e); toast('글자 인식을 사용할 수 없어요. 직접 입력해 주세요.'); }
}

/* ---- 과목 수정 모달 ---- */
function openEdit() { renderRows(); $('#editModal').classList.add('open'); }
$('#closeModal').onclick = () => { $('#editModal').classList.remove('open'); renderParseInfo(); draw(); };
$('#addItem').onclick = () => { S.items.push({ day: 0, s: 9, e: 10, name: '', room: '', color: PALETTE[(Math.random() * 18) | 0] }); renderRows(); };
['startHour', 'endHour', 'dayCount'].forEach(id => $('#' + id).onchange = e => { S[id] = +e.target.value; draw(); });

function renderRows() {
  $('#startHour').value = S.startHour; $('#endHour').value = S.endHour; $('#dayCount').value = S.dayCount;
  const box = $('#itemRows'); box.innerHTML = '';
  S.items.forEach((it, i) => {
    const r = document.createElement('div'); r.className = 'irow';
    r.innerHTML = `<select>${DAYS.slice(0, S.dayCount).map((d, k) => `<option value="${k}"${k == it.day ? ' selected' : ''}>${d}</option>`).join('')}</select>
      <input type="number" step="0.5" value="${it.s}"><input type="number" step="0.5" value="${it.e}">
      <input placeholder="과목명" value="${it.name}"><input placeholder="강의실" value="${it.room}"><button class="x">×</button>`;
    const [dsel, si, ei, ni, ri, del] = r.children;
    dsel.onchange = e => { it.day = +e.target.value; draw(); };
    si.onchange = e => { it.s = +e.target.value; draw(); };
    ei.onchange = e => { it.e = +e.target.value; draw(); };
    ni.oninput = e => { it.name = e.target.value; draw(); };
    ri.oninput = e => { it.room = e.target.value; draw(); };
    del.onclick = () => { S.items.splice(i, 1); renderRows(); draw(); };
    box.appendChild(r);
  });
}

/* ================= 캐릭터 누끼 ================= */
const charGrid = $('#charGrid');
function addSlot() {
  const el = document.createElement('label'); el.className = 'char-slot';
  el.innerHTML = `<input type="file" accept="image/*" hidden><img class="ph" src="assets/ui/add.png" alt="">`;
  el.querySelector('input').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    el.classList.add('loading');
    const img = await loadImg(fileURL(f));
    const cut = await cutout(img);
    el.classList.remove('loading');
    el.querySelector('.ph').style.display = 'none';
    let v = el.querySelector('.cut');
    if (!v) { v = document.createElement('img'); v.className = 'cut'; el.appendChild(v); }
    v.src = cut.src;
    if (!el.querySelector('.del')) {
      const b = document.createElement('span'); b.className = 'del'; b.textContent = '×';
      b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); S.stickers = S.stickers.filter(s => s.el !== el); el.remove(); };
      el.appendChild(b);
    }
    const prev = S.stickers.find(s => s.el === el);
    if (prev) prev.img = cut;
    else S.stickers.push({ el, img: cut, x: .22 + S.stickers.length * .06, y: .22, w: .28 });
  };
  charGrid.appendChild(el);
}
[0, 1, 2].forEach(addSlot);
$('#addCharSlot').onclick = addSlot;

/** 테두리에서 플러드필로 배경 제거 → 스티커화 */
function cutout(img) {
  const MAX = 700, sc = Math.min(1, MAX / Math.max(img.width, img.height));
  const W = Math.round(img.width * sc), H = Math.round(img.height * sc);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const im = x.getImageData(0, 0, W, H), d = im.data;
  let hasAlpha = false;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] < 250) { hasAlpha = true; break; }
  if (!hasAlpha) {
    const seen = new Uint8Array(W * H), q = [];
    const push = p => { if (!seen[p]) { seen[p] = 1; q.push(p); } };
    const near = (p, r, g, b) => { const k = p * 4; return Math.max(Math.abs(d[k] - r), Math.abs(d[k + 1] - g), Math.abs(d[k + 2] - b)) < 26; };
    const k0 = 0; const br = d[k0], bg = d[k0 + 1], bb = d[k0 + 2];
    for (let i = 0; i < W; i++) { push(i); push((H - 1) * W + i); }
    for (let j = 0; j < H; j++) { push(j * W); push(j * W + W - 1); }
    const out = new Uint8Array(W * H);
    while (q.length) {
      const p = q.pop(); if (!near(p, br, bg, bb)) continue;
      out[p] = 1; const i = p % W, j = (p / W) | 0;
      if (i > 0) push(p - 1); if (i < W - 1) push(p + 1); if (j > 0) push(p - W); if (j < H - 1) push(p + W);
    }
    // 선으로 막힌 안쪽 빈 공간: 작은 구멍만 제거(넓은 면적은 캐릭터의 일부로 보고 남김)
    const holeMax = W * H * .06, hs = new Uint8Array(W * H);
    for (let p0 = 0; p0 < W * H; p0++) {
      if (out[p0] || hs[p0] || !near(p0, br, bg, bb)) continue;
      const stack = [p0], cell = []; hs[p0] = 1;
      while (stack.length) {
        const q = stack.pop(); cell.push(q);
        const i = q % W, j = (q / W) | 0;
        for (const np of [i > 0 ? q - 1 : -1, i < W - 1 ? q + 1 : -1, j > 0 ? q - W : -1, j < H - 1 ? q + W : -1])
          if (np >= 0 && !hs[np] && !out[np] && near(np, br, bg, bb)) { hs[np] = 1; stack.push(np); }
      }
      if (cell.length < holeMax) for (const q of cell) out[q] = 1;
    }
    for (let p = 0; p < W * H; p++) if (out[p]) d[p * 4 + 3] = 0;
    // 가장자리 부드럽게
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const p = j * W + i; if (out[p]) continue;
      let n = 0; if (out[p - 1]) n++; if (out[p + 1]) n++; if (out[p - W]) n++; if (out[p + W]) n++;
      if (n) d[p * 4 + 3] = 255 - n * 45;
    }
    x.putImageData(im, 0, 0);
  }
  // 여백 잘라내기
  const im2 = x.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (im2[(j * W + i) * 4 + 3] > 12) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return loadImg(o.toDataURL('image/png'));
}

/* ================= 2. 배경 / 말풍선 ================= */
function clearBgSel() {
  document.querySelectorAll('.bg-grid img,.custom-bg-wrap img').forEach(e => e.classList.remove('sel'));
  $('.bg-solid').classList.remove('sel');
}
const bgGrid = $('#bgGrid');
for (let i = 1; i <= 9; i++) {
  const im = document.createElement('img'); im.src = `assets/bg/bg${i}.jpg`; im.loading = 'lazy';
  if (i === 1) im.classList.add('sel');
  im.onclick = () => { clearBgSel(); im.classList.add('sel'); S.bgSrc = im.src; S.bgImg = null; S.bgColor = null; };
  bgGrid.appendChild(im);
}
$('#bgFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const url = fileURL(f);
  $('#customBgWrap').innerHTML = '';
  const im = document.createElement('img'); im.src = url;
  im.onclick = () => { clearBgSel(); im.classList.add('sel'); S.bgSrc = url; S.bgImg = null; S.bgColor = null; };
  $('#customBgWrap').appendChild(im); im.click();
};
const bubbleGrid = $('#bubbleGrid');
for (let i = 1; i <= 6; i++) {
  const cell = document.createElement('div'); cell.className = 'cell';
  cell.innerHTML = `<img src="assets/bubble/b${i}.png" loading="lazy">`;
  cell.onclick = () => {
    const on = cell.classList.contains('sel');
    document.querySelectorAll('.bubble-grid .cell').forEach(c => c.classList.remove('sel'));
    if (on) { S.bubbleIdx = -1; S.bubbleImg = null; }        // 다시 누르면 해제
    else { cell.classList.add('sel'); S.bubbleIdx = i - 1; S.bubbleImg = null; }
  };
  bubbleGrid.appendChild(cell);
}
const bgColorInput = $('#bgColor');
const useSolid = () => { clearBgSel(); $('.bg-solid').classList.add('sel'); S.bgColor = bgColorInput.value; S.bgImg = null; };
bgColorInput.oninput = useSolid;
$('.bg-solid').addEventListener('click', e => { if (e.target !== bgColorInput) useSolid(); });

$('#bubbleText').oninput = e => { S.bubbleText = e.target.value; };
DEVICES.forEach((d, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${d[0]} — ${d[1]}×${d[2]}`; $('#deviceSel').appendChild(o); });
$('#deviceSel').onchange = e => { S.device = DEVICES[+e.target.value]; fitStage(); draw(); };

$('#toS2').onclick = () => { if (!S.items.length) { toast('시간표를 먼저 추가하거나 직접 입력해 주세요.'); } go('s2'); };
$('#backS1').onclick = () => go('s1');
$('#backS2').onclick = () => go('s2');
$('#toS3').onclick = async () => { await ensureAssets(); go('s3'); };

async function ensureAssets() {
  if (S.bgColor) S.bgImg = null;
  else if (!S.bgImg || S.bgImg.src !== S.bgSrc) S.bgImg = await loadImg(S.bgSrc).catch(() => null);
  if (S.bubbleIdx >= 0 && !S.bubbleImg) S.bubbleImg = await loadImg(`assets/bubble/b${S.bubbleIdx + 1}.png`);
  if (S.bubbleIdx < 0) S.bubbleImg = null;
}

/* ================= 3. 캔버스 렌더링 ================= */
const cv = $('#stage'), ctx = cv.getContext('2d');
const syncTouch = () => { cv.style.touchAction = (S.sel && S.sel.t !== 'item') ? 'none' : 'pan-y'; };
function fitStage() {                 // 미리보기는 화면 해상도로 직접 렌더 (축소 뭉개짐 방지)
  const box = cv.parentElement.clientWidth || (window.innerWidth - 56);
  const w = Math.min(360, box), ar = S.device[1] / S.device[2], h = w / ar;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
}

let _lastW = 0;
window.addEventListener('resize', () => {     // 폭이 실제로 바뀔 때만 다시 그린다
  const w = cv.parentElement.clientWidth;
  if (w === _lastW || !$('#s3').classList.contains('active')) return;
  _lastW = w; fitStage(); draw();
});

/* 손그림 흔들림 */
let WAVE = 26;
const rnd = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
function jit(seed, t, amp) {
  const s = t / WAVE, i = Math.floor(s), f = s - i, u = f * f * (3 - 2 * f);
  const a = rnd(seed + i), b = rnd(seed + i + 1);
  return ((a + (b - a) * u) * 2 - 1) * amp;
}
function poly(pts) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
function vSeg(x, y0, y1, seed, amp) { const p = []; const n = Math.max(2, Math.ceil((y1 - y0) / 7)); for (let i = 0; i <= n; i++) { const y = y0 + (y1 - y0) * i / n; p.push([x + jit(seed, y, amp), y]); } return p; }
function hSeg(y, x0, x1, seed, amp) { const p = []; const n = Math.max(2, Math.ceil((x1 - x0) / 7)); for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; p.push([x, y + jit(seed, x, amp)]); } return p; }

function geom() {
  const W = cv.width, H = cv.height;
  const tw = S.tt.w * W, days = S.dayCount, rows = Math.max(1, S.endHour - S.startHour);
  const timeW = tw * .115, headH = tw * .085, colW = (tw - timeW) / days;
  const rowH = tw * (rows > 10 ? 1.35 / rows : .145);
  const th = headH + rowH * rows;
  const x = S.tt.x * W - tw / 2, y = S.tt.y * H;
  WAVE = tw * .115;
  return { x, y, tw, th, timeW, headH, colW, rowH, rows, days, amp: tw * .0024 };
}

function wrap(text, maxW, max) {
  const out = [];
  let line = '';
  const flush = () => { if (line) { out.push(line); line = ''; } };
  for (let w of text.split(/\s+/).filter(Boolean)) {
    const join = line ? line + ' ' + w : w;
    if (ctx.measureText(join).width <= maxW) { line = join; continue; }
    flush();
    while (ctx.measureText(w).width > maxW && w.length > 1) {
      let i = 1;
      while (i < w.length && ctx.measureText(w.slice(0, i + 1)).width <= maxW) i++;
      out.push(w.slice(0, i)); w = w.slice(i);
      if (out.length >= max) return out.slice(0, max);
    }
    line = w;
  }
  flush();
  return out.slice(0, max);
}
function inkText(t, x, y, fs) {          // 글씨 굵기 조절 (같은 색 외곽선을 덧그린다)
  ctx.fillText(t, x, y);
  if (S.txFw > 1.02) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineJoin = ctx.lineCap = 'round';
    ctx.lineWidth = fs * (S.txFw - 1) * .11;
    ctx.strokeText(t, x, y);
    ctx.restore();
  }
}
const lum = h => { const n = parseInt(h.slice(1), 16); return (.299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255)) / 255; };

function drawTable() {
  const g = geom(), f = S.fontTable;
  const gs = t => { const k = t - S.startHour; return Number.isInteger(k) ? k * 3 + 100 : null; };
  // 격자에 없는 경계는 '요일 + 시각'으로 seed를 정해 인접 과목끼리 똑같은 선을 쓰게 한다
  const es = (day, t) => day * 97 + Math.round((t - S.startHour) * 2) * 7 + 700;
  ctx.save();
  ctx.strokeStyle = S.lineColor;
  ctx.lineWidth = Math.max(1, g.tw * .0075 * S.ttLw);
  ctx.lineJoin = ctx.lineCap = 'round';

  // 1) 표 안쪽 기본 흰색
  ctx.beginPath();
  poly([...hSeg(g.y, g.x, g.x + g.tw, 99, g.amp), ...vSeg(g.x + g.tw, g.y, g.y + g.th, g.days + 40, g.amp),
        ...hSeg(g.y + g.th, g.x + g.tw, g.x, g.rows * 3 + 100, g.amp), ...vSeg(g.x, g.y + g.th, g.y, 39, g.amp)]);
  ctx.closePath(); ctx.fillStyle = '#FFFFFF'; ctx.fill();

  // 2) 과목 박스 채우기 (선은 나중에 그리므로 안쪽으로 좁힐 필요 없음)
  const boxes = [];
  S.items.forEach((it, i) => {
    if (it.day >= g.days) return;
    const cx0 = g.x + g.timeW + it.day * g.colW, cx1 = cx0 + g.colW;
    const y0 = g.y + g.headH + (it.s - S.startHour) * g.rowH, y1 = g.y + g.headH + (it.e - S.startHour) * g.rowH;
    if (y1 <= g.y + g.headH || y0 > g.y + g.th) return;
    const st = gs(it.s), sb = gs(it.e);
    const path = [...hSeg(y0, cx0, cx1, st === null ? es(it.day, it.s) : st, g.amp),
                  ...vSeg(cx1, y0, y1, it.day + 41, g.amp),
                  ...hSeg(y1, cx1, cx0, sb === null ? es(it.day, it.e) : sb, g.amp),
                  ...vSeg(cx0, y1, y0, it.day + 40, g.amp)];
    ctx.beginPath(); poly(path); ctx.closePath();
    ctx.fillStyle = it.color; ctx.fill();
    boxes.push({ it, i, cx0, cx1, y0, y1, st, sb, path });
  });

  // 3) 선 — 모든 선을 정확히 한 번씩만, 채우기 위에 그린다
  ctx.beginPath();
  for (let j = 0; j <= g.days; j++) poly(vSeg(g.x + g.timeW + j * g.colW, g.y, g.y + g.th, j + 40, g.amp));
  poly(vSeg(g.x, g.y, g.y + g.th, 39, g.amp));
  poly(hSeg(g.y, g.x, g.x + g.tw, 99, g.amp));
  for (let i = 0; i <= g.rows; i++) {
    const t = S.startHour + i, y = g.y + g.headH + i * g.rowH, sd = i * 3 + 100;
    let from = g.x;                       // 과목 '안쪽'을 지나는 구간은 건너뛴다
    for (let dd = 0; dd < g.days; dd++) {
      const cx0 = g.x + g.timeW + dd * g.colW;
      if (S.items.some(it => it.day === dd && it.s < t && t < it.e)) {
        if (from !== null && cx0 > from) poly(hSeg(y, from, cx0, sd, g.amp));
        from = null;
      } else if (from === null) from = cx0;
    }
    if (from !== null) poly(hSeg(y, from, g.x + g.tw, sd, g.amp));
  }
  const drawn = new Set();
  boxes.forEach(b => {                    // 30분처럼 격자에 없는 경계 (맞닿은 과목끼리 한 번만)
    [[b.st, b.it.s, b.y0], [b.sb, b.it.e, b.y1]].forEach(([sd, t, y]) => {
      if (sd !== null) return;
      const key = b.it.day + ':' + t;
      if (drawn.has(key)) return;
      drawn.add(key);
      poly(hSeg(y, b.cx0, b.cx1, es(b.it.day, t), g.amp));
    });
  });
  ctx.stroke();

  // 4) 과목 글자
  boxes.forEach(b => {
    const it = b.it, pad = g.colW * .11, tw = g.colW - pad * 2;
    ctx.save(); ctx.beginPath(); poly(b.path); ctx.closePath(); ctx.clip();
    ctx.fillStyle = lum(it.color) < .62 ? '#fff' : '#4a4a4a';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const fs = g.tw * .038 * S.ttFs;
    ctx.font = `600 ${fs}px "${f}", Pretendard, sans-serif`;
    let ty = b.y0 + pad;
    wrap(it.name, tw, 3).forEach(l => { inkText(l, b.cx0 + pad, ty, fs); ty += fs * 1.22; });
    if (it.room) {
      const sf = fs * .70;
      ctx.font = `400 ${sf}px "${f}", Pretendard, sans-serif`;
      ctx.globalAlpha = .8;
      let sy = ty + fs * .08;
      wrap(it.room, tw, 4).forEach(l => { inkText(l, b.cx0 + pad, sy, sf); sy += sf * 1.2; });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  });

  // 5) 요일 / 시간
  ctx.fillStyle = S.lineColor === '#FFFFFF' ? '#fff' : '#3c3c3c';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${g.tw * .050 * S.ttFs}px "${LABEL_FONT}", Pretendard, sans-serif`;
  const hf = g.tw * .050 * S.ttFs;
  for (let j = 0; j < g.days; j++) inkText(DAYS[j], g.x + g.timeW + g.colW * (j + .5), g.y + g.headH * .55, hf);
  ctx.font = `500 ${g.tw * .046 * S.ttFs}px "${LABEL_FONT}", Pretendard, sans-serif`;
  for (let i = 0; i < g.rows; i++) {
    const h = S.startHour + i, lab = h > 12 ? h - 12 : h;
    inkText(String(lab), g.x + g.timeW * .55, g.y + g.headH + i * g.rowH + g.rowH * .22, g.tw * .046 * S.ttFs);
  }
  ctx.restore();
}

let _bl = null, _blIdx = -2;
function bubbleLine() {          // 말풍선에서 '선'만 남긴 레이어 (캐시)
  if (_blIdx === S.bubbleIdx && _bl) return _bl;
  const im = S.bubbleImg, c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0);
  const dt = x.getImageData(0, 0, c.width, c.height), d = dt.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (d[i + 3] < 120 || v > 130) d[i + 3] = 0;
  }
  x.putImageData(dt, 0, 0);
  _bl = c; _blIdx = S.bubbleIdx;
  return c;
}

function bubbleRect() {
  const W = cv.width, H = cv.height, im = S.bubbleImg;
  const w = S.bubble.w * W, h = im ? w * im.height / im.width : 0;
  return { x: S.bubble.x * W - w / 2, y: S.bubble.y * H, w, h };
}
function stickerRect(s) { const W = cv.width, w = s.w * W, h = w * s.img.height / s.img.width; return { x: s.x * W - w / 2, y: s.y * cv.height, w, h }; }
function tableRect() { const g = geom(); return { x: g.x, y: g.y, w: g.tw, h: g.th }; }

function draw() {
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  if (S.bgColor) { ctx.fillStyle = S.bgColor; ctx.fillRect(0, 0, W, H); }
  else if (S.bgImg) {  // cover
    const r = Math.max(W / S.bgImg.width, H / S.bgImg.height), w = S.bgImg.width * r, h = S.bgImg.height * r;
    ctx.drawImage(S.bgImg, (W - w) / 2, (H - h) / 2, w, h);
  }
  drawTable();
  S.stickers.forEach(s => { const r = stickerRect(s); ctx.drawImage(s.img, r.x, r.y, r.w, r.h); });
  if (S.bubbleImg) {
    const r = bubbleRect(); ctx.drawImage(S.bubbleImg, r.x, r.y, r.w, r.h);
    if (S.bbLw > 1.02) {                       // 선만 뽑아 여러 방향으로 겹쳐 굵게
      const L = bubbleLine();
      const rad = (S.bbLw - 1) * r.w * .006;
      for (const ring of [rad * .5, rad]) {
        for (let a = 0; a < 16; a++) {
          const t2 = a * Math.PI / 8;
          ctx.drawImage(L, r.x + Math.cos(t2) * ring, r.y + Math.sin(t2) * ring, r.w, r.h);
        }
      }
    }
    if (S.bubbleText) {
      const [cxr, cyr, wr] = BUBBLE_TXT[S.bubbleIdx] || [.5, .5, .7];
      const T = S.bubbleTxt;
      ctx.fillStyle = '#3a3a3a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const maxLines = S.bubbleText.length > 16 ? 2 : 1;
      let base = r.w * .105, lines;
      for (;;) {
        ctx.font = `600 ${base}px "${S.fontBubble}", Pretendard, sans-serif`;
        lines = wrap(S.bubbleText, r.w * wr, 3);
        if (lines.length <= maxLines || base < r.w * .045) break;
        base *= .9;
      }
      const fs = base * T.k;
      ctx.font = `600 ${fs}px "${S.fontBubble}", Pretendard, sans-serif`;
      lines = wrap(S.bubbleText, r.w * wr * Math.max(1, T.k), 3);
      const cx = r.x + r.w * cxr + T.dx * r.w, cy = r.y + r.h * cyr + T.dy * r.h;
      let mw = 0; lines.forEach(l => mw = Math.max(mw, ctx.measureText(l).width));
      lines.forEach((l, i) => inkText(l, cx, cy + (i - (lines.length - 1) / 2) * fs * 1.25, fs));
      S._txt = { x: cx - mw / 2, y: cy - lines.length * fs * .68, w: mw, h: lines.length * fs * 1.32 };
    } else S._txt = null;
  }
  drawSel();
}

function selRect() {
  if (!S.sel) return null;
  if (S.sel.t === 'btext') return S._txt;
  if (S.sel.t === 'bubble') return bubbleRect();
  if (S.sel.t === 'sticker') return stickerRect(S.stickers[S.sel.i]);
  if (S.sel.t === 'table' && S.done) return tableRect();
  if (S.sel.t === 'item') {
    const g = geom(), it = S.items[S.sel.i];
    return { x: g.x + g.timeW + it.day * g.colW, y: g.y + g.headH + (it.s - S.startHour) * g.rowH, w: g.colW, h: (it.e - it.s) * g.rowH };
  }
  return null;
}
function drawSel() {
  const r = selRect(); if (!r) return;
  ctx.save(); ctx.strokeStyle = '#5b8fd6'; ctx.lineWidth = cv.width * .006; ctx.setLineDash([cv.width * .02, cv.width * .015]);
  ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
  if (S.sel.t !== 'item') { ctx.fillStyle = '#5b8fd6'; ctx.beginPath(); ctx.arc(r.x + r.w, r.y + r.h, cv.width * .022, 0, 7); ctx.fill(); }
  ctx.restore();
}

/* ---------- 터치/마우스 ---------- */
let drag = null;
const toCv = e => { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * cv.width / b.width, y: (e.clientY - b.top) * cv.height / b.height }; };
const inR = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  const p = toCv(e);
  const cur = selRect();
  if (cur && S.sel.t !== 'item' && Math.hypot(p.x - (cur.x + cur.w), p.y - (cur.y + cur.h)) < cv.width * .05) {
    drag = { mode: 'resize', p, w0: (S.sel.t === 'btext' ? S.bubbleTxt.k : S.sel.t === 'bubble' ? S.bubble.w : S.sel.t === 'table' ? S.tt.w : S.stickers[S.sel.i].w), r0: cur };
    return;
  }
  let hit = null;
  if (S._txt && inR(p, S._txt)) hit = { t: 'btext' };
  for (let i = hit ? -1 : S.stickers.length - 1; i >= 0; i--) if (inR(p, stickerRect(S.stickers[i]))) { hit = { t: 'sticker', i }; break; }
  if (!hit && S.bubbleImg && inR(p, bubbleRect())) hit = { t: 'bubble' };
  if (!hit) {
    const g = geom();
    for (let i = 0; i < S.items.length; i++) {
      const it = S.items[i]; if (it.day >= g.days) continue;
      const r = { x: g.x + g.timeW + it.day * g.colW, y: g.y + g.headH + (it.s - S.startHour) * g.rowH, w: g.colW, h: (it.e - it.s) * g.rowH };
      if (inR(p, r)) { hit = { t: 'item', i }; break; }
    }
    if (!hit && inR(p, tableRect())) hit = { t: 'table' };
  }
  S.sel = hit;
  syncTouch();
  if (typeof syncItemEdit === 'function') syncItemEdit();
  if (hit && hit.t === 'btext') {
    const br = bubbleRect();
    drag = { mode: 'txtmove', p, x0: S.bubbleTxt.dx, y0: S.bubbleTxt.dy, br };
  } else if (hit && (hit.t === 'sticker' || hit.t === 'bubble' || (hit.t === 'table' && S.done))) {
    const o = hit.t === 'bubble' ? S.bubble : hit.t === 'table' ? S.tt : S.stickers[hit.i];
    drag = { mode: 'move', p, x0: o.x, y0: o.y, o };
  }
  draw();
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = toCv(e);
  if (drag.mode === 'txtmove') { S.bubbleTxt.dx = drag.x0 + (p.x - drag.p.x) / drag.br.w; S.bubbleTxt.dy = drag.y0 + (p.y - drag.p.y) / drag.br.h; }
  else if (drag.mode === 'move') { drag.o.x = drag.x0 + (p.x - drag.p.x) / cv.width; drag.o.y = drag.y0 + (p.y - drag.p.y) / cv.height; }
  else {
    const k = (p.x - drag.r0.x) / drag.r0.w;
    const nw = Math.max(.12, Math.min(1.6, drag.w0 * k));
    if (S.sel.t === 'btext') S.bubbleTxt.k = Math.max(.3, Math.min(4, drag.w0 * k));
    else if (S.sel.t === 'bubble') S.bubble.w = nw;
    else if (S.sel.t === 'table') S.tt.w = Math.min(1, nw); else S.stickers[S.sel.i].w = nw;
  }
  draw();
});
cv.addEventListener('pointerup', () => drag = null);

/* ---------- 색상 / 글꼴 ---------- */
PALETTE.forEach(c => {
  const i = document.createElement('i'); i.style.background = c;
  i.onclick = () => {
    if (S.sel && S.sel.t === 'item') S.items[S.sel.i].color = c;
    else S.lineColor = c;
    draw();
  };
  $('#palette').appendChild(i);
});
const pickWrap = document.createElement('label');   // 직접 고르기 (무지개 버튼)
pickWrap.className = 'pick'; pickWrap.title = '색 직접 고르기';
const pick = document.createElement('input');
pick.type = 'color'; pick.value = '#3A3A3A';
const dot = document.createElement('b');
pick.oninput = () => {
  dot.style.background = pick.value;
  if (S.sel && S.sel.t === 'item') S.items[S.sel.i].color = pick.value; else S.lineColor = pick.value;
  draw();
};
pickWrap.append(pick, dot);
$('#palette').appendChild(pickWrap);
[['#fontsTable', 'fontTable', 'OkDandan'], ['#fontsBubble', 'fontBubble', 'Pretendard']].forEach(([sel, key, def]) => {
  FONTS.forEach(([id, label]) => {
    const b = document.createElement('button'); b.textContent = label; b.style.fontFamily = `"${id}", Pretendard`;
    if (id === def) b.classList.add('sel');
    b.onclick = async () => {
      document.querySelectorAll(sel + ' button').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
      S[key] = id;
      try { await document.fonts.load(`16px "${id}"`); } catch (e) { }
      if (!document.fonts.check(`16px "${id}"`) && id !== 'Pretendard') toast(`${label} 폰트 파일이 없어요. fonts/ 폴더에 넣어 주세요.`);
      draw();
    };
    document.querySelector(sel).appendChild(b);
  });
});

const ieBox = $('#itemEdit'), ieN = $('#ieName'), ieR = $('#ieRoom');
function syncItemEdit() {
  const on = S.sel && S.sel.t === 'item';
  ieBox.hidden = !on;
  if (on) { const it = S.items[S.sel.i]; ieN.value = it.name || ''; ieR.value = it.room || ''; }
}
ieN.oninput = () => { if (S.sel && S.sel.t === 'item') { S.items[S.sel.i].name = ieN.value; draw(); } };
ieR.oninput = () => { if (S.sel && S.sel.t === 'item') { S.items[S.sel.i].room = ieR.value; draw(); } };

$('#ttFs').oninput = e => { S.ttFs = +e.target.value; draw(); };
$('#ttLw').oninput = e => { S.ttLw = +e.target.value; draw(); };
$('#txFw').oninput = e => { S.txFw = +e.target.value; draw(); };
$('#bbLw').oninput = e => { S.bbLw = +e.target.value; draw(); };

/* ---------- 완료 / 저장 ---------- */
$('#doneBtn').onclick = () => {
  S.done = !S.done;
  $('#doneBtn').classList.toggle('on', S.done);
  $('#doneHint').textContent = S.done ? '시간표를 드래그해 옮기고, 오른쪽 아래 점으로 크기를 조절하세요.' : '완료 버튼을 누른 후 시간표 사이즈를 조절해 보세요.';
  S.sel = S.done ? { t: 'table' } : null; syncTouch(); draw();
};
$('#saveBtn').onclick = () => {
  const keep = S.sel; S.sel = null;
  const pw = cv.width, ph = cv.height, sw = cv.style.width, sh = cv.style.height;
  cv.width = S.device[1]; cv.height = S.device[2];   // 저장은 기기 해상도 그대로
  draw();
  cv.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = '시간표배경화면.jpg'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    cv.width = pw; cv.height = ph; cv.style.width = sw; cv.style.height = sh;
    S.sel = keep; draw(); toast('저장했어요!');
  }, 'image/jpeg', .95);
};

/* ---------- 초기화 ---------- */
(async () => {
  S.bgImg = await loadImg(S.bgSrc).catch(() => null);
  await Promise.all(FONTS.map(f => document.fonts.load(`16px "${f[0]}"`).catch(() => { })));
  await document.fonts.ready;
  fitStage(); draw();
})();
