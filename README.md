# oe-kafka

## Table of Contents
- [Need](#Need)
- [Implementation](#Implementation)
- [Setup](#Setup)
- [Event Format](#Event Format)
- [Configuration](#Configuration)
- [Custom Suffix](#Custom Suffix)

<a name="Need"></a>
## Need
This is a requirement primarily for oeCloud applications that work with Finacle. Finacle uses Kafka for passing events and messages between some of its modules. 
There is thus a need for Finacle-oeCloud apps to also be able to use Kafka as an event queue. 

Specifically, the following requirements are to be met:

1. **Kafka Publisher**: It should be possible for an oeCloud application to publish messages to a Kafka topic whenever a create, update or delete event occurs on application models.
2. **Kafka Subscriber**: It should be possible for an oeCloud application to create, update or delete application model instances whenever appropriate Kafka messages are received. 

<a name="Implementation"></a>
## Implementation
The **oe-kafka** module provides the infrastructure for catering to the above need. It is implemented as an **app-list**
module for **oe-Cloud** based applications. This module further provides a *oeCloud* **mixin** (**KafkaMixin**), a boot script, and a **Model** (**KafkaFailQueue**).


The mixin is named **KafkaMixin** and it provides the *Kafka Publisher* feature.

The boot script in the *oe-kafka* module provides the *Kafka Subscriber* feature.

The two features can work independent of each other but share some [Configuration](#Configuration) options.

### Kafka Publisher

It provides the ability to automatically publish *Create*, *Update* and *Delete* operation data to a configured **Kafka** *topic*. The *topic* is composed of a *prefix* and a *suffix*, concatenated by a period (.). Thus the *topic* is of the form `<PREFIX>.<SUFFIX>`. 


The *prefix* is configurable in the application's **config.json**, while the *suffix* is automatically set to the **Model Name** by default. 
The *suffix* may be overridden at the model level through **KafkaMixin** properties.


The application Models for which this feature applies, is configurable. By default, this feature is turned off for all Models. 
To enable it, the, **KafkaMixin** needs to be explicitly attached to models that need the **Kafka Publisher** feature.


Failure to publish to Kafka Topic results in the event being logged to an error queue Model named **KafkaFailQueue**.


### Kafka Subscriber
It provides the ability to automatically *Create*, *Update* and *Delete* Model instances (data) whenever appropriate messages are received on a configured Kafka topic. 

There are 2 ways to configure the *topic* for this feature - 
1. Have a common topic for receiving Kafka messages - this works for all Models, i.e., any model instance can be created/updated/deleted if the appropriate message is received on this common topic. In this case, the message needs to provide the modelName in `msg.type` field.
2. Have Model-specific topics for receiving Kafka messages. In this case, the message should not specify the modelName. It is taken from the topic-model mapping in the [configuration](#Configuration).

Both the above configurations are done via **config.json**. These [configurations](#Configuration) can both exist simultaneously, in which case, appropriate messages (with/without `msg.type` (see above)) may be sent to either the default topic or the topics specified as part of the topic-model mapping.



<a name="Setup"></a>
## Setup
To get the *Kafka* features, the following changes need to be done in the *oe-Cloud* based application:

1. This (**oe-kafka**) module needs to be added as application  ``package.json`` dependency.
2. The above modules need to be added to the `server/app-list.json` file in the app.


The code snippets below show how steps 1 and 2 can be done:

**package.json**  (only part of the file is shown here, with relevant section in **bold**):
<pre>
...
   ...
   "dependencies": {
       ...
       ...
       ...
       <B>"oe-kafka": "git+http://evgit/oecloud.io/oe-kafka.git#master",</B>
       ...
       ...
</pre>



**server/app-list.json**   (Relevant section in **bold**):
<pre>
[
    {
        "path": "oe-cloud",
        "enabled": true
    },
    <b>{
        "path": "oe-kafka",
        "enabled": true,
        "KafkaMixin": true
    },</b>
	{
		"path" : "oe-workflow",
		"enabled" : true
	},
	{
        "path": "./",
        "enabled": true
    }
]
</pre>

Note the app-list parameter `KafkaMixin: true`. This is required to be set to `true` to enable the `KafkaMixin` from the **oe-kafka** module.

The aplication models that need the **Kafka Publisher** feature should declare the **KafkaMixin** explicitly as shown below, in bold:

**common/models/contact.json**  (Relevant section in **bold**):
<pre>
{
  "name": "Contact",
  "plural": "Contacts",
  "base": "BaseEntity",
  "properties": {
    "FirstName": {
      "type": "string"
    },
       ...
       ...
       ...
  },
  <B>"mixins": {
      "KafkaMixin": true
  }</B>
}
</pre>


<a name="Event Format"></a>
## Event Format

The **oe-kafka** module uses the [CloudEvent v1.0](https://github.com/cloudevents/spec/blob/master/spec.md) specification as the format of data 
that is published to the **Kafka** *topic* by the *oeCloud* based app when using the **Kafka Publisher** feature. This is the same format that is expected by **oe-kafka** when using the **Kafka Subscriber** feature as well.

An example of an event published/subscribed to/from **Kafka** in *CloudEvent* format is as follows:


**Example CloudEvent message**
```js
{
   "specversion":"1.0",                          // required
   "type":"Contact",                             // optional. see above
   "source":"",                                  // optional
   "subject":"",                                 // optional
   "id":"5dee166581edba6f8680ed9f",              // optional
   "time":"2019-12-09T09:39:49.161Z",            // required
   "operation":"CREATE",                         // required
   "datacontenttype":"application/json",         // required  
   "data":"{\"FirstName\":\"Ajith\",\"LastName\":\"Vasudevan\",\"_isDeleted\":false,\"_type\":\"Contact\",\"_createdBy\":\"system\",\"_createdOn\":\"2019-12-09T09:39:49.156Z\",\"_modifiedBy\":\"system\",\"_modifiedOn\":\"2019-12-09T09:39:49.156Z\",\"_version\":\"f636df1f-2231-4232-b022-5dd259cf2077\",\"id\":\"5dee166581edba6f8680ed9f\"}"        // required. Contains actual payload published
}
```



<a name="Configuration"></a>
## Configuration
The *oe-kafka* module features can be configured via the `server/config.json` file. 
The following example shows the structure of the kafka configuration in this file:


**server/config.json** 
<pre>
       ...
       ...
       ...
       
       "kafka": {
       
            "clientOpts": {
            
                "kafkaHost" : "kafka:9092",             // Mandatory
                "connectTimeout" : 10000,
                "requestTimeout" : 30000,
                "autoConnect" : true,
                "connectRetryOptions" :   {             // options of 'retry' npm module (https://www.npmjs.com/package/retry)
                                          retries: 5,
                                          factor: 3,
                                          minTimeout: 1 * 1000,
                                          maxTimeout: 60 * 1000,
                                          randomize: true
                                        },
                "idleConnection" : 5 * 60 * 60,            // 5 min
                "reconnectOnIdle" : true,
                "maxAsyncRequests" : 10,
                "sslOptions" : { rejectUnauthorized: false }, 
                "sasl": { mechanism: 'plain', username: 'foo', password: 'bar' } 

            }, 
            
            "producerOpts": {                       // Optional. No default values are set.
            
                "requireAcks": 1,                   // Optional. No default values are set.
                "ackTimeoutMs": 100,                // Optional. No default values are set.
                "partitionerType": 2                // Optional. No default values are set.
            },
            
            "topicPrefix": "oe-demo-app",          //  Mandatory

            "consumerGroupOpts": {                 // Optional. Some defaults are provided. See below.

                "groupId" : "oe-demo-app-group",   // default: topicPrefix + '-group'
                "autoCommitIntervalMs" : 5000,     // default: 2000
                "commitOffsetsOnFirstJoin" : true, // default: true
                "fromOffset" : true,               // default: true                
            },
          
            "subscriber": {                       // Optional. Absence disables Kafka Subscriber feature

                "disabled": false,                // Optional. Default: false. Setting to true disables Kafka Subscriber feature
                "topicSuffix": "all_models",      // See explanation below
                "mappings": {                     // See explanation below
                    "Customer_Topic": "Customer", 
                    "Customer2_Topic": "Customer2"
                }
            }
       }
       ...
       ...
       ...
</pre>



A minimal config is as follows:
<pre>
       ...
       ...
       ...
       
       "kafka": {
           "clientOpts": { "kafkaHost": "kafka:9092"}, 
           "topicPrefix": "oe-demo-app"
        },
        ...
        ...
        ...
</pre>


Here, the value of `clientOpts` is an object having the same properties as the **KafkaClient** of the npm module [kafka-node](https://www.npmjs.com/package/kafka-node).
Within the `clientOpts` object, only `kafkaHost` is mandatory. `kafkaHost` is of the form `<host>:<port>`. For explanations of the rest of the `clientOpts` parameters, see
the documentation of the [kafka-node](https://www.npmjs.com/package/kafka-node) npm module.



`producerOpts` is an object having the same properties as **Producer** of the npm module [kafka-node](https://www.npmjs.com/package/kafka-node).

`producerOpts` and all properties within it are optional.

`topicPrefix` is used by **oe-kafka** as the prefix of the **Kafka** *topic* to which events are published. It is a mandatory field.

`consumerGroupOpts` is an object having the same properties as **ConsumerGroup** of the npm module [kafka-node](https://www.npmjs.com/package/kafka-node).

`consumerGroupOpts` and all properties within it are optional. `consumerGroupOpts.kafkaHost` is ignored, if provided. `kafkaHost` will be taken from `clientOpts.kafkaHost`

`consumerGroupOpts.groupId` is set by default as `topicPrefix + '-group'`

`subscriber` is an object with the following keys - 

- `disabled` - Optional boolean indicating whether the **Kafka Subscriber** feature is disabled or not. Default is `false` (feature is enabled)
- `topicSuffix` - Optional String used as a *suffix* to arrive at a default topic to receive *Kafka* messages. Any message received on this *topic*, in the [Event Format](#Event Format) will be examined for `msg.value.type` to see if it is a valid model name. If so, the operation specified in `msg.value.operation` would be performed on the model using the data in `msg.value.data`
- `mappings` - Optional Object whose **keys** are *topics* to subscribe to and **values** the name of the Model which needs to be created/updated or deleted
when a suitable message is received on the corresponding **topic**. The expected message format and interpretation is the same as above.


<a name="Custom Suffix"></a>
## Custom suffix
By default, for the **Kafka Publisher** feature, the *topic* suffix is automatically set to the model name. Thus, for a model named **Contact**, the topic is calculated as `<options.topicPrefix>.<Model Name>`
resulting in `oe-demo-app.Contact` as the *topic*

However, the *topic* suffix can be changed on a per Model basis, by specifying the same in the Model Definition's **KafkaMixin** *options*, as follows:

**common/models/contact.json**  (Relevant section in **bold**):
<pre>
{
  "name": "Contact",
  "plural": "Contacts",
  "base": "BaseEntity",
  "properties": {
    "FirstName": {
      "type": "string"
    },
       ...
       ...
       ...
  },
  <B>"mixins": {
      "KafkaMixin": {
          "topicSuffixOverride": "CTCT"
      }
  }</B>
}
</pre>


Here, the topic is calculated as `<options.topicPrefix>.<Model.settings.definition.mixin.KafkaMixin.topicSuffixOverride>`
resulting in `oe-demo-app.CTCT` as the *topic*







