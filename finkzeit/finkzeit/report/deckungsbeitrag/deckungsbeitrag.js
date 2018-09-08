// Copyright (c) 2016, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Deckungsbeitrag"] = {
	"filters": [
        {
            "fieldname":"cost_center",
            "label": __("Cost Center"),
            "fieldtype": "Link",
            "options": "Cost Center"
        },
        {
            "fieldname":"from_date",
            "label": __("From Date"),
            "fieldtype": "Date"
        },
        {
            "fieldname":"to_date",
            "label": __("To Date"),
            "fieldtype": "Date"
        }
	]
}
