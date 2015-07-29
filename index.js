var ProxyServer = require('./lib/proxy-server');

module.exports.createServer = ProxyServer.createServer;
module.exports.buildConnectListener = ProxyServer.buildConnectListener;
module.exports.buildRequestListener = ProxyServer.buildRequestListener;
module.exports.getProxyObject = ProxyServer.getProxyObject;
module.exports.parseProxyLine = ProxyServer.parseProxyLine;
