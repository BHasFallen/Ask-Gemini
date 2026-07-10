// Powerbox for Gemini - pdf_preview.js
'use strict';

const params  = new URLSearchParams(location.search);
const dataKey = params.get('key');

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getMsgText(msg) {
  const content = msg[2];
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') return content.txt || content.text || '';
  return '';
}

function renderData(data) {
  const page    = document.getElementById('page');
  const loading = document.getElementById('loadingMsg');
  if (loading) loading.remove();

  const messages  = data.m  || [];
  const codeMap   = data.c  || {};
  const platform  = 'Google Gemini';
  const chatTitle = (data.chatTitle || 'Chat Export').trim();
  const dateStr   = new Date().toLocaleString();
  const msgCount  = messages.length;

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'doc-header';
  hdr.innerHTML =
    '<div class="doc-title">' + escHtml(chatTitle) + '</div>' +
    '<div class="doc-meta">' +
      '<span><span class="badge badge-platform">' + escHtml(platform) + '</span></span>' +
      '<span>💬 ' + msgCount + ' message' + (msgCount !== 1 ? 's' : '') + '</span>' +
      '<span>📅 ' + escHtml(dateStr) + '</span>' +
      '<span style="color:#94a3b8;font-size:10px">Powerbox Export</span>' +
    '</div>';
  page.appendChild(hdr);

  // Messages
  messages.forEach(function(msg, i) {
    const isUser  = msg[0] === 'u';
    const rawText = getMsgText(msg);

    // Build code block HTML
    let codeHtml = '';
    const content  = msg[2];
    if (content && typeof content === 'object') {
      const rawC     = content.c;
      const codeRefs = rawC ? (Array.isArray(rawC) ? rawC : [rawC]) : [];
      codeRefs.forEach(function(cid) {
        const entry = codeMap[cid];
        if (!entry) return;
        const lang = entry[0] || 'text';
        const body = entry[1] || '';
        codeHtml += '<pre><span class="code-lang">' + escHtml(lang) + '</span>' + escHtml(body) + '</pre>';
      });
    }

    const div = document.createElement('div');
    div.className = 'msg ' + (isUser ? 'msg-u' : 'msg-a');
    div.innerHTML =
      '<div class="msg-header">' +
        (isUser ? '👤 You' : '🤖 Gemini') +
        '<span class="msg-turn">Turn ' + (i + 1) + '</span>' +
      '</div>' +
      '<div class="msg-body">' + escHtml(rawText) + codeHtml + '</div>';
    page.appendChild(div);
  });

  document.getElementById('printBar').style.display = 'flex';
  document.title = chatTitle + ' — Powerbox';

  // Auto-trigger print
  setTimeout(function() { window.print(); }, 800);
}

function showError(msg) {
  const page    = document.getElementById('page');
  const loading = document.getElementById('loadingMsg');
  if (loading) loading.remove();
  const err = document.createElement('div');
  err.className   = 'error-msg';
  err.textContent = '⚠️ ' + msg;
  page.appendChild(err);
}

document.addEventListener('DOMContentLoaded', function() {
  const closeBtn = document.getElementById('closeBtn');
  const printBtn = document.getElementById('printBtn');
  if (closeBtn) closeBtn.addEventListener('click', function() { window.close(); });
  if (printBtn) printBtn.addEventListener('click', function() { window.print(); });
});

if (!dataKey) {
  showError('No data key found in URL.');
} else {
  chrome.storage.local.get(dataKey, function(res) {
    if (chrome.runtime.lastError) {
      showError('Could not read storage: ' + chrome.runtime.lastError.message);
      return;
    }
    const entry = res[dataKey];
    if (!entry || !entry.data) {
      showError('Chat data not found or expired.');
      return;
    }
    renderData(entry.data);
    chrome.storage.local.remove(dataKey);
  });
}
