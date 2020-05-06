// Copyright (c) 2020, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Customer Credit Ledger"] = {
	"filters": [
		{
			fieldname:"customer",
			label: __("Customer"),
			fieldtype: "Link",
            options: "Customer",
            reqd: 1
        },
        {
			fieldname:"date",
			label: __("Date"),
			fieldtype: "Date"
        }
	]
};
