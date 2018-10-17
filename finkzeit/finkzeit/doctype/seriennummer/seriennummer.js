// Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Seriennummer', {
    refresh: function(frm) {
        if (frm.doc.kassa_nr == 0) { 
            frm.add_custom_button(__("Kassa-Nummer lösen"), function() {
                if (frm.doc.kassa_nr == 0) { 
                    get_next_kassa_number(frm);
                } else {
                    frappe.msgprint( __("Bitte Formular speichern.") );
                }
            });
		}
    },
    beschriftung: function(frm) {
        get_in_date(frm);
    },
    item: function(frm) {
        find_beschriftung(frm);
    },
    fink_snr: function(frm) {
        find_beschriftung(frm);
    }
});

function find_beschriftung(frm) {
    if ((frm.doc.item) && (frm.doc.fink_snr)) {
        frappe.call({
            "method":"frappe.client.get_list",
            "args":{
                doctype:"Beschriftung",
                filters: [
                    ["item","=", frm.doc.item],
                    ["number_start", "<=", frm.doc.fink_snr],
                    ["number_end", ">=", frm.doc.fink_snr]
                ],
                fields: ["name"]
            },
            "callback": function(response) {
                if (response.message) {
                    var beschriftungen = response.message;
                    if (beschriftungen.length > 0) {
                            frm.set_value('beschriftung', beschriftungen[0].name);
                    } 
                }
            }
        });
    }
}

function get_in_date(frm) {
    if ((!frm.doc.in_date) && (frm.doc.beschriftung)) {
        frappe.call({
            "method": "frappe.client.get",
            "args": {
                    "doctype": "Beschriftung",
                    "name": frm.doc.beschriftung
            },
            "callback": function(response) {
                var beschriftung = response.message;

                if (beschriftung) {
                        frm.set_value('in_date', beschriftung.date);
                } 
            }
        });
    }
}

function get_next_kassa_number(frm) {
    frappe.call({
        "method": 'get_next_kassa_number',
        "doc": frm.doc,
        "callback": function(response) {
           if (response.message) {
               frm.set_value('kassa_nr', response.message);
           }
        }
    });
}
