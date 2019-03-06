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
        */
    },
    make_chart: function() {
        const chart = new frappeChart.Chart( "#main-chart", { 
            data: {
                labels: ["Jan", "Feb", "Mär", "Apr",
                    "Mai", "Jun", "Jul", "Aug",
                    "Sep", "Okt", "Nov", "Dez"],

                datasets: [
                    {
                        name: __("Revenue YTD"), chartType: 'line',
                        values: [5, 10, 15, 12, 23, 12, 7, 11, 12, 15, 9, 10]
                    },
                                        {
                        name: __("Revenue PY"), chartType: 'line',
                        values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
                    },
                                        {
                        name: __("Expenses YTD"), chartType: 'line',
                        values: [15, 20, -3, -15, 58, 12, -17, 37]
                    },
                                        {
                        name: __("Expenses PY"), chartType: 'line',
                        values: [6, 7, 6, 8, 9, 10, 12, 8, 6, 7, 8, 5]
                    }
                ],

                /*yMarkers: [{ label: "Marker", value: 70, options: { labelPos: 'left' }}], */
                /*yRegions: [{ label: "Region", start: -10, end: 50, options: { labelPos: 'right' }}] */
            },
            type: 'line', 
            height: 300,
            colors: ['#2ECC40', '#01FF70', '#85144B', '#FF851B'],

            tooltipOptions: {
                formatTooltipX: d => (d + '').toUpperCase(),
                formatTooltipY: d => d + ' EUR',
            }
        });
        
        setTimeout(function() { chart.draw(!0)}, 1);
    }
}
