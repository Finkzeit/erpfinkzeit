// Copyright (c) 2016, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Artikeltrend"] = {
"filters": [
        {
            "fieldname":"item_group",
            "label": __("Item Group"),
            "fieldtype": "Link",
            "options": "Item Group"
        },
        {
            "fieldname":"from_date",
            "label": __("From Date"),
            "fieldtype": "Date",
            "default": (new Date()).getFullYear().toString() + "-01-01"
        },
        {
            "fieldname":"to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "default": (new Date())
        },
        {
            "fieldname":"cost_center",
            "label": __("Cost center"),
            "fieldtype": "Link",
            "options": "Cost Center",
        }
	]
}
