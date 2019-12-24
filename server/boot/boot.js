var queueClient = require('../../lib/queue');
var oecloud = require('oe-cloud');
var loopback = require('loopback');
var options = oecloud.options.config.kafka;
if (!options || !options.clientOpts || !options.clientOpts.kafkaHost) {
  console.error('FATAL: oe-kafka module is enabled, but config.js(on):kafka.clientOpts.kafkaHost is not specified.');
  process.exit(1);
}
var topicPrefix = options.topicPrefix;
if (!topicPrefix) {
  console.error('FATAL: oe-kafka module is enabled, but config.js(on):kafka.topicPrefix is not specified.');
  process.exit(1);
}

var oeKafkaClient = queueClient(options);
var mappings;

module.exports = function (app, cb) {
  var topicPayload = [];
  process.nextTick(cb);              // topicSuffix   Model
  if (!options.subscriber) return;
  if (options.subscriber.disabled === true) return;
  mappings = options.subscriber.mappings;   // {'Customer_Topic': 'Customer', 'Customer2_Topic': 'Customer2'}
  if (mappings) {
    topicPayload = Object.keys(mappings).map(function (item) {
      return ({ topic: topicPrefix + '.' + item, partition: 0 });
    });
  }

  if (options.subscriber.topicSuffix) {
    topicPayload.push({ topic: topicPrefix + '.' + options.subscriber.topicSuffix, partition: 0 });
  }
  /* istanbul ignore if */
  if (topicPayload.length < 1) {
    console.warn('Kafka: No Kafka topics found for subscription.');
    return;
  }
  oeKafkaClient.subscribe(topicPayload, function (msg) {
    var payload;
    try {
      payload = JSON.parse(msg.value);
    } catch (e) {
      console.log('Error parsing value in Kafka msg: ' + msg.value + ': ' + e.message);
    }

    /* istanbul ignore if */
    if (!payload) return;

    var modelName = payload.type;
    if (modelName) {
      var Model = loopback.findModel(modelName);
      if (Model) {
        var data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) {
            console.warn('Could not parse data in payload: ' + payload.data + ' ' + e);
          }
        } else {
          data = payload.data;
        }
        if (!data) return;
        var ctx = payload.ctx || {};
        ctx.kafkaEvent = true;
        try {
          if (payload.operation === 'CREATE') {
            Model.create(data, ctx, function (err, data) {
              if (err) console.log('Could not create instance of ' + modelName + 'with data from Kafka: ' + payload.data + ' ' + err.message);
              else console.log('Kafka: Successfully CREATED ' + modelName + ' with id ' + data.id);
            });
          } else if (payload.operation === 'UPDATE') {
            Model.upsert(data, ctx, function (err, data) {
              if (err) console.log('Could not update instance of ' + modelName + 'with data from Kafka: ' + payload.data + ' ' + err.message);
              else console.log('Kafka: Successfully UPDATED ' + modelName + ' with id ' + data.id);
            });
          } else if (payload.operation === 'DELETE') {
            Model.remove({ id: data }, ctx, function (err, dt) {
              if (err) console.log('Could not delete instance of ' + modelName + '. Data from Kafka: ' + payload.data + ' ' + err.message);
              else console.log('Kafka: Successfully DELETED ' + modelName + ' with id ' + data);
            });
          }
        } catch (e) {
          console.warn('Could not parse data in payload: ' + payload.data);
        }
      } else {
        console.warn('Model ' + modelName + ' not found in application');
      }
    } else {
      console.warn('modelName not found (payload.type is null or undefined) for topic ' + msg.topic);
    }
  });
};
