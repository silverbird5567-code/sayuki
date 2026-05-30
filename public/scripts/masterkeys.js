let editingKey = null;

function authHeaders() {
    return { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" };
}

function addModelRow(name = "", contextWindow = "") {
    const list = document.getElementById("mk-models-list");
    const row = document.createElement("div");
    row.className = "model-row";
    row.innerHTML = `
        <input class="model-name" placeholder="model name" value="${name}">
        <input class="model-cw" type="number" min="0" placeholder="context window" value="${contextWindow}">
        <span class="material-symbols-outlined remove-model" onclick="this.closest('.model-row').remove()">close</span>
    `;
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
    const { name, url, limit, models, contextWindows } = mk;
    const limitDisplay = limit > 0 ? `${limit} / day per key` : "Unlimited";
    const modelsDisplay = (models && models.length > 0)
        ? models.map(m => contextWindows?.[m] ? `${m} (${Number(contextWindows[m]).toLocaleString()})` : m).join(", ")
        : "All models";

    const el = document.createElement("div");
    el.classList.add("key");
    el.dataset.name = name;
    el.dataset.models = JSON.stringify(models || []);
    el.dataset.contextWindows = JSON.stringify(contextWindows || {});
    const { code } = mk;
    el.innerHTML = `
        <div class="key-content">
            <div class="key-header" onclick="toggleKeyDetails(this)">
                <div style="display:flex;align-items:center;gap:8px;">
                    <h4>${name}</h4>
                </div>
            </div>
            <div class="key-details">
                <h5>URL: <span class="url-text">${url || "—"}</span></h5>
                <h5>Requests: ${limitDisplay}</h5>
                <h5>Models: <span class="models-text">${modelsDisplay}</span></h5>
                <h5>Access code: <span class="code-text" title="Click to copy" onclick="copyCode('${code}'); event.stopPropagation()">${code || "—"}</span></h5>
            </div>
        </div>
        <div class="key-settings">
            <span class="material-symbols-outlined key-chevron" title="Toggle details" onclick="toggleKeyDetails(this.closest('.key').querySelector('.key-header'))">expand_more</span>
            <span class="material-symbols-outlined" title="Edit" onclick="openEditModal('${name}')">edit</span>
            <span class="material-symbols-outlined" title="Delete" onclick="deleteMasterKey('${name}', this)">delete</span>
        </div>
    `;
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
    document.getElementById("mk-modal").style.display = "flex";
}

function openEditModal(name) {
    const card = document.querySelector(`.key[data-name="${name}"]`);
    if (!card) return;
    editingKey = name;
    document.getElementById("modal-title").textContent = "Edit Master Key";
    document.getElementById("modal-submit-btn").textContent = "Save";
    document.getElementById("mk-name").value = name;
    document.getElementById("mk-name").disabled = true;
    document.getElementById("mk-key").value = "";
    document.getElementById("mk-url").value = card.querySelector(".url-text")?.textContent || "";
    const savedModels = JSON.parse(card.dataset.models || "[]");
    const savedCW = JSON.parse(card.dataset.contextWindows || "{}");
    populateModelsList(savedModels, savedCW);
    applyUrlLock(card.querySelector(".url-text")?.textContent || "");
    document.getElementById("mk-modal").style.display = "flex";
}

function clearForm() {
    ["mk-name", "mk-key", "mk-url", "mk-limit"].forEach(id => {
        document.getElementById(id).value = "";
    });
    document.getElementById("mk-models-list").innerHTML = "";
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
    const { models, contextWindows } = getModelsFromList();

    if (editingKey) {
        const updates = { url, limit, models, contextWindows };
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

        const card = document.querySelector(`.key[data-name="${editingKey}"]`);
        if (card) {
            card.querySelector(".url-text").textContent = url || "—";
            card.dataset.models = JSON.stringify(models);
            card.dataset.contextWindows = JSON.stringify(contextWindows);
            const modelsDisplay = models.length > 0
                ? models.map(m => contextWindows?.[m] ? `${m} (${Number(contextWindows[m]).toLocaleString()})` : m).join(", ")
                : "All models";
            card.querySelector(".models-text").textContent = modelsDisplay;
        }
        closeModal();
    } else {
        if (!name || !key || !url) return alert("Name, upstream key, and URL are required.");

        const res = await fetch("/api/masterkeys/create", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ name, key, url, limit, models, contextWindows })
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error ?? "Failed to create master key.");

        addKeyCard({ name, url, limit, models, contextWindows, usageDate: "", usageCount: 0 });
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
        document.querySelector(`.key[data-name="${name}"]`)?.remove();
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
