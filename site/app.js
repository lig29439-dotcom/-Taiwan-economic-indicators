/* 台灣經濟指標網站
 * 資料：data/data.json（由 pipeline/build.py 產生）
 * 路由（只用英數與連字號，Claude 成品區也能使用）：
 *   #overview 總覽、#c-<分類>、#i-<指標，底線改連字號>、#q 或 #q-<季度>
 *   舊格式 #/c/..、#/i/..、#/q/.. 仍可開啟
 */
(function () {
  "use strict";

  const S = { data: null, charts: [], detail: { freq: "Q", range: "10" } };
  const $ = (sel, el = document) => el.querySelector(sel);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const CAT_DESC = {
    cycle: "整體景氣位置與方向：經濟成長率與其來源、國發會景氣指標、經理人指數。",
    industry: "生產、訂單與貿易。外銷訂單領先出口約 1–3 個月，是判斷產業動能的關鍵。",
    semi: "半導體相關的官方與市場指標。官方的積體電路出口與半導體細業生產資料目前無法自動取得，以資訊電子工業生產、電子產品外銷訂單、半導體出廠價格與類股指數代替。",
    realestate: "房市供給（建照、使照）、資金（房貸、建築貸款）與成本（營造物價）。房價指數暫未納入。",
    prices: "通膨壓力：消費端（CPI）、生產端（PPI）、進口端。",
    money: "資金與利率環境：貨幣供給、利率、匯率。",
    labor: "就業市場與薪資。失業率是落後指標。",
    stock: "股市表現、評價與法人資金流向。",
  };
  const REF_LINES = { pmi: 50, nmi: 50, leading_dt: 100, coincident_dt: 100 };

  // ------------------------------------------------------------------ 格式化
  function periodDate(p) {
    if (p.includes("Q")) {
      const [y, q] = p.split("-Q");
      return Date.UTC(+y, (+q - 1) * 3 + 1, 15);
    }
    const [y, m] = p.split("-");
    return Date.UTC(+y, +m - 1, 15);
  }
  const monthStart = (p) => { const [y, m] = p.split("-"); return Date.UTC(+y, +m - 1, 1); };
  const monthEnd = (p) => { const [y, m] = p.split("-"); return Date.UTC(+y, +m, 0); };
  const plabel = (p) => (p.includes("Q") ? p.replace("-Q", " Q") : p.replace("-", "/"));

  function digitsFor(v) {
    const a = Math.abs(v);
    return a >= 1000 ? 0 : a >= 100 ? 1 : 2;
  }
  function num(v, d) {
    if (v == null || isNaN(v)) return "–";
    if (d == null) d = digitsFor(v);
    return v.toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function withUnit(v, unit, d) {
    if (v == null) return "–";
    if (unit === "%") return num(v, d) + "%";
    return `${num(v, d)} <small>${esc(unit)}</small>`;
  }
  const signed = (v, d = 1) => (v == null ? "–" : (v > 0 ? "+" : "") + num(v, d));
  // 上漲紅、下跌綠（台股慣例）；搭配 +/− 號與 ▲▼，顏色不是唯一線索
  const tone = (v) => (v == null || Math.abs(v) < 1e-9 ? "" : v > 0 ? "up" : "down");
  const toned = (v, text) => (tone(v) ? `<span class="${tone(v)}">${text}</span>` : text);

  // 主要觀察值：年增率型指標取年增率，其餘取原始值
  const hv = (ind, row) => (ind.head === "yoy" ? row[2] : row[1]);
  const rowsOf = (ind, freq) => (freq === "M" && ind.m ? ind.m : ind.q);
  const headRows = (ind, freq) => rowsOf(ind, freq).filter((r) => hv(ind, r) != null);
  const headUnit = (ind) => (ind.head === "yoy" ? "%" : ind.unit);
  const isPctUnit = (ind) => ind.head === "yoy" || ind.unit === "%" || ind.unit === "百分點";

  function headText(ind, v, small = true) {
    if (v == null) return "–";
    if (ind.head === "yoy") return toned(v, signed(v) + "%");
    return small ? withUnit(v, ind.unit) : num(v) + (ind.unit === "%" ? "%" : " " + ind.unit);
  }

  function percentile(values, v) {
    if (values.length < 12 || v == null) return null;
    let below = 0, eq = 0;
    for (const x of values) { if (x < v) below++; else if (x === v) eq++; }
    return Math.round(((below + eq / 2) / values.length) * 100);
  }

  function deltaText(ind, cur, prev, label) {
    if (cur == null || prev == null) return "";
    const d = cur - prev;
    const unit = isPctUnit(ind) ? "個百分點" : ind.unit;
    const arrow = Math.abs(d) < 1e-9 ? "持平" : d > 0 ? "▲" : "▼";
    if (arrow === "持平") return `較${label}持平`;
    return toned(d, `${arrow} ${num(Math.abs(d), isPctUnit(ind) ? 2 : digitsFor(d))} ${esc(unit)}`) + `（較${label}）`;
  }

  function lightOf(score) {
    if (score >= 38) return { name: "紅燈", color: css("--light-red"), desc: "景氣熱絡" };
    if (score >= 32) return { name: "黃紅燈", color: css("--light-yellowred"), desc: "景氣活絡" };
    if (score >= 23) return { name: "綠燈", color: css("--light-green"), desc: "景氣穩定" };
    if (score >= 17) return { name: "黃藍燈", color: css("--light-yellowblue"), desc: "景氣欠佳" };
    return { name: "藍燈", color: css("--light-blue"), desc: "景氣低迷" };
  }

  function clockState(ind, back = 3) {
    const m = ind.m;
    if (!m || m.length <= back) return null;
    const last = m[m.length - 1], prev = m[m.length - 1 - back];
    const x = last[1], dy = last[1] - prev[1];
    const phase = x >= 100 ? (dy >= 0 ? "擴張" : "趨緩") : dy < 0 ? "衰退" : "復甦";
    return { period: last[0], x, dy, phase };
  }

  // ------------------------------------------------------------------ 連結
  const link = {
    home: () => "#overview",
    cat: (c) => `#c-${c}`,
    ind: (id) => `#i-${id.replace(/_/g, "-")}`,
    quarter: (q) => (q ? `#q-${q}` : "#q"),
  };
  // 在 Claude 成品區時：主題由 Claude 介面控制、無法下載檔案，改連到網站版
  const IS_ARTIFACT = !!window.TW_ECON_ARTIFACT;
  const SITE_URL = "https://lig29439-dotcom.github.io/-Taiwan-economic-indicators/";

  // ------------------------------------------------------------------ 圖表
  function disposeCharts() {
    S.charts.forEach((c) => c.dispose());
    S.charts = [];
  }
  function mkChart(el) {
    const c = echarts.init(el, null, { renderer: "canvas" });
    S.charts.push(c);
    return c;
  }

  function tooltipBase() {
    return {
      backgroundColor: css("--surface"),
      borderColor: css("--border"),
      textStyle: { color: css("--text"), fontSize: 12 },
      extraCssText: "box-shadow:0 2px 8px rgba(0,0,0,.12);border-radius:8px;",
    };
  }

  function baseOption({ compact = false } = {}) {
    return {
      animation: false,
      textStyle: { fontFamily: css("--font") },
      grid: compact ? { left: 4, right: 8, top: 10, bottom: 4, containLabel: true }
                    : { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: Object.assign(tooltipBase(), {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: css("--axis") } },
      }),
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: css("--axis") } },
        axisTick: { show: false },
        axisLabel: { color: css("--muted"), fontSize: 11, hideOverlap: true, formatter: "{yyyy}" },
        minInterval: 365 * 864e5,
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: css("--muted"), fontSize: compact ? 10 : 11 },
        splitLine: { lineStyle: { color: css("--grid") } },
        axisLine: { show: false },
      },
    };
  }

  function recessionArea(minT, maxT) {
    const data = (S.data.recessions || [])
      .map(([a, b]) => [Math.max(monthStart(a), minT), Math.min(monthEnd(b), maxT)])
      .filter(([a, b]) => a < b)
      .map(([a, b]) => [{ xAxis: a }, { xAxis: b }]);
    return { silent: true, itemStyle: { color: css("--recession") }, data };
  }

  function refLine(y) {
    return {
      silent: true, symbol: "none", label: { show: false },
      lineStyle: { color: css("--axis"), type: "solid", width: 1 },
      data: [{ yAxis: y }],
    };
  }

  /**
   * 時間序列圖：kind 為 line 或 bar（bar 依正負著色）。
   * rows: [[period, value], ...]
   */
  function seriesChart(el, rows, { kind = "line", unit = "", ref = null, compact = false, name = "" } = {}) {
    const chart = mkChart(el);
    if (!rows.length) { el.innerHTML = '<p class="note">無資料</p>'; return chart; }
    const pts = rows.map(([p, v]) => [periodDate(p), v, p]);
    const minT = pts[0][0] - 20 * 864e5, maxT = pts[pts.length - 1][0] + 20 * 864e5;
    const opt = baseOption({ compact });
    const fmtTip = (v) => (unit === "%" ? signed(v, 2) + "%" : num(v) + (unit ? " " + unit : ""));
    opt.tooltip.formatter = (ps) => {
      const p = ps[0];
      return `<b>${plabel(p.value[2])}</b><br>${esc(name || "")} ${fmtTip(p.value[1])}`;
    };
    let series;
    if (kind === "bar") {
      const pos = css("--rise"), neg = css("--fall");
      series = {
        type: "bar",
        barMaxWidth: compact ? 4 : 10,
        data: pts.map((d) => ({
          value: d,
          itemStyle: { color: d[1] >= 0 ? pos : neg, borderRadius: d[1] >= 0 ? [2, 2, 0, 0] : [0, 0, 2, 2] },
        })),
      };
      opt.yAxis.scale = false;
    } else {
      const c = css("--series-1");
      series = {
        type: "line", data: pts, showSymbol: false, symbolSize: 8,
        lineStyle: { width: compact ? 1.5 : 2, color: c }, itemStyle: { color: c },
      };
    }
    series.markArea = recessionArea(minT, maxT);
    if (ref != null) series.markLine = refLine(ref);
    opt.xAxis.min = minT;
    opt.xAxis.max = maxT;
    opt.series = [series];
    chart.setOption(opt);
    return chart;
  }

  function sparkline(el, rows, ind) {
    const chart = mkChart(el);
    const c = css("--series-1");
    const pts = rows.map(([p, v]) => [periodDate(p), v, p]);
    chart.setOption({
      animation: false,
      grid: { left: 0, right: 0, top: 4, bottom: 4 },
      xAxis: { type: "time", show: false },
      yAxis: { type: "value", show: false, scale: true },
      tooltip: Object.assign(tooltipBase(), {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: css("--axis") } },
        formatter: (ps) => `<b>${plabel(ps[0].value[2])}</b> ${headText(ind, ps[0].value[1], false)}`,
      }),
      series: [{
        type: "line", data: pts, showSymbol: false, symbolSize: 8,
        lineStyle: { width: 1.5, color: c }, itemStyle: { color: c },
        markLine: ind.head === "yoy" ? refLine(0) : REF_LINES[ind.id] ? refLine(REF_LINES[ind.id]) : undefined,
      }],
    });
    return chart;
  }

  // ------------------------------------------------------------------ 共用元件
  function latestInfo(id) {
    const ind = S.data.indicators[id];
    const q = headRows(ind, "Q");
    const last = q[q.length - 1], prev = q[q.length - 2];
    const vals = q.map((r) => hv(ind, r));
    const lastM = ind.m ? ind.m[ind.m.length - 1] : null;
    return {
      ind, last, prev,
      value: last ? hv(ind, last) : null,
      prevValue: prev ? hv(ind, prev) : null,
      pct: last ? percentile(vals, hv(ind, last)) : null,
      lastM,
    };
  }

  function pctBar(p) {
    if (p == null) return "";
    return `<div class="pct" title="最新一季在 2000 年以來所有季度中的相對位置">
      <span>歷史分位</span><div class="pct-bar"><span style="left:calc(${p}% - 1px)"></span></div><span>${p}%</span></div>`;
  }

  function monthLine(info) {
    const { ind, lastM } = info;
    if (!lastM || !info.last) return "";
    const v = ind.head === "yoy" ? lastM[2] : lastM[1];
    if (v == null) return "";
    return `<span>最新月 ${plabel(lastM[0])}：${headText(ind, v, false)}</span>`;
  }

  function cardHTML(id, { spark = false } = {}) {
    const info = latestInfo(id);
    const { ind, last } = info;
    const label = ind.head === "yoy" ? `${ind.name}（年增率）` : ind.name;
    return `<a class="card" href="${link.ind(id)}">
      <div class="tile-name"><span>${esc(label)}</span><span class="period">${last ? plabel(last[0]) : ""}</span></div>
      <div class="tile-value">${headText(ind, info.value)}</div>
      <div class="tile-meta"><span>${deltaText(ind, info.value, info.prevValue, "上季")}</span>${monthLine(info)}</div>
      ${pctBar(info.pct)}
      <div class="${spark ? "spark" : "mini"}" data-chart="${id}"></div>
      <div class="tile-info">
        <p><b>意義</b>${esc(ind.desc)}</p>
        ${ind.ref ? `<p><b>參考</b>${esc(ind.ref)}</p>` : ""}
      </div>
    </a>`;
  }

  function mountCardCharts(root, { spark = false, quarters = null } = {}) {
    root.querySelectorAll("[data-chart]").forEach((el) => {
      const ind = S.data.indicators[el.dataset.chart];
      let rows = headRows(ind, "Q").map((r) => [r[0], hv(ind, r)]);
      if (quarters) rows = rows.slice(-quarters);
      if (spark) sparkline(el, rows, ind);
      else seriesChart(el, rows, {
        kind: ind.head === "yoy" ? "bar" : "line", unit: headUnit(ind), compact: true,
        ref: REF_LINES[ind.id] ?? null, name: ind.head === "yoy" ? "年增率" : ind.name,
      });
    });
  }

  function setNav(active) {
    const items = [["overview", "總覽", link.home()]]
      .concat(S.data.categories.map((c) => [c.id, c.name, link.cat(c.id)]))
      .concat([["quarter", "季度快照", link.quarter()]]);
    $("#nav").innerHTML = items
      .map(([id, name, href]) => `<a href="${href}" class="${id === active ? "active" : ""}">${name}</a>`)
      .join("");
    const a = $("#nav a.active");
    if (a) a.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  // ------------------------------------------------------------------ 總覽
  function renderOverview(app) {
    setNav("overview");
    const D = S.data.indicators;
    const sig = D.signal_score.m[D.signal_score.m.length - 1];
    const light = lightOf(sig[1]);
    const clock = clockState(D.leading_dt);
    const pmi = D.pmi ? D.pmi.m[D.pmi.m.length - 1] : null;
    const gdp = D.gdp_growth.q[D.gdp_growth.q.length - 1];

    const summary = [
      `${plabel(sig[0])} 景氣對策信號為<b>${light.name}</b>（${sig[1]} 分，${light.desc}）`,
      clock ? `領先指標（不含趨勢）${num(clock.x)} 點，近 3 個月${clock.dy >= 0 ? "上升" : "下降"} ${num(Math.abs(clock.dy))} 點，處於<b>「${clock.phase}」</b>階段` : "",
      pmi ? `${plabel(pmi[0])} 製造業 PMI ${num(pmi[1], 1)}（${pmi[1] >= 50 ? "擴張" : "緊縮"}）` : "",
      `${plabel(gdp[0])} 經濟成長率 ${num(gdp[1])}%`,
    ].filter(Boolean).join("；") + "。";

    app.innerHTML = `
      <h1>總覽</h1>
      <p class="lead">以季度為主軸的台灣經濟指標。卡片數值為最新完整季度；年增率型指標顯示與去年同季相比的變化。點擊卡片可看長期走勢。</p>
      <div class="grid-hero">
        <div class="card">
          <div class="hero-title">景氣對策信號 · ${plabel(sig[0])}</div>
          <div class="light" style="margin-top:6px"><span class="light-dot" style="background:${light.color}"></span>${light.name} <small style="font-size:15px;font-weight:500;color:var(--text-2)">${sig[1]} 分</small></div>
          <div class="hero-sub">${light.desc}。分數區間：藍燈 9–16、黃藍燈 17–22、綠燈 23–31、黃紅燈 32–37、紅燈 38–45。</div>
        </div>
        <div class="card">
          <div class="hero-title">景氣摘要</div>
          <p class="summary">${summary}</p>
        </div>
      </div>
      <div class="section">
        <div class="section-head"><h2>關鍵指標</h2><span class="note">最新完整季度 · 迷你圖為近 5 年</span></div>
        <div class="grid" id="tiles">${S.data.overview.map((id) => cardHTML(id, { spark: true })).join("")}</div>
      </div>
      <div class="section grid-2">
        <div class="card">
          <div class="section-head"><h2>景氣循環時鐘</h2><a href="${link.ind("leading_dt")}" class="note">領先指標 →</a></div>
          <p class="note" style="margin:0">橫軸：領先指標（不含趨勢）高於或低於長期趨勢 100；縱軸：近 3 個月變動。軌跡為近 24 個月。</p>
          <div class="chart-clock" id="clock"></div>
        </div>
        <div class="card">
          <div class="section-head"><h2>景氣燈號分數</h2><a href="${link.ind("signal_score")}" class="note">詳細 →</a></div>
          <p class="note" style="margin:0">近 10 年每月分數；底色為五種燈號的分數區間。</p>
          <div class="chart-clock" id="signal"></div>
        </div>
      </div>`;
    mountCardCharts($("#tiles"), { spark: true, quarters: 20 });
    renderClock($("#clock"));
    renderSignal($("#signal"));
  }

  function renderClock(el) {
    const m = S.data.indicators.leading_dt.m;
    const pts = [];
    for (let i = Math.max(3, m.length - 24); i < m.length; i++) {
      pts.push([m[i][1], +(m[i][1] - m[i - 3][1]).toFixed(2), m[i][0]]);
    }
    const chart = mkChart(el);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const xr = Math.max(3, ...xs.map((x) => Math.abs(x - 100))) * 1.15;
    const yr = Math.max(1, ...ys.map((y) => Math.abs(y))) * 1.2;
    const c = css("--series-1"), muted = css("--muted");
    const qLabel = (text, pos) => Object.assign({ type: "text", silent: true }, pos, {
      style: { text, fill: muted, font: `600 12px ${css("--font")}` },
    });
    chart.setOption({
      animation: false,
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: Object.assign(tooltipBase(), {
        trigger: "item",
        formatter: (p) => `<b>${plabel(p.value[2])}</b><br>領先指標 ${num(p.value[0])}<br>3 個月變動 ${signed(p.value[1], 2)}`,
      }),
      xAxis: {
        type: "value", min: +(100 - xr).toFixed(1), max: +(100 + xr).toFixed(1),
        axisLabel: { color: muted, fontSize: 11, showMinLabel: false, showMaxLabel: false }, splitLine: { show: false },
        axisLine: { onZero: false, lineStyle: { color: css("--axis") } },
      },
      yAxis: {
        type: "value", min: +(-yr).toFixed(1), max: +yr.toFixed(1),
        axisLabel: { color: muted, fontSize: 11, showMinLabel: false, showMaxLabel: false }, splitLine: { show: false },
        axisLine: { onZero: false, lineStyle: { color: css("--axis") } },
      },
      // 象限名稱放在圖面四角外緣，避免和資料點重疊
      // 上方兩個在圖面上緣之外；下方兩個放在 x 軸標籤列兩端（該處的最小/最大刻度已隱藏）
      graphic: [
        qLabel("↖ 復甦", { left: 44, top: 0 }),
        qLabel("擴張 ↗", { right: 16, top: 0 }),
        qLabel("↙ 衰退", { left: 44, bottom: 6 }),
        qLabel("趨緩 ↘", { right: 16, bottom: 6 }),
      ],
      series: [{
        type: "line", data: pts, symbolSize: 6, showSymbol: true,
        lineStyle: { width: 1.5, color: c, opacity: 0.55 }, itemStyle: { color: c, opacity: 0.6 },
        markLine: {
          silent: true, symbol: "none", label: { show: false },
          lineStyle: { color: css("--axis"), type: "solid", width: 1 },
          data: [{ xAxis: 100 }, { yAxis: 0 }],
        },
        markPoint: {
          symbol: "circle", symbolSize: 12,
          itemStyle: { color: c, borderColor: css("--surface"), borderWidth: 2 },
          label: { show: true, position: "top", color: css("--text"), fontSize: 12, formatter: plabel(pts[pts.length - 1][2]) },
          data: [{ coord: pts[pts.length - 1].slice(0, 2), value: pts[pts.length - 1] }],
        },
      }],
    });
  }

  function renderSignal(el) {
    const m = S.data.indicators.signal_score.m;
    const rows = m.slice(-120).map((r) => [r[0], r[1]]);
    const chart = seriesChart(el, rows, { unit: "分", name: "燈號分數" });
    const bands = [[9, 16, "--light-blue", "藍"], [17, 22, "--light-yellowblue", "黃藍"], [23, 31, "--light-green", "綠"],
                   [32, 37, "--light-yellowred", "黃紅"], [38, 45, "--light-red", "紅"]];
    // 以淡色底帶標示五種燈號區間，右側附文字標籤（顏色不單獨承載意義）
    chart.setOption({
      yAxis: { min: 8.5, max: 45.5, scale: false, axisLabel: { show: false }, splitLine: { show: false } },
      grid: { right: 52, left: 8 },
      series: [{}, {
        type: "line", data: [], silent: true,
        markArea: {
          silent: true,
          data: bands.map(([lo, hi, c, name]) => [
            { yAxis: lo - 0.5, itemStyle: { color: css(c), opacity: 0.12 },
              label: { show: true, position: "right", distance: 6, color: css("--text-2"), fontSize: 11,
                       formatter: `${name}燈\n${lo}–${hi}` } },
            { yAxis: hi + 0.5 },
          ]),
        },
      }],
    });
  }

  // ------------------------------------------------------------------ 分類頁
  function renderCategory(app, cat) {
    const c = S.data.categories.find((x) => x.id === cat);
    if (!c) return renderNotFound(app);
    setNav(cat);
    const ids = Object.keys(S.data.indicators).filter((id) => S.data.indicators[id].cats.includes(cat));
    const comps = cat === "industry" ? S.data.comparisons : [];
    app.innerHTML = `
      <h1>${esc(c.name)}</h1>
      <p class="lead">${esc(CAT_DESC[cat] || "")}</p>
      ${cat === "cycle" ? `<div class="card section" style="margin-top:0">
          <div class="section-head"><h2>經濟成長率來源拆解</h2><span class="note">近 40 季 · 百分點</span></div>
          <div class="chart" id="contrib"></div></div>` : ""}
      ${comps.length ? `<div class="grid-2">${comps.map((cp) => `
          <div class="card"><div class="section-head"><h2>${esc(cp.title)}</h2><span class="note" data-cq="${cp.id}"></span></div>
          <div class="chart-sm" data-comp="${cp.id}"></div></div>`).join("")}</div>` : ""}
      <div class="section">
        <div class="section-head"><h2>指標</h2><span class="note">圖為 2000 年以來季資料（年增率型指標以長條顯示年增率）；灰色區間為景氣收縮期</span></div>
        <div class="grid" id="cards">${ids.map((id) => cardHTML(id)).join("")}</div>
      </div>`;
    mountCardCharts($("#cards"));
    if (cat === "cycle") renderContrib($("#contrib"));
    comps.forEach((cp) => renderComparison(app.querySelector(`[data-comp="${cp.id}"]`), cp, app.querySelector(`[data-cq="${cp.id}"]`)));
  }

  function renderContrib(el) {
    const D = S.data.indicators;
    const dom = D.gdp_c_domestic.q.slice(-40), ext = D.gdp_c_external.q.slice(-40), gdp = D.gdp_growth.q.slice(-40);
    const chart = mkChart(el);
    const opt = baseOption();
    opt.xAxis = { type: "category", data: gdp.map((r) => plabel(r[0])), axisTick: { show: false },
                  axisLine: { lineStyle: { color: css("--axis") } }, axisLabel: { color: css("--muted"), fontSize: 11, hideOverlap: true } };
    opt.yAxis.scale = false;
    opt.legend = { top: 0, left: 0, textStyle: { color: css("--text-2"), fontSize: 12 }, itemWidth: 12, itemHeight: 8 };
    opt.grid.top = 32;
    opt.tooltip.formatter = (ps) => `<b>${ps[0].axisValue}</b><br>` + ps.map((p) => `${p.marker}${p.seriesName} ${signed(p.value, 2)}`).join("<br>");
    const s1 = css("--series-1"), s2 = css("--series-2");
    opt.series = [
      { name: "國內需求", type: "bar", stack: "c", data: dom.map((r) => r[1]), itemStyle: { color: s1 }, barMaxWidth: 14 },
      { name: "國外淨需求", type: "bar", stack: "c", data: ext.map((r) => r[1]), itemStyle: { color: s2 }, barMaxWidth: 14 },
      { name: "經濟成長率", type: "line", data: gdp.map((r) => r[1]), showSymbol: false, symbolSize: 8,
        lineStyle: { color: css("--text"), width: 2 }, itemStyle: { color: css("--text") } },
    ];
    chart.setOption(opt);
  }

  function renderComparison(el, cp, noteEl) {
    const D = S.data.indicators;
    // 找出所有項目都有年增率的最新一季
    const sets = cp.items.map((id) => new Map(D[id].q.filter((r) => r[2] != null).map((r) => [r[0], r[2]])));
    const quarters = [...sets[0].keys()].filter((q) => sets.every((s) => s.has(q))).sort();
    const q = quarters[quarters.length - 1];
    if (!q) return;
    noteEl.textContent = plabel(q);
    const items = cp.items.map((id, i) => ({ id, name: D[id].name.replace(/^.*：/, "").replace(/生產$/, ""), v: sets[i].get(q) }))
      .sort((a, b) => a.v - b.v);
    const chart = mkChart(el);
    const pos = css("--rise"), neg = css("--fall");
    chart.setOption({
      animation: false,
      textStyle: { fontFamily: css("--font") },
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      tooltip: Object.assign(tooltipBase(), { trigger: "item", formatter: (p) => `${esc(items[p.dataIndex].name)}<br>年增率 ${signed(p.value, 1)}%` }),
      xAxis: { type: "value", axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => v + "%" },
               splitLine: { lineStyle: { color: css("--grid") } } },
      yAxis: { type: "category", data: items.map((x) => x.name), axisTick: { show: false },
               axisLine: { lineStyle: { color: css("--axis") } }, axisLabel: { color: css("--text-2"), fontSize: 12 } },
      series: [{
        type: "bar", barMaxWidth: 14, cursor: "pointer",
        data: items.map((x) => ({ value: x.v, itemStyle: { color: x.v >= 0 ? pos : neg, borderRadius: x.v >= 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] } })),
        label: { show: true, position: "right", color: css("--text-2"), fontSize: 11, formatter: (p) => signed(p.value, 1) + "%" },
      }],
    });
    chart.on("click", (p) => { location.hash = link.ind(items[p.dataIndex].id); });
  }

  // ------------------------------------------------------------------ 指標詳細頁
  function renderDetail(app, id) {
    const ind = S.data.indicators[id];
    if (!ind) return renderNotFound(app);
    setNav(ind.cats[0]);
    const st = S.detail;
    if (!ind.m) st.freq = "Q";
    const info = latestInfo(id);
    const allRows = rowsOf(ind, st.freq);
    const years = st.range === "all" ? null : +st.range;
    const cutoff = years ? Date.UTC(new Date().getUTCFullYear() - years, 0, 1) : -Infinity;
    const rows = allRows.filter((r) => periodDate(r[0]) >= cutoff);
    const cat = S.data.categories.find((c) => c.id === ind.cats[0]);
    const first = allRows[0][0], last = allRows[allRows.length - 1][0];
    const lastRow = allRows[allRows.length - 1];
    const fetched = ind.status.fetched ? new Date(ind.status.fetched).toLocaleDateString("zh-TW") : "–";

    app.innerHTML = `
      <div class="crumb"><a href="${link.cat(cat.id)}">${esc(cat.name)}</a> /</div>
      <h1>${esc(ind.name)}</h1>
      <p class="lead">${esc(ind.desc)}</p>
      ${ind.ref ? `<p class="ref"><b>參考價值：</b>${esc(ind.ref)}</p>` : ""}
      ${ind.status.ok === false ? `<div class="warn">最近一次更新失敗，目前顯示的是上次成功取得的資料。（${esc(ind.status.error || "")}）</div>` : ""}
      <div class="stats">
        <div class="card"><div class="stat-label">最新季 ${info.last ? plabel(info.last[0]) : ""}</div>
          <div class="stat-value">${headText(ind, info.value)}</div>
          <div class="stat-sub">${ind.head === "yoy" ? "年增率" : esc(ind.unit)}</div></div>
        ${ind.m ? `<div class="card"><div class="stat-label">最新月 ${plabel(ind.m[ind.m.length - 1][0])}</div>
          <div class="stat-value">${withUnit(ind.m[ind.m.length - 1][1], ind.unit)}</div>
          <div class="stat-sub">${ind.head === "yoy" ? "年增率 " + toned(ind.m[ind.m.length - 1][2], signed(ind.m[ind.m.length - 1][2]) + "%") : ""}</div></div>` : ""}
        <div class="card"><div class="stat-label">與上季相比</div>
          <div class="stat-value" style="font-size:16px">${deltaText(ind, info.value, info.prevValue, "上季") || "–"}</div></div>
        <div class="card"><div class="stat-label">歷史分位（季）</div>
          <div class="stat-value">${info.pct == null ? "–" : info.pct + "%"}</div>
          <div class="stat-sub">相對 ${plabel(headRows(ind, "Q")[0][0])} 以來所有季度</div></div>
        <div class="card"><div class="stat-label">資料來源</div>
          <div style="font-size:13px">${esc(ind.source)}</div>
          <div class="stat-sub">${plabel(first)}–${plabel(last)} · 抓取 ${fetched}</div></div>
      </div>
      <div class="controls">
        ${ind.m ? `<div class="seg" data-ctl="freq"><button data-v="Q" class="${st.freq === "Q" ? "on" : ""}">季</button><button data-v="M" class="${st.freq === "M" ? "on" : ""}">月</button></div>` : ""}
        <div class="seg" data-ctl="range">${[["5", "5 年"], ["10", "10 年"], ["all", "全部"]].map(([v, l]) =>
          `<button data-v="${v}" class="${st.range === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="note">${st.freq === "Q" && ind.m ? `季資料由月資料${{ mean: "平均", sum: "加總", last: "取季末值" }[ind.agg]}而得，只計完整季度` : ""}</span>
      </div>
      <div class="card"><div class="section-head"><h2>${ind.head === "yoy" ? "年增率" : "數值"}</h2><span class="note">${esc(headUnit(ind))} · 灰色區間為景氣收縮期</span></div>
        <div class="chart" id="c-head"></div></div>
      ${ind.head === "yoy" ? `<div class="card section" style="margin-top:12px"><div class="section-head"><h2>原始數值</h2><span class="note">${esc(ind.unit)}</span></div>
        <div class="chart" id="c-level"></div></div>` : ""}
      <div class="card section">
        <div class="section-head"><h2>資料表</h2>${IS_ARTIFACT
          ? `<a class="note" href="${SITE_URL}${link.ind(id)}" target="_blank" rel="noopener">到網站版下載 CSV ↗</a>`
          : `<button class="btn" id="dl">下載 CSV（${st.freq === "Q" ? "季" : "月"}）</button>`}</div>
        <div class="table-wrap"><table>
          <thead><tr><th>期間</th><th>數值（${esc(ind.unit)}）</th>${ind.head === "yoy" ? "<th>年增率</th>" : "<th>變動</th>"}</tr></thead>
          <tbody>${allRows.slice(-24).reverse().map((r, i, arr) => {
            const prev = arr[i + 1];
            const third = ind.head === "yoy" ? (r[2] == null ? "–" : toned(r[2], signed(r[2]) + "%"))
              : prev ? toned(r[1] - prev[1], signed(r[1] - prev[1], digitsFor(r[1]) || 2)) : "–";
            return `<tr><td>${plabel(r[0])}</td><td>${num(r[1])}</td><td>${third}</td></tr>`;
          }).join("")}</tbody>
        </table></div>
        <p class="note">顯示最近 24 期，完整資料請下載 CSV。</p>
      </div>`;

    const headData = rows.filter((r) => hv(ind, r) != null).map((r) => [r[0], hv(ind, r)]);
    seriesChart($("#c-head"), headData, {
      kind: ind.head === "yoy" ? "bar" : "line", unit: headUnit(ind), ref: REF_LINES[id] ?? null,
      name: ind.head === "yoy" ? "年增率" : ind.name,
    });
    if (ind.head === "yoy") {
      seriesChart($("#c-level"), rows.map((r) => [r[0], r[1]]), { unit: ind.unit, name: ind.name });
    }
    app.querySelectorAll("[data-ctl] button").forEach((b) => b.addEventListener("click", () => {
      st[b.parentElement.dataset.ctl] = b.dataset.v;
      render();
    }));
    if (!IS_ARTIFACT) $("#dl").addEventListener("click", () => {
      const head = ind.head === "yoy" ? "期間,數值,年增率(%)" : "期間,數值";
      const lines = allRows.map((r) => (ind.head === "yoy" ? [r[0], r[1], r[2] ?? ""] : [r[0], r[1]]).join(","));
      const blob = new Blob(["﻿" + head + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${id}_${st.freq === "Q" ? "quarterly" : "monthly"}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    void lastRow;
  }

  // ------------------------------------------------------------------ 季度快照
  function renderQuarter(app, quarter) {
    setNav("quarter");
    const D = S.data.indicators;
    const ids = Object.keys(D);
    const count = new Map();
    ids.forEach((id) => headRows(D[id], "Q").forEach((r) => count.set(r[0], (count.get(r[0]) || 0) + 1)));
    const quarters = [...count.keys()].filter((q) => q >= "2000-Q1").sort().reverse();
    const complete = quarters.find((q) => count.get(q) >= ids.length * 0.8) || quarters[0];
    const q = quarters.includes(quarter) ? quarter : complete;
    const [y, n] = q.split("-Q");
    const prevQ = n === "1" ? `${+y - 1}-Q4` : `${y}-Q${+n - 1}`;
    const lastYear = `${+y - 1}-Q${n}`;

    const seen = new Set();
    const groups = S.data.categories.map((c) => {
      const rows = ids.filter((id) => D[id].cats[0] === c.id || (!seen.has(id) && D[id].cats.includes(c.id)))
        .filter((id) => { if (seen.has(id)) return false; seen.add(id); return true; })
        .map((id) => {
          const ind = D[id];
          const hr = headRows(ind, "Q");
          const map = new Map(hr.map((r) => [r[0], hv(ind, r)]));
          const upto = hr.filter((r) => r[0] <= q).map((r) => hv(ind, r));
          const cur = map.get(q);
          return { id, ind, cur, prev: map.get(prevQ), ly: map.get(lastYear), pct: cur == null ? null : percentile(upto, cur) };
        });
      return { c, rows };
    }).filter((g) => g.rows.length);

    const cell = (ind, v) => (v == null ? "–" : ind.head === "yoy" ? toned(v, signed(v) + "%") : num(v) + (ind.unit === "%" ? "%" : ""));
    app.innerHTML = `
      <h1>季度快照</h1>
      <p class="lead">選擇一個季度，檢視當季所有指標。年增率型指標顯示年增率，其餘顯示季平均或季末值。歷史分位以 2000 年至該季為比較基準（不使用之後的資料）。</p>
      <div class="controls">
        <label class="note" for="qsel">季度</label>
        <select id="qsel">${quarters.map((x) => `<option value="${x}" ${x === q ? "selected" : ""}>${plabel(x)}${count.get(x) < ids.length * 0.8 ? "（資料未齊）" : ""}</option>`).join("")}</select>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>指標</th><th>${plabel(q)}</th><th>上季 ${plabel(prevQ)}</th><th>去年同季 ${plabel(lastYear)}</th><th>歷史分位</th><th>單位</th></tr></thead>
        <tbody>${groups.map((g) => `<tr class="group"><td colspan="6">${esc(g.c.name)}</td></tr>` + g.rows.map((r) => `
          <tr><td><a href="${link.ind(r.id)}">${esc(r.ind.name)}</a></td><td><b>${cell(r.ind, r.cur)}</b></td><td>${cell(r.ind, r.prev)}</td>
          <td>${cell(r.ind, r.ly)}</td><td>${r.pct == null ? "–" : r.pct + "%"}</td>
          <td class="note">${r.ind.head === "yoy" ? "年增率" : esc(r.ind.unit)}</td></tr>`).join("")).join("")}
        </tbody></table></div></div>`;
    $("#qsel").addEventListener("change", (e) => { location.hash = link.quarter(e.target.value); });
  }

  function renderNotFound(app) {
    setNav("");
    app.innerHTML = `<h1>找不到頁面</h1><p><a href="${link.home()}">回到總覽</a></p>`;
  }

  function renderFooter() {
    const gen = new Date(S.data.generated);
    const failed = Object.entries(S.data.indicators).filter(([, i]) => i.status.ok === false);
    $("#footer").innerHTML = `
      ${failed.length ? `<div class="warn" style="margin-bottom:10px">以下指標最近一次更新失敗，顯示的是上次資料：${failed.map(([id, i]) => `<a href="${link.ind(id)}">${esc(i.name)}</a>`).join("、")}</div>` : ""}
      <p>資料更新：${gen.toLocaleString("zh-TW", { hour12: false })}（${IS_ARTIFACT
        ? `成品區為發布當下的快照；每月 10 日、28 日自動更新的網站版：<a href="${SITE_URL}" target="_blank" rel="noopener">${SITE_URL}</a>`
        : "每月 10 日、28 日自動更新"}）</p>
      <p>資料來源：行政院主計總處總體統計資料庫、國家發展委員會、中央銀行、臺灣證券交易所。景氣收縮期依國發會公布之景氣循環峰谷日期${(() => {
        const c = S.data.cycles[S.data.cycles.length - 1];
        return c && !c.trough2 ? `；${esc(c.n)}高峰為 ${plabel(c.peak)}，谷底尚未認定` : "";
      })()}。</p>`;
  }

  // ------------------------------------------------------------------ 路由與主題
  function render() {
    disposeCharts();
    const app = $("#app");
    const [page, arg] = parseHash(location.hash);
    const scrollTop = window.scrollY;
    if (page === "c") renderCategory(app, arg);
    else if (page === "i") renderDetail(app, arg);
    else if (page === "q") renderQuarter(app, arg);
    else if (page === "overview") renderOverview(app);
    else renderNotFound(app);
    return scrollTop;
  }

  function parseHash(hash) {
    const h = hash.replace(/^#/, "");
    if (!h || h === "/" || h === "overview") return ["overview"];
    if (h.startsWith("/")) {  // 舊格式 #/c/x、#/i/x、#/q/x
      const [p, a] = h.slice(1).split("/");
      return [p, a];
    }
    if (h === "q") return ["q"];
    const m = h.match(/^([ciq])-(.+)$/);
    if (!m) return ["notfound"];
    return [m[1], m[1] === "i" ? m[2].replace(/-/g, "_") : m[2]];
  }

  let lastHash = null;
  function onRoute() {
    const top = render();
    // 同一頁面內切換控制項時保留捲動位置，換頁時回到頂端
    const page = location.hash.split("?")[0];
    window.scrollTo(0, page === lastHash ? top : 0);
    lastHash = page;
  }

  const THEMES = [["auto", "自動"], ["light", "淺色"], ["dark", "深色"]];
  function getTheme() { try { return localStorage.getItem("theme") || "auto"; } catch (e) { return "auto"; } }
  function applyTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    $("#theme-toggle").textContent = THEMES.find((x) => x[0] === t)[1];
  }
  function initTheme() {
    if (IS_ARTIFACT) {
      $("#theme-toggle").hidden = true;
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (S.data) { const top = render(); window.scrollTo(0, top); }
      });
      // Claude 介面切換主題時會改 data-theme，圖表需要重畫
      new MutationObserver(() => { if (S.data) { const top = render(); window.scrollTo(0, top); } })
        .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return;
    }
    applyTheme(getTheme());
    $("#theme-toggle").addEventListener("click", () => {
      const cur = getTheme();
      const next = THEMES[(THEMES.findIndex((x) => x[0] === cur) + 1) % THEMES.length][0];
      try { localStorage.setItem("theme", next); } catch (e) { /* 無法儲存時僅本次有效 */ }
      applyTheme(next);
      if (S.data) { const top = render(); window.scrollTo(0, top); }
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getTheme() === "auto" && S.data) { const top = render(); window.scrollTo(0, top); }
    });
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => S.charts.forEach((c) => c.resize()), 120);
  });

  initTheme();
  fetch("data/data.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      S.data = d;
      renderFooter();
      window.addEventListener("hashchange", onRoute);
      onRoute();
    })
    .catch((e) => {
      $("#app").innerHTML = `<h1>資料載入失敗</h1><p class="lead">請稍後重新整理頁面。（${esc(e.message)}）</p>`;
    });
})();
