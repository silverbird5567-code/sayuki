const searchInput = document.querySelector('input[type="text"]');
const contextWindowSlider = document.querySelector("#contextWindow");
const sliderLabel = document.querySelector("#sliderLabel");

searchInput.addEventListener("input", filterModels);
contextWindowSlider.addEventListener("input", () => {
  updateSliderLabel();
  filterModels();
});

function formatTokens(n) {
  n = Number(n);
  if (n <= 1) return "any";
  if (n >= 1000000) return "1M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return n.toString();
}

function updateSliderLabel() {
  const val = Number(contextWindowSlider.value);
  sliderLabel.textContent = "Min context: " + formatTokens(val);
}

function filterModels() {
  const query = searchInput.value.toLowerCase();
  const minContext = Number(contextWindowSlider.value);
  const models = document.getElementsByClassName("model");
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const matchesSearch = model.innerText.toLowerCase().includes(query);
    const matchesContext =
      Number(model.getAttribute("contextWindow")) >= minContext;
    model.style.display = matchesSearch && matchesContext ? "flex" : "none";
  }
}

function copyName(name) {
  navigator.clipboard.writeText(name);
}

function addModel(name, contextWindow, owner) {
  const model = document.createElement("div");
  model.classList.add("model");
  model.setAttribute("contextWindow", contextWindow);
  model.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <h4 style="margin:0;">${name}</h4>
    </div>
    <h5>By: ${owner} - Context Window: ${formatTokens(contextWindow)}</h5>
  `;
  model.onclick = () => copyName(name);
  document.querySelector(".models").appendChild(model);
}

async function getModels() {
  const response = await fetch("/api/models", {
    headers: {
        "Authorization": "Bearer " + localStorage.getItem("token")
    }
  });
  const models = await response.json();
  return models;
}

getModels().then((models) => {
  for (let i = 0; i < models.length; i++) {
    addModel(models[i].name, models[i].contextWindow, models[i].owner);
  }
});

auth.isLoggedIn().then((loggedIn) => {
    if (loggedIn == false || loggedIn == "false") {
        window.location = "./index.html";
    }
});