// Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Kassa', {
	refresh: function(frm) {

	},
    before_submit: function(frm) {
        frm.doc.cash_ins.forEach(function(entry) {
            if (!entry.in_account) {
                frappe.validated = false;
                frappe.msgprint("Bitte Eingangskonten angeben.");
            }
        });
        frm.doc.cash_outs.forEach(function(entry) {
            if (!entry.out_account) {
                frappe.validated = false;
                frappe.msgprint("Bitte Ausgangskonten angeben.");
            }
        });
        
    }
});
