let newKeyValue = null;
let accessibleMasterKeys = [];
let allKeys = [];

function addKey(keyData) {
    const { key, provider, masterKey, createdAt, limit, usageDate, usageCount, promptNames = [], lorebookNames = [], pluginNames = [] } = keyData;
    const masked = key.slice(0, 8) + "••••••••••••••••••••••••••••" + key.slice(-4);
    const date = createdAt ? new Date(createdAt * 1000).toLocaleDateString() : "—";
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = usageDate === today ? (usageCount || 0) : 0;
    const usageDisplay = limit > 0 ? `${todayCount} / ${limit} today` : "Unlimited";
    const assocCount = (promptNames?.length || 0) + (lorebookNames?.length || 0) + (pluginNames?.length || 0);

    const el = document.createElement("div");
    el.classList.add("key");
    el.dataset.key = key;
    el.dataset.provider = provider || "";
    el.innerHTML = `
        <div class="key-content">
            <div class="key-header" onclick="toggleKeyDetails(this)">
                <h4 class="key-token" title="Click to copy" onclick="copyKey('${key}'); event.stopPropagation()">${masked}</h4>
            </div>
            <div class="key-details" id="key-details">
                <h5>Provider: ${provider || "—"}</h5>
                <h5>Master Key: ${masterKey || "—"}</h5>
                <h5>Requests: ${usageDisplay}</h5>
                <h5>Created: ${date}</h5>
                ${assocCount > 0 ? `<h5>Associations: ${assocCount} item(s)</h5>` : ''}
            </div>
        </div>
        <div class="key-settings">
            <span class="material-symbols-outlined" id="key-chevron" onclick="toggleKeyDetails(this)">expand_more</span>
            <span class="material-symbols-outlined" title="Copy key" onclick="copyKey('${key}')">content_copy</span>
            ${assocCount > 0 ? `<span class="material-symbols-outlined" title="Manage associations" onclick="openAssociationsModal('${key}')">info</span>` : ''}
            <span class="material-symbols-outlined" title="Delete key" onclick="deleteKey('${key}', this)">delete</span>
        </div>
    `;
    document.querySelector(".keys").appendChild(el);
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
        document.querySelector(`.key[data-key="${key}"]`)?.remove();
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
    if (!res.ok) return alert(data.error ?? "Failed to redeem code.");

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

    if (prompts.length > 0) {
        promptsEmpty.style.display = "none";
        prompts.forEach(name => {
            const item = document.createElement("div");
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.alignItems = "center";
            item.style.padding = "8px";
            item.style.backgroundColor = "#1a1a2e";
            item.style.borderRadius = "4px";
            item.innerHTML = `
                <span>${name}</span>
                <span class="material-symbols-outlined" style="cursor: pointer; font-size: 18px;" title="Remove" onclick="removeAssociation('prompt', '${name.replace(/'/g, "\\'")}')">delete</span>
            `;
            promptsList.appendChild(item);
        });
    } else {
        promptsEmpty.style.display = "block";
    }

    if (lorebooks.length > 0) {
        lorebooksEmpty.style.display = "none";
        lorebooks.forEach(name => {
            const item = document.createElement("div");
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.alignItems = "center";
            item.style.padding = "8px";
            item.style.backgroundColor = "#1a1a2e";
            item.style.borderRadius = "4px";
            item.innerHTML = `
                <span>${name}</span>
                <span class="material-symbols-outlined" style="cursor: pointer; font-size: 18px;" title="Remove" onclick="removeAssociation('lorebook', '${name.replace(/'/g, "\\'")}')">delete</span>
            `;
            lorebooksList.appendChild(item);
        });
    } else {
        lorebooksEmpty.style.display = "block";
    }

    if (plugins.length > 0) {
        pluginsEmpty.style.display = "none";
        plugins.forEach(name => {
            const item = document.createElement("div");
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.alignItems = "center";
            item.style.padding = "8px";
            item.style.backgroundColor = "#1a1a2e";
            item.style.borderRadius = "4px";
            item.innerHTML = `
                <span>${name}</span>
                <span class="material-symbols-outlined" style="cursor: pointer; font-size: 18px;" title="Remove" onclick="removeAssociation('plugin', '${name.replace(/'/g, "\\'")}')">delete</span>
            `;
            pluginsList.appendChild(item);
        });
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

init();
