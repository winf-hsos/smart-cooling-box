var PubNub = require('pubnub');

class PubNubConnector {

    constructor(publishKey, subscribeKey) {

        this.pubnub = new PubNub({
            publishKey: publishKey,
            subscribeKey: subscribeKey
        });
        this.subscribedChannels = [];

        this.subscribe("default");
    }

    /* Initialize the PubNub service 
     * Replace publishKey and subscribeKey with 
     * your own set of keys. */
    initialize() {
        return new Promise((resolve, reject) => {
            this.pubnub.addListener({
                status: function (statusEvent) {
                    if (statusEvent.category === "PNConnectedCategory") {
                        resolve();
                    }
                },
                message: this._handleMessage.bind(this)
            })
        });

    }

    _handleMessage(message) {

        var channel = message.channel;

        // Get listener for channel
        var listeners = this.subscribedChannels.filter((val) => { return val.channel == channel });

        listeners.forEach((listener) => {
            listener.callback(message);
        })

    }

    subscribe(channel, callback) {
        var listener = { channel: channel, callback: callback };

        this.subscribedChannels.push(listener);

        this.pubnub.subscribe({
            channels: this.subscribedChannels.map((val) => { return val.channel; })
        });
    }

    publish(message, channel, callback = null) {

        var publishConfig = {
            channel: channel,
            message: message
        }

        this.pubnub.publish(publishConfig, callback);

    }

}

exports.PubNubConnector = PubNubConnector;