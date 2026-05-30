let currentUserIsAdmin = false;

function authHeaders() {
    return { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" }
}

function toggleMenu(btn) {
    const dropdown = btn.nextElementSibling;
    const isOpen = dropdown.classList.contains("open");
    document.querySelectorAll(".card-menu-dropdown.open").forEach(d => d.classList.remove("open"));
    if (!isOpen) dropdown.classList.add("open");
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".card-menu")) {
        document.querySelectorAll(".card-menu-dropdown.open").forEach(d => d.classList.remove("open"));
    }
});

function addLorebook(name, description, owner) {
    const canManage = owner === localStorage.getItem("username") || currentUserIsAdmin;
    const lorebook = document.createElement("div");
    lorebook.classList.add("prompt");
    lorebook.dataset.name = name;
    lorebook.innerHTML = `
        <h4>${name}</h4>
        <p>${description}</p>
        <p>By: ${owner}</p>
        <div class="card-actions">
            <button class="use-btn" onclick="openUseLorebookModal('${name}')">Apply to Key</button>
            ${canManage ? `
            <div class="card-menu">
                <button class="card-menu-btn" onclick="toggleMenu(this)">⋮</button>
                <div class="card-menu-dropdown">
                    <button onclick="removeLorebook('${name}', this)">Delete</button>
                </div>
            </div>
            ` : ""}
        </div>
    `;
    document.querySelector(".prompts").appendChild(lorebook);
}

async function getLorebooks() {
    const response = await fetch("/api/getLorebooks", { headers: authHeaders() });
    return response.json();
}

let currentLorebookName = null;

async function loadApiKeysForLorebook() {
    const select = document.getElementById("use-lorebook-api-key-select");
    select.innerHTML = '<option value="">Select an API Key</option>';

    try {
        const res = await fetch("/api/apikeys", { headers: authHeaders() });
        if (res.ok) {
            const keys = await res.json();
            for (const key of keys) {
                const masked = key.key.slice(0, 8) + "••••••••••••••••••••••••••••" + key.key.slice(-4);
                const opt = document.createElement("option");
                opt.value = key.key;
                opt.textContent = masked;
                select.appendChild(opt);
            }
        }
    } catch (e) {
        console.error("Failed to load API keys:", e);
    }
}

async function openUseLorebookModal(lorebookName) {
    currentLorebookName = lorebookName;
    document.getElementById("use-lorebook-modal-name").textContent = `Applying lorebook: ${lorebookName}`;
    document.getElementById("use-lorebook-api-key-select").value = "";
    await loadApiKeysForLorebook();
    document.getElementById("use-lorebook-modal").style.display = "flex";
}

function closeUseLorebookModal() {
    document.getElementById("use-lorebook-modal").style.display = "none";
    currentLorebookName = null;
}

async function applyLorebookToKey() {
    const apiKey = document.getElementById("use-lorebook-api-key-select").value;
    if (!apiKey) return alert("Select an API key.");
    if (!currentLorebookName) return;

    try {
        const res = await fetch("/api/addLorebookToKey", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ lorebookName: currentLorebookName, apiKey })
        });

        if (res.ok) {
            alert("Lorebook applied to API key!");
            closeUseLorebookModal();
        } else {
            const err = await res.json();
            alert(err.error ?? "Failed to apply lorebook to API key.");
        }
    } catch (e) {
        console.error("Error applying lorebook:", e);
        alert("Error applying lorebook to API key.");
    }
}

document.getElementById("use-lorebook-modal").addEventListener("click", function(e) {
    if (e.target === this) closeUseLorebookModal();
});

async function removeLorebook(name, btn) {
    btn.disabled = true;
    const res = await fetch("/api/deleteLorebook", {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ name })
    });
    if (res.ok) {
        document.querySelector(`.prompt[data-name="${name}"]`)?.remove();
    } else {
        btn.disabled = false;
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete lorebook.");
    }
}

function updateFileLabel(input) {
    const label = document.getElementById("file-label");
    const zone = document.getElementById("file-drop-zone");
    label.textContent = input.files[0] ? input.files[0].name : "click to choose a .json file";
    zone.classList.toggle("has-file", !!input.files[0]);
}

async function loadApiKeys() {
    const select = document.getElementById("api-key-select");
    select.innerHTML = '<option value="">Select an API Key (optional)</option>';

    try {
        const res = await fetch("/api/apikeys", { headers: authHeaders() });
        if (res.ok) {
            const keys = await res.json();
            for (const key of keys) {
                const masked = key.key.slice(0, 8) + "••••••••••••••••••••••••••••" + key.key.slice(-4);
                const opt = document.createElement("option");
                opt.value = key.key;
                opt.textContent = masked;
                select.appendChild(opt);
            }
            select.style.display = keys.length > 0 ? "" : "none";
        }
    } catch (e) {
        console.error("Failed to load API keys:", e);
    }
}

async function openCreateLorebookModal() {
    document.getElementById("lorebook-file-input").value = "";
    document.getElementById("lorebook-name").value = "";
    document.getElementById("lorebook-description").value = "";
    document.getElementById("api-key-select").value = "";
    updateFileLabel(document.getElementById("lorebook-file-input"));
    await loadApiKeys();
    document.getElementById("create-modal").style.display = "flex";
}

function closeCreateModal() {
    document.getElementById("create-modal").style.display = "none";
    document.getElementById("lorebook-file-input").value = "";
    document.getElementById("lorebook-name").value = "";
    document.getElementById("lorebook-description").value = "";
    document.getElementById("api-key-select").value = "";
    updateFileLabel(document.getElementById("lorebook-file-input"));
}

document.getElementById("create-modal").addEventListener("click", function (e) {
    if (e.target === this) closeCreateModal();
});

function importLorebook() {
    const file = document.getElementById("lorebook-file-input").files[0];
    const name = document.getElementById("lorebook-name").value.trim();
    const description = document.getElementById("lorebook-description").value.trim();
    const apiKey = document.getElementById("api-key-select").value;
    if (!file || !name) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = JSON.parse(e.target.result);
            const res = await fetch("/api/createLorebook", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ name, description, data, apiKey })
            });
            if (res.ok) {
                addLorebook(name, description, localStorage.getItem("username"));
                closeCreateModal();
            } else {
                const err = await res.json();
                alert(err.error ?? "Failed to create lorebook.");
            }
        } catch {
            alert("Invalid JSON file.");
        }
    };
    reader.readAsText(file);
}

function filterLorebooks(query) {
    const q = (typeof query === "string" ? query : document.getElementById("lorebook-search").value).trim().toLowerCase();
    document.querySelectorAll(".prompt").forEach((card) => {
        const name = (card.querySelector("h4")?.textContent ?? "").toLowerCase();
        const desc = (card.querySelector("p")?.textContent ?? "").toLowerCase();
        card.style.display = !q || name.includes(q) || desc.includes(q) ? "" : "none";
    });
}

async function init() {
    const loggedIn = await auth.isLoggedIn();
    if (!loggedIn) {
        window.location = "/";
        return;
    }
    const username = localStorage.getItem("username");
    try {
        const res = await fetch(`/api/users/isAdmin`);
        currentUserIsAdmin = await res.json() === true;
    } catch {}

    const lorebooks = await getLorebooks();
    for (const lb of lorebooks) {
        addLorebook(lb.name, lb.description, lb.owner);
    }
}

init();
