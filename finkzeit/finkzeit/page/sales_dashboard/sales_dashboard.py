# -*- coding: utf-8 -*-
# Copyright (c) 2017-2019, Fink Zeitsysteme, libracore and contributors
# License: AGPL v3. See LICENCE

from __future__ import unicode_literals
import frappe
from frappe import throw, _
from datetime import datetime
from dateutil.relativedelta import relativedelta
from calendar import monthrange

def get_cashflow_to_date(cost_center, py=False, income=True):
    if py:
        d = datetime.now() - relativedelta(years=1)
    else:
        d = datetime.now()
    return get_cashflow("{y}-01-01".format(y=d.year), 
        "{y}-{m}-{d}".format(y=d.year, m=d.month, d=d.day),
        cost_center, income)
                
def get_cashflow_per_month(cost_center, py=False, income=True):
    d = datetime.now()
    x, feb = monthrange(d.year,2)
    cashflows = [
        get_cashflow("{y}-01-01".format(y=d.year), "{y}-01-31".format(y=d.year), cost_center, income),
        get_cashflow("{y}-02-01".format(y=d.year), "{y}-02-{f}".format(y=d.year, f=feb), cost_center, income),
        get_cashflow("{y}-03-01".format(y=d.year), "{y}-03-31".format(y=d.year), cost_center, income),
        get_cashflow("{y}-04-01".format(y=d.year), "{y}-04-30".format(y=d.year), cost_center, income),
        get_cashflow("{y}-05-01".format(y=d.year), "{y}-05-31".format(y=d.year), cost_center, income),
        get_cashflow("{y}-06-01".format(y=d.year), "{y}-06-30".format(y=d.year), cost_center, income),
        get_cashflow("{y}-07-01".format(y=d.year), "{y}-07-31".format(y=d.year), cost_center, income),
        get_cashflow("{y}-08-01".format(y=d.year), "{y}-08-31".format(y=d.year), cost_center, income),
        get_cashflow("{y}-09-01".format(y=d.year), "{y}-09-30".format(y=d.year), cost_center, income),
        get_cashflow("{y}-10-01".format(y=d.year), "{y}-10-31".format(y=d.year), cost_center, income),
        get_cashflow("{y}-11-01".format(y=d.year), "{y}-11-30".format(y=d.year), cost_center, income),
        get_cashflow("{y}-12-01".format(y=d.year), "{y}-12-31".format(y=d.year), cost_center, income)
    ]
    return cashflows
                  
def get_cashflow(from_date, to_date, cost_center, income=True):
    if income:
        t = "Income Account"
    else:
        t = "Expense Account"
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
            costs_overhead = 0.0
    sql_query = """SELECT 
              IFNULL(SUM(`tabGL Entry`.`credit`) - SUM(`tabGL Entry`.`debit`), 0) AS `cashflow`
            FROM `tabGL Entry`
            JOIN `tabAccount` ON `tabGL Entry`.`account` = `tabAccount`.`name`
            WHERE 
              `tabGL Entry`.`docstatus` = 1
              AND `tabAccount`.`account_type` = '{t}'
              AND `tabGL Entry`.`cost_center` LIKE '{cost_center}'
              AND `tabGL Entry`.`posting_date` >= '{from_date}'
              AND `tabGL Entry`.`posting_date` <= '{to_date}';""".format(t=t, cost_center=cost_center, from_date=from_date, to_date=to_date)
    try:
        cashflow = frappe.db.sql(sql_query, as_dict = True)[0]['cashflow']
    except:
        cashflow = 0.0
    if income:
        return cashflow
    else:
        return ((-1) * cashflow) + costs_overhead

@frappe.whitelist()
def get_cashflows(cost_center):
    cashflows = {
        'revenue_ytd': get_cashflow_to_date(cost_center, py=False, income=True),
        'revenue_py': get_cashflow_to_date(cost_center, py=True, income=True),
        'expenses_ytd': get_cashflow_to_date(cost_center, py=False, income=False),
        'expenses_py': get_cashflow_to_date(cost_center, py=True, income=False),
        'monthly_revenue_ytd': get_cashflow_per_month(cost_center, py=False, income=True),
        'monthly_revenue_py': get_cashflow_per_month(cost_center, py=True, income=True),
        'monthly_expenses_ytd': get_cashflow_per_month(cost_center, py=False, income=False),
        'monthly_expenses_py': get_cashflow_per_month(cost_center, py=True, income=False)
    }
    print("{0}".format(cashflows))
    return cashflows
