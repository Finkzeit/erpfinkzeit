# -*- coding: utf-8 -*-
# Copyright (c) 2018-2025, libracore (https://www.libracore.com) and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe import _
from datetime import datetime, timedelta
import time
from erpnextswiss.erpnextswiss.common_functions import get_building_number, get_street_name, get_pincode, get_city, get_primary_address, split_address_to_street_and_building
import html          # used to escape xml content
from frappe.utils import cint, get_url_to_form, rounded
from unidecode import unidecode     # used to remove German/French-type special characters from bank identifieres
from erpnextswiss.scripts.crm_tools import get_primary_customer_address

XML_SCHEMA_FILES = {
    'CH': {
        '03':     "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.03.xsd",
        '05':     "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.05.xsd",
        '03CH02': "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.03.ch.02.xsd",
        '09':     "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.09.xsd",
        '09CH03': "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.09.ch.03.xsd"
    },
    'AT': {
        '03':     "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.03.xsd",
        '05':     "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.05.xsd",
        '03CH02': "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.03.ch.02.xsd",
        '09':     "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.09.xsd",
        '09CH03': "apps/erpnextswiss/erpnextswiss/public/xsd/pain.001.001.09.ch.03.xsd"
    }
}

class PaymentReturnProposal(Document):
    def validate(self):
        # check company settigs
        company_address = get_primary_address(target_name=self.company, target_type="Company")
        if (not company_address
            or not company_address.address_line1
            or not company_address.pincode
            or not company_address.city):
                frappe.throw( _("Company address missing or incomplete.") )
        if self.pay_from_account:
            payment_account = frappe.get_doc('Account', self.pay_from_account)
            if not payment_account.iban:
                frappe.throw( _("IBAN missing in pay from account.") )
        return
        
    def on_submit(self):
        if (len(self.payment_entries)) == 0:
            frappe.throw( _("No transactions found. You can remove this entry.") )
        # clean payments (to prevent accumulation on re-submit)
        self.payments = []
        # collect payments
        total = 0
        for payment_entry in self.payment_entries:
            # add new payment record
            if payment_entry.skonto_amount > 0:
                cust = frappe.get_doc("Customer", payment_entry.customer)
                addr = get_primary_customer_address(payment_entry.customer)
                self.add_payment(
                    receiver_name=cust.customer_name, 
                    iban=payment_entry.iban, 
                    payment_type=payment_entry.payment_type,
                    address_line1=addr.address_line1, 
                    address_line2="{0} {1}".format(addr.pincode, addr.city), 
                    country=addr.country, 
                    pincode=addr.pincode, 
                    city=addr.city,
                    amount=payment_entry.skonto_amount, 
                    currency=payment_entry.currency, 
                    reference=payment_entry.payment_entry, 
                    execution_date=payment_entry.skonto_date, 
                    bic=None, 
                    receiver_id=payment_entry.customer
                )
                total += payment_entry.skonto_amount
        # update total
        self.total = total
        # save
        self.save()

        return
    
    def add_payment(self, receiver_name, iban, payment_type, address_line1, 
        address_line2, country, pincode, city, amount, currency, reference, execution_date, 
        esr_reference=None, esr_participation_number=None, bic=None, is_salary=0,
        receiver_id=None):
            # prepare payment date
            if isinstance(execution_date,datetime):
                pay_date = execution_date
            else:
                pay_date = datetime.strptime(execution_date, "%Y-%m-%d")
            # assure that payment date is not in th past
            if pay_date.date() < datetime.now().date():
                pay_date = datetime.now().date()
            # append payment record
            new_payment = self.append('payments', {
                'receiver': receiver_name,
                'receiver_id': receiver_id,
                'iban': iban,
                'bic': bic,
                'payment_type': payment_type,
                'receiver_address_line1': address_line1,
                'receiver_address_line2': address_line2,
                'receiver_pincode': pincode,
                'receiver_city': city,
                'receiver_country': country,    
                'amount': amount,
                'currency': currency,
                'reference': "{0}...".format(reference[:136]) if len(reference) > 140 else reference,
                'execution_date': pay_date
            })
            return
            
    @frappe.whitelist()
    def create_bank_file(self):
        data = {}
        settings = frappe.get_doc("ERPNextSwiss Settings", "ERPNextSwiss Settings")
        data['xml_version'] = settings.get("xml_version")
        data['xml_region'] = settings.get("banking_region")
        data['msgid'] = "MSG-" + time.strftime("%Y%m%d%H%M%S")                # message ID (unique, SWIFT-characters only)
        data['date'] = time.strftime("%Y-%m-%dT%H:%M:%S")                    # creation date and time ( e.g. 2010-02-15T07:30:00 )
        # number of transactions in the file
        transaction_count = 0
        # total amount of all transactions ( e.g. 15850.00 )  (sum of all amounts)
        control_sum = 0.0
        # define company address
        data['company'] = {
            'name': html.escape(self.company)
        }
        company_address = get_primary_address(target_name=self.company, target_type="Company")
        if company_address:
            data['company']['address_line1'] = html.escape(company_address.address_line1)
            data['company']['address_line2'] = "{0} {1}".format(html.escape(company_address.pincode), html.escape(company_address.city))
            data['company']['country_code'] = company_address['country_code']
            data['company']['pincode'] = html.escape(company_address.pincode)
            data['company']['city'] = html.escape(company_address.city)
            # crop lines if required (length limitation)
            data['company']['address_line1'] = data['company']['address_line1'][:35]
            data['company']['address_line2'] = data['company']['address_line2'][:35]
            data['company']['street'] = html.escape(get_street_name(data['company']['address_line1'])[:35])
            data['company']['building'] = html.escape(get_building_number(data['company']['address_line1'])[:5])
            data['company']['pincode'] = data['company']['pincode'][:16]
            data['company']['city'] = data['company']['city'][:35]
        ### Payment Information (PmtInf, B-Level)
        # payment information records (1 .. 99'999)
        payment_account = frappe.get_doc('Account', self.pay_from_account)
        if not payment_account.iban or not payment_account.bic:
            frappe.throw( _("Account {0} is missing IBAN and/or BIC".format(
                self.pay_from_account) ) )
        data['company']['iban'] = "{0}".format(payment_account.iban.replace(" ", ""))
        data['company']['bic'] = "{0}".format(payment_account.bic.replace(" ", ""))
        data['payments'] = []
        for payment in self.payments:
            payment_content = ""
            payment_record = {
                'id': "PMTINF-{0}-{1}".format(self.name, transaction_count),   # unique (in this file) identification for the payment ( e.g. PMTINF-01, PMTINF-PE-00005 )
                'method': "TRF",             # payment method (TRF or TRA, no impact in Switzerland)
                'batch': "true",             # batch booking (true or false; recommended true)
                'required_execution_date': "{0}".format(payment.execution_date.split(" ")[0]),         # Requested Execution Date (e.g. 2010-02-22, remove time element)
                'debtor': {                    # debitor (technically ignored, but recommended)  
                    'name': html.escape(self.company),
                    'account': "{0}".format(payment_account.iban.replace(" ", "")),
                    'bic': "{0}".format(payment_account.bic)
                },
                'instruction_id': "INSTRID-{0}-{1}".format(self.name, transaction_count),          # instruction identification
                'end_to_end_id': "{0}".format((payment.reference[:33] + '..') if len(payment.reference) > 35 else payment.reference.strip()),   # end-to-end identification (should be used and unique within B-level; payment entry name)
                'currency': payment.currency,
                'amount': round(payment.amount, 2),
                'creditor': {
                    'name': html.escape(payment.receiver),
                    'address_line1': html.escape(payment.receiver_address_line1[:35]),
                    'address_line2': html.escape(payment.receiver_address_line2[:35]),
                    'street': html.escape(get_street_name(payment.receiver_address_line1)[:35]),
                    'building': html.escape(get_building_number(payment.receiver_address_line1)[:5]),
                    'country_code': frappe.get_value("Country", payment.receiver_country, "code").upper(),
                    'pincode': html.escape((payment.receiver_pincode or "")[:16]),
                    'city': html.escape((payment.receiver_city or "")[:35])
                },
                'is_salary': payment.is_salary
            }
            if payment.payment_type == "SEPA":
                # service level code (e.g. SEPA)
                payment_record['service_level'] = "SEPA"
                payment_record['iban'] = payment.iban.replace(" ", "")
                payment_record['reference'] = payment.reference
            elif payment.payment_type == "ESR":
                # Decision whether ESR or QRR
                if 'CH' in payment.esr_participation_number:
                    # It is a QRR
                    payment_record['service_level'] = "QRR"                    # only internal information
                    payment_record['esr_participation_number'] = payment.esr_participation_number.replace(" ", "")                    # handle esr_participation_number as QR-IBAN
                    payment_record['esr_reference'] = payment.esr_reference.replace(" ", "")                    # handle esr_reference as QR-Reference
                else:
                    # proprietary (nothing or CH01 for ESR)            
                    payment_record['local_instrument'] = "CH01"
                    payment_record['service_level'] = "ESR"                    # only internal information
                    payment_record['esr_participation_number'] = payment.esr_participation_number
                    payment_record['esr_reference'] = payment.esr_reference.replace(" ", "")
            else:
                payment_record['service_level'] = "IBAN"
                payment_record['iban'] = payment.iban.replace(" ", "")
                payment_record['reference'] = payment.reference
                payment_record['bic'] = (payment.bic or "").replace(" ", "")
            # once the payment is extracted for payment, submit the record
            transaction_count += 1
            control_sum += round(payment.amount, 2)
            data['payments'].append(payment_record)
        data['transaction_count'] = transaction_count
        data['control_sum'] = control_sum
        
        # render file
        single_payment = cint(self.get("single_payment"))
        if data['xml_version'] == "09" and not single_payment:
            content = frappe.render_template('erpnextswiss/erpnextswiss/doctype/payment_proposal/pain-001-001-09.html', data)
        elif data['xml_version'] == "09" and single_payment:
            content = frappe.render_template('erpnextswiss/erpnextswiss/doctype/payment_proposal/pain-001-001-09_single_payment.html', data)
        elif single_payment:
            content = frappe.render_template('erpnextswiss/erpnextswiss/doctype/payment_proposal/pain-001_single_payment.html', data)
        else:
            content = frappe.render_template('erpnextswiss/erpnextswiss/doctype/payment_proposal/pain-001.html', data)
                
        # apply unidecode if enabled
        if cint(settings.get("use_unidecode")) == 1:
            content = unidecode(content)
        
        # validate xml
        if cint(settings.get("validate_xml")) == 1:
            xml_schema = os.path.join(frappe.utils.get_bench_path(), XML_SCHEMA_FILES[settings.get("banking_region")][settings.get("xml_version")])
            validated, errors = validate_xml_against_xsd(content, xml_schema)
            if not validated:
                frappe.throw("Validation error: {0}".format(errors))
        
        return { 'content': content }
            
    def add_creditor_info(self, payment):
        payment_content = ""
        # creditor information
        payment_content += make_line("        <Cdtr>") 
        # name of the creditor/supplier
        payment_content += make_line("          <Nm>" + html.escape(payment.receiver)  + "</Nm>")
        # address of creditor/supplier (should contain at least country and first address line
        payment_content += make_line("          <PstlAdr>")
        # street name
        payment_content += make_line("            <StrtNm>{0}</StrtNm>".format(html.escape(get_street_name(payment.receiver_address_line1))))
        # building number
        payment_content += make_line("            <BldgNb>{0}</BldgNb>".format(html.escape(get_building_number(payment.receiver_address_line1))))
        # postal code
        payment_content += make_line("            <PstCd>{0}</PstCd>".format(html.escape(get_pincode(payment.receiver_address_line2))))
        # town name
        payment_content += make_line("            <TwnNm>{0}</TwnNm>".format(html.escape(get_city(payment.receiver_address_line2))))
        country = frappe.get_doc("Country", payment.receiver_country)
        payment_content += make_line("            <Ctry>" + country.code.upper() + "</Ctry>")
        payment_content += make_line("          </PstlAdr>")
        payment_content += make_line("        </Cdtr>") 
        return payment_content
        
        
# this function will create a new payment return proposal
@frappe.whitelist()
def create_payment_return_proposal(company=None, account=None):
    # check companies (take first created if none specififed)
    if company == None:
        companies = frappe.get_all("Company", filters={}, fields=['name'], order_by='creation')
        company = companies[0]['name']
    # get all payment entries with double payments
    sql_query = ("""
        SELECT 
          `tabPayment Entry`.`party` AS `customer`, 
          `tabPayment Entry`.`name` AS `name`,
          ABS(`tabPayment Entry Deduction`.`amount`) AS `outstanding_amount`,
          `tabPayment Entry`.`posting_date` AS `transaction_date`, 
          `tabPayment Entry`.`paid_to_account_currency` AS `currency`,
          `tabPayment Entry`.`reference_no` AS `external_reference`,
          `tabPayment Entry`.`posting_date` AS `skonto_date`,
          ABS(`tabPayment Entry Deduction`.`amount`) AS `skonto_amount`,
          `tabPayment Entry`.`bank_account_no` AS `iban`,
          "IBAN" AS `payment_type`
        FROM `tabPayment Entry Deduction`
        LEFT JOIN `tabPayment Entry` ON `tabPayment Entry Deduction`.`parent` = `tabPayment Entry`.`name`
        LEFT JOIN `tabPayment Return Proposal Payment Entry` ON `tabPayment Return Proposal Payment Entry`.`payment_entry` = `tabPayment Entry`.`name`
        WHERE  `tabPayment Entry`.`docstatus` = 1 
          AND `tabPayment Entry`.`payment_type` = "Receive"
          AND `tabPayment Entry`.`party_type` = "Customer"
          AND `tabPayment Return Proposal Payment Entry`.`name` IS NULL
          AND `tabPayment Entry Deduction`.`account` LIKE "{account}%"
          AND `tabPayment Entry`.`company` = '{company}'
          AND `tabPayment Entry`.`bank_account_no` IS NOT NULL
        GROUP BY `tabPayment Entry`.`name`;""".format(account=account, company=company))
    payment_entries = frappe.db.sql(sql_query, as_dict=True)
    # get all purchase invoices that pending
    total = 0.0
    records = []
    for pe in payment_entries:
        new_pe = { 
            'customer': pe.get('customer'),
            'payment_entry': pe.get('name'),
            'amount': pe.get('outstanding_amount'),
            'transaction_date': pe.get('transaction_date'),
            'currency': pe.get('currency'),
            'skonto_date': datetime.now(),              # same day requeste (GM) + timedelta(days=1),
            'skonto_amount': pe.get('skonto_amount'),
            'payment_type': pe.get('payment_type'),
            'iban': pe.get('iban')
        }
        total += pe.get('skonto_amount')
        records.append(new_pe)

    # create new record
    new_record = None
    now = datetime.now()
    date = now + timedelta(days=1)
    new_proposal = frappe.get_doc({
        'doctype': "Payment Return Proposal",
        'title': "{year:04d}-{month:02d}-{day:02d}".format(year=now.year, month=now.month, day=now.day),
        'date': "{year:04d}-{month:02d}-{day:02d}".format(year=now.year, month=now.month, day=now.day),
        'payment_entries': records,
        'company': company,
        'total': total
    })
    proposal_record = new_proposal.insert(ignore_permissions=True)      # ignore permissions, as noone has create permission to prevent the new button
    new_record = proposal_record.name
    frappe.db.commit()
    return get_url_to_form("Payment Return Proposal", new_record)
