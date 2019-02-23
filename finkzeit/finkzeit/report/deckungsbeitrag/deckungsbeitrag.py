# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe

def execute(filters=None):
    columns, data = [], []
    
    # prepare columns
    columns = ["Beschreibung::200", "Betrag::200"]
    
    # prepare filters
    if filters.cost_center:
        cost_center = filters.cost_center
    else:
        cost_center = "%"
    if filters.from_date:
        from_date = filters.from_date
    else:
        from_date = "2000-01-01"
    if filters.to_date:
        to_date = filters.to_date
    else:
        to_date = "2999-12-31"
        
    ### prepare data
    # product sales
    sql_query_sales_products = """SELECT 
                  IFNULL(SUM(`tabGL Entry`.`credit`) - SUM(`tabGL Entry`.`debit`), 0) AS `sales_products`
                FROM `tabGL Entry`
                WHERE 
                  `tabGL Entry`.`docstatus` = 1
                  AND `tabGL Entry`.`account` LIKE '%Sales%'
                  AND `tabGL Entry`.`cost_center` LIKE '{cost_center}'
                  AND `tabGL Entry`.`posting_date` >= '{from_date}'
                  AND `tabGL Entry`.`posting_date` <= '{to_date}';""".format(cost_center=cost_center, from_date=from_date, to_date=to_date)
    try:
        sales_products = frappe.db.sql(sql_query_sales_products, as_dict = True)[0]['sales_products']
    except:
        sales_products = "n/a"
    # total revenue
    sql_query_revenue = """SELECT 
                  IFNULL(SUM(`tabGL Entry`.`credit`) - SUM(`tabGL Entry`.`debit`), 0) AS `revenue`
                FROM `tabGL Entry`
                JOIN `tabAccount` ON `tabGL Entry`.`account` = `tabAccount`.`name`
                WHERE 
                  `tabGL Entry`.`docstatus` = 1
                  AND `tabAccount`.`account_type` = 'Income Account'
                  AND `tabGL Entry`.`cost_center` LIKE '{cost_center}'
                  AND `tabGL Entry`.`posting_date` >= '{from_date}'
                  AND `tabGL Entry`.`posting_date` <= '{to_date}';""".format(cost_center=cost_center, from_date=from_date, to_date=to_date)
    try:
        revenue = frappe.db.sql(sql_query_revenue, as_dict = True)[0]['revenue']
    except:
        revenue = "n/a"
    # services sales    
    sql_query_sales_services = """SELECT 
                  IFNULL(SUM(`tabGL Entry`.`credit`) - SUM(`tabGL Entry`.`debit`), 0) AS `sales_services`
                FROM `tabGL Entry`
                WHERE 
                  `tabGL Entry`.`docstatus` = 1
                  AND `tabGL Entry`.`account` LIKE '%Sales%'
                  AND `tabGL Entry`.`cost_center` LIKE '{cost_center}'
                  AND `tabGL Entry`.`posting_date` >= '{from_date}'
                  AND `tabGL Entry`.`posting_date` <= '{to_date}';""".format(cost_center=cost_center, from_date=from_date, to_date=to_date)
    try:
        sales_services = frappe.db.sql(sql_query_sales_services, as_dict = True)[0]['sales_services']
    except:
        sales_services = "n/a"
    # total sales
    total_sales = sales_products + sales_services

    # direct costs    
    sql_query_costs_material = """SELECT 
                  IFNULL(SUM(`tabGL Entry`.`debit`) - SUM(`tabGL Entry`.`credit`), 0) AS `costs_material`
                FROM `tabGL Entry`
                WHERE 
                  `tabGL Entry`.`docstatus` = 1
                  AND `tabGL Entry`.`account` LIKE '%Sales%'
                  AND `tabGL Entry`.`cost_center` LIKE '{cost_center}'
                  AND `tabGL Entry`.`posting_date` >= '{from_date}'
                  AND `tabGL Entry`.`posting_date` <= '{to_date}';""".format(cost_center=cost_center, from_date=from_date, to_date=to_date)
    try:
        costs_material = frappe.db.sql(sql_query_costs_material, as_dict = True)[0]['costs_material']
    except:
        costs_material = "n/a"
    
    # margin c1
    margin_c1 = total_sales - costs_material

    # indirect costs    
    sql_query_costs_indirect = """SELECT 
                  IFNULL(SUM(`tabGL Entry`.`debit`) - SUM(`tabGL Entry`.`credit`), 0) AS `costs_indirect`
                FROM `tabGL Entry`
                WHERE 
                  `tabGL Entry`.`docstatus` = 1
                  AND `tabGL Entry`.`account` LIKE '%Sales%'
                  AND `tabGL Entry`.`cost_center` LIKE '{cost_center}'
                  AND `tabGL Entry`.`posting_date` >= '{from_date}'
                  AND `tabGL Entry`.`posting_date` <= '{to_date}';""".format(cost_center=cost_center, from_date=from_date, to_date=to_date)
    try:
        costs_indirect = frappe.db.sql(sql_query_costs_indirect, as_dict = True)[0]['costs_indirect']
    except:
        costs_indirect = "n/a"
    # total expenses
    sql_query_expenses = """SELECT 
                  IFNULL(SUM(`tabGL Entry`.`credit`) - SUM(`tabGL Entry`.`debit`), 0) AS `revenue`
                FROM `tabGL Entry`
                JOIN `tabAccount` ON `tabGL Entry`.`account` = `tabAccount`.`name`
                WHERE 
                  `tabGL Entry`.`docstatus` = 1
                  AND `tabAccount`.`account_type` = 'Expense Account'
                  AND `tabGL Entry`.`cost_center` LIKE '{cost_center}'
                  AND `tabGL Entry`.`posting_date` >= '{from_date}'
                  AND `tabGL Entry`.`posting_date` <= '{to_date}';""".format(cost_center=cost_center, from_date=from_date, to_date=to_date)
    try:
        expenses = frappe.db.sql(sql_query_expenses, as_dict = True)[0]['revenue']
    except:
        expenses = "n/a"
    # overhead costs    
    sql_query_costs_overhead = """SELECT 
                  IFNULL(SUM(`tabBudget Overhead`.`rate_per_month`), 0) AS `costs_overhead`
                FROM `tabBudget Overhead`
                WHERE 
                  `tabBudget Overhead`.`docstatus` = 1
                  /* AND `tabBudget Overhead`.`group` LIKE '%Sales%' */
                  AND `tabBudget Overhead`.`cost_center` LIKE '{cost_center}'
                  AND `tabBudget Overhead`.`start_date` <= '{from_date}'
                  AND `tabBudget Overhead`.`end_date` >= '{to_date}';""".format(cost_center=cost_center, from_date=from_date, to_date=to_date)
    try:
        costs_overhead = frappe.db.sql(sql_query_costs_overhead, as_dict = True)[0]['costs_overhead']
    except:
        costs_overhead = "n/a"
    
    # total indirect costs
    total_indirect_costs = costs_indirect + costs_overhead        
    # margin c1
    margin_c2 = margin_c1 - total_indirect_costs
        
    # prepare report
    data.append(["<b>Deckungsbeitrag</b>", ""])
    data.append(["", ""])
    #data.append(["<b>Ertr&auml;ge</b>", "{0}".format(total_sales)])
    #data.append(["Produktertr&auml;ge", "{0}".format(sales_products)])
    #data.append(["Dienstleistungsertr&auml;ge", "{0}".format(sales_services)])
    #data.append(["", ""])
    #data.append(["<b>Direkte Aufwendungen</b>", "{0}".format(costs_material)])
    #data.append(["Materialkosten", "{0}".format(costs_material)])
    #data.append(["", ""])
    #data.append(["<b>C1 Marge</b>", "{0}".format(margin_c1)])
    #data.append(["", ""])
    #data.append(["<b>Indirekte Aufwendungen</b>", "{0}".format(total_indirect_costs)])
    #data.append(["Aufwendungen", "{0}".format(costs_material)])
    #data.append(["Overheads", "{0}".format(costs_overhead)])
    #data.append(["", ""])
    #data.append(["<b>C2 Marge</b>", "{0}".format(margin_c2)])
    data.append(["<b>Ertr&auml;ge</b>", "{0}".format(revenue)])
    data.append(["", ""])
    data.append(["<b>Aufwendungen</b>", "{0}".format(expenses + costs_overhead)])
    data.append(["Aufwendungen", "{0}".format(expenses)])
    data.append(["Overheads", "{0}".format(costs_overhead)])
    data.append(["", ""])
    data.append(["Marge", "{0}".format(revenue + expenses + costs_overhead)])
    
    # return data
    return columns, data
