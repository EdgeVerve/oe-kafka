var config = require('./config.json');
var minimistOpts = {
    'alias': {
        'kafka-host': 'kafkaHost',
        'kafka-port': 'kafkaPort',
        'kafka-host-port': 'kafkaHostPort'
    }
};
var argv = require('minimist')(process.argv.slice(2), minimistOpts);

var kafkaHost = process.env.KAFKA_HOST || argv.kafkaHost;
var kafkaPort = process.env.KAFKA_PORT || argv.kafkaPort;
var kafkaHostPort = process.env.KAFKA_HOST_PORT || argv.kafkaHostPort;

if (!kafkaHostPort && (kafkaHost && kafkaPort)) {
    kafkaHostPort = kafkaHost + ":" + kafkaPort;
}

if (kafkaHostPort && config.kafka && config.kafka.clientOpts) {
    config.kafka.clientOpts.kafkaHost = kafkaHostPort;
}

module.exports = config;
