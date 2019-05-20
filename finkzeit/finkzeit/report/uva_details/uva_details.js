// Copyright (c) 2016, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["UVA Details"] = {
	"filters": [
        {
            "fieldname":"code",
            "label": __("Code"),
            "fieldtype": "Select",
            "options": "000\n011\n017\n021\n022\n029\n057\n060\n061\n065\n066\n070\n072\083",
            "default": "000"
        },
        {
            "fieldname":"from_date",
            "label": __("From Date"),
            "fieldtype": "Date",
            "default": get_one_month_ago(new Date())
        },
        {
            "fieldname":"to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "default": new Date()
        }
	]
}

// returns the date one month ago
function get_one_month_ago(date) {
    d = date;
    d.setMonth(d.getMonth() - 1);
    return d;
}
