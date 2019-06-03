// Copyright (c) 2016, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt
/* eslint-disable */
  
frappe.query_reports["Artikelgruppenentwicklung"] = {
	"filters": [
        {
            "fieldname":"type",
            "label": __("Type"),
            "fieldtype": "Select",
            "options": "Year\nQuarter\nMonth",
            "default": "Year"
        },
        {
            "fieldname":"year",
            "label": __("Year"),
            "fieldtype": "Select",
            "options": getYears().join("\n"),
            "default": (new Date()).getFullYear().toString()
        },
        {
            "fieldname":"quarter",
            "label": __("Quarter"),
            "fieldtype": "Select",
            "options": "Q1\nQ2\nQ3\nQ4",
            "default": "Q1"
        },
        {
            "fieldname":"month",
            "label": __("Month"),
            "fieldtype": "Select",
            "options": "Jan\nFeb\nMar\nApr\nMay\nJun\nJul\nAug\nSep\nOct\nNov\nDec",
            "default": "Jan"
        },
        {
            "fieldname":"cost_center",
            "label": __("Cost center"),
            "fieldtype": "Link",
            "options": "Cost Center",
        }
	]
}

function getYears() {
    var years = [];
    var year = (new Date()).getFullYear();
    while (year > 2018) {
        years.push(year);
        year--;
    }
    return years;
}
