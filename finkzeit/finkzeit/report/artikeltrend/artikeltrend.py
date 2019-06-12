# Copyright (c) 2013, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe

def execute(filters=None):
    columns, data = [], []
    
    # prepare columns
    columns = [
        "Item Group:Link/Item Group:100", 
        "Item:Link/Item:200", 
        "Item name:Date:100", 
        "Revenue:Currency:100",
        "QTY:Float:50",
        "Revenue PY:Currency:100",
        "QTY PY:Float:50"
    ]
    
    # prepare filters
    if filters.item_group:
        item_group = filters.item_group
    else:
        item_group = "%"
    if filters.from_date:
        from_date = filters.from_date
    else:
        from_date = "2000-01-01"
    if filters.to_date:
        to_date = filters.to_date
    else:
        to_date = "2100-12-31"
    if filters.cost_center:
        cost_center = filters.cost_center
    else:
        cost_center = "%"
    # compute PY (period one year before)
    from_py = "{0}{1}".format((int(from_date[0:4]) - 1), from_date[4:])
    to_py = "{0}{1}".format((int(to_date[0:4]) - 1), to_date[4:])

    # prepare query
    sql_query = """/* display sales ytd to each item */
        SELECT 
          `item_group`, 
          `item_code`,
          `item_name`,
          `revenue`, 
          `qty`,
          `revenue_py`, 
          `qty_py`
        FROM (SELECT 
          `item_group`,
          `item_code`,
          `item_name`, 
          (SELECT 
             SUM(`net_amount`)
           FROM `tabSales Invoice Item` 
           LEFT JOIN `tabSales Invoice` ON `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent`
           WHERE 
             `tabSales Invoice`.`docstatus` = 1 AND `tabSales Invoice Item`.`item_code` = `tabItem`.`item_code` AND `tabSales Invoice`.`posting_date` >= "{from_date}" AND `tabSales Invoice`.`posting_date` <= "{to_date}" AND IFNULL(`tabSales Invoice`.`kostenstelle`, "") LIKE '{cost_center}') AS `revenue`,
          (SELECT 
             SUM(`qty`)
           FROM `tabSales Invoice Item` 
           LEFT JOIN `tabSales Invoice` ON `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent`
           WHERE 
             `tabSales Invoice`.`docstatus` = 1 AND `tabSales Invoice Item`.`item_code` = `tabItem`.`item_code` AND `tabSales Invoice`.`posting_date` >= "{from_date}" AND `tabSales Invoice`.`posting_date` <= "{to_date}" AND IFNULL(`tabSales Invoice`.`kostenstelle`, "") LIKE '{cost_center}') AS `qty`,
          (SELECT 
             SUM(`net_amount`)
           FROM `tabSales Invoice Item` 
           LEFT JOIN `tabSales Invoice` ON `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent`
           WHERE 
             `tabSales Invoice`.`docstatus` = 1 AND `tabSales Invoice Item`.`item_code` = `tabItem`.`item_code` AND `tabSales Invoice`.`posting_date` >= "{from_py}" AND `tabSales Invoice`.`posting_date` <= "{to_py}" AND IFNULL(`tabSales Invoice`.`kostenstelle`, "") LIKE '{cost_center}') AS `revenue_py`,
          (SELECT 
             SUM(`qty`)
           FROM `tabSales Invoice Item` 
           LEFT JOIN `tabSales Invoice` ON `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent`
           WHERE 
             `tabSales Invoice`.`docstatus` = 1 AND `tabSales Invoice Item`.`item_code` = `tabItem`.`item_code` AND `tabSales Invoice`.`posting_date` >= "{from_py}" AND `tabSales Invoice`.`posting_date` <= "{to_py}" AND IFNULL(`tabSales Invoice`.`kostenstelle`, "") LIKE '{cost_center}') AS `qty_py`

        FROM `tabItem`
	    WHERE 
          `tabItem`.`is_sales_item` = 1
          AND `tabItem`.`item_group` LIKE '{item_group}') AS `revenue_by_item_group`
        ;""".format(from_date=from_date, to_date=to_date, item_group=item_group, 
            from_py=from_py, to_py=to_py, cost_center=cost_center)
    
    # retrieve data
    data = frappe.db.sql(sql_query, as_list = True)
    
    return columns, data
