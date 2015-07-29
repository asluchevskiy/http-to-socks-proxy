var url = require('url');
var Socks = require('socks');

var getRandomProxy = function () {
    // todo
    return {
        ipaddress: '127.0.0.1',
        port: 9050,
        type: 5
    };
};

exports.requestListener = function (request, response) {
    console.log(request.url);
    var ph = url.parse(request.url);
    var socksAgent = new Socks.Agent({proxy: getRandomProxy()});
    var options = {
        port: ph.port,
        hostname: ph.hostname,
        method: request.method,
        path: ph.path,
        headers: request.headers,
        agent: socksAgent
    };
    var proxyRequest = http.request(options);
    proxyRequest.on('error', function (err) {
        console.error(err.message);
        response.writeHead(500);
        response.end('Connection error\n');
    });
    proxyRequest.on('response', function (proxyResponse) {
        proxyResponse.on('data', function (chunk) { response.write(chunk, 'binary') });
        proxyResponse.on('end', function () { response.end(); });
        response.writeHead(proxyResponse.statusCode, proxyResponse.headers)
    });
    request.on('data', function (chunk) { proxyRequest.write(chunk, 'binary') });
    request.on('end', function () { proxyRequest.end() })
};

exports.connectListener = function (request, socketRequest, head) {
    console.log(request.url);
    var ph = url.parse('http://' + request.url);
    var options = {
        proxy: getRandomProxy(),
        target: { host: ph.hostname,  port: ph.port },
        command: 'connect'
    };
    Socks.createConnection(options, function (err, socket, info) {
        if(err) {
            // error in SocksSocket creation
            console.error(err.message);
            socketRequest.write("HTTP/" + request.httpVersion + " 500 Connection error\r\n\r\n");
            return;
        }
        // tunneling to the host
        socket.on('data', function (chunk) { socketRequest.write(chunk) });
        socket.on('end', function () { socketRequest.end() });
        socket.on('error', function () {
            // error in transfer
            socketRequest.write("HTTP/" + request.httpVersion + " 500 Connection error\r\n\r\n");
            socketRequest.end();
        });
        // tunneling to the client
        socketRequest.on('data', function (chunk) { socket.write(chunk) });
        socketRequest.on('end', function () { socket.end() });
        socketRequest.on('error', function () { socket.end() });

        socket.write(head);
        socketRequest.write("HTTP/" + request.httpVersion + " 200 Connection established\r\n\r\n");
        socket.resume();
    });
};
