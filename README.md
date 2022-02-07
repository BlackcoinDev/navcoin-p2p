
Navcoin P2P SDK
=======

[![NPM Package](https://img.shields.io/npm/v/bitcore-p2p.svg?style=flat-square)](https://www.npmjs.org/package/bitcore-p2p)
[![Build Status](https://img.shields.io/travis/bitpay/bitcore-p2p.svg?branch=master&style=flat-square)](https://travis-ci.org/bitpay/bitcore-p2p)
[![Coverage Status](https://img.shields.io/coveralls/bitpay/bitcore-p2p.svg?style=flat-square)](https://coveralls.io/r/bitpay/bitcore-p2p?branch=master)

`navcoin@bitcore-p2p` adds [Navcoin protocol](https://en.bitcoin.it/wiki/Protocol_documentation) support for Bitcore.

## Getting Started

```sh
npm install navcoin@bitcore-p2p
```
In order to connect to the Navcoin network, you'll need to know the IP address of at least one node of the network, or use [Pool](/docs/pool.md) to discover peers using a DNS seed.

```javascript
var Peer = require('navcoin@bitcore-p2p').Peer;

var peer = new Peer({host: '127.0.0.1'});

peer.on('ready', function() {
  // peer info
  console.log(peer.version, peer.subversion, peer.bestHeight);
});
peer.on('disconnect', function() {
  console.log('connection closed');
});
peer.connect();
```

Then, you can get information from other peers by using:

```javascript
// handle events
peer.on('inv', function(message) {
  // message.inventory[]
});
peer.on('tx', function(message) {
  // message.transaction
});
```

## License

Code released under [the MIT license](https://github.com/bitpay/bitcore/blob/master/LICENSE).

Copyright 2013-2015 BitPay, Inc. Bitcore is a trademark maintained by BitPay, Inc.

Copyright 2022 Navcoin Core
