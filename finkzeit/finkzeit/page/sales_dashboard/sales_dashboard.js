frappe.pages['sales_dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Sales Dashboard'),
        single_column: true
    });

    frappe.sales_dashboard.make(page);
    frappe.sales_dashboard.run();
    
    // add the application reference
    frappe.breadcrumbs.add("Finkzeit");
}

frappe.sales_dashboard = {
    start: 0,
    make: function(page) {
        var me = frappe.sales_dashboard;
        me.page = page;
        me.body = $('<div></div>').appendTo(me.page.main);
        var data = "";
        $(frappe.render_template('sales_dashboard', data)).appendTo(me.body);
        
        /*
        // attach button handlers
        this.page.main.find(".btn-parse-file").on('click', function() {            
            // get selected account
            var account = document.getElementById("bank_account").value;
            
            // read the file 
            var file = document.getElementById("input_file").files[0];
            if (file.name.toLowerCase().endsWith(".xml")) {
                // this is an xml file
                
                var content = "";
                if (file) {
                    // create a new reader instance
                    var reader = new FileReader();
                    // assign load event to process the file
                    reader.onload = function (event) {
                        // enable waiting gif
                        frappe.bank_wizard.start_wait();
                        
                        // read file content
                        content = event.target.result;
                        
                        // parse the xml content
                        frappe.bank_wizard.parse(content, account);
                    }
                    // assign an error handler event
                    reader.onerror = function (event) {
                        frappe.msgprint(__("Error reading file"), __("Error"));
                    }
                    
                    reader.readAsText(file, "ANSI");
                }
                else
                {
                    frappe.msgprint(__("Please select a file."), __("Information"));
                }
            } else if (file.name.toLowerCase().endsWith(".zip")) {
                // this is a zip file
                console.log("unzipping " + file.name + "...");
                JSZip.loadAsync(file).then(function(zip) {
                    // async: compile a promise to extract all contained files
                    var promises = [];
                    zip.forEach(function (relativePath, zipEntry) {
                        promises.push(zipEntry.async("string").then(
                            function (data) {
                                return data; 
                            })
                        );
                    });
                    // on completed promise, combine content and process
                    Promise.all(promises).then(function (list) {
                        console.log("Promise complete!");
                        var content = list.join("");
                        // parse the xml content
                        frappe.bank_wizard.parse(content, account);
                    });
                }, function (e) {
                    frappe.msgprint( __("Unzip error: ") + e.message, __("Error") );
                });
            } else {
                frappe.msgprint( __("Unsupported file format. Please use an xml or zip camt file"), __("Error") );
            }
        });
        */
    },
    run: function() {
        frappe.sales_dashboard.make_chart();
        //make_chart()
        /*
        // populate bank accounts
        frappe.call({
            method: 'erpnextswiss.erpnextswiss.page.bank_wizard.bank_wizard.get_bank_accounts',
            callback: function(r) {
                if (r.message) {
                    var select = document.getElementById("bank_account");
                    for (var i = 0; i < r.message.accounts.length; i++) {
                        var opt = document.createElement("option");
                        opt.value = r.message.accounts[i];
                        opt.innerHTML = r.message.accounts[i];
                        select.appendChild(opt);
                    }
                } 
            }
        }); 
        frappe.call({
            method: 'erpnextswiss.erpnextswiss.page.bank_wizard.bank_wizard.get_intermediate_account',
            callback: function(r) {
                if ((r.message) && (r.message.account != "")) {
                    document.getElementById("intermediate_account").value = r.message.account;
                } else {
                    frappe.msgprint( __("Please set the <b>intermediate bank account</b> in <a href=\"/desk#Form/ERPNextSwiss Settings\">ERPNextSwiss Settings</a>.") );
                }
            }
        }); 
        frappe.call({
            method: 'erpnextswiss.erpnextswiss.page.bank_wizard.bank_wizard.get_payable_account',
            callback: function(r) {
                if ((r.message) && (r.message.account != "")) {
                    document.getElementById("payable_account").value = r.message.account;
		    
                } else {
                    frappe.msgprint( __("Please set the <b>default payable bank account</b> in the company.") );
                }
            }
        }); 
        frappe.call({
            method: 'erpnextswiss.erpnextswiss.page.bank_wizard.bank_wizard.get_receivable_account',
            callback: function(r) {
                if ((r.message) && (r.message.account != "")) {
                    document.getElementById("receivable_account").value = r.message.account;
                } else {
                    frappe.msgprint( __("Please set the <b>default receivable bank account</b> in the company.") );
                }
            }
        }); 
        frappe.call({
            method: 'erpnextswiss.erpnextswiss.page.bank_wizard.bank_wizard.get_default_customer',
            callback: function(r) {
                if ((r.message) && (r.message.customer != "")) {
                    document.getElementById("default_customer").value = r.message.customer;
                } else {
                    frappe.msgprint( __("Please set the <b>default customer</b> in <a href=\"/desk#Form/ERPNextSwiss Settings\">ERPNextSwiss Settings</a>.") );
                }
            }
        }); 
        frappe.call({
            method: 'erpnextswiss.erpnextswiss.page.bank_wizard.bank_wizard.get_default_supplier',
            callback: function(r) {
                if ((r.message) && (r.message.supplier != "")) {
                    document.getElementById("default_supplier").value = r.message.supplier;
                } else {
                    frappe.msgprint( __("Please set the <b>default supplier</b> in <a href=\"/desk#Form/ERPNextSwiss Settings\">ERPNextSwiss Settings</a>.") );
                }
            }
        }); 
        */
    },
    make_chart: function() {
        const chart = new frappeChart.Chart( "#main-chart", { 
            data: {
                labels: ["12am-3am", "3am-6am", "6am-9am", "9am-12pm",
                    "12pm-3pm", "3pm-6pm", "6pm-9pm", "9pm-12am"],

                datasets: [
                    {
                        name: "Some Data", chartType: 'bar',
                        values: [25, 40, 30, 35, 8, 52, 17, -4]
                    },
                    {
                        name: "Another Set", chartType: 'bar',
                        values: [25, 50, -10, 15, 18, 32, 27, 14]
                    },
                    {
                        name: "Yet Another", chartType: 'line',
                        values: [15, 20, -3, -15, 58, 12, -17, 37]
                    }
                ],

                yMarkers: [{ label: "Marker", value: 70,
                    options: { labelPos: 'left' }}],
                yRegions: [{ label: "Region", start: -10, end: 50,
                    options: { labelPos: 'right' }}]
            },

            title: "My Awesome Chart",
            type: 'axis-mixed', // or 'bar', 'line', 'pie', 'percentage'
            height: 300,
            colors: ['purple', '#ffa3ef', 'light-blue'],

            tooltipOptions: {
                formatTooltipX: d => (d + '').toUpperCase(),
                formatTooltipY: d => d + ' pts',
            }
        });
        
        setTimeout(function() { chart.draw(!0)}, 1);
    }
}
