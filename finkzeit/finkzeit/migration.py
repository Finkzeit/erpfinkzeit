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
CUSTOMER_NAME = 1                 # K-##### (column B)


def import_customers(filename, force_update=False):
    if force_update == "True" or force_update == 1:
        force_update = True

		# open workbook
		workbook = load_workbook(filename)
		worksheet = workbook[0]
        for row in worksheet.iter_rows('A{}:A{}'.format(ws.min_row,ws.max_row):
            # loop through all customers
            print(row)
            cells = row
            print("cells: {0}".format(len(cells)))
            if len(cells) >= 23:
                # check if customer exists by ID
                matches_by_id = frappe.get_all("Customer", filters={'name': get_field(cells[CUSTOMER_NAME])}, fields=['name'])
                print("Customer: {0}".format(get_field(cells[ADRNR])))
                if matches_by_id:
                    # found customer, update
                    print("updating...")
                    update_customer(matches_by_id[0]['name'], cells, force_update)
                else:
                    # no match found by ID, check name with 0 (ID not set)
					print("creating...")
					create_customer(cells)
    return

def get_full_name(cells):
    return "{0} {1}".format(get_field(cells[VNAME]), get_field(cells[NNAME]))

def get_first_name(cells):
    if get_field(cells[VNAME]) == "":
        first_name = "-"
    else:
        first_name = get_field(cells[VNAME])
    return first_name

def get_address_line(cells):
    if get_field(cells[STRAS]) == "":
        address_line = "-"
    else:
        address_line = "{0} {1}".format(get_field(cells[STRAS]), get_field(cells[STRASNR]))
    return address_line

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
    fullname = get_full_name(cells)
    cus = frappe.get_doc(
        {
            "doctype":"Customer", 
            "customer_name": fullname,
            "customer_type": "Individual",
            "customer_group": "All Customer Groups",
            "territory": "All Territories",
            "description": get_field(cells[NBEZ1]),
            "company": get_field(cells[NBEZ2]),
            "first_name": get_field(cells[VNAME]),
            "last_name": get_field(cells[NNAME]),
            "language": get_erp_language(get_field(cells[SPRCD])),
            "payment_terms": get_field(cells[KONDI])
        })
    try:
        new_customer = cus.insert()
    except Exception as e:
        print(_("Insert customer failed"), _("Insert failed for customer {0} {1} ({2}): {3}").format(
            get_field(cells[VNAME]), get_field(cells[NNAME]), get_field(cells[ADRNR]), e))
    else:
        create_contact(cells, new_customer.name)
        create_address(cells, new_customer.name)
    # write changes to db
    frappe.db.commit()
    return

def create_contact(cells, customer):
    try:
        fullname = get_full_name(cells)
        if get_field(cells[VNAME]) == "":
            first_name = "-"
        else:
            first_name = get_field(cells[VNAME])
        con = frappe.get_doc(
            {
                "doctype":"Contact", 
                "name": "{0} ({1})".format(fullname, customer),
                "first_name": get_first_name(cells),
                "last_name": get_field(cells[NNAME]),
                "email_id": get_field(cells[EMAILADR]),
                "salutation": get_field(cells[ANRED]),
                "letter_salutation": get_field(cells[BRANRED]),
                "fax": get_field(cells[TELEF]),
                "phone": get_field(cells[TELEP]),
                "mobile_no": get_field(cells[NATEL]),
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
            get_field(cells[VNAME]), get_field(cells[NNAME]), get_field(cells[ADRNR]), e))
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
                "city": get_field(cells[ORTBZ]),
                "pincode": get_field(cells[PLZAL]),
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
            get_field(cells[VNAME]), get_field(cells[NNAME]), get_field(cells[ADRNR]), e))
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
            xl_mod_date = datetime.strptime(get_field(cells[MUTDT]), '%d.%m.%Y')
            erp_mod_date = datetime.strptime(str(cus.modified).split(' ')[0], '%Y-%m-%d')
            if xl_mod_date >= erp_mod_date:
                update = True
        except Exception as e:
            print(_("Invalid modification date"), _("Modification date of {0} ({1}) is invalid: {2}").format(
                get_field(cells[ADRNR]), get_field(cells[MUTDT]), get_field(cells[ADRNR]), e))
            update = True
    if update:
        #print("perform update")
        fullname = "{0} {1}".format(get_field(cells[VNAME]), get_field(cells[NNAME]))
        cus.customer_name = fullname
        cus.first_name = get_field(cells[VNAME])
        cus.last_name = get_field(cells[NNAME])
        cus.description = get_field(cells[NBEZ1])
        cus.company = get_field(cells[NBEZ2])
        cus.language = get_erp_language(get_field(cells[SPRCD]))
        cus.payment_terms = get_field(cells[KONDI])
        try:
            cus.save()
        except Exception as e:
            print(_("Update customer failed"), _("Update failed for customer {0} {1} ({2}): {3}").format(
                get_field(cells[VNAME]), get_field(cells[NNAME]), get_field(cells[ADRNR]), e))
        else:
            con_id = frappe.get_all("Dynamic Link", 
                filters={'link_doctype': 'Customer', 'link_name': cus.name, 'parenttype': 'Contact'},
                fields=['parent'])
            if con_id:
                # update contact
                con = frappe.get_doc("Contact", con_id[0]['parent'])
                con.first_name = get_first_name(cells)
                con.last_name = get_field(cells[NNAME]) or ''
                con.email_id = get_field(cells[EMAILADR]) or ''
                con.salutation = get_field(cells[ANRED]) or ''
                con.letter_salutation = get_field(cells[BRANRED]) or ''
                con.fax = get_field(cells[TELEF]) or ''
                con.phone = get_field(cells[TELEP]) or ''
                try:
                    con.save()
                except Exception as e:
                    print(_("Update contact failed"), _("Update failed for contact {0} {1} ({2}): {3}").format(
                        get_field(cells[VNAME]), get_field(cells[NNAME]), get_field(cells[ADRNR]), e))
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
                    address_line = "{0} {1}".format(get_field(cells[STRAS]), get_field(cells[STRASNR]))
                adr = frappe.get_doc("Address", adr_id[0]['parent'])
                adr.address_title = fullname
                adr.address_line1 = get_address_line(cells) or ''
                adr.city = get_field(cells[ORTBZ]) or ''
                adr.pincode = get_field(cells[PLZAL]) or ''
                adr.is_primary_address = 1
                adr.is_shipping_address = 1
                adr.country = get_country_from_dland(get_field(cells[DLAND]))
                try:
                    adr.save()
                except Exception as e:
                    print(_("Update address failed"), _("Update address for contact {0} {1} ({2}): {3}").format(
                        get_field(cells[VNAME]), get_field(cells[NNAME]), get_field(cells[ADRNR]), e))
            else:
                # address not found, create
                create_address(cells, cus.name)
    # write changes to db
    frappe.db.commit()
    return