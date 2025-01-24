# -*- coding: utf-8 -*-
# Copyright (c) 2018-2024, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
from __future__ import unicode_literals
import frappe
from frappe import _
from lxml import etree
from zeep import Client, Settings
from time import time
from datetime import datetime, time as dt_time
from frappe.utils.background_jobs import enqueue
from finkzeit.finkzeit.doctype.licence.licence import create_invoice, create_delivery_note
from frappe.utils.password import get_decrypted_password

ENUM_ACTION = {
    'NONE': 0,
    'CREATE': 1,
    'DELETE': 2,
    'UPDATE': 3,
    'REPLACE': 4
}

""" Low-level connect/disconnect """
def getSession():
    global session
    if not 'session' in globals():
        session = None

    if session:
        try:
            session = client.service.refreshSession(session)
            if session:
                print("Session: {0} refreshed".format(session))
                # return a refreshed and authenticated session
                return session
        except:
            print("Old Session expired, creating new one")

    try:
        #create a new session
        session = client.service.openSession(config.license)
        print("Session: {0}  created".format(session))
        pw = get_decrypted_password("ZSW", "ZSW", 'password', False)
        # try to authenticate session
        login_result = client.service.login(session, config.user, pw)
        if login_result != 0:
            client.service.closeSession(session)
            session = None
    except:
        print("Failed creating new session")
        session = None

    # return the resulting session can bei either None or all OK
    return session

try:
    # read configuration
    config = frappe.get_doc("ZSW", "ZSW")
    print("Global config loaded")

    #import logging.config

    #logging.config.dictConfig({
    #    'version': 1,
    #    'formatters': {
    #        'verbose': {
    #            'format': '%(name)s: %(message)s'
    #        }
    #    },
    #    'handlers': {
    #        'console': {
    #            'level': 'DEBUG',
    #            'class': 'logging.StreamHandler',
    #            'formatter': 'verbose',
    #        },
    #    },
    #    'loggers': {
    #        'zeep.transports': {
    #            'level': 'DEBUG',
    #            'propagate': True,
    #            'handlers': ['console'],
    #        },
    #    }
    #})

    #from zeep import Plugin

    #class LoggingPlugin(Plugin):

    #    def ingress(self, envelope, http_headers, operation):
    #        print(etree.tostring(envelope, pretty_print=True))
    #        return envelope, http_headers

    #    def egress(self, envelope, http_headers, operation, binding_options):
    #        print(etree.tostring(envelope, pretty_print=True))
    #        return envelope, http_headers

    # create SOAP client stub
    # with logging plugin
    #client = Client(config.endpoint, plugins=[LoggingPlugin()])
    # without logging plugin
    #client = Client(config.endpoint)
    # with settings
    #settings = Settings(strict=False, xml_huge_tree=True)
    settings = Settings(strict=True, xml_huge_tree=False)
    client = Client(config.endpoint, settings=settings)
    print("Global SOAP client stub initialized")

    # create and initialize session variable to be used later on
    session = None
    print("Global session variable initialized")
except:
    frappe.log_error("Unable to create and initialize global variables", "ZSW global")

def disconnect():
    if session:
        s = getSession()
        client.service.logout(s)
        client.service.closeSession(s)

""" support functions """
def getExtension(list, propName):
    for ext in list:
        if ext["name"] == propName:
            # found it -> early return
            return True, ext
    # got until here - so we didn't find what we were looking for
    return False, None

def createOrUpdateWSExtension(extensions, propKey, value):
  foundExt, ext = getExtension(extensions, propKey)
  if value:
      if foundExt:
          ext["value"] = value
          ext["action"] = ENUM_ACTION['UPDATE']
      else:
          extensions.append({'action': ENUM_ACTION['CREATE'], 'name': propKey, 'value': value })

def createOrUpdateWSExtension_historical(extensions, propKey, value):
  foundExt, ext = getExtension(extensions, propKey)
  new_start = int(datetime.combine(datetime.today(), dt_time.min).timestamp())      # unix time midnight starting today
  if value:
        # in case of an existing entry: terminate
        if foundExt:
            # check if valid from is today (last update today)
            if ext["validFrom"]["timeInSeconds"] >= new_start:
                # already an update today - update value only
                ext["action"] = ENUM_ACTION['UPDATE']
                ext["value"] = value
                return
            else:
                # existing, but old entry - close 
                ext["action"] = ENUM_ACTION['UPDATE']
                ext["validTo"] = {
                    'timeInSeconds': new_start - 1          # set end date to yesterday 1 sec before midight
                }

        # start a new entry
        extensions.append({
            'action': ENUM_ACTION['CREATE'], 
            'name': propKey, 
            'value': value,
            'validFrom': {
                'timeInSeconds': new_start
            }
        })
    else:
        # remove
        # in case of an existing entry: terminate
        if foundExt:
            # existing, but old entry - close 
            ext["action"] = ENUM_ACTION['UPDATE']
            ext["validTo"] = {
                'timeInSeconds': new_start + 1         # set end date today
            }

def createOrUpdateWSExtension_link(extensions, propKey, value, naturalInfo, linkType, remove):
  foundExt, ext = getExtension(extensions, propKey)
  if value and value != "":
    if foundExt:
      itemFound = False
      for item in extensions:
        if (item["name"] == propKey and item["link"]["naturalID"] == value):
          if remove or itemFound:
            item["action"] = 2
          else:
            item["action"] = 3
            item["link"] = { 'action': 1, 'linkType': linkType, 'naturalID': value, 'naturalInfo': naturalInfo }
            itemFound = True
        elif (item["name"] == propKey):
          item["action"] = 3
      if not itemFound and not remove:
        extensions.append({'action': 1,
                           'name': propKey,
                           'link': { 'action': 1, 'linkType': linkType, 'naturalID': value, 'naturalInfo': naturalInfo }})
    else :
      if not remove:
        extensions.append({'action': 1,
                           'name': propKey,
                           'link': { 'action': 1, 'linkType': linkType, 'naturalID': value, 'naturalInfo': naturalInfo }})

""" abstracted ZSW functions """
def get_employees():
    print("Read employees...")
    employees = client.service.getAllEmployees(getSession(), 0)
    # clean up employees
    employee_dict = {}
    for employee in employees:
        # reformat employees to indexed dict
        employee_dict[employee['personID']] = "{0} {1}".format(employee['firstname'], employee['lastname'])
    print("Employees: {0}".format(employee_dict))
    return employee_dict

def get_bookings(start_time, end_time):
    end_time = int(end_time)
    start_time = int(start_time)
    print("Start {0} (type: {1})".format(start_time, type(start_time)))
    print("End {0} (type: {1})".format(end_time, type(end_time)))

    # timestamp dicts
    fromTS = {'timeInSeconds': start_time}
    toTS = {'timeInSeconds': end_time}

    # get bookings
    try:
        bookings = client.service.getBookingPairs(getSession(), fromTS, toTS, False, 1)
    except Exception as err:
        frappe.log_error("Get booking pairs failed with error {0}.".format(err), "ZSW get booking pairs")
        #return here because going further doesn't make sense!
        return []

    # update end_time in ZSW record
    global config
    try:
        config.last_sync_sec = end_time
        config.last_sync_date = datetime.fromtimestamp(end_time).strftime('%Y-%m-%d %H:%M:%S')
        config.save()
        print("Global config updated")
    except Exception as err:
        frappe.log_error( "Unable to set end time. ({0})".format(err), "ZSW get_booking")
        return []

    print("Bookings: {0}".format(bookings))
    if bookings:
        print("Total {0} bookings".format(len(bookings)))
    return bookings

def get_project_bookings(zsw_project, from_time, to_time):
    end_time = int(to_time)
    start_time = int(from_time)
    print("Start {0} (type: {1})".format(start_time, type(start_time)))
    print("End {0} (type: {1})".format(end_time, type(end_time)))

    # timestamp dicts
    fromTS = {'timeInSeconds': start_time}
    toTS = {'timeInSeconds': end_time}

    # get bookings
    try:
        bookings = client.service.getBookingPairsByLevel(getSession(), fromTS, toTS, zsw_project, 4)
    except Exception as err:
        frappe.log_error("Get booking pairs by level failed with error {0}.".format(err), "ZSW get booking pairs by level")
        #return here because going further doesn't make sense!
        return []

    print("Bookings: {0}".format(bookings))
    if bookings:
        print("Total {0} bookings".format(len(bookings)))
    return bookings

def mark_bookings(bookings):
    if type(bookings) is not list:
        bookings = eval(bookings)

    try:
        # use pagination
        per_page = 100
        s = getSession()
        for i in range(0, len(bookings), per_page):
            bookings_paged = {'long': bookings[i:i+per_page]}
            client.service.checkBookings(s, bookings_paged, 5)
    except Exception as err:
        frappe.log_error("Marking bookings {0} failed with error {1}.".format(bookings, err), "ZSW mark bookings")
        return False

    return True

def create_update_customer(customer, customer_name, active, kst=None, tenant="AT", technician=None, short_name=None):
    # collect information
    zsw_reference = get_zsw_reference(customer, tenant)
    adr_ids = frappe.get_all("Dynamic Link",
        filters={'link_doctype': 'Customer', 'link_name': customer, 'parenttype': 'Address'},
        fields=['parent'])
    if adr_ids:
        for adr_id in adr_ids:
            address = frappe.get_doc("Address", adr_id['parent'])
            if address.is_primary_address:
                break
        city = address.city or "-"
        street = address.address_line1 or "-"
        pincode = address.pincode or "-"
    else:
        city = "-"
        street = "-"
        pincode = "-"
    # technician: crop from technician field (email ID without @...)
    customer_record = frappe.get_doc("Customer", customer)
    if technician:
        zsw_technician = get_technician_id(technician)
    else:
        zsw_technician = ""
    # contact
    if customer_record.customer_primary_contact:
        contact = frappe.get_doc("Contact", customer_record.customer_primary_contact)
        email = contact.email_id or "-"
        phone = contact.phone or "-"
    else:
        # no primary contact defined
        con_id = frappe.get_all("Dynamic Link",
            filters={'link_doctype': 'Customer', 'link_name': customer, 'parenttype': 'Contact'},
            fields=['parent'])
        if con_id:
            contact = frappe.get_doc("Contact", con_id[0]['parent'])
            email = contact.email_id or "-"
            phone = contact.phone or "-"
        else:
            email = "-"
            phone = "-"
    # maintenance contract customer?
    #sql_query = """SELECT DISTINCT `tabSales Invoice`.`posting_date`
    #               FROM `tabSales Invoice Item`
    #               LEFT JOIN `tabSales Invoice` ON `tabSales Invoice Item`.`parent` = `tabSales Invoice`.`name`
    #               WHERE
    #                `tabSales Invoice`.`posting_date` >= (DATE_SUB(NOW(), INTERVAL 12 MONTH))
    #                AND `tabSales Invoice Item`.`item_code` IN ("3010")
    #                AND `tabSales Invoice`.`customer` = '{customer}'
    #                AND `tabSales Invoice`.`is_return` = 0
    #               ORDER BY `tabSales Invoice`.`posting_date` DESC;""".format(customer=customer)
    #contract = frappe.db.sql(sql_query, as_dict=True)
    #if len(contract) > 0:
    #    maintenance_contract = True
    #else:
    #    maintenance_contract = False
    # fetch license information
    licence = frappe.get_all("Licence", filters={'customer': customer, 'enabled': 1}, fields=['title', 'retailer'])
    if len(licence) > 0:
        licence_name = licence[0]['title']
        # check if retail customer / commission
        if licence[0]['retailer']:
            active = False          # disable retail customers
    else:
        licence_name = None
    # create link information (for cost center groups)
    link = {
        'naturalID': zsw_reference,
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
    elif "FZO" in kst:
        kst_code = 150
    else:
        kst_code = 13
    s = getSession()
    # create or update customer
    wsTsNow = client.service.getTime(s)
    wsLevelIdentArray = { 'WSLevelIdentification': [{'levelID': get_zsw_level("Customer"), 'code': zsw_reference }] }
    wsLevelEArray = client.service.getLevelsEByIdentification(s, wsLevelIdentArray, wsTsNow)
    #print("Level E: {0}".format(wsLevelEArray))
    # prepare properties
    available_properties = get_all_property_definitions()
    # check if customer exists
    if wsLevelEArray:
        # customer exists --> update
        print("Customer found, update")
        wsLevelEArray[0]["action"] = 3
        if short_name:
            wsLevelEArray[0]["wsLevel"]["text"] = "{0}, {1}".format(short_name, city or "-")
        else:
            wsLevelEArray[0]["wsLevel"]["text"] = "{0}, {1}".format(customer_name, city or "-")
        wsLevelEArray[0]["wsLevel"]["active"] = active
        # make sure extension key exists
        if not wsLevelEArray[0]["extensions"]:
            wsLevelEArray[0]["extensions"] = {'WSExtension': []}
        if not wsLevelEArray[0]["extensions"]["WSExtension"]:
            wsLevelEArray[0]["extensions"]["WSExtension"] = []
        if "p_ortKunde" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray[0]["extensions"]["WSExtension"], "p_ortKunde", city)
        if "p_strasseKunde" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray[0]["extensions"]["WSExtension"], "p_strasseKunde", street)
        if "p_plzKunde" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray[0]["extensions"]["WSExtension"], "p_plzKunde", pincode)
        if "p_mailadresseKunde" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray[0]["extensions"]["WSExtension"], "p_mailadresseKunde", email)
        if "p_telefonnummer" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray[0]["extensions"]["WSExtension"], "p_telefonnummer", phone)
        # if "p_wartungsvertrag" in available_properties:
        #     createOrUpdateWSExtension(wsLevelEArray[0]["extensions"]["WSExtension"], "p_wartungsvertrag", maintenance_contract)
        if "p_projektverantwortlicher" in available_properties:
            createOrUpdateWSExtension_link(wsLevelEArray[0]["extensions"]["WSExtension"], "p_projektverantwortlicher", zsw_technician, 2, 0, False)
        if "p_lizenzname" in available_properties and licence_name:
            createOrUpdateWSExtension(wsLevelEArray[0]["extensions"]["WSExtension"], "p_lizenzname", licence_name)
        # compress level
        contentDict = compress_level_e(wsLevelEArray[0])
        print("{0}".format(contentDict))
        try:
            client.service.updateLevelsE(session, {'WSExtensibleLevel': [contentDict]})
        except Exception as err:
            frappe.log_error("{0} on {1}".format(err, contentDict), "ZSW create_update customer error")
    else:
        print("Customer not found")
        wsLevelEArray = { 'WSExtensibleLevel' : 
          [{
            'action': 1,
            'wsLevel': { 'active': active, 'levelID': get_zsw_level("Customer"), 'code': zsw_reference, 'text': customer_name },
            'extensions': { 'WSExtension': [   ]}
          }]
        }
        if "p_ortKunde" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray['WSExtensibleLevel'][0]['extensions']['WSExtension'], 'p_ortKunde', city)
        if "p_strasseKunde" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray['WSExtensibleLevel'][0]["extensions"]["WSExtension"], "p_strasseKunde", street)
        if "p_plzKunde" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray['WSExtensibleLevel'][0]["extensions"]["WSExtension"], "p_plzKunde", pincode)
        if "p_mailadresseKunde" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray['WSExtensibleLevel'][0]["extensions"]["WSExtension"], "p_mailadresseKunde", email)
        if "p_telefonnummer" in available_properties:
            createOrUpdateWSExtension(wsLevelEArray['WSExtensibleLevel'][0]["extensions"]["WSExtension"], "p_telefonnummer", phone)
        # if "p_wartungsvertrag" in available_properties:
        #     createOrUpdateWSExtension(wsLevelEArray['WSExtensibleLevel'][0]["extensions"]["WSExtension"], "p_wartungsvertrag", maintenance_contract)
        if "p_projektverantwortlicher" in available_properties:
            createOrUpdateWSExtension_link(wsLevelEArray['WSExtensibleLevel'][0]["extensions"]["WSExtension"], "p_projektverantwortlicher", zsw_technician, 2, 0, False)
        client.service.createLevelsE(session, wsLevelEArray)

    # add link (or ignore if it exists already)
    try:
        if kst:
            client.service.quickAddGroupMember(session, kst_code, link)
    except Exception as err:
        frappe.log_error( "Unable to add link ({0})<br>Session: {1}, kst: {2}, link: {3}".format(
            err, session, kst_code, link), "ZSW update customer" )
    # close connection
    disconnect()
    return

def create_update_item(item_code, item_name, active, target):
    if active == 1 or active == "1":
        active = True
    elif active == 0 or active == "0":
        active = False
    # create project (=level) information
    level = {'WSLevel':[{
          'active': active,
          'code': item_code,
          'levelID': get_zsw_level(target),
          'text': item_name
        }]
    }
    # connect to ZSW
    #print("Writing {0}".format(level))
    s = getSession()
    # create or update sales order
    client.service.createLevels(session, level, True)
    # close connection
    disconnect()
    return
    
def create_update_sales_order(sales_order, customer, customer_name, tenant="AT", technician=None, active=True, debug=False):
    # collect city
    so = frappe.get_doc("Sales Order", sales_order)
    try:
        address = frappe.get_doc("Address", so.customer_address)
        city = address.city or "-"
    except:
        city = "-"
    # check active
    if int(active) == 0 or active == "false":
        active = False
    # get technician data (must be from client, as trigger is before save)
    if technician:
        try:
            # update customer record in ERP
            customer_record = frappe.get_doc("Customer", customer)
            customer_record.technik = technician
            customer_record.save()
        except Exception as err:
            frappe.log_error( "Unable to update customer {0}: {1}".format(customer, err), "ZSW create_update_sales_order" )

        zsw_technician = get_technician_id(technician)
    else:
        zsw_technician = ""
    # prepare information
    zsw_project_name = get_zsw_project_name(sales_order, tenant)
    print("ZSW project: {0} (SO: {1}, tenant: {2})".format(zsw_project_name, sales_order, tenant))
    # create project (=level) information
    level = {'WSLevel':[{
          'active': active,
          'code': zsw_project_name,
          'levelID': get_zsw_level("Sales Order"),
          'text': "{0}, {1}".format(customer_name, city)
        }]
    }
    # connect to ZSW
    s = getSession()
    # create or update sales order
    client.service.createLevels(session, level, True)
    # retrieve E-level
    wsTsNow = client.service.getTime(s)
    wsLevelIdentArray = { 'WSLevelIdentification': [{'levelID': get_zsw_level("Customer"), 'code': get_zsw_reference(customer, tenant) }] }
    wsLevelEArray = client.service.getLevelsEByIdentification(s, wsLevelIdentArray, wsTsNow)
    if wsLevelEArray:
        #print("Level E Array: {0}".format(wsLevelEArray[0]) )
        # make sure extension key exists
        if not wsLevelEArray[0]["extensions"]:
            wsLevelEArray[0]["extensions"] = {'WSExtension': []}
        if not wsLevelEArray[0]["extensions"]["WSExtension"]:
            wsLevelEArray[0]["extensions"]["WSExtension"] = []
        if active:
            # create
            createOrUpdateWSExtension_link(wsLevelEArray[0]["extensions"]["WSExtension"], "p_auftrag_projekt", zsw_project_name, 4, 3, False)
        else:
            # delete link
            createOrUpdateWSExtension_link(wsLevelEArray[0]["extensions"]["WSExtension"], "p_auftrag_projekt", zsw_project_name, 4, 3, True)
        if debug:
            print("Project responsible: {0}".format(zsw_technician))
        createOrUpdateWSExtension_link(wsLevelEArray[0]["extensions"]["WSExtension"], "p_projektverantwortlicher", zsw_technician, 2, 0, False)
        contentDict = compress_level_e(wsLevelEArray[0])
        if debug:
            print("Content: {0}".format(contentDict))
        client.service.updateLevelsE(session, {'WSExtensibleLevel': [contentDict]})
    else:
        frappe.log_error( "Trying to link to customer that does not exist: {0} ({1})".format(customer, sales_order), "ZSW create_update_sales_order")
        
    # close connection
    disconnect()
    return

def get_zsw_reference(customer, tenant):
    if tenant.lower() == "ch":
        zsw_reference = "CH{0}".format(customer[2:])
    elif tenant.lower() == "zsw":
        zsw_reference = customer
    else:
        zsw_reference = "{0}".format(customer[2:])
    return zsw_reference

def get_zsw_project_name(sales_order, tenant):
    if tenant.lower() == "ch":
        zsw_project_name = "CH{0}".format(sales_order)
    elif tenant.lower() == "zsw":
        zsw_project_name = sales_order
    else:
        zsw_project_name = "{0}".format(sales_order)
    return zsw_project_name

def compress_level_e(level_e_array):
    #print("Settings: {0}".format(client.settings))
    contentStr = "{0}".format(level_e_array)
    contentDict = eval(contentStr)
    contentDict.pop('genericProperties', None)
    #print("LevelArray: {0}".format(contentDict))
    return contentDict
        
""" interaction mechanisms """
@frappe.whitelist()
def update_customer(customer, customer_name, kst="Main", zsw_reference=None, active=True, tenant="AT", technician=None, short_name=None):
    create_update_customer(
        customer=customer,
        customer_name=customer_name,
        active=active,
        kst=kst,
        tenant=tenant,
        technician=technician,
        short_name=short_name
    )
    return

@frappe.whitelist()
def update_project(sales_order, customer, customer_name, tenant="AT", technician=None, active=True):
    create_update_sales_order(
        sales_order=sales_order,
        customer=customer,
        customer_name=customer_name,
        tenant=tenant,
        technician=technician,
        active=active
    )
    return

@frappe.whitelist()
def update_material(item_code, item_name, active=True):
    create_update_item(
        item_code=item_code,
        item_name=item_name,
        active=active,
        target="Item (Material)"
    )
    return

@frappe.whitelist()
def update_activity(item_code, item_name, active=True):
    create_update_item(
        item_code=item_code,
        item_name=item_name,
        active=active,
        target="Item (Activity)"
    )
    return

"""
  This function will sync all materials to ZSW
"""
def sync_materials():
    materials = frappe.get_all("Item", 
        filters={'sync_as_material_to_zsw': 1}, 
        fields=['item_code', 'item_name', 'disabled'])
    print("Syncing {0} materials...".format(len(materials)))
    for m in materials:
        if m['disabled'] == 0:
            active = True
        else:
            active = False
        update_material(m['item_code'], m['item_name'], active)
    return

"""
  This function will sync all activities to ZSW
"""
def sync_activities():
    activities = frappe.get_all("Item", 
        filters={'sync_as_activity_to_zsw': 1}, 
        fields=['item_code', 'item_name', 'disabled'])
    print("Syncing {0} activities...".format(len(activities)))
    for a in activities:
        if a['disabled'] == 0:
            active = True
        else:
            active = False
        update_activity(a['item_code'], a['item_name'], active)
    return
    
@frappe.whitelist()
def enqueue_create_invoices(tenant="AT", from_date=None, to_date=None, kst_filter=None, service_filter=None, ignore_pricing_rule=1):
    # enqueue invoice creation (potential high workload)
    kwargs={
        'tenant': tenant,
        'from_date': from_date,
        'to_date': to_date,
        'kst_filter': kst_filter,
        'service_filter': service_filter,
        'ignore_pricing_rule': ignore_pricing_rule
    }

    enqueue("finkzeit.finkzeit.zsw.create_invoices",
        queue='long',
        timeout=15000,
        **kwargs)
    return

@frappe.whitelist()
def enqueue_create_generic_invoices(from_date=None, to_date=None, with_time=False):
    # enqueue invoice creation (potential high workload)
    kwargs={
        'from_date': from_date,
        'to_date': to_date,
        'with_time': with_time
    }

    enqueue("finkzeit.finkzeit.zsw.create_generic_invoices",
        queue='long',
        timeout=15000,
        **kwargs)
    return
    
def create_invoices(tenant="AT", from_date=None, to_date=None, kst_filter=None, service_filter=None, ignore_pricing_rule=1):
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
                if level['levelID'] == get_zsw_level("Customer"):
                    customer = level['code']
                    if customer not in customers:
                        customers.append(customer)
                        print("Found customer: ({0})".format(customer))
        # loop through customers to create invoices
        print("Has {0} customers with bookings".format(len(customers)))
        for customer in customers:
            erp_customer = customer
            if tenant.lower() == "zsw":
                erp_customer = erp_customer
            elif tenant.lower() != "at":
                if tenant.lower() == "ch" and erp_customer.lower().startswith("ch"):
                    # crop country digits
                    erp_customer = erp_customer[2:]
                else:
                    # customer outside tenant range, skip
                    print("Skip customer {0} (out of range)".format(customer))
                    continue
            else:
                if erp_customer.lower().startswith("ch"):
                    # customer outside tenant range, skip
                    print("Skip customer {0} (out of range)".format(customer))
                    continue
            # create ERP-type customer key
            if tenant.lower() != "zsw":
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
                    tax_rule = "Schweiz normal (303) - FZCH"
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
                # find special conditions for phone support
                discount = 0
                sql_query = """SELECT `tabPricing Rule`.`discount_percentage` 
                    FROM `tabPricing Rule Item Code`
                    LEFT JOIN `tabPricing Rule` ON `tabPricing Rule`.`name` = `tabPricing Rule Item Code`.`parent`
                    WHERE `tabPricing Rule Item Code`.`item_code` = "{item_code}"
                      AND `tabPricing Rule`.`customer` = "{customer}"
                      AND `tabPricing Rule`.`disable` = 0
                    ORDER BY `tabPricing Rule`.`priority` DESC;""".format(item_code="3014", customer=customer_record.name)
                discount_match = frappe.db.sql(sql_query, as_dict=True)
                if discount_match and len(discount_match) > 0:
                    discount = discount_match[0]['discount_percentage']
                # create lists to collect invoice items
                items_remote = []
                items_onsite = []
                do_invoice_remote = False
                # loop through all bookings
                for booking in bookings:
                    use_booking = False
                    override_duration = False
                    try:
                        for level in booking['levels']['WSLevelIdentification']:
                            if level['levelID'] == get_zsw_level("Customer") and level['code'] == customer:
                                use_booking = True
                            if level['levelID'] == get_zsw_level("Item (Activity)"):
                                # service type, e.g. "T01" (remote), "T03" (onsite), "T02" (project remote), "T04" (project onsite)
                                service_type = level['code']
                            if level['levelID'] == get_zsw_level("Invoicing Type"):
                                # invoicing_type, e.g. "J": invoice, "N"/"W": free of charge, "P": flat rate
                                invoice_type = level['code']
                            if level['levelID'] == get_zsw_level("Sales Order"):
                                # link to project (ZSW) sales order (ERP), e.g. "AB-00001" or "CHAB-00000"
                                sales_order_reference = level['code']
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
                                    item_code.append(_item)
                                    qty.append(float(content.split(" ")[0]))
                                elif p['key'] == 11:
                                    qty.append(1.0)
                                    if p['val'] == "6/0":
                                        item_code.append("3048")
                                    elif p['val'] == "6/1":
                                        item_code.append("3031")
                                    elif p['val'] == "6/2":
                                        item_code.append("3032")
                                    elif p['val'] == "6/3":
                                        item_code.append("3033")
                                    elif p['val'] == "6/4":
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
                        try: # hotfix to catch undefined person as observed in August 2019
                            person = employees[booking['person']]
                        except:
                            person = "-"
                        description = "{0} {1}<br>{2}".format(
                            booking['from']['timestamp'].split(" ")[0],
                            person,
                            booking['notice'] or "")
                        if customer_contact:
                            description += "<br>{0}".format(customer_contact)
                        # check for service type filter
                        if service_filter and service_filter != service_type:
                            print("Dropped {0} ({1}) by not matching service level filter".format(booking_id, service_type))
                            continue
                        if service_type == "T01":
                            if invoice_type in ["W", "N", "A"]:
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
                                    discount=discount,
                                    kst=kst,
                                    income_account=income_account,
                                    warehouse=warehouse))
                        elif service_type == "T03":
                            if invoice_type in ["V", "J"]:
                                # onsite, normal
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
                # invoice T01
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
                        update_stock=1,
                        auto_submit=True,
                        ignore_pricing_rule=ignore_pricing_rule)
                    invoice_count += 1
                # invoice T03
                if len(items_onsite) > 0:
                    create_invoice(
                        customer = customer_record.name,
                        items = items_onsite,
                        overall_discount = 0,
                        remarks = "Dienstleistung vor Ort",
                        taxes_and_charges = tax_rule,
                        from_licence = 0,
                        groups=None,
                        commission=None,
                        print_descriptions=1,
                        update_stock=1,
                        auto_submit=False,
                        ignore_pricing_rule=ignore_pricing_rule,
                        append=True)
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

# this function is used to create sales invoices from bookings
@frappe.whitelist()
def create_generic_invoices(from_date=None, to_date=None, with_time=False):
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
        # swap times
        tmp_time = end_time
        end_time = start_time
        start_time = tmp_time
    # get bookings
    bookings = get_bookings(start_time, end_time)
    collected_bookings = []
    invoice_count = 0
    if bookings:
        print("Got {0} bookings.".format(len(bookings)))
        # collect customers
        customers = []
        for booking in bookings:
            try:
                for level in booking['levels']['WSLevelIdentification']:
                    if level['levelID'] == get_zsw_level("Customer"):
                        customer = level['code']
                        if customer not in customers:
                            customers.append(customer)
                            print("Found customer: ({0})".format(customer))
            except:
                print("No WSLevelIndentification found")
        # loop through customers to create invoices
        print("Has {0} customers with bookings".format(len(customers)))
        for customer in customers:
            # find customer record
            try:
                customer_record = frappe.get_doc("Customer", customer)
            except:
                # customer not found
                frappe.log_error( "Customer {0} not found in ERPNext.".format(customer), "ZSW customer not found" )
                continue
            if customer_record:
                # create lists to collect invoice items
                items = []
                # loop through all bookings
                for booking in bookings:
                    use_booking = False
                    override_duration = False
                    try:
                        for level in booking['levels']['WSLevelIdentification']:
                            if level['levelID'] == get_zsw_level("Customer") and level['code'] == customer:
                                # customer link on level 1
                                use_booking = True
                            if level['levelID'] == get_zsw_level("Item (Activity)"):
                                # activity
                                activity = level['code']
                            if level['levelID'] == get_zsw_level("Invoicing Type"):
                                # invoicing_type, e.g. "J": invoice, "N"/"W": free of charge, "P": flat rate
                                invoice_type = level['code']
                    except Exception as err:
                        #print("...no levels... ({0})".format(err))
                        pass
                    if use_booking:
                        # collect properties
                        item_code = []
                        qty = []
                        customer_contact = None
                        #print("Booking: {0}".format(booking))
                        try:
                            print("Properties: {0}".format(len(booking['properties']['WSProperty'])))
                            #print("Property details: {0}".format(booking['properties']))
                            for p in booking['properties']['WSProperty']:
                                print("Reading properties...")
                                if p['key'] == 2:
                                    customer_contact = p['val']
                                elif p['key'] == 14:
                                    content = p['val']
                                    # "qty level/item_code"
                                    _item = content.split("/")[1]
                                    item_code.append(_item)
                                    qty.append(float(content.split(" ")[0]))
                                elif p['key'] == 15:
                                    override_duration = True
                                    # field is stored as 01:30 (hh:mm)
                                    print("Fetching custom duration...")
                                    duration_fields = "{0}".format(p['val']).split(":")
                                    duration = (float(duration_fields[0])) + (float(duration_fields[1]) / 60)
                                    duration = round(duration, 2)
                                    print("Duration override: {0}".format(duration))
                        except Exception as err:
                            #print("...no properties... ({0})".format(err))
                            pass
                        # add item to list
                        booking_id = booking['fromBookingID']
                        if not override_duration:
                            duration = round((float(booking['duration']) / 60.0) + 0.04, 1) # in h
                        try: # hotfix to catch undefined person as observed in August 2019
                            person = employees[booking['person']]
                        except:
                            person = "-"
                        if with_time:
                            description = "{d} {p} ({hh:02d}:{mm:02d})<br>{n}".format(
                                d=booking['from']['timestamp'].split(" ")[0],
                                p=person,
                                n=booking['notice'] or "",
                                hh=int(booking['from']['hour'] or 0),
                                mm=int(booking['from']['min'] or 0))
                        else:
                            description = "{0} {1}<br>{2}".format(
                                booking['from']['timestamp'].split(" ")[0],
                                person,
                                booking['notice'] or "")
                        if customer_contact:
                            description += "<br>{0}".format(customer_contact)
                        # add item
                        if duration > 0:
                            items.append(get_generic_item(
                                item_code=activity,
                                description=description,
                                qty=duration))

                        # add material items
                        if (len(item_code) > 0) and (len(item_code) == len(qty)):
                            for i in range(0, len(item_code)):
                                items.append(get_generic_item(
                                    item_code=item_code[i],
                                    qty=qty[i]))
                        else:
                            print("No invoicable items ({0}, {1}).".format(item_code, qty))
                        # mark as collected
                        collected_bookings.append(booking_id)
                # collected all items, create invoices
                print("Customer {0} aggregated, {1} items.".format(customer, len(items)))
                # create invoice
                new_sales_invoice = frappe.get_doc({
                    'doctype': 'Sales Invoice',
                    'customer': customer,
                    'items': items
                })
                try:
                    sinv = new_sales_invoice.insert()
                    print("Sales invoice {0} created for {1}.".format(sinv.name, customer))
                    frappe.db.commit()
                except Exception as err:
                    print("Error inserting sales invoice: {0}".format(err))
                    frappe.log_error("Error inserting invoice: {0} (customer {1})".format(err, customer), "ZSW: Error inserting invoice")
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
        except Exception as err:
            frappe.log_error( "Unable to set status. ({0})".format(err), "ZSW create_invoices")
    else:
        print("No bookings found.")
    return

# parse to sales invoice item structure
def get_item(item_code, description, qty, discount, kst, income_account, warehouse, against_sales_order=None, date="2000-01-01"):
    return {
        'item_code': item_code,
        'description': description,
        'qty': qty,
        'discount_percentage': discount,
        'cost_center': kst,
        'group': 'empty',
        'income_account': income_account,
        'warehouse': warehouse,
        'against_sales_order': against_sales_order,
        'date': date
    }

def get_short_item(item_code, qty, kst, income_account, warehouse, against_sales_order=None, date="2000-01-01"):
    return {
        'item_code': item_code,
        'qty': qty,
        'cost_center': kst,
        'group': 'empty',
        'income_account': income_account,
        'warehouse': warehouse,
        'against_sales_order': against_sales_order,
        'date': date
    }

def get_generic_item(item_code, qty, description=None):
    # check if the item exists in the ERP system
    if not frappe.db.exists("Item", item_code):
        # create item
        new_item = frappe.get_doc({
            'doctype': 'Item',
            'item_code': item_code,
            'item_name': item_code,
            'description': item_code,
            'item_group': frappe.utils.nestedset.get_root_of("Item Group")
        })
        try:
            new_item.insert()
        except Exception as err:
            frappe.log_error("Failed to insert item {0}: {1}.".format(item_code, err), 
                "ZSW: failed to insert item")
    if not description:
        description = frappe.get_value("Item", item_code, "description")
        
    return {
        'item_code': item_code,
        'qty': qty,
        'description': description
    }
    
def set_last_sync(date):
    dt = datetime.strptime(date, "%Y-%m-%d")
    timestamp = (dt - datetime(1970, 1, 1)).total_seconds()
    date_str = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')
    print("Timestamp: {0} / {1}".format(timestamp, date_str))
    # update end_time in ZSW record
    global config
    try:
        config.last_sync_sec = timestamp
        config.last_sync_date = date_str
        config.save()
    except Exception as err:
        frappe.log_error( "Unable to set end time. ({0})".format(err), "ZSW set_last_sync")
    return

def add_comment(text, from_time, to_time, kst, service_filter):
    new_comment = frappe.get_doc({
        'doctype': 'Communication',
        'comment_type': "Comment",
        'content': "Created invoices between {from_time} and {to_time} on cost center {kst} and service type {service_filter}: {text}".format(
            from_time=datetime.utcfromtimestamp(from_time).strftime('%Y-%m-%d %H:%M:%S'), 
            to_time=datetime.utcfromtimestamp(to_time).strftime('%Y-%m-%d %H:%M:%S'), 
            kst=kst, service_filter=service_filter, text=text),
        'reference_doctype': "ZSW",
        'status': "Linked",
        'reference_name': "ZSW"
    })
    new_comment.insert()
    return

# integarted test functions for integration tests
def test_connect():
    get_employees()
    disconnect()
    return

def test_customer():
    s = getSession()
    #wsLevelIdentArray = { 'WSLevelIdentification': [{'levelID': 1, 'code': "1234500" }] }
    wsLevelIdentArray = { 'WSLevelIdentification': [{'levelID': get_zsw_level("Customer"), 'code': "21762" }] }
    wsLevelEArray = client.service.getLevelsEByIdentification(session, wsLevelIdentArray, None)
    contentStr = "{0}".format(wsLevelEArray[0])
    contentDict = eval(contentStr)
    contentDict.pop('genericProperties', None)
    print("Level E: {0}".format(contentDict))
    client.service.updateLevelsE(session, {'WSExtensibleLevel': [contentDict]})
    disconnect()

@frappe.whitelist()
def deliver_sales_order(sales_order, tenant="AT"):
    # zsw project name
    zsw_project_name = get_zsw_project_name(sales_order, tenant)
    # get start timestamp
    print("Reading config...")
    config = frappe.get_doc("ZSW", "ZSW")
    employees = get_employees()
    print("Got {0} employees.".format(len(employees)))
    sales_order_object = frappe.get_doc("Sales Order", sales_order)
    customer_record = frappe.get_doc("Customer", sales_order_object.customer)
    start_time = sales_order_object.last_zsw_get_dn_timestamp
    end_time = int(time())

    # get bookings
    bookings = get_project_bookings(zsw_project=zsw_project_name, from_time=start_time, to_time=end_time)
    collected_bookings = []
    if bookings:
        print("Got {0} bookings.".format(len(bookings)))
        items = []
        # get default warehouse
        kst = sales_order_object.kostenstelle
        warehouse = frappe.get_value('Cost Center', kst, 'default_warehouse')
        # find income account
        if "FZCH" in kst:
            income_account = u"3400 - Dienstleistungsertrag - FZCH"
            tax_rule = "Schweiz normal (303) - FZCH"
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
        # loop through all bookings
        for booking in bookings:
            use_booking = False
            override_duration = False
            # collect WS levels
            try:
                for level in booking['levels']['WSLevelIdentification']:
                    if level['levelID'] == get_zsw_level("Customer"):
                        use_booking = True
                        customer_zsw_code = level['code']
                    if level['levelID'] == get_zsw_level("Item (Activity)"):
                        # service type, e.g. "T02" (project remote), "T04" (project onsite)
                        service_type = level['code']
                    if level['levelID'] == get_zsw_level("Invoicing Type"):
                        # invoicing_type, e.g. "J": invoice, "N": free of charge, "P": flat rate
                        invoice_type = level['code']
                    if level['levelID'] == get_zsw_level("Sales Order"):
                        # link to project (ZSW) sales order (ERP), e.g. "AB-00001" or "CHAB-00000"
                        sales_order_reference = level['code']
            except Exception as err:
                print("...no levels... ({0})".format(err))
            if use_booking:
                # collect properties
                item_code = []
                qty = []
                customer_contact = None
                try:
                #if True:
                    try:
                        print("Properties: {0}".format(len(booking['properties']['WSProperty'])))
                    except:
                        print("No properties")
                    for p in booking['properties']['WSProperty']:
                        print("Reading properties...")
                        if p['key'] == 2:
                            customer_contact = p['val']
                        elif p['key'] == 14:
                            content = p['val']
                            # "qty level/item_code"
                            _item = content.split("/")[1]
                            item_code.append(_item)
                            qty.append(float(content.split(" ")[0]))
                            print("Found {0} x {1}".format(float(content.split(" ")[0]), _item))
                        elif p['key'] == 11:
                            qty.append(1.0)
                            if p['val'] == "6/0":
                                item_code.append("3048")
                            elif p['val'] == "6/1":
                                item_code.append("3031")
                            elif p['val'] == "6/2":
                                item_code.append("3032")
                            elif p['val'] == "6/3":
                                item_code.append("3033")
                            elif p['val'] == "6/4":
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
                date = datetime.strptime(booking['from']['timestamp'].split(" ")[0], "%d.%m.%Y")
                if not override_duration:
                    duration = round((float(booking['duration']) / 60.0) + 0.04, 1) # in h
                description = "{0} {1} ({3})<br>{2}".format(
                    booking['from']['timestamp'].split(" ")[0],
                    employees[booking['person']],
                    booking['notice'] or "",
                    service_type)
                if customer_contact:
                    description += "<br>{0}".format(customer_contact)
                if invoice_type in ["W", "N", "P"] and duration > 0:
                    # remote, free of charge
                    items.append(get_item(
                        item_code="3001",
                        description=description,
                        qty=duration,
                        discount=100,
                        kst=kst,
                        income_account=income_account,
                        warehouse=warehouse,
                        against_sales_order=sales_order,
                        date=date))
                elif invoice_type == "J" and duration > 0:
                    # remote, normal
                    do_invoice_remote = True
                    items.append(get_item(
                        item_code="3001",
                        description=description,
                        qty=duration,
                        discount=0,
                        kst=kst,
                        income_account=income_account,
                        warehouse=warehouse,
                        against_sales_order=sales_order,
                        date=date))
                else:
                    print("skipping {0} for qty = 0 or unkown invoice type".format(description[:10]))

                # add material items
                if (len(item_code) > 0) and (len(item_code) == len(qty)):
                    for i in range(0, len(item_code)):
                        items.append(get_item(
                            item_code=item_code[i],
                            description= "{0}".format(booking['from']['timestamp'].split(" ")[0]),
                            qty=qty[i],
                            discount=0,
                            kst=kst,
                            income_account=income_account,
                            warehouse=warehouse,
                            against_sales_order=sales_order,
                            date=date))
                else:
                    print("No invoicable items ({0}, {1}).".format(item_code, qty))
                # mark as collected
                collected_bookings.append(booking_id)
        # collected all items, create invoices
        print("Processed all bookings, found {0} items.".format(len(items)))
        # create delivery note with items sorted by date
        if len(items) > 0:
            new_dn = create_delivery_note(sales_order_object.customer, # customer 
                items=sorted(items, key=lambda val: val['date']),      # items, sorted by date
                overall_discount=0, # overall_discount
                remarks="Projektabrechnung", # remarks
                taxes_and_charges=tax_rule, # taxes_and_charges
                groups=None, 
                auto_submit=False, 
                append=False)

        # finished, mark bookings as invoices
        mark_bookings(collected_bookings)
        # update last status
        sales_order_object.last_zsw_get_dn_timestamp = end_time
        try:
            sales_order_object.save()
        except Exception as err:
            frappe.log_error( "Unable to update sync time. ({0}, {1})".format(sales_order, err), "ZSW create_invoices")
        return {'delivery_note': new_dn}
    else:
        print("No bookings found.")
        return {'delivery_note': None}
        
def maintain_projects(tenant="AT"):
    sql_query = """SELECT `name` FROM `tabSales Order`
                   WHERE `modified` >= (DATE(NOW()) - INTERVAL 3 DAY)
                     AND (
                          `docstatus` = 2
                          OR (`docstatus` = 1 AND `ist_projekt` = 0)
                          OR (`docstatus` = 1 AND `ist_projekt` = 1 AND `projekt_abgeschlossen` = 1) 
                         );"""
    deactivate_sales_orders = frappe.db.sql(sql_query, as_dict=True)
    if deactivate_sales_orders:
        for sales_order in deactivate_sales_orders:
            record = frappe.get_doc("Sales Order", sales_order['name'])
            print("Closing project {0}".format(sales_order['name']))
            update_project(sales_order=sales_order['name'], customer=record.customer, customer_name=record.customer_name, tenant=tenant, active=False)
    return

def debug_bookings(start_date, end_date):
    start_time = int(datetime.strptime(start_date, "%Y-%m-%d").strftime("%s"))
    end_time = int(datetime.strptime(end_date, "%Y-%m-%d").strftime("%s"))
    print("From {0} to {1} ({2} .. {3})".format(start_date, end_date, start_time, end_time))
    print("Reading bookings...")
    bookings = get_bookings(start_time, end_time)
    print("Got {0} bookings. Collecting customers...".format(len(bookings)))
    # collect customers
    customers = []
    for booking in bookings:
        for level in booking['levels']['WSLevelIdentification']:
            if level['levelID'] == get_zsw_level("Customer"):
                customer = level['code']
                if customer not in customers:
                    customers.append(customer)
                    #print("Found customer: ({0})".format(customer))
    print("Has {0} customers with bookings. Checking bookings...".format(len(customers)))
    # loop through all bookings
    for booking in bookings:
        override_duration = False
        try:
            for level in booking['levels']['WSLevelIdentification']:
                if level['levelID'] == get_zsw_level("Customer"):
                    customer = level['code']
                if level['levelID'] == get_zsw_level("Item (Activity)"):
                    # service type, e.g. "T01" (remote), "T03" (onsite), "T02" (project remote), "T04" (project onsite)
                    service_type = level['code']
                if level['levelID'] == get_zsw_level("Invoicing Type"):
                    # invoicing_type, e.g. "J": invoice, "N"/"W": free of charge, "P": flat rate
                    invoice_type = level['code']
                if level['levelID'] == get_zsw_level("Sales Order"):
                    # link to project (ZSW) sales order (ERP), e.g. "AB-00001" or "CHAB-00000"
                    sales_order_reference = level['code']
        except Exception as err:
            print("...no levels... ({0})".format(err))
        # add item to list
        booking_id = booking['fromBookingID']
        duration = round((float(booking['duration']) / 60.0) + 0.04, 1) # in h, ignore override
        person = booking['person']
        timestamp = booking['from']['timestamp']
        print("{booking_id} ({timestamp}): customer {customer}, service type {service_type}, invoice {invoice_type}, duration {duration} h, by {person}".format(
            booking_id=booking_id, customer=customer, service_type=service_type, invoice_type=invoice_type, duration=duration, person=person, 
            timestamp=timestamp))

    return

def get_all_level_definitions():
    level_definitions = client.service.getAllLevelDefinitions(getSession())
    print("{0}".format(level_definitions))        
    return level_definitions

def get_levels_by_level_id(level_id):
    levels = client.service.getLevelsByLevelID(getSession(), level_id)
    print("{0}".format(levels))
    return levels

def get_all_property_definitions():
    property_definitions = client.service.getAllPropertyDefinitions(getSession())
    print("{0}".format(property_definitions))  
    properties = []
    for p in property_definitions:
        properties.append(p['scriptVariable'])      
    return properties

def get_customers():
    customers = get_levels_by_level_id(get_zsw_level("Customer"))
    return customers
    
def get_sales_orders():
    sales_orders = get_levels_by_level_id(get_zsw_level("Sales Order"))
    return sales_orders

def get_activities():
    activities = get_levels_by_level_id(get_zsw_level("Item (Activity)"))
    return activities
    
def get_materials():
    materials = get_levels_by_level_id(get_zsw_level("Item (Material)"))
    return materials

"""
 This function returns the ZSW level for an ERPNext data structure
 Data structures are: "Customer", "Item (Activity)", "Item (Material)", "Sales Order", "Invoicing Type"
"""
def get_zsw_level(erp_structure):
    levels = frappe.db.sql("""SELECT `zsw_level` FROM `tabZSW Field Configuration` WHERE `erp_doctype` = '{erp_structure}' LIMIT 1;""".format(erp_structure=erp_structure), as_dict=True)
    if levels:
        return levels[0]['zsw_level']
    else:
        # revert to default values
        if erp_structure == "Customer":
            return 1
        elif erp_structure == "Item (Activity)":
            return 2
        elif erp_structure == "Item (Material)":
            return 7
        elif erp_structure == "Invoicing Type":
            return 3
        elif erp_structure == "Sales Order":
            return 4
        else:
            return None

""" 
 Returns the ID (ZSW) for the technician
"""
def get_technician_id(technician):
    try:
        user_record = frappe.get_doc("User", technician)
        zsw_technician = user_record.username
    except:
        # fallback to first part of mail
        zsw_technician = technician.split('@')[0]
    return zsw_technician

"""
 Updates a customer level with the included all in time.
"""
@frappe.whitelist()
def update_customer_all_in(licence, calc_rate, tenant="AT"):
    # collect information
    licence_doc = frappe.get_doc("Licence", licence)
    zsw_reference = get_zsw_reference(licence_doc.customer, tenant)
    
    if licence_doc.enable_all_in == 1:
        all_in_ms = int(licence_doc.final_all_in_rate * 3600000 / float(calc_rate))
    else:
        all_in_ms = 0
        
    s = getSession()
    # create or update customer
    wsTsNow = client.service.getTime(s)
    wsLevelIdentArray = { 'WSLevelIdentification': [{'levelID': get_zsw_level("Customer"), 'code': zsw_reference }] }
    wsLevelEArray = client.service.getLevelsEByIdentification(s, wsLevelIdentArray, wsTsNow)
    # prepare properties
    available_properties = get_all_property_definitions()
    # check if customer exists
    if wsLevelEArray:
        # customer exists --> update
        print("Customer found, update")
        wsLevelEArray[0]["action"] = 3
        
        if "p_all_in_std" in available_properties:
            createOrUpdateWSExtension_historical(wsLevelEArray[0]["extensions"]["WSExtension"], "p_all_in_std", all_in_ms)

        # compress level
        contentDict = compress_level_e(wsLevelEArray[0])
        print("{0}".format(contentDict))
        try:
            client.service.updateLevelsE(s, {'WSExtensibleLevel': [contentDict]})
        except Exception as err:
            frappe.log_error("{0} on {1}".format(err, contentDict), "ZSW update_customer_all_in customer error")
    else:
        print("Customer not found")

    # close connection
    disconnect()
    return
