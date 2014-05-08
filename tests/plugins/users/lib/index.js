var users = [ 'John', 'Sara', 'Julia', 'Jack', 'Emma' ];

module.exports = function(options, imports, register) {
    var eventer = imports.eventer,
        logger = imports.logger;

    if (!eventer || !logger) {
        throw 'Eventer or Logger not specified';
    }

    register(null, {
        users: {
            addUser: function(name) {
                logger.log('add user', name);
                eventer.emit('users:add', name);
                users.push(name);
            },
            removeUser: function(name) {
                eventer.emit('users:remove', name);
                logger.log('remove user', name);
                users.splice(users.indexOf(name), 1);
            },
            getUsers: function() {
                return users;
            }
        },
        onDestroy: function(next) {
            eventer.emit('users-destroyed');
            next();
        }
    });
};