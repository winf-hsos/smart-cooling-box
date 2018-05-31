var ml = require('azure-ml-webservice');

var hostname = "ussouthcentral.services.azureml.net";
var path = "/workspaces/d6591b016ab34582b55ef6d3fea46aed/services/344aa68ea870446cb035f62b4ac0c549/execute?api-version=2.0&details=true"
ml.setHostAndPath(hostname, path);

exports.setAPIKey = function (apiKey) {
    ml.setAPIKey(apiKey);
}

exports.predict = function (item_type, temperature, light, concussion, callback) {
    var data = {
        "input1": {
            "ColumnNames": ["item_type", "temperature_celsius", "light_in_lux", "concussion_in_g", "outcome"],
            "Values": [[item_type, temperature, light, concussion, ""]]
        }
    }

    ml.predict(data).then((prediction) => {

        var result = {};

        result.probabilityBad = prediction.Values[0][5];
        result.probabilityCompromised = prediction.Values[0][6];
        result.probabilityOk = prediction.Values[0][7];
        result.predictedLabel = prediction.Values[0][8];
        callback(result);
    });
}
