function normalizeHexColor(v, fallback = "#ffffff") {
  if (typeof v !== "string") return fallback;
  const value = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return "#" + value.slice(1).split("").map((ch) => ch + ch).join("");
  }
  return fallback;
}

function isDarkHexColor(v) {
  const hex = normalizeHexColor(v, "#ffffff").slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
}

function sanitizeGraphicName(name = "chart") {
  return String(name || "chart").replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").trim() || "chart";
}

async function loadImageExporter() {
  return import("html-to-image");
}

function sanitizeExportClone(root, background) {
  if (!root) return;
  root.style.background = background;
  root.style.maxWidth = "none";
  root.style.maxHeight = "none";
  root.style.overflow = "visible";
  root.style.contain = "none";
  root.querySelectorAll("button,select,input,textarea,[data-export-control='true']").forEach((node) => {
    node.remove();
  });
  root.querySelectorAll("[data-export-sizable='true']").forEach((node) => {
    const explicitW = Number(node.dataset.exportWidth || 0);
    const explicitH = Number(node.dataset.exportHeight || 0);
    if (explicitW > 0) node.style.width = `${explicitW}px`;
    if (explicitH > 0) node.style.height = `${explicitH}px`;
    node.style.maxWidth = "none";
    node.style.maxHeight = "none";
    node.style.minWidth = "0";
    node.style.minHeight = "0";
    node.style.resize = "none";
    node.style.overflow = "hidden";
    node.style.boxSizing = "border-box";
  });
  root.querySelectorAll("*").forEach((node) => {
    node.style.maxWidth = node.style.maxWidth || "none";
    node.style.maxHeight = node.style.maxHeight || "none";
    if (node.style.resize) node.style.resize = "none";
  });
}

export async function exportChartGraphic({
  containerId,
  filename = "chart",
  format = "png",
  width = 1400,
  height = 800,
  scale = 2,
  background = "#ffffff",
  title = "",
  subtitle = "",
  note = "",
  includeTimestamp = false,
  headerAlign = "left",
}) {
  const el = document.getElementById(containerId);
  if (!el) throw new Error(`Chart container not found: ${containerId}`);
  const { toPng, toSvg } = await loadImageExporter();
  const safeName = sanitizeGraphicName(filename);
  const bg = normalizeHexColor(background, "#ffffff");
  const measuredW = Math.max(420, Math.round(width || 1200));
  const measuredH = Math.max(220, Math.round(height || 500));
  const targetW = Math.max(420, Math.round(width || measuredW));
  const headerHeight = (title || subtitle || note || includeTimestamp) ? 110 : 0;
  const ts = includeTimestamp ? `Generated: ${new Date().toLocaleString()}` : "";
  const targetH = Math.max(240, Math.round(height || (measuredH + headerHeight)));
  const textPrimary = isDarkHexColor(bg) ? "#e2e8f0" : "#0f172a";
  const textSecondary = isDarkHexColor(bg) ? "#94a3b8" : "#334155";
  const textMuted = "#64748b";

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (document?.fonts?.ready) {
    try { await document.fonts.ready; } catch {}
  }

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.padding = "0";
  host.style.margin = "0";
  host.style.background = bg;
  host.style.zIndex = "-1";
  host.style.display = "inline-block";
  host.style.width = `${measuredW}px`;

  const clone = el.cloneNode(true);
  clone.style.width = `${measuredW}px`;
  clone.style.maxWidth = "none";
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.padding = "0";
  clone.style.margin = "0";
  sanitizeExportClone(clone, bg);
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const captureWidth = Math.max(
      measuredW,
      Math.round(clone.scrollWidth || 0),
      Math.round(clone.getBoundingClientRect?.().width || 0),
    );
    const captureHeight = Math.max(
      measuredH,
      Math.round(clone.scrollHeight || 0),
      Math.round(clone.getBoundingClientRect?.().height || 0),
    );

    if (format === "svg") {
      const dataUrl = await toSvg(clone, {
        cacheBust: true,
        backgroundColor: bg,
        width: captureWidth,
        height: captureHeight,
        pixelRatio: 1,
      });
      const a = document.createElement("a");
      a.download = `${safeName}.svg`;
      a.href = dataUrl;
      a.click();
      return;
    }

    const chartPng = await toPng(clone, {
      cacheBust: true,
      backgroundColor: bg,
      width: captureWidth,
      height: captureHeight,
      canvasWidth: Math.max(1, Math.round(captureWidth * scale)),
      canvasHeight: Math.max(1, Math.round(captureHeight * scale)),
      pixelRatio: 1,
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(targetW * scale));
    canvas.height = Math.max(1, Math.round(targetH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = chartPng;
    });

    const hdrPx = Math.round(headerHeight * scale);
    if (headerHeight > 0) {
      const align = headerAlign === "center" ? "center" : "left";
      const textX = align === "center" ? Math.round(canvas.width / 2) : Math.round(18 * scale);
      ctx.textAlign = align;
      ctx.fillStyle = textPrimary;
      ctx.font = `${Math.round(22 * scale)}px Inter, Segoe UI, sans-serif`;
      if (title) ctx.fillText(String(title), textX, Math.round(28 * scale));
      ctx.fillStyle = textSecondary;
      ctx.font = `${Math.round(13 * scale)}px Inter, Segoe UI, sans-serif`;
      if (subtitle) ctx.fillText(String(subtitle), textX, Math.round(48 * scale));
      if (note || ts) {
        ctx.fillStyle = textMuted;
        ctx.font = `${Math.round(11 * scale)}px Inter, Segoe UI, sans-serif`;
        ctx.fillText([note, ts].filter(Boolean).join(" | "), textX, Math.round(66 * scale));
      }
      ctx.textAlign = "left";
    }

    const availW = canvas.width;
    const availH = Math.max(1, canvas.height - hdrPx);
    const fit = Math.min(availW / Math.max(1, img.width), availH / Math.max(1, img.height));
    const drawW = Math.max(1, Math.round(img.width * fit));
    const drawH = Math.max(1, Math.round(img.height * fit));
    const dx = Math.round((availW - drawW) / 2);
    const dy = hdrPx + Math.round((availH - drawH) / 2);
    ctx.drawImage(img, dx, dy, drawW, drawH);

    const a = document.createElement("a");
    a.download = `${safeName}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  } finally {
    document.body.removeChild(host);
  }
}

export async function exportTableGraphic({
  containerId,
  filename = "table_export",
  format = "png",
  width,
  height,
  scale = 2,
  background = "#ffffff",
  title = "",
  subtitle = "",
  note = "",
  includeTimestamp = true,
  borderMode = "auto",
}) {
  const el = document.getElementById(containerId);
  if (!el) throw new Error(`Table container not found: ${containerId}`);
  const { toPng, toSvg } = await loadImageExporter();
  const safeName = sanitizeGraphicName(filename);
  const bg = normalizeHexColor(background, "#ffffff");
  const sourceTable = el.querySelector("table");
  const baseWidth = Math.max(
    520,
    Math.round(width || 0),
    Math.round(sourceTable?.scrollWidth || 0),
    Math.round(el.scrollWidth || 0),
    Math.round(sourceTable?.getBoundingClientRect?.().width || 0),
    Math.round(el.getBoundingClientRect().width || 0),
  );
  const baseHeight = Math.max(
    180,
    Math.round(height || 0),
    Math.round(sourceTable?.scrollHeight || 0),
    Math.round(el.scrollHeight || 0),
    Math.round(sourceTable?.getBoundingClientRect?.().height || 0),
    Math.round(el.getBoundingClientRect().height || 0),
  );
  const textPrimary = isDarkHexColor(bg) ? "#e2e8f0" : "#0f172a";
  const textSecondary = isDarkHexColor(bg) ? "#94a3b8" : "#334155";
  const textMuted = "#64748b";
  const headerHeight = (title || subtitle || note || includeTimestamp) ? 110 : 0;
  const ts = includeTimestamp ? `Generated: ${new Date().toLocaleString()}` : "";

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.padding = "0";
  host.style.margin = "0";
  host.style.background = bg;
  host.style.zIndex = "-1";
  host.style.width = `${baseWidth}px`;
  host.style.display = "inline-block";

  const clone = el.cloneNode(true);
  clone.style.width = `${baseWidth}px`;
  clone.style.maxWidth = "none";
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.background = bg;
  clone.style.padding = "0";
  clone.style.margin = "0";
  clone.querySelectorAll("*").forEach((node) => {
    node.style.maxHeight = "none";
    if (node.style.overflowX) node.style.overflowX = "visible";
    if (node.style.overflowY) node.style.overflowY = "visible";
  });
  clone.querySelectorAll("table").forEach((tbl) => {
    tbl.style.width = `${baseWidth}px`;
    tbl.style.minWidth = `${baseWidth}px`;
    tbl.style.maxWidth = "none";
    tbl.style.tableLayout = "auto";
    tbl.style.borderCollapse = "collapse";
    tbl.style.background = bg;
  });
  const resolvedBorderMode = borderMode === "auto" ? "bordered" : borderMode;
  clone.querySelectorAll("th,td").forEach((cell) => {
    cell.style.whiteSpace = "nowrap";
    cell.style.overflow = "visible";
    cell.style.textOverflow = "clip";
    cell.style.padding = cell.tagName === "TH" ? "8px 10px" : "7px 10px";
    if (resolvedBorderMode === "clean") {
      cell.style.border = "none";
      cell.style.borderBottom = `1px solid ${isDarkHexColor(bg) ? "#1f2937" : "#dbe4ee"}`;
    } else {
      cell.style.border = `1px solid ${isDarkHexColor(bg) ? "#334155" : "#cbd5e1"}`;
    }
  });
  clone.querySelectorAll("thead tr").forEach((row) => {
    row.style.background = isDarkHexColor(bg) ? "#0f172a" : "#f8fafc";
  });
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (document?.fonts?.ready) {
      try { await document.fonts.ready; } catch {}
    }
    const captureWidth = Math.max(baseWidth, Math.round(clone.scrollWidth || baseWidth));
    const captureHeight = Math.max(baseHeight, Math.round(clone.scrollHeight || baseHeight));

    if (format === "svg") {
      const dataUrl = await toSvg(clone, {
        cacheBust: true,
        backgroundColor: bg,
        width: captureWidth,
        height: captureHeight,
        pixelRatio: 1,
      });
      const a = document.createElement("a");
      a.download = `${safeName}.svg`;
      a.href = dataUrl;
      a.click();
      return;
    }

    const tablePng = await toPng(clone, {
      cacheBust: true,
      backgroundColor: bg,
      width: captureWidth,
      height: captureHeight,
      canvasWidth: Math.max(1, Math.round(captureWidth * scale)),
      canvasHeight: Math.max(1, Math.round(captureHeight * scale)),
      pixelRatio: 1,
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(captureWidth * scale));
    canvas.height = Math.max(1, Math.round((captureHeight + headerHeight) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = tablePng;
    });

    const hdrPx = Math.round(headerHeight * scale);
    if (headerHeight > 0) {
      ctx.fillStyle = textPrimary;
      ctx.font = `${Math.round(22 * scale)}px Inter, Segoe UI, sans-serif`;
      if (title) ctx.fillText(String(title), Math.round(18 * scale), Math.round(28 * scale));
      ctx.fillStyle = textSecondary;
      ctx.font = `${Math.round(13 * scale)}px Inter, Segoe UI, sans-serif`;
      if (subtitle) ctx.fillText(String(subtitle), Math.round(18 * scale), Math.round(48 * scale));
      if (note || ts) {
        ctx.fillStyle = textMuted;
        ctx.font = `${Math.round(11 * scale)}px Inter, Segoe UI, sans-serif`;
        ctx.fillText([note, ts].filter(Boolean).join(" | "), Math.round(18 * scale), Math.round(66 * scale));
      }
    }

    ctx.drawImage(img, 0, hdrPx);

    const a = document.createElement("a");
    a.download = `${safeName}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  } finally {
    document.body.removeChild(host);
  }
}
