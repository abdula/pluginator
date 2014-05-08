"use strict";

var util = require('util'),
    events = require('events'),
    async = require('async'),
    path = require('path');

function Plugin(options) {
    var pkgPath, info, metadata, pluginPath;

    if (typeof options == 'string') {
        pluginPath = options;
        options = {};
    } else {
        pluginPath = options.pluginPath;
        delete options.pluginPath;
    }

    if (!pluginPath) {
        throw 'Invalid plugin path';
    }

    pluginPath = (pluginPath.split('package.json'))[0];
    pkgPath = path.join(pluginPath, 'package.json');

    try {
        info = require(pkgPath);
    } catch (e) {
        throw 'Invalid plugin path. File "' + pkgPath + '" not found';
    }

    metadata = info.plugin || {provides: [], consumes: []};

    return {
        get options() {
            return options;
        },
        get info() {
            return info;
        },
        get metadata() {
            return metadata;
        },
        get consumes() {
            return metadata.consumes || [];
        },
        get provides() {
            return metadata.provides || [];
        },
        get name() {
            return info.name;
        },
        get setupPath() {
            if (metadata.module) {
                return path.resolve(pluginPath, metadata.module);
            }
            return pluginPath;
        },
        setup: function(imports, register) {
            var func = require(this.setupPath);
            func(options, imports, register);
        }
    };
}

function App() {
    var _plugins  = {},
        _services = {
            App: this
        };

    events.EventEmitter.call(this);

    this.setupPlugin = function(options, next) {
        this.setupPlugins([options], next);
    };

    this.hasService = function(name) {
        return _services.hasOwnProperty(name);
    };
    
    this.getService = function(name) {
        if (!this.hasService(name)) {
            throw 'Service "' + name + '" does not exist';
        }
        return _services[name];
    };

    this.setupPlugins = function(plugins, cb) {
        var returnError = (function(err){
            this.emit('error', err);
            return cb(err);
        }).bind(this);

        if (!Array.isArray(plugins)) {
            return returnError(
                new Error('Invalid argument: "plugins" should be an Array'));
        }
        var self = this;

        plugins = plugins.map(function(plugin) {
            try {
                plugin = new Plugin(plugin);
            } catch(e) {
                return returnError(e);
            }
            plugin.destroy = function(options, next) {
                self.destroyPlugin(this.name, options, next);
            };
            return plugin;
        });

        var missionServices = getMissingServices(plugins);
        if (missionServices.length > 0) {
            return returnError(new Error('Services "' + missionServices.join('","') + '" are required'));
        }

        plugins = resolvePlugins(plugins);

        var registerPlugin = (function(plugin, next) {
            //var sandbox = new Sandbox(plugin.metadata);
            var imports = {};
            plugin.consumes.forEach(function(name) {
                imports[name] = this.getService(name);
            }, this);

            plugin.setup(imports, (function(err, result) {
                if (err) {
                    return next(err);
                }

                if (result.onDestroy) {
                    plugin.__destructor = result.onDestroy;
                }
                _plugins[plugin.name] = plugin;

                var provides = plugin.provides;

                for (var i = 0; i < provides.length; i++) {
                    var provide = provides[i],
                        service = result[provide];
                    if (!service) {
                        return next(new Error('Plugin does not provide service "' + provide + '"'));
                    }
                    _services[provide] = service;
                    this.emit('service:' + provide, service);
                    this.emit('service', provide, service);
                }

                this.emit('plugin', plugin.name, plugin);
                this.emit('plugin:' + plugin.name, plugin);

                return next(null);
            }).bind(this));
        }.bind(this));

        return async.forEach(plugins, registerPlugin,
            function(err) {
                if (err) {
                    returnError(err);
                } else {
                    self.emit('ready');
                    cb(null);
                }
            });
    };

    this.getPlugin = function(plugin) {
        if (typeof plugin != 'string') {
            return plugin;
        }

        if (_plugins.hasOwnProperty(plugin)) {
            return _plugins[plugin];
        }
        throw 'Plugin "' + plugin + '" not found';
    };

    this.getDependents = function(plugin) {
        var provides = this.getPlugin(plugin).provides;
        var result = [];
        provides.forEach(function(service) {
            var consumers = this.getConsumers(service);
            for (var i = 0; i < consumers.length; i++) {
                if (result.indexOf(consumers[i]) == -1) {
                    result.push(consumers[i]);
                }
            }
        }, this);
        return result;
    };

    this.getDependencies = function(plugin) {
        var consumes = this.getPlugin(plugin).consumes;
        var result = [];
        consumes.forEach(function(service) {
            var provider = this.getProvider(service);
            if (result.indexOf(provider) == -1) {
                result.push(provider);
            }
        }, this);
        return result;
    };

    this.destroyPlugins = function(options, cb) {
        if (typeof options == 'function') {
            cb = options;
            options = {};
        }
        async.forEachSeries(Object.keys(_plugins), (function(plugin, next) {
            if (this.hasPlugin(plugin)) {
                this.destroyPlugin(_plugins[plugin], options, next);
            } else { //it was removed on prev step
                next();
            }
        }).bind(this), cb);
    };

    this.hasPlugin = function(name) {
        return _plugins.hasOwnProperty(name);
    };

    this.destroyPlugin = function(plugin, options, cb){
        if (typeof options == 'function') {
            cb = options;
            options = {};
        }

        try {
            plugin = this.getPlugin(plugin);
        } catch (e) {
            return cb(e);
        }

        var force = options.force,
            self = this,
            dependents = this.getDependents(plugin);

        if (dependents.length && !force) {
            return cb(new Error('You must destroy dependent modules at first'));
        }

        var removeSelf = function() {
            if (!plugin.__destructor) {
                plugin.__destructor = function(next) {
                    next();
                }
            }
            plugin.__destructor(function(err){
                if (err) return cb(err);

                plugin.provides.forEach(function(service) {
                    delete _services[service];
                });

                delete _plugins[plugin.name];

                self.emit('plugin-destroyed:' + plugin.name, plugin);
                self.emit('plugin-destroyed', plugin.name, plugin);
                return cb();
            });
        };

        return async.forEach(dependents, function(plugin, next) {
            if (!self.hasPlugin(plugin.name)) {
                next();
            } else {
                self.destroyPlugin(plugin, options, next);
            }
        }, function(err) {
            if (err) return cb(err);

            return removeSelf()
        });
    };

    this.destroy = function(cb) {
        this.destroyPlugins({force: true}, (function(err) {
            if (cb) cb(err);

            if (err) {
                this.emit('error', err);
            } else {
                this.emit('destroyed');
                this.removeAllListeners();
            }
        }).bind(this));
    };

    this.getConsumers = function(service) {
        var result = [];
        Object.keys(_plugins).forEach(function(name) {
            var plugin = _plugins[name];
            if (plugin.consumes.indexOf(service) != -1) {
                result.push(plugin);
            }
        });
        return result;
    };

    this.getProvider =  function(service) {
        var plugin;
        for (var key in _plugins) {
            if (_plugins.hasOwnProperty(key)) {
                plugin = _plugins[key];
                if (plugin.provides.indexOf(service) != -1) {
                    return plugin;
                }
            }
        }
        return false;
    };

    function getMissingServices(plugins) {
        var currServices = Object.keys(_services),
            allServices = Array.prototype.concat.apply(currServices.slice(),
                plugins.map(function(plugin) { return plugin.provides; })),
            noServices = [],
            consumes;

        for (var i = 0, l = plugins.length; i < l; i++) {
            consumes = plugins[i].consumes;
            noServices = noServices.concat(consumes.filter(function(service) {
                return allServices.indexOf(service) == -1;
            }));
        }
        return noServices;
    }

    function resolvePlugins(plugins) {
        var l = plugins.length,
            result = [],
            i, plugin, consumes;

        var currServices = Object.keys(_services),
            notExist = function(service){
                return currServices.indexOf(service) == -1;
            };

        while(result.length != l) {
            var cnt = 0;
            for (i = 0; i < plugins.length; i++) {
                plugin = plugins[i];
                if (result.indexOf(plugin) != -1) continue;

                var missing = plugin.consumes.filter(notExist);
                if (missing.length == 0) {
                    currServices = currServices.concat(plugin.provides);
                    result.push(plugin);
                    cnt++;
                }
            }
            if (cnt == 0) {
                throw 'Unable to resolve dependencies of the plugins';
            }
        }
        return result;
    }
}

util.inherits(App, events.EventEmitter);

exports.App = App;

exports.createApp = function(plugins, cb) {
    var app = new App();
    process.nextTick(function() {
        app.setupPlugins(plugins, function(err) {
            if (cb) {
                if (err ) return cb(err);
                return cb(null, app);
            }
        });
    });
    return app;
};
