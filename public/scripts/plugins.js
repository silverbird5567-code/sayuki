function authHeaders() {
    return { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" }
}

function addPlugin(plugin) {
    const el = document.createElement("div");
    el.classList.add("prompt");
    el.innerHTML = `
        <h4>${plugin.name}</h4>
        <p>${plugin.description ?? ""}</p>
        <div class="card-actions">
            <button class="use-btn" onclick="openPluginKeyModal('${plugin.name}')">Apply to Key</button>
        </div>
    `;
    document.getElementById("plugins-list").appendChild(el);
}

async function getPlugins() {
    const response = await fetch("/api/plugins", {
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });
    return response.json();
}

getPlugins().then((plugins) => {
    for (let i = 0; i < plugins.length; i++) {
        addPlugin(plugins[i]);
    }
});

auth.isLoggedIn().then((loggedIn) => {
    if (loggedIn == false || loggedIn == "false") {
        window.location = "/";
    }
});

function filterPlugins(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll(".prompt").forEach((card) => {
        const name = (card.querySelector("h4")?.textContent ?? "").toLowerCase();
        const desc = (card.querySelector("p")?.textContent ?? "").toLowerCase();
        card.style.display = !q || name.includes(q) || desc.includes(q) ? "" : "none";
    });
}

let currentPluginName = null;

async function loadApiKeysForPlugin() {
    const select = document.getElementById("plugin-api-key-select");
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

async function openPluginKeyModal(pluginName) {
    currentPluginName = pluginName;
    document.getElementById("plugin-key-modal-name").textContent = `Applying plugin: ${pluginName}`;
    document.getElementById("plugin-api-key-select").value = "";
    await loadApiKeysForPlugin();
    document.getElementById("plugin-key-modal").style.display = "flex";
}

function closePluginKeyModal() {
    document.getElementById("plugin-key-modal").style.display = "none";
    currentPluginName = null;
}

async function applyApiKeyToPlugin() {
    const apiKey = document.getElementById("plugin-api-key-select").value;
    if (!apiKey) return alert("Select an API key.");
    if (!currentPluginName) return;

    try {
        const res = await fetch("/api/addPluginToKey", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ pluginName: currentPluginName, apiKey })
        });

        if (res.ok) {
            alert("Plugin applied to API key!");
            closePluginKeyModal();
        } else {
            const err = await res.json();
            alert(err.error ?? "Failed to apply plugin to API key.");
        }
    } catch (e) {
        console.error("Error applying plugin:", e);
        alert("Error applying plugin to API key.");
    }
}

document.getElementById("plugin-key-modal")?.addEventListener("click", function(e) {
    if (e.target === this) closePluginKeyModal();
});
