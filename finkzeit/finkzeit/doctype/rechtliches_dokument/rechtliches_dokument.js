// Copyright (c) 2020, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Rechtliches Dokument', {
	refresh: function(frm) {
        if (frm.doc.__islocal) {
            if (!frm.doc.date) {
                cur_frm.set_value('date', new Date());
            }
        }
	},
    customer: function(frm) {
        set_title(frm);
    },
    supplier: function(frm) {
        set_title(frm);
    },
    document_type: function(frm) {
        set_title(frm);
    }
});

function set_title(frm) {
    if (frm.doc.reference_type === "Customer") {
        if ((frm.doc.document_type) && (frm.doc.customer)) {
            cur_frm.set_value('title', frm.doc.document_type + " " + frm.doc.customer);
        }
    } else if (frm.doc.reference_type === "Supplier") {
        if ((frm.doc.document_type) && (frm.doc.supplier)) {
            cur_frm.set_value('title', frm.doc.document_type + " " + frm.doc.supplier);
        }
    }
}
