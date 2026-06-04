let newKeyValue = null;
let accessibleMasterKeys = [];
let allKeys = [];

function addKey(keyData) {
    const { key, provider, masterKey, createdAt, limit, usageDate, usageCount, poolMode, promptNames = [], lorebookNames = [], pluginNames = [] } = keyData;
    const masked = key.slice(0, 8) + "••••••••••••••••••••••••••••" + key.slice(-4);
    const date = createdAt ? new Date(createdAt * 1000).toLocaleDateString() : "—";
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = usageDate === today ? (usageCount || 0) : 0;
    const usageDisplay = limit > 0 ? `${todayCount} / ${limit} today${poolMode ? " (shared pool)" : ""}` : "Unlimited";
    const assocCount = (promptNames?.length || 0) + (lorebookNames?.length || 0) + (pluginNames?.length || 0);

    const el = document.createElement("div");
    el.classList.add("key");
    el.dataset.key = key;
    el.dataset.provider = provider || "";
    el.innerHTML = `
        <div class="key-content">
            <div class="key-header" onclick="toggleKeyDetails(this)">
                <h4 class="key-token" title="Click to copy"></h4>
            </div>
            <div class="key-details" id="key-details">
                <h5>Provider: <span class="provider-text"></span></h5>
                <h5>Master Key: <span class="masterkey-text"></span></h5>
                <h5>Requests: <span class="requests-text"></span></h5>
                <h5>Created: ${date}</h5>
                ${assocCount > 0 ? `<h5>Associations: ${assocCount} item(s)</h5>` : ''}
            </div>
        </div>
        <div class="key-settings">
            <span class="material-symbols-outlined" id="key-chevron" onclick="toggleKeyDetails(this)">expand_more</span>
            <span class="material-symbols-outlined" title="Copy key" onclick="copyKey(this.closest('.key').dataset.key)">content_copy</span>
            ${assocCount > 0 ? `<span class="material-symbols-outlined" title="Manage associations" onclick="openAssociationsModal(this.closest('.key').dataset.key)">info</span>` : ''}
            <span class="material-symbols-outlined" title="Delete key" onclick="deleteKey(this.closest('.key').dataset.key, this)">delete</span>
        </div>
    `;
    el.dataset.limit = limit;
    el.dataset.usageDate = usageDate || "";
    el.dataset.usageCount = usageCount || 0;
    el.dataset.poolMode = poolMode ? "1" : "0";

    const tokenEl = el.querySelector(".key-token");
    tokenEl.textContent = masked;
    tokenEl.addEventListener("click", (e) => { copyKey(e.currentTarget.closest(".key").dataset.key); e.stopPropagation(); });
    el.querySelector(".provider-text").textContent = provider || "—";
    el.querySelector(".masterkey-text").textContent = masterKey || "—";
    updateKeyUsageDisplay(el);
    document.querySelector(".keys").appendChild(el);
}

function updateKeyUsageDisplay(el) {
    const today = new Date().toISOString().slice(0, 10);
    const limit = parseInt(el.dataset.limit) || 0;
    const usageDate = el.dataset.usageDate;
    const usageCount = usageDate === today ? (parseInt(el.dataset.usageCount) || 0) : 0;
    const isPool = el.dataset.poolMode === "1";
    const span = el.querySelector(".requests-text");
    if (!span) return;
    span.textContent = limit > 0
        ? `${usageCount} / ${limit} today${isPool ? " (shared pool)" : ""}`
        : `${usageCount} today${isPool ? " (shared pool)" : ""}`;
}

function copyKey(key) {
    navigator.clipboard.writeText(key);
}

function toggleKeyDetails(el) {
    const keyEl = el.closest(".key");
    if (!keyEl) return;
    const details = keyEl.querySelector(".key-details");
    const header = keyEl.querySelector(".key-header");
    if (header) header.classList.toggle("open");
    if (details) details.classList.toggle("open");
}

function filterKeys(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll(".key").forEach(el => {
        const text = el.dataset.provider + el.dataset.key;
        el.style.display = !q || text.toLowerCase().includes(q) ? "" : "none";
    });
}

async function deleteKey(key, btn) {
    btn.style.opacity = "0.4";
    btn.style.pointerEvents = "none";
    const res = await fetch("/api/apikeys/delete", {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" },
        body: JSON.stringify({ key })
    });
    if (res.ok) {
        document.querySelector(`.key[data-key="${CSS.escape(key)}"]`)?.remove();
    } else {
        btn.style.opacity = "";
        btn.style.pointerEvents = "";
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete key.");
    }
}

async function openCreateModal() {
    document.getElementById("create-form").style.display = "flex";
    document.getElementById("create-form").style.flexDirection = "column";
    document.getElementById("key-reveal").style.display = "none";
    newKeyValue = null;

    const select = document.getElementById("masterkey-select");
    select.innerHTML = '<option value="">Select a provider...</option>';

    const res = await fetch("/api/masterkeys/accessible", { headers: { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" } });
    if (res.ok) {
        accessibleMasterKeys = await res.json();
        const masterKeys = accessibleMasterKeys;
        for (const mk of masterKeys) {
            const opt = document.createElement("option");
            opt.value = mk.name;
            const models = mk.models && mk.models.length > 0 ? ` (${mk.models.join(", ")})` : "";
            opt.textContent = `${mk.name}${models}`;
            select.appendChild(opt);
        }
        if (masterKeys.length === 0) {
            const opt = document.createElement("option");
            opt.disabled = true;
            opt.textContent = "No master keys — redeem a code first";
            select.appendChild(opt);
        }
    }

    document.getElementById("create-modal").style.display = "flex";
}

function closeModal() {
    document.getElementById("create-modal").style.display = "none";
    newKeyValue = null;
}

async function createKey() {
    const masterKey = document.getElementById("masterkey-select").value;
    if (!masterKey) return alert("Select a master key.");

    const res = await fetch("/api/apikeys/create", {
        method: "POST",
        headers: { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" },
        body: JSON.stringify({ masterKey })
    });

    const data = await res.json();
    if (!res.ok) return alert(data.error ?? "Failed to create key.");

    newKeyValue = data.key;
    const mkLimit = accessibleMasterKeys.find(m => m.name === masterKey)?.limit ?? 0;
    addKey({ key: data.key, provider: null, masterKey, createdAt: Math.floor(Date.now() / 1000), limit: mkLimit, usageDate: null, usageCount: 0 });

    document.getElementById("create-form").style.display = "none";
    document.getElementById("new-key-value").textContent = data.key;
    document.getElementById("key-reveal").style.display = "flex";
}

function copyNewKey() {
    if (newKeyValue) navigator.clipboard.writeText(newKeyValue);
}

function openRedeemModal() {
    document.getElementById("redeem-code").value = "";
    document.getElementById("redeem-modal").style.display = "flex";
}

function closeRedeemModal() {
    document.getElementById("redeem-modal").style.display = "none";
}

async function redeemCode() {
    const code = document.getElementById("redeem-code").value.trim().toUpperCase();
    if (!code) return alert("Enter a code.");

    const res = await fetch("/api/masterkeys/redeem", {
        method: "POST",
        headers: { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" },
        body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error ?? data.message ?? "Failed to redeem code.");

    closeRedeemModal();
    alert(`Access granted to provider: ${data.masterKey}`);
}

document.getElementById("create-modal").addEventListener("click", function(e) {
    if (e.target === this) closeModal();
});
document.getElementById("redeem-modal").addEventListener("click", function(e) {
    if (e.target === this) closeRedeemModal();
});
document.getElementById("associations-modal").addEventListener("click", function(e) {
    if (e.target === this) closeAssociationsModal();
});

let currentAssociationsKey = null;

function openAssociationsModal(key) {
    currentAssociationsKey = key;
    document.getElementById("associations-key-label").textContent = `Key: ${key.slice(0, 8)}••••••••••••••••••••••••••••${key.slice(-4)}`;

    const keyData = allKeys.find(k => k.key === key);
    if (!keyData) return;

    const promptsList = document.getElementById("prompts-list");
    const lorebooksList = document.getElementById("lorebooks-list");
    const pluginsList = document.getElementById("plugins-list");
    const promptsEmpty = document.getElementById("prompts-empty");
    const lorebooksEmpty = document.getElementById("lorebooks-empty");
    const pluginsEmpty = document.getElementById("plugins-empty");

    promptsList.innerHTML = "";
    lorebooksList.innerHTML = "";
    pluginsList.innerHTML = "";

    const prompts = keyData.promptNames || [];
    const lorebooks = keyData.lorebookNames || [];
    const plugins = keyData.pluginNames || [];

    function makeAssocItem(name, type, container) {
        const item = document.createElement("div");
        item.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:8px;background-color:#1a1a2e;border-radius:4px;";
        const label = document.createElement("span");
        label.textContent = name;
        const del = document.createElement("span");
        del.className = "material-symbols-outlined";
        del.style.cssText = "cursor:pointer;font-size:18px;";
        del.title = "Remove";
        del.textContent = "delete";
        del.addEventListener("click", () => removeAssociation(type, name));
        item.appendChild(label);
        item.appendChild(del);
        container.appendChild(item);
    }

    if (prompts.length > 0) {
        promptsEmpty.style.display = "none";
        prompts.forEach(name => makeAssocItem(name, 'prompt', promptsList));
    } else {
        promptsEmpty.style.display = "block";
    }

    if (lorebooks.length > 0) {
        lorebooksEmpty.style.display = "none";
        lorebooks.forEach(name => makeAssocItem(name, 'lorebook', lorebooksList));
    } else {
        lorebooksEmpty.style.display = "block";
    }

    if (plugins.length > 0) {
        pluginsEmpty.style.display = "none";
        plugins.forEach(name => makeAssocItem(name, 'plugin', pluginsList));
    } else {
        pluginsEmpty.style.display = "block";
    }

    document.getElementById("associations-modal").style.display = "flex";
}

function closeAssociationsModal() {
    document.getElementById("associations-modal").style.display = "none";
    currentAssociationsKey = null;
}

async function removeAssociation(type, name) {
    if (!currentAssociationsKey) return;

    const endpoint = `/api/remove${type.charAt(0).toUpperCase() + type.slice(1)}FromKey`;
    const bodyKey = type === 'prompt' ? 'promptName' : type === 'lorebook' ? 'lorebookName' : 'pluginName';

    try {
        const res = await fetch(endpoint, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" },
            body: JSON.stringify({ [bodyKey]: name, apiKey: currentAssociationsKey })
        });

        if (res.ok) {
            const keyData = allKeys.find(k => k.key === currentAssociationsKey);
            if (keyData) {
                if (type === 'prompt') keyData.promptNames = (keyData.promptNames || []).filter(n => n !== name);
                else if (type === 'lorebook') keyData.lorebookNames = (keyData.lorebookNames || []).filter(n => n !== name);
                else if (type === 'plugin') keyData.pluginNames = (keyData.pluginNames || []).filter(n => n !== name);
            }
            openAssociationsModal(currentAssociationsKey);
            init();
        } else {
            const err = await res.json().catch(() => ({}));
            alert(err.error ?? `Failed to remove ${type}.`);
        }
    } catch (e) {
        console.error("Error removing association:", e);
        alert(`Error removing ${type}.`);
    }
}

async function init() {
    const loggedIn = await auth.isLoggedIn();
    if (!loggedIn) { window.location = "/"; return; }

    document.querySelector(".keys").innerHTML = "";
    const res = await fetch("/api/apikeys", { headers: { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" } });
    if (res.ok) {
        const keys = await res.json();
        allKeys = keys;
        for (const k of keys) addKey(k);
    }
}

async function refreshUsageCounts() {
    const res = await fetch("/api/apikeys", { headers: { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" } });
    if (!res.ok) return;
    const keys = await res.json();
    allKeys = keys;
    for (const k of keys) {
        const el = document.querySelector(`.key[data-key="${CSS.escape(k.key)}"]`);
        if (!el) continue;
        el.dataset.usageDate = k.usageDate || "";
        el.dataset.usageCount = k.usageCount || 0;
        el.dataset.limit = k.limit || 0;
        updateKeyUsageDisplay(el);
    }
}

init();
setInterval(refreshUsageCounts, 30000);
