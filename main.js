var http = require('http');
var ProxyServer = require('./lib/proxy-server');

// todo: create ProxyServer class based on http.Server

http.createServer(ProxyServer.requestListener)
    .on('connect', ProxyServer.connectListener)
    .listen(8080);
