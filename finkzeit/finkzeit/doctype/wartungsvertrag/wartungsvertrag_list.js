frappe.listview_settings['Wartungsvertrag'] = {
    onload: function(listview) {
        listview.page.add_menu_item( __("Create support contract invoices"), function() {
            create_support_contract_invoices();
        });
    }
}

function create_support_contract_invoices() {
    frappe.prompt([
        {'fieldname': 'year', 'fieldtype': 'Int', 'label': __('Year'), 'reqd': 1, 'default': new Date().getFullYear()},
        {'fieldname': 'increase_percentage', 'fieldtype': 'Percent', 'label': __('Increase percent'), 'reqd': 1, 'default': 1.5}  
    ],
    function(values){
        frappe.call({
            "method": "finkzeit.finkzeit.doctype.wartungsvertrag.wartungsvertrag.create_support_contract_invoices",
            "args": { 
                "increase_percentage": values.increase_percentage,
                "year": values.year
            },
            "callback": function(response) {
                frappe.show_alert( __("Invoices created") );
            }
        });
    },
    __('Please enter the index change percentage'),
    'OK'
    )
    
 
}
