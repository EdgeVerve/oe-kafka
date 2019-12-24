/**
 *
 * 2018-2019 EdgeVerve Systems Limited (a fully owned Infosys subsidiary),
 * Bangalore, India. All Rights Reserved.
 *
 */

// Author : Ajith Vasudevan

var queueClient = require('../../lib/queue');
var oecloud = require('oe-cloud');
var loopback = require('loopback');
var options = oecloud.options.config.kafka;
var oeKafkaClient;
if (!options || !options.clientOpts || !options.clientOpts.kafkaHost) {
  console.error('FATAL: oe-kafka module is enabled, but config.js(on):kafka.clientOpts.kafkaHost is not specified.');
  process.exit(1);
}
var topicPrefix = options.topicPrefix;
if (!topicPrefix) {
  console.error('FATAL: oe-kafka module is enabled, but config.js(on):kafka.topicPrefix is not specified.');
  process.exit(1);
}

oeKafkaClient = queueClient(options);

module.exports = function (Model) {
  Model.evObserve('after save', after);
  Model.evObserve('after delete', after);
};

function after(ctx, next) {
  if (ctx && ctx.options && ctx.options.kafkaEvent === true) {
    return next();
  }
  const modelSettings = ctx.Model.definition.settings;

  if (!modelSettings.mixins || !modelSettings.mixins.KafkaMixin || modelSettings.mixins.KafkaMixin === false) return next();

  var modelTopicSuffixOverride = modelSettings.mixins.KafkaMixin.topicSuffixOverride;

  var topicSuffix = modelTopicSuffixOverride || ctx.Model.modelName;

  var topic = topicPrefix + '.' + topicSuffix;

  var data = (ctx.instance && ctx.instance.__data) || ctx.data;
  var id = (ctx.instance && ctx.instance.id) || (data && data.id);
  var op = '';
  if (!id) {
    id = (ctx.where && ctx.where.and && ctx.where.and.length > 0 && ctx.where.and[0].and && ctx.where.and[0].and.length > 0 && ctx.where.and[0].and[0].and && ctx.where.and[0].and[0].and.length > 0 && ctx.where.and[0].and[0].and[0].id && ctx.where.and[0].and[0].and[0].id.toString());
    if (id) {
      op = 'DELETE';
    }
  }


  var eventPayload =
  {
    'specversion': '1.0',
    'type': ctx.Model.modelName,
    'source': '',
    'subject': '',
    'id': id,
    'time': new Date().toISOString(),
    'operation': op,
    'datacontenttype': 'application/json',
    'data': JSON.stringify(data)
  };


  if (ctx.instance && (ctx.isNewInstance === true)) {                            // check for insert
    eventPayload.operation = 'CREATE';
  } else if (ctx.instance && (ctx.isNewInstance === false)) {                    // check for update
    eventPayload.operation = 'UPDATE';
  } else if ((ctx.isNewInstance === undefined) && ctx.where && ctx.where.id) {   // check for delete
    eventPayload.operation = 'DELETE';
  }

  if (oeKafkaClient.disabled === true) {
    console.log(oeKafkaClient.error);
    var KafkaFailQueue = loopback.findModel('KafkaFailQueue');
    KafkaFailQueue.create({ topic: topic, eventPayload: eventPayload, kafkaError: { message: oeKafkaClient.error.message } }, {}, function (e1, d1) {
      if (e1) console.log(e1);
    });
  } else {
    oeKafkaClient.publish(topic, eventPayload, modelSettings, function (e, d) {
      if (e) {
        console.error('Error while publishing to Kafka:', e.error && e.error.message);
        console.warn('Logging to KafkaFailQueue model');
        var KafkaFailQueue = loopback.findModel('KafkaFailQueue');
        KafkaFailQueue.create({ topic: e.topic, eventPayload: e.eventPayload, kafkaError: { message: e.error.message } }, {}, function (e1, d1) {
          if (e1) console.log(e1);
        });
      }
    });
  }

  return next();
}
