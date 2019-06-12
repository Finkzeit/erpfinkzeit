# -*- coding: utf-8 -*-
# Copyright (c) 2018-2019, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#
# Security note: make sure this is only used in systems running in an intranet environment
#   calendars are not access-protected, simply providing the user name will yield the calendar feed
#
# Call from
#   /api/method/finkzeit.finkzeit.calendar_feed.get_calendar?user=<user_name>&secret=<secret>
#
# Returned is an iCalendar feed (read only)
#

# imports
from __future__ import unicode_literals
import frappe
from frappe import _
from icalendar import Calendar, Event, Todo
from datetime import datetime

@frappe.whitelist(allow_guest=True)
def get_calendar(user, secret):
    frappe.local.response.filename = "calendar.ics"
    calendar = create_calendar_feed(user, secret)
    if calendar:
        frappe.local.response.filecontent = calendar.to_ical()
    else:
        frappe.local.response.filecontent = "No access or error"
    frappe.local.response.type = "download"

def create_calendar_feed(user, secret):
    if True: #try:
        # check access
        enabled = frappe.db.get_value("Calendar Feed Settings", "Calendar Feed Settings", "enabled")
        if float(enabled) == 0:
            return
        erp_secret = frappe.db.get_value("Calendar Feed Settings", "Calendar Feed Settings", "secret")
        if not secret == erp_secret:
            return
        
        # initialise calendar
        cal = Calendar()

        # set properties
        cal.add('prodid', '-//finkzeit//libracore//')
        cal.add('version', '2.0')

        # get data for public events
        show_public_events = frappe.db.get_value("Calendar Feed Settings", "Calendar Feed Settings", "show_public_events")
        if float(show_public_events) == 1:
            sql_query = """SELECT `subject`, `starts_on`, `ends_on`, `modified`, `description`
                 FROM `tabEvent` 
                 WHERE `event_type` = 'Public'"""
            events = frappe.db.sql(sql_query, as_dict=True)
            # add events
            for erp_event in events:
                event = Event()
                event.add('summary', erp_event['subject'])
                event.add('dtstart', erp_event['starts_on'])
                if erp_event['ends_on']:
                    event.add('dtend', erp_event['ends_on'])
                event.add('dtstamp', erp_event['modified'])
                event.add('description', erp_event['description'])
                # add to calendar
                cal.add_component(event)

        # get data for personal events
        sql_query = """SELECT `subject`, `starts_on`, `ends_on`, `modified`, `description` 
             FROM `tabEvent` 
             WHERE `event_type` = 'Private'
               AND (`owner` = '{user}' OR `modified_by` = '{user}')""".format(user=user)
        events = frappe.db.sql(sql_query, as_dict=True)
        # add events
        for erp_event in events:
            event = Event()
            event.add('summary', erp_event['subject'])
            event.add('dtstart', erp_event['starts_on'])
            if erp_event['ends_on']:
                event.add('dtend', erp_event['ends_on'])
            event.add('dtstamp', erp_event['modified'])
            event.add('description', erp_event['description'])
            # add to calendar
            cal.add_component(event)

        # get data for personal todo's
        sql_query = """SELECT 
               IFNULL(`reference_type`, '-') AS `reference_type`, 
               IFNULL(`reference_name`, '-') AS `reference_name`,
               `description`, 
               `modified`, 
               `date` 
             FROM `tabToDo` 
             WHERE `status` = 'Open'
               AND (`owner` = '{user}' OR `modified_by` = '{user}')""".format(user=user)
        todos = frappe.db.sql(sql_query, as_dict=True)
        # add events
        for erp_todo in todos:
            todo = Todo()
            todo.add('summary', "{0} {1}".format(erp_todo['reference_type'], erp_todo['reference_name']))
            todo.add('dtstamp', erp_todo['modified'])
            todo.add('description', erp_todo['description'])
            if erp_todo['date']:
                todo.add('due', erp_todo['date'])
            todo.add('status', 'Open')
            # add to calendar
            cal.add_component(todo)
                        
        # return calendar object
        return cal
    #except Exception as e:
    #    frappe.throw("An error occurred: {0}. Please make sure the calendar settings are set.".format(e))
