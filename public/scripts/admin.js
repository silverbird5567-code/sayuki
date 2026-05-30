let activeTab = "moderation";

function changeTab(tab) {
    document.getElementById(activeTab).classList.remove("active");
    activeTab = tab;
    document.getElementById(tab).classList.add("active");
    document.getElementById("tab-content").src = `/service/admin/${tab}.html`;
}


auth.requireAdmin();