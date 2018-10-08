// Copyright (c) 2018, libracore and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Quotation Overview"] = {
	"filters": [
        {
            "fieldname":"from_date",
            "label": __("From Date"),
            "fieldtype": "Date",
            "reqd": 1,
            "default": get_one_month_ago(new Date())
        },
        {
            "fieldname":"to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "reqd": 1,
            "default": new Date()
        },
        {
            "fieldname":"owner",
            "label": __("Owner"),
            "fieldtype": "Link",
            "options": "User"
        }
	]
}

// returns the date one month ago
function get_one_month_ago(date) {
    d = date;
    d.setMonth(d.getMonth() - 1);
    return d;
}
