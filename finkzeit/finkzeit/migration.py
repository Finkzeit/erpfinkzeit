# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#
# Run with
#   bench execute finkzeit.finkzeit.migration.import_customers --kwargs "{'filename': '/mnt/share/testing.xlsx'}"

# imports
from __future__ import unicode_literals
import frappe
from frappe import _
import csv
import codecs
from datetime import datetime
from openpyxl import load_workbook

# column allocation
FIRST_DATA_ROW = 4              # first row containing data (after headers)
CUSTOMER_ID = 1                 # K-##### (column B)
CUSTOMER_NAME = 2               # customer name (column C)
ADR_LINE_1 = 5                  # first address line (clumn E)
ADR_LINE_2 = 4                  # additional address text (column E)
ADR_PLZ = 6                     # pincode for address
ADR_CITY = 7                    # address city
ADR_COUNTRY = 8                 # country (code, e.g. AT)
CUSTOMER_KST = 9                # customer cost center (999: FZV, ???: FZT, ???: FZW)
CUSTOMER_DESCRIPTION = 46       # long description
CUSTOMER_CONDITIONS = 16        # payment conditions

def import_customers(filename, force_update=False):
    if force_update == "True" or force_update == 1:
        force_update = True

    # open workbook
    print("Loading {0}...".format(filename))
    workbook = load_workbook(filename)
    worksheet = workbook["Tabelle1"]
    for row in worksheet.iter_rows('A{}:BH{}'.format(FIRST_DATA_ROW, worksheet.max_row)):
        # loop through all customers
        #print(row)
        cells = row
        print("cells: {0}".format(len(cells)))
        if len(cells) >= 23:
            # check if customer exists by ID
            #print(cells[CUSTOMER_ID].value)
            matches_by_id = frappe.get_all("Customer", filters={'name': cells[CUSTOMER_ID].value}, fields=['name'])
            print("Customer: {0}".format(cells[CUSTOMER_ID].value))
            if matches_by_id:
                # found customer, update
                print("updating...")
                update_customer(matches_by_id[0]['name'], cells, force_update)
            else:
                # no match found by ID, check name with 0 (ID not set)
                print("creating...")
                create_customer(cells)
    return

def get_country_from_dland(dland):
    if not dland or dland == "":
        return "Schweiz"
    else:
        countries = frappe.get_all('Country', filters={'code':dland.lower()}, fields=['name'])
        if countries:
            return countries[0]['name']
        else:
            return "Schweiz"

def create_customer(cells):
    # create record
    cus = frappe.get_doc(
        {
            "doctype":"Customer", 
            "name": cells[CUSTOMER_ID].value,
            "naming_series": "K-#####",
            "customer_name": cells[CUSTOMER_NAME].value,
            "customer_type": "Company",
            "customer_group": "All Customer Groups",
            "territory": "All Territories",
            "description": cells[CUSTOMER_DESCRIPTION].value,
            "payment_terms": cells[CUSTOMER_CONDITIONS].value
        })
    try:
        new_customer = cus.insert()
    except Exception as e:
        print(_("Insert customer failed"), _("Insert failed for customer {0}: {1}").format(
            cells[CUSTOMER_ID].value, e))
    else:
        #create_contact(cells, new_customer.name)
        #create_address(cells, new_customer.name)
        pass
    # write changes to db
    frappe.db.commit()
    return

def create_contact(cells, customer):
    try:
        fullname = get_full_name(cells)
        if cells[VNAME].value == "":
            first_name = "-"
        else:
            first_name = cells[VNAME].value
        con = frappe.get_doc(
            {
                "doctype":"Contact", 
                "name": "{0} ({1})".format(fullname, customer),
                "first_name": get_first_name(cells),
                "last_name": cells[NNAME].value,
                "email_id": cells[EMAILADR].value,
                "salutation": cells[ANRED].value,
                "letter_salutation": cells[BRANRED].value,
                "fax": cells[TELEF].value,
                "phone": cells[TELEP].value,
                "mobile_no": cells[NATEL].value,
                "links": [
                    {
                        "link_doctype": "Customer",
                        "link_name": customer
                    }
                ]
            })
        new_contact = con.insert()
        return new_contact
    except Exception as e:
        print(_("Insert contact failed"), _("Insert failed for contact {0} {1} ({2}): {3}").format(
            cells[VNAME].value, cells[NNAME].value, cells[CUSTOMER_ID].value, e))
        return None

def create_address(cells, customer):
    try:
        fullname = get_full_name(cells)
        adr = frappe.get_doc(
            {
                "doctype":"Address", 
                "name": "{0} ({1})".format(fullname, customer),
                "address_title": "{0} ({1})".format(fullname, customer),
                "address_line1": get_address_line(cells),
                "city": cells[ORTBZ].value,
                "pincode": cells[PLZAL].value,
                "is_primary_address": 1,
                "is_shipping_address": 1,
                "country": get_country_from_dland(get_field(cells[DLAND])),
                "links": [
                    {
                        "link_doctype": "Customer",
                        "link_name": customer
                    }
                ]
            })
        new_adr = adr.insert()
        return new_adr
    except Exception as e:
        print(_("Insert address failed"), _("Insert failed for address {0} {1} ({2}): {3}").format(
            cells[VNAME].value, cells[NNAME].value, cells[CUSTOMER_ID].value, e))
        return None
    
def update_customer(name, cells, force=False):
    # get customer record
    cus = frappe.get_doc("Customer", name)
    # check last modification date
    update = False
    if force:
        update = True
    else:
        try:
            xl_mod_date = datetime.strptime(cells[MUTDT].value, '%d.%m.%Y')
            erp_mod_date = datetime.strptime(str(cus.modified).split(' ')[0], '%Y-%m-%d')
            if xl_mod_date >= erp_mod_date:
                update = True
        except Exception as e:
            print(_("Invalid modification date"), _("Modification date of {0} ({1}) is invalid: {2}").format(
                cells[CUSTOMER_ID].value, cells[MUTDT].value, e))
            update = True
    if update:
        #print("perform update")
        fullname = "{0} {1}".format(cells[VNAME].value, cells[NNAME].value)
        cus.customer_name = fullname
        cus.first_name = cells[VNAME].value
        cus.last_name = cells[NNAME]
        cus.description = cells[NBEZ1].value
        cus.company = cells[NBEZ2].value
        cus.language = get_erp_language(cells[SPRCD].value)
        cus.payment_terms = cells[KONDI].value
        try:
            cus.save()
        except Exception as e:
            print(_("Update customer failed"), _("Update failed for customer {0} {1} ({2}): {3}").format(
                cells[VNAME].value, cells[NNAME].value, cells[CUSTOMER_ID].value, e))
        else:
            con_id = frappe.get_all("Dynamic Link", 
                filters={'link_doctype': 'Customer', 'link_name': cus.name, 'parenttype': 'Contact'},
                fields=['parent'])
            if con_id:
                # update contact
                con = frappe.get_doc("Contact", con_id[0]['parent'])
                con.first_name = get_first_name(cells)
                con.last_name = cells[NNAME].value or ''
                con.email_id = cells[EMAILADR].value or ''
                con.salutation = cells[ANRED].value or ''
                con.letter_salutation = cells[BRANRED].value or ''
                con.fax = cells[TELEF].value or ''
                con.phone = cells[TELEP].value or ''
                try:
                    con.save()
                except Exception as e:
                    print(_("Update contact failed"), _("Update failed for contact {0} {1} ({2}): {3}").format(
                        cells[VNAME].value, cells[NNAME].value, cells[CUSTOMER_ID].value, e))
            else:
                # no contact available, create
                create_contact(cells, cus.name)
            adr_id = frappe.get_all("Dynamic Link", 
                    filters={'link_doctype': 'Customer', 'link_name': cus.name, 'parenttype': 'Address'},
                    fields=['parent'])
            if adr_id:
                if get_field(cells[STRAS]) == "":
                    address_line = "-"
                else:
                    address_line = "{0} {1}".format(cells[STRAS].value, cells[STRASNR].value)
                adr = frappe.get_doc("Address", adr_id[0]['parent'])
                adr.address_title = fullname
                adr.address_line1 = get_address_line(cells) or ''
                adr.city = cells[ORTBZ].value or ''
                adr.pincode = cells[PLZAL].value or ''
                adr.is_primary_address = 1
                adr.is_shipping_address = 1
                adr.country = get_country_from_dland(cells[DLAND].value)
                try:
                    adr.save()
                except Exception as e:
                    print(_("Update address failed"), _("Update address for contact {0} {1} ({2}): {3}").format(
                        cells[VNAME].value, cells[NNAME].value, cells[CUSTOMER_ID].value, e))
            else:
                # address not found, create
                create_address(cells, cus.name)
    # write changes to db
    frappe.db.commit()
    return
