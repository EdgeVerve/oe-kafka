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

The boot script in the *oe-kafka* module provides   the **Kafka Subscriber** feature.

The two features can work independent of each other but share some [Configuration](#Configuration) options.

### Kafka Publisher

It provides the ability to automatically publish *Create*, *Update* and *Delete* operation data to a configured **Kafka** *topic*. The *topic* is composed of a
*prefix* and a *suffix*, concatenated by a period (.). Thus the *topic* is of the form `<PREFIX>.<SUFFIX>`. 


The *prefix* is configurable in the application's **config.json**, while the *suffix* is automatically set to the **Model Name** by default. 
The *suffix* may be overridden at the model level through **KafkaMixin** properties.


The application Models for which this feature applies, is configurable. The application may choose to apply the **Kafka Publisher** feature to all models of the 
application, which is the default behavior for all app Models derived from `BaseEntity.`

However, this default can be turned off using the `noBaseEntityAttach` flag in `app-list.json`. 
After this, **KafkaMixin** needs to be explicitly attached to models that need the **Kafka Publisher** feature.


Failure to publish to Kafka Topic results in the event being logged to an error queue Model, namely **KafkaFailQueue**.


### Kafka Subscriber
It provides the ability to automatically *Create*, *Update* and *Delete* Model instances whenever appropriate messages are received on a configured Kafka topic. 

There are 2 ways to configure the *topic* for this feature - 
1. Have a common topic for receiving Kafka messages - this works for all Models, i.e., any model instance can be created/updated/deleted if the appropriate message is received on this common topic.
2. Have Model-specific topics for receiving Kafka messages - this works for only the Models which are specified as part of the topic-model mapping.

Both the above configurations are done via **config.json**. These configurations can both exist simultaneously, in which case, messages may be sent to either the default topic 
or the topics specified as part of the topic-model mapping.



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
        "noBaseEntityAttach": true
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

Note the new app-list parameter `noBaseEntityAttach`. This setting affects the **Kafka Publisher** feature only. 

Setting this to `true` prevents the **KafkaMixin** mixin, hence the **Kafka Publisher** feature from being applied to *BaseEntity* Model, 
and thus preventing this feature from being applied to all BaseEntity-derived Models by default.

In this scenario, the models that need the **Kafka Publisher** feature should declare the **KafkaMixin** explicitly as shown below, in bold:

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
that is published to the **Kafka** *topic* when using the **Kafka Publisher** feature. This is the same format that is expected by **oe-kafka**
when using the **Kafka Subscriber** feature as well.

An example of an event published/subscribed to/from **Kafka** in *CloudEvent* format is as follows:


**Example CloudEvent message**
```js
{
   "specversion":"1.0",
   "type":"Contact",
   "source":"",
   "subject":"",
   "id":"5dee166581edba6f8680ed9f",
   "time":"2019-12-09T09:39:49.161Z",
   "operation":"CREATE",
   "datacontenttype":"application/json",
   "data":"{\"FirstName\":\"Ajith\",\"LastName\":\"Vasudevan\",\"_isDeleted\":false,\"_type\":\"Contact\",\"_createdBy\":\"system\",\"_createdOn\":\"2019-12-09T09:39:49.156Z\",\"_modifiedBy\":\"system\",\"_modifiedOn\":\"2019-12-09T09:39:49.156Z\",\"_version\":\"f636df1f-2231-4232-b022-5dd259cf2077\",\"id\":\"5dee166581edba6f8680ed9f\"}"
}
```



<a name="Configuration"></a>
## Configuration
The *oe-kafka* module features can be configured via the `server/config.json` file. 
The following example shows the minimum parameters required in this file:


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
            
            "producerOpts": {                   // Optional
            
                "requireAcks": 1,
                "ackTimeoutMs": 100,
                "partitionerType": 2
            },
            
            "topicPrefix": "oe-demo-app",       //  Mandatory
           
            "subscriber": {                     // Optional
                "disabled": false,
                "topicSuffix": "all_models",
                "mappings": {
                    "Customer_Topic": "Customer", 
                    "Customer2_Topic": "Customer2"
                }
            }
       }
       ...
       ...
       ...
</pre>

Here, the value of `clientOpts` is an object having the same properties as the **KafkaClient** of the npm module [kafka-node](https://www.npmjs.com/package/kafka-node).
Within the `clientOpts` object, only `kafkaHost` is mandatory. `kafkaHost` is of the form `<host>:<port>`. For explanations of the rest of the `clientOpts` parameters, see
the documentation of the [kafka-node](https://www.npmjs.com/package/kafka-node) npm module.



`producerOpts` is an object having the same properties as the **Producer** of the npm module [kafka-node](https://www.npmjs.com/package/kafka-node).

`producerOpts` and all properties within it are optional.



`topicPrefix` is used by **oe-kafka** as the prefix of the **Kafka** *topic* to which events are published. It is a mandatory field.

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







