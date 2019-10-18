// Fink Zeit script global script inserts
//console.log("Welcome to Finkzeit");

// mark navbar in specific colour
window.onload = function () {
	var navbars = document.getElementsByClassName("navbar");
	if (navbars.length > 0) {
		if (window.location.hostname.includes("erp-test")) {
			navbars[0].style.backgroundColor = "#d68080";
		}
		else if ((window.location.hostname.includes("erp-ch"))) {
			navbars[0].style.backgroundColor = "#abd680";
		}
	}
}

// check if the accounting period is active
function check_period(date) {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
 	        doctype: "Buchhaltungsperiode",
 	        filters: [
 	            ["start_date","<=", date],
 	            ["end_date",">=", date],
 	            ["status","=", "Active"],
 	        ],
            fields: ["title"]
        },
        async: false,
        callback: function (response) {
            if (response.message.length === 0) {
                frappe.msgprint( __("Buchhaltungsperiode gesperrt.") );
                frappe.validated = false;
            }
        }
    });
}
