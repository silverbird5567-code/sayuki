document.getElementById("login").onclick = () => attemptLogin();

document.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("keydown", e => { if (e.key === "Enter") attemptLogin() })
})

async function attemptLogin() {
    const username = document.querySelector('input[type="text"]').value;
    const password = document.querySelector('input[type="password"]').value;

    if (!username || !password) {
        document.getElementById("warning").innerText = "Both username and password must be filled out";
        return;
    }

    const results = await fetch("/api/users/signIn", {
        body: JSON.stringify({ username, password }),
        method: "POST",
        headers: { "Content-Type": "application/json" },
    }).then(res => res.json());

    if (results.text == "invalid" || results[0] == undefined) {
        document.getElementById("warning").innerHTML = "Invalid username / password";
        return;
    }

    if (results[1] === "must_reset") {
        localStorage.setItem("token", results[0]);
        localStorage.setItem("username", username);
        showResetForm();
        return;
    }

    localStorage.setItem("token", results[0]);
    localStorage.setItem("username", username);
    document.location = "./dashboard";
}

function showResetForm() {
    document.querySelector(".dashboard").style.display = "none";
    document.getElementById("reset-form").style.display = "flex";
}

document.getElementById("reset-confirm").onclick = () => doReset();

document.querySelectorAll("#reset-form input").forEach(inp => {
    inp.addEventListener("keydown", e => { if (e.key === "Enter") doReset() })
})

async function doReset() {
    const newPass = document.getElementById("reset-new-password").value;
    const confirm = document.getElementById("reset-confirm-password").value;
    const warn = document.getElementById("reset-warning");

    if (!newPass || !confirm) { warn.innerText = "Both fields are required."; return; }
    if (newPass !== confirm) { warn.innerText = "Passwords do not match."; return; }

    const res = await fetch("/api/users/resetPasswordSelf", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ newPassword: newPass })
    });

    const data = await res.json();
    if (res.ok && data.worked) {
        document.location = "./dashboard";
    } else {
        warn.innerText = data.error || "Failed to reset password.";
    }
}

auth.isLoggedIn().then(loggedIn => {
    if (loggedIn == true || loggedIn == "true") window.location = "./dashboard";
});
