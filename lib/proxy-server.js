var util = require('util');
var url = require('url');
var http = require('http');
var dns = require('dns');
var fs = require('fs');
var Socks = require('socks');

Array.prototype.randomElement = function () {
    return this[Math.floor(Math.random() * this.length)]
};

function getProxyObject(host, port, login, password) {
    return {
        ipaddress: host,
        port: parseInt(port),
        type: 5,
        authentication : {username: login || '', password: password || ''}
    };
}

var parseProxyLine = function(line) {
    var proxyInfo =  line.split(':');
    if (proxyInfo.length != 4 && proxyInfo.length != 2) {
        throw new Error('Incorrect proxy line: ' + line);
    }
    return getProxyObject.apply(this, proxyInfo);
};

var dnsCache = {};

function resolve(hostname, callback) {
    if (dnsCache[hostname]) {
        callback(null, dnsCache[hostname]);
    } else {
        dns.resolve(hostname, function(err, res) {
            if (err)
                return callback(err);
            if (!res[0])
                return callback(new Error('no IP address for the hostname'));
            setTimeout(function() {
                delete dnsCache[hostname]
            }, 10*1000);
            dnsCache[hostname] = res[0];
            callback(null, res[0]);
        });
    }
}

function buildRequestListener(getProxyFunction, self) {
    return function (request, response) {
        var proxy = getProxyFunction();
        //console.log(request.url + ' via ' + proxy.ipaddress + ':' + proxy.port);
        var ph = url.parse(request.url);
        resolve(ph.host, function(err, hostname) {
            if (err) {
                console.error('Resolve error for domain ' + ph.hostname + ': ' + err.message);
                response.writeHead(105);
                response.end('Name Not Resolved');
            } else {
                var socksAgent = new Socks.Agent({
                    proxy: proxy,
                    target: {host: hostname, port: ph.port}
                });
                var options = {
                    port: ph.port,
                    hostname: ph.hostname,
                    method: request.method,
                    path: ph.path,
                    headers: request.headers,
                    agent: socksAgent
                };
                var proxyRequest = http.request(options);
                proxyRequest.setTimeout(10000, function() {
                    response.writeHead(504);
                    response.end('Gateway Timeout\n');
                    if (proxyRequest.socket)
                        proxyRequest.socket.end();
                });
                proxyRequest.on('error', function (err) {
                    console.error(err.message + ' on proxy ' + proxy.ipaddress + ':' + proxy.port);
                    response.writeHead(500);
                    response.end('Connection error\n');
                    if (proxyRequest.socket)
                        proxyRequest.socket.end(); // ???
                });
                proxyRequest.on('response', function (proxyResponse) {
                    proxyResponse.on('data', function (chunk) { response.write(chunk, 'binary') });
                    proxyResponse.on('end', function () { response.end(); proxyResponse.socket.end() });
                    response.writeHead(proxyResponse.statusCode, proxyResponse.headers)
                });
                request.on('data', function (chunk) { proxyRequest.write(chunk, 'binary') });
                request.on('end', function () { proxyRequest.end() })
            }
        });
    }
}

function buildConnectListener(getProxyFunction) {
    return function (request, socketRequest, head) {
        var proxy = getProxyFunction();
        //console.log('https://' + request.url + ' via ' + proxy.ipaddress + ':' + proxy.port);
        var ph = url.parse('http://' + request.url);
        resolve(ph.hostname, function (err, hostname) {
            if (err) {
                console.error('Resolve error for domain ' + ph.hostname + ': ' + err.message);
                socketRequest.write('HTTP/' + request.httpVersion + ' 105 Name Not Resolved\r\n\r\n');
                socketRequest.end();
                return;
            }
            var options = {
                proxy: proxy,
                //target: {host: ph.hostname, port: ph.port},
                target: {host: hostname, port: ph.port},
                command: 'connect'
            };
            Socks.createConnection(options, function (err, socket, info) {
                if (err) {
                    // error in SocksSocket creation
                    console.error(err.message + ' connection creating on ' + proxy.ipaddress + ':' + proxy.port);
                    socketRequest.write('HTTP/' + request.httpVersion + ' 500 Connection error\r\n\r\n');
                    return;
                }
                // tunneling to the host
                socket.on('data', function (chunk) { socketRequest.write(chunk) });
                socket.on('end', function () { socketRequest.end() });
                socket.on('error', function (err) {
                    // error in transfer
                    console.error(err.message + ' on proxy ' + proxy.ipaddress + ':' + proxy.port);
                    socketRequest.write('HTTP/' + request.httpVersion + ' 500 Connection error\r\n\r\n');
                    socketRequest.end();
                });
                // tunneling to the client
                socketRequest.on('data', function (chunk) { socket.write(chunk) });
                socketRequest.on('end', function () { socket.end() });
                socketRequest.on('error', function () { socket.end() });

                socket.write(head);
                socketRequest.write('HTTP/' + request.httpVersion + ' 200 Connection established\r\n\r\n');
                socket.resume();
            });
        });
    };
}

function ProxyServer(options) {
    var self = this;
    http.Server.call(self, function() {});

    self.proxyList = [];
    if (options.proxy) {
        // stand alone proxy loging
        self.loadProxy(options.proxy);
    }
    else if (options.proxyList) {
        // proxy list loading
        self.loadProxyFile(options.proxyList);
        if (options.proxyListReloadTimeout) {
            setInterval(function () {
                self.loadProxyFile(options.proxyList)
            }, options.proxyListReloadTimeout * 1000);
        }
    }
    if (!self.proxyList.length) {
        // default proxy using TOR
        self.proxyList.push(getProxyObject('127.0.0.1', 9050));
    }

    self.addListener('request', buildRequestListener(function() {
        return self.proxyList.randomElement()
    }));
    self.addListener('connect', buildConnectListener(function() {
        return self.proxyList.randomElement()
    }));
}

util.inherits(ProxyServer, http.Server);

ProxyServer.prototype.loadProxy = function(proxyLine) {
    try {
        this.proxyList.push(parseProxyLine(proxyLine));
    } catch (ex) {
        console.error(ex.message);
    }
};

ProxyServer.prototype.loadProxyFile = function(fileName) {
    var self = this;
    console.log('Loading proxy list from file: ' + fileName);
    fs.readFile(fileName, function(err, data) {
        if (err) {
            console.error('Impossible to read the proxy file : ' + fileName + ' error : ' + err.message);
            return;
        }
        var lines = data.toString().split('\n');
        var proxyList = [];
        for (var i=0; i < lines.length; i++) {
            if (lines[i] == '' || lines[i].charAt(0) == '#') {
                continue;
            }
            try {
                proxyList.push(parseProxyLine(lines[i]))
            } catch (ex) {
                console.error(ex.message);
            }
        }
        self.proxyList = proxyList;
    });
};

exports.createServer = function(options) {
    return new ProxyServer(options);
};
exports.buildRequestListener = buildRequestListener;
exports.buildConnectListener = buildConnectListener;
exports.getProxyObject = getProxyObject;
exports.parseProxyLine = parseProxyLine;
