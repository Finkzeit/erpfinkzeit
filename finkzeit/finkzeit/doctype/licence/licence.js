// Copyright (c) 2018-2019, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Licence', {
    refresh: function(frm) {
        if (!frm.doc.__islocal) {
            frm.add_custom_button(__("Create Licence File"), function() {
                generate_licence_file(frm);
            });
            frm.add_custom_button(__("Create Invoice"), function() {
                create_invoice(frm);
            });
        }
    },
    validate: function(frm) {
        // check valid invoices per year
        if (!([1,2,4,6,12].includes(frm.doc.invoices_per_year))) {
            // not valid invoice period
            frappe.msgprint(__("Invalid invoice period. Should be 1, 2, 4, 6 or 12") );
            frappe.validated = false;
        }
    }
});

function generate_licence_file(frm) {
    frappe.call({
        method: 'generate_licence_file',
        doc: frm.doc,
        callback: function(r) {
            if (r.message) {
                // prepare the xml file for download
                download("licence.yaml", r.message.content);
            } 
        }
    });
}
            
function download(filename, content) {
  var element = document.createElement('a');
  element.setAttribute('href', 'data:application/octet-stream;charset=utf-8,' + encodeURIComponent(content));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

// this function will manually trigger the invoice creation for the selected licence
function create_invoice(frm) {
    frappe.confirm(
        'Are you sure that you want to create the invoice(s) for the current period?',
        function(){
            // yes
            frappe.call({
	        method: 'finkzeit.finkzeit.doctype.licence.licence.process_licence',
	        args: {
                    licence_name: frm.doc.name
	        },
	        callback: function(r) {
		    if (r.message) {
                        frappe.msgprint( __("Invoice(s) created: ") + r.message);
                    }
                }
            });
        },
        function(){
            // no
        }
    )
}
