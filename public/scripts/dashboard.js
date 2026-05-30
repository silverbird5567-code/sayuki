const time = new Date();
const hour = time.getHours();
const name = document.getElementById("name");
name.innerHTML = `good ${hour < 12 ? "morning" : "afternoon"}, ${localStorage.getItem("username")}`;

auth.isLoggedIn().then((loggedIn) => {
  if (loggedIn == false || loggedIn == "false") {
    window.location = "./index.html";
  }
});


let cckv = "pipipipi"
let ccki = ""

document.addEventListener("keydown", (e) => {
  ccki += e.key
  if (ccki === cckv) {
    window.location="lastcall.webp"
  }
})