'use strict';

var dns = require('dns');
var EventEmitter = require('events').EventEmitter;
var bitcore = require('@aguycalled/bitcore-lib');
var sha256 = bitcore.crypto.Hash.sha256;
var sha256sha256 = bitcore.crypto.Hash.sha256sha256;
var Peer = require('./peer');
var Networks = bitcore.Networks;
var util = require('util');
var crypto = require('crypto');
var net = require('net');
const Messages = require("./messages");
var BufferReader = bitcore.encoding.BufferReader;


function now() {
  return Math.floor(new Date().getTime() / 1000);
}

/**
 * A pool is a collection of Peers. A pool will discover peers from DNS seeds, and
 * collect information about new peers in the network. When a peer disconnects the pool
 * will connect to others that are available to maintain a max number of
 * ongoing peer connections. Peer events are relayed to the pool.
 *
 * @example
 * ```javascript
 *
 * var pool = new Pool({network: Networks.livenet});
 * pool.on('peerinv', function(peer, message) {
 *   // do something with the inventory announcement
 * });
 * pool.connect();
 * ```
 *
 * @param {Object=} options
 * @param {Network=} options.network - The network configuration
 * @param {Boolean=} options.listenAddr - Prevent new peers being added from addr messages
 * @param {Boolean=} options.dnsSeed - Prevent seeding with DNS discovered known peers
 * @param {Boolean=} options.relay - Prevent inventory announcements until a filter is loaded
 * @param {Number=} options.maxSize - The max number of peers
 * @returns {Pool}
 * @constructor
 */
function Pool(options) {
  /* jshint maxcomplexity: 10 */
  /* jshint maxstatements: 20 */

  var self = this;

  options = options || {};
  this.keepalive = false;

  this._connectedPeers = {};
  this._mySessions = [];
  this._candidatesMap = {};
  this._sessionMap = {};
  this._addrs = [];

  this.listenAddr = options.listenAddr !== false;
  this.dnsSeed = options.dnsSeed !== false;
  this.maxSize = options.maxSize || Pool.MaxConnectedPeers;
  this.messages = options.messages;
  this.network = Networks.get(options.network) || Networks.defaultNetwork;
  this.relay = options.relay === false ? false : true;
  this._message = new Messages({network: this.network});

  if (options.addrs) {
    for(var i = 0; i < options.addrs.length; i++) {
      this._addAddr(options.addrs[i]);
    }
  }

  if (this.listenAddr) {
    this.on('peeraddr', function peerAddrEvent(peer, message) {
      var addrs = message.addresses;
      var length = addrs.length;
      for (var i = 0; i < length; i++) {
        var addr = addrs[i];
        var future = new Date().getTime() + (10 * 60 * 1000);
        if (addr.time.getTime() <= 100000000000 || addr.time.getTime() > future) {
          // In case of an invalid time, assume "5 days ago"
          var past = new Date(new Date().getTime() - 5 * 24 * 60 * 60 * 1000);
          addr.time = past;
        }
        this._addAddr(addr);
      }
    });
  }

  this.on('seed', function seedEvent(ips) {
    ips.forEach(function(ip) {
      self._addAddr({
        ip: {
          v4: ip
        }
      });
    });
    if (self.keepalive) {
      self._fillConnections();
    }
  });

  this.on('peerdisconnect', function peerDisconnectEvent(peer, addr) {
    self._deprioritizeAddr(addr);
    self._removeConnectedPeer(addr);
    if (self.keepalive) {
      self._fillConnections();
    }
  });

  this.on('peergetdata', function peerGetData(peer, inv) {
    for (let el of inv.inventory) {
      if (el.type == 6) {
        let lookUp = this._mySessions.filter((e) => e.id.toString('hex') == el.hash.toString('hex'));
        if (lookUp.length > 0 && lookUp[0].session) {
          peer.sendMessage(lookUp[0].session);
        }
      }
    }
  })

  this.on('peerinv', function peerGetData(peer, inv) {
    for (let el of inv.inventory) {
      if (el.type == 3) {
        if (this._candidatesMap[el.hash] === undefined) {
          var message = this._message.GetData.forDandelionEncCand(el.hash);
          peer.sendMessage(message);
        }
      }
      if (el.type == 5) {
        if (this._sessionMap[el.hash] === undefined) {
          var message = this._message.GetData.forDandelionAggSession(el.hash);
          peer.sendMessage(message);
        }
      }
      if (el.type == 4) {
        if (this._candidatesMap[el.hash] === undefined) {
          var message = this._message.GetData.forEncCand(el.hash);
          peer.sendMessage(message);
        }
      }
      if (el.type == 6) {
        if (this._sessionMap[el.hash] === undefined) {
          var message = this._message.GetData.forAggSession(el.hash);
          peer.sendMessage(message);
        }
      }
    }
  })

  this.on('peeraggsess', function peerAggSess(peer, ses) {
    this.processSession(ses);
  })

  this.on('peerdaggsess', function peerAggSess(peer, ses) {
    this.processSession(ses);
  })

  this.on('peerenccand', function peerEncCand(peer, enccand) {
    this.processCandidate(enccand);
  })

  this.on('peerdanenccand', function peerEncCand(peer, enccand) {
    this.processCandidate(enccand);
  })

  return this;
}

util.inherits(Pool, EventEmitter);

Pool.MaxConnectedPeers = 8;
Pool.RetrySeconds = 30;
Pool.PeerEvents = ['version', 'inv', 'getdata', 'ping', 'pong', 'addr',
  'getaddr', 'verack', 'reject', 'alert', 'headers', 'block', 'merkleblock',
  'tx', 'getblocks', 'getheaders', 'error', 'filterload', 'filteradd',
  'filterclear', 'aggsess', 'daggsess', 'enccand', 'danenccand'
];

Pool.prototype.processSession = function (session) {
  let receivedHash = sha256sha256(session.getPayload());
  this._sessionMap[receivedHash] = now()+120;

  for (let cand in this._sessionMap) {
    if (this._sessionMap[cand] < now()) {
      delete this._sessionMap[cand];
    }
  }

  this.emit('session', session);
}

Pool.prototype.processCandidate = function (enccand) {
  let receivedHash = sha256sha256(enccand.getPayload());
  this._candidatesMap[receivedHash] = now()+120;

  for (let cand in this._candidatesMap) {
    if (this._candidatesMap[cand] < now()) {
      delete this._candidatesMap[cand];
    }
  }

  let lookUp = this._mySessions.filter((e) => e.session.id.toString('hex') == enccand.sessionId.toString('hex'));

  if (lookUp.length > 0)
  {
    let pubK = new bitcore.crypto.Blsct.mcl.G1();
    pubK.deserialize(enccand.pk);
    let sharedSecret = sha256sha256(Buffer.concat([Buffer.from([48]), new Buffer(bitcore.crypto.Blsct.mcl.mul(pubK, lookUp[0].pk).serialize())]))
    let IV = sha256sha256(Buffer.concat([Buffer.from([48]), lookUp[0].version == 2 ? enccand.pk : enccand.sessionId])).slice(0,16);

    let decipher = crypto.createDecipheriv('aes-256-cbc', sharedSecret, IV);
    let decrypted = Buffer.concat([decipher.update(enccand.vData), decipher.final()]);

    if (lookUp[0].version == 2) {
      var parser = new BufferReader(decrypted);

      let candidate = {};
      candidate.sig = parser.read(97);
      let tx = new bitcore.Transaction();
      candidate.tx = tx.fromBufferReader(parser);
      candidate.fee = parser.readUInt64LEBN();
      candidate.minAmount = parser.readUInt64LEBN();
      candidate.bp = bitcore.crypto.Blsct.DeserializeProof(parser);
      this.emit("candidate", enccand.sessionId.toString('hex'), candidate);
    } else if (lookUp[0].version == 3) {
      this.emit("candidate", enccand.sessionId.toString('hex'), JSON.parse(decrypted.toString('utf-8').substr(decrypted.indexOf('{'))));
    }
  }
}

/**
 * Will initiate connection to peers, if available peers have been added to
 * the pool, it will connect to those, otherwise will use DNS seeds to find
 * peers to connect. When a peer disconnects it will add another.
 */
Pool.prototype.connect = async function connect() {
  await bitcore.Transaction.Blsct.Init();
  this.keepalive = true;
  var self = this;
  if (this.dnsSeed) {
    self._addAddrsFromSeeds();
  } else {
    self._fillConnections();
  }
  return this;
};

/**
 * Will disconnect all peers that are connected.
 */
Pool.prototype.disconnect = function disconnect() {
  this.keepalive = false;
  for (var i in this._connectedPeers) {
    this._connectedPeers[i].disconnect();
  }
  return this;
};

/**
 * @returns {Number} The number of peers currently connected.
 */
Pool.prototype.numberConnected = function numberConnected() {
  return Object.keys(this._connectedPeers).length;
};

/**
 * Will fill the connected peers to the maximum amount.
 */
Pool.prototype._fillConnections = function _fillConnections() {
  var length = this._addrs.length;

  for (var i = 0; i < length; i++) {
    if (this.numberConnected() >= this.maxSize) {
      break;
    }
    var addr = this._addrs[i];
    if (!addr.retryTime || now() > addr.retryTime) {
      this._connectPeer(addr);
    }
  }

  let self = this;

  if (this.numberConnected() == 0) {
    setTimeout(() => {
      self._fillConnections();
    }, 60*1000);
  }

  return this;
};

/**
 * Will remove a peer from the list of connected peers.
 * @param {Object} addr - An addr from the list of addrs
 */
Pool.prototype._removeConnectedPeer = function _removeConnectedPeer(addr) {
  if (this._connectedPeers[addr.hash].status !== Peer.STATUS.DISCONNECTED) {
    this._connectedPeers[addr.hash].disconnect();
  } else {
    delete this._connectedPeers[addr.hash];
  }
  return this;
};

/**
 * Will connect a peer and add to the list of connected peers.
 * @param {Object} addr - An addr from the list of addrs
 */
Pool.prototype._connectPeer = function _connectPeer(addr) {
  var self = this;

  if (!this._connectedPeers[addr.hash]) {
    var port = addr.port || self.network.port;
    var ip = addr.ip.v4 || addr.ip.v6;
    var peer = new Peer({
      host: ip,
      port: port,
      messages: self.messages,
      network: this.network,
      relay: self.relay
    });

    peer.on('connect', function peerConnect() {
      self.emit('peerconnect', peer, addr);
    });

    self._addPeerEventHandlers(peer, addr);
    peer.connect();
    self._connectedPeers[addr.hash] = peer;
  }

  return this;
};

/**
 * Adds a peer with a connected socket to the _connectedPeers object, and
 * initializes the associated event handlers.
 * @param {Socket} - socket - A new connected socket
 * @param {Object} - addr - The associated addr object for the peer
 */
Pool.prototype._addConnectedPeer = function _addConnectedPeer(socket, addr) {
  var self = this;

  if (!this._connectedPeers[addr.hash]) {
    var peer = new Peer({
      socket: socket,
      network: this.network,
      messages: self.messages
    });

    self._addPeerEventHandlers(peer, addr);
    self._connectedPeers[addr.hash] = peer;
    self.emit('peerconnect', peer, addr);
  }

  return this;
};

/**
 * Will add disconnect and ready events for a peer and intialize
 * handlers for relay peer message events.
 */
Pool.prototype._addPeerEventHandlers = function(peer, addr) {
  var self = this;

  peer.on('disconnect', function peerDisconnect() {
    self.emit('peerdisconnect', peer, addr);
  });
  peer.on('ready', function peerReady() {
    self.emit('peerready', peer, addr);
    let message = self._message.Inventory.forDandelionTransaction("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    peer.sendMessage(message);

    for(var key in self._mySessions) {
      var session = self._mySessions[key];
      let inv = self._message.Inventory.forAggSession(session.id);
      peer.sendMessage(inv);
    }
  });
  Pool.PeerEvents.forEach(function addPeerEvents(event) {
    peer.on(event, function peerEvent(message) {
      self.emit('peer' + event, peer, message);
    });
  });
};

/**
 * Will deprioritize an addr in the list of addrs by moving it to the end
 * of the array, and setting a retryTime
 * @param {Object} addr - An addr from the list of addrs
 */
Pool.prototype._deprioritizeAddr = function _deprioritizeAddr(addr) {
  for (var i = 0; i < this._addrs.length; i++) {
    if (this._addrs[i].hash === addr.hash) {
      var middle = this._addrs[i];
      middle.retryTime = now() + Pool.RetrySeconds;
      var beginning = this._addrs.splice(0, i);
      var end = this._addrs.splice(i + 1, this._addrs.length);
      var combined = beginning.concat(end);
      this._addrs = combined.concat([middle]);
    }
  }
  return this;
};

/**
 * Will add an addr to the beginning of the addrs array
 * @param {Object}
 */
Pool.prototype._addAddr = function _addAddr(addr) {
  // Use default port if not specified
  addr.port = addr.port || this.network.port;

  // make a unique key
  addr.hash = sha256(new Buffer(addr.ip.v6 + addr.ip.v4 + addr.port)).toString('hex');

  var length = this._addrs.length;
  var exists = false;
  for (var i = 0; i < length; i++) {
    if (this._addrs[i].hash === addr.hash) {
      exists = true;
    }
  }
  if (!exists) {
    this._addrs.unshift(addr);
  }
  return addr;
};

/**
 * Will add addrs to the list of addrs from a DNS seed
 * @param {String} seed - A domain name to resolve known peers
 * @param {Function} done
 */
Pool.prototype._addAddrsFromSeed = function _addAddrsFromSeed(seed) {
  var self = this;
  dns.resolve(seed, function(err, ips) {
    if (err) {
      self.emit('seederror', err);
      return;
    }
    if (!ips || !ips.length) {
      self.emit('seederror', new Error('No IPs found from seed lookup.'));
      return;
    }
    // announce to pool
    self.emit('seed', ips);
  });
  return this;
};

/**
 * Will add addrs to the list of addrs from network DNS seeds
 * @param {Function} done
 */
Pool.prototype._addAddrsFromSeeds = function _addAddrsFromSeeds() {
  var self = this;
  var seeds = this.network.dnsSeeds;
  seeds.forEach(function(seed) {
    self._addAddrsFromSeed(seed);
  });
  return this;
};

/**
 * @returns {String} A string formatted for the console
 */
Pool.prototype.inspect = function inspect() {
  return '<Pool network: ' +
    this.network + ', connected: ' +
    this.numberConnected() + ', available: ' +
    this._addrs.length + '>';
};

/**
 * Will send a message to all of the peers in the pool.
 * @param {Message} message - An instance of the message to send
 */
Pool.prototype.sendMessage = function(message) {
  // broadcast to peers
  for(var key in this._connectedPeers) {
    var peer = this._connectedPeers[key];
    peer.sendMessage(message);
  }
};

/**
 * Will enable a listener for peer connections, when a peer connects
 * it will be added to the pool.
 */
Pool.prototype.listen = function() {
  var self = this;

  // Create server
  this.server = net.createServer(function(socket) {
    var addr = {
      ip: {}
    };
    if(net.isIPv6(socket.remoteAddress)) {
      addr.ip.v6 = socket.remoteAddress;
    } else {
      addr.ip.v4 = socket.remoteAddress;
    }
    addr.port = socket.remotePort;

    addr = self._addAddr(addr);
    self._addConnectedPeer(socket, addr);
  });
  this.server.listen(this.network.port);
};

Pool.prototype.startSession = function(vData = undefined) {
  var self = this;

  let version = vData ? 3 : 2;

  let privK = bitcore.Transaction.Blsct.GenKey();
  let session = {version: version, id: new Buffer(bitcore.Transaction.Blsct.SkToPubKey(privK).serialize())};
  if (vData) {
    session.vData = vData;
  }
  let message = this._message.AggSess(session);

  let hashSession = sha256sha256(message.getPayload());

  this._mySessions.push({id: hashSession, version: version, session: message, timestamp: parseInt(new Date() / 1000)+120, pk: privK});
  this._mySessions = this._mySessions.filter((el) => el.timestamp > parseInt(new Date() / 1000));

  let inv = this._message.Inventory.forAggSession(hashSession);

  for(var key in this._connectedPeers) {
    var peer = this._connectedPeers[key];
    peer.sendMessage(inv);
  }

  return hashSession.toString('hex');
}

module.exports = Pool;
