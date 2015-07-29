var ProxyServer = require('../lib/proxy-server');
var options = {
    //proxy: '127.0.0.1:9050',
    proxy: null,
    proxyList: './proxy.list',
    proxyListReloadTimeout: 60 // one minute
};
ProxyServer.createServer(options).listen(8080);
