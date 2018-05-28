const textToSpeech = require('@google-cloud/text-to-speech');
var fs = require('fs');
var player = require('play-sound')(opts = {});
var speeches = require('./stored-speeches.json');

var client = new textToSpeech.v1beta1.TextToSpeechClient({
    // optional auth parameters.
});

var voice = {
    languageCode: "en-US",
    name: "en-US-Wavenet-C"
};

var audioConfig = {
    "audioEncoding": "MP3",
    "pitch": 0.00,
    "speakingRate": 1.00
};

var say = function (textToSay) {

    var file = checkIfStored(textToSay);

    if (typeof file !== "undefined") {
        playFile(file);
        return;
    }

    var input = { text: textToSay };

    var request = {
        input: input,
        voice: voice,
        audioConfig: audioConfig,
    };

    client.synthesizeSpeech(request)
        .then(responses => {
            var response = responses[0];

            fs.writeFile("./lib/mp3/tmp.mp3", response.audioContent, function (err) {
                if (err) {
                    return console.log(err);
                }

                playFile('tmp.mp3');
            });

        })
        .catch(err => {
            console.error(err);
        });
}

function playFile(file) {
    player.play('./lib/mp3/' + file, { mplayer: ['-ao', 'sdl'] }, function (err) {
        if (err) throw err
    })
}

function checkIfStored(textToSay) {

    var file;

    var speech = speeches.speeches.some((s) => {
        if (s.text == textToSay) {
            console.log("Found speech!");
            file = s.file;
            return true;
        }
    });
    return file;
   
}

exports.say = say;
