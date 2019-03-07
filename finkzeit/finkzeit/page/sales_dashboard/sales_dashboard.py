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
    if py:
        d = datetime.now() - relativedelta(years=1)
    else:
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
def get_cashflow_for_user(user):
    cost_center = frappe.get_value("User", user, "cost_center")
    return get_cashflows(cost_center)

def get_cashflows(cost_center):
    revenue_ytd = get_cashflow_to_date(cost_center, py=False, income=True)
    revenue_py = get_cashflow_to_date(cost_center, py=True, income=True)
    if revenue_py == 0:
        revenue_trend = "n/a"
        revenue_indicator = ""
    elif revenue_ytd >= revenue_py:
        revenue_trend = "+{0:.1f}%".format(100.0 * revenue_ytd / revenue_py)
        revenue_indicator = "border-success"
    else:
        revenue_trend = "-{0:.1f}%".format(100.0 * revenue_ytd / revenue_py)
        revenue_indicator = "border-danger"
    expenses_ytd = get_cashflow_to_date(cost_center, py=False, income=False)
    expenses_py = get_cashflow_to_date(cost_center, py=True, income=False)
    if expenses_py == 0:
        expenses_trend = "n/a"
        expenses_indicator = ""
    elif expenses_ytd >= expenses_py:
        expenses_trend = "+{0:.1f}%".format(100.0 * expenses_ytd / expenses_py)
        expenses_indicator = "border-danger"
    else:
        expenses_trend = "-{0:.1f}%".format(100.0 * expenses_ytd / expenses_py)
        expenses_indicator = "border-success"
    profit_ytd = revenue_ytd - expenses_ytd
    profit_py = revenue_py - expenses_py
    if profit_py == 0:
        profit_trend = "n/a"
        profit_indicator = ""
    elif profit_ytd >= profit_py:
        profit_trend = "+{0:.1f}%".format(100.0 * profit_ytd / profit_py)
        profit_indicator = "border-success"
    else:
        profit_trend = "-{0:.1f}%".format(100.0 * profit_ytd / profit_py)
        profit_indicator = "border-danger"
    cashflows = {
        'revenue': {
            'ytd': "{0:,.0f}".format(revenue_ytd).replace(",", "'").replace(".", ",").replace("'", "."),
            'py': "{0:,.0f}".format(revenue_py).replace(",", "'").replace(".", ",").replace("'", "."),
            'trend': revenue_trend,
            'indicator': revenue_indicator,
            'title': _("Revenue")
        },
        'expenses': {
            'ytd': "{0:,.0f}".format(expenses_ytd).replace(",", "'").replace(".", ",").replace("'", "."),
            'py': "{0:,.0f}".format(expenses_py).replace(",", "'").replace(".", ",").replace("'", "."),
            'trend': expenses_trend,
            'indicator': expenses_indicator,
            'title': _("Expenses")
        },
        'profit': {
            'ytd': "{0:,.0f}".format(profit_ytd).replace(",", "'").replace(".", ",").replace("'", "."),
            'py': "{0:,.0f}".format(profit_py).replace(",", "'").replace(".", ",").replace("'", "."),
            'trend': profit_trend,
            'indicator': profit_indicator,
            'title': _("Profit")
        },
        'monthly_revenue_ytd': get_cashflow_per_month(cost_center, py=False, income=True),
        'monthly_revenue_py': get_cashflow_per_month(cost_center, py=True, income=True),
        'monthly_expenses_ytd': get_cashflow_per_month(cost_center, py=False, income=False),
        'monthly_expenses_py': get_cashflow_per_month(cost_center, py=True, income=False),
        'cost_center': cost_center
    }
    print("{0}".format(cashflows))
    return {'cashflows': cashflows}

@frappe.whitelist()
def get_documents_for_user(user):
    cost_center = frappe.get_value("User", user, "cost_center")
    return get_documents(cost_center)

def get_documents(cost_center):
    # open quotations
    sql_query_quotation = """SELECT
                  IFNULL(COUNT(`tabQuotation`.`name`), 0) AS `count`,
                  IFNULL(SUM(`tabQuotation`.`grand_total`), 0) AS `amount`
                FROM `tabQuotation`
                LEFT JOIN `tabCustomer` ON `tabQuotation`.`customer` = `tabCustomer`.`name`
                WHERE
                  `tabQuotation`.`status` = 'Submitted'
                  AND `tabQuotation`.`docstatus` = 1
                  AND `tabCustomer`.`kostenstelle` LIKE '{cost_center}';""".format(cost_center=cost_center)
    try:
        result = frappe.db.sql(sql_query_quotation, as_dict = True)[0]
        quotation_count = result['count']
        quotation_amount = result['amount']
    except:
        quotation_count = 0
        quotation_amount = 0.0

    # open sales orders
    sql_query_sales_order = """SELECT
                  IFNULL(COUNT(`tabSales Order`.`name`), 0) AS `count`,
                  IFNULL(SUM(`tabSales Order`.`grand_total`), 0) AS `amount`
                FROM `tabSales Order`
                LEFT JOIN `tabCustomer` ON `tabSales Order`.`customer` = `tabCustomer`.`name`
                WHERE
                  `tabSales Order`.`docstatus` = 1
                  AND `tabSales Order`.`status` NOT IN ('Completed', 'Closed')
                  AND `tabCustomer`.`kostenstelle` LIKE '{cost_center}';""".format(cost_center=cost_center)
    try:
        result = frappe.db.sql(sql_query_sales_order, as_dict = True)[0]
        sales_order_count = result['count']
        sales_order_amount = result['amount']
    except:
        sales_order_count = 0
        sales_order_amount = 0.0

    # open sales invoices
    sql_query_sales_invoice = """SELECT
                  IFNULL(COUNT(`tabSales Invoice`.`name`), 0) AS `count`,
                  IFNULL(SUM(`tabSales Invoice`.`outstanding_amount`), 0) AS `amount`
                FROM `tabSales Invoice`
                LEFT JOIN `tabCustomer` ON `tabSales Invoice`.`customer` = `tabCustomer`.`name`
                WHERE
                  `tabSales Invoice`.`docstatus` = 1
                  AND `tabSales Invoice`.`outstanding_amount` > 0
                  AND `tabCustomer`.`kostenstelle` LIKE '{cost_center}';""".format(cost_center=cost_center)
    try:
        result = frappe.db.sql(sql_query_sales_invoice, as_dict = True)[0]
        sales_invoice_count = result['count']
        sales_invoice_amount = result['amount']
    except:
        sales_invoice_count = 0
        sales_invoice_amount = 0.0

    documents = {
        'quotation_count': quotation_count,
        'sales_order_count': sales_order_count,
        'sales_invoice_count': sales_invoice_count,
        'quotation_amount': "{0:,.0f}".format(quotation_amount).replace(",", "'").replace(".", ",").replace("'", "."),
        'sales_order_amount': "{0:,.0f}".format(sales_order_amount).replace(",", "'").replace(".", ",").replace("'", "."),
        'sales_invoice_amount': "{0:,.0f}".format(sales_invoice_amount).replace(",", "'").replace(".", ",").replace("'", ".")
    }
    print("{0}".format(documents))
    return {'documents': documents}

@frappe.whitelist()
def get_service_share_for_user(user):
    cost_center = frappe.get_value("User", user, "cost_center")
    return get_service_share(cost_center)

def get_service_share(cost_center):
    # time spans
    py = datetime.now() - relativedelta(years=1)
    ytd = datetime.now()
    # service shares
    ytd_service = get_share("{y}-01-01".format(y=ytd.year),
        "{y}-{m}-{d}".format(y=ytd.year, m=ytd.month, d=ytd.day), cost_center, service=True)
    ytd_material = get_share("{y}-01-01".format(y=ytd.year),
        "{y}-{m}-{d}".format(y=ytd.year, m=ytd.month, d=ytd.day), cost_center, service=False)
    py_service = get_share("{y}-01-01".format(y=py.year),
        "{y}-{m}-{d}".format(y=py.year, m=py.month, d=py.day), cost_center, service=True)
    py_material = get_share("{y}-01-01".format(y=py.year),
        "{y}-{m}-{d}".format(y=py.year, m=py.month, d=py.day), cost_center, service=False)
    if (ytd_service + ytd_material) > 0:
        ytd_service_share = "{0:.1f}%".format( 100.0 * ytd_service / (ytd_service + ytd_material) )
    else:
        ytd_service_share = "n/a"
    if (py_service + py_material) > 0:
        py_service_share = "{0:.1f}%".format( 100.0 * py_service / (py_service + py_material) )
    else:
        py_service_share = "n/a"

    shares = {
        'service_share_ytd': ytd_service_share,
        'service_ytd': ytd_service,
        'material_ytd': ytd_material,
        'service_share_py': py_service_share,
        'service_py': py_service,
        'material_py': py_material,
    }
    print("{0}".format(shares))
    return {'shares': shares}

def get_share(from_date, to_date, cost_center, service=True):
    if service:
        service_mask = "'4000', '4005', '4020'"
    else:
        service_mask = "'4200', '4220', '4250'"

    sql_query = """SELECT
              IFNULL(SUM(`tabGL Entry`.`credit`) - SUM(`tabGL Entry`.`debit`), 0) AS `share`
            FROM `tabGL Entry`
            JOIN `tabAccount` ON `tabGL Entry`.`account` = `tabAccount`.`name`
            WHERE
              `tabGL Entry`.`docstatus` = 1
              AND `tabAccount`.`account_number` IN ({service_mask})
              AND `tabGL Entry`.`cost_center` LIKE '{cost_center}'
              AND `tabGL Entry`.`posting_date` >= '{from_date}'
              AND `tabGL Entry`.`posting_date` <= '{to_date}';""".format(
        cost_center=cost_center, from_date=from_date, to_date=to_date, service_mask=service_mask)
    try:
        share = frappe.db.sql(sql_query, as_dict = True)[0]['share']
    except:
        share = 0.0
    return share
