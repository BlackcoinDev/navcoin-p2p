'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('@aguycalled/bitcore-lib');
var BufferUtil = bitcore.util.buffer;

/**
 * A message in response to a version message.
 * @extends Message
 * @constructor
 */
function SendHeadersMessage(arg, options) {
  Message.call(this, options);
  this.command = 'sendheaders';
}
inherits(SendHeadersMessage, Message);

SendHeadersMessage.prototype.setPayload = function() {};

SendHeadersMessage.prototype.getPayload = function() {
  return BufferUtil.EMPTY_BUFFER;
};

module.exports = SendHeadersMessage;
