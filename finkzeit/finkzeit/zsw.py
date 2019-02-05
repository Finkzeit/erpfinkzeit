# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
from __future__ import unicode_literals
import frappe
from frappe import _
from lxml import etree
#from zeep import Plugin
from zeep import Client
import time

""" Low-level connect/disconnect """
def connect():
    # read configuration
    config = frappe.get_doc("ZSW", "ZSW")
    # create client
    client = Client(config.endpoint)
    # open session
    session = client.service.openSession('finkzeit')
    # log in
    loginResult = client.service.login(session, config.user, config.password)
    # return session
    return client, session

def disconnect(client, session):
    # log out
    logoutResult = client.service.logout(session)
    # close session
    client.service.closeSession(session)
    return
    
""" abstracted ZSW functions """
def get_users():
    # connect
    client, session = connect()
    # read employees
    employees = client.service.getAllEmployees(session, 0)
    # close connection
    disconnect(client, session)
    return employees
    
def get_bookings(start_time):
    # current time as end time
    end_time = int(time.time())
    # timestamp dicts
    fromTS = {'timeInSeconds': start_time}
    toTS = {'timeInSeconds': end_time}
    # connect
    client, session = connect()
    # get bookings
    bookings = client.service.getChangedBDEBookingPairs(session, fromTS, toTS, 0)
    # close connection
    disconnect(client, session)
    return bookings
    
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
def update_customer(customer):
    # get customer record
    record = frappe.get_doc("Customer", customer)
    # update values in ZSW
    if not record.disabled and record.is_checked:
        active = True
    else:
        active = False
    create_update_customer(
        customer=record.name, 
        customer_name=record.customer_name, 
        active=active)
    return
