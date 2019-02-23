frappe.listview_settings['SoftCard File'] = {
    onload: function(listview) {
        listview.page.add_menu_item( __("Create SoftCard Export"), function() {
            create_softcard_export();
        });
    }
}

function create_softcard_export() {
    frappe.prompt([
        {'fieldname': 'customer', 'fieldtype': 'Link', 'label': __("Customer"), 'reqd': 1, 'options': 'Customer'}
      ],
      function(values) {
          frappe.call({
              "method": "finkzeit.finkzeit.softcard.enqueue_create_export",
              "args": { 'customer': values.customer },
              "callback": function(response) {
                  frappe.show_alert( __("Creation of Export File started...") );
              }
          });
      },
      __("Select customer"),
      __("Create")
    );
}
