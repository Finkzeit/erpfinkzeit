// Copyright (c) 2021, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Ertragskontenkontrolle USt"] = {
    "filters": [
        {
            "fieldname":"from_date",
            "label": __("From date"),
            "fieldtype": "Date",
            "default": new Date().getFullYear() + "-" + (new Date().getMonth() + 1) + "-01",
            "reqd": 1
        },
        {
            "fieldname":"to_date",
            "label": __("To date"),
            "fieldtype": "Date",
            "default" : frappe.datetime.get_today(),
            "reqd": 1
        }
    ]
}
