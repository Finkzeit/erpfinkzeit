# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#
# Debug async "create_invoices" using "bench execute finkzeit.finkzeit.doctype.licence.licence.create_invoices"

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe.utils.background_jobs import enqueue
from datetime import datetime
from frappe import _
from PyPDF2 import PdfFileWriter
import os

class Licence(Document):
    def generate_licence_file(self):
        # create yaml header
        content = make_line("!licenseConf")
        content += make_line("id: {0} # Lizenz ID (kunde_ort) für Start URL http://zsw.finkzeit.at/leerlic".format(self.customer))
        content += make_line("description: {0}".format(self.customer_name))
        valid = datetime.strptime(self.valid_until, "%Y-%m-%d")
        content += make_line("valid_until: {day}.{month}.{year}".format(day=valid.day, month=valid.month, year=valid.year) ) 
        now = datetime.now()
        content += make_line("creationDate: {day}.{month}.{year}".format(day=now.day, month=now.month, year=now.year) ) 
        content += make_line("runtime: at.finkzeit.zsw.server.runtime.StandardRuntime")
        if self.retailer:
            content += make_line("retailer: {0}".format(self.retailer_key))
            content += make_line("retailer_code: {0}".format(self.retailer))
        content += make_line("")
        content += make_line("# Benutzerlimit (gekaufte User)")
        content += make_line("concurrent_users: {0}".format(self.concurrent_users))
        content += make_line("concurrent_ws_sessions: {0}".format(self.concurrent_ws_sessions)) 
        content += make_line("")
        content += make_line("# User die z.B. durch Workflow o.Ä. dazukommen, werden intern auf die gekauften aufaddiert")
        content += make_line("# dieser Wert errechnet sich immer aus bestimmten MA-Zahlen")
        content += make_line("# z.B. erhält der Kunde je Workflow-Paket (5 MA) 1/2 inkludierten User dazu")
        content += make_line("# bei 3 Workflow-Paketen (15MA) sind es 2 inkludierte User")
        content += make_line("# bei 2 Workflow-Paketen (10MA) ist es 1 inkludierter User ")
        content += make_line("included_concurrent_users: {0}".format(self.included_concurrent_users)) 
        content += make_line("")
        content += make_line("# Anwenderkorrekturen")
        content += make_line("concurrent_light_users: {0}".format(self.concurrent_light_users)) 
        content += make_line("")
        content += make_line("max_bde_employees: {0}".format(self.max_bde_employees))
        content += make_line("max_pze_employees: {0}".format(self.max_pze_employees)) 
        content += make_line("max_fze_employees: {0}".format(self.max_fze_employees))
        content += make_line("")
        content += make_line("# Limit für Workflow-user gilt als Limit für")
        content += make_line("# Anwenderkorrekturen, wenn die Lizenz kein Workflow hat")
        content += make_line("max_workflow_employees: {0}".format(self.max_workflow_employees))
        content += make_line("")
        content += make_line("max_zut_employees: {0}".format(self.max_zut_employees))   
        content += make_line("max_webterm_employees: {0}".format(self.max_webterm_employees)) 
        content += make_line("max_tasks_employees: {0}".format(self.max_tasks_employees))
        content += make_line("")
        content += make_line("#0: Deaktiviert")
        content += make_line("#1: Fahrten können in der BDE eingeblendet werden")
        content += make_line("#2: Fahrtenzuordnung für BDE")
        content += make_line("#3: BDE-Abgleich")
        content += make_line("bdeFzeMergeMode: {0}".format(self.bde_merge_mode[0]))
        content += make_line("")
        content += make_line("#Partieerfassung")
        if self.party_mode == 1:
            content += make_line("partyMode: true")
        else:
            content += make_line("partyMode: false")
        content += make_line("")
        content += make_line("#Position zur Buchung speichern (Mobil). Voreinstellung ist false.")
        if self.store_booking_geolocation == 1:
            content += make_line("storeBookingGeolocation: true")
        else:
            content += make_line("storeBookingGeolocation: false")
        content += make_line("")
        content += make_line("#Buchungspositionen auf Karte darstellen. Voreinstellung ist false.")
        if self.show_bookings_on_map == 1:
            content += make_line("showBookingsOnMap: true")
        else:
            content += make_line("showBookingsOnMap: false")
        content += make_line("")
        content += make_line("max_sms: {0}".format(self.max_sms))
        content += make_line("max_sms_international: {0}".format(self.max_sms_international))
        content += make_line("max_phone_calls: {0}".format(self.max_phone_calls))
        content += make_line("max_phone_calls_international: {0}".format(self.max_phone_calls_international))
        for right in self.rights:
            content += make_line("")
            content += make_line("---")
            content += make_line("#Only one area allowed per right here!!")
            content += make_line("!right")
            content += make_line("id: {0}".format(right.id))
            content += make_line("name: {0}".format(right.right_name))
            if right.mandatory == 1:
                content += make_line("mandatory: true")
            else:
                content += make_line("mandatory: false")
            content += make_line("areas:")
            content += make_line(" - area: {0}".format(right.area))
            if right.grant == 1:
                content += make_line("   grant: true")
            else:
                content += make_line("   grant: true")
            content += make_line("   actions: {0}".format(right.actions))
            if right.has_restrictions == 1:
                content += make_line("   restrictions:")
                content += make_line("   - restriction: {0}".format(right.restriction or ""))
                content += make_line("     operator: {0}".format(right.restriction_operator or ""))
                content += make_line("     value: {0}".format(right.restriction_value or ""))    
        return { 'content': content }
        
    def before_save(self):
        total_amount = 0.0
        for item in self.invoice_items:
            item.amount = float(item.qty) * float(item.rate * ((100.0 - float(item.discount or 0)) / 100.0))
            total_amount += item.amount
            if not item.group:
                item.group = "empty"
        self.total_amount = total_amount
        self.total_amount_with_discount = total_amount * ((100.0 - float(self.overall_discount or 0)) / 100.0)
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
    sql_query = ("""SELECT `name` 
        FROM `tabLicence` 
        WHERE `enabled` = 1 
          AND `start_date` <= CURDATE();""")
    enabled_licences = frappe.db.sql(sql_query, as_dict=True)
    sinv_items = []
    bind_source = None
    # loop through enabled licences
    for licence in enabled_licences:
        new_sinvs = process_licence(licence['name'])
        if new_sinvs:
            # loop through all processed sales invoices
            for sinv in new_sinvs:
                # get sales invoice record
                sinv_record = frappe.get_doc("Sales Invoice", sinv)
                if sinv_record:
                    # attach to log list
                    sinv_items.append({'sales_invoice': sinv, 'type': sinv_record.rechnungszustellung})
                
    # create sinv_items log entry
    now = datetime.now()
    log = frappe.get_doc({
        'doctype': 'Invoice Cycle Log',
        'date': now.strftime("%Y-%m-%d"),
        'sales_invoices': sinv_items,
        'title': now.strftime("%Y-%m-%d"),
        'bind_source': bind_source
    })
    log.insert(ignore_permissions=True)
    return

@frappe.whitelist()
def process_licence(licence_name):
    licence = frappe.get_doc('Licence', licence_name)
    print("Processing licence {0}".format(licence.name))
    # check if licence is due according to invoices_per_year
    current_month = datetime.now().month
    period = ""
    multiplier = 1
    if licence.invoices_per_year == 12:
        period = month_in_words(current_month)
        multiplier = 1
    elif licence.invoices_per_year == 6:
        if current_month in (1, 3, 5, 7, 9, 11):
            period = "{0} - {1}".format(month_in_words(current_month), month_in_words(current_month + 1))
            multiplier = 2
        else:
            return None
    elif licence.invoices_per_year == 4:
        if current_month in (1, 4, 7, 10):
            period = "{0} - {1}".format(month_in_words(current_month), month_in_words(current_month + 2))
            multiplier = 3
        else:
            return None
    elif licence.invoices_per_year == 2:
        if current_month in (1, 7):
            period = "{0} - {1}".format(month_in_words(current_month), month_in_words(current_month + 5))
            multiplier = 6
        else:
            return None
    elif licence.invoices_per_year == 1:
        if current_month == 1:
            period = "{0} - {1}".format(month_in_words(current_month), month_in_words(current_month + 11))
            multiplier = 12
        else:
            return None
            
    # prepare arrays
    sinv = []
    items = []
    customer = licence.customer
    remarks = licence.remarks or "<p></p>"
    # add invoice period to remarks
    remarks = _("<p>Abrechnungsperiode: {period} {year}</p>").format(period=period, year=datetime.now().year) + remarks
    if licence.retailer:
        # this is a retailer licence: invoice to retailer
        customer = licence.retailer
        remarks = _("<p><b>Lizenz {0}</b><br></p>").format(licence.customer_name) + remarks
    customer_record = frappe.get_doc("Customer", customer)
    kst = customer_record.kostenstelle
    # find income account
    if customer_record.steuerregion == "EU":
        income_account = u"4250 - Leistungserlöse EU-Ausland (in ZM) - FZAT"
    elif customer_record.steuerregion == "DRL":
        income_account = u"4200 - Leistungserlöse Export - FZAT"
    else:
        income_account = u"4220 - Leistungserlöse 20 % USt - FZAT"
    # find groups
    groups = []
    for item in licence.invoice_items:
        if item.group not in groups:
            groups.append(item.group)
    if licence.invoice_separately:
        # loop through groups and create invoices
        for group in groups:
            items = []
            for item in licence.invoice_items:
                if item.group == group:
                    items.append(get_item(item, multiplier, kst, income_account))
            if len(items) > 0:
                new_invoice = create_invoice(customer, items, licence.overall_discount, remarks, licence.taxes_and_charges, from_licence=licence.name, groups=[group], commission=licence.customer)
                if new_invoice:
                    sinv.append(new_invoice)
            items = []
    else:
        for item in licence.invoice_items:
            items.append(get_item(item, multiplier, kst, income_account))
        if items:
            new_invoice = create_invoice(customer, items, licence.overall_discount, remarks, licence.taxes_and_charges, from_licence=licence.name, groups=groups, commission=licence.customer)
            if new_invoice:
                sinv.append(new_invoice)

    return sinv

def month_in_words(month):
    # translation does not work (started from de user)
    switcher = {
        1: _("Jänner"),
        2: _("Februar"),
        3: _("März"),
        4: _("April"),
        5: _("Mai"),
        6: _("Juni"),
        7: _("Juli"),
        8: _("August"),
        9: _("September"),
        10: _("Oktober"),
        11: _("November"),
        12: _("Dezember")
    }
    return switcher.get(month, _("Invalid month"))
    
# parse to sales invoice item structure    
def get_item(licence_item, multiplier, kst, income_account):
    return {
        'item_code': licence_item.item_code,
        'rate': (float(licence_item.rate) * ((100.0 - float(licence_item.discount or 0)) / 100.0)),
        'qty': licence_item.qty * multiplier,
        'discount_percentage': licence_item.discount,
        'cost_center': kst,
        'group': licence_item.group,
        'income_account': income_account
    }

# from_invoice: 1=normal, 2=special
def create_invoice(customer, items, overall_discount, remarks, taxes_and_charges, from_licence=1, groups=None, commission=None):
    # get values from customer record
    customer_record = frappe.get_doc("Customer", customer)
    delivery_option = "Post"
    try:
        delivery_option = customer_record.rechnungszustellung
    except:
        pass
    # prepare taxes and charges
    taxes_and_charges_template = frappe.get_doc("Sales Taxes and Charges Template", taxes_and_charges)
    # define group child table
    group_items = []
    if groups:
        for group in groups:
            group_sum = 0
            for item in items:
                if item['group'] == group:
                    group_sum += float(item['qty']) * float(item['rate'])
            group_items.append({
                'group': group,
                'title': group,
                'sum_caption': group,
                'amount': group_sum
            })
    new_sales_invoice = frappe.get_doc({
        'doctype': 'Sales Invoice',
        'customer': customer,
        'items': items,
        'additional_discount_percentage': overall_discount,
        'eingangstext': remarks,
        'from_licence': from_licence,
        'taxes_and_charges': taxes_and_charges,
        'taxes': taxes_and_charges_template.taxes,
        'rechnungszustellung': delivery_option,
        'tax_id': customer_record.tax_id,
        'kostenstelle': customer_record.kostenstelle,
        'groups': group_items,
        'enable_lsv': customer_record.enable_lsv,
        'ignore_pricing_rule': 1,
        'kommission': commission
    })
    # robust insert sales invoice
    # FEBRUARY TRANSITION: HC to one, remove after
    from_licence = 1

    try:
        new_record = new_sales_invoice.insert()
        # check auto-submit
        sql_query = ("""SELECT `name`, `grand_total`
                FROM `tabSales Invoice`
                WHERE `customer` = '{customer}'
                  AND `docstatus` = 1
                  AND `from_licence` = {from_licence}
                ORDER BY `posting_date` DESC
                LIMIT 1;""".format(customer=customer, from_licence=from_licence))
        last_invoice = frappe.db.sql(sql_query, as_dict=True)
        if last_invoice:
            if last_invoice[0]['grand_total'] == new_record.grand_total:
                # last invoice has the same total, submit
                new_record.submit()
        frappe.db.commit()
        return new_record.name

    except Exception as err:
        frappe.log_error( _("Error inserting sales invoice from customer {0}: {1}").format(
            customer, err.message) )
        return None
