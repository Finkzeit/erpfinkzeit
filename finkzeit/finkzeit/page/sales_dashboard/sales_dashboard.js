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
        // get cashflows
        frappe.call({
            method: 'finkzeit.finkzeit.page.sales_dashboard.sales_dashboard.get_cashflow_for_user',
            args: {
                'user': frappe.user.name
            },
            callback: function(r) {
                if (r.message) {
                    console.log(r.message.toSource());
                    // create chart
                    frappe.sales_dashboard.make_chart(r.message.cashflows);
                    // create KPIs
                    var revenue_container = document.getElementById("revenue-placeholder");
                    var content = frappe.render_template('kpi', r.message.cashflows.revenue);
                    revenue_container.innerHTML = content;
                    var expenses_container = document.getElementById("expenses-placeholder");
                    var content = frappe.render_template('kpi', r.message.cashflows.expenses);
                    expenses_container.innerHTML = content;
                    var profit_container = document.getElementById("profit-placeholder");
                    var content = frappe.render_template('kpi', r.message.cashflows.profit);
                    profit_container.innerHTML = content;                    
                    // control: show cost center
                    var kst_container = document.getElementById("kst-placeholder");
                    kst_container.innerHTML = r.message.cashflows.cost_center;
                } 
            }
        }); 
        
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
    make_chart: function(cashflows) {
        const chart = new frappeChart.Chart( "#main-chart", { 
            data: {
                labels: ["Jan", "Feb", "Mär", "Apr",
                    "Mai", "Jun", "Jul", "Aug",
                    "Sep", "Okt", "Nov", "Dez"],

                datasets: [
                    {
                        name: __("Revenue YTD"), chartType: 'line',
                        values: cashflows.monthly_revenue_ytd
                    },
                                        {
                        name: __("Revenue PY"), chartType: 'line',
                        values: cashflows.monthly_revenue_py
                    },
                                        {
                        name: __("Expenses YTD"), chartType: 'line',
                        values: cashflows.monthly_expenses_ytd
                    },
                                        {
                        name: __("Expenses PY"), chartType: 'line',
                        values: cashflows.monthly_expenses_py
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
