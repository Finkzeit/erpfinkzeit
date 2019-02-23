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
    session = client.service.openSession(config.license)
    print("Session {0} opened".format(config.license))
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
    bookings = client.service.getBookingPairs(session, fromTS, toTS, False, 1)
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
    bookings = {'long': bookings}
    client.service.checkBookings(session, bookings, 5)
    # close connection
    disconnect(client, session)
    return
    
def create_update_customer(customer, customer_name, active, kst="FZV"):
    # create customer (=level) information
    level = {'WSLevel':[{
          'active': active,
          'code': customer,
          'levelID': 1,
          'text': customer_name
        }]
    }
    # create link information (for cost center groups)
    link = {
        'naturalID': customer,
        'naturalInfo': 1,
        'linkType': 3,
        'action': 4
      }
    # map cost center
    if "FZW" in kst:
        kst_code = 86
    elif "FZT" in kst:
        kst_code = 87
    elif "FZCH" in kst:
        kst_code = 114
    else:
        kst_code = 13
    # connect to ZSW
    client, session = connect()
    # create or update customer
    client.service.createLevels(session, level, True)
    # add link (or ignore if it exists already)
    try:
        client.service.quickAddGroupMember(session, kst_code, link)
    except Exception as err:
        frappe.log_error( "Unable to add link ({0})<br>Session: {1}, kst: {2}, link: {3}".format(
            err, session, kst_code, link), "ZSW update customer" )
    # close connection
    disconnect(client, session)
    return

""" interaction mechanisms """
@frappe.whitelist()
def update_customer(customer_name, kst, zsw_reference, active=True):
    create_update_customer(
        customer=zsw_reference, 
        customer_name=customer_name, 
        active=active,
        kst=kst
    )
    return

@frappe.whitelist()
def enqueue_create_invoices(tenant="AT", from_date=None, to_date=None, kst_filter=None, service_filter=None):
    # enqueue invoice creation (potential high workload)
    kwargs={
        'tenant': tenant,
        'from_date': from_date,
        'to_date': to_date,
        'kst_filter': kst_filter,
        'service_filter': service_filter
    }

    enqueue("finkzeit.finkzeit.zsw.create_invoices",
        queue='long',
        timeout=15000,
        **kwargs)
    return

def create_invoices(tenant="AT", from_date=None, to_date=None, kst_filter=None, service_filter=None):
    # get start timestamp
    print("Reading config...")
    config = frappe.get_doc("ZSW", "ZSW")
    employees = get_employees()
    print("Got {0} employees.".format(len(employees)))
    # get start time (at 0:00:00)
    if from_date:
        start_time = int((datetime.strptime(from_date, "%Y-%m-%d") - datetime(1970,1,1)).total_seconds())
    else:
        start_time = int(time())
    # get end time (at 23:59:59)
    if to_date:
        end_time = int((datetime.strptime(to_date, "%Y-%m-%d") - datetime(1970,1,1)).total_seconds())
    else:
        end_time = int(time())
    # shift times to find bookings (all booking pairs ar found on 0:00:00 on getBookingPairs
    start_time -= (2 * 60 * 60)
    end_time += (20 * 60 * 60)
    if end_time < start_time:
        frappe.log_error( "Invalid end time (before start time)", "ZSW invalid end time" )
        print("Invalid end time (before start time)")
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
                        print("Found customer: ({0})".format(customer))
        # loop through customers to create invoices
        print("Has {0} customers with bookings".format(len(customers)))
        for customer in customers:
            erp_customer = customer
            if tenant.lower() != "at":
                # crop country digits
                erp_customer = erp_customer[2:]
            else:
                if erp_customer.lower().startswith("ch"):
                    # customer outside tenant range, skip
                    print("Skip customer {0} (out of range)".format(customer))
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
                if kst_filter and kst != kst_filter:
                    print("Customer {0} dropped by KST filter".format(customer))
                    continue
                # get default warehouse
                warehouse = frappe.get_value('Cost Center', kst, 'default_warehouse')
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
                do_invoice_remote = False
                do_invoice_onsite = False
                # loop through all bookings
                for booking in bookings:
                    use_booking = False
                    override_duration = False
                    try:
                        for level in booking['levels']['WSLevelIdentification']:
                            if level['levelID'] == 1 and level['code'] == customer:
                                use_booking = True
                            if level['levelID'] == 2:
                                # sevrice type, e.g. "T01" (remote), "T03" (onsite), "AB-#####" (project)
                                service_type = level['code']
                            if level['levelID'] == 3:
                                # invoicing_type, e.g. "J": invoice, "N"/"W": free of charge
                                invoice_type = level['code']
                    except Exception as err:
                        print("...no levels... ({0})".format(err))
                    if use_booking:
                        # collect properties
                        item_code = []
                        qty = []
                        customer_contact = None
                        #print("Booking: {0}".format(booking))
                        try:
                        #if True:
                            try:
                                print("Properties: {0}".format(len(booking['properties']['WSProperty'])))
                            except:
                                print("No properties")
                            #print("Property details: {0}".format(booking['properties']))
                            for p in booking['properties']['WSProperty']:
                                print("Reading properties...")
                                if p['key'] == 2:
                                    customer_contact = p['val']
                                elif p['key'] == 14:
                                    content = p['val']
                                    # "qty level/item_code"
                                    _item = content.split("/")[1]
                                    if _item != "0001":
                                        item_code.append(_item)
                                        qty.append(float(content.split(" ")[0]))
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
                                    elif p['val'] == "5/4":
                                        item_code.append("3036")
                                elif p['key'] == 12:
                                    item_code.append("3026")
                                    qty.append((round(float(p['val']) / 60.0) + 0.04, 1)) # in h
                                elif p['key'] == 13:
                                    qty.append(float(p['val']))
                                    if "FZT" in kst:
                                        item_code.append("3008")
                                    else:
                                        item_code.append("3007")
                                elif p['key'] == 15:
                                    override_duration = True
                                    # field is stored as 01:30 (hh:mm)
                                    print("Fetching custom duration...")
                                    duration_fields = "{0}".format(p['val']).split(":")
                                    duration = (float(duration_fields[0])) + (float(duration_fields[1]) / 60)
                                    duration = round(duration, 2)
                                    print("Duration override: {0}".format(duration))
                        except Exception as err:
                            print("...no properties... ({0})".format(err))
                        # add item to list
                        booking_id = booking['fromBookingID']
                        if not override_duration:
                            duration = round((float(booking['duration']) / 60.0) + 0.04, 1) # in h
                        description = "{0} {1}<br>{2}".format(
                            booking['from']['timestamp'].split(" ")[0],
                            employees[booking['person']],
                            booking['notice'] or "")
                        if customer_contact:
                            description += "<br>{0}".format(customer_contact)
                        # check for service type filter
                        if service_filter and service_filter != service_type:
                            print("Dropped {0} ({1}) by not matching service level filter".format(booking_id, service_type))
                            continue
                        if service_type == "T01":
                            if invoice_type in ["W", "N"]:
                                # remote, free of charge
                                items_remote.append(get_item(
                                    item_code="3014",
                                    description=description,
                                    qty=duration,
                                    discount=100,
                                    kst=kst,
                                    income_account=income_account,
                                    warehouse=warehouse))
                            elif invoice_type == "J":
                                # remote, normal
                                do_invoice_remote = True
                                items_remote.append(get_item(
                                    item_code="3014",
                                    description=description,
                                    qty=duration,
                                    discount=0,
                                    kst=kst,
                                    income_account=income_account,
                                    warehouse=warehouse))
                        elif service_type == "T03":
                            if invoice_type in ["V", "J"]:
                                # onsite, normal
                                do_invoice_onsite = True
                                items_onsite.append(get_item(
                                    item_code="3001",
                                    description=description,
                                    qty=duration,
                                    discount=0,
                                    kst=kst,
                                    income_account=income_account,
                                    warehouse=warehouse))
                            elif invoice_type == "N":
                                # onsite, free of charge
                                items_onsite.append(get_item(
                                    item_code="3001",
                                    description=description,
                                    qty=duration,
                                    discount=100,
                                    kst=kst,
                                    income_account=income_account,
                                    warehouse=warehouse))

                        # add material items
                        if (len(item_code) > 0) and (len(item_code) == len(qty)):
                            for i in range(0, len(item_code)):
                                items_onsite.append(get_short_item(
                                    item_code=item_code[i],
                                    qty=qty[i],
                                    kst=kst,
                                    income_account=income_account,
                                    warehouse=warehouse))
                        else:
                            print("No invoicable items ({0}, {1}).".format(item_code, qty))
                        # mark as collected
                        collected_bookings.append(booking_id)
                # collected all items, create invoices
                print("Customer {0} aggregated, {1} items remote, {2} items onsite.".format(customer, len(items_remote), len(items_onsite)))
                if do_invoice_remote and len(items_remote) > 0:
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
                if do_invoice_onsite and len(items_onsite) > 0:
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
        mark_bookings(collected_bookings)
        # update last status
        config = frappe.get_doc("ZSW", "ZSW")
        try:
            config.last_status = "{0} {1} invoices created".format(
                datetime.now(), invoice_count)
            config.save()
            add_comment(text="{0} invoices created".format(invoice_count), from_time=start_time, to_time=end_time, kst=kst_filter, service_filter=service_filter)
        except Exception as err:
            frappe.log_error( "Unable to set status. ({0})".format(err), "ZSW create_invoices")
    else:
        print("No bookings found.")
    return

# parse to sales invoice item structure    
def get_item(item_code, description, qty, discount, kst, income_account, warehouse):
    return {
        'item_code': item_code,
        'description': description,
        'qty': qty,
        'discount_percentage': discount,
        'cost_center': kst,
        'group': 'empty',
        'income_account': income_account,
        'warehouse': warehouse
    }

def get_short_item(item_code, qty, kst, income_account, warehouse):
    return {
        'item_code': item_code,
        'qty': qty,
        'cost_center': kst,
        'group': 'empty',
        'income_account': income_account,
        'warehouse': warehouse
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

def add_comment(text, from_time, to_time, kst, service_filter):
    new_comment = frappe.get_doc({
        'doctype': 'Communication',
        'comment_type': "Comment",
        'content': "Created invoices between {from_time} and {to_time} on cost center {kst} and service type {service_filter}: {text}".format(
            from_time=from_time, to_time=to_time, kst=kst, service_filter=service_filter, text=text),
        'reference_doctype': "ZSW",
        'status': "Linked",
        'reference_name': "ZSW"
    })
    new_comment.insert()
    return
