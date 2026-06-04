let editingKey = null;

function authHeaders() {
    return { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" };
}

function addModelRow(name = "", contextWindow = "") {
    const list = document.getElementById("mk-models-list");
    const row = document.createElement("div");
    row.className = "model-row";
    row.innerHTML = `
        <input class="model-name" placeholder="model name">
        <input class="model-cw" type="number" min="0" placeholder="context window">
        <span class="material-symbols-outlined remove-model" onclick="this.closest('.model-row').remove()">close</span>
    `;
    row.querySelector(".model-name").value = name;
    row.querySelector(".model-cw").value = contextWindow;
    list.appendChild(row);
}

function getModelsFromList() {
    const models = [];
    const contextWindows = {};
    document.querySelectorAll("#mk-models-list .model-row").forEach(row => {
        const name = row.querySelector(".model-name").value.trim();
        const cw = parseInt(row.querySelector(".model-cw").value) || 0;
        if (!name) return;
        models.push(name);
        if (cw > 0) contextWindows[name] = cw;
    });
    return { models, contextWindows };
}

function populateModelsList(models, contextWindows) {
    document.getElementById("mk-models-list").innerHTML = "";
    if (models && models.length > 0) {
        models.forEach(m => addModelRow(m, contextWindows?.[m] || ""));
    }
}

function addKeyCard(mk) {
    const { name, url, limit, models, contextWindows, poolMode, poolUsageCount } = mk;
    const { code } = mk;
    const limitDisplay = limit > 0
        ? poolMode
            ? `${poolUsageCount ?? 0} / ${limit} today (shared pool)`
            : `${limit} / day (per user)`
        : "Unlimited";
    const modelsDisplay = (models && models.length > 0)
        ? models.map(m => contextWindows?.[m] ? `${m} (${Number(contextWindows[m]).toLocaleString()})` : m).join(", ")
        : "All models";

    const el = document.createElement("div");
    el.classList.add("key");
    el.dataset.name = name;
    el.dataset.code = code || "";
    el.dataset.models = JSON.stringify(models || []);
    el.dataset.contextWindows = JSON.stringify(contextWindows || {});
    el.dataset.poolMode = poolMode ? "1" : "0";
    el.dataset.poolUsageCount = poolUsageCount ?? 0;
    el.innerHTML = `
        <div class="key-content">
            <div class="key-header" onclick="toggleKeyDetails(this)">
                <div style="display:flex;align-items:center;gap:8px;">
                    <h4></h4>
                </div>
            </div>
            <div class="key-details">
                <h5>URL: <span class="url-text"></span></h5>
                <h5>Requests: <span class="requests-text"></span></h5>
                <h5>Models: <span class="models-text"></span></h5>
                <h5>Access code: <span class="code-text" title="Click to copy"></span></h5>
            </div>
        </div>
        <div class="key-settings">
            <span class="material-symbols-outlined key-chevron" title="Toggle details" onclick="toggleKeyDetails(this.closest('.key').querySelector('.key-header'))">expand_more</span>
            <span class="material-symbols-outlined" title="Edit" onclick="openEditModal(this.closest('.key').dataset.name)">edit</span>
            <span class="material-symbols-outlined" title="Delete" onclick="deleteMasterKey(this.closest('.key').dataset.name, this)">delete</span>
        </div>
    `;
    el.querySelector("h4").textContent = name;
    el.querySelector(".url-text").textContent = url || "—";
    el.querySelector(".requests-text").textContent = limitDisplay;
    el.querySelector(".models-text").textContent = modelsDisplay;
    const codeSpan = el.querySelector(".code-text");
    codeSpan.textContent = code || "—";
    codeSpan.addEventListener("click", (e) => { copyCode(e.currentTarget.closest(".key").dataset.code); e.stopPropagation(); });
    document.querySelector(".keys").appendChild(el);
}

function copyCode(code) {
    navigator.clipboard.writeText(code);
}

function toggleKeyDetails(header) {
    header.classList.toggle("open");
    header.nextElementSibling.classList.toggle("open");
}

function filterKeys(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll(".key").forEach(el => {
        el.style.display = !q || el.dataset.name.toLowerCase().includes(q) ? "" : "none";
    });
}

function openCreateModal() {
    editingKey = null;
    document.getElementById("modal-title").textContent = "Create Master Key";
    document.getElementById("modal-submit-btn").textContent = "Create";
    clearForm();
    applyUrlLock("");
    document.getElementById("mk-name").disabled = false;
    document.getElementById("mk-users-section").style.display = "none";
    document.getElementById("mk-modal").style.display = "flex";
}

function openEditModal(name) {
    const card = document.querySelector(`.key[data-name="${CSS.escape(name)}"]`);
    if (!card) return;
    editingKey = name;
    document.getElementById("modal-title").textContent = "Edit Master Key";
    document.getElementById("modal-submit-btn").textContent = "Save";
    document.getElementById("mk-name").value = name;
    document.getElementById("mk-name").disabled = true;
    document.getElementById("mk-key").value = "";
    document.getElementById("mk-url").value = card.querySelector(".url-text")?.textContent || "";
    document.getElementById("mk-pool-mode").value = card.dataset.poolMode || "0";
    const savedModels = JSON.parse(card.dataset.models || "[]");
    const savedCW = JSON.parse(card.dataset.contextWindows || "{}");
    populateModelsList(savedModels, savedCW);
    applyUrlLock(card.querySelector(".url-text")?.textContent || "");
    document.getElementById("mk-users-section").style.display = "";
    document.getElementById("mk-user-search").value = "";
    loadUsersForKey(name);
    document.getElementById("mk-access-section").style.display = "";
    document.getElementById("mk-access-search").value = "";
    loadAccessUsers(name);
    document.getElementById("mk-modal").style.display = "flex";
}

function clearForm() {
    ["mk-name", "mk-key", "mk-url", "mk-limit"].forEach(id => {
        document.getElementById(id).value = "";
    });
    document.getElementById("mk-models-list").innerHTML = "";
    document.getElementById("mk-pool-mode").value = "0";
    document.getElementById("mk-access-section").style.display = "none";
}

function closeModal() {
    document.getElementById("mk-modal").style.display = "none";
    editingKey = null;
}

function applyUrlLock(url) {
    const urlInput = document.getElementById("mk-url");
    urlInput.disabled = !!editingKey;
}

async function submitModal() {
    const name = document.getElementById("mk-name").value.trim();
    const key = document.getElementById("mk-key").value.trim();
    const url = document.getElementById("mk-url").value.trim();
    const limit = parseInt(document.getElementById("mk-limit").value) || 0;
    const poolMode = document.getElementById("mk-pool-mode").value === "1";
    const { models, contextWindows } = getModelsFromList();

    if (editingKey) {
        const updates = { url, limit, models, contextWindows, poolMode };
        if (key) updates.key = key;

        const res = await fetch("/api/masterkeys/edit", {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ name: editingKey, ...updates })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return alert(err.error ?? "Failed to save changes.");
        }

        const card = document.querySelector(`.key[data-name="${CSS.escape(editingKey)}"]`);
        if (card) {
            card.querySelector(".url-text").textContent = url || "—";
            card.dataset.models = JSON.stringify(models);
            card.dataset.contextWindows = JSON.stringify(contextWindows);
            card.dataset.poolMode = poolMode ? "1" : "0";
            const modelsDisplay = models.length > 0
                ? models.map(m => contextWindows?.[m] ? `${m} (${Number(contextWindows[m]).toLocaleString()})` : m).join(", ")
                : "All models";
            card.querySelector(".models-text").textContent = modelsDisplay;
            const poolUsageCount = parseInt(card.dataset.poolUsageCount) || 0;
            const limitDisplay = limit > 0
                ? poolMode
                    ? `${poolUsageCount} / ${limit} today (shared pool)`
                    : `${limit} / day (per user)`
                : "Unlimited";
            card.querySelector(".requests-text").textContent = limitDisplay;
        }
        closeModal();
    } else {
        if (!name || !key || !url) return alert("Name, upstream key, and URL are required.");

        const res = await fetch("/api/masterkeys/create", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ name, key, url, limit, models, contextWindows, poolMode })
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error ?? "Failed to create master key.");

        addKeyCard({ name, url, limit, models, contextWindows, poolMode, usageDate: "", usageCount: 0 });
        closeModal();

        location.reload()
    }
}

async function deleteMasterKey(name, btn) {
    if (!confirm(`Delete master key "${name}"? This cannot be undone.`)) return;
    btn.style.opacity = "0.4";
    btn.style.pointerEvents = "none";
    const res = await fetch("/api/masterkeys/delete", {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ name })
    });
    if (res.ok) {
        document.querySelector(`.key[data-name="${CSS.escape(name)}"]`)?.remove();
    } else {
        btn.style.opacity = "";
        btn.style.pointerEvents = "";
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete.");
    }
}

document.getElementById("mk-modal").addEventListener("click", function(e) {
    if (e.target === this) closeModal();
});

document.getElementById("mk-url").addEventListener("input", function() {
    applyUrlLock(this.value.trim());
});

async function loadUsersForKey(keyName) {
    const list = document.getElementById("mk-users-list");
    list.innerHTML = `<span style="font-size:11px;color:rgba(254,181,191,0.4)">Loading...</span>`;

    const [usersRes, excludedRes] = await Promise.all([
        fetch("/api/users", { headers: authHeaders() }),
        fetch(`/api/masterkeys/${encodeURIComponent(keyName)}/excluded`, { headers: authHeaders() })
    ]);

    if (!usersRes.ok || !excludedRes.ok) {
        list.innerHTML = `<span style="font-size:11px;color:#ff6b6b">Failed to load users</span>`;
        return;
    }

    const users = await usersRes.json();
    const { excluded } = await excludedRes.json();
    const excludedSet = new Set(excluded);

    list.innerHTML = "";
    for (const user of users) {
        const isExcluded = excludedSet.has(user.username);
        const row = document.createElement("div");
        row.className = "mk-user-row";
        row.dataset.username = user.username;
        row.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:16px;flex-shrink:0;color:#feb5bf">person</span>
            <span class="mk-user-name"></span>
            <button class="mk-exclude-btn${isExcluded ? " mk-excluded" : ""}">
                ${isExcluded ? "Unexclude" : "Exclude"}
            </button>
        `;
        row.querySelector(".mk-user-name").textContent = user.username;
        const btn = row.querySelector(".mk-exclude-btn");
        btn.addEventListener("click", (e) => { toggleUserExclusion(keyName, user.username, isExcluded); e.stopPropagation(); });
        list.appendChild(row);
    }

    if (users.length === 0) {
        list.innerHTML = `<span style="font-size:11px;color:rgba(254,181,191,0.4)">No users</span>`;
    }
}

function filterUsersList(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll(".mk-user-row").forEach(row => {
        row.style.display = !q || row.dataset.username.toLowerCase().includes(q) ? "" : "none";
    });
}

async function toggleUserExclusion(keyName, username, currentlyExcluded) {
    const res = await fetch(`/api/masterkeys/${encodeURIComponent(keyName)}/excludeUser`, {
        method: currentlyExcluded ? "DELETE" : "POST",
        headers: authHeaders(),
        body: JSON.stringify({ username })
    });
    if (res.ok) {
        await loadUsersForKey(keyName);
        const search = document.getElementById("mk-user-search").value;
        if (search) filterUsersList(search);
    }
}

async function loadAccessUsers(keyName) {
    const list = document.getElementById("mk-access-list");
    list.innerHTML = `<span style="font-size:11px;color:rgba(254,181,191,0.4)">Loading...</span>`;

    const res = await fetch(`/api/masterkeys/${encodeURIComponent(keyName)}/users`, { headers: authHeaders() });
    if (!res.ok) {
        list.innerHTML = `<span style="font-size:11px;color:#ff6b6b">Failed to load users</span>`;
        return;
    }

    const { users } = await res.json();
    list.innerHTML = "";

    if (!users || users.length === 0) {
        list.innerHTML = `<span style="font-size:11px;color:rgba(254,181,191,0.4)">No users have redeemed this code yet</span>`;
        return;
    }

    for (const username of users) {
        const row = document.createElement("div");
        row.className = "mk-user-row";
        row.dataset.username = username;
        row.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:16px;flex-shrink:0;color:#feb5bf">person</span>
            <span class="mk-user-name"></span>
            <button class="mk-exclude-btn" style="background:rgba(255,80,80,0.15);color:#ff8080;">
                <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">person_remove</span>
                Revoke
            </button>
        `;
        row.querySelector(".mk-user-name").textContent = username;
        const btn = row.querySelector("button");
        btn.addEventListener("click", (e) => { revokeUserAccess(keyName, username); e.stopPropagation(); });
        list.appendChild(row);
    }
}

function filterAccessList(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll("#mk-access-list .mk-user-row").forEach(row => {
        row.style.display = !q || row.dataset.username.toLowerCase().includes(q) ? "" : "none";
    });
}

async function revokeUserAccess(keyName, username) {
    if (!confirm(`Revoke ${username}'s access to "${keyName}"? Their API keys for this provider will stop working.`)) return;
    const res = await fetch(`/api/masterkeys/${encodeURIComponent(keyName)}/revokeUser`, {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ username })
    });
    if (res.ok) {
        await loadAccessUsers(keyName);
        const search = document.getElementById("mk-access-search").value;
        if (search) filterAccessList(search);
    } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to revoke access.");
    }
}

async function refreshAccessCode() {
    if (!editingKey) return;
    if (!confirm(`Refresh the access code for "${editingKey}"? The old code will stop working immediately.`)) return;
    const res = await fetch(`/api/masterkeys/${encodeURIComponent(editingKey)}/refreshCode`, {
        method: "POST",
        headers: authHeaders()
    });
    if (res.ok) {
        const { code } = await res.json();
        const card = document.querySelector(`.key[data-name="${CSS.escape(editingKey)}"]`);
        if (card) {
            card.dataset.code = code;
            card.querySelector(".code-text").textContent = code;
        }
        alert(`New code: ${code}`);
    } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to refresh code.");
    }
}

async function init() {
    const loggedIn = await auth.isLoggedIn();
    if (!loggedIn) { window.location = "/"; return; }

    const res = await fetch("/api/masterkeys", { headers: authHeaders() });
    if (res.ok) {
        const keys = await res.json();
        for (const mk of keys) addKeyCard(mk);
    }
}

init();
