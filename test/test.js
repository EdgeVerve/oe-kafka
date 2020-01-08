/**
 *
 * �2018-2019 EdgeVerve Systems Limited (a fully owned Infosys subsidiary),
 * Bangalore, India. All Rights Reserved.
 *
 */

// Author : Ajith Vasudevan

var oecloud = require('oe-cloud');
var loopback = require('loopback');
var kafka = require('kafka-node');
var ConsumerGroup = kafka.ConsumerGroup;
var Producer = kafka.Producer;
var client;
var consumerGroup;
var producer;
var chalk = require('chalk');
var chai = require('chai');
chai.use(require('chai-things'));
var expect = chai.expect;
var app = oecloud;
var customer;
var customer2;
var inst;
var kafkaOptions = oecloud.options.config.kafka;
var dbType = oecloud.options.dataSources.db.connector;
kafkaOptions.topicPrefix = dbType + '.' + kafkaOptions.topicPrefix
var lsnr;
var afterSave;
var KafkaFailQueue;
var id;

console.log('Creating kafka client for tests');
client = new kafka.KafkaClient(kafkaOptions.clientOpts);
console.log('Creating producer for tests');
producer = new Producer(client, kafkaOptions.producerOpts || {});
producer.on('error', function (err) {
  console.error('Producer Error connecting to Kafka Client:');
  console.error(err);
  process.exit(1);
});
producer.on('ready', function (err) {
  console.log('producer ready for tests');
  var topic1 = { topic: dbType + '.' + 'fin_app.Customer', partitions: 10, replicationFactor: 1 };
  var topic2 = { topic: dbType + '.' + 'fin_app.CUST2', partitions: 10, replicationFactor: 1 };
  var topic3 = { topic: dbType + '.' + 'fin_app.Customer_Topic', partitions: 10, replicationFactor: 1 };
  var topic4 = { topic: dbType + '.' + 'fin_app.Customer2_Topic', partitions: 10, replicationFactor: 1 };
  var topic5 = { topic: dbType + '.' + 'fin_app.all_models', partitions: 10, replicationFactor: 1 };

  producer.createTopics([topic1, topic2, topic3, topic4, topic5], function (err, ack) {
    if(err) {
      console.log(err);
      process.exit(1);
    } else {
      console.log('created test topics');
      var cgOpts = {
        kafkaHost: kafkaOptions.clientOpts.kafkaHost, // connect directly to kafka broker (instantiates a KafkaClient)
        groupId: 'test.' + kafkaOptions.topicPrefix + '-group',
        protocol: ['roundrobin'],
        onRebalance: (isAlreadyMember, callback) => { callback(); } // or null
      };
      var t1 =  dbType + '.' + 'fin_app.Customer';
      var t2 =  dbType + '.' + 'fin_app.CUST2';
      
      consumerGroup = new ConsumerGroup(cgOpts, [t1, t2]);
       

      console.log('booting oeCloud ...');
      oecloud.boot(__dirname, function (err) {
        if (err) {
          console.log(err);
          process.exit(1);
        }
        console.log('...booted oeCloud');
        oecloud.start(function (a, b) {
          console.log(a, b)
        });
        oecloud.emit('test-start');
      });

    }
  });
});



describe(chalk.blue('Kafka Mixin Test'), function (done) {
  this.timeout(120000);
  before('waiting for boot scripts to complete', function (done) {

    app.on('test-start', function () {
      console.log('starting tests ...');

      customer = loopback.findModel("Customer");
      customer2 = loopback.findModel("Customer2");
      customer3 = loopback.findModel("Customer3");
      customer4 = loopback.findModel("Customer4");
      KafkaFailQueue = loopback.findModel("KafkaFailQueue");
      setTimeout(done, 2000);
    });
  });

  after('Tear down', function (done) {
    console.log("Tear down");
    setTimeout(done, 3000);
  });

  afterEach('Cleanup', function (done) {
    if (lsnr) consumerGroup.off('message', lsnr);
    if (afterSave) {
      KafkaFailQueue.evRemoveObserver("after save", afterSave);
      customer.evRemoveObserver("after save", afterSave);
      customer2.evRemoveObserver("after save", afterSave);
    }
    done();
  });



  it('t0 - inserting into model without KafkaMixin configured should neither publish to Kafka nor KafkaFailQueue', function (done) {
    console.log('starting t0 ...');

    var item1 = {
      'name': 'Customer D',
      'age': 80
    };

    lsnr = function lsnr(msg) {

      done(new Error("Shouldn't have published to Kafka"));
    }

    afterSave = function afterSave(ctx, next) {
      next();
      done(new Error("Shouldn't have inserted into KafkaFailQueue"));
    }

    consumerGroup.on('message', lsnr);
    KafkaFailQueue.evObserve('after save', afterSave);

    customer4.create(item1, { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
      setTimeout(done, 3000);
    });
  });


  it('t1 - inserting into model with KafkaMixin configured should publish to Kafka', function (done) {
    console.log('starting t1 ...');

    var item1 = {
      'name': 'Customer A',
      'age': 10
    };

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal(dbType + '.' + 'fin_app.Customer');
      expect(item1.name).to.equal(JSON.parse(JSON.parse(msg.value).data).name);
      expect(item1.age).to.equal(JSON.parse(JSON.parse(msg.value).data).age);
      done();
    }

    consumerGroup.on('message', lsnr);

    customer.create(item1, { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });


  it('t2 - updating model instance using inst.save() should publish to Kafka', function (done) {
    console.log('starting t2 ...');

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal(dbType + '.' + 'fin_app.Customer');
      expect(JSON.parse(JSON.parse(msg.value).data).age).to.equal(15);
      done();
    }

    consumerGroup.on('message', lsnr);

    inst.age = 15;
    inst.save({ ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });

  it('t3 - updating model instance using inst.updateAttributes() should publish to Kafka', function (done) {
    console.log('starting t3 ...');

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal(dbType + '.' + 'fin_app.Customer');
      expect(JSON.parse(JSON.parse(msg.value).data).age).to.equal(17);
      done();
    }

    consumerGroup.on('message', lsnr);

    var item1a = {
      'age': 17
    };

    inst.updateAttributes(item1a, { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });

  it('t4 - updating model instance using inst.updateAttribute() should publish to Kafka', function (done) {
    console.log('starting t4 ...');

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal(dbType + '.' + 'fin_app.Customer');
      expect(JSON.parse(JSON.parse(msg.value).data).name).to.equal("CustomerA1");
      done();
    }

    consumerGroup.on('message', lsnr);

    inst.updateAttribute("name", "CustomerA1", { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });


  it('t5 - deleting model instance should publish to Kafka', function (done) {
    console.log('starting t5 ...');

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal(dbType + '.' + 'fin_app.Customer');
      expect(JSON.parse(JSON.parse(msg.value).data).name).to.equal("CustomerA1");
      expect(JSON.parse(JSON.parse(msg.value).data).age).to.equal(17);
      done();
    }

    consumerGroup.on('message', lsnr);
    inst.delete({ ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });


  it('t6 - inserting into model with topic specified in model definition should publish to the specified topic', function (done) {
    console.log('starting t6 ...');

    var item2 = {
      'name': 'Customer B',
      'age': 20
    };

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal(dbType + '.' + 'fin_app.CUST2');
      expect(item2.name).to.equal(JSON.parse(JSON.parse(msg.value).data).name);
      expect(item2.age).to.equal(JSON.parse(JSON.parse(msg.value).data).age);
      done();
    }

    consumerGroup.on('message', lsnr);

    customer2.create(item2, { ctx: { tenantId: "/default" } }, function (err, r) {

    });
  });


  xit('t7 - failure to publish to Kafka should result in insertion to KafkaFailQueue model', function (done) {
    console.log('starting t7 ...');

    var item1 = {
      'name': 'Customer C',
      'age': 50
    };

    lsnr = function lsnr(msg) {
      done(new Error("Shouldn't have published to Kafka"));
    }

    afterSave = function afterSave(ctx, next) {
      expect(ctx.instance).to.be.defined;
      expect(ctx.instance.topic).to.equal(dbType + '.' + 'fin_app.Customer3');
      expect(ctx.instance.eventPayload).to.be.defined;
      expect(ctx.instance.eventPayload.operation).to.equal("CREATE");
      expect(ctx.instance.eventPayload.type).to.equal("Customer3");
      expect(ctx.instance.eventPayload.data).to.be.defined;
      var a = JSON.parse(ctx.instance.eventPayload.data);
      expect(a.name).to.equal("Customer C");

      next();
      setTimeout(done, 500);
    }

    consumerGroup.on('message', lsnr);
    KafkaFailQueue.evObserve('after save', afterSave);

    customer3.create(item1, { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });

  });


  it('t8 - sending a CREATE message to Kafka should create an instance of a Model', function (done) {
    console.log('starting t8 ...');

    var item1 = {
      'name': 'Test 8',
      'age': 42
    };

    var eventPayload =
    {
      'specversion': '1.0',
      'source': '',
      'subject': '',
      'id': '',
      'time': new Date().toISOString(),
      'operation': 'CREATE',
      'datacontenttype': 'application/json',
      'data': item1
    };


    var produceRequest = {
      topic: dbType + '.' + 'fin_app.Customer_Topic',
      messages: JSON.stringify(eventPayload),
      key: '123',
      partition: 0,
      attributes: 0 // 0: No compression, 1: Compress using GZip, 2: Compress using snappy. default: 0
    };

    afterSave = function afterSave(ctx, next) {
      expect(ctx.instance).to.be.defined;
      expect(ctx.instance.id).to.be.defined;
      id = ctx.instance.id.toString();
      console.log('id', id);
      expect(ctx.isNewInstance).to.be.true;
      expect(ctx.instance.name).to.equal('Test 8');
      expect(ctx.instance.age).to.equal(42);
      next();
      done();
    }

    customer.evObserve('after save', afterSave);

    producer.send([produceRequest], function (err, ack) {
      if (!err) console.log('Sent create message to Kafka Successfully', ack);
      else {
        done(err);
      }
    });

  });


  it('t9 - sending a UPDATE message to Kafka should update an instance of a Model', function (done) {
    console.log('starting t9 ...');

    var item1 = {
      'name': 'Test 9',
      'age': 43,
      'newField': 'someValue',
      'id': id
    };

    var eventPayload =
    {
      'specversion': '1.0',
      'source': '',
      'subject': '',
      'id': id,
      'time': new Date().toISOString(),
      'operation': 'UPDATE',
      'datacontenttype': 'application/json',
      'data': item1
    };


    var produceRequest = {
      topic: dbType + '.' + 'fin_app.Customer_Topic',
      messages: JSON.stringify(eventPayload),
      key: id,
      partition: 0,
      attributes: 0 // 0: No compression, 1: Compress using GZip, 2: Compress using snappy. default: 0
    };

    afterSave = function afterSave(ctx, next) {
      expect(ctx.instance).to.be.defined;
      expect(ctx.instance.id).to.be.defined;
      expect(ctx.instance.id.toString()).to.equal(id);
      expect(ctx.isNewInstance).to.be.false;
      expect(ctx.instance.name).to.equal('Test 9');
      expect(ctx.instance.age).to.equal(43);
      next();
      done();
    }

    customer.evObserve('after save', afterSave);

    producer.send([produceRequest], function (err, ack) {
      if (!err) console.log('Sent update message to Kafka Successfully', ack);
      else {
        done(err);
      }
    });

  });

  it('t10 - sending a DELETE message to Kafka should delete an instance of a Model', function (done) {
    console.log('starting t10 ...');

    var eventPayload =
    {
      'specversion': '1.0',
      'source': '',
      'subject': '',
      'id': id,
      'time': new Date().toISOString(),
      'operation': 'DELETE',
      'datacontenttype': 'text/html',
      'data': {id: id}
    };


    var produceRequest = {
      topic: dbType + '.' + 'fin_app.Customer_Topic',
      messages: JSON.stringify(eventPayload),
      key: id,
      partition: 0,
      attributes: 0 // 0: No compression, 1: Compress using GZip, 2: Compress using snappy. default: 0
    };

    var afterDelete = function afterDelete(ctx, next) {
      expect(ctx.instance).not.to.be.defined;
      expect(ctx.where).to.be.defined;
      expect(ctx.where.id).to.be.defined;
      expect(ctx.where.id.toString()).to.equal(id);
      expect(ctx.info).to.be.defined;
      expect(ctx.info.count).to.equal(1);      
      next();
      done();
    }

    customer.evObserve('after delete', afterDelete);

    producer.send([produceRequest], function (err, ack) {
      if (!err) console.log('Sent delete message to Kafka Successfully', ack);
      else {
        done(err);
      }
    });

  });

  it('t11 - sending another CREATE message to Kafka should create an instance of another Model', function (done) {
    console.log('starting t11 ...');

    var item1 = {
      'name': 'Test 11',
      'age': 44
    };

    var eventPayload =
    {
      'specversion': '1.0',
      'source': '',
      'subject': '',
      'id': '',
      'time': new Date().toISOString(),
      'operation': 'CREATE',
      'datacontenttype': 'application/json',
      'data': item1
    };


    var produceRequest = {
      topic: dbType + '.' + 'fin_app.Customer2_Topic',
      messages: JSON.stringify(eventPayload),
      key: '456',
      partition: 0,
      attributes: 0 // 0: No compression, 1: Compress using GZip, 2: Compress using snappy. default: 0
    };

    afterSave = function afterSave(ctx, next) {
      expect(ctx.instance).to.be.defined;
      expect(ctx.instance.id).to.be.defined;
      id = ctx.instance.id.toString();
      expect(ctx.isNewInstance).to.be.true;
      expect(ctx.instance.name).to.equal('Test 11');
      expect(ctx.instance.age).to.equal(44);
      next();
      done();
    }

    customer2.evObserve('after save', afterSave);

    producer.send([produceRequest], function (err, ack) {
      if (!err) console.log('Sent another create message to Kafka Successfully', ack);
      else {
        done(err);
      }
    });

  });


  it('t12 - sending yet another CREATE message to Kafka common topic should create an instance of another Model', function (done) {
    console.log('starting t11 ...');

    var item1 = {
      'name': 'Test 12',
      'age': 55
    };

    var eventPayload =
    {
      'specversion': '1.0',
      'type': 'Customer2',
      'source': '',
      'subject': '',
      'id': '',
      'time': new Date().toISOString(),
      'operation': 'CREATE',
      'datacontenttype': 'application/json',
      'data': item1
    };


    var produceRequest = {
      topic: dbType + '.' + 'fin_app.all_models',
      messages: JSON.stringify(eventPayload),
      key: '789',
      partition: 0,
      attributes: 0 // 0: No compression, 1: Compress using GZip, 2: Compress using snappy. default: 0
    };

    afterSave = function afterSave(ctx, next) {
      expect(ctx.instance).to.be.defined;
      expect(ctx.instance.id).to.be.defined;
      id = ctx.instance.id.toString();
      expect(ctx.isNewInstance).to.be.true;
      expect(ctx.instance.name).to.equal('Test 12');
      expect(ctx.instance.age).to.equal(55);
      next();
      done();
    }

    customer2.evObserve('after save', afterSave);

    producer.send([produceRequest], function (err, ack) {
      if (!err) console.log('Sent yet another create message to Kafka Successfully', ack);
      else {
        done(err);
      }
    });

  });


});

