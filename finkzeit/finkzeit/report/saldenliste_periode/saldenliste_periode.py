# Copyright (c) 2019-2022, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from datetime import datetime
from frappe import _

def execute(filters=None):
    columns, data = [], []

    # prepare columns
    columns = get_columns()

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
        
    data = get_data(from_date, to_date, report_type, exclude_closing=filters.get('exclude_closing'))

    return columns, data

def get_columns():
    return [
        {"label": _("Nr"), "fieldname": "kontonummer", "fieldtype": "Data", "width": 50},
        {"label": _("Konto"), "fieldname": "konto", "fieldtype": "Link", "options": "Account", "width": 200},
        {"label": _("Anfangssaldo"), "fieldname": "anfang", "fieldtype": "Currency", "width": 100},
        {"label": _("Soll"), "fieldname": "soll", "fieldtype": "Currency", "width": 100},
        {"label": _("Haben"), "fieldname": "haben", "fieldtype": "Currency", "width": 100},
        {"label": _("Schlusssaldo"), "fieldname": "schluss", "fieldtype": "Currency", "width": 100},
        {"label": _("Typ"), "fieldname": "typ", "fieldtype": "Data", "width": 150}
    ]
    
@frappe.whitelist()
def get_data(from_date, to_date, report_type, exclude_closing=False):
    if exclude_closing:
        exclude_condition = """ AND voucher_type != 'Period Closing Voucher' """
    else:
        exclude_condition = ""
    # prepare query
    sql_query = """
       WITH `gl` AS (
          SELECT
              `account`,
              SUM(CASE WHEN `posting_date` < %(from_date)s THEN `debit` - `credit` ELSE 0 END) AS `anfang`,
              SUM(CASE WHEN `posting_date` BETWEEN %(from_date)s AND %(to_date)s 
                    {exclude_condition}
                  THEN `debit` ELSE 0 END) AS `soll`,
              SUM(CASE WHEN `posting_date` BETWEEN %(from_date)s AND %(to_date)s 
                    {exclude_condition}
                  THEN `credit` ELSE 0 END) AS `haben`,
          FROM `tabGL Entry`
          GROUP BY `account`
      )
      SELECT
          `acc`.`account_number` AS `kontonummer`,
          `acc`.`name` AS `konto`,
          `acc`.`report_type` AS `typ`,
          IFNULL(`gl`.`anfang`, 0) AS `anfang`,
          IFNULL(`gl`.`soll`, 0) AS `soll`,
          IFNULL(`gl`.`haben`, 0) AS `haben`,
          (IFNULL(`gl`.`anfang`, 0) + IFNULL(`gl`.`soll`, 0) - IFNULL(`gl`.`haben`, 0)) AS `schluss`,
      FROM `tabAccount` AS `acc`
      LEFT JOIN `gl` ON `gl`.`account` = `acc`.`name`
      WHERE `acc`.`is_group` = 0
        AND `acc`.`report_type` LIKE %(report_type)s
      ORDER BY `acc`.`account_number`;""".format(exclude_condition=exclude_condition)
 
    # run query
    data = frappe.db.sql(
        sql_query, 
        {
            'from_date': from_date,
            'to_date': to_date, 
            'report_type': report_type
        },
        as_dict = True
    )
    return data
