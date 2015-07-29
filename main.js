var http = require('http');
var ProxyServer = require('./lib/proxy-server');

var options = {}; //todo
ProxyServer.createServer(options).listen(8080);
