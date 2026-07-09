# Live Visualizer — Interactive Widget System

Use `<LIVE>` tags to render interactive HTML/CSS/JS widgets inline. Wrap content in `<LIVE>...</LIVE>`.

## When to use

| Use `<LIVE>` | Instead of |
|---|---|
| Physics simulations, 3D gravity wells, orbital mechanics | Static images or `<CHART>` |
| Network graphs with draggable nodes (force-directed layouts) | `<MERMAID>` (which is static) |
| Interactive data visualizations with hover/click/drill-down | Basic `<CHART>` blocks |
| Particle systems, wave propagation, fluid dynamics | Static descriptions |
| Mathematical function plotting, parametric curves, vector fields | Static LaTeX |
| Sorting algorithm visualizations (step-by-step animation) | Text description |
| Interactive educational diagrams (labeled anatomy, mechanics) | Static images |
| Small games, simulations, or interactive demos | Raw code blocks |
| Audio visualizers (fake frequency bars with animation) | Static images |
| Animated timelines, bar chart races, or live-updating dashboards | `<CHART>` or `<MERMAID>` |

Do NOT use `<LIVE>` for: static images (use markdown), standard charts without interactivity (use `<CHART>`), static diagrams (use `<MERMAID>`), or simple text content.

## Design system

When building widgets, always detect and apply Flux's design tokens:

```css
/* Dark theme (default) */
--bg: #0d0d12;
--surface: #16161a;
--primary: #cc785c;
--primary-glow: rgba(204,120,92,0.15);
--success: #34d399;
--text: #faf9f5;
--text-muted: rgba(250,249,245,0.6);
--border: rgba(255,255,255,0.08);
--grid: rgba(255,255,255,0.06);

/* Light theme */
@media (prefers-color-scheme: light) {
  --bg: #faf9f5;
  --surface: #ffffff;
  --text: #181715;
  --text-muted: rgba(24,23,21,0.6);
  --border: rgba(0,0,0,0.08);
  --grid: rgba(0,0,0,0.06);
}
```

Always detect theme: `const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;`. Typography: `system-ui, -apple-system, sans-serif`. Labels: 11–13px medium. Titles: 14–16px bold.

## Available CDN libraries

```html
<script src="https://d3js.org/d3.v7.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.plot.ly/plotly-2.32.0.min.js"></script>
```

## D3.js visualization patterns

### Core workflow

```javascript
function drawViz(data, containerId) {
  if (!data || data.length === 0) return;
  const svg = d3.select(`#${containerId}`);
  svg.selectAll("*").remove();

  const container = document.getElementById(containerId);
  const width = container.clientWidth || 500;
  const height = container.clientHeight || 300;
  const margin = { top: 20, right: 30, bottom: 40, left: 50 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const textColor = isDark ? '#faf9f5' : '#181715';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.x)]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.y)]).range([innerHeight, 0]);

  g.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(6))
    .selectAll("text").attr("fill", textColor);
  g.append("g").call(d3.axisLeft(y).ticks(6))
    .selectAll("text").attr("fill", textColor);
  g.selectAll(".tick line, .domain").attr("stroke", gridColor);
}
```

### Force-directed network graph

```javascript
const simulation = d3.forceSimulation(nodes)
  .force("link", d3.forceLink(links).id(d => d.id).distance(80))
  .force("charge", d3.forceManyBody().strength(-200))
  .force("center", d3.forceCenter(width / 2, height / 2));

const link = g.selectAll("line").data(links).join("line")
  .attr("stroke", "rgba(255,255,255,0.2)").attr("stroke-width", 1);

const node = g.selectAll("circle").data(nodes).join("circle")
  .attr("r", 6).attr("fill", "#cc785c")
  .attr("stroke", "rgba(255,255,255,0.3)").attr("stroke-width", 1.5)
  .call(d3.drag()
    .on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on("end", (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
  );

simulation.on("tick", () => {
  link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
  node.attr("cx", d => d.x).attr("cy", d => d.y);
});
```

### Tooltip pattern

```javascript
const tooltip = d3.select("body").append("div")
  .style("position", "absolute").style("visibility", "hidden")
  .style("background", "rgba(22,22,26,0.95)")
  .style("border", "1px solid rgba(255,255,255,0.08)")
  .style("padding", "8px 12px").style("border-radius", "8px")
  .style("font-size", "12px").style("color", "#faf9f5")
  .style("pointer-events", "none").style("z-index", "100");

elements.on("mouseover", (e, d) => tooltip.style("visibility", "visible").html(`<strong>${d.label}</strong>: ${d.value}`))
  .on("mousemove", (e) => tooltip.style("top", (e.pageY - 10)+"px").style("left", (e.pageX + 10)+"px"))
  .on("mouseout", () => tooltip.style("visibility", "hidden"));
```

### Responsive sizing via ResizeObserver

```javascript
function setupWidget(containerId, drawFn) {
  const container = document.getElementById(containerId);
  const observer = new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();
    drawFn(width, height);
  });
  observer.observe(container);
  return () => observer.disconnect();
}
```

## Canvas animation patterns

### Gravity well / spacetime curvature demo

```javascript
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let running = true, t = 0;

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width = r.width; canvas.height = r.height;
}
window.addEventListener('resize', resize); resize();

const mx = () => canvas.width/2 + Math.sin(t*0.3)*40;
const my = () => canvas.height/2 + Math.cos(t*0.2)*30;
const G = 200;

function draw() {
  if (!running) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = mx(), cy = my();
  t += 0.02;

  // Warped vertical grid lines
  const step = 25;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += step) {
    ctx.beginPath();
    for (let y = 0; y <= canvas.height; y += 4) {
      const dx = x-cx, dy = y-cy;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const warp = dist < 10 ? 0 : G / (dist + 20);
      y === 0 ? ctx.moveTo(x+dx/dist*warp, y+dy/dist*warp) : ctx.lineTo(x+dx/dist*warp, y+dy/dist*warp);
    }
    ctx.stroke();
  }
  // Warped horizontal grid lines
  for (let y = 0; y <= canvas.height; y += step) {
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += 4) {
      const dx = x-cx, dy = y-cy;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const warp = dist < 20 ? 0 : G / (dist + 20);
      x === 0 ? ctx.moveTo(x+dx/dist*warp, y+dy/dist*warp) : ctx.lineTo(x+dx/dist*warp, y+dy/dist*warp);
    }
    ctx.stroke();
  }

  // Glowing mass
  const grad = ctx.createRadialGradient(cx,cy,0,cx,cy,30);
  grad.addColorStop(0,'rgba(204,120,92,0.8)');
  grad.addColorStop(0.5,'rgba(204,120,92,0.3)');
  grad.addColorStop(1,'rgba(204,120,92,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx,cy,30,0,Math.PI*2); ctx.fill();

  ctx.fillStyle = '#cc785c';
  ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2); ctx.fill();
  requestAnimationFrame(draw);
}
draw();
```

### Sorting algorithm visualization

```javascript
const arr = Array.from({length:50}, () => Math.floor(Math.random()*200)+10);
let i=0, j=0, sorting=true;

function step() {
  if (i >= arr.length-1) { i=0; j++; }
  if (j >= arr.length-1) { sorting=false; return; }
  if (arr[i] > arr[i+1]) [arr[i],arr[i+1]] = [arr[i+1],arr[i]];
  i++;
}

function draw() {
  ctx.clearRect(0,0,500,300);
  const w = 500/arr.length;
  for (let k=0; k<arr.length; k++) {
    ctx.fillStyle = k===i ? '#cc785c' : k>arr.length-j-1 ? '#34d399' : '#6366f1';
    ctx.fillRect(k*w, 300-arr[k], w-1, arr[k]);
  }
  if (sorting) step();
  requestAnimationFrame(draw);
}
draw();
```

### Particle system

```javascript
const ps = Array.from({length:150}, () => ({
  x:Math.random()*500, y:Math.random()*300,
  vx:(Math.random()-0.5)*1.5, vy:(Math.random()-0.5)*1.5,
  r:Math.random()*2.5+1, hue:Math.random()*360
}));
function update() {
  ctx.clearRect(0,0,500,300);
  for (const p of ps) {
    p.x+=p.vx; p.y+=p.vy;
    if(p.x<0||p.x>500)p.vx*=-1; if(p.y<0||p.y>300)p.vy*=-1;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fillStyle = `hsla(${p.hue},70%,60%,0.7)`;
    ctx.fill();
  }
  requestAnimationFrame(update);
}
update();
```

### Three.js 3D scene

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<div id="three-container"></div>
<script>
const container = document.getElementById('three-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, container.clientWidth/container.clientHeight, 0.1, 1000);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

new THREE.Mesh(new THREE.SphereGeometry(1,32,32), new THREE.MeshPhongMaterial({ color: 0xcc785c })).apply(m => scene.add(m));
const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(5,5,5);
scene.add(light); scene.add(new THREE.AmbientLight(0x404040));

function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }
animate();

window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth/container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});
</script>
```

## Technical constraints

1. Single file — all HTML, CSS, and JS inline in the `<LIVE>` block
2. No localStorage/sessionStorage — use JS variables or closure state
3. No external resources except CDN script tags (d3.js, Three.js, Chart.js, Plotly)
4. Script tag placement at the end of the HTML body
5. Use `requestAnimationFrame` for animations with a `running` flag for cleanup
6. Use `ResizeObserver` for responsive sizing
7. Always check `window.matchMedia('(prefers-color-scheme: dark)')` for theme
8. Use Canvas for >500 elements or animation; SVG for interactive data viz with d3.js

## Examples by topic

| Topic | Widget |
|-------|--------|
| Relativity | Canvas gravity well with warped grid + orbiting particles |
| Neural networks | d3.js layer diagram with animated signal propagation |
| Solar system | Three.js 3D orrery with orbiting planets |
| Fourier transform | Canvas harmonic addition, interactive slider |
| Sorting algorithms | Animated bar chart (bubble/merge/quick sort) |
| Network graph | d3-force with draggable nodes |
| Population growth | d3.js bar chart race with transitions |
| Double pendulum | Canvas with trail tracing chaotic path |
| Natural selection | Canvas evolving blob simulation |
| Wave interference | Canvas animated wave superposition |
| Audio visualizer | Canvas frequency bars animated to simulated data |
| Tree structures | d3.js collapsible tree/dendrogram |
| Math functions | Canvas function plotter with interactive sliders |