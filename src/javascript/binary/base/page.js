var Login             = require('./login').Login;
var template          = require('./utility').template;
var LocalStore        = require('./storage').LocalStore;
var localizeForLang   = require('./localize').localizeForLang;
var localize          = require('./localize').localize;
var getLanguage       = require('./language').getLanguage;
var setCookieLanguage = require('./language').setCookieLanguage;
var GTM               = require('./gtm').GTM;
var Url               = require('./url').Url;
var Client            = require('./client').Client;
var Header            = require('./header').Header;
var Menu              = require('./menu').Menu;
var Contents          = require('./contents').Contents;
var load_with_pjax    = require('./pjax').load_with_pjax;
var TrafficSource     = require('../common_functions/traffic_source').TrafficSource;
var japanese_client   = require('../common_functions/country_base').japanese_client;
var checkLanguage     = require('../common_functions/country_base').checkLanguage;
var ViewBalance       = require('../websocket_pages/user/viewbalance/viewbalance.init').ViewBalance;
var Cookies           = require('../../lib/js-cookie');
var moment            = require('moment');
require('../../lib/polyfills/array.includes');
require('../../lib/polyfills/string.includes');
require('../../lib/mmenu/jquery.mmenu.min.all.js');

var Page = function() {
    this.is_loaded_by_pjax = false;
    Client.init();
    this.url = new Url();
    Menu.init(this.url);
    $('#logo').on('click', function() {
        load_with_pjax(page.url.url_for(Client.get_value('is_logged_in') ? japanese_client() ? 'multi_barriers_trading' : 'trading' : ''));
    });
    $('#btn_login').on('click', function(e) {
        e.preventDefault(); Login.redirect_to_login();
    });
};

Page.prototype = {
    on_load: function() {
        this.url.reset();
        localizeForLang(getLanguage());
        Header.on_load();
        this.on_change_loginid();
        this.record_affiliate_exposure();
        Contents.on_load();
        this.on_click_acc_transfer();
        if (this.is_loaded_by_pjax) {
            this.show_authenticate_message();
        }
        if (Client.get_value('is_logged_in')) {
            ViewBalance.init();
        } else {
            LocalStore.set('reality_check.ack', 0);
        }
        setCookieLanguage();
        if (sessionStorage.getItem('showLoginPage')) {
            sessionStorage.removeItem('showLoginPage');
            Login.redirect_to_login();
        }
        checkLanguage();
        TrafficSource.setData();
        this.endpoint_notification();
        BinarySocket.init();
        this.show_notification_outdated_browser();
    },
    on_unload: function() {
        Menu.on_unload();
        Contents.on_unload();
    },
    on_change_loginid: function() {
        var that = this;
        $('.login-id-list a').on('click', function(e) {
            e.preventDefault();
            $(this).attr('disabled', 'disabled');
            that.switch_loginid($(this).attr('value'));
        });
    },
    switch_loginid: function(loginid) {
        if (!loginid || loginid.length === 0) {
            return;
        }
        var token = Client.get_token(loginid);
        if (!token || token.length === 0) {
            Client.send_logout_request(true);
            return;
        }

        // cleaning the previous values
        Client.clear_storage_values();
        sessionStorage.setItem('active_tab', '1');
        sessionStorage.removeItem('client_status');
        // set cookies: loginid, login
        Client.set_cookie('loginid', loginid);
        Client.set_cookie('login',   token);
        // set local storage
        GTM.set_login_flag();
        localStorage.setItem('active_loginid', loginid);
        $('.login-id-list a').removeAttr('disabled');
        page.reload();
    },
    on_click_acc_transfer: function() {
        $('#acc_transfer_submit').on('click', function() {
            var amount = $('#acc_transfer_amount').val();
            if (!/^[0-9]+\.?[0-9]{0,2}$/.test(amount) || amount < 0.1) {
                $('#invalid_amount').removeClass('invisible');
                $('#invalid_amount').show();
                return false;
            }
            $('#acc_transfer_submit').submit();
            return true;
        });
    },
    record_affiliate_exposure: function() {
        var token = this.url.param('t');
        if (!token || token.length !== 32) {
            return false;
        }
        var token_length = token.length;
        var is_subsidiary = /\w{1}/.test(this.url.param('s'));

        var cookie_token = Cookies.getJSON('affiliate_tracking');
        if (cookie_token) {
            // Already exposed to some other affiliate.
            if (is_subsidiary && cookie_token && cookie_token.t) {
                return false;
            }
        }

        // Record the affiliate exposure. Overwrite existing cookie, if any.
        var cookie_hash = {};
        if (token_length === 32) {
            cookie_hash.t = token.toString();
        }
        if (is_subsidiary) {
            cookie_hash.s = '1';
        }

        Cookies.set('affiliate_tracking', cookie_hash, {
            expires: 365, // expires in 365 days
            path   : '/',
            domain : '.' + location.hostname.split('.').slice(-2).join('.'),
        });
        return true;
    },
    reload: function(forcedReload) {
        window.location.reload(!!forcedReload);
    },
    check_new_release: function() { // calling this method is handled by GTM tags
        var last_reload = localStorage.getItem('new_release_reload_time');
        // prevent reload in less than 10 minutes
        if (last_reload && +last_reload + (10 * 60 * 1000) > moment().valueOf()) return;
        var currect_hash = $('script[src*="binary.min.js"],script[src*="binary.js"]').attr('src').split('?')[1];
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (+xhttp.readyState === 4 && +xhttp.status === 200) {
                var latest_hash = xhttp.responseText;
                if (latest_hash && latest_hash !== currect_hash) {
                    localStorage.setItem('new_release_reload_time', moment().valueOf());
                    page.reload(true);
                }
            }
        };
        xhttp.open('GET', page.url.url_for_static() + 'version?' + Math.random().toString(36).slice(2), true);
        xhttp.send();
    },
    endpoint_notification: function() {
        var server  = localStorage.getItem('config.server_url');
        if (server && server.length > 0) {
            var message = (/www\.binary\.com/i.test(window.location.hostname) ? '' :
                localize('This is a staging server - For testing purposes only') + ' - ') +
                localize('The server <a href="[_1]">endpoint</a> is: [_2]', [page.url.url_for('endpoint'), server]);
            $('#end-note').html(message).removeClass('invisible');
            $('#footer').css('padding-bottom', $('#end-note').height());
        }
    },
    // type can take one or more params, separated by comma
    // e.g. one param = 'authenticated', two params = 'unwelcome, authenticated'
    // match_type can be `any` `all`, by default is `any`
    // should be passed when more than one param in type.
    // `any` will return true if any of the params in type are found in client status
    // `all` will return true if all of the params in type are found in client status
    client_status_detected: function(type, match_type) {
        var client_status = sessionStorage.getItem('client_status');
        if (!client_status || client_status.length === 0) return false;
        var require_auth = /\,/.test(type) ? type.split(/, */) : [type];
        client_status = client_status.split(',');
        match_type = match_type && match_type === 'all' ? 'all' : 'any';
        for (var i = 0; i < require_auth.length; i++) {
            if (match_type === 'any' && (client_status.indexOf(require_auth[i]) > -1)) return true;
            if (match_type === 'all' && (client_status.indexOf(require_auth[i]) < 0)) return false;
        }
        return (match_type !== 'any');
    },
    show_authenticate_message: function() {
        if ($('.authenticate-msg').length !== 0) return;

        var p = $('<p/>', { class: 'authenticate-msg notice-msg' }),
            span;

        if (this.client_status_detected('unwelcome')) {
            var purchase_button = $('.purchase_button');
            if (purchase_button.length > 0 && !purchase_button.parent().hasClass('button-disabled')) {
                $.each(purchase_button, function() {
                    $(this).off('click dblclick').removeAttr('data-balloon').parent()
                        .addClass('button-disabled');
                });
            }
        }

        if (this.client_status_detected('unwelcome, cashier_locked', 'any')) {
            var if_balance_zero = $('#if-balance-zero');
            if (if_balance_zero.length > 0 && !if_balance_zero.hasClass('button-disabled')) {
                if_balance_zero.removeAttr('href').addClass('button-disabled');
            }
        }

        if (this.client_status_detected('authenticated, unwelcome', 'all')) {
            span = $('<span/>', { html: template(localize('Your account is currently suspended. Only withdrawals are now permitted. For further information, please contact [_1].', ['<a href="mailto:support@binary.com">support@binary.com</a>'])) });
        } else if (this.client_status_detected('unwelcome')) {
            span = this.general_authentication_message();
        } else if (this.client_status_detected('authenticated, cashier_locked', 'all') && /cashier\.html/.test(window.location.href)) {
            span = $('<span/>', { html: template(localize('Deposits and withdrawal for your account is not allowed at this moment. Please contact [_1] to unlock it.', ['<a href="mailto:support@binary.com">support@binary.com</a>'])) });
        } else if (this.client_status_detected('cashier_locked') && /cashier\.html/.test(window.location.href)) {
            span = this.general_authentication_message();
        } else if (this.client_status_detected('authenticated, withdrawal_locked', 'all') && /cashier\.html/.test(window.location.href)) {
            span = $('<span/>', { html: template(localize('Withdrawal for your account is not allowed at this moment. Please contact [_1] to unlock it.', ['<a href="mailto:support@binary.com">support@binary.com</a>'])) });
        } else if (this.client_status_detected('withdrawal_locked') && /cashier\.html/.test(window.location.href)) {
            span = this.general_authentication_message();
        }
        if (span) {
            $('#content > .container').prepend(p.append(span));
        }
    },
    general_authentication_message: function() {
        var span = $('<span/>', { html: template(localize('To authenticate your account, kindly email the following to [_1]:', ['<a href="mailto:support@binary.com">support@binary.com</a>'])) });
        var ul   = $('<ul/>',   { class: 'checked' });
        var li1  = $('<li/>',   { text: localize('A scanned copy of your passport, driving licence (provisional or full) or identity card, showing your name and date of birth. Your document must be valid for at least 6 months after this date.') });
        var li2  = $('<li/>',   { text: localize('A scanned copy of a utility bill or bank statement (no more than 3 months old)') });
        return span.append(ul.append(li1, li2));
    },
    show_notification_outdated_browser: function() {
        window.$buoop = {
            vs : { i: 11, f: -4, o: -4, s: 9, c: -4 },
            api: 4,
            l  : getLanguage().toLowerCase(),
            url: 'https://whatbrowser.org/',
        };
        $(document).ready(function() {
            $('body').append($('<script/>', { src: '//browser-update.org/update.min.js' }));
        });
    },
};

var page = new Page();

// LocalStorage can be used as a means of communication among
// different windows. The problem that is solved here is what
// happens if the user logs out or switches loginid in one
// window while keeping another window or tab open. This can
// lead to unintended trades. The solution is to reload the
// page in all windows after switching loginid or after logout.

// onLoad.queue does not work on the home page.
// jQuery's ready function works always.

$(document).ready(function () {
    if ($('body').hasClass('BlueTopBack')) return; // exclude BO
    // Cookies is not always available.
    // So, fall back to a more basic solution.
    var match = document.cookie.match(/\bloginid=(\w+)/);
    match = match ? match[1] : '';
    $(window).on('storage', function (jq_event) {
        switch (jq_event.originalEvent.key) {
            case 'active_loginid':
                if (jq_event.originalEvent.newValue === match) return;
                if (jq_event.originalEvent.newValue === '') {
                    // logged out
                    page.reload();
                } else if (!window.is_logging_in) {
                    // loginid switch
                    page.reload();
                }
                break;
            case 'new_release_reload_time':
                if (jq_event.originalEvent.newValue !== jq_event.originalEvent.oldValue) {
                    page.reload(true);
                }
                break;
            // no default
        }
    });
    LocalStore.set('active_loginid', match);
});

module.exports = {
    page: page,
};
