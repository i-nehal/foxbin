/* -------------------------------------------------------------
 * FoxBin.dev App Controller (API-based SQLite backend)
 * ------------------------------------------------------------- */

// Admin token key in LocalStorage for persistence of login sessions
const ADMIN_TOKEN_KEY = 'foxbin_admin_token';
const MY_PASTES_KEY = 'foxbin_my_pastes'; // Track pastes created by this browser locally for editing permissions

// Base URL helper for API calls
const API_BASE = window.location.origin;

// Get Auth Token
function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

// Set Auth Token
function setAdminToken(token) {
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

// Fetch Ads and Render
async function loadAds() {
  try {
    const res = await fetch(`${API_BASE}/api/ad`);
    const data = await res.json();
    const adCode = data.ad_code || '';
    
    const topAdEl = document.getElementById('topAdBanner');
    const bottomAdEl = document.getElementById('bottomAdBanner');

    if (adCode.trim()) {
      topAdEl.innerHTML = adCode;
      bottomAdEl.innerHTML = adCode;
      topAdEl.style.display = 'block';
      bottomAdEl.style.display = 'block';
    } else {
      topAdEl.innerHTML = '';
      bottomAdEl.innerHTML = '';
      topAdEl.style.display = 'none';
      bottomAdEl.style.display = 'none';
    }
  } catch (e) {
    console.error("Failed to load ads", e);
  }
}

// Owner validation
function registerMyPaste(id) {
  try {
    const list = JSON.parse(localStorage.getItem(MY_PASTES_KEY)) || [];
    list.push(id);
    localStorage.setItem(MY_PASTES_KEY, JSON.stringify(list));
  } catch(e) {}
}

function isPasteOwner(id) {
  try {
    const list = JSON.parse(localStorage.getItem(MY_PASTES_KEY)) || [];
    return list.includes(id);
  } catch(e) {
    return false;
  }
}

// Time formatter
function timeAgo(pastTimestamp) {
  const seconds = Math.floor((Date.now() - pastTimestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Expiration checking (Frontend hint)
function hasExpired(paste) {
  if (paste.expiration === 'never') return false;
  let duration = 0;
  switch (paste.expiration) {
    case '10m': duration = 10 * 60 * 1000; break;
    case '1h': duration = 60 * 60 * 1000; break;
    case '1d': duration = 24 * 60 * 60 * 1000; break;
    case '1w': duration = 7 * 24 * 60 * 60 * 1000; break;
    default: return false;
  }
  return (Date.now() - paste.createdAt) >= duration;
}

// SEO Tags dynamic writers
function updateSEOHeaders(title, description, queryPath = '') {
  const finalTitle = `${title} — FoxBin.dev`;
  document.getElementById('pageTitle').textContent = finalTitle;
  document.title = finalTitle;
  
  const metaDesc = document.getElementById('pageMetaDesc');
  if (metaDesc) {
    metaDesc.setAttribute('content', description.substring(0, 150));
  }

  // Canonical tag updates
  const fullUrl = `${window.location.origin}/${queryPath}`;
  const canonical = document.getElementById('canonicalTag');
  if (canonical) canonical.setAttribute('href', fullUrl);

  // OpenGraph tag updates
  const ogTitle = document.getElementById('ogTitle');
  const ogDesc = document.getElementById('ogDesc');
  const ogUrl = document.getElementById('ogUrl');
  if (ogTitle) ogTitle.setAttribute('content', finalTitle);
  if (ogDesc) ogDesc.setAttribute('content', description.substring(0, 150));
  if (ogUrl) ogUrl.setAttribute('content', fullUrl);

  // Twitter card updates
  const twTitle = document.getElementById('twitterTitle');
  const twDesc = document.getElementById('twitterDesc');
  const twUrl = document.getElementById('twitterUrl');
  if (twTitle) twTitle.setAttribute('content', finalTitle);
  if (twDesc) twDesc.setAttribute('content', description.substring(0, 150));
  if (twUrl) twUrl.setAttribute('content', fullUrl);
}

// Markdown parser
function parseMarkdown(md) {
  let html = md;
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*)\*/gim, '<em>$1</em>');
  html = html.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');
  html = html.replace(/^\s*-\s+(.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/^\s*\*\s+(.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<ol><li>$1</li></ol>');
  html = html.replace(/<\/ul>\s*<ul>/gim, '');
  html = html.replace(/<\/ol>\s*<ol>/gim, '');
  html = html.replace(/\n$/gim, '<br />');
  return html;
}

// Router
function route() {
  const hash = window.location.hash || '#/new';
  const sections = document.querySelectorAll('.view-section');
  sections.forEach(s => s.classList.remove('active'));

  document.getElementById('navNewBtn').style.fontWeight = '500';
  document.getElementById('navPastesBtn').style.fontWeight = '500';
  document.getElementById('navDocsBtn').style.fontWeight = '500';
  document.getElementById('navAdminBtn').style.fontWeight = '500';

  // Toggle visible Admin link only if session token exists
  const adminBtn = document.getElementById('navAdminBtn');
  if (getAdminToken()) {
    adminBtn.style.display = 'inline-flex';
  } else {
    adminBtn.style.display = 'none';
  }

  if (hash.startsWith('#/paste/')) {
    const query = decodeURIComponent(hash.replace('#/paste/', ''));
    showPasteView(query);
  } else if (hash === '#/pastes') {
    document.getElementById('navPastesBtn').style.fontWeight = '600';
    showListView();
  } else if (hash === '#/docs') {
    document.getElementById('navDocsBtn').style.fontWeight = '600';
    showDocsView();
  } else if (hash === '#/admin') {
    document.getElementById('navAdminBtn').style.fontWeight = '600';
    showAdminView();
  } else {
    document.getElementById('navNewBtn').style.fontWeight = '600';
    document.getElementById('createView').classList.add('active');
    updateSEOHeaders("Create Snippet", "FoxBin.dev is a clean, warm-canvas editorial code pasteboard. Share codes and notes instantly.", '#/new');
  }
}

let isMarkdownPreviewOn = false;

// Views
async function showPasteView(query) {
  const pasteViewEl = document.getElementById('pasteView');
  
  try {
    const res = await fetch(`${API_BASE}/api/pastes/${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("Not Found");
    const paste = await res.json();

    if (hasExpired(paste)) {
      throw new Error("Expired");
    }

    if (!document.getElementById('viewTitle')) {
      window.location.reload();
      return;
    }

    isMarkdownPreviewOn = false;
    document.getElementById('codeWindowSection').className = 'code-window-card';
    document.getElementById('markdownPreviewBlock').style.display = 'none';

    // Populate
    document.getElementById('viewTitle').textContent = paste.title || 'Untitled Paste';
    document.getElementById('viewLanguageBadge').textContent = paste.language;
    document.getElementById('viewVisibilityBadge').textContent = paste.visibility;
    document.getElementById('viewCodeBadge').textContent = `Code: ${paste.code}`;
    document.getElementById('codeWindowLang').textContent = paste.alias ? `${paste.alias}.${getFileExtension(paste.language)}` : `snippet.${getFileExtension(paste.language)}`;
    
    const expiryLabel = paste.expiration === 'never' ? 'Never' : paste.expiration;
    document.getElementById('viewExpiryBadge').textContent = `Expires: ${expiryLabel}`;
    document.getElementById('viewCreatedTime').textContent = timeAgo(paste.createdAt);

    const codeBlock = document.getElementById('codeBlock');
    codeBlock.className = `hljs ${paste.language}`;
    codeBlock.textContent = paste.content;
    
    // Markdown Preview Config
    const mdPreviewBlock = document.getElementById('markdownPreviewBlock');
    if (paste.language === 'markdown') {
      document.getElementById('toggleMarkdownBtn').style.display = 'inline-flex';
      mdPreviewBlock.innerHTML = parseMarkdown(escapeHtml(paste.content));
    } else {
      document.getElementById('toggleMarkdownBtn').style.display = 'none';
    }

    // Owner checks
    const ownerActions = document.getElementById('ownerActions');
    if (isPasteOwner(paste.id) || getAdminToken()) {
      ownerActions.classList.add('show');
    } else {
      ownerActions.classList.remove('show');
    }

    hljs.highlightElement(codeBlock);
    updateSEOHeaders(
      paste.title || "Untitled Snippet", 
      `Read snippet "${paste.title || 'Untitled'}" published in ${paste.language}. ${paste.content.substring(0, 100)}...`,
      `#/paste/${paste.alias || paste.id}`
    );

    // Actions
    document.getElementById('copyBtn').onclick = () => copyCodeToClipboard(paste.content);
    document.getElementById('rawBtn').onclick = () => openRawView(paste.content);
    document.getElementById('shareBtn').onclick = () => copyShareLink(paste.alias || paste.id);
    document.getElementById('toggleMarkdownBtn').onclick = () => toggleMarkdownPreview();
    document.getElementById('deleteBtn').onclick = () => handleDeletePaste(paste.id);
    document.getElementById('editBtn').onclick = () => handleStartEdit(paste);

    pasteViewEl.classList.add('active');
  } catch (err) {
    pasteViewEl.innerHTML = `
      <div class="feature-card" style="text-align: center; padding: 64px 32px;">
        <h2 class="display-sm" style="color: var(--color-error); margin-bottom: 16px;">Snippet Not Found or Expired</h2>
        <p style="color: var(--color-muted); margin-bottom: 24px;">The paste code or alias "${escapeHtml(query)}" has expired, does not exist, or was deleted.</p>
        <a href="#/new" class="btn btn-primary">Create a New Paste</a>
      </div>
    `;
    pasteViewEl.classList.add('active');
    updateSEOHeaders("Snippet Not Found", "The requested paste code or alias has expired or does not exist on FoxBin.dev.", `#/paste/${query}`);
  }
}

function toggleMarkdownPreview() {
  const win = document.getElementById('codeWindowSection');
  const btn = document.getElementById('toggleMarkdownBtn');
  const mdPreviewBlock = document.getElementById('markdownPreviewBlock');
  isMarkdownPreviewOn = !isMarkdownPreviewOn;

  if (isMarkdownPreviewOn) {
    win.classList.add('show-md-preview');
    win.classList.add('hide-code');
    mdPreviewBlock.style.display = 'block';
    btn.textContent = "Show Raw Markdown";
  } else {
    win.classList.remove('show-md-preview');
    win.classList.remove('hide-code');
    mdPreviewBlock.style.display = 'none';
    btn.textContent = "Preview Markdown";
  }
}

// Edit Snippet
function handleStartEdit(paste) {
  const editPane = document.getElementById('editPane');
  const editArea = document.getElementById('editArea');
  editArea.value = paste.content;
  editPane.classList.add('show');

  document.getElementById('cancelEditBtn').onclick = () => {
    editPane.classList.remove('show');
  };

  document.getElementById('saveEditBtn').onclick = async () => {
    const updatedContent = editArea.value;
    try {
      const res = await fetch(`${API_BASE}/api/pastes/${paste.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: jsonBody({ content: updatedContent, createdAt: Date.now() })
      });
      if (res.ok) {
        showToast("Paste updated successfully!");
        editPane.classList.remove('show');
        showPasteView(paste.id);
      }
    } catch(e) {
      showToast("Failed to edit snippet.");
    }
  };
}

async function handleDeletePaste(id) {
  if (confirm("Are you sure you want to delete this paste? This action cannot be undone.")) {
    try {
      const res = await fetch(`${API_BASE}/api/pastes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getAdminToken()}` }
      });
      if (res.ok) {
        showToast("Paste deleted successfully.");
        if (window.location.hash === '#/admin') {
          showAdminView();
        } else {
          window.location.hash = "#/new";
        }
      }
    } catch(e) {
      showToast("Failed to delete snippet.");
    }
  }
}

// Show library lists
let librarySearchTimeout = null;
async function showListView() {
  const listEl = document.getElementById('pastesList');
  listEl.innerHTML = `<div style="text-align: center; color: var(--color-muted); padding: 40px;">Fetching snippets...</div>`;
  
  try {
    const res = await fetch(`${API_BASE}/api/pastes`);
    const db = await res.json();

    const renderList = (filterQuery = '') => {
      let filtered = db.filter(p => !hasExpired(p));

      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase();
        filtered = filtered.filter(p => 
          (p.title && p.title.toLowerCase().includes(q)) ||
          (p.content && p.content.toLowerCase().includes(q)) ||
          (p.language && p.language.toLowerCase().includes(q)) ||
          (p.code && p.code.toLowerCase().includes(q))
        );
      }

      if (filtered.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state">
            <p>No matching pastes found. Make a public paste to see it here!</p>
            <a href="#/new" class="btn btn-primary">Create Public Paste</a>
          </div>
        `;
      } else {
        listEl.innerHTML = filtered.map(paste => `
          <div class="paste-summary-card">
            <div class="summary-top">
              <h3><a href="#/paste/${paste.alias || paste.id}">${escapeHtml(paste.title || 'Untitled Paste')}</a></h3>
              <div class="summary-badges">
                <span class="badge-pill">${paste.language}</span>
                <span class="badge-pill">${timeAgo(paste.createdAt)}</span>
                <span class="badge-pill code-badge">${paste.code}</span>
              </div>
              <div class="summary-snippet">${escapeHtml(paste.content.substring(0, 100))}</div>
            </div>
            <div class="summary-bottom">
              <span>Expiry: ${paste.expiration}</span>
              <a href="#/paste/${paste.alias || paste.id}" class="button-text-link">View Paste &rarr;</a>
            </div>
          </div>
        `).join('');
      }
    };

    const searchInput = document.getElementById('librarySearchInput');
    searchInput.value = '';
    searchInput.oninput = (e) => {
      clearTimeout(librarySearchTimeout);
      librarySearchTimeout = setTimeout(() => {
        renderList(e.target.value);
      }, 200);
    };

    renderList();
  } catch (e) {
    listEl.innerHTML = `<div style="text-align: center; color: var(--color-error); padding: 40px;">Failed to fetch snippets from SQLite server.</div>`;
  }

  document.getElementById('listView').classList.add('active');
  updateSEOHeaders("Snippet Library", "Browse publicly shared code templates, snippets, and notes on FoxBin.dev.", '#/pastes');
}

// Show API documentation page
function showDocsView() {
  document.getElementById('docsView').classList.add('active');
  updateSEOHeaders("Developer API Docs", "FoxBin.dev REST API endpoints documentation. Create, get, and manage pastes from the CLI.", '#/docs');
}

// Show Admin Dashboard (Access Guarded)
async function showAdminView() {
  const token = getAdminToken();
  const loginPanel = document.getElementById('adminLoginPanel');
  const dashboardContent = document.getElementById('adminDashboardContent');
  
  document.getElementById('adminView').classList.add('active');

  if (!token) {
    loginPanel.style.display = 'block';
    dashboardContent.style.display = 'none';
    updateSEOHeaders("Admin Panel Login", "Sign in to access FoxBin telemetry metrics and advertising configurations.", '#/admin');
    return;
  }

  loginPanel.style.display = 'none';
  dashboardContent.style.display = 'block';

  try {
    const res = await fetch(`${API_BASE}/api/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.status === 401) {
      setAdminToken('');
      showAdminView();
      return;
    }

    const data = await res.json();
    
    // Set statistics
    document.getElementById('statTotalPastes').textContent = data.total_pastes;
    document.getElementById('statVisibilityRatio').textContent = `${data.public_pastes} / ${data.private_pastes}`;
    document.getElementById('statTotalSize').textContent = data.db_size;

    // Set languages
    const langListEl = document.getElementById('statLanguagesList');
    if (!data.languages || data.languages.length === 0) {
      langListEl.innerHTML = `<span style="color: var(--color-muted);">No language statistics to report.</span>`;
    } else {
      langListEl.innerHTML = data.languages.map(lang => `
        <span class="language-stat-chip">
          ${lang.language} <span class="count">${lang.count}</span>
        </span>
      `).join('');
    }

    // Populate recent activities (Fetch all from pastes API)
    const listRes = await fetch(`${API_BASE}/api/pastes`);
    const allPastes = await listRes.json();
    
    const tableBody = document.getElementById('adminRecentPastesBody');
    if (allPastes.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-muted);">No pastes recorded in database.</td></tr>`;
    } else {
      tableBody.innerHTML = allPastes.map(paste => `
        <tr>
          <td><strong>${escapeHtml(paste.title)}</strong></td>
          <td>${paste.language}</td>
          <td><code>${paste.code}</code></td>
          <td>${paste.visibility}</td>
          <td>${paste.expiration}</td>
          <td>${timeAgo(paste.createdAt)}</td>
          <td>
            <button class="admin-btn-delete" data-id="${paste.id}">Delete</button>
          </td>
        </tr>
      `).join('');

      tableBody.querySelectorAll('.admin-btn-delete').forEach(btn => {
        btn.onclick = (e) => {
          const id = e.target.getAttribute('data-id');
          handleDeletePaste(id);
        };
      });
    }

    // Load ad scripts to form input
    const adRes = await fetch(`${API_BASE}/api/ad`);
    const adData = await adRes.json();
    document.getElementById('adPlacerTextarea').value = adData.ad_code || '';

  } catch (e) {
    showToast("Failed to fetch admin statistics.");
  }

  updateSEOHeaders("Admin Panel Dashboard", "Website administration dashboard, telemetry logs, and advertising banner configurations.", '#/admin');
}

// Submit Admin Login Form
document.getElementById('adminLoginForm').onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('adminUsername').value;
  const password = document.getElementById('adminPassword').value;

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody({ username, password })
    });

    if (res.ok) {
      const data = await res.json();
      setAdminToken(data.token);
      showToast("Access Granted. Welcome back!");
      document.getElementById('adminUsername').value = '';
      document.getElementById('adminPassword').value = '';
      
      // Update nav button visibility and show dashboard
      document.getElementById('navAdminBtn').style.display = 'inline-flex';
      showAdminView();
    } else {
      showToast("Access Denied. Invalid credentials.");
    }
  } catch (e) {
    showToast("Failed to authenticate with backend.");
  }
};

// Admin Logout
document.getElementById('adminLogoutBtn').onclick = () => {
  setAdminToken('');
  showToast("Logged out successfully.");
  document.getElementById('navAdminBtn').style.display = 'none';
  showAdminView();
};

// Save Ad integration
document.getElementById('saveAdBtn').onclick = async () => {
  const adCode = document.getElementById('adPlacerTextarea').value;
  try {
    const res = await fetch(`${API_BASE}/api/ad`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAdminToken()}`
      },
      body: jsonBody({ ad_code: adCode })
    });
    if (res.ok) {
      showToast("Advertising code integration updated.");
      loadAds(); // Reload banners in real-time
    }
  } catch (e) {
    showToast("Failed to save ad configuration.");
  }
};

// Search / Quick retrieve handler
document.getElementById('quickCodeBtn').onclick = performQuickRetrieval;
document.getElementById('quickCodeInput').onkeydown = (e) => {
  if (e.key === 'Enter') performQuickRetrieval();
};

async function performQuickRetrieval() {
  const val = document.getElementById('quickCodeInput').value.trim();
  if (!val) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/pastes/${encodeURIComponent(val)}`);
    if (res.ok) {
      const paste = await res.json();
      document.getElementById('quickCodeInput').value = '';
      window.location.hash = `#/paste/${paste.alias || paste.id}`;
    } else {
      showToast(`Code or Alias "${val}" not found!`);
    }
  } catch(e) {
    showToast("Server query failed.");
  }
}

// Helpers
function jsonBody(obj) {
  return JSON.stringify(obj);
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFileExtension(lang) {
  const exts = {
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    html: 'html',
    css: 'css',
    json: 'json',
    markdown: 'md',
    rust: 'rs',
    go: 'go',
    cpp: 'cpp',
    sql: 'sql',
    bash: 'sh'
  };
  return exts[lang] || 'txt';
}

function generateShortCode() {
  return 'FB-' + Math.floor(1000 + Math.random() * 9000);
}

function generateUUID() {
  return 'fb_' + Math.random().toString(36).substr(2, 9);
}

function copyCodeToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Code copied to clipboard!');
    const feedback = document.getElementById('copyFeedback');
    if (feedback) {
      feedback.classList.add('show');
      setTimeout(() => feedback.classList.remove('show'), 2000);
    }
  });
}

// Open RAW text representation
function openRawView(text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

function copyShareLink(key) {
  const link = `${window.location.origin}${window.location.pathname}#/paste/${encodeURIComponent(key)}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Share link copied to clipboard!');
  });
}

// Submit Create Snippet Form
document.getElementById('pasteForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const content = document.getElementById('pasteCode').value;
  const title = document.getElementById('pasteTitle').value.trim() || 'Untitled Snippet';
  const language = document.getElementById('pasteLanguage').value;
  const expiration = document.getElementById('pasteExpiration').value;
  const visibility = document.getElementById('pasteVisibility').value;
  const rawAlias = document.getElementById('pasteCustomAlias').value.trim();

  let alias = null;
  if (rawAlias) {
    alias = rawAlias.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  }

  const newPaste = {
    id: generateUUID(),
    alias: alias,
    code: generateShortCode(),
    title: title,
    content: content,
    language: language,
    visibility: visibility,
    expiration: expiration,
    createdAt: Date.now()
  };

  try {
    const res = await fetch(`${API_BASE}/api/pastes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody(newPaste)
    });

    if (res.ok) {
      registerMyPaste(newPaste.id); // Save owner status locally
      document.getElementById('pasteCode').value = '';
      document.getElementById('pasteTitle').value = '';
      document.getElementById('pasteCustomAlias').value = '';
      
      window.location.hash = `#/paste/${newPaste.alias || newPaste.id}`;
      showToast("Snippet published successfully!");
    } else {
      const errData = await res.json();
      alert(errData.error || "Failed to publish snippet.");
    }
  } catch (e) {
    alert("Connection to backend server lost.");
  }
});

// App Listeners
window.addEventListener('hashchange', route);
window.addEventListener('load', () => {
  loadAds();
  route();
});
