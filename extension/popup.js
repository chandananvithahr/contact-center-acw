"use strict";

const BACKEND_URL = "http://localhost:8000";
const STORAGE_KEYS = {
  AUTO_SUMMARIZE: "autoSummarize",
  LAST_SUMMARY: "lastSummary",
  LAST_SUMMARY_AT: "lastSummaryAt",
};

/**
 * Checks backend connectivity by pinging the health endpoint.
 * Returns true if connected, false otherwise.
 */
async function checkBackendStatus() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Updates the status badge UI based on connection state.
 */
function renderStatus(isConnected) {
  const badge = document.getElementById("statusBadge");
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");

  if (isConnected) {
    badge.className = "status-badge connected";
    dot.className = "status-dot connected";
    text.textContent = "Connected";
  } else {
    badge.className = "status-badge disconnected";
    dot.className = "status-dot disconnected";
    text.textContent = "Disconnected";
  }
}

/**
 * Renders the last summary preview with truncation to 200 characters.
 */
function renderSummaryPreview(summary, summaryAt) {
  const preview = document.getElementById("summaryPreview");
  const meta = document.getElementById("summaryMeta");

  if (!summary) {
    preview.className = "summary-preview";
    preview.textContent =
      "No summaries yet. Enable auto-summarize and finish a call to see your first summary.";
    meta.textContent = "";
    return;
  }

  const truncated =
    summary.length > 200 ? `${summary.slice(0, 200)}...` : summary;
  preview.className = "summary-preview has-content";
  preview.textContent = truncated;

  if (summaryAt) {
    const date = new Date(summaryAt);
    meta.textContent = `Last updated: ${date.toLocaleString()}`;
  }
}

/**
 * Loads stored settings and renders the popup UI.
 */
async function initializePopup() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.AUTO_SUMMARIZE,
    STORAGE_KEYS.LAST_SUMMARY,
    STORAGE_KEYS.LAST_SUMMARY_AT,
  ]);

  const toggle = document.getElementById("autoSummarizeToggle");
  toggle.checked = stored[STORAGE_KEYS.AUTO_SUMMARIZE] ?? true;

  renderSummaryPreview(
    stored[STORAGE_KEYS.LAST_SUMMARY] ?? null,
    stored[STORAGE_KEYS.LAST_SUMMARY_AT] ?? null
  );

  const isConnected = await checkBackendStatus();
  renderStatus(isConnected);
}

/**
 * Saves the auto-summarize toggle state to storage.
 */
async function handleToggleChange(event) {
  const isEnabled = event.target.checked;
  await chrome.storage.local.set({
    [STORAGE_KEYS.AUTO_SUMMARIZE]: isEnabled,
  });
}

/**
 * Opens the dashboard page in a new tab.
 */
async function handleViewAll(event) {
  event.preventDefault();
  await chrome.tabs.create({ url: `${BACKEND_URL}/dashboard` });
  window.close();
}

/**
 * Opens the settings page in a new tab.
 */
async function handleSettings(event) {
  event.preventDefault();
  await chrome.tabs.create({ url: `${BACKEND_URL}/settings` });
  window.close();
}

document.addEventListener("DOMContentLoaded", () => {
  initializePopup().catch(console.error);

  document
    .getElementById("autoSummarizeToggle")
    .addEventListener("change", handleToggleChange);

  document
    .getElementById("viewAllLink")
    .addEventListener("click", handleViewAll);

  document
    .getElementById("settingsLink")
    .addEventListener("click", handleSettings);
});
