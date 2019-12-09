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
var Consumer = kafka.Consumer;
var client;
var consumer;
oecloud.observe('loaded', function (ctx, next) {
  return next();
})


oecloud.boot(__dirname, function (err) {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  oecloud.start(function (a, b) {
    console.log(a, b)
  });
  oecloud.emit('test-start');
});

var chalk = require('chalk');
var chai = require('chai');
chai.use(require('chai-things'));

var expect = chai.expect;

var app = oecloud;
var customer;
var customer2;
var inst;
var kafkaOptions = oecloud.options.config.kafka;
var consumer;
var lsnr;
var afterSave;
var KafkaFailQueue;

describe(chalk.blue('Kafka Mixin Test'), function (done) {
  this.timeout(6000);
  before('waiting for boot scripts to complete', function (done) {

    app.on('test-start', function () {
      customer = loopback.findModel("Customer");
      customer2 = loopback.findModel("Customer2");
      customer3 = loopback.findModel("Customer3");
      customer4 = loopback.findModel("Customer4");
      KafkaFailQueue = loopback.findModel("KafkaFailQueue");
      console.log('Creating kafka client for tests');
      client = new kafka.KafkaClient(kafkaOptions.clientOpts);

      consumer = new Consumer(
        client,
        [
          { topic: "fin_app.Customer", partition: 0 },
          { topic: "fin_app.CUST2", partition: 0 }
        ],
        {
          autoCommit: true
        }
      );
      consumer.on('error', function (err) {
        console.log(err);
        done(err);
      });

      setTimeout(done, 2000);
    });
  });

  after('Tear down', function (done) {
    console.log("Tear down");
    done();
  });

  afterEach('Cleanup', function (done) {
    if(lsnr) consumer.off('message', lsnr);
    if(afterSave) KafkaFailQueue.evRemoveObserver("after save", afterSave);
    done();
  });



  it('t0 - inserting into model without KafkaMixin configured should neither publish to Kafka nor KafkaFailQueue', function (done) {

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

    consumer.on('message', lsnr);
    KafkaFailQueue.evObserve('after save', afterSave);

    customer4.create(item1, { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
      setTimeout(done, 3000);
    });
  });


  it('t1 - inserting into model with KafkaMixin configured should publish to Kafka', function (done) {

    var item1 = {
      'name': 'Customer A',
      'age': 10
    };

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal("fin_app.Customer");
      expect(item1.name).to.equal(JSON.parse(JSON.parse(msg.value).data).name);
      expect(item1.age).to.equal(JSON.parse(JSON.parse(msg.value).data).age);
      done();
    }

    consumer.on('message', lsnr);

    customer.create(item1, { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });


  it('t2 - updating model instance using inst.save() should publish to Kafka', function (done) {

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal("fin_app.Customer");
      expect(JSON.parse(JSON.parse(msg.value).data).age).to.equal(15);
      done();
    }

    consumer.on('message', lsnr);

    inst.age = 15;
    inst.save({ ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });

  it('t3 - updating model instance using inst.updateAttributes() should publish to Kafka', function (done) {

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal("fin_app.Customer");
      expect(JSON.parse(JSON.parse(msg.value).data).age).to.equal(17);
      done();
    }

    consumer.on('message', lsnr);

    var item1a = {
      'age': 17
    };

    inst.updateAttributes(item1a, { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });

  it('t4 - updating model instance using inst.updateAttribute() should publish to Kafka', function (done) {

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal("fin_app.Customer");
      expect(JSON.parse(JSON.parse(msg.value).data).name).to.equal("CustomerA1");
      done();
    }

    consumer.on('message', lsnr);

    inst.updateAttribute("name", "CustomerA1", { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });


  it('t5 - deleting model instance should publish to Kafka', function (done) {

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal("fin_app.Customer");
      expect(JSON.parse(JSON.parse(msg.value).data).name).to.equal("CustomerA1");
      expect(JSON.parse(JSON.parse(msg.value).data).age).to.equal(17);
      done();
    }

    consumer.on('message', lsnr);
    inst.delete({ ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });
  });


  it('t6 - inserting into model with topic specified in model definition should publish to the specified topic', function (done) {

    var item2 = {
      'name': 'Customer B',
      'age': 20
    };

    lsnr = function lsnr(msg) {
      expect(msg.topic).to.equal("fin_app.CUST2");
      expect(item2.name).to.equal(JSON.parse(JSON.parse(msg.value).data).name);
      expect(item2.age).to.equal(JSON.parse(JSON.parse(msg.value).data).age);
      done();
    }

    consumer.on('message', lsnr);

    customer2.create(item2, { ctx: { tenantId: "/default" } }, function (err, r) {

    });
  });


  it('t7 - failure to publish to Kafka should result in insertion to KafkaFailQueue model', function (done) {
    var item1 = {
      'name': 'Customer C',
      'age': 50
    };

    lsnr = function lsnr(msg) {
      done(new Error("Shouldn't have published to Kafka"));
    }

    afterSave = function afterSave(ctx, next) {
      expect(ctx.instance).to.be.defined;
      expect(ctx.instance.topic).to.equal("fin_app.Customer3");
      expect(ctx.instance.eventPayload).to.be.defined;
      expect(ctx.instance.eventPayload.operation).to.equal("CREATE");
      expect(ctx.instance.eventPayload.type).to.equal("Customer3");
      expect(ctx.instance.eventPayload.data).to.be.defined;
      var a = JSON.parse(ctx.instance.eventPayload.data);
      expect(a.name).to.equal("Customer C");
      
      next();
      setTimeout(done, 500);
    }

    consumer.on('message', lsnr);
    KafkaFailQueue.evObserve('after save', afterSave);

    customer3.create(item1, { ctx: { tenantId: "/default" } }, function (err, r) {
      inst = r;
    });

  });

});

