var kafka = require('kafka-node');
var Producer = kafka.Producer;
var Consumer = kafka.Consumer;
var client;
var producer;
var consumer;

module.exports = function client(options) {
  var oeKafkaClient = getClient(options);
  return oeKafkaClient;
};


function getClient(options) {
  var returnVal = { disabled: false };
  if (client === undefined || producer === undefined) {
    client = new kafka.KafkaClient(options.clientOpts);

    client.on('error', function (err) {
      returnVal.disabled = true;
      returnVal.error = err;
      console.error('Error creating Kafka Client:');
      console.error(err);
    });

    client.on('ready', function () {
      returnVal.disabled = false;
      returnVal.error = null;
      console.log('Kafka Client is ready');
    });

    producer = new Producer(client, options.producerOpts || {});
    producer.on('error', function (err) {
      console.error('Producer Error connecting to Kafka Client:');
      console.error(err);
    });
  }


  this.publish = function (topic, payload, modelSettings, cbk) {
    var localClient;
    var localProducer;

    if (modelSettings.mixins && modelSettings.mixins.KafkaMixin && modelSettings.mixins.KafkaMixin.clientOpts) {
      localClient = new kafka.KafkaClient(modelSettings.mixins.KafkaMixin.clientOpts);
      localProducer = new Producer(localClient, modelSettings.mixins.KafkaMixin.producerOpts || {});

      localClient.on('error', function (err) {
        console.log(err);
      });

      localClient.on('ready', function () {

      });

      localProducer.once('error', function (err) {
        cbk({ topic: topic, eventPayload: payload, error: err }, null);
      });

      localProducer.on('error', function (err) {
        console.log(err);
      });

      localProducer.on('ready', function () {
        var produceRequest = {
          topic: topic,
          messages: JSON.stringify(payload),
          key: payload.id.toString(),
          partition: (options.producerOpts && options.producerOpts.partition) || 0,
          attributes: (options.producerOpts && options.producerOpts.attributes) || 0 // 0: No compression, 1: Compress using GZip, 2: Compress using snappy. default: 0
        };

        localProducer.send([produceRequest], function (err, ack) {
          if (!err) cbk(null, { topic: topic, eventPayload: payload });
          else {
            cbk({ topic: topic, eventPayload: payload, error: err }, null);
          }
        });
      });
    } else if (producer.ready === true) {
      var produceRequest = {
        topic: topic,
        messages: JSON.stringify(payload),
        key: (payload.id && payload.id.toString()) || '',
        partition: (options.producerOpts && options.producerOpts.partition) || 0,
        attributes: (options.producerOpts && options.producerOpts.attributes) || 0 // 0: No compression, 1: Compress using GZip, 2: Compress using snappy. default: 0
      };

      producer.send([produceRequest], function (err, ack) {
        if (!err) cbk(null, { topic: topic, eventPayload: payload });
        else {
          cbk({ topic: topic, eventPayload: payload, error: err }, null);
        }
      });
    } else {
      var msg = 'Producer is not ready. Check kafkaHost or wait 5 min before publishing';
      var err = new Error(msg);
      cbk({ topic: topic, eventPayload: payload, error: err }, null);
    }
  };

  this.subscribe = function (payload, cbk) {
    var opts = options.consumerOpts;
    if (!opts) opts = { autoCommit: true, groupId: options.topicPrefix + '-group' };
    if (!opts.groupId) opts.groupId = options.topicPrefix + '-group';
    consumer = new Consumer(client, payload, opts);
    consumer.on('error', function (err) {
      console.log('Error while settting up consumer for kafka: ' + options.clientOpts.kafkaHost + ', topics: ' + JSON.stringify(payload));
      console.log(err);
    });

    consumer.on('message', cbk);
  };

  returnVal.subscribe = this.subscribe;
  returnVal.publish = this.publish;
  returnVal.options = options;
  return returnVal;
}
