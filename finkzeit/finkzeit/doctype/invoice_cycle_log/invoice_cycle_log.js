// Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Invoice Cycle Log', {
	refresh: function(frm) {
         // add download print button
         if (frm.doc.bind_source) {
             frm.add_custom_button(__("Download Post PDF"), function() {
                  var win = window.open(frm.doc.bind_source, "_blank");
                  win.focus();
             });
        }
	}
});
