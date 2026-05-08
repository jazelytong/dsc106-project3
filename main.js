// ─────────────────────────────────────────────
//  Configuration
// ─────────────────────────────────────────────
const COLORS = {
  "Historical":      "#888888",
  "Low emissions":   "#2e8b57",
  "Medium emissions":"#e07b00",
  "High emissions":  "#c0182a"
};

const SCENARIO_MAP = {
  "historical": "Historical",
  "ssp126":     "Low emissions",
  "ssp245":     "Medium emissions",
  "ssp585":     "High emissions"
};

// Which scenarios are currently visible
const visible = {
  "Historical": true,
  "Low emissions": true,
  "Medium emissions": true,
  "High emissions": true
};

let currentUnit = "f";   // "f" or "c"
let allData = [];        // full dataset after parsing

// ─────────────────────────────────────────────
//  Main chart dimensions
// ─────────────────────────────────────────────
const margin = { top: 50, right: 30, bottom: 40, left: 60 };
const totalW  = 860;
const totalH  = 550;
const W = totalW - margin.left - margin.right;
const H = totalH - margin.top  - margin.bottom;

// Context (brush) chart dimensions
const ctxMargin = { top: 8, right: 30, bottom: 24, left: 60 };
const ctxH = 55;
const ctxW = totalW - ctxMargin.left - ctxMargin.right;

// ─────────────────────────────────────────────
//  SVG setup — main chart
// ─────────────────────────────────────────────
const svg = d3.select("#chart")
  .attr("width",  totalW)
  .attr("height", totalH)
  .attr("viewBox", `0 0 ${totalW} ${totalH}`)
  .style("width", "100%").style("height", "auto");

const g = svg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

// Clip path so lines don't overflow during zoom
svg.append("defs").append("clipPath")
  .attr("id","clip")
  .append("rect").attr("width", W).attr("height", H);

// ─────────────────────────────────────────────
//  SVG setup — context chart
// ─────────────────────────────────────────────
const ctxSvg = d3.select("#context")
  .attr("width",  totalW)
  .attr("height", ctxH + ctxMargin.top + ctxMargin.bottom)
  .attr("viewBox", `0 0 ${totalW} ${ctxH + ctxMargin.top + ctxMargin.bottom}`)
  .style("width","100%").style("height","auto");

const ctxG = ctxSvg.append("g")
  .attr("transform", `translate(${ctxMargin.left},${ctxMargin.top})`);

// ─────────────────────────────────────────────
//  Scales
// ─────────────────────────────────────────────
const xMain = d3.scaleLinear().range([0, W]);
const xCtx  = d3.scaleLinear().range([0, ctxW]);
const yMain = d3.scaleLinear().range([H, 0]);
const yCtx  = d3.scaleLinear().range([ctxH, 0]);

// ─────────────────────────────────────────────
//  Axes
// ─────────────────────────────────────────────
const xAxisG = g.append("g")
  .attr("transform", `translate(0,${H})`);

const yAxisG = g.append("g");

// Axis labels
g.append("text").attr("class","axis-label")
  .attr("x", W/2).attr("y", H + 36)
  .attr("text-anchor","middle").text("Year");

const yLabel = g.append("text").attr("class","axis-label")
  .attr("transform","rotate(-90)")
  .attr("x", -H/2).attr("y", -50)
  .attr("text-anchor","middle");

// Baseline zero line
const baselineLine = g.append("line")
  .attr("class","baseline-line")
  .attr("x1",0).attr("x2",W);

// ─────────────────────────────────────────────
//  Period bands (background shading)
// ─────────────────────────────────────────────
const PERIODS = [
  { label:"Near future\n2015–2040", start:2015, end:2040, fill:"#4a90d9" },
  { label:"Mid-century\n2041–2070", start:2041, end:2070, fill:"#e07b00" },
  { label:"End-century\n2071–2100", start:2071, end:2100, fill:"#c0182a" }
];

const bandsG = g.append("g").attr("clip-path","url(#clip)");
const bandRects = bandsG.selectAll(".period-band")
  .data(PERIODS).join("rect")
  .attr("class","period-band")
  .attr("y", 0).attr("height", H);

const bandLabels = g.append("g");

// ─────────────────────────────────────────────
//  Line generator
// ─────────────────────────────────────────────
function makeLineGen(xScale) {
  return d3.line()
    .x(d => xScale(d.year))
    .y(d => yMain(displayVal(d)))
    .defined(d => displayVal(d) != null);
}

function anomalyVal(d) {
  return currentUnit === "f" ? d.anomaly_f : d.anomaly_c;
}

function smoothSeries(values) {
  return values.map((d, i) => {
    const start = Math.max(0, i - 2);
    const end = Math.min(values.length, i + 3);
    const window = values.slice(start, end);
    const smoothF = d3.mean(window, v => v.anomaly_f);
    const smoothC = d3.mean(window, v => v.anomaly_c);

    return {
      ...d,
      smooth_anomaly_f: smoothF,
      smooth_anomaly_c: smoothC
    };
  });
}

function displayVal(d) {
  return currentUnit === "f" ? d.smooth_anomaly_f : d.smooth_anomaly_c;
}

// ─────────────────────────────────────────────
//  Lines group (with clip)
// ─────────────────────────────────────────────
const linesG = g.append("g").attr("clip-path","url(#clip)");

// ─────────────────────────────────────────────
//  Annotation (end-century high-emissions)
// ─────────────────────────────────────────────
const annotG = g.append("g").attr("clip-path","url(#clip)");

// ─────────────────────────────────────────────
//  Tooltip & hover overlay
// ─────────────────────────────────────────────
const tooltip = d3.select("#tooltip");
const bisect  = d3.bisector(d => d.year).left;

const overlay = g.append("rect")
  .attr("width", W).attr("height", H)
  .attr("fill", "transparent")
  .attr("cursor","crosshair")
  .style("pointer-events", "all");

// Vertical hover line
const hoverLine = g.append("line")
  .attr("stroke","#bbb").attr("stroke-width",1)
  .attr("y1",0).attr("y2",H)
  .style("display","none")
  .style("pointer-events", "none");

// ─────────────────────────────────────────────
//  Context brush
// ─────────────────────────────────────────────
let brushedExtent = null;

const brush = d3.brushX()
  .extent([[0,0],[ctxW, ctxH]])
  .on("brush end", brushed);

const brushG = ctxG.append("g").attr("class","brush");

const ctxLinesG = ctxG.append("g");

ctxG.append("g")
  .attr("transform",`translate(0,${ctxH})`)
  .attr("class","x-axis-ctx");

// ─────────────────────────────────────────────
//  LOAD DATA
// ─────────────────────────────────────────────
d3.csv("la_cmip6_temperature_scenarios.csv").then(raw => {

  // Parse
  allData = raw.map(d => ({
    year:          +d.year,
    scenario_label: SCENARIO_MAP[d.scenario] || d.scenario,
    temperature_c: +d.temperature_c,
    temperature_f: +d.temperature_f,
    anomaly_c:     +d.anomaly_c,
    anomaly_f:     +d.anomaly_f
  }));

  // Group by scenario label
  const nested = d3.group(
  allData,
  d => d.scenario_label
);

nested.forEach((values, label) => {
  const smoothed = smoothSeries(values.sort((a, b) => a.year - b.year));
  nested.set(label, smoothed);
}); 

  // Set domains
  const allYears = allData.map(d => d.year);
  xMain.domain([1850, 2100]);
  xCtx.domain([1850, 2100]);

  setYDomain(allYears);

  yCtx.domain(yMain.domain());

  // Draw axes
  drawAxes();
  drawYLabel();

  // Period bands
  updateBands();

  // Draw lines — main chart
  linesG.selectAll(".scenario-line")
    .data([...nested.entries()], d => d[0])
    .join("path")
    .attr("class","scenario-line")
    .attr("stroke", d => COLORS[d[0]])
    .attr("d", d => makeLineGen(xMain)(d[1]));

  // Draw lines — context chart
  ctxLinesG.selectAll(".ctx-line")
    .data([...nested.entries()], d => d[0])
    .join("path")
    .attr("class","ctx-line")
    .attr("fill","none")
    .attr("stroke", d => COLORS[d[0]])
    .attr("stroke-width", 1)
    .attr("opacity", 0.5)
    .attr("d", d => d3.line()
      .x(e => xCtx(e.year))
      .y(e => yCtx(anomalyVal(e)))
      (d[1])
    );

  // Context x-axis
  ctxG.select(".x-axis-ctx")
    .call(d3.axisBottom(xCtx).tickFormat(d3.format("d")).ticks(10));

  // Add brush
  brushG.call(brush);

  // Annotation
  drawAnnotation();

  // Hover
  setupHover(nested);

  // Baseline y=0 line position
  updateBaselineLine();

  
  hoverLine.raise();
  overlay.raise();

}).catch(err => {
  console.error("Could not load CSV:", err);
  document.querySelector(".container").insertAdjacentHTML("afterbegin",
    `<p style="color:red;font-weight:bold">Error loading CSV: ${err.message}.<br>
     Make sure la_cmip6_temperature_scenarios.csv is in the same folder as index.html.</p>`);
});

// ─────────────────────────────────────────────
//  Helper: set Y domain from visible scenarios
// ─────────────────────────────────────────────
function setYDomain(years) {
  const visibleData = allData.filter(d => visible[d.scenario_label]);
  if (visibleData.length === 0) { yMain.domain([-3, 10]); return; }
  const vals = visibleData.map(d => currentUnit === "f" ? d.smooth_anomaly_f ?? d.anomaly_f : d.smooth_anomaly_c ?? d.anomaly_c);
  const ext = d3.extent(vals);
  const pad = (ext[1] - ext[0]) * 0.1 || 1;
  yMain.domain([ext[0] - pad, ext[1] + pad]);
}

// ─────────────────────────────────────────────
//  Draw / update axes
// ─────────────────────────────────────────────
function drawAxes() {
  xAxisG.call(
    d3.axisBottom(xMain)
      .tickFormat(d3.format("d"))
      .ticks(10)
  );
  yAxisG.call(d3.axisLeft(yMain).ticks(8));
}

function drawYLabel() {
  yLabel.text(`Temperature Change from 1981–2010 Baseline (°${currentUnit.toUpperCase()})`);
}

// ─────────────────────────────────────────────
//  Baseline zero line position
// ─────────────────────────────────────────────
function updateBaselineLine() {
  const y0 = yMain(0);
  if (y0 >= 0 && y0 <= H) {
    baselineLine
      .attr("y1", y0).attr("y2", y0)
      .attr("x1", 0).attr("x2", W)
      .style("display", null);
  } else {
    baselineLine.style("display","none");
  }
}

// ─────────────────────────────────────────────
//  Period bands
// ─────────────────────────────────────────────
function updateBands() {
  bandRects
    .attr("x", d => xMain(d.start))
    .attr("width", d => Math.max(0, xMain(d.end) - xMain(d.start)))
    .attr("fill", d => d.fill);

  bandLabels.selectAll(".period-label-text").remove();

  PERIODS.forEach(p => {
    const xMid = (xMain(p.start) + xMain(p.end)) / 2;
    const bandWidth = xMain(p.end) - xMain(p.start);

    if (xMid < 0 || xMid > W || bandWidth < 35) return;

    const [line1, line2] = p.label.split("\n");

    const text = bandLabels.append("text")
      .attr("class", "period-label-text")
      .attr("x", xMid)
      .attr("y", 14)
      .attr("text-anchor", "middle");

    text.append("tspan")
      .attr("x", xMid)
      .attr("dy", 0)
      .text(line1);

    text.append("tspan")
      .attr("x", xMid)
      .attr("dy", 12)
      .text(line2);
  });
}

// ─────────────────────────────────────────────
//  Draw end-century annotation
// ─────────────────────────────────────────────
function drawAnnotation() {
  annotG.selectAll("*").remove();

  const highData = allData.filter(d =>
    d.scenario_label === "High emissions" &&
    d.year >= 2091 && d.year <= 2100 &&
    visible["High emissions"]
  );

  const lowData = allData.filter(d =>
    d.scenario_label === "Low emissions" &&
    d.year >= 2091 && d.year <= 2100 &&
    visible["Low emissions"]
  );

  if (!highData.length || !lowData.length) return;

  const avgHigh = d3.mean(highData, anomalyVal);
  const avgLow = d3.mean(lowData, anomalyVal);
  const gap = avgHigh - avgLow;

  const xPos = W - 20;
  const yPos = yMain(avgHigh) - 32;

  annotG.append("text")
    .attr("class", "annotation-text")
    .attr("x", xPos)
    .attr("y", yPos)
    .attr("text-anchor", "end")
    .text(`By 2100, high emissions are about ${gap.toFixed(1)}° warmer than low emissions`);
}

// ─────────────────────────────────────────────
//  Update all chart elements after change
// ─────────────────────────────────────────────
function update() {
  setYDomain();
  yCtx.domain(yMain.domain());
  drawAxes();
  drawYLabel();
  updateBaselineLine();
  updateBands();

  const lineGen = makeLineGen(xMain);

  linesG.selectAll(".scenario-line")
    .attr("d", d => lineGen(d[1]))
    .attr("opacity", d => visible[d[0]] ? 1 : 0)
    .attr("stroke-width", d => visible[d[0]] ? 2.2 : 0);

  // Context lines 
  ctxLinesG.selectAll(".ctx-line")
    .attr("d", d => d3.line()
      .x(e => xCtx(e.year))
      .y(e => yCtx(anomalyVal(e)))
      (d[1])
    )
    .attr("opacity", d => visible[d[0]] ? 0.5 : 0);

  drawAnnotation();

  overlay.raise();
  hoverLine.raise();
}

// ─────────────────────────────────────────────
//  Brush handler
// ─────────────────────────────────────────────
function brushed(event) {
  const sel = event.selection;
  if (!sel) {
    // Reset to full range
    xMain.domain(xCtx.domain());
  } else {
    xMain.domain([xCtx.invert(sel[0]), xCtx.invert(sel[1])]);
  }
  update();
}

// ─────────────────────────────────────────────
//  Hover / tooltip
// ─────────────────────────────────────────────
function setupHover(nested) {
  overlay
    .on("mousemove", function(event) {
      const [mx] = d3.pointer(event, overlay.node());
      const year = Math.round(xMain.invert(mx));

      const rows = [];
      nested.forEach((vals, label) => {
        if (!visible[label]) return;

        // Only show a scenario if it actually has data for that hovered year
        const d = vals.find(v => v.year === year);
        if (d) rows.push({ label, d });
      });

      if (!rows.length) {
        tooltip.style("display", "none");
        hoverLine.style("display", "none");
        return;
      }

      hoverLine
        .attr("x1", xMain(year))
        .attr("x2", xMain(year))
        .style("display", null);

      const unitLabel = currentUnit === "f" ? "°F" : "°C";
      const rawKey = currentUnit === "f" ? "temperature_f" : "temperature_c";
      const anomKey = currentUnit === "f" ? "anomaly_f" : "anomaly_c";

      let html = `<div class="tt-year">${year}</div>`;

      rows.sort((a, b) => b.d[anomKey] - a.d[anomKey]);

      rows.forEach(({ label, d }) => {
        const anom = d[anomKey] >= 0 ? `+${d[anomKey].toFixed(2)}` : d[anomKey].toFixed(2);
        const raw = d[rawKey].toFixed(1);

        html += `<div class="tt-row">
          <span><span class="tt-dot" style="background:${COLORS[label]}"></span>${label}</span>
          <span>${anom}${unitLabel} (${raw}${unitLabel})</span>
        </div>`;
      });

      html += `<div style="margin-top:5px;font-size:0.75rem;color:#aaa">anomaly · raw</div>`;

      tooltip
        .style("display", "block")
        .html(html);

      const chartRect = document.getElementById("chart").getBoundingClientRect();
      const tx = event.clientX - chartRect.left + 18;
      const ty = event.clientY - chartRect.top - 10;

      tooltip
        .style("left", (tx + 150 > totalW ? tx - 200 : tx) + "px")
        .style("top", ty + "px");
    })
    .on("mouseleave", () => {
      tooltip.style("display", "none");
      hoverLine.style("display", "none");
    });
}

// ─────────────────────────────────────────────
//  Button: scenario toggles
// ─────────────────────────────────────────────
document.querySelectorAll(".btn[data-scenario]").forEach(btn => {
  btn.addEventListener("click", () => {
    const sc = btn.dataset.scenario;
    visible[sc] = !visible[sc];
    btn.classList.toggle("active",   visible[sc]);
    btn.classList.toggle("inactive", !visible[sc]);
    update();
  });
});

// ─────────────────────────────────────────────
//  Button: °F / °C
// ─────────────────────────────────────────────
document.getElementById("btn-f").addEventListener("click", () => {
  currentUnit = "f";
  document.getElementById("btn-f").classList.add("active-unit");
  document.getElementById("btn-c").classList.remove("active-unit");
  update();
});
document.getElementById("btn-c").addEventListener("click", () => {
  currentUnit = "c";
  document.getElementById("btn-c").classList.add("active-unit");
  document.getElementById("btn-f").classList.remove("active-unit");
  update();
});

// ─────────────────────────────────────────────
//  Button: reset zoom
// ─────────────────────────────────────────────
document.getElementById("reset-btn").addEventListener("click", () => {
  brushG.call(brush.clear);
  xMain.domain(xCtx.domain());
  update();
});