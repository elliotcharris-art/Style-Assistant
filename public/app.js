/* ── Categories (head to toe order) ────────────────────────────── */
const CATEGORIES = [
  { id: 'headwear', label: 'Headwear' },
  { id: 'top',      label: 'Top'      },
  { id: 'bottom',   label: 'Bottom'   },
  { id: 'shoes',    label: 'Shoes'    },
];

/* ── State ─────────────────────────────────────────────────────── */
let lookbookFile    = null;
let lookbookDataUrl = null;
const wardrobe = { headwear: [], top: [], bottom: [], shoes: [] };

/* ── Helpers ───────────────────────────────────────────────────── */
function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function dataUrlToBase64(dataUrl) { return dataUrl.split(',')[1]; }

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function getMediaType(file) { return file.type || 'image/jpeg'; }

async function callClaude(messages) {
  const resp = await fetch('/api/claude', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ messages }),
  });
  return resp.json();
}

/* ── Background removal ────────────────────────────────────────── */
async function analyseAndRemoveBg(item, category) {
  item.processing = true;
  renderGrid(category);

  try {
    const b64 = item.file ? await fileToBase64(item.file) : dataUrlToBase64(item.dataUrl);
    const mt  = item.file ? getMediaType(item.file) : 'image/jpeg';

    const data = await callClaude([{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mt, data: b64 } },
        {
          type: 'text',
          text: 'Describe this clothing item. Return ONLY valid JSON, no markdown:\n{"item_description":"brief description","dominant_colour":"main colour","garment_type":"e.g. cap / shirt / trousers / sneakers"}',
        },
      ],
    }]);

    const text   = (data.content || []).map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    item.description    = parsed.item_description;
    item.garmentType    = parsed.garment_type;
    item.dominantColour = parsed.dominant_colour;
  } catch (_) {
    item.description = 'Clothing item';
  }

  await canvasRemoveBg(item);
  item.processing = false;
  renderGrid(category);
  checkReady();
}

function canvasRemoveBg(item) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      const w = canvas.width;
      const h = canvas.height;

      function px(x, y) { const i = (y * w + x) * 4; return [d[i], d[i+1], d[i+2]]; }

      const corners = [
        px(0,0), px(w-1,0), px(0,h-1), px(w-1,h-1),
        px(Math.floor(w/2), 0), px(0, Math.floor(h/2)),
      ];

      const bg = corners.reduce(
        (acc, c) => [acc[0]+c[0]/corners.length, acc[1]+c[1]/corners.length, acc[2]+c[2]/corners.length],
        [0, 0, 0]
      );

      function dist(r, g, b) {
        return Math.sqrt((r-bg[0])**2 + (g-bg[1])**2 + (b-bg[2])**2);
      }

      const threshold = Math.max(30, Math.min(65, 25 + Math.max(...corners.map(c => dist(c[0],c[1],c[2]))) * 1.4));

      const visited = new Uint8Array(w * h);
      const queue   = [];

      function enqueue(x, y) {
        if (x < 0 || x >= w || y < 0 || y >= h) return;
        const idx = y * w + x;
        if (visited[idx]) return;
        const pi = idx * 4;
        if (dist(d[pi], d[pi+1], d[pi+2]) < threshold) { visited[idx] = 1; queue.push(idx); }
      }

      for (let x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h-1); }
      for (let y = 0; y < h; y++) { enqueue(0, y); enqueue(w-1, y); }

      let qi = 0;
      while (qi < queue.length) {
        const idx = queue[qi++];
        const x = idx % w, y = Math.floor(idx / w);
        enqueue(x+1,y); enqueue(x-1,y); enqueue(x,y+1); enqueue(x,y-1);
      }

      for (let i = 0; i < w * h; i++) {
        if (visited[i]) {
          d[i*4+3] = 0;
        } else {
          const x = i % w, y = Math.floor(i / w);
          const onEdge = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]
            .some(([nx,ny]) => nx>=0 && nx<w && ny>=0 && ny<h && visited[ny*w+nx]);
          if (onEdge) d[i*4+3] = Math.round(d[i*4+3] * 0.65);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      item.processedDataUrl = canvas.toDataURL('image/png');
      resolve();
    };
    img.src = item.dataUrl;
  });
}

/* ── Render a single category grid ─────────────────────────────── */
function renderGrid(categoryId) {
  const items = wardrobe[categoryId];
  const grid  = document.getElementById('grid-' + categoryId);
  grid.innerHTML = '';

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'wardrobe-item';
    div.setAttribute('role', 'listitem');
    const src = item.processedDataUrl || item.dataUrl;
    div.innerHTML =
      '<img src="' + src + '" alt="' + categoryId + ' item ' + (idx+1) + '" />' +
      (item.processing ? '<div class="processing-overlay"><div class="mini-spinner"></div><p class="processing-label">Removing bg\u2026</p></div>' : '') +
      (!item.processing ? '<button class="remove-btn" data-cat="' + categoryId + '" data-idx="' + idx + '" aria-label="Remove item">\xd7</button>' : '');
    grid.appendChild(div);
  });

  const add = document.createElement('div');
  add.className = 'add-more';
  add.setAttribute('role', 'button');
  add.setAttribute('aria-label', 'Add ' + categoryId + ' items');
  add.innerHTML = '<input type="file" accept="image/*" multiple /><i class="ti ti-plus" aria-hidden="true"></i>';
  add.querySelector('input').addEventListener('change', function(e) { handleFiles(e, categoryId); });
  grid.appendChild(add);

  grid.querySelectorAll('.remove-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var cat = btn.dataset.cat;
      wardrobe[cat].splice(parseInt(btn.dataset.idx), 1);
      renderGrid(cat);
      updateTotalCount();
      checkReady();
    });
  });

  document.getElementById('count-' + categoryId).textContent = items.length;
}

function updateTotalCount() {
  const total = CATEGORIES.reduce(function(s, c) { return s + wardrobe[c.id].length; }, 0);
  document.getElementById('wardrobe-count').textContent = total + ' item' + (total !== 1 ? 's' : '');
}

async function handleFiles(e, categoryId) {
  const files = Array.from(e.target.files);
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    const item = { file, dataUrl, processedDataUrl: null, processing: false, description: null, garmentType: null, dominantColour: null };
    wardrobe[categoryId].push(item);
    analyseAndRemoveBg(item, categoryId);
  }
  renderGrid(categoryId);
  updateTotalCount();
  checkReady();
}

/* ── Lookbook ──────────────────────────────────────────────────── */
async function setLookbook(file) {
  lookbookFile    = file;
  lookbookDataUrl = await fileToDataUrl(file);
  document.getElementById('lookbook-drop').style.display   = 'none';
  document.getElementById('lookbook-loaded').style.display = 'flex';
  document.getElementById('lookbook-thumb').src = lookbookDataUrl;
  checkReady();
}

document.getElementById('lookbook-input').addEventListener('change', async function(e) {
  if (e.target.files[0]) await setLookbook(e.target.files[0]);
});

document.getElementById('lookbook-change').addEventListener('change', async function(e) {
  if (e.target.files[0]) await setLookbook(e.target.files[0]);
});

document.addEventListener('paste', async function(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) { await setLookbook(item.getAsFile()); break; }
  }
});

/* ── Ready check ───────────────────────────────────────────────── */
function checkReady() {
  const totalItems   = CATEGORIES.reduce(function(s, c) { return s + wardrobe[c.id].length; }, 0);
  const allProcessed = CATEGORIES.every(function(c) { return wardrobe[c.id].every(function(i) { return !i.processing; }); });
  document.getElementById('generate-btn').disabled = !(lookbookDataUrl && totalItems > 0 && allProcessed);
}

/* ── Generate fit ──────────────────────────────────────────────── */
document.getElementById('generate-btn').addEventListener('click', generateFit);

async function generateFit() {
  const resultsPanel = document.getElementById('results-panel');
  resultsPanel.style.display = 'block';
  document.getElementById('results-loading').style.display  = 'flex';
  document.getElementById('results-content').style.display  = 'none';
  document.getElementById('generate-btn').disabled = true;
  resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    setLoadingText('Analysing the lookbook outfit\u2026');

    const lookbookB64 = await fileToBase64(lookbookFile);
    const lookbookMt  = getMediaType(lookbookFile);

    // Build flat indexed list preserving category info
    const allItems = [];
    CATEGORIES.forEach(function(cat) {
      wardrobe[cat.id].forEach(function(item) {
        allItems.push({ item: item, category: cat.id, categoryLabel: cat.label });
      });
    });

    const wardrobeDescriptions = allItems
      .map(function(entry, i) {
        return 'Item ' + i + ' [' + entry.categoryLabel + ']: ' + (entry.item.garmentType || entry.categoryLabel) + ' \u2014 ' + (entry.item.description || 'no description') + ' (' + (entry.item.dominantColour || 'unknown') + ')';
      })
      .join('\n');

    setLoadingText('Matching to your wardrobe\u2026');

    const wardrobeImageBlocks = await Promise.all(
      allItems.map(async function(entry) {
        const item = entry.item;
        const b64  = item.processedDataUrl ? dataUrlToBase64(item.processedDataUrl) : await fileToBase64(item.file);
        const mt   = item.processedDataUrl ? 'image/png' : getMediaType(item.file);
        return { type: 'image', source: { type: 'base64', media_type: mt, data: b64 } };
      })
    );

    const data = await callClaude([{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'You are an expert fashion stylist. I will show you a lookbook reference and my wardrobe items.\n\nEach item is pre-categorised. Your task:\n- Analyse the lookbook outfit (silhouette, colour palette, vibe)\n- For each category that appears in the lookbook, pick the single best matching item from that category in my wardrobe\n- Return matches in this exact order: Headwear, Top, Bottom, Shoes (omit a category only if the lookbook does not feature it OR there is no suitable item)\n- item_index must be the global index (0 to ' + (allItems.length - 1) + ') from the descriptions below\n- category field must be exactly one of: "Headwear", "Top", "Bottom", "Shoes"\n\nWardrobe items:\n' + wardrobeDescriptions + '\n\nReturn ONLY valid JSON, no markdown, no preamble:\n{\n  "lookbook_vibe": "3 word aesthetic",\n  "overall_match_pct": 80,\n  "stylist_note": "One sentence personalised styling tip",\n  "matches": [\n    {\n      "category": "Top",\n      "item_index": 2,\n      "reason": "Short reason (10-15 words)",\n      "match_pct": 82\n    }\n  ]\n}',
        },
        { type: 'text', text: 'Lookbook reference:' },
        { type: 'image', source: { type: 'base64', media_type: lookbookMt, data: lookbookB64 } },
        { type: 'text', text: 'My ' + allItems.length + ' wardrobe items:' },
        ...wardrobeImageBlocks,
      ],
    }]);

    const raw    = (data.content || []).map(function(b) { return b.text || ''; }).join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);

    const ORDER = ['Headwear', 'Top', 'Bottom', 'Shoes'];
    parsed.matches = (parsed.matches || []).sort(function(a, b) {
      return ORDER.indexOf(a.category) - ORDER.indexOf(b.category);
    });

    renderResults(parsed, allItems);
  } catch (err) {
    document.getElementById('results-loading').innerHTML =
      '<p style="color:#a08060;font-size:13px;text-align:center;padding:1rem;">Something went wrong \u2014 please try again.<br/><small style="color:#4a4540;margin-top:6px;display:block;">' + err.message + '</small></p>';
  }
}

function setLoadingText(msg) {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = msg;
}

/* ── Render results ─────────────────────────────────────────────── */
function renderResults(data, allItems) {
  document.getElementById('results-loading').style.display = 'none';
  document.getElementById('results-content').style.display = 'block';

  document.getElementById('match-pill').textContent =
    (data.overall_match_pct || '\u2014') + '% match \u00b7 ' + (data.lookbook_vibe || '');

  const board = document.getElementById('outfit-board');
  board.innerHTML = '';

  const refSlot = document.createElement('div');
  refSlot.className = 'outfit-slot';
  refSlot.setAttribute('role', 'listitem');
  refSlot.innerHTML =
    '<div class="outfit-slot-img is-lookbook"><img src="' + lookbookDataUrl + '" alt="Lookbook reference" /></div>' +
    '<div class="outfit-slot-category" style="color:var(--text-dim);">Inspiration</div>' +
    '<div class="outfit-slot-reason">Lookbook reference</div>';
  board.appendChild(refSlot);

  const arrow = document.createElement('div');
  arrow.className = 'divider-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.innerHTML = '<i class="ti ti-arrow-right"></i>';
  board.appendChild(arrow);

  (data.matches || []).forEach(function(match) {
    const entry = allItems[match.item_index];
    if (!entry) return;
    const item = entry.item;
    const src  = item.processedDataUrl || item.dataUrl;
    const slot = document.createElement('div');
    slot.className = 'outfit-slot';
    slot.setAttribute('role', 'listitem');
    slot.innerHTML =
      '<div class="outfit-slot-img"><img src="' + src + '" alt="' + match.category + '" /></div>' +
      '<div class="outfit-slot-category">' + match.category + '</div>' +
      '<div class="outfit-slot-reason">' + match.reason + '</div>' +
      '<div class="match-bar"><div class="match-bar-fill" style="width:' + (match.match_pct || 70) + '%"></div></div>';
    board.appendChild(slot);
  });

  document.getElementById('stylist-note').textContent = '"' + (data.stylist_note || '') + '"';
  document.getElementById('generate-btn').disabled = false;
}

/* ── Reset ──────────────────────────────────────────────────────── */
document.getElementById('reset-btn').addEventListener('click', function() {
  document.getElementById('results-panel').style.display = 'none';
  document.getElementById('generate-btn').disabled = false;
});

/* ── Init ───────────────────────────────────────────────────────── */
CATEGORIES.forEach(function(c) { renderGrid(c.id); });
updateTotalCount();
