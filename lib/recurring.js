// lib/recurring.js
// Functionality for recurring tasks
// All recurring tasks are stored in a redis sorted set with their keys of "{{ref}}|{{interval}}" and values of the next processing time

// builtin
var path = require('path');

// vendor
var async = require('async'),
  _ = require('underscore'),
  reval = require('redis-eval');

var recurpull_filename = path.join(__dirname, '/scripts/recurpull.lua');

function RecurringTaskList(relyq, options) {
  this._relyq = relyq;
  options = options || {};
  this._redis = options.redis;
  this._key = options.key || (relyq._prefix + relyq._delimeter + 'recurring');
  this._ended = false;

  this._pollForever(options.polling_interval || 1000);
}

RecurringTaskList.prototype.recur = function(taskref, every, callback) {
  this._redis.zadd(this._key, Date.now(), taskref + '|' + every, callback);
}

RecurringTaskList.prototype.end = function () {
  clearTimeout(this.pollkey);
  this._ended = true;
}

RecurringTaskList.prototype.remove = function (taskref, every, callback) {
  this._redis.zrem(this._key, taskref + '|' + every, callback);
}

RecurringTaskList.prototype._poll = function () {
  var rq = this._relyq;

  reval(this._redis, recurpull_filename, [this._key], [Date.now()], function (err, taskrefs) {
    if (err) {
      rq.emit('error', err);
    }
    async.each(taskrefs, function (ref, cb) {
      async.waterfall([
        _.bind(rq.getclean, rq, ref),
        function(obj, cb) {
          cb(null, obj);
        },
        _.bind(rq.push, rq),
      ], cb);
    }, function (err) {
      if (err) {
        rq.emit('error', err);
      }
    });
  });
}

RecurringTaskList.prototype._pollForever = function(interval) {
  var self = this;

  this.pollkey = this._ended || setTimeout(function () {
    self._poll();
    self._pollForever(interval);
  }, interval);
}

module.exports = RecurringTaskList;