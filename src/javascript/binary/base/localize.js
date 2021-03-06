const texts_json  = require('../../autogenerated/texts').texts_json;
const template    = require('./utility').template;
const moment      = require('moment');

const Localize = (function () {
    const texts = {};
    let localizedTexts;
    const init = function () {
        // make texts objects localizable
        Object.keys(texts_json).forEach(function(key) {
            texts[key] = texts_json[key] ? texts_json[key] : {};
        });
    };

    const localizeForLang = function(lang) {
        init();
        localizedTexts = texts[lang];
        moment.locale(lang.toLowerCase());
    };

    const do_localize = function(text, params) {
        const index = text.replace(/[\s|.]/g, '_');
        text = (localizedTexts && localizedTexts[index]) || text;
        // only do templating when explicitly required
        return params ? template(text, params) : text;
    };

    const localize = function (text, params) {
        if (Array.isArray(text)) {
            return text.map(function(t) { return do_localize(t, params); });
        }
        // else
        return do_localize(text, params);
    };

    return {
        localizeForLang: localizeForLang,
        localize       : localize,
    };
})();

module.exports = {
    localize       : Localize.localize,
    localizeForLang: Localize.localizeForLang,
};
