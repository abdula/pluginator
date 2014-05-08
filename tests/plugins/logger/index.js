module.exports = function setup(options, imports, register) {
    var eventer = imports.eventer;
    if (!eventer) {
        return register(new Error('Invalid imports'));
    }
    register(null, {
        logger: {
            info: function(msg) {
                eventer.emit('info', msg);
                console.log(msg);
            },
            warn: function(msg) {
                eventer.emit('warn', msg);
                console.log(msg);
            },
            log: function(msg) {
                eventer.emit('log', msg);
                console.log(msg);
            },
            getOptions: function() {
                return options;
            }
        }
    })
};