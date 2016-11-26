# homebridge-ping
Ping Plugin for [HomeBridge](https://github.com/nfarina/homebridge) (API 2.0)

# Installation
1. Install homebridge using `npm install -g homebridge`.
2. Install this plugin using `npm install -g git+https://github.com/luisiam/homebridge-ping.git`.
3. Update your configuration file. See configuration sample below.

# Configuration
Edit your `config.json` accordingly. Configuration sample:
 ```
"platforms": [{
    "platform": "Ping"
}]
```

### Advanced Configuration (Optional)
This step is not required. HomeBridge with API 2.0 can handle configurations in the HomeKit app.
 ```
"platforms": [{
    "platform": "Ping",
    "name": "Ping",
    "people": [{
        "name" : "Peter",
        "target": "192.168.1.2"
    }, {
        "name" : "Mary",
        "target": "192.168.1.3",
        "interval": 1,
        "threshold": 15,
        "manufacturer": "Apple Inc",
        "model": "iPhone 7",
        "serial": "XXXXXXXXXXXX"
    }]
}]
```


| Fields           | Description                                           | Required |
|------------------|-------------------------------------------------------|----------|
| platform         | Must always be `cmdSwitch2`.                          | Yes      |
| name             | For logging purposes.                                 | No       |
| people           | Array of person config (multiple persons supported).  | Yes      |
| \|- name\*       | The name of the person.                               | Yes      |
| \|- target       | Hostname or IP address of his/her device.             | No       |
| \|- interval     | Polling interval in `s` (Default 1s).                 | No       |
| \|- threshold    | Active threshold in `m` (Default 15m).                | No       |
| \|- manufacturer | Manufacturer of his/her device.                       | No       |
| \|- model        | Model of his/her device.                              | No       |
| \|- serial       | Serial number of his/her device.                      | No       |
\*Changing the person `name` in `config.json` will create a new sensor instead of renaming the existing one in HomeKit. It's strongly recommended that you change the name using a HomeKit app only.
