var createApp = require('../').createApp,
    should = require('should');

describe('Pluginator', function() {

    var pluginsPath = __dirname + '/plugins';

    it('should create an App with an empty list of plugins', function(done) {
        var app = createApp([], function(err, res) {
            console.log('Created app');
            should.not.exist(err);
            done();
        });
    });

    it('should create an App with one plugin', function(done) {

        var app = createApp([{
            pluginPath: pluginsPath + '/eventer',
            wildcard: true
        }], function(err, app) {
            should.not.exist(err);
            should.exist(app);
            app.hasService('eventer').should.be.true;
            app.hasPlugin('mock-eventer').should.be.true;
            app.getService('eventer').should.be.an.Object;
            var inc = 0;
            app.getService('eventer').once('test', function() {
                inc++;
            });
            app.getService('eventer').emit('test');
            inc.should.be.eql(1);
            app.getService('eventer').isEnabledWildCard().should.be.true;
            done();
        });
    });

    it('should load firstly eventer, then logger, and finally users', function(callback) {
        var doneExecute = false;
        var done = function() {
            if (!doneExecute) callback();
            else {
                console.log('Done call more than once');
            }
        };

        var app = createApp([
            {
                pluginPath: pluginsPath + '/users'
            },
            pluginsPath + '/eventer',
            pluginsPath + '/logger'
        ], function(err, app) {
            should.not.exist(err);
            should.exist(app);

            app.hasPlugin('mock-users').should.be.true;
            app.hasPlugin('mock-logger').should.be.true;
            app.hasPlugin('mock-eventer').should.be.true;

            app.hasService('users').should.be.true;
            app.hasService('logger').should.be.true;
            app.hasService('eventer').should.be.true;
        });

        var plugins = [];
        app.on('plugin', function(name, plugin) {
            name.should.be.a.String;
            plugin.should.be.an.Object;
            plugins.push(name);
        });

        app.once('error', function(err) {
            done(err);
        });

        app.once('ready', function() {
            plugins.should.be.eql(['mock-eventer', 'mock-logger', 'mock-users']);
            done();
        });
    });

    it('should throw exception if missing services', function(done) {
        var app = createApp([
            pluginsPath + '/logger'
        ], function(err) {
            should.exist(err);
        });
        app.once('error', function(err) {
            done();
        });
    });

    it('should return consumers', function(done) {
        var app = createApp([
            pluginsPath + '/logger',
            pluginsPath + '/eventer'
        ], function() {
            app.getConsumers('logger').should.be.instanceof(Array).and.have.lengthOf(0);
            app.getConsumers('eventer').should.be.instanceOf(Array).and.have.lengthOf(1);
            done();
        });

        app.once('error', function(err) {
            console.log(err);
            done(err);
        });
    });

    it('should return providers', function(done) {
        var app = createApp([
            pluginsPath + '/logger',
            pluginsPath + '/eventer'
        ], function() {
            var provider = app.getProvider('logger');
            provider.should.be.an.Object;
            provider.name.should.be.eql('mock-logger');
            done();
        });
    });
    
    it('should destroy', function(done) {
        var app = createApp([
            pluginsPath + '/eventer',
            pluginsPath + '/logger',
            pluginsPath + '/users'
        ], function(err) {
            should.not.exist(err);
            app.destroy(function(err) {
                should.not.exist(err);
            });
        });

        var destroyed = [];
        app.on('plugin-destroyed', function(name, obj) {
            name.should.be.a.String;
            obj.should.be.an.Object;
            destroyed.push(name)
        });

        app.on('destroyed', function() {
            destroyed.should.be.eql(['mock-users', 'mock-logger', 'mock-eventer']);
            done();
        });
    });

    it('should throw exception if you are trying to remove a plugin which has dependents', function(done) {
        var app = createApp([
            pluginsPath + '/eventer',
            pluginsPath + '/logger',
            pluginsPath + '/users'
        ], function(err) {
            var destroyed = [];
            app.once('plugin-destroyed', function(name) {
                destroyed.push(name);
            });
            app.destroyPlugin('mock-eventer', function(err) {
                should.exist(err);
                err.toString().indexOf('dependent').should.be.above('-1');

                app.destroyPlugin('mock-users', function(err) {
                    should.not.exist(err);
                    destroyed.should.be.eql(['mock-users']);
                    done();
                });
            });
        });
    });

    it('should return dependencies', function(done) {
        var app = createApp([
            pluginsPath + '/eventer',
            pluginsPath + '/logger',
            pluginsPath + '/users'
        ], function(err) {
            app.getDependencies('mock-users').should.be.an.Array.and.have.lengthOf(2) ;
            app.getDependencies('mock-logger').should.be.an.Array.and.have.lengthOf(1) ;
            app.getDependencies('mock-eventer').should.be.an.Array.and.have.lengthOf(0) ;
            done();
        });
    });

    it('should return dependents', function(done) {
        var app = createApp([
            pluginsPath + '/eventer',
            pluginsPath + '/logger',
            pluginsPath + '/users'
        ], function(err) {
            app.getDependents('mock-users').should.be.an.Array.and.have.lengthOf(0) ;
            app.getDependents('mock-logger').should.be.an.Array.and.have.lengthOf(1) ;
            app.getDependents('mock-eventer').should.be.an.Array.and.have.lengthOf(2) ;
            done();
        });
    });
});