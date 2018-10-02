// Fink Zeit script global script inserts
//console.log("Welcome to FinkZeit");

// mark navbar in specific colour
window.onload = function () {
	var navbars = document.getElementsByClassName("navbar");
	if (navbars.length > 0) {
		if ((window.location.hostname.includes("erp-test")) || (window.location.hostname.includes("localhost"))) {
			navbars[0].style.backgroundColor = "#d68080";
		}
		else if ((window.location.hostname.includes("erp-ch"))) {
			navbars[0].style.backgroundColor = "#abd680";
		}
	}
}
