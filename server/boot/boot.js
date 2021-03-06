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
  var topics = [];
  process.nextTick(cb);              // topicSuffix   Model
  if (!options.subscriber) return;
  if (options.subscriber.disabled === true) return;
  mappings = options.subscriber.mappings;   // {'Customer_Topic': 'Customer', 'Customer2_Topic': 'Customer2'}
  if (mappings) {
    topics = Object.keys(mappings).map(function (item) {
      return (topicPrefix + '.' + item);
    });
  }

  if (options.subscriber.topicSuffix) {
    topics.push(topicPrefix + '.' + options.subscriber.topicSuffix);
  }
  /* istanbul ignore if */
  if (topics.length < 1) {
    console.warn('Kafka: No Kafka topics found for subscription.');
    return;
  }
  oeKafkaClient.subscribe(topics, function (msg, consumerGroup) {
    var payload;
    try {
      payload = JSON.parse(msg.value);
    } catch (e) {
      console.log('Error parsing value in Kafka msg: ' + msg.value + ': ' + e + ': msg received: ' + msg);
    }

    /* istanbul ignore if */
    if (!payload) return;
    var topic = msg.topic ? msg.topic.substring(topicPrefix.length + 1) : null;
    if (!topic) return;
    var modelName;
    if (options.subscriber.topicSuffix) {
      if (topic === options.subscriber.topicSuffix) {
        if (payload.type) {
          modelName = payload.type;
        } else {
          console.error('payload received on topic ' + options.subscriber.topicSuffix + ' without type. Payload: ' + JSON.stringify(payload));
        }
      } else {
        modelName = mappings[topic];
      }
    } else {
      modelName = mappings[topic];
    }

    if (modelName) {
      var Model = loopback.findModel(modelName);
      if (Model) {
        var data;
        if (typeof payload.data === 'string') {
          try {
            data = JSON.parse(payload.data);
          } catch (e) {
            console.warn('Could not parse data in payload: ' + payload.data + ' ' + e + ': Payload received: ' + payload);
          }
        } else {
          data = payload.data;
        }
        /* istanbul ignore if */
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
            if (!data.id) {
              console.log('Could not delete instance of ' + modelName + '. Data from Kafka: ' + payload.data + 'id is undefined or null');
            } else {
              Model.remove({ id: data.id }, ctx, function (err, dt) {
                if (err) console.log('Could not delete instance of ' + modelName + '. Data from Kafka: ' + payload.data + ' ' + err.message);
                else console.log('Kafka: Successfully DELETED ' + modelName + ' with id ' + data.id);
              });
            }
          } else {
            console.warn('Kafka: Could not perform invalid operation: ' + payload.operation + ': Payload received: ' + payload);
          }
        } catch (e) {
          console.warn('Kafka: Could not ' + payload.operation + ': Payload received: ' + JSON.stringify(payload) + ': Error: ' + e);
        }
      } else {
        console.warn('Model ' + modelName + ' not found in application' + ': Payload received: ' + JSON.stringify(payload));
      }
    } else {
      console.warn('modelName not found. Topic: ' + msg.topic + ', Payload received: ' + JSON.stringify(payload) + ', mappings: ' + JSON.stringify(mappings));
    }
  });
};
