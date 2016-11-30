var ping = require('ping');
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-ping", "Ping", PingPlatform, true);
}

function PingPlatform(log, config, api) {
  this.log = log;
  this.config = config || {"platform": "Ping"};
  this.people = this.config.people || [];
  this.anyone = this.config.anyoneSensor === true;
  this.noOne = this.config.anyoneSensor === true;

  this.accessories = {};
  this.tout = {};

  if (api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }
}

// Method to restore accessories from cache
PingPlatform.prototype.configureAccessory = function (accessory) {
  this.setService(accessory);
  this.accessories[accessory.context.name] = accessory;
}

// Method to setup accesories from config.json
PingPlatform.prototype.didFinishLaunching = function () {
  // Add Anyone and No One accessories if enabled
  if (this.anyone) this.people.push({"name": "Anyone"});
  if (this.noOne) this.people.push({"name": "No One"});

  // Add or update accessories defined in config.json
  for (var i in this.people) this.addAccessory(this.people[i]);

  // Remove extra accessories in cache
  for (var name in this.accessories) {
    var accessory = this.accessories[name];
    if (!accessory.reachable) this.removeAccessory(accessory);
  }
}

// Method to add and update HomeKit accessories
PingPlatform.prototype.addAccessory = function (person) {
  // Confirm variable type
  person.interval = parseInt(person.interval, 10) || 1;
  person.threshold = parseInt(person.threshold, 10) || 15;
  if (person.manufacturer) person.manufacturer = person.manufacturer.toString();
  if (person.model) person.model = person.model.toString();
  if (person.serial) person.serial = person.serial.toString();

  // Retrieve accessory from cache
  var accessory = this.accessories[person.name];
  
  if (!accessory) {
    // Setup accessory as SENSOR (10) category.
    var uuid = UUIDGen.generate(person.name);
    var accessory = new Accessory(person.name, uuid, 10);

    // Setup HomeKit occupancy sensor service
    accessory.addService(Service.OccupancySensor, person.name);

    // New accessory is always reachable
    accessory.reachable = true;

    // Setup listeners for different switch events
    this.setService(accessory);

    // Register new accessory in HomeKit
    this.api.registerPlatformAccessories("homebridge-ping", "Ping", [accessory]);
  }

  // Accessory is reachable if it's found in config.json
  accessory.updateReachability(true);

  // Store and initialize variables into context
  var cache = accessory.context;
  cache.name = person.name;
  cache.target = person.target;
  cache.interval = person.interval;
  cache.threshold = person.threshold;
  cache.manufacturer = person.manufacturer;
  cache.model = person.model;
  cache.serial = person.serial;
  if (cache.state === undefined) {
    cache.lastSeen = Date.now() - (person.threshold * 60000);
    cache.state = false;
  }

  // Retrieve initial state
  this.getInitState(accessory);

  // Store accessory in cache
  this.accessories[person.name] = accessory;

  // Configure state polling
  if (person.name !== "Anyone" && person.name !== "No One") this.statePolling(person.name);
}

// Method to remove accessories from HomeKit
PingPlatform.prototype.removeAccessory = function (accessory) {
  if (accessory) {
    var name = accessory.context.name;
    this.log(name + " is removed from HomeBridge.");
    this.api.unregisterPlatformAccessories("homebridge-ping", "Ping", [accessory]);
    delete this.accessories[name];
  }
}

// Method to setup listeners for different events
PingPlatform.prototype.setService = function (accessory) {
  accessory.getService(Service.OccupancySensor)
    .getCharacteristic(Characteristic.OccupancyDetected)
    .on('get', this.getOccupancyState.bind(this, accessory.context));

  accessory.on('identify', this.identify.bind(this, accessory.context));
}

// Method to retrieve initial state
PingPlatform.prototype.getInitState = function (accessory) {
  var manufacturer = accessory.context.manufacturer || "Default-Manufacturer";
  var model = accessory.context.model || "Default-Model";
  var serial = accessory.context.serial || "Default-SerialNumber";

  // Update HomeKit accessory information
  accessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, manufacturer)
    .setCharacteristic(Characteristic.Model, model)
    .setCharacteristic(Characteristic.SerialNumber, serial);
}

// Method for state polling
PingPlatform.prototype.statePolling = function (name) {
  var self = this;
  var accessory = this.accessories[name];
  var thisPerson = accessory.context;

  // Clear polling
  clearTimeout(this.tout[name]);

  ping.sys.probe(thisPerson.target, function(connected){
    // Update the last seen time if persion is present
    if (connected) thisPerson.lastSeen = Date.now();

    // Compute sensor state
    var activeThreshold = Date.now() - (thisPerson.threshold * 60000);
    var state = (thisPerson.lastSeen - activeThreshold) > 0;
    var anyoneState = self.getAnyoneState();

    // Detect for state changes
    if (state !== thisPerson.state) self.log(thisPerson.name + (state ? " arrived." : " left."));

    // Update state for HomeKit accessories
    self.updateSensorState(thisPerson.name, state);
    if (self.anyone) self.updateSensorState("Anyone", anyoneState);
    if (self.noOne) self.updateSensorState("No One", !anyoneState);
  });

  // Setup for next polling
  this.tout[name] = setTimeout(this.statePolling.bind(this, name), thisPerson.interval * 1000);
}

// Method to compute Anyone sensor state
PingPlatform.prototype.getAnyoneState = function () {
  for (var i in this.people) {
    var name = this.people[i].name;
    var thisPerson = this.accessories[name].context;
    if (thisPerson.state) return true;
  }
  return false;
}

// Method to update HomeKit accessory state
PingPlatform.prototype.updateSensorState = function (name, state) {
  var accessory = this.accessories[name];
  var cache = accessory.context;

  // Detect for state changes
  if (state !== cache.state) {
    cache.state = state;
    accessory.getService(Service.OccupancySensor)
      .getCharacteristic(Characteristic.OccupancyDetected)
      .setValue(state);
  }
}

// Method to check current state
PingPlatform.prototype.getOccupancyState = function (thisPerson, callback) {
  // Get state directly from cache
  if (thisPerson.name !== "Anyone" && thisPerson.name !== "No One") {
    this.log(thisPerson.name + " is " + (thisPerson.state ? "present." : "absent."));
  }
  callback(null, thisPerson.state);
}

// Method to handle identify request
PingPlatform.prototype.identify = function (thisPerson, paired, callback) {
  this.log(thisPerson.name + " identify requested!");
  callback();
}

// Method to handle plugin configuration in HomeKit app
PingPlatform.prototype.configurationRequestHandler = function (context, request, callback) {
  if (request && request.type === "Terminate") return;

  // Instruction
  if (!context.step) {
    var instructionResp = {
      "type": "Interface",
      "interface": "instruction",
      "title": "Before You Start...",
      "detail": "Please make sure homebridge is running with elevated privileges.",
      "showNextButton": true
    }

    context.step = 1;
    callback(instructionResp);
  } else {
    switch (context.step) {
      case 1:
        // Operation choices
        var respDict = {
          "type": "Interface",
          "interface": "list",
          "title": "What do you want to do?",
          "items": [
            "Add New Person",
            "Modify Existing Person",
            "Remove Existing Person",
            "Configure Anyone Sensor",
            "Configure No One Sensor"
          ]
        }

        context.step = 2;
        callback(respDict);
        break;
      case 2:
        var selection = request.response.selections[0];
        if (selection === 0) {
          // Name for new accessory
          var respDict = {
            "type": "Interface",
            "interface": "input",
            "title": "New Person",
            "items": [{
              "id": "name",
              "title": "Name (Required)",
              "placeholder": "Peter"
            }]
          };

          context.operation = 0;
          context.step = 3;
        } else if (selection === 1 || selection === 2) {
          // Create list of names
          var names = Object.keys(this.accessories);

          // Remove Anyone and No One from the list
          if (this.anyone) names.splice(names.indexOf("Anyone"), 1);
          if (this.noOne) names.splice(names.indexOf("No One"), 1);

          if (names.length > 0) {
            // Select existing accessory for modification or removal
            if (selection === 1) {
              var title = "Witch person do you want to modify?";
              context.operation = 1;
              context.step = 3;
            } else {
              var title = "Witch person do you want to remove?";
              context.step = 6;
            }

            var respDict = {
              "type": "Interface",
              "interface": "list",
              "title": title,
              "items": names
            };

            context.list = names;
          } else {
            // Error if no person is configured
            var respDict = {
              "type": "Interface",
              "interface": "instruction",
              "title": "Unavailable",
              "detail": "No person is configured.",
              "showNextButton": true
            };

            context.step = 1;
          }
        } else {
          // Configure Anyone or No One sensor
          if (selection === 3) {
            var title = "Anyone Sensor";
            context.sensor = 1;
          } else {
            var title = "No One Sensor";
            context.sensor = 0;
          }
          var respDict = {
            "type": "Interface",
            "interface": "list",
            "title": title,
            "allowMultipleSelection": false,
            "items": [
              "Disable",
              "Enable"
            ]
          };

          context.step = 4;
        }

        callback(respDict); 
        break;
      case 3:
        if (context.operation === 0) {
          var person = request.response.inputs;
        } else if (context.operation === 1) {
          var selection = context.list[request.response.selections[0]];
          var person = this.accessories[selection].context;
        }

        if (person.name) {
          // Add or Modify info of selected accessory
          var respDict = {
            "type": "Interface",
            "interface": "input",
            "title": person.name,
            "items": [{
              "id": "target",
              "title": "Hostname/IP",
              "placeholder": context.operation ? "Leave blank if unchanged" : "192.168.1.2"
            }, {
              "id": "interval",
              "title": "Polling Interval",
              "placeholder": context.operation ? "Leave blank if unchanged" : "1"
            }, {
              "id": "threshold",
              "title": "Active Threshold",
              "placeholder": context.operation ? "Leave blank if unchanged" : "15"
            }, {
              "id": "manufacturer",
              "title": "Manufacturer",
              "placeholder": context.operation ? "Leave blank if unchanged" : "Default-Manufacturer"
            }, {
              "id": "model",
              "title": "Model",
              "placeholder": context.operation ? "Leave blank if unchanged" : "Default-Model"
            }, {
              "id": "serial",
              "title": "Serial",
              "placeholder": context.operation ? "Leave blank if unchanged" : "Default-SerialNumber"
            }]
          };

          context.name = person.name;
          context.step = 5;
        } else {
          // Error if required info is missing
          var respDict = {
            "type": "Interface",
            "interface": "instruction",
            "title": "Error",
            "detail": "Name of the person is missing.",
            "showNextButton": true
          };

          context.step = 1;
        }

        delete context.list;
        delete context.operation;
        callback(respDict);
        break;
      case 4:
        var selection = request.response.selections[0] === 1;
        var newPerson = {};

        if (context.sensor) {
          this.anyone = selection;
          newPerson.name = "Anyone";
        } else {
          this.noOne = selection;
          newPerson.name = "No One";
        }

        // Add or remove Anyone and No One HomeKit accessory
        if (selection) {          
          this.addAccessory(newPerson);
        } else {
          var accessory = this.accessories[newPerson.name];
          this.removeAccessory(accessory);
        }

        var respDict = {
          "type": "Interface",
          "interface": "instruction",
          "title": "Success",
          "detail": "The sensor is now updated.",
          "showNextButton": true
        };

        delete context.sensor;
        context.step = 7;
        callback(respDict);
        break;
      case 5:
        var userInputs = request.response.inputs;
        var newPerson = {};

        // Clone context if person exists
        if (this.accessories[context.name]) {
          newPerson = JSON.parse(JSON.stringify(this.accessories[context.name].context));
        }

        // Setup input for addAccessory
        newPerson.name = context.name;
        newPerson.target = userInputs.target || newPerson.target;
        newPerson.interval = userInputs.interval || newPerson.interval;
        newPerson.threshold = userInputs.threshold || newPerson.threshold;
        newPerson.manufacturer = userInputs.manufacturer;
        newPerson.model = userInputs.model;
        newPerson.serial = userInputs.serial;

        // Register or update HomeKit accessory
        this.addAccessory(newPerson);
        var respDict = {
          "type": "Interface",
          "interface": "instruction",
          "title": "Success",
          "detail": "The new person is now updated.",
          "showNextButton": true
        };

        context.step = 7;
        callback(respDict);
        break;
      case 6:
        // Remove selected HomeKit accessory
        var selection = context.list[request.response.selections[0]];
        var accessory = this.accessories[selection];

        this.removeAccessory(accessory);
        var respDict = {
          "type": "Interface",
          "interface": "instruction",
          "title": "Success",
          "detail": "The person is now removed.",
          "showNextButton": true
        };

        delete context.list;
        context.step = 7;
        callback(respDict);
        break;
      case 7:
        // Update config.json accordingly
        var self = this;
        delete context.step;
        var newConfig = this.config;
        newConfig.anyoneSensor = this.anyone;
        newConfig.noOneSensor = this.noOne;

        // Create list of names
        var names = Object.keys(this.accessories);

        // Remove Anyone and No One from the list
        if (this.anyone) names.splice(names.indexOf("Anyone"), 1);
        if (this.noOne) names.splice(names.indexOf("No One"), 1);

        // Create config for each person
        var newPeople = names.map(function (k) {
          var accessory = self.accessories[k];
          var person = {
            'name': accessory.context.name,
            'target': accessory.context.target,
            'interval': accessory.context.interval,
            'threshold': accessory.context.threshold,
            'manufacturer': accessory.context.manufacturer,
            'model': accessory.context.model,
            'serial': accessory.context.serial
          };
          return person;
        });

        newConfig.people = newPeople;
        callback(null, "platform", true, newConfig);
        break;
    }
  }
}
