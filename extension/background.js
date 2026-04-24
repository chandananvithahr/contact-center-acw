"use strict";

/**
 * ACW Assistant — Background Service Worker
 *
 * Listens for CALL_ENDED messages from content scripts, sends transcripts
 * to the FastAPI backend for AI summarization, stores results, and
 * shows a Chrome notification to the agent.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND_URL = "http://localhost:8000";
const STORAGE_KEYS = {
  AUTO_SUMMARIZE: "autoSummarize",
  LAST_SUMMARY: "lastSummary",
  LAST_SUMMARY_AT: "lastSummaryAt",
  SUMMARIES: "summaries",
  AGENT_ID: "agentId",
};

const MAX_STORED_SUMMARIES = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a unique agent ID for this installation if one doesn't exist.
 */
async function getOrCreateAgentId() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.AGENT_ID]);
  if (stored[STORAGE_KEYS.AGENT_ID]) {
    return stored[STORAGE_KEYS.AGENT_ID];
  }
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await chrome.storage.local.set({ [STORAGE_KEYS.AGENT_ID]: id });
  return id;
}

/**
 * Posts the transcript to the backend and returns the structured summary.
 */
async function requestSummary(transcript, duration, agentId) {
  const response = await fetch(`${BACKEND_URL}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, duration, agent_id: agentId }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Backend error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Persists the new summary to chrome.storage.local, capped at MAX_STORED_SUMMARIES.
 */
async function storeSummary(summaryData) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.SUMMARIES]);
  const existing = stored[STORAGE_KEYS.SUMMARIES] ?? [];

  const updated = [summaryData, ...existing].slice(0, MAX_STORED_SUMMARIES);

  await chrome.storage.local.set({
    [STORAGE_KEYS.SUMMARIES]: updated,
    [STORAGE_KEYS.LAST_SUMMARY]: summaryData.summary,
    [STORAGE_KEYS.LAST_SUMMARY_AT]: summaryData.created_at,
  });
}

/**
 * Shows a Chrome desktop notification to alert the agent.
 */
function showNotification(summaryData) {
  const sentimentEmoji =
    summaryData.sentiment === "positive"
      ? "Positive"
      : summaryData.sentiment === "negative"
      ? "Negative"
      : "Neutral";

  chrome.notifications.create(`acw-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: "Call summary ready",
    message: summaryData.summary.slice(0, 150),
    contextMessage: `Sentiment: ${sentimentEmoji} | Category: ${summaryData.category}`,
    priority: 1,
  });
}

/**
 * Core handler: receives CALL_ENDED, checks settings, calls backend, stores, notifies.
 */
async function handleCallEnded(message) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.AUTO_SUMMARIZE]);
  const autoSummarize = stored[STORAGE_KEYS.AUTO_SUMMARIZE] ?? true;

  if (!autoSummarize) return;

  const agentId = await getOrCreateAgentId();

  const transcript = message.transcript ?? "";
  const duration = message.duration ?? 0;

  // Don't summarize empty/trivial calls
  if (transcript.length < 5 && duration < 30) {
    return;
  }

  let summaryData;
  try {
    summaryData = await requestSummary(transcript, duration, agentId);
  } catch (error) {
    chrome.notifications.create(`acw-error-${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "ACW Assistant — Summary failed",
      message: "Could not reach the backend. Is the server running?",
      priority: 1,
    });
    return;
  }

  const enrichedSummary = {
    ...summaryData,
    agent_id: agentId,
    duration,
    transcript_preview: transcript.slice(0, 200),
    page_url: message.pageUrl ?? "",
    created_at: new Date().toISOString(),
  };

  await storeSummary(enrichedSummary);
  showNotification(enrichedSummary);
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CALL_ENDED") {
    handleCallEnded(message)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }

  if (message.type === "GET_SUMMARIES") {
    chrome.storage.local
      .get([STORAGE_KEYS.SUMMARIES])
      .then((stored) => {
        sendResponse({ summaries: stored[STORAGE_KEYS.SUMMARIES] ?? [] });
      })
      .catch((error) => {
        sendResponse({ summaries: [], error: error.message });
      });
    return true;
  }

  if (message.type === "CLEAR_SUMMARIES") {
    chrome.storage.local
      .set({ [STORAGE_KEYS.SUMMARIES]: [], [STORAGE_KEYS.LAST_SUMMARY]: null })
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ─── Installation Handler ─────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.local.set({
      [STORAGE_KEYS.AUTO_SUMMARIZE]: true,
      [STORAGE_KEYS.SUMMARIES]: [],
    });

    chrome.notifications.create("acw-installed", {
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "ACW Assistant installed",
      message:
        "Auto-summarize is enabled. Finish a call to generate your first summary.",
      priority: 1,
    });
  }
});
