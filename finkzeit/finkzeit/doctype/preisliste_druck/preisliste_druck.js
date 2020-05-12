// Copyright (c) 2020, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Preisliste Druck', {
	refresh(frm) {
		if (!frm.doc.company) {
		    cur_frm.set_value('company', frappe.defaults.get_default("Company"));
		}
        if (frm.doc.docstatus === 0) {
		    frm.add_custom_button(__("Update"), function() {
                update_details(frm);
            });
		}
	}
});

frappe.ui.form.on('Preisliste Druck Position', {
	item(frm, dt, dn) {
        get_rates(frm, dt, dn, frappe.model.get_value(dt, dn, 'item'));
	}
});

function get_rates(frm, dt, dn, item) {
    // get price list rate
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
         	doctype: 'Item Price',
         	filters: [
 	            ['item_code', '=', item],
 	            ['price_list', '=', frm.doc.base_price_list]
 	        ],
            fields: ['price_list_rate'],
        },
        callback: function(response) {
            if (response.message) {
                var price_list_rate = 0;
                if (response.message.length > 0) {
                    price_list_rate = response.message[0].price_list_rate;
                }
                get_pricing_rule(frm, dt, dn, item, price_list_rate);
            }
        }
    });
}

function get_pricing_rule(frm, dt, dn, item, price_list_rate) {
    frappe.call({
		method: "erpnext.accounts.doctype.pricing_rule.pricing_rule.apply_pricing_rule",
		args: {	
		    'args': {
		        'customer': frm.doc.customer, 
			    'items': [{'item_code': item}], 
			    'price_list': frm.doc.base_price_list, 
			    'company': frm.doc.company, 
			    'transaction_date': frm.doc.posting_date
		    }
		},
		callback: function(r) {
			if (r.message) {
			    var pricing_rules = r.message;
			    var reduced_rate = price_list_rate;
			    var on_rate = false;
			    // has pricing rules
			    console.log(pricing_rules);
			    for (var i = 0; i < pricing_rules.length; i++) {
			        if (pricing_rules[i].pricing_rule_for === "Discount Amount") {
			            reduced_rate = reduced_rate - pricing_rules[i].discount_amount;
			        } else if (pricing_rules[i].pricing_rule_for === "Discount Percentage") {
			            reduced_rate = reduced_rate * ((100 - pricing_rules[i].discount_percentage)/100);
			        } else if (pricing_rules[i].pricing_rule_for === "Rate") {
			            // case rate: value is actually not part of response, only works on single pricing rule
			            on_rate = true;
			            frappe.call({
                            "method": "frappe.client.get",
                            "args": {
                                "doctype": "Pricing Rule",
                                "name": pricing_rules[i].pricing_rules
                            },
                            "callback": function(response) {
                                if (response.message) {
                                    reduced_rate = response.message.rate;
                                    set_rates(frm, dt, dn, item, price_list_rate, reduced_rate);
                                }
                            }
                        });
			        }
			    }
			    if (!on_rate) {
			        set_rates(frm, dt, dn, item, price_list_rate, reduced_rate);
			    }
			} 
		}
	});
}

function set_rates(frm, dt, dn, item, price_list_rate, reduced_rate) {
    frappe.model.set_value(dt, dn, "price_list_rate", price_list_rate);
    frappe.model.set_value(dt, dn, "reduced_rate", reduced_rate);
}

function update_details(frm) {
    for (var i = 0; i < frm.doc.items.length; i++) {
        if (frm.doc.items[i].row_type === "Item") {
            // update prices
            get_rates(frm, frm.doc.items[i].doctype, frm.doc.items[i].name, frm.doc.items[i].item);
            // update description
            update_description(frm, frm.doc.items[i].doctype, frm.doc.items[i].name, frm.doc.items[i].item);
        }
    }
}

function update_description(frm, dt, dn, item) {
    frappe.call({
        "method": "frappe.client.get",
        "args": {
            "doctype": "Item",
            "name": item
        },
        "callback": function(response) {
            var item = response.message;
            if (item) {
                frappe.model.set_value(dt, dn, "description", item.description);
            } 
        }
    });
}
