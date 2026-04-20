const PDFJS_VERSION = '4.3.136';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host {
    display: block;
    width: 100%;
    height: 100%;
    --bg: #1a1a1a;
    --surface: #2c2c2c;
    --paper: #f5f0e8;
    --accent-light: #c0392b;
    --accent: #8b1a1a;
    --toolbar-h: 52px;
    --shadow: 0 8px 32px rgba(0,0,0,0.6);
    font-family: Georgia, 'Times New Roman', serif;
    color: #e0e0e0;
    background: var(--bg);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  #root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--bg);
    overflow: hidden;
  }

  /* ── Toolbar ── */
  #toolbar {
    flex: 0 0 var(--toolbar-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 12px;
    background: var(--surface);
    border-bottom: 1px solid #444;
  }

  .tb-group { display: flex; align-items: center; gap: 6px; }

  #doc-title {
    flex: 1;
    text-align: center;
    font-size: 13px;
    color: #ccc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  button {
    background: none;
    border: 1px solid #555;
    color: #ddd;
    border-radius: 4px;
    padding: 5px 9px;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    transition: background 0.15s, border-color 0.15s;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  button:hover, button:active { background: #444; border-color: #888; }
  button:disabled { opacity: 0.35; cursor: default; }

  #page-info, #zoom-display {
    font-size: 12px;
    white-space: nowrap;
    min-width: 56px;
    text-align: center;
    color: #aaa;
  }

  /* ── Scroll area ── */
  #viewport {
    flex: 1;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--bg);
    padding: 16px 0 32px;
    cursor: grab;
  }
  #viewport.dragging { cursor: grabbing; user-select: none; }

  #page-wrapper {
    display: flex;
    justify-content: center;
    min-width: min-content;
    padding: 0 12px;
  }

  #page-inner {
    box-shadow: var(--shadow);
    flex-shrink: 0;
  }

  canvas {
    display: block;
    background: var(--paper);
  }

  /* ── Status overlay ── */
  #status {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    pointer-events: none;
  }

  .spinner {
    width: 36px; height: 36px;
    border: 3px solid #444;
    border-top-color: var(--accent-light);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  #status-text { font-size: 13px; color: #aaa; }

  #error-box {
    display: none;
    background: #3a1010;
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: 14px 20px;
    max-width: 300px;
    text-align: center;
    font-size: 13px;
    line-height: 1.6;
    pointer-events: auto;
  }

  @media (max-width: 480px) {
    :host { --toolbar-h: 46px; }
    #doc-title { display: none; }
    #viewport { padding: 8px 0 24px; }
    #page-wrapper { padding: 0 6px; }
  }
</style>

<div id="root">
  <div id="toolbar">
    <div class="tb-group">
      <button id="btn-prev" disabled>&#8249;</button>
      <button id="btn-next" disabled>&#8250;</button>
      <span id="page-info">— / —</span>
    </div>
    <span id="doc-title">Cargando…</span>
    <div class="tb-group">
      <button id="btn-zoom-out" disabled>&#8722;</button>
      <span id="zoom-display">100%</span>
      <button id="btn-zoom-in" disabled>&#43;</button>
      <button id="btn-fit" disabled>&#8596;</button>
    </div>
  </div>

  <div id="viewport">
    <div id="status">
      <div class="spinner" id="spinner"></div>
      <span id="status-text">Cargando PDF…</span>
      <div id="error-box"></div>
    </div>
    <div id="page-wrapper" style="display:none">
      <div id="page-inner">
        <canvas id="pdf-canvas"></canvas>
      </div>
    </div>
  </div>
</div>
`;

class PdfViewer extends HTMLElement {
  static get observedAttributes() { return ['src', 'title']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

    this._pdfDoc     = null;
    this._page       = 1;
    this._total      = 0;
    this._scale      = 1;
    this._fitScale   = 1;
    this._rendering  = false;
    this._pending    = null;
    this._pdfjsLib   = null;

    this._$ = id => this.shadowRoot.getElementById(id);
  }

  connectedCallback() {
    this._bindEvents();
    if (this.hasAttribute('src')) this._load(this.getAttribute('src'));
  }

  attributeChangedCallback(name, _old, val) {
    if (name === 'src' && this.isConnected) this._load(val);
    if (name === 'title' && this._$('doc-title')) this._$('doc-title').textContent = val || 'Visor PDF';
  }

  /* ── PDF.js lazy import ── */
  async _getPdfjs() {
    if (this._pdfjsLib) return this._pdfjsLib;
    const mod = await import(`${PDFJS_CDN}/pdf.min.mjs`);
    mod.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
    this._pdfjsLib = mod;
    return mod;
  }

  /* ── Load ── */
  async _load(url) {
    if (!url) return;

    // Reset
    this._pdfDoc = null;
    this._page = 1;
    this._$('page-wrapper').style.display = 'none';
    this._$('status').style.display = 'flex';
    this._$('spinner').style.display = 'block';
    this._$('status-text').style.display = 'block';
    this._$('status-text').textContent = 'Cargando PDF…';
    this._$('error-box').style.display = 'none';
    ['btn-prev','btn-next','btn-zoom-in','btn-zoom-out','btn-fit']
      .forEach(id => this._$(id).disabled = true);

    try {
      const pdfjsLib = await this._getPdfjs();

      const task = pdfjsLib.getDocument({
        url,
        cMapUrl: `${PDFJS_CDN}/cmaps/`,
        cMapPacked: true,
      });

      task.onProgress = ({ loaded, total }) => {
        if (total) {
          this._$('status-text').textContent =
            `Cargando… ${Math.round(loaded / total * 100)}%`;
        }
      };

      this._pdfDoc = await task.promise;
      this._total  = this._pdfDoc.numPages;

      const firstVp = (await this._pdfDoc.getPage(1)).getViewport({ scale: 1 });
      this._fitScale = this._computeFit(firstVp);
      this._scale    = this._fitScale;

      const attrTitle = this.getAttribute('title');
      const filename = url.split('/').pop().replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
      this._$('doc-title').textContent = attrTitle || filename || 'Visor PDF';

      this._$('status').style.display = 'none';
      this._$('page-wrapper').style.display = 'flex';
      ['btn-next','btn-zoom-in','btn-zoom-out','btn-fit']
        .forEach(id => this._$(id).disabled = false);

      await this._render(1);

    } catch (err) {
      this._$('spinner').style.display = 'none';
      this._$('status-text').style.display = 'none';
      const box = this._$('error-box');
      box.style.display = 'block';
      box.innerHTML = `<strong>No se pudo cargar el PDF</strong><br><br>${err.message}`;
      console.error('[pdf-viewer]', err);
    }
  }

  /* ── Render ── */
  async _render(num) {
    if (this._rendering) { this._pending = num; return; }
    this._rendering = true;

    const page     = await this._pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: this._scale });
    const dpr      = window.devicePixelRatio || 1;
    const canvas   = this._$('pdf-canvas');
    const ctx      = canvas.getContext('2d');

    canvas.width        = Math.floor(viewport.width  * dpr);
    canvas.height       = Math.floor(viewport.height * dpr);
    canvas.style.width  = viewport.width  + 'px';
    canvas.style.height = viewport.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    await page.render({ canvasContext: ctx, viewport }).promise;

    this._rendering = false;
    this._updateUI();

    if (this._pending !== null) {
      const next = this._pending;
      this._pending = null;
      this._page = next;
      await this._render(next);
    }
  }

  async _goTo(num) {
    if (!this._pdfDoc || num < 1 || num > this._total) return;
    this._page = num;
    this._$('viewport').scrollTo({ top: 0, behavior: 'smooth' });
    await this._render(num);
  }

  _computeFit(viewport) {
    const vw = (this._$('viewport').clientWidth || window.innerWidth) - 24;
    return Math.min(1.5, vw / viewport.width);
  }

  _updateUI() {
    this._$('page-info').textContent   = `${this._page} / ${this._total}`;
    this._$('btn-prev').disabled       = this._page <= 1;
    this._$('btn-next').disabled       = this._page >= this._total;
    this._$('btn-zoom-in').disabled    = this._scale >= 3;
    this._$('btn-zoom-out').disabled   = this._scale <= 0.4;
    this._$('zoom-display').textContent =
      Math.round(this._scale / this._fitScale * 100) + '%';
  }

  /* ── Events ── */
  _bindEvents() {
    const $ = id => this._$(id);

    $('btn-prev').addEventListener('click', () => this._goTo(this._page - 1));
    $('btn-next').addEventListener('click', () => this._goTo(this._page + 1));

    $('btn-zoom-in').addEventListener('click', async () => {
      this._scale = Math.min(this._scale * 1.25, this._fitScale * 3);
      await this._render(this._page);
    });
    $('btn-zoom-out').addEventListener('click', async () => {
      this._scale = Math.max(this._scale / 1.25, this._fitScale * 0.4);
      await this._render(this._page);
    });
    $('btn-fit').addEventListener('click', async () => {
      const page = await this._pdfDoc.getPage(this._page);
      this._fitScale = this._computeFit(page.getViewport({ scale: 1 }));
      this._scale = this._fitScale;
      await this._render(this._page);
    });

    // Keyboard (only when focused inside the component)
    this.shadowRoot.addEventListener('keydown', e => {
      if (['ArrowRight','ArrowDown','PageDown'].includes(e.key)) this._goTo(this._page + 1);
      else if (['ArrowLeft','ArrowUp','PageUp'].includes(e.key))  this._goTo(this._page - 1);
    });

    // Touch swipe
    const vp = $('viewport');
    let tx = 0, ty = 0, tScrollX = 0;

    vp.addEventListener('touchstart', e => {
      tx = e.changedTouches[0].clientX;
      ty = e.changedTouches[0].clientY;
      tScrollX = vp.scrollLeft;
    }, { passive: true });

    vp.addEventListener('touchend', e => {
      if (Math.abs(vp.scrollLeft - tScrollX) > 8) return;
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 70) {
        if (dx < 0) this._goTo(this._page + 1);
        else        this._goTo(this._page - 1);
      }
    }, { passive: true });

    // Mouse drag pan
    let drag = false, mx = 0, my = 0, sl = 0, st = 0;
    vp.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      drag = true; mx = e.clientX; my = e.clientY; sl = vp.scrollLeft; st = vp.scrollTop;
      vp.classList.add('dragging');
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      vp.scrollLeft = sl - (e.clientX - mx);
      vp.scrollTop  = st - (e.clientY - my);
    });
    window.addEventListener('mouseup', () => { drag = false; vp.classList.remove('dragging'); });

    // Resize
    new ResizeObserver(async () => {
      if (!this._pdfDoc) return;
      const page = await this._pdfDoc.getPage(this._page);
      const newFit = this._computeFit(page.getViewport({ scale: 1 }));
      if (Math.abs(newFit - this._fitScale) > 0.01) {
        const ratio = this._scale / this._fitScale;
        this._fitScale = newFit;
        this._scale = this._fitScale * ratio;
        await this._render(this._page);
      }
    }).observe($('viewport'));
  }
}

customElements.define('pdf-viewer', PdfViewer);
