# Copyright (c) 2013, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from datetime import datetime

def execute(filters=None):
	columns, data = [], []
	return columns, data

def execute(filters=None):
    columns, data = [], []
    
    # prepare columns
    columns = [
        "Item Group:Link/Item Group:200",  
        "Total YTD:Currency:100", 
        "Total PY:Currency:100",
        "Percent:Percent:50",
        "QTY YTD:Int:50",
        "Cost YTD:Currency:100",
        "Profit YTD:Currency:100"
    ]
    
    # prepare filters
    if filters.type:
        type = filters.type
    else:
        type = "Year"
    if filters.year:
        year = filters.year
    else:
        year = datetime.now().year
    if filters.quarter:
        quarter = filters.quarter
    else:
        quarter = "Q1"
    if filters.month:
        month = filters.month
    else:
        mont = "Jan"
    
    # determine time range
    if "Year" in type:
        ytd_start = "{0}-01-01".format(year)
        ytd_end = "{0}-12-31".format(year)
        py_start = "{0}-01-01".format(int(year) - 1)
        py_end = "{0}-12-31".format(int(year) - 1)
    elif "Quarter" in type:
        if "Q1" in quarter:
            ytd_start = "{0}-01-01".format(year)
            ytd_end = "{0}-03-31".format(year)
            py_start = "{0}-01-01".format(int(year) - 1)
            py_end = "{0}-03-31".format(int(year) - 1)          
        elif "Q2" in quarter:
            ytd_start = "{0}-04-01".format(year)
            ytd_end = "{0}-06-31".format(year)
            py_start = "{0}-04-01".format(int(year) - 1)
            py_end = "{0}-06-31".format(int(year) - 1)    
        elif "Q3" in quarter:
            ytd_start = "{0}-07-01".format(year)
            ytd_end = "{0}-09-30".format(year)
            py_start = "{0}-07-01".format(int(year) - 1)
            py_end = "{0}-09-30".format(int(year) - 1)    
        else:
            ytd_start = "{0}-10-01".format(year)
            ytd_end = "{0}-12-31".format(year)
            py_start = "{0}-10-01".format(int(year) - 1)
            py_end = "{0}-12-31".format(int(year) - 1)    
    else:
        # month mode
        if month == "Jan":
            ytd_start = "{0}-01-01".format(year)
            ytd_end = "{0}-01-31".format(year)
            py_start = "{0}-01-01".format(int(year) - 1)
            py_end = "{0}-01-31".format(int(year) - 1)        
        elif month == "Feb":
            ytd_start = "{0}-02-01".format(year)
            ytd_end = "{0}-02-28".format(year)
            py_start = "{0}-02-01".format(int(year) - 1)
            py_end = "{0}-02-28".format(int(year) - 1) 
        elif month == "Mar":
            ytd_start = "{0}-03-01".format(year)
            ytd_end = "{0}-03-31".format(year)
            py_start = "{0}-03-01".format(int(year) - 1)
            py_end = "{0}-03-31".format(int(year) - 1) 
        elif month == "Apr":
            ytd_start = "{0}-04-01".format(year)
            ytd_end = "{0}-04-30".format(year)
            py_start = "{0}-04-01".format(int(year) - 1)
            py_end = "{0}-04-30".format(int(year) - 1) 
        elif month == "May":
            ytd_start = "{0}-05-01".format(year)
            ytd_end = "{0}-05-31".format(year)
            py_start = "{0}-05-01".format(int(year) - 1)
            py_end = "{0}-05-31".format(int(year) - 1) 
        elif month == "Jun":
            ytd_start = "{0}-06-01".format(year)
            ytd_end = "{0}-06-30".format(year)
            py_start = "{0}-06-01".format(int(year) - 1)
            py_end = "{0}-06-30".format(int(year) - 1) 
        elif month == "Jul":
            ytd_start = "{0}-07-01".format(year)
            ytd_end = "{0}-07-31".format(year)
            py_start = "{0}-07-01".format(int(year) - 1)
            py_end = "{0}-07-31".format(int(year) - 1) 
        elif month == "Aug":
            ytd_start = "{0}-08-01".format(year)
            ytd_end = "{0}-08-31".format(year)
            py_start = "{0}-08-01".format(int(year) - 1)
            py_end = "{0}-08-31".format(int(year) - 1) 
        elif month == "Sep":
            ytd_start = "{0}-09-01".format(year)
            ytd_end = "{0}-09-30".format(year)
            py_start = "{0}-09-01".format(int(year) - 1)
            py_end = "{0}-09-30".format(int(year) - 1) 
        elif month == "Oct":
            ytd_start = "{0}-10-01".format(year)
            ytd_end = "{0}-10-31".format(year)
            py_start = "{0}-10-01".format(int(year) - 1)
            py_end = "{0}-10-31".format(int(year) - 1) 
        elif month == "Nov":
            ytd_start = "{0}-11-01".format(year)
            ytd_end = "{0}-11-30".format(year)
            py_start = "{0}-11-01".format(int(year) - 1)
            py_end = "{0}-11-30".format(int(year) - 1) 
        elif month == "Dec":
            ytd_start = "{0}-12-01".format(year)
            ytd_end = "{0}-12-31".format(year)
            py_start = "{0}-12-01".format(int(year) - 1)
            py_end = "{0}-12-31".format(int(year) - 1) 
    
    # prepare query
    sql_query = """/* display sales ytd to each item */
        SELECT 
          `item_group`, 
          SUM(`revenue_ytd`) AS `total_ytd`, 
          SUM(`revenue_py`) AS `total_py`,
          (((SUM(`revenue_ytd`) / SUM(`revenue_py`)) - 1) * 100) AS `percent`,
          SUM(`qty_ytd`) AS `qty_ytd`,
          SUM(`cost_ytd`) AS `cost_ytd`,
          (SUM(`revenue_ytd`) - SUM(`cost_ytd`)) AS `profit_ytd`
          /* `qty_ytd`, `cost_ytd` */
        FROM (SELECT 
          `item_name`, 
          `item_code`, 
          `item_group`,
          (SELECT 
             SUM(`net_amount`)
           FROM `tabSales Invoice Item` 
           LEFT JOIN `tabSales Invoice` ON `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent`
           WHERE 
             `tabSales Invoice Item`.`item_code` = `tabItem`.`item_code` AND `tabSales Invoice`.`posting_date` >= "{ytd_start}" AND `tabSales Invoice`.`posting_date` <= "{ytd_end}") AS `revenue_ytd`,
          (SELECT 
             SUM(`qty`)
           FROM `tabSales Invoice Item` 
           LEFT JOIN `tabSales Invoice` ON `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent`
           WHERE 
             `tabSales Invoice Item`.`item_code` = `tabItem`.`item_code` AND `tabSales Invoice`.`posting_date` >= "{ytd_start}" AND `tabSales Invoice`.`posting_date` <= "{ytd_end}") AS `qty_ytd`,
          (SELECT 
             SUM(`qty`) * IFNULL(`thisItem`.`last_purchase_rate`, 0)
           FROM `tabSales Invoice Item` 
           LEFT JOIN `tabSales Invoice` ON `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent`
           LEFT JOIN `tabItem` AS `thisItem` ON `thisItem`.`item_code` = `tabSales Invoice Item`.`item_code`
           WHERE 
             `tabSales Invoice Item`.`item_code` = `tabItem`.`item_code` AND `tabSales Invoice`.`posting_date` >= "{ytd_start}" AND `tabSales Invoice`.`posting_date` <= "{ytd_end}") AS `cost_ytd`,
          (SELECT 
             SUM(`net_amount`)
           FROM `tabSales Invoice Item` 
           LEFT JOIN `tabSales Invoice` ON `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent`
           WHERE 
             `tabSales Invoice Item`.`item_code` = `tabItem`.`item_code` AND `tabSales Invoice`.`posting_date` >= "{py_start}" AND `tabSales Invoice`.`posting_date` <= "{py_end}") AS `revenue_py`
        FROM `tabItem`) AS `revenue_by_item`
        GROUP BY `item_group`;""".format(ytd_start=ytd_start, ytd_end=ytd_end, py_start=py_start, py_end=py_end)
    
    # retrieve data
    data = frappe.db.sql(sql_query, as_list = True)
    
    return columns, data
