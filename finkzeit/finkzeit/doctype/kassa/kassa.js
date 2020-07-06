// Copyright (c) 2018-2020, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Kassa', {
	refresh: function(frm) {

	},
    before_save: function(frm) {
        frm.doc.cash_ins.forEach(function(entry) {
            if ((entry.tax_amount > 0) && (!entry.tax_account)) {
                frappe.validated = false;
                frappe.msgprint("Bitte Steuerkonto angeben. Eingänge Zeile: " + entry.idx);
            }
        });
        frm.doc.cash_outs.forEach(function(entry) {
            if ((entry.tax_amount > 0) && (!entry.tax_account)) {
                frappe.validated = false;
                frappe.msgprint("Bitte Steuerkonto angeben. Ausgänge Zeile: " + entry.idx);
            }
        });          
    }, 
    before_submit: function(frm) {
        frm.doc.cash_ins.forEach(function(entry) {
            if (!entry.in_account) {
                frappe.validated = false;
                frappe.msgprint("Bitte Eingangskonten angeben. Eingänge Zeile: " + entry.idx);
            }
        });
        frm.doc.cash_outs.forEach(function(entry) {
            if (!entry.out_account) {
                frappe.validated = false;
                frappe.msgprint("Bitte Ausgangskonten angeben. Ausgänge Zeile: " + entry.idx);
            }
        });
    },
    on_submit: function(frm) {
        if (frm.doc.docstatus == 1) {
            // reload to force loading transactions
            location.reload();
        }
    }
});
