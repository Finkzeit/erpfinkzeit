# Copyright (c) 2013, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe

def execute(filters=None):
	columns, data = [], []

	if filters:
		customer = filters.customer
	else:
		customer = "K-31698"

	columns = ["Name:Link/Sales Invoice:100",
		"Date:Date:100",
		"Item Code:Link/Item:100",
		"Qty:Float:75",
		"Amount:Currency:100",
		"Customer name::200",
		"Item name::300"]

	sql_query = """SELECT
		  `tabSales Invoice`.`name`,
		  `tabSales Invoice`.`posting_date` ,
		  `tabSales Invoice Item`.`item_code`,
		  `tabSales Invoice Item`.`qty`,
		  `tabSales Invoice Item`.`amount`,
		  `tabSales Invoice`.`customer_name`,
		  `tabSales Invoice Item`.`item_name`
		FROM `tabSales Invoice`
		LEFT JOIN `tabSales Invoice Item` ON `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent`
		WHERE `tabSales Invoice`.`docstatus` = 1
		  AND `tabSales Invoice`.`customer` LIKE '%{0}%'
		ORDER BY `tabSales Invoice`.`posting_date` DESC;""".format(customer)
	data = frappe.db.sql(sql_query, as_list = True)

	return columns, data
