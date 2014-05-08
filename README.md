pluginator
---

pluginator is a nodejs module for building a plugin based applications.

Usage
---
```javascript
var app = createApp([
    {
        pluginPath: pluginsPath + '/users'
    },
    pluginsPath + '/eventer',
    pluginsPath + '/logger'
], function(err, app) {
    app.getService('users').findByEmail('john@email.com');
});

app.on('plugin', function(name, plugin) {
    console.log(name);
});

app.on('error', function(err) {
    console.log(err);
});

app.once('ready', function() {
    console.log('application is ready');
});
```