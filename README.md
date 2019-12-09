# oe-kafka

## Table of Contents
- [Need](#Need)
- [Implementation](#Implementation)
- [Features](#Features)
- [Setup](#Setup)
- [Event Format](#Event Format)
- [Configuration](#Configuration)


<a name="Need"></a>
## Need
This is a requirement primarily for oeCloud applications that work with Finacle. Finacle uses Kafka for passing events and messages between some of its modules. 
There is thus a need for Finacle-oeCloud apps to also be able to use Kafka as an event queue. 


<a name="Implementation"></a>
## Implementation
The **oe-kafka** module provides the infrastructure for catering to the above need. It is implemented as an **app-list**
module for **oe-Cloud** based applications. This module further provides a *oeCloud* **mixin** (**KafkaMixin**) and a **Model** (**KafkaFailQueue**).

It provides the ability to automatically publish *Create*, *Update* and *Delete* operation data to a configured **Kafka** *topic*. The *topic* is composed of a
prefix and a suffix, concatenated by a period (.). Thus the *topic* is of the form `<PREFIX>.<SUFFIX>`

The application Models for which this feature applies, is configurable.

Failure to publish to Kafka Topic results in the event being logged to an error queue Model, namely **KafkaFailQueue**.



<a name="Features"></a>
## Features
The *oe-kafka* module has the following features -

1. Able to publish Crate, Update and Delete operation data automatically
2. Configurable Kafka topic
3. Global topic prefix configuration
4. Automatic topic suffix - defaults to Model Name.
5. Topic suffix override possible via Model Definition mixin properties
6. Logging to Failure queue (Model) in case Kafka publish fails 


<a name="Setup"></a>
## Setup
To get the *Kafka* feature, the following changes need to be done in the *oe-Cloud* based application:

1. This (**oe-job-scheduler**) module needs to be added as application  ``package.json`` dependency.
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

Note the new app-list parameter `noBaseEntityAttach`. Setting this to `true` prevents this mixin from being applied to *BaseEntity* Model, 
and thus preventing it being applied to all derived Models by default.

In this scenario, the models that need the Kafka feature should declare the KafkaMixin explicitly as shown below, in bold:

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
that is published to the **Kafka** *topic*.

An example of an event published to **Kafka** in *CloudEvent* format is as follows:


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
The *oe-kafka* module can be configured via the `server/config.json` file. 
The following example shows the minimum parameters required in this file:


**server/config.json** 
<pre>
       ...
       ...
       ...
       
       "kafka": {
       
            "clientOpts": {
            
                "kafkaHost" : "kafka:9092",
                "connectTimeout" : 10000,
                "requestTimeout" : 30000,
                "autoConnect" : true,
                "connectRetryOptions" :   {                // options of 'retry' npm module (https://www.npmjs.com/package/retry)
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
            
            "producerOpts": {
            
                "requireAcks": 1,
                "ackTimeoutMs": 100,
                "partitionerType": 2
            },
            
            "topicPrefix": "oe-demo-app"
           
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


## Custom suffix
By default, the *topic* suffix is automatically set to the model name. Thus, for a model named **Contact**, the topic is calculated as `<options.topicPrefix>.<Model Name>`
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







