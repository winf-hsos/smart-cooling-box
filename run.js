var dm = require('tinkerforge-device-manager');
var tts = require('./lib/GoogleTextToSpeechConnector.js');
var chalk = require('chalk');

/* A connector to PubNub to notify our dashboard */
var { SmartCoolingBoxPubNubWrapper } = require('./lib/SmartCoolingBoxPubNubWrapper.js');
var pubnub = new SmartCoolingBoxPubNubWrapper('<pubkey>', '<subkey>');

dm.initialize();

Promise.all([
    pubnub.initialize(),
    dm.getDeviceByIdentifier(250), // Accelerometer
    dm.getDeviceByIdentifier(282), // RGB Button
    dm.getDeviceByIdentifier(263), // OLED Display
    dm.getDeviceByIdentifier(259), // Ambient Light 2.0
    dm.getDeviceByIdentifier(283), // Humidity V2
    dm.getDeviceByIdentifier(286), // NFC
    dm.getDeviceByIdentifier(271)  // RGL LED
]).then(start).catch(handleError);

/* The global variables for all the devices */
var temperatureHumiditySensor, accelerometer, lightSensor, rgbButton, rgbLight, nfcReader, oledDisplay;

/* The ID of this box, set accordingly */
var boxId = 5;

/* We keep track of what items are in the box with a Map */
var items = new Map();

function start(devices) {
    assignDevicesToVariables(devices);

    console.log("Smart cooling box started...");

    tts.say("smart cooling box started");

    /* Setup listeners for sensors and button */
    temperatureHumiditySensor.registerListener(temperatureHumidityChanged);
    accelerometer.registerListener(accelerationChanged);
    lightSensor.registerListener(lightChanged);
    rgbButton.registerListener(buttonChanged);

    nfcReader.scan(productScanned, handleError);

    /* Clear display and initialize */
    oledDisplay.clearDisplay();
    oledDisplay.write(0, 0, "Smart Cooling Box V1.0");

    /* Set display to green initially */
    rgbLight.setColor(0, 255, 0);

    /* Set button off initially */
    rgbButton.off();
}

/* Variables we need for the temperature events */
var temperatureExceededMode = false;
var timeOfTemperatureThresholdExceeded = -1;
var timeSinceTemperatureThresholdExceeded = -1;

function temperatureHumidityChanged(valueObject) {

    /* Take only temperature into account for now */
    if (valueObject.value.type == "temperature") {

        var threshold = 700;
        var temperature = valueObject.value.value;

        //console.log("Temperature: " + temperature);

        if (temperature > threshold && items.size > 0) {

            // Memorize time of exceeding
            if (timeOfTemperatureThresholdExceeded == -1)
                timeOfTemperatureThresholdExceeded = new Date().getTime();

            timeSinceTemperatureThresholdExceeded = new Date().getTime() - timeOfTemperatureThresholdExceeded;

            if (temperatureExceededMode == false && timeSinceTemperatureThresholdExceeded >= 10000) {

                rgbLight.setColor(255, 0, 0);
                oledDisplay.write(4, 0, "Temperature too high!");
                tts.say("watch it! temperature was too high for the last 10 seconds");
                console.log(chalk.red("Temperature too high for at least 10 seconds"));
                pubnub.notifyTemperatureExceeded(boxId, temperature);
                temperatureExceededMode = true;
            }
        }
        else if (temperatureExceededMode == true) {

            console.log(chalk.green("Temperature OK again (or no items in box)."));

            /* Reset variables */
            timeOfTemperatureThresholdExceeded = -1;
            rgbLight.setColor(0, 255, 0);
            temperatureExceededMode = false;
            oledDisplay.clearLine(4);
            pubnub.notifyTemperatureNormal(boxId, temperature);
        }
    }
}

/* Variables we need for the concussion event */
var concussionMode = false;

function accelerationChanged(valueObject) {

    var thresholdInG = 2000;
    var accelerationInG = Math.max(Math.abs(valueObject.value.x), Math.abs(valueObject.value.y), Math.abs(valueObject.value.z));

    if (accelerationInG > thresholdInG && items.size > 0) {
        console.log(chalk.red("Concussion detected above threshold: " + (accelerationInG / 1000).toFixed(2) + " G. Please check items and press button!"));

        if (concussionMode == false) {
            rgbButton.off();
            rgbButton.blink(255, 0, 0);
            pubnub.notifyConcussionDetected(boxId, accelerationInG);
            concussionMode = true;
        }

        oledDisplay.write(6, 0, "Concussion: " + (accelerationInG / 1000).toFixed(2) + "G");
    }

}

/* Variables we need for the light events */
var lightExceededMode = false;
var timeOfLightThresholdExceeded = -1;
var timeSinceLightThresholdExceeded = -1;

function lightChanged(valueObject) {
    var thresholdLux = 10000;
    var lightchange = valueObject.value;

    //Reset LED & Clear display

    if (lightchange > thresholdLux && items.size > 0) {

        // Memorize time of exceeding
        if (timeOfLightThresholdExceeded == -1)
            timeOfLightThresholdExceeded = new Date().getTime();

        timeSinceLightThresholdExceeded = new Date().getTime() - timeOfLightThresholdExceeded;

        if (lightExceededMode == false && timeSinceLightThresholdExceeded >= 20000) {
            rgbLight.setColor(255, 0, 0);
            oledDisplay.write(5, 0, "Too much light!");
            console.log(chalk.red("Too much light for at least 20 seconds!"));
            tts.say("Ahhhhh! This is too much light for our precious products!");
            pubnub.notifyLightExceeded(boxId, lightchange);
            lightExceededMode = true;
        }

    }
    else if (lightExceededMode) {
        console.log(chalk.green("Light OK again (or no items in box)."));
        timeOfLightThresholdExceeded = -1;
        rgbLight.setColor(0, 255, 0);
        lightExceededMode = false;
        oledDisplay.clearLine(5);
        pubnub.notifyLightNormal(boxId, lightchange);
    }

}

function buttonChanged(valueObject) {

    /* Button was pressed */
    if (valueObject.value == "RELEASED") {
        concussionMode = false;
        rgbButton.off();
        oledDisplay.clearLine(6);
        console.log(chalk.green("Confirmed that items are OK after concussion!"));
    }
}


function productScanned(valueObject) {

    // Get the information about the scanned item
    var productColor = valueObject.type;
    var productId = valueObject.id;

    /* Check if this item is in the map */
    if (items.has(productId)) {

        console.log("Item " + productId + " is already in the box, removing it.")

        /* TAKEOUT */
        // Remove item from box
        items.delete(productId);

        // Update counter on display
        var numItems = items.size;
        oledDisplay.clearLine(3);
        oledDisplay.write(3, 0, "Number items in box: " + numItems);

        // Notify cloud dashboard
        pubnub.notifyItemRemoved(boxId, productId, items.values());

    }
    else {
        items.set(productId, { id: productId, type: productColor });

        // Update display
        var numItems = items.size;
        pubnub.notifyItemAdded(boxId, productId, items.values());
        oledDisplay.write(3, 0, "Number items in box: " + numItems);

        console.log("Item " + productId + " was put in the box.")
    }

    setTimeout(() => {
        nfcReader.scan(productScanned, handleError);
    }, 3000)

    // Write the ID to the display
    var colorText = productColor == 1 ? "GREEN" : productColor == 2 ? "BLUE" : "RED";
    oledDisplay.write(2, 0, "Scanned item: " + productId + " (" + colorText + ")  ");

}

/* Helper function to assign the devices to the global
 * variables, based on the device identifier */
function assignDevicesToVariables(devices) {
    devices.forEach((d) => {

        if (typeof d !== "undefined") {

            var id = d.getDeviceIdentifier();
            switch (id) {
                case 250:
                    accelerometer = d;
                    break;
                case 271:
                    rgbLight = d;
                    break;
                case 263:
                    oledDisplay = d;
                    break;
                case 259:
                    lightSensor = d;
                    break;
                case 282:
                    rgbButton = d;
                    break;
                case 283:
                    temperatureHumiditySensor = d;
                    break;
                case 286:
                    nfcReader = d;
                    break;
            }
        }

    });
}

function handleError(err) {
    console.error(err);
}