# -*- coding: utf-8 -*-
# Copyright (c) 2018-2019, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
from __future__ import unicode_literals
import frappe
from frappe import _
from lxml import etree
from zeep import Client
from time import time
from datetime import datetime
from frappe.utils.background_jobs import enqueue
from finkzeit.finkzeit.doctype.licence.licence import create_invoice
from frappe.utils.password import get_decrypted_password

""" Low-level connect/disconnect """
def connect():
    # read configuration
    config = frappe.get_doc("ZSW", "ZSW")
    pw = get_decrypted_password("ZSW", "ZSW", 'password', False)
    # create client
    client = Client(config.endpoint)
    print("Client created")
    # open session
    session = client.service.openSession('finkzeit')
    print("Session opened")
    # log in
    login_result = client.service.login(session, config.user, pw)
    print("Login: {0}".format(login_result))
    # return session
    return client, session

def disconnect(client, session):
    # log out
    logoutResult = client.service.logout(session)
    # close session
    client.service.closeSession(session)
    return
    
""" abstracted ZSW functions """
def get_employees():
    # connect
    print("Connecting...")
    client, session = connect()
    print("Session: {0}".format(session))
    # read employees
    print("Read employees...")
    employees = client.service.getAllEmployees(session, 0)
    # clean up employees
    employee_dict = {}
    for employee in employees:
        # reformat employees to indexed dict
        employee_dict[employee['personID']] = "{0} {1}".format(employee['firstname'], employee['lastname'])
    print("Employees: {0}".format(employee_dict))
    # close connection
    print("Disconnecting...")
    disconnect(client, session)
    return employee_dict
    
def get_bookings(start_time, end_time):
    # current time as end time
    end_time = int(end_time)
    start_time = int(start_time)
    print("Start {0} (type: {1})".format(start_time, type(start_time)))
    print("End {0} (type: {1})".format(end_time, type(end_time)))
    # timestamp dicts
    fromTS = {'timeInSeconds': start_time}
    toTS = {'timeInSeconds': end_time}
    # connect
    client, session = connect()
    # get bookings
    bookings = client.service.getChangedBDEBookingPairs(session, fromTS, toTS, 0)
    # close connection
    disconnect(client, session)
    # update end_time in ZSW record
    config = frappe.get_doc("ZSW", "ZSW")
    try:
        config.last_sync_sec = end_time
        config.last_sync_date = datetime.fromtimestamp(end_time).strftime('%Y-%m-%d %H:%M:%S')
        config.save()
    except Exception as err:
        frappe.log_error( "Unable to set end time. ({0})".format(err), "ZSW get_booking")
    print("Bookings: {0}".format(bookings))
    if bookings:
        print("Total {0} bookings".format(len(bookings)))
    return bookings

def mark_bookings(bookings):
    # connect to ZSW
    client, session = connect()
    # create or update customer
    client.service.checkBookings(session, bookings, 5)
    # close connection
    disconnect(client, session)
    return
    
def create_update_customer(customer, customer_name, active):
    # create customer (=level) information
    level ={'WSLevel':[{
          'active': active,
          'code': customer,
          'levelID': 1,
          'text': customer_name
        }]
    }
    # connect to ZSW
    client, session = connect()
    # create or update customer
    client.service.createLevels(session, level, True)
    # close connection
    disconnect(client, session)
    return

""" interaction mechanisms """
@frappe.whitelist()
def update_customer(customer, zsw_reference):
    # get customer record
    record = frappe.get_doc("Customer", customer)
    # update values in ZSW
    if not record.disabled and record.is_checked:
        active = True
    else:
        active = False
    create_update_customer(
        customer=zsw_reference, 
        customer_name=record.customer_name, 
        active=active)
    return

@frappe.whitelist()
def enqueue_create_invoices(tenant="AT", to_date=None, kst=None):
    # enqueue invoice creation (potential high workload)
    kwargs={
        'tenant': tenant,
        'to_date': to_date,
        'filter_kst': kst
    }

    enqueue("finkzeit.finkzeit.zsw.create_invoices",
        queue='long',
        timeout=15000,
        **kwargs)
    return

def create_invoices(tenant="AT", to_date=None, filter_kst=None):
    # get start timestamp
    print("Reading config...")
    config = frappe.get_doc("ZSW", "ZSW")
    start_time = config.last_sync_sec
    if start_time == 0:
        # fallback: get last two months
        start_time = int(time()) - 5270400000
    # read employee information
    employees = get_employees()
    print("Got {0} employees.".format(len(employees)))
    # get end time
    if to_date:
        end_time = int((datetime.strptime(to_date, "%Y-%m-%d") - datetime(1970,1,1)).total_seconds())
    else:
        end_time = int(time())
    if end_time < start_time:
        frappe.log_error( "Invalid end time (before last sync)", "ZSW invalid end time" )
        print("Invalid end time (before last sync)")
        return
    # get bookings
    bookings = get_bookings(start_time, end_time)
    collected_bookings = []
    invoice_count = 0
    if bookings:
        print("Got {0} bookings.".format(len(bookings)))
        # collect customers
        customers = []
        for booking in bookings:
            for level in booking['levels']['WSLevelIdentification']:
                if level['levelID'] == 1:
                    customer = level['code']
                    if customer not in customers:
                        customers.append(customer)
        # loop through customers to create invoices
        for customer in customers:
            erp_customer = customer
            if tenant != "AT":
                # crop country digits
                erp_customer = erp_customer[2:]
            else:
                if erp_customer.lower().startswith("ch"):
                    # customer outside tenant range, skip
                    continue
            # create ERP-type customer key
            erp_customer = "K-{0}".format(erp_customer)
            # find customer record
            try:
                customer_record = frappe.get_doc("Customer", erp_customer)
            except:
                # customer not found
                frappe.log_error( "Customer {0} not found in ERPNext.".format(erp_customer), "ZSW customer not found" )
                continue
            if customer_record:
                # prepare customer settings
                kst = customer_record.kostenstelle
                # skip if filter_kst is set and not matching this customer
                if filter_kst and kst != filter_kst:
                    continue
                # find income account
                if "FZCH" in kst:
                    income_account = u"3400 - Dienstleistungsertrag - FZCH"
                    tax_rule = "Schweiz normal (302) - FZCH"
                else:
                    if customer_record.steuerregion == "EU":
                        income_account = u"4250 - Leistungserlöse EU-Ausland (in ZM) - FZAT"
                        tax_rule = "Verkaufssteuern Leistungen EU,DRL (021) - FZAT"
                    elif customer_record.steuerregion == "DRL":
                        income_account = u"4200 - Leistungserlöse Export - FZAT"
                        tax_rule = "Verkaufssteuern Leistungen EU,DRL (021) - FZAT"
                    else:
                        income_account = u"4220 - Leistungserlöse 20 % USt - FZAT"
                        tax_rule = "Verkaufssteuern Inland 20p (022) - FZAT"
                
                # create lists to collect invoice items
                items_remote = []
                items_onsite = []
                do_invoice = False
                # loop through all bookings
                for booking in bookings:
                    use_booking = False
                    try:
                        for level in booking['levels']['WSLevelIdentification']:
                            if level['levelID'] == 1 and level['code'] == customer:
                                use_booking = True
                            if level['levelID'] == 3:
                                service_type = level['code']
                    except Exception as err:
                        print("...no levels... ({0})".format(err))
                    if use_booking:
                        # collect properties
                        item_code = []
                        qty = []
                        customer_contact = None
                        try:
                            for p in booking['property']['WSProperty']:
                                if p['key'] == 2:
                                    customer_contact = p['val']
                                elif p['key'] == 14:
                                    content = p['val']
                                    # "qty level/item_code"
                                    qty.append(float(content.split(" ")[0]))
                                    item_code.append(content.split("/")[1])
                                elif p['key'] == 11:
                                    qty.append(1.0)
                                    if p['val'] == "5/0":
                                        item_code.append("3048")
                                    elif p['val'] == "5/1":
                                        item_code.append("3031")
                                    elif p['val'] == "5/2":
                                        item_code.append("3032")
                                    elif p['val'] == "5/3":
                                        item_code.append("3033")
                                elif p['key'] == 12:
                                    item_code.append("3026")
                                    qty.append((round(float(p['val']) / 60.0) + 0.04, 1)) # in h
                                elif p['key'] == 13:
                                    qty.append(float(p['val']))
                                    if "FZT" in kst:
                                        item_code.append("3008")
                                    else:
                                        item_code.append("3007")
                        except Exception as err:
                            print("...no properties... ({0})".format(err))
                        # add item to list
                        booking_id = booking['fromBookingID']
                        duration = round((float(booking['duration']) / 60.0) + 0.04, 1) # in h
                        description = "{0} {1}<br>{2}".format(
                            booking['from']['timestamp'].split(" ")[0],
                            employees[booking['person']],
                            booking['notice'] or "")
                        if customer_contact:
                            description += "<br>{0}".format(customer_contact)
                        if service_type in ["W", "N"]:
                            # remote, free of charge
                            items_remote.append(get_item(
                                item_code="3014", 
                                description=description,
                                qty=duration,
                                discount=100,
                                kst=kst,
                                income_account=income_account))
                        elif service_type == "J":
                            # remote, normal
                            do_invoice = True
                            items_remote.append(get_item(
                                item_code="3014", 
                                description=description,
                                qty=duration,
                                discount=0,
                                kst=kst,
                                income_account=income_account))
                        elif service_type == "V":
                            # onsite, normal
                            do_invoice = True
                            items_onsite.append(get_item(
                                item_code="3014", 
                                description=description,
                                qty=duration,
                                discount=0,
                                kst=kst,
                                income_account=income_account))
                        # add material items
                        if len(item_code) > 0:
                            for i in range(0, len(item_code)):
                                items_onsite.append(get_short_item(
                                    item_code="3014", 
                                    qty=duration,
                                    kst=kst,
                                    income_account=income_account))
                        # mark as collected 
                        collected_bookings.append(booking_id)        
                # collected all items, create invoices
                if do_invoice and len(items_remote) > 0:
                    create_invoice(
                        customer = customer_record.name, 
                        items = items_remote, 
                        overall_discount = 0, 
                        remarks = "Telefonsupport", 
                        taxes_and_charges = tax_rule, 
                        from_licence = 0, 
                        groups=None, 
                        commission=None,
                        print_descriptions=1,
                        update_stock=1)
                    invoice_count += 1
                if do_invoice and len(items_onsite) > 0:
                    create_invoice(
                        customer = customer_record.name, 
                        items = items_onsite, 
                        overall_discount = 0, 
                        remarks = "Support vor Ort", 
                        taxes_and_charges = tax_rule, 
                        from_licence = 0, 
                        groups=None, 
                        commission=None,
                        print_descriptions=1,
                        update_stock=1)
                    invoice_count += 1
            else:
                err = "Customer not found in ERP: {0}".format(erp_customer)
                print(err)
                frappe.log_error(err, "ZSW customer not found")          
        # finished, mark bookings as invoices
        # mark_bookings(collected_bookings)
        # update last status
        config = frappe.get_doc("ZSW", "ZSW")
        try:
            config.last_status = "{0} {1} invoices created".format(
                datetime.now(), invoice_count)
            config.save()
        except Exception as err:
            frappe.log_error( "Unable to set status. ({0})".format(err), "ZSW create_invoices")
    else:
        print("No bookings found.")
    return

# parse to sales invoice item structure    
def get_item(item_code, description, qty, discount, kst, income_account):
    return {
        'item_code': item_code,
        'description': description,
        'qty': qty,
        'discount_percentage': discount,
        'cost_center': kst,
        'group': 'empty',
        'income_account': income_account
    }

def get_short_item(item_code, qty, kst, income_account):
    return {
        'item_code': item_code,
        'qty': qty,
        'cost_center': kst,
        'group': 'empty',
        'income_account': income_account
    }
    
def set_last_sync(date):
    dt = datetime.strptime(date, "%Y-%m-%d")
    timestamp = (dt - datetime(1970, 1, 1)).total_seconds()
    date_str = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')
    print("Timestamp: {0} / {1}".format(timestamp, date_str))
    # update end_time in ZSW record
    config = frappe.get_doc("ZSW", "ZSW")
    try:
        config.last_sync_sec = timestamp
        config.last_sync_date = date_str
        config.save()
    except Exception as err:
        frappe.log_error( "Unable to set end time. ({0})".format(err), "ZSW set_last_sync")
    return

def test_connect():
    # read configuration
    config = frappe.get_doc("ZSW", "ZSW")
    # create client
    client = Client(config.endpoint)
    print("Client created: {0}".format(config.endpoint))
    # open session
    session = client.service.openSession('finkzeit')
    print("Session opened")
    # log in
    pw = get_decrypted_password("ZSW", "ZSW", 'password', False)
    login_result = client.service.login(session, config.user, pw)
    print("Login: {0}".format(login_result))

    print("Session: {0}".format(session))
    # read employees
    print("Read employees...")
    employees = client.service.getAllEmployees(session, 0)
    # close connection
    print("Disconnecting...")

    # log out
    logoutResult = client.service.logout(session)
    # close session
    client.service.closeSession(session)
    print("Connection closed")
    return

