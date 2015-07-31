var fs = require('fs');
var async = require('async');
var ProxyServer = require('../lib/proxy-server');

var options = {
    proxyList: './proxy.list',
    resultProxyList: './http-proxy.list',
    listen: '127.0.0.1',
    startPort: 10000
};

var port = options.startPort;
var lines = fs.readFileSync(options.proxyList).toString().split('\n');
var result = [];

async.forEach(lines, function (line, callback) {
    if (line == '' || line.charAt(0) == '#')
        return callback();
    ProxyServer.createServer({proxy: line})
        .on('error', function (err) {
            console.error(err);
            if (err.code == 'EADDRINUSE') {
                // rerun?
            }
            callback();
        })
        .listen(port, options.listen, function () {
            var ipport = this.address().address + ':' + this.address().port;
            result.push(ipport);
            console.log('runned at ' + ipport);
            callback();
        });
    port += 1;
}, function () {
    fs.writeFileSync(options.resultProxyList, result.join('\n'));
});
