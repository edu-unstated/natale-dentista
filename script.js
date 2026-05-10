const grid = document.getElementById('grid');
const tagsBar = document.getElementById('tags-bar');

const lightbox   = document.getElementById('lightbox');
const lbImg      = document.getElementById('lb-img');
const lbId       = document.getElementById('lb-id');
const lbTagsEl   = document.getElementById('lb-tags');
const lbClose    = document.getElementById('lb-close');
const lbPrev     = document.getElementById('lb-prev');
const lbNext     = document.getElementById('lb-next');
const lbBackdrop = document.getElementById('lb-backdrop');

let items = [];          // original data from JSON
let displayItems = [];
let activeTags = new Set();
let activeTagFilter = null; // single tag selected from cat-list for opacity dimming
let lbIndex = -1;        // current index in filteredItems() array
let activeMacro = null;  // currently selected macro category (string)
let macroFilterIds = null; // Set of ids to show when a macro is active

// explicit mapping macro -> ids
const macroToIds = {
  "strumenti": [8,12,14,28,29,31,18,21,27,35,36,41,23,24,31,32,33,34,17,22,25,26,30,36].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b),
  "radiografie": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,37,39].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b),
  "studio": [23,24,9,13,16,18,20,22,25,26,27,28,29,35,36,37,38,39,40,41].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b)
};

// ── Load data ──────────────────────────────────────────────────────────────
async function loadData() {
  // fetch data from data.json
  const res = await fetch('data.json');
  // parse the json
  const data = await res.json();
  // set the items and display items
  items = data.items;
  // macro categories (optional in data.json)
  window.macroCategories = data.macroCategories || {};
  displayItems = [...items];
  buildCategoriesList();
  syncMacroStates();
  render();
}

function syncMacroStates() {
  const macros = window.macroCategories || {};
  const container = document.getElementById('categories-list');
  if (!container) return;
  container.querySelectorAll('.cat-section').forEach(sec => {
    const title = sec.querySelector('.cat-title');
    const displayName = title ? title.textContent : null;
    const m = displayName ? Object.keys(macros).find(k => k.toLowerCase() === displayName.toLowerCase()) : null;
    const tlist = m ? (macros[m] || []) : [];
    const isActive = tlist.some(t => activeTags.has(t));
    if (title) title.classList.toggle('active', isActive);
  });
}

// ── Collect all unique tags ───────────────────────────────────────────────
function allTags() {
  const set = new Set();
  items.forEach(item => item.tags.forEach(t => set.add(t)));
  return [...set].sort();
}

// ── Build the filter tags bar ─────────────────────────────────────────────
function buildCategoriesList() {
  const container = document.getElementById('categories-list');
  if (!container) return;
  container.innerHTML = '';
  const macros = window.macroCategories || {};
  // desired display order to match the reference image (lowercase)
  const desiredOrder = ['strumenti', 'radiografie', 'studio'];
  // map available macro keys by lowercase -> original
  const lowerMap = {};
  Object.keys(macros).forEach(k => { lowerMap[k.toLowerCase()] = k; });
  // build ordered list of original keys following desiredOrder, fall back to remaining keys
  const keys = [];
  desiredOrder.forEach(k => { if (k in lowerMap) keys.push(lowerMap[k]); });
  Object.keys(macros).forEach(k => { if (!keys.includes(k)) keys.push(k); });

  keys.forEach(m => {
    const section = document.createElement('div');
    section.className = 'cat-section';
    const h = document.createElement('div');
    h.className = 'cat-title';
    h.textContent = capitalize(m);
    section.appendChild(h);

    const list = document.createElement('div');
    list.className = 'cat-list';
    (macros[m] || []).forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'tag-btn';
      btn.textContent = tag;
      btn.dataset.tag = tag;
      btn.addEventListener('click', () => toggleCatTag(tag));
      list.appendChild(btn);
    });
    section.appendChild(list);
    // macro click toggles the macro filter
    h.addEventListener('click', () => toggleMacro(m));
    container.appendChild(section);
  });
  // sync states
  updateTagButtonStates();
}

function capitalize(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

// toggle a macro: selects/deselects all tags that belong to that macro
// TOGGLE MACROS E TAGS
function toggleMacro(macro) {
  const macros = window.macroCategories || {};
  // resolve macro key case-insensitively against macros object
  const canonical = Object.keys(macros).find(k => k.toLowerCase() === String(macro).toLowerCase()) || macro;
  // toggle behavior: if clicking same macro, deactivate
  if (activeMacro === canonical) {
    activeMacro = null;
    macroFilterIds = null;
    // restore display items to full set
    displayItems = [...items];
  } else {
    activeMacro = canonical;
    // prefer explicit IDs mapping from macroToIds (keys in macroToIds are lowercase)
    const ids = macroToIds[canonical.toLowerCase()] || [];
    if (ids && ids.length > 0) {
      macroFilterIds = new Set(ids);
    } else if (macros[canonical]) {
      const allowed = new Set(macros[canonical]);
      macroFilterIds = new Set(items.filter(it => it.tags.some(t => allowed.has(t))).map(it => it.id));
    } else {
      macroFilterIds = null;
    }
    // set displayItems to only items in macroFilterIds
    displayItems = items.filter(it => macroFilterIds ? macroFilterIds.has(it.id) : true);
    // remove any active tags that are not part of this macro (they would be dimmed)
    const allowedTags = new Set(macros[canonical] || []);
    activeTags.forEach(t => { if (!allowedTags.has(t)) activeTags.delete(t); });
  }

  // update UI states
  // macro buttons
  const macroBar = document.getElementById('macro-bar');
  if (macroBar) {
    macroBar.querySelectorAll('.macro-btn').forEach(b => b.classList.toggle('active', b.dataset.macro === activeMacro));
  }

  // tag buttons: mark active and dim those not in macro
  updateTagButtonStates();

  // update macro title underline state in the left categories list
  const container = document.getElementById('categories-list');
  if (container) {
    container.querySelectorAll('.cat-title').forEach(titleEl => {
      const displayName = titleEl.textContent || '';
      const key = Object.keys(macros).find(k => k.toLowerCase() === displayName.toLowerCase());
      titleEl.classList.toggle('macro-active', Boolean(activeMacro && key && key.toLowerCase() === String(activeMacro).toLowerCase()));
    });
  }

  render();
}

function updateTagButtonStates() {
  const macro = activeMacro;
  const macros = window.macroCategories || {};
  const allowed = macro ? new Set(macros[macro] || []) : null;
  const container = document.getElementById('categories-list');
  if (!container) return;
  container.querySelectorAll('.tag-btn').forEach(btn => {
    const tag = btn.dataset.tag;
    const isActive = activeTags.has(tag);
    const isFilter = activeTagFilter === tag;
    // when a macro is active, dim all tags (40%) except the ones explicitly selected
    if (macro) {
      // consider either the activeTags (global filters) or the local activeTagFilter
      const shouldBeUndimmed = isActive || isFilter;
      btn.classList.toggle('active', shouldBeUndimmed);
      btn.classList.toggle('dimmed', !shouldBeUndimmed);
    } else {
      // no macro: restore normal state (no forced dimming)
      btn.classList.toggle('active', isActive);
      btn.classList.remove('dimmed');
    }
  });
}

// ── Toggle tag from cat-list (opacity-based, no re-render) ───────────────
function toggleCatTag(tag) {
  activeTagFilter = activeTagFilter === tag ? null : tag;
  // update button active state
  const container = document.getElementById('categories-list');
  if (container) {
    container.querySelectorAll('.tag-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tag === activeTagFilter);
    });
  }
  applyTagOpacity();
}

function applyTagOpacity() {
  document.querySelectorAll('.card').forEach(card => {
    if (!activeTagFilter) {
      card.style.opacity = '';
    } else {
      const idx = parseInt(card.dataset.index ?? -1);
      const visible = filteredItems();
      const item = visible[idx];
      const matches = item && item.tags.includes(activeTagFilter);
      card.style.opacity = matches ? '1' : '0.3';
    }
  });
}

// ── Toggle a filter tag ───────────────────────────────────────────────────
function toggleTag(tag) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
  } else {
    activeTags.add(tag);
  }
  // sync button states
  tagsBar.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.toggle('active', activeTags.has(btn.dataset.tag));
  });
  render();
}

// ── Filter logic ──────────────────────────────────────────────────────────
function filteredItems() {
  // filter the items by active tags only
  return displayItems.filter(item => {
    const matchesTags = activeTags.size === 0 || [...activeTags].every(t => item.tags.includes(t));
    return matchesTags;
  });
}

// ── Render cards ──────────────────────────────────────────────────────────
function render() {

  // get the visible items
  const visible = filteredItems();

  // results info removed from UI; no-op here

  // clear the grid
  grid.innerHTML = '';

  // if there are no visible items, show the empty state
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessun risultato.';
    grid.appendChild(empty);
    return;
  }

  // loop through the visible items and create a card for each item
  visible.forEach((item, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.cursor = 'zoom-in';
    card.dataset.index = i;

    // image
    // create an image element
    const img = document.createElement('img');
    // set the class name
    img.className = 'card-img';
    // set the source
    img.src = item.src;
    // set the alt text
    img.alt = `Item ${item.id}`;
    // set the loading attribute
    img.loading = 'lazy';
  // append the image to the card
  card.appendChild(img);

  // add a data-delay to stagger animations slightly
  img.style.transitionDelay = `${(i % 6) * 40}ms`;

    // body
    const body = document.createElement('div');
    body.className = 'card-body';

    // id
    const idEl = document.createElement('span');
    idEl.className = 'card-id';
    idEl.textContent = `#${String(item.id).padStart(2, '0')}`;
    body.appendChild(idEl);

    const desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = item.description;
    // body.appendChild(desc);

    const tagsEl = document.createElement('div');
    tagsEl.className = 'card-tags';
    item.tags.forEach(tag => {
      const t = document.createElement('span');
      t.className = 'card-tag' + (activeTags.has(tag) ? ' highlight' : '');
      t.textContent = tag;
      t.addEventListener('click', e => { e.stopPropagation(); toggleTag(tag); });
      tagsEl.appendChild(t);
    });
    body.appendChild(tagsEl);

    card.addEventListener('click', () => openLightbox(i));

    card.appendChild(body);
    grid.appendChild(card);
  });

  applyTagOpacity();

  // observe images for scroll-in animation
  const imgs = document.querySelectorAll('.card-img');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(ent => {
      if (ent.isIntersecting) {
        ent.target.classList.add('in-view');
      }
    });
  }, { threshold: 0.12 });
  imgs.forEach(img => observer.observe(img));

  // build/update thumbnail rail for visible items
  const thumbRail = document.getElementById('thumb-rail');
  if (thumbRail) {
    thumbRail.innerHTML = '';

    const col1 = document.createElement('div');
    const col2 = document.createElement('div');
    col1.className = 'thumb-col';
    col2.className = 'thumb-col';

    const mid = Math.ceil(visible.length / 2);

    visible.forEach((item, idx) => {
      const t = document.createElement('img');
      t.className = 'thumb';
      t.src = item.src;
      t.alt = `#${item.id}`;
      t.dataset.index = idx;
      t.addEventListener('click', () => {
        const cards = document.querySelectorAll('.card');
        const card = cards[idx];
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      (idx < mid ? col1 : col2).appendChild(t);
    });

    thumbRail.appendChild(col1);
    thumbRail.appendChild(col2);

    // highlight active thumbs based on which cards are in viewport
    const visibleCardIndices = new Set();
    const cardObserver = new IntersectionObserver((entries) => {
      const cards = Array.from(document.querySelectorAll('.card'));
      entries.forEach(ent => {
        const index = cards.indexOf(ent.target);
        if (index === -1) return;
        if (ent.isIntersecting) visibleCardIndices.add(index);
        else visibleCardIndices.delete(index);
      });

      const allThumbs = Array.from(thumbRail.querySelectorAll('.thumb'));
      allThumbs.forEach((th, i) => th.classList.toggle('active', visibleCardIndices.has(i)));

      // scroll rail to keep first active thumb visible
      if (visibleCardIndices.size > 0) {
        const firstActive = Math.min(...visibleCardIndices);
        const activeTh = allThumbs[firstActive];
        if (activeTh) {
          const railRect = thumbRail.getBoundingClientRect();
          const thRect = activeTh.getBoundingClientRect();
          const thTopInRail = thRect.top - railRect.top + thumbRail.scrollTop;
          const thBottomInRail = thTopInRail + thRect.height;
          if (thBottomInRail > thumbRail.scrollTop + thumbRail.clientHeight) {
            thumbRail.scrollTop = thBottomInRail - thumbRail.clientHeight + 8;
          } else if (thTopInRail < thumbRail.scrollTop) {
            thumbRail.scrollTop = thTopInRail - 8;
          }
        }
      }
    }, { threshold: 0.5 });
    document.querySelectorAll('.card').forEach(c => cardObserver.observe(c));
  }
}

// ── Lightbox ──────────────────────────────────────────────────────────────
function openLightbox(index) {
  // get the visible items
  const visible = filteredItems();
  // set the current index
  lbIndex = index;
  // get the item
  const item = visible[lbIndex];

  lbImg.src = item.src;
  // set the alt text
  lbImg.alt = `Item ${item.id}`;
  // set the id
  lbId.textContent = `#${String(item.id).padStart(2, '0')}`;

  lbTagsEl.innerHTML = '';
  // loop through the tags and create a span for each tag
  item.tags.forEach(tag => {
    const t = document.createElement('span');
    t.className = 'card-tag' + (activeTags.has(tag) ? ' highlight' : '');
    t.textContent = tag;
    t.addEventListener('click', () => { toggleTag(tag); closeLightbox(); });
    lbTagsEl.appendChild(t);
  });


  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  lbImg.src = '';
}

function navigateLightbox(dir) {
  const visible = filteredItems();

  // calcola il prossimo indice
  let next = lbIndex + dir;

  // se si va oltre l'ultimo, torna al primo
  if (next >= visible.length) next = 0;

  // se si va prima del primo, salta all'ultimo
  if (next < 0) next = visible.length - 1;

  openLightbox(next);
}

lbClose.addEventListener('click', closeLightbox);
lbBackdrop.addEventListener('click', closeLightbox);
lbPrev.addEventListener('click', () => navigateLightbox(-1));
lbNext.addEventListener('click', () => navigateLightbox(+1));

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'ArrowLeft')  navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(+1);
  if (e.key === 'Escape')     closeLightbox();
});

// ── Init ──────────────────────────────────────────────────────────────────
loadData();
