// Copyright (c) 2016, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Customer History"] = {
	"filters": [
	  {
            "fieldname":"customer",
            "label": __("Customer"),
            "fieldtype": "Link",
	    "options": "Customer"
          }
	]
};
