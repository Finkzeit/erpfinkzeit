// Copyright (c) 2019, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Saldenliste Schlussaldo"] = {
    "filters": [
        {
            "fieldname":"to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "reqd": 1,
            "default": new Date()
        },
        {
            "fieldname":"report_type",
            "label": __("Type"),
            "fieldtype": "Select",
            "options": "\nBalance Sheet\nProfit and Loss"
        }
	]
}

// returns the date one month ago
function get_one_month_ago(date) {
    d = date;
    d.setMonth(d.getMonth() - 1);
    return d;
}
