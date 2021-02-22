# Copyright (c) 2019-2020, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from datetime import datetime

def execute(filters=None):
    columns, data = [], []

    # prepare columns
    columns = [
        "Nr::50",
        "Konto:Link/Account:200",
        "Anfangssaldo:Currency:100",
        "Soll:Currency:100",
        "Haben:Currency:100",
        "Schlusssaldo:Currency:100",
        "Typ::150"
    ]

    # prepare filters
    from_date = "2000-01-01"
    to_date = datetime.today()
    if filters.to_date:
        to_date = filters.to_date
    if filters.from_date:
        from_date = filters.from_date

    report_type = "%"
    if filters.report_type:
        report_type = filters.report_type
        
    data = get_data(from_date, to_date, report_type)

    return columns, data

def get_data(from_date, to_date, report_type):   
    # prepare query
    sql_query = """
       SELECT *, (`raw`.`Anfangssaldo` + `raw`.`Soll` - `raw`.`Haben`) AS `Schlusssaldo` 
       FROM
       (SELECT 
          `tabAccount`.`account_number` AS `Kontonummer`,
          `tabAccount`.`name` AS `Konto`, 
          IFNULL((SELECT 
             ROUND((SUM(`t1`.`debit`) - SUM(`t1`.`credit`)), 2)
           FROM `tabGL Entry` AS `t1`
           WHERE 
             `t1`.`posting_date` < '{from_date}'
            AND `t1`.`account` = `tabAccount`.`name`
          ), 0) AS `Anfangssaldo`,
          IFNULL((SELECT 
             ROUND((SUM(`t3`.`debit`)), 2)
           FROM `tabGL Entry` AS `t3`
           WHERE 
             `t3`.`posting_date` <= '{to_date}'
             AND `t3`.`posting_date` >= '{from_date}'
            AND `t3`.`account` = `tabAccount`.`name`
          ), 0) AS `Soll`,
          IFNULL((SELECT 
             ROUND((SUM(`t4`.`credit`)), 2)
           FROM `tabGL Entry` AS `t4`
           WHERE 
             `t4`.`posting_date` <= '{to_date}'
             AND `t4`.`posting_date` >= '{from_date}'
            AND `t4`.`account` = `tabAccount`.`name`
          ), 0) AS `Haben`,
          `tabAccount`.`report_type` AS `Typ`
       FROM `tabAccount`
       WHERE 
         `tabAccount`.`is_group` = 0
         AND `tabAccount`.`report_type` LIKE '{report_type}'
       ) AS `raw`
       WHERE (`raw`.`Anfangssaldo` + `raw`.`Soll` - `raw`.`Haben`) != 0;""".format(from_date=from_date, to_date=to_date, report_type=report_type)
 
    # run query, as list, otherwise export to Excel fails 
    data = frappe.db.sql(sql_query, as_list = True)
    return data
