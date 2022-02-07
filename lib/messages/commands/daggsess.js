'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('@aguycalled/bitcore-lib');
var utils = require('../utils');
var sha256sha256 = bitcore.crypto.Hash.sha256sha256;
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;

/**
 * A message to confirm that a connection is still valid.
 * @param {Number} arg - A nonce for the Ping message
 * @param {Object=} options
 * @extends Message
 * @constructor
 */
function DAggSess(arg, options) {
  Message.call(this, options);
  this.command = 'daggsess';
  if (!arg) {
    arg = {};
  }
  this.version = arg.version || 0;
  this.id = arg.id || new Buffer(0);
  this.vData = arg.vData || new Buffer(0);
}
inherits(DAggSess, Message);

DAggSess.prototype.setPayload = function(payload) {
  var parser = new BufferReader(payload);
  this.version = parser.readUInt32LE();

  if (this.version == 1 || this.version == 2)
  {
    this.id = parser.readVarLengthBuffer();
  } else if (this.version == 3)
  {
    this.id = parser.readVarLengthBuffer();
    this.vData = parser.readVarLengthBuffer();
  }

  utils.checkFinished(parser);

  this.hash = sha256sha256(this.getPayload());
};

DAggSess.prototype.getPayload = function() {
  var bw = new BufferWriter();
  bw.writeInt32LE(this.version);
  if (this.version == 1 || this.version == 2)
  {
    bw.writeVarintNum(this.id.length);
    bw.write(this.id);
  } else if (this.version == 3)
  {
    bw.writeVarintNum(this.id.length);
    bw.write(this.id);
    bw.writeVarintNum(this.vData.length);
    bw.write(this.vData);
  }
  return bw.concat();
};

module.exports = DAggSess;
