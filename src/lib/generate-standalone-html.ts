import type { PDFPageImage } from "./pdf-renderer";

/**
 * Generate a self-contained HTML flipbook file.
 * No external dependencies — works offline, on GitHub Pages, as a file, anywhere.
 */
export async function generateStandaloneHTML(
  pages: PDFPageImage[],
  fileName: string,
  _onProgress?: (current: number, total: number) => void
): Promise<string> {
  const pageW = 420;
  const pageH = 595;
  const numStrips = 18;

  // Build pages JSON — embed the data URLs directly
  const pagesJSON = JSON.stringify(
    pages.map((p) => ({
      w: p.width,
      h: p.height,
      src: p.dataUrl,
    }))
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(fileName)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{height:100%}
body{
  min-height:100%;display:flex;flex-direction:column;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:#fafaf9;color:#1c1917;
}
header{
  border-bottom:1px solid #e7e5e4;background:rgba(255,255,255,.85);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  position:sticky;top:0;z-index:50;
}
.header-inner{
  max-width:900px;margin:0 auto;padding:0 16px;height:52px;
  display:flex;align-items:center;gap:10px;
}
.header-icon{
  width:32px;height:32px;border-radius:8px;
  background:rgba(28,101,76,.1);display:flex;align-items:center;justify-content:center;
}
.header-icon svg{width:18px;height:18px;stroke:#1c654c;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.header-title{font-size:13px;font-weight:600;line-height:1.3}
.header-sub{font-size:11px;color:#78716c;line-height:1.3}

main{flex:1;display:flex;align-items:center;justify-content:center;padding:20px 10px}
.book-scene{perspective:2800px;display:flex;align-items:center;justify-content:center}
.book{
  display:flex;position:relative;
  transform-style:preserve-3d;
  transition:transform .2s;
}
.page-slot{
  width:${pageW}px;height:${pageH}px;position:relative;
  background:#fff;box-shadow:0 1px 8px rgba(0,0,0,.12),0 0 1px rgba(0,0,0,.08);
  overflow:hidden;
}
.page-slot img{width:100%;height:100%;object-fit:contain;display:block}
.spine{
  width:4px;min-height:${pageH}px;
  background:linear-gradient(90deg,#d6d3d1,#a8a29e 30%,#d6d3d1 70%,#a8a29e);
  box-shadow:2px 0 6px rgba(0,0,0,.15);flex-shrink:0;position:relative;z-index:2;
}

/* Curl overlay */
.curl-container{
  position:absolute;top:0;left:0;width:${pageW}px;height:${pageH}px;
  transform-style:preserve-3d;z-index:10;pointer-events:none;
}
.curl-strip{
  position:absolute;top:0;width:${Math.ceil(pageW / numStrips) + 1}px;height:${pageH}px;
  transform-style:preserve-3d;
}
.curl-face{
  position:absolute;top:0;width:100%;height:100%;
  backface-visibility:hidden;-webkit-backface-visibility:hidden;
  background-size:${pageW}px ${pageH}px;
}
.curl-front{transform-origin:0% 50%}
.curl-back{transform:rotateY(180deg);transform-origin:0% 50%}

/* Shadow overlays */
.curl-shadow{
  position:absolute;top:0;left:0;width:100%;height:100%;
  pointer-events:none;z-index:11;opacity:0;
}
.curl-highlight{
  position:absolute;top:0;left:0;width:100%;height:100%;
  pointer-events:none;z-index:12;opacity:0;
  background:linear-gradient(90deg,rgba(255,255,255,.4),transparent 60%);
}
.curl-edge{
  position:absolute;top:0;left:0;width:6px;height:100%;
  pointer-events:none;z-index:13;opacity:0;
  background:linear-gradient(90deg,rgba(0,0,0,.15),transparent);
}
.curl-drop{
  position:absolute;top:2px;left:0;width:100%;height:100%;
  pointer-events:none;z-index:5;opacity:0;
  box-shadow:0 0 25px 8px rgba(0,0,0,.2);
}

/* Controls */
.controls{
  max-width:900px;margin:0 auto;padding:12px 16px;
  display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;
}
.btn{
  display:inline-flex;align-items:center;gap:4px;
  padding:6px 12px;border:1px solid #d6d3d1;border-radius:6px;
  background:#fff;color:#44403c;font-size:12px;font-weight:500;
  cursor:pointer;transition:all .15s;user-select:none;
}
.btn:hover{background:#f5f5f4;border-color:#a8a29e}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.btn-primary{background:#1c654c;color:#fff;border-color:#1c654c}
.btn-primary:hover{background:#164d3a}
.page-info{font-size:12px;color:#78716c;min-width:80px;text-align:center}

/* Loading */
.loading{
  position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  background:#fafaf9;z-index:999;transition:opacity .4s;
}
.loading.hidden{opacity:0;pointer-events:none}
.spinner{
  width:40px;height:40px;border:3px solid #e7e5e4;border-top-color:#1c654c;
  border-radius:50%;animation:spin .8s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}

/* Responsive */
@media(max-width:920px){
  .page-slot{width:180px;height:255px}
  .spine{min-height:255px;width:3px}
  .curl-container{width:180px;height:255px}
  .curl-face{background-size:180px 255px}
}
@media(max-width:440px){
  .page-slot{width:140px;height:198px}
  .spine{min-height:198px;width:2px}
  .curl-container{width:140px;height:198px}
  .curl-face{background-size:140px 198px}
}
</style>
</head>
<body>

<div class="loading" id="loader">
  <div style="text-align:center">
    <div class="spinner" style="margin:0 auto 12px"></div>
    <div style="font-size:13px;font-weight:500">Loading flipbook...</div>
  </div>
</div>

<header>
  <div class="header-inner">
    <div class="header-icon">
      <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
    </div>
    <div>
      <div class="header-title">${escHtml(fileName)}</div>
      <div class="header-sub">${pages.length} pages &middot; Flipbook Viewer</div>
    </div>
  </div>
</header>

<main>
  <div class="book-scene">
    <div class="book" id="book">
      <div class="page-slot" id="leftPage"><img id="leftImg" alt="Page"></div>
      <div class="spine"></div>
      <div class="page-slot" id="rightPage"><img id="rightImg" alt="Page"></div>
      <!-- Curl overlay -->
      <div class="curl-container" id="curlContainer"></div>
      <div class="curl-shadow" id="curlShadow"></div>
      <div class="curl-highlight" id="curlHighlight"></div>
      <div class="curl-edge" id="curlEdge"></div>
      <div class="curl-drop" id="curlDrop"></div>
    </div>
  </div>
</main>

<div class="controls">
  <button class="btn" id="btnFirst" title="First page">
    <svg viewBox="0 0 24 24"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
    First
  </button>
  <button class="btn" id="btnPrev" title="Previous page">
    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
    Prev
  </button>
  <span class="page-info" id="pageInfo"></span>
  <button class="btn" id="btnNext" title="Next page">
    <svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg>
    Next
  </button>
  <button class="btn" id="btnLast" title="Last page">
    <svg viewBox="0 0 24 24"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
    Last
  </button>
</div>

<script>
(function(){
  const PAGES = ${pagesJSON};
  const PW = ${pageW};
  const PH = ${pageH};
  const N_STRIPS = ${numStrips};

  let spread = 0;
  let animating = false;
  let curlDir = null; // 'fwd' | 'bwd'
  let curlProgress = 0;
  let curlVelocity = 0;
  let animRAF = null;

  // DOM
  const book = document.getElementById('book');
  const leftImg = document.getElementById('leftImg');
  const rightImg = document.getElementById('rightImg');
  const curlContainer = document.getElementById('curlContainer');
  const curlShadow = document.getElementById('curlShadow');
  const curlHighlight = document.getElementById('curlHighlight');
  const curlEdge = document.getElementById('curlEdge');
  const curlDrop = document.getElementById('curlDrop');
  const pageInfo = document.getElementById('pageInfo');
  const btnFirst = document.getElementById('btnFirst');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnLast = document.getElementById('btnLast');

  function smoothstep(e0,e1,x){
    const t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));
    return t*t*(3-2*t);
  }

  function getSpreadPages(){
    const maxSpread = Math.ceil(PAGES.length/2)-1;
    if(spread<=0) return {left:null, right:PAGES[0]||null, leftIdx:-1, rightIdx:0};
    if(spread>=maxSpread) return {left:PAGES[spread*2-1]||null, right:null, leftIdx:spread*2-1, rightIdx:spread*2};
    return {left:PAGES[spread*2-1]||null, right:PAGES[spread*2]||null, leftIdx:spread*2-1, rightIdx:spread*2};
  }

  function render(){
    const s = getSpreadPages();
    leftImg.src = s.left ? s.left.src : '';
    leftImg.style.display = s.left ? 'block' : 'none';
    rightImg.src = s.right ? s.right.src : '';
    rightImg.style.display = s.right ? 'block' : 'none';

    const maxSpread = Math.ceil(PAGES.length/2)-1;
    const lp = s.leftIdx >= 0 ? s.leftIdx+1 : '-';
    const rp = s.rightIdx >= 0 ? s.rightIdx+1 : '-';
    pageInfo.textContent = lp + ' / ' + rp + '  (' + PAGES.length + ' pages)';

    btnFirst.disabled = spread <= 0 || animating;
    btnPrev.disabled = spread <= 0 || animating;
    btnNext.disabled = spread >= maxSpread || animating;
    btnLast.disabled = spread >= maxSpread || animating;
  }

  // Build curl strips
  let strips = [];
  let frontFaces = [];
  let backFaces = [];

  function buildStrips(){
    curlContainer.innerHTML = '';
    strips = [];
    frontFaces = [];
    backFaces = [];
    const sw = Math.ceil(PW / N_STRIPS) + 1;
    for(let i = 0; i < N_STRIPS; i++){
      const strip = document.createElement('div');
      strip.className = 'curl-strip';
      strip.style.left = (i * (PW / N_STRIPS)) + 'px';
      strip.style.width = sw + 'px';

      const front = document.createElement('div');
      front.className = 'curl-face curl-front';
      const back = document.createElement('div');
      back.className = 'curl-face curl-back';

      strip.appendChild(front);
      strip.appendChild(back);
      curlContainer.appendChild(strip);
      strips.push(strip);
      frontFaces.push(front);
      backFaces.push(back);
    }
  }

  function updateCurl(t, dir){
    curlContainer.style.display = t > 0.001 ? 'block' : 'none';

    const isFwd = dir === 'fwd';
    const s = getSpreadPages();
    const frontSrc = isFwd ? (s.right ? s.right.src : '') : (s.left ? s.left.src : '');
    const backSrc = isFwd
      ? (PAGES[getSpreadPages().rightIdx+1] ? PAGES[getSpreadPages().rightIdx+1].src : '')
      : (PAGES[getSpreadPages().leftIdx-1] ? PAGES[getSpreadPages().leftIdx-1].src : '');

    const sw = Math.ceil(PW / N_STRIPS) + 1;

    for(let i = 0; i < N_STRIPS; i++){
      const idx = isFwd ? i : (N_STRIPS - 1 - i);
      const sweepParam = idx * (1.0 / (N_STRIPS - 1));
      const norm = (t * 1.4 - sweepParam) / 0.5;
      const angle = smoothstep(0,1,norm) * 180;

      const ox = isFwd ? '0%' : '100%';
      strips[idx].style.transformOrigin = ox + ' 50%';
      strips[idx].style.transform = 'rotateY(' + (isFwd ? angle : -angle) + 'deg)';

      // Position front face
      frontFaces[idx].style.backgroundImage = 'url(' + frontSrc + ')';
      frontFaces[idx].style.backgroundPosition = (-idx * (PW / N_STRIPS)) + 'px 0';

      // Position back face (mirrored)
      backFaces[idx].style.backgroundImage = 'url(' + backSrc + ')';
      backFaces[idx].style.backgroundPosition = (-(N_STRIPS - 1 - idx) * (PW / N_STRIPS)) + 'px 0';
    }

    // Position curl container on the correct side
    if(isFwd){
      curlContainer.style.left = PW + 'px'; // over right page
    } else {
      curlContainer.style.left = '0px'; // over left page
    }

    // Shadows
    const shadowPos = isFwd ? (PW * (1 - t)) : (PW * t);
    curlShadow.style.opacity = String(t * 0.6);
    curlShadow.style.left = String(shadowPos) + 'px';
    curlShadow.style.width = String(PW * 0.4 * t) + 'px';
    curlShadow.style.background = 'linear-gradient(90deg, transparent, rgba(0,0,0,' + (t*0.3) + '))';

    curlHighlight.style.opacity = String(t * 0.5);
    curlHighlight.style.left = String(shadowPos - 20) + 'px';
    curlHighlight.style.width = String(40 * t) + 'px';

    curlEdge.style.opacity = String(t * 0.8);
    curlEdge.style.left = String(shadowPos - 3) + 'px';

    curlDrop.style.opacity = String(t * 0.5);
  }

  function animateCurl(){
    const target = (curlDir === 'fwd') ? 1 : 1;
    const dt = 0.016;
    const stiffness = 120;
    const damping = 14;

    const force = (target - curlProgress) * stiffness;
    curlVelocity = (curlVelocity + force * dt) * (1 - damping * dt);
    curlProgress += curlVelocity * dt;

    if(curlProgress > 1) curlProgress = 1;
    if(curlProgress < 0) curlProgress = 0;

    updateCurl(curlProgress, curlDir);

    // Check if done
    if(Math.abs(curlVelocity) < 0.001 && Math.abs(target - curlProgress) < 0.001){
      curlProgress = target;
      updateCurl(curlProgress, curlDir);
      onCurlDone();
      return;
    }
    animRAF = requestAnimationFrame(animateCurl);
  }

  function onCurlDone(){
    cancelAnimationFrame(animRAF);
    animating = false;
    if(curlDir === 'fwd'){
      spread++;
    } else {
      spread--;
    }
    const maxSpread = Math.ceil(PAGES.length/2)-1;
    if(spread < 0) spread = 0;
    if(spread > maxSpread) spread = maxSpread;
    curlProgress = 0;
    curlVelocity = 0;
    curlDir = null;
    curlContainer.style.display = 'none';
    curlShadow.style.opacity = '0';
    curlHighlight.style.opacity = '0';
    curlEdge.style.opacity = '0';
    curlDrop.style.opacity = '0';
    render();
  }

  function flipForward(){
    if(animating) return;
    const maxSpread = Math.ceil(PAGES.length/2)-1;
    if(spread >= maxSpread) return;
    const s = getSpreadPages();
    if(!s.right) return;
    animating = true;
    curlDir = 'fwd';
    curlProgress = 0;
    curlVelocity = 0;
    buildStrips();
    updateCurl(0, 'fwd');
    animRAF = requestAnimationFrame(animateCurl);
  }

  function flipBackward(){
    if(animating) return;
    if(spread <= 0) return;
    const s = getSpreadPages();
    if(!s.left) return;
    animating = true;
    curlDir = 'bwd';
    curlProgress = 0;
    curlVelocity = 0;
    buildStrips();
    updateCurl(0, 'bwd');
    animRAF = requestAnimationFrame(animateCurl);
  }

  // Events
  btnFirst.addEventListener('click', function(){
    if(!animating && spread > 0){ spread = 0; render(); }
  });
  btnPrev.addEventListener('click', function(){
    if(!animating && spread > 0){ spread--; render(); }
  });
  btnNext.addEventListener('click', function(){
    if(!animating){
      const maxSpread = Math.ceil(PAGES.length/2)-1;
      if(spread < maxSpread){ spread++; render(); }
    }
  });
  btnLast.addEventListener('click', function(){
    if(!animating){
      spread = Math.ceil(PAGES.length/2)-1;
      render();
    }
  });

  // Click on pages to flip (with animation)
  document.getElementById('rightPage').addEventListener('click', flipForward);
  document.getElementById('leftPage').addEventListener('click', flipBackward);

  // Keyboard
  document.addEventListener('keydown', function(e){
    if(e.key === 'ArrowRight' || e.key === ' '){ e.preventDefault(); flipForward(); }
    if(e.key === 'ArrowLeft'){ e.preventDefault(); flipBackward(); }
  });

  // Hide loader
  function escHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Init
  render();
  setTimeout(function(){
    document.getElementById('loader').classList.add('hidden');
  }, 300);
})();
</script>
</body>
</html>`;

  return html;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}