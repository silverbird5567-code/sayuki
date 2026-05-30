let editingPrompt = null;
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

function addprompt(name, description, owner, content) {
    const canManage = owner === localStorage.getItem("username") || currentUserIsAdmin;
    const prompt = document.createElement("div");
    prompt.classList.add("prompt");
    prompt.dataset.name = name
    prompt.dataset.content = content ?? "";
    prompt.dataset.description = description ?? "";
    const encodedName = encodeURIComponent(name).replace(/'/g, "%27");
    prompt.innerHTML = `
        <h4>${name}</h4>
        <p>${description}</p>
        <p>By: ${owner}</p>
        <div class="card-actions">
            <button class="use-btn" onclick="openUsePromptModal('${encodedName}')">Apply to Key</button>
            ${canManage ? `
            <div class="card-menu">
                <button class="card-menu-btn" onclick="toggleMenu(this)">⋮</button>
                <div class="card-menu-dropdown">
                    <button onclick="openEditModal('${encodedName}', this)">Edit</button>
                    <button onclick="removePrompt('${encodedName}', this)">Delete</button>
                </div>
            </div>
            ` : ""}
        </div>
    `;
    document.querySelector(".prompts").appendChild(prompt);
}

async function getPrompts() {
    const response = await fetch("/api/getPrompts", { headers: authHeaders() });
    return response.json();
}

let currentPromptName = null;

async function loadApiKeysForPrompt() {
    const select = document.getElementById("use-prompt-api-key-select");
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

async function openUsePromptModal(promptName) {
    promptName = decodeURIComponent(promptName);
    currentPromptName = promptName;
    document.getElementById("use-prompt-modal-name").textContent = `Applying prompt: ${promptName}`;
    document.getElementById("use-prompt-api-key-select").value = "";
    await loadApiKeysForPrompt();
    document.getElementById("use-prompt-modal").style.display = "flex";
}

function closeUsePromptModal() {
    document.getElementById("use-prompt-modal").style.display = "none";
    currentPromptName = null;
}

async function applyPromptToKey() {
    const apiKey = document.getElementById("use-prompt-api-key-select").value;
    if (!apiKey) return alert("Select an API key.");
    if (!currentPromptName) return;

    try {
        const res = await fetch("/api/addPromptToKey", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ promptName: currentPromptName, apiKey })
        });

        if (res.ok) {
            alert("Prompt applied to API key!");
            closeUsePromptModal();
        } else {
            const err = await res.json();
            alert(err.error ?? "Failed to apply prompt to API key.");
        }
    } catch (e) {
        console.error("Error applying prompt:", e);
        alert("Error applying prompt to API key.");
    }
}

document.getElementById("use-prompt-modal").addEventListener("click", function(e) {
    if (e.target === this) closeUsePromptModal();
});

async function loadApiKeys() {
    const select = document.getElementById("api-key-select");
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
            select.style.display = keys.length > 0 ? "" : "none";
        }
    } catch (e) {
        console.error("Failed to load API keys:", e);
    }
}

async function openCreatePromptModal() {
    editingPrompt = null;
    document.getElementById("name").value = "";
    document.getElementById("name").disabled = false;
    document.getElementById("description").value = "";
    document.getElementById("content").value = "";
    document.getElementById("api-key-select").value = "";
    document.querySelector(".modal-header h4").textContent = "Create Prompt";
    document.querySelector(".modal-import-btn").textContent = "Create";
    await loadApiKeys();
    document.getElementById("create-modal").style.display = "flex";
}

function openEditModal(name, btn) {
    name = decodeURIComponent(name);
    const card = btn.closest(".prompt");
    editingPrompt = name;
    document.getElementById("name").value = name;
    document.getElementById("name").disabled = true;
    document.getElementById("description").value = card.dataset.description;
    document.getElementById("content").value = card.dataset.content;
    document.querySelector(".modal-header h4").textContent = "Edit Prompt";
    document.querySelector(".modal-import-btn").textContent = "Save";
    document.getElementById("api-key-select").value = "";
    loadApiKeys();
    document.getElementById("create-modal").style.display = "flex";
}

function closeCreateModal() {
    editingPrompt = null;
    document.getElementById("create-modal").style.display = "none";
    document.getElementById("name").value = "";
    document.getElementById("name").disabled = false;
    document.getElementById("description").value = "";
    document.getElementById("content").value = "";
    document.getElementById("api-key-select").value = "";
    document.querySelector(".modal-header h4").textContent = "Create Prompt";
    document.querySelector(".modal-import-btn").textContent = "Create";
}

document.getElementById("create-modal").addEventListener("click", function (e) {
    if (e.target === this) closeCreateModal();
});

function findPromptCard(name) {
    return [...document.querySelectorAll(".prompt")].find(
        card => card.dataset.name === name
    );
}

async function createPrompt() {
    const name = document.getElementById("name").value.trim();
    const description = document.getElementById("description").value.trim();
    const content = document.getElementById("content").value.trim();
    const apiKey = document.getElementById("api-key-select").value;
    if (!name || !content) return;

    if (editingPrompt) {
        const res = await fetch("/api/editPrompt", {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ name: editingPrompt, description, content, apiKey })
        });
        if (res.ok) {
            const card = findPromptCard(editingPrompt);
            if (card) {
                card.dataset.description = description;
                card.dataset.content = content;
                card.querySelector("p").textContent = description;
            }
            closeCreateModal();
        } else {
            const err = await res.json();
            alert(err.error ?? "Failed to save prompt.");
        }
    } else {
        const res = await fetch("/api/createPrompt", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ name, description, content, apiKey })
        });
        if (res.ok) {
            addprompt(name, description, localStorage.getItem("username"), content);
            closeCreateModal();
        } else {
            const err = await res.json();
            alert(err.error ?? "Failed to create prompt.");
        }
    }
}

async function removePrompt(name, btn) {
    name = decodeURIComponent(name);
    btn.disabled = true;
    const res = await fetch("/api/deletePrompt", {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ name })
    });
    if (res.ok) {
        btn.closest(".prompt")?.remove();
    } else {
        btn.disabled = false;
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete prompt.");
    }
}

function filterPrompts(query) {
    const q = (typeof query === "string" ? query : document.getElementById("prompts-search").value).trim().toLowerCase();
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

    const prompts = await getPrompts();
    for (const p of prompts) {
        addprompt(p.name, p.description, p.owner, p.content);
    }
}

init();
