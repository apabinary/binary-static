const localize             = require('../../../../base/localize').localize;
const Client               = require('../../../../base/client').Client;
const Header               = require('../../../../base/header').Header;
const State                = require('../../../../base/storage').State;
const detect_hedging       = require('../../../../common_functions/common_functions').detect_hedging;
const makeOption           = require('../../../../common_functions/common_functions').makeOption;
const FormManager          = require('../../../../common_functions/form_manager');
const moment               = require('moment');
require('select2');

const SettingsDetailsWS = (function() {
    'use strict';

    const form_id = '#frmPersonalDetails';
    const real_acc_elements = '.RealAcc';
    const hidden_class = 'invisible';
    let editable_fields,
        is_jp,
        is_virtual,
        residence,
        tax_residence_values,
        place_of_birth_value,
        get_settings_data;

    const init = () => {
        editable_fields = {};
        get_settings_data = {};
        is_virtual = Client.get('is_virtual');
        residence = Client.get('residence');
        is_jp = residence === 'jp';
        if (is_jp && !is_virtual) {
            $('#fieldset_email_consent').removeClass(hidden_class);
        }
        showHideTaxMessage();
    };

    const showHideTaxMessage = () => {
        if (Client.should_complete_tax()) {
            $('#tax_information_notice').removeClass(hidden_class);
        } else {
            $('#tax_information_notice').addClass(hidden_class);
        }
    };

    const getDetailsResponse = (data) => {
        const get_settings = $.extend({}, data);
        get_settings.date_of_birth = get_settings.date_of_birth ? moment.utc(new Date(get_settings.date_of_birth * 1000)).format('YYYY-MM-DD') : '';
        get_settings.name = is_jp ? get_settings.last_name : (get_settings.salutation || '') + ' ' + (get_settings.first_name || '') + ' ' + (get_settings.last_name || '');

        displayGetSettingsData(get_settings);

        if (is_virtual) {
            $(real_acc_elements).remove();
        } else if (is_jp) {
            const jp_settings = get_settings.jp_settings;
            displayGetSettingsData(jp_settings);
            if (jp_settings.hedge_asset !== null && jp_settings.hedge_asset_amount !== null) {
                $('.hedge').removeClass(hidden_class);
            }
            $('.JpAcc').removeClass('invisible hidden');
        } else {
            $(real_acc_elements).removeClass('hidden');
        }
        $(form_id).removeClass('hidden');
        FormManager.handleSubmit({
            form_selector       : form_id,
            obj_request         : { set_settings: 1 },
            fnc_response_handler: setDetailsResponse,
            fnc_additional_check: additionalCheck,
            enable_button       : true,
        });
    };

    const displayGetSettingsData = (data, populate = true) => {
        if (data.tax_residence) {
            tax_residence_values = data.tax_residence.split(',');
        }
        if (data.place_of_birth) {
            place_of_birth_value = data.place_of_birth;
        }
        let $key,
            $lbl_key,
            data_key,
            has_key,
            has_lbl_key;
        Object.keys(data).forEach((key) => {
            $key = $(`#${key}`);
            $lbl_key = $(`#lbl_${key}`);
            has_key = $key.length > 0;
            has_lbl_key = $lbl_key.length > 0;
            // prioritise labels for japan account
            $key = has_key && has_lbl_key ? (is_jp ? $lbl_key : $key) : (has_key ? $key : $lbl_key);
            if ($key.length > 0) {
                data_key = data[key] === null ? '' : data[key];
                editable_fields[key] = data_key;
                if (populate) {
                    if ($key.is(':checkbox')) {
                        $key.prop('checked', !!data_key);
                    } else if (/(SELECT|INPUT)/.test($key.prop('nodeName'))) {
                        $key.val(data_key.split(',')).trigger('change');
                    } else if (key !== 'country') {
                        $key.text(data_key ? localize(data_key) : '-');
                    }
                }
            }
        });
        if (data.country) {
            $('#residence').replaceWith($('<label/>').append($('<strong/>', { id: 'lbl_country' })));
            $('#lbl_country').text(data.country);
            if (is_virtual) $('#btn_update').addClass(hidden_class);
        }
    };

    const additionalCheck = (data) => {
        if (!isChanged(data) && (!data.jp_settings || !isChanged(data.jp_settings))) {
            showFormMessage('You did not change anything.', false);
            return false;
        }
        return true;
    };

    const isChanged = (data) => {
        const compare_data = $.extend({}, data);
        return Object.keys(compare_data).some(key => (
            key !== 'set_settings' && key !== 'jp_settings' && editable_fields[key] !== compare_data[key]
        ));
    };

    const getValidations = (data) => {
        let validations;
        if (is_jp) {
            validations = [
                { request_field: 'address_line_1',   value: data.address_line_1 },
                { request_field: 'address_line_2',   value: data.address_line_2 },
                { request_field: 'address_city',     value: data.address_city },
                { request_field: 'address_state',    value: data.address_state },
                { request_field: 'address_postcode', value: data.address_postcode },
                { request_field: 'phone',            value: data.phone },

                { selector: '#email_consent' },

                { selector: '#hedge_asset_amount', validations: ['req', 'number'], parent_node: 'jp_settings' },
                { selector: '#hedge_asset',        validations: ['req'], parent_node: 'jp_settings' },
            ];
            $(form_id).find('select').each(function () {
                validations.push({ selector: `#${$(this).attr('id')}`, validations: ['req'], parent_node: 'jp_settings' });
            });
        } else if (is_virtual) {
            validations = [{ selector: '#residence', validations: ['req'] }];
        } else {
            validations = [
                { selector: '#address_line_1',     validations: ['req', 'address'] },
                { selector: '#address_line_2',     validations: ['address'] },
                { selector: '#address_city',       validations: ['req', 'letter_symbol'] },
                { selector: '#address_state',      validations: $('#address_state').prop('nodeName') === 'SELECT' ? '' : ['letter_symbol'] },
                { selector: '#address_postcode',   validations: ['postcode', ['length', { min: 0, max: 20 }]] },
                { selector: '#phone',              validations: ['req', 'phone', ['length', { min: 6, max: 35 }]] },

                { selector: '#place_of_birth', validations: Client.is_financial() ? ['req'] : '' },
                { selector: '#tax_residence',  validations: Client.is_financial() ? ['req'] : '' },
            ];
            const tax_id_validation = { selector: '#tax_identification_number',  validations: ['postcode', ['length', { min: 0, max: 20 }]] };
            if (Client.is_financial()) {
                tax_id_validation.validations[1][1].min = 1;
                tax_id_validation.validations.unshift('req');
            }
            validations.push(tax_id_validation);
        }
        return validations;
    };

    const setDetailsResponse = (response) => {
        // allow user to resubmit the form on error.
        const is_error = response.set_settings !== 1;
        if (!is_error) {
            // to update tax information message for financial clients
            BinarySocket.send({ get_account_status: 1 }, true).then(() => {
                showHideTaxMessage();
                Header.displayAccountStatus();
            });
            // to update the State with latest get_settings data
            BinarySocket.send({ get_settings: 1 }, true).then((data) => {
                getDetailsResponse(data.get_settings);
            });
        }
        showFormMessage(is_error ?
            'Sorry, an error occurred while processing your account.' :
            'Your settings have been updated successfully.', !is_error);
    };

    const showFormMessage = (msg, is_success) => {
        $('#formMessage')
            .attr('class', is_success ? 'success-msg' : 'errorfield')
            .html(is_success ? '<ul class="checked"><li>' + localize(msg) + '</li></ul>' : localize(msg))
            .css('display', 'block')
            .delay(5000)
            .fadeOut(1000);
    };

    const populateResidence = (response) => {
        const residence_list = response.residence_list;
        const $place_of_birth = $('#place_of_birth');
        const $tax_residence  = $('#tax_residence');
        if (residence_list.length > 0) {
            const $options = $('<div/>');
            residence_list.forEach((res) => {
                $options.append(makeOption(res.text, res.value));
            });

            if (residence) {
                $place_of_birth.html($options.html());
                $tax_residence.html($options.html()).promise().done(() => {
                    setTimeout(() => {
                        $tax_residence.select2()
                            .val(tax_residence_values).trigger('change')
                            .removeClass('invisible');
                    }, 500);
                });
                $place_of_birth.val(place_of_birth_value || residence);
            } else {
                $('#lbl_country').parent().replaceWith($('<select/>', { id: 'residence' }));
                const $residence = $('#residence');
                $options.prepend($('<option/>', { text: localize('Please select a value'), value: '' }));
                $residence.html($options.html());
                initFormManager();
            }
        }
    };

    const populateStates = function(response) {
        const address_state = '#address_state';
        let $field = $(address_state);
        const states = response.states_list;

        $field.empty();

        if (states && states.length > 0) {
            $field.append($('<option/>', { value: '', text: localize('Please select') }));
            states.forEach(function(state) {
                $field.append($('<option/>', { value: state.value, text: state.text }));
            });
        } else {
            $field.replaceWith($('<input/>', { id: address_state.replace('#', ''), name: 'address_state', type: 'text', maxlength: '35' }));
            $field = $(address_state);
        }
        $field.val(get_settings_data.address_state);
        initFormManager();
        if (is_jp && !is_virtual) {
            // detect_hedging needs to be called after FormManager.init
            // or all previously bound event listeners on form elements will be removed
            detect_hedging($('#trading_purpose'), $('.hedge'));
        }
    };

    const initFormManager = () => { FormManager.init(form_id, getValidations(get_settings_data)); };

    const onLoad = () => {
        BinarySocket.wait('get_account_status', 'get_settings').then(() => {
            init();
            get_settings_data = State.get(['response', 'get_settings', 'get_settings']);
            getDetailsResponse(get_settings_data);
            if (!is_virtual || !residence) {
                $('#btn_update').removeClass(hidden_class);
                if (!is_jp) {
                    BinarySocket.send({ residence_list: 1 }).then(response => populateResidence(response));
                }
                if (residence) {
                    BinarySocket.send({ states_list: residence }).then(response => populateStates(response));
                }
            } else {
                $('#btn_update').addClass(hidden_class);
            }
        });
    };

    return {
        onLoad: onLoad,
    };
})();

module.exports = SettingsDetailsWS;
