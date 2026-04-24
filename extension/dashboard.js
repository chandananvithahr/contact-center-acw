"use strict";

const STORAGE_KEY_SUMMARIES = "summaries";

/**
 * Formats an ISO date string into a human-readable date/time.
 */
function formatDateTime(iso) {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formats a duration in seconds as "Xm Ys".
 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "Unknown duration";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Returns the sentiment badge CSS class suffix.
 */
function sentimentClass(sentiment) {
  const normalized = (sentiment || "").toLowerCase();
  if (normalized === "positive") return "positive";
  if (normalized === "negative") return "negative";
  return "neutral";
}

/**
 * Returns a sentiment emoji string for display.
 */
function sentimentEmoji(sentiment) {
  const normalized = (sentiment || "").toLowerCase();
  if (normalized === "positive") return "😊 Positive";
  if (normalized === "negative") return "😟 Negative";
  return "😐 Neutral";
}

/**
 * Converts a raw category string (snake_case) to a display label.
 */
function formatCategory(category) {
  if (!category) return "General";
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Renders a single summary row element.
 */
function renderSummaryRow(summaryData) {
  const row = document.createElement("div");
  row.className = "summary-row";

  const sentCls = sentimentClass(summaryData.sentiment);
  const actionItemsHtml =
    Array.isArray(summaryData.action_items) && summaryData.action_items.length > 0
      ? `<div class="action-items-section">
           <div class="action-items-label">Action Items</div>
           <ul class="action-items-list">
             ${summaryData.action_items
               .map((item) => `<li>${escapeHtml(item)}</li>`)
               .join("")}
           </ul>
         </div>`
      : "";

  const qualityHtml =
    summaryData.quality_score != null
      ? `<div class="quality-score">Quality: <strong>${Number(summaryData.quality_score).toFixed(1)} / 5.0</strong></div>`
      : "";

  row.innerHTML = `
    <div class="summary-meta-col">
      <div class="summary-datetime">${formatDateTime(summaryData.created_at)}</div>
      <div class="summary-duration">${formatDuration(summaryData.duration)}</div>
      <div class="badges">
        <span class="badge badge-category">${escapeHtml(formatCategory(summaryData.category))}</span>
        <span class="badge badge-sentiment-${sentCls}">${sentimentEmoji(summaryData.sentiment)}</span>
      </div>
      ${qualityHtml}
    </div>
    <div class="summary-content-col">
      <div class="summary-text">${escapeHtml(summaryData.summary || "No summary available.")}</div>
      ${actionItemsHtml}
    </div>
  `;

  return row;
}

/**
 * Minimal HTML escaping to prevent XSS when rendering stored text.
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Computes and renders the stats row from the summaries array.
 */
function renderStats(summaries) {
  const total = summaries.length;

  const scored = summaries.filter((s) => s.quality_score != null);
  const avgQuality =
    scored.length > 0
      ? (scored.reduce((sum, s) => sum + Number(s.quality_score), 0) / scored.length).toFixed(1)
      : null;

  const positiveCount = summaries.filter(
    (s) => (s.sentiment || "").toLowerCase() === "positive"
  ).length;

  const positivePercent =
    total > 0 ? Math.round((positiveCount / total) * 100) + "%" : "—";

  const categoryCounts = summaries.reduce((acc, s) => {
    const cat = s.category || "general";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const topCategory =
    Object.keys(categoryCounts).length > 0
      ? formatCategory(
          Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0][0]
        )
      : "—";

  document.getElementById("statTotal").textContent = total.toString();
  document.getElementById("statAvgQuality").textContent =
    avgQuality !== null ? `${avgQuality} / 5` : "—";
  document.getElementById("statPositive").textContent = positivePercent;
  document.getElementById("statTopCategory").textContent = topCategory;
}

/**
 * Main render function — populates the dashboard with summaries from storage.
 */
function renderDashboard(summaries) {
  const list = document.getElementById("summaryList");
  const empty = document.getElementById("emptyState");

  list.innerHTML = "";

  if (!summaries || summaries.length === 0) {
    empty.style.display = "block";
    renderStats([]);
    return;
  }

  empty.style.display = "none";
  renderStats(summaries);

  summaries.forEach((item) => {
    list.appendChild(renderSummaryRow(item));
  });
}

/**
 * Loads summaries from chrome.storage.local and renders the dashboard.
 */
async function loadAndRender() {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY_SUMMARIES]);
    const summaries = stored[STORAGE_KEY_SUMMARIES] ?? [];
    renderDashboard(summaries);
  } catch (error) {
    document.getElementById("summaryList").innerHTML =
      `<div style="color:#ef4444;padding:24px;">Failed to load summaries: ${escapeHtml(error.message)}</div>`;
  }
}

/**
 * Clears all summaries from storage after user confirmation.
 */
async function handleClearAll() {
  const confirmed = window.confirm(
    "Are you sure you want to delete all call summaries? This cannot be undone."
  );
  if (!confirmed) return;

  try {
    await chrome.runtime.sendMessage({ type: "CLEAR_SUMMARIES" });
    renderDashboard([]);
  } catch (error) {
    alert(`Failed to clear summaries: ${error.message}`);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  loadAndRender();
  document.getElementById("clearAllBtn").addEventListener("click", handleClearAll);
});
