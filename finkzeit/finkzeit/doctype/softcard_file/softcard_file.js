// Copyright (c) 2019, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('SoftCard File', {
	refresh: function(frm) {
        if (!frm.doc.__islocal) {
            frm.add_custom_button(__("Download Export File"), function() {
                generate_export_file(frm);
            });

        }
	}
});
function generate_export_file(frm) {
    frappe.call({
        'method': 'finkzeit.finkzeit.softcard.export_file',
        'args': { 'softcard_file': frm.doc.name },
        'callback': function(r) {
            if (r.message) {
                // prepare the csv file for download
                download("softcard_" + frm.doc.name +".csv", r.message.content);
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
