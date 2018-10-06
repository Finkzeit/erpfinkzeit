// Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Licence', {
	refresh: function(frm) {
        frm.add_custom_button(__("Create Licence File"), function() {
			generate_licence_file(frm);
		});
	},
    validate: function(frm) {
        // apply total per item row
        /*var total_amount = 0;
        frm.doc.invoice_items.forEach(function (item) {
            amount = (item.qty) * (item.rate * ((100 - item.discount) / 100));
            frappe.model.set_value(item.doctype, item.name, 'amount', amount);
            total_amount += amount;
        });
        cur_frm.set_value('total_amount', total_amount);
        var total_amount_special = 0;
        frm.doc.special_invoice_items.forEach(function (item) {
            amount = (item.qty) * (item.rate * ((100 - item.discount) / 100));
            frappe.model.set_value(item.doctype, item.name, 'amount', amount);
            total_amount_special += amount;
        });
        frm.set_value('total_amount_special', total_amount_special);
        frm.set_value('grand_total', total_amount + total_amount_special);
        cur_frm.refresh_field('total_amount', 'total_amount_special', 'grand_total');*/
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
