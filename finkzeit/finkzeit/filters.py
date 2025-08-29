# Copyright (c) 2025, libracore and Contributors
# Licence: GNU General Public Licence v3. See licence.txt

import frappe

# find licences for customer but include disabled (core function silently hides them)
def licences_by_customer(doctype, txt, searchfield, start, page_len, filters):
    return frappe.db.sql("""
        SELECT `tabLicence`.`name`, `tabLicence`.`title`
        FROM `tabLicence`
        WHERE
            `tabLicence`.`customer` LIKE "{customer}"
            AND (`tabLicence`.`name` LIKE "%{txt}%" OR `tabLicence`.`title` LIKE "%{txt}%")
        ;""".format(txt=txt, customer=(filters.get("customer") or "%"))
        )
