var ProxyServer = require('./lib/proxy-server');

module.exports.createServer = ProxyServer.createServer;
module.exports.buildConnectListener = ProxyServer.buildConnectListener;
module.exports.buildRequestListener = ProxyServer.buildRequestListener;
