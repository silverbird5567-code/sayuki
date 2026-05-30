const auth = {
    isLoggedIn: async function(){
        const stat = await fetch("/api/users/me", {
            headers: {
                "Authorization": "Bearer " + localStorage.getItem("token")
            }
        })

        if (await stat.text() == "true") return true
        return false
    },
    isAdmin: async function(){
        const stat = await fetch("/api/users/isAdmin", {
            headers: {
                "Authorization": "Bearer " + localStorage.getItem("token")
            }
        })

        if (await stat.text() == "true") return true
        return false
    },
    logOut: function(){
        localStorage.removeItem("token")
        localStorage.removeItem("username")
        window.location = "./"
    },
    requireAdmin: async function(){
        if (!await auth.isAdmin()) {
            window.location = "/";
        }
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const adminBtn = document.getElementById("admin-btn");
    if (adminBtn && await auth.isAdmin()) {
        adminBtn.style.display = '';
    }
})