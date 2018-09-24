# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe.utils.background_jobs import enqueue
from datetime import datetime
class Licence(Document):
    def generate_licence_file(self):
        # create yaml header
        content = make_line("!licenseConf")
		!licenseConf
        content = make_line("id: {0} # Lizenz ID (kunde_ort) für Start URL http://zsw.finkzeit.at/leerlic".format(self.customer))
        content = make_line("description: {0}".format(self.customer_name))
        content = make_line("valid_until: {day}.{month}.{year}".format(day=self.valid_until.day, month=self.valid_until.month, year=self.valid_until.year) ) 
		now = datetime.now()
		content = make_line("creationDate: {day}.{month}.{year}".format(day=now.day, month=now.month, year=now.year) ) 
        content = make_line("runtime: at.finkzeit.zsw.server.runtime.StandardRuntime")
		if self.retailer:
            content = make_line("retailer: {0}".format(self.retailer_image))
            content = make_line("retailerURL: {0}".format(self.retailer_url))
        content = make_line("")
        content = make_line("# Benutzerlimit (gekaufte User)")
        content = make_line("concurrent_users: {0}".format(self.concurrent_users)) 
        content = make_line("")
        content = make_line("# User die z.B. durch Workflow o.Ä. dazukommen, werden intern auf die gekauften aufaddiert")
        content = make_line("# dieser Wert errechnet sich immer aus bestimmten MA-Zahlen")
        content = make_line("# z.B. erhält der Kunde je Workflow-Paket (5 MA) 1/2 inkludierten User dazu")
        content = make_line("# bei 3 Workflow-Paketen (15MA) sind es 2 inkludierte User")
        content = make_line("# bei 2 Workflow-Paketen (10MA) ist es 1 inkludierter User ")
        content = make_line("included_concurrent_users: {0}".format(self.included_concurrent_users)) 
        content = make_line("")
        content = make_line("# Anwenderkorrekturen")
        content = make_line("concurrent_light_users: {0}".format(self.concurrent_light_users)) 
        content = make_line("")
        content = make_line("max_bde_employees: {0}".format(self.max_bde_employees))
        content = make_line("max_pze_employees: {0}".format(self.max_pze_employees)) 
        content = make_line("max_fze_employees: {0}".format(self.max_fze_employees))
        content = make_line("")
        content = make_line("# Limit für Workflow-user gilt als Limit für")
        content = make_line("# Anwenderkorrekturen, wenn die Lizenz kein Workflow hat")
        content = make_line("max_workflow_employees: {0}".format(self.max_workflow_employees))
        content = make_line("")
        content = make_line("max_zut_employees: {0}".format(self.max_zut_employees))   
        content = make_line("max_webterm_employees: {0}".format(self.max_webterm_employees)) 
        content = make_line("max_tasks_employees: {0}".format(self.max_tasks_employees))
        content = make_line("")
        content = make_line("#0: Deaktiviert")
        content = make_line("#1: Fahrten können in der BDE eingeblendet werden")
        content = make_line("#2: Fahrtenzuordnung für BDE")
        content = make_line("#3: BDE-Abgleich")
        content = make_line("bdeFzeMergeMode: {0}".format(self.bde_merge_mode))
        content = make_line("")
        content = make_line("#Partieerfassung")
		if self.party_mode == 1:
			content = make_line("partyMode: true")
		else:
			content = make_line("partyMode: false")
        content = make_line("")
        content = make_line("#Position zur Buchung speichern (Mobil). Voreinstellung ist false.")
		if self.store_booking_geolocation == 1:
			content = make_line("storeBookingGeolocation: true")
		else:
			content = make_line("storeBookingGeolocation: true")
        content = make_line("")
        content = make_line("#Buchungspositionen auf Karte darstellen. Voreinstellung ist false.")
		if self.show_bookings_on_map == 1:
			content = make_line("#showBookingsOnMap: true")
		else:
			content = make_line("#showBookingsOnMap: true")
		for right in rights:
			content = make_line("")
			content = make_line("---")
			content = make_line("#Only one area allowed per right here!!")
			content = make_line("!right")
			content = make_line("id: {0}".format(right.id))
			content = make_line("name: {0}".format(right.right_name))
			if right.mandatory == 1:
				content = make_line("mandatory: true")
			else:
				content = make_line("mandatory: false")
			content = make_line("areas:")
			content = make_line(" - area: {0}".format(right.area))
			if right.grant == 1:
				content = make_line("   grant: true")
			else:
				content = make_line("   grant: true")
			content = make_line("   actions: {0}".format(right.actions))
        return { 'content': content }
    def before_save(self):
        total_amount = 0
        for item in self.invoice_items:
            item.amount = float(item.qty) * float(item.rate * ((100.0 - float(item.discount or 0)) / 100.0))
            total_amount += item.amount
            frappe.msgprint("Amount: {0}, discount: {1}".format(item.amount, item.discount))
        self.total_amount = total_amount
        total_amount_special = 0
        for item in self.special_invoice_items:
            item.amount = float(item.qty) * float(item.rate * ((100.0 - float(item.discount or 0)) / 100.0))
            total_amount_special += item.amount;
        self.total_amount_special = total_amount_special
        self.grand_total = total_amount + total_amount_special
        return
    pass

# adds Windows-compatible line endings (to make the xml look nice)    
def make_line(line):
    return line + "\r\n"
    
# function to create invoices based on licences
@frappe.whitelist()
def enqueue_invoice_cycle():
    # enqueue invoice creation (potential high workload)
    kwargs={
        }
        
    enqueue("finkzeit.finkzeit.doctype.licence.licence.create_invoices",
        queue='long',
        timeout=15000,
        **kwargs)
    return

def create_invoices():
    # create invoices
    enabled_licences = frappe.get_all('Licence', filters={'enabled': 1}, fields=['name'])
    # loop through enabled licences
    for licence in enabled_licences:
        create_invoice(licence['name'])
    return

def process_licence(licence_name):
    licence = frappe.get_doc('Licence', licence_name)
    
    items = []
    if licence.invoice_separately:
        for item in licence.invoice_items:
            items.append(get_item(item))
        create_invoice(licence.customer, items, licence.overall_discount)
        items = []
        for item in licence.special_invoice_items:
            items.append(get_item(item))
        create_invoice(licence.customer, items, licence.overall_discount)
    else:
        for item in licence.invoice_items:
            items.append(get_item(item))
        for item in licence.special_invoice_items:
            items.append(get_item(item))
        create_invoice(licence.customer, items, licence.overall_discount)
    return

# parse to sales invoice item structure    
def get_item(licence_item):
    return {
        'item_code': licence_item.item_code,
        'rate': licence_item.rate,
        'qty': licence_item.qty,
        'discount_precentage': licence_item.discount
    }

def create_invoice(customer, items, overall_discount):
    new_sales_invoice = frappe.get_doc({
        'doctype': 'Sales Invoice',
        'customer': licence.customer,
        'items': items,
        'additional_discount_percentage': overall_discount
    })
    new_record = mew_sales_invoice.insert()
    return new_record.name
