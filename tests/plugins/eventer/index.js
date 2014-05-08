var EventEmitter = require('events').EventEmitter;

module.exports = function setup(options, imports, register) {
    var eventer = new EventEmitter();
    eventer.isEnabledWildCard = function() {
        return options.wildcard? true : false;
    };
    register(null, {
        eventer: eventer
    });
};